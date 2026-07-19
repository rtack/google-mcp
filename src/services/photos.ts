import type { Auth } from "googleapis";

const PHOTOS_API_BASE = "https://photoslibrary.googleapis.com/v1";

export interface PhotosUploadResult {
  mediaItemId?: string;
  productUrl?: string;
  status?: string;
}

interface BatchCreateResponse {
  newMediaItemResults?: Array<{
    uploadToken?: string;
    status?: { message?: string };
    mediaItem?: { id?: string; productUrl?: string };
  }>;
}

export class PhotosService {
  private readonly authClient: Auth.OAuth2Client;

  constructor(authClient: Auth.OAuth2Client) {
    this.authClient = authClient;
  }

  // getRequestHeaders() auto-refreshes an expiring token, but a refresh here
  // isn't persisted back to tokens.json (no listener is wired up for that
  // anywhere in this repo) - a pre-existing gap, not new.
  private async authHeaders(extra: Record<string, string>): Promise<Record<string, string>> {
    const headers = await this.authClient.getRequestHeaders();
    return { ...headers, ...extra };
  }

  // Photos Library API uploads happen in two steps: send the raw bytes to
  // get an opaque upload token, then reference that token when creating the
  // actual media item.
  private async uploadBytes(content: Buffer, filename: string, mimeType: string): Promise<string> {
    const response = await fetch(`${PHOTOS_API_BASE}/uploads`, {
      method: "POST",
      headers: await this.authHeaders({
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Content-Type": mimeType,
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-File-Name": filename,
      }),
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Photos upload failed: ${response.status} ${await response.text()}`);
    }

    return response.text();
  }

  public async uploadMediaItem(
    content: string,
    filename: string,
    mimeType: string,
    albumId?: string,
    description?: string
  ): Promise<PhotosUploadResult> {
    const buffer = Buffer.from(content, "base64");
    const uploadToken = await this.uploadBytes(buffer, filename, mimeType);

    const response = await fetch(`${PHOTOS_API_BASE}/mediaItems:batchCreate`, {
      method: "POST",
      headers: await this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        albumId,
        newMediaItems: [
          {
            description,
            simpleMediaItem: { fileName: filename, uploadToken },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Photos mediaItems.batchCreate failed: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as BatchCreateResponse;
    const result = data.newMediaItemResults?.[0];

    return {
      mediaItemId: result?.mediaItem?.id,
      productUrl: result?.mediaItem?.productUrl,
      status: result?.status?.message,
    };
  }
}
