import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

vi.mock("fs");

import { loadPresets, resolvePreset, getPresetsPath } from "../services/calendar-presets.js";

describe("calendar-presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadPresets", () => {
    it("should throw a descriptive error when the file is missing", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadPresets()).toThrow(getPresetsPath());
    });

    it("should throw when the file contains invalid JSON", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("not json");

      expect(() => loadPresets()).toThrow(/Failed to parse/);
    });

    it("should throw when the top-level shape is not an object", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(["work", "all"]));

      expect(() => loadPresets()).toThrow(/must be a JSON object/);
    });

    it("should throw when a preset's value is not an array of strings", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ work: "not-an-array" }));

      expect(() => loadPresets()).toThrow(/"work".*array of calendar ID strings/);
    });

    it("should parse a valid presets file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ work: ["id1", "id2"], all: ["id1", "id2", "id3"] })
      );

      const result = loadPresets();

      expect(result).toEqual({ work: ["id1", "id2"], all: ["id1", "id2", "id3"] });
    });
  });

  describe("resolvePreset", () => {
    it("should return the calendar IDs for a defined preset", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ work: ["id1", "id2"] }));

      expect(resolvePreset("work")).toEqual(["id1", "id2"]);
    });

    it("should throw, listing available presets, when the name isn't defined", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ work: ["id1"], all: ["id1", "id2"] }));

      expect(() => resolvePreset("missing")).toThrow(/work, all/);
    });

    it("should say no presets are defined when the file is empty", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      expect(() => resolvePreset("missing")).toThrow(/none defined/);
    });
  });
});
