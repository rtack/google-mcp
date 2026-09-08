import type { Auth } from "googleapis";
import { resolveFileSource } from "./attachments.js";

const PHOTOS_API_BASE = "https://photoslibrary.googleapis.com/v1";

export interface PhotosUploadOptions {
  /** Base64-encoded bytes. Mutually exclusive with `filePath`. */
  content?: string;
  /** Local file to read, resolved inside the sandbox root (see attachments.ts). */
  filePath?: string;
  /** Required with `content`; defaults to the file's basename with `filePath`. */
  filename?: string;
  mimeType: string;
  description?: string;
}

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
    // google-auth-library v10 returns a WHATWG Headers instance here, not a
    // plain object — spreading it directly pulls in its methods instead of
    // its entries, so convert explicitly first.
    const headers = await this.authClient.getRequestHeaders();
    return { ...Object.fromEntries(headers.entries()), ...extra };
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

  public async uploadMediaItem(options: PhotosUploadOptions): Promise<PhotosUploadResult> {
    const { mimeType, description } = options;

    // Unlike resolveFileSource's own "attachment" fallback, a real filename
    // matters here since it's what shows up as the item's name in Photos.
    if (options.content && !options.filename) {
      throw new Error("filename is required when uploading via content");
    }

    const { data: buffer, filename } = await resolveFileSource(
      { content: options.content, path: options.filePath, filename: options.filename },
      "base64",
      "photos upload"
    );

    const uploadToken = await this.uploadBytes(buffer, filename, mimeType);

    const response = await fetch(`${PHOTOS_API_BASE}/mediaItems:batchCreate`, {
      method: "POST",
      headers: await this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
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
