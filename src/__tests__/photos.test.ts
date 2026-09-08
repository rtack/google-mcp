import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Auth } from "googleapis";
import { PhotosService } from "../services/photos.js";

describe("PhotosService", () => {
  let service: PhotosService;
  const mockGetRequestHeaders = vi.fn();
  const mockAuth = {
    getRequestHeaders: mockGetRequestHeaders,
  } as unknown as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PhotosService(mockAuth);
    // google-auth-library v10's real getRequestHeaders() returns a WHATWG
    // Headers instance, not a plain object — mirror that here.
    mockGetRequestHeaders.mockResolvedValue(new Headers({ Authorization: "Bearer test-token" }));
    vi.stubGlobal("fetch", vi.fn());
  });

  function mockUploadAndCreateSucceed(): void {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("upload-token-123"),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            newMediaItemResults: [
              {
                uploadToken: "upload-token-123",
                status: { message: "Success" },
                mediaItem: { id: "media123", productUrl: "https://photos.google.com/media123" },
              },
            ],
          }),
      } as Response);
  }

  describe("uploadMediaItem", () => {
    it("should upload bytes then create the media item, returning the result", async () => {
      mockUploadAndCreateSucceed();
      const mockFetch = vi.mocked(fetch);

      const result = await service.uploadMediaItem({
        content: Buffer.from("fake image bytes").toString("base64"),
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        description: "A test photo",
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [uploadUrl, uploadInit] = mockFetch.mock.calls[0];
      expect(uploadUrl).toBe("https://photoslibrary.googleapis.com/v1/uploads");
      expect(uploadInit).toMatchObject({
        method: "POST",
        // WHATWG Headers lowercases names it stores — harmless for a real
        // fetch() call (HTTP headers are case-insensitive) but the merged
        // plain object reflects it, so match lowercase here.
        headers: expect.objectContaining({
          authorization: "Bearer test-token",
          "Content-Type": "application/octet-stream",
          "X-Goog-Upload-Content-Type": "image/jpeg",
          "X-Goog-Upload-Protocol": "raw",
          "X-Goog-Upload-File-Name": "photo.jpg",
        }),
      });
      expect(Buffer.isBuffer(uploadInit?.body)).toBe(true);
      expect((uploadInit?.body as Buffer).toString()).toBe("fake image bytes");

      const [createUrl, createInit] = mockFetch.mock.calls[1];
      expect(createUrl).toBe("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate");
      const createBody = JSON.parse(createInit?.body as string);
      expect(createBody).toEqual({
        newMediaItems: [
          {
            description: "A test photo",
            simpleMediaItem: { fileName: "photo.jpg", uploadToken: "upload-token-123" },
          },
        ],
      });

      expect(result).toEqual({
        mediaItemId: "media123",
        productUrl: "https://photos.google.com/media123",
        status: "Success",
      });
    });

    it("should throw when using content without a filename", async () => {
      await expect(
        service.uploadMediaItem({ content: "ZmFrZQ==", mimeType: "image/jpeg" })
      ).rejects.toThrow("filename is required when uploading via content");

      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it("should throw when neither content nor filePath is provided", async () => {
      await expect(service.uploadMediaItem({ mimeType: "image/jpeg" })).rejects.toThrow();
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it("should throw when the upload-bytes step fails", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("insufficient permissions"),
      } as Response);

      await expect(
        service.uploadMediaItem({ content: "ZmFrZQ==", filename: "photo.jpg", mimeType: "image/jpeg" })
      ).rejects.toThrow("Photos upload failed: 403 insufficient permissions");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw when the batchCreate step fails", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("upload-token-123"),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve("bad request"),
        } as Response);

      await expect(
        service.uploadMediaItem({ content: "ZmFrZQ==", filename: "photo.jpg", mimeType: "image/jpeg" })
      ).rejects.toThrow("Photos mediaItems.batchCreate failed: 400 bad request");
    });

    it("should surface a per-item failure status rather than reporting success", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("upload-token-123"),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              newMediaItemResults: [
                {
                  uploadToken: "upload-token-123",
                  status: { message: "Failed to process the media item" },
                },
              ],
            }),
        } as Response);

      const result = await service.uploadMediaItem({
        content: "ZmFrZQ==",
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      });

      expect(result.status).toBe("Failed to process the media item");
      expect(result.mediaItemId).toBeUndefined();
    });
  });

  // filePath goes through resolveFileSource (see attachments.test.ts for the
  // sandbox/symlink/size-cap coverage that lives there) — these exercise the
  // integration, not the sandbox rules themselves.
  describe("uploadMediaItem with filePath", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "gmcp-photos-"));
      process.env.GOOGLE_MCP_FILE_ROOT = root;
    });

    afterEach(() => {
      delete process.env.GOOGLE_MCP_FILE_ROOT;
      rmSync(root, { recursive: true, force: true });
    });

    it("should read bytes from filePath and derive the filename from its basename", async () => {
      mockUploadAndCreateSucceed();
      const mockFetch = vi.mocked(fetch);
      writeFileSync(join(root, "scan.png"), "bytes from disk");

      const result = await service.uploadMediaItem({
        filePath: "scan.png",
        mimeType: "image/png",
      });

      const [, uploadInit] = mockFetch.mock.calls[0];
      expect((uploadInit?.headers as Record<string, string>)["X-Goog-Upload-File-Name"]).toBe(
        "scan.png"
      );
      expect((uploadInit?.body as Buffer).toString()).toBe("bytes from disk");
      expect(result.status).toBe("Success");
    });

    it("should use an explicit filename over the filePath basename when both are given", async () => {
      mockUploadAndCreateSucceed();
      const mockFetch = vi.mocked(fetch);
      writeFileSync(join(root, "original-name.png"), "bytes");

      await service.uploadMediaItem({
        filePath: "original-name.png",
        filename: "custom-name.png",
        mimeType: "image/png",
      });

      const [, uploadInit] = mockFetch.mock.calls[0];
      expect((uploadInit?.headers as Record<string, string>)["X-Goog-Upload-File-Name"]).toBe(
        "custom-name.png"
      );
    });

    it("should reject a filePath that escapes the sandbox root", async () => {
      await expect(
        service.uploadMediaItem({ filePath: "../../etc/passwd", mimeType: "image/png" })
      ).rejects.toThrow();

      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });
  });
});
