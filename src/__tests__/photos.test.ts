import { describe, it, expect, vi, beforeEach } from "vitest";
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
    mockGetRequestHeaders.mockResolvedValue({ Authorization: "Bearer test-token" });
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("uploadMediaItem", () => {
    it("should upload bytes then create the media item, returning the result", async () => {
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

      const result = await service.uploadMediaItem(
        Buffer.from("fake image bytes").toString("base64"),
        "photo.jpg",
        "image/jpeg",
        "album123",
        "A test photo"
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [uploadUrl, uploadInit] = mockFetch.mock.calls[0];
      expect(uploadUrl).toBe("https://photoslibrary.googleapis.com/v1/uploads");
      expect(uploadInit).toMatchObject({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
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
        albumId: "album123",
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

    it("should throw when the upload-bytes step fails", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("insufficient permissions"),
      } as Response);

      await expect(
        service.uploadMediaItem("ZmFrZQ==", "photo.jpg", "image/jpeg")
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
        service.uploadMediaItem("ZmFrZQ==", "photo.jpg", "image/jpeg")
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

      const result = await service.uploadMediaItem("ZmFrZQ==", "photo.jpg", "image/jpeg");

      expect(result.status).toBe("Failed to process the media item");
      expect(result.mediaItemId).toBeUndefined();
    });
  });
});
