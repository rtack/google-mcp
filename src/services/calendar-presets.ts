import * as fs from "fs";
import * as path from "path";
import { getConfigDir } from "../auth/oauth.js";

/**
 * Named calendar-selection presets: preset name -> list of calendar IDs that
 * should be selected (checked) when the preset is applied. Hand-edited by
 * the user, not managed by any tool — this module only reads the file.
 */
export type CalendarPresets = Record<string, string[]>;

const PRESETS_PATH = path.join(getConfigDir(), "calendar-presets.json");

const EXAMPLE_FORMAT = `{
  "work": ["id1@group.calendar.google.com", "id2@group.calendar.google.com"],
  "all": ["id1@group.calendar.google.com", "id2@group.calendar.google.com", "..."]
}`;

export function getPresetsPath(): string {
  return PRESETS_PATH;
}

/**
 * Load and parse the presets file. Throws a descriptive error (naming the
 * expected path and format) if the file is missing or malformed, rather
 * than silently returning an empty preset set.
 */
export function loadPresets(): CalendarPresets {
  if (!fs.existsSync(PRESETS_PATH)) {
    throw new Error(
      `No calendar presets file found at ${PRESETS_PATH}. ` +
        `Create it with a JSON object mapping preset names to arrays of calendar IDs, e.g.:\n${EXAMPLE_FORMAT}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to parse calendar presets file at ${PRESETS_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Calendar presets file at ${PRESETS_PATH} must be a JSON object mapping preset names to arrays of calendar IDs, e.g.:\n${EXAMPLE_FORMAT}`
    );
  }

  for (const [name, ids] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      throw new Error(
        `Preset "${name}" in ${PRESETS_PATH} must be an array of calendar ID strings.`
      );
    }
  }

  return parsed as CalendarPresets;
}

/**
 * Resolve a single preset by name. Throws, listing the available preset
 * names, if it isn't defined.
 */
export function resolvePreset(name: string): string[] {
  const presets = loadPresets();
  const ids = presets[name];
  if (!ids) {
    const available = Object.keys(presets);
    throw new Error(
      `No preset named "${name}" in ${PRESETS_PATH}. Available presets: ${
        available.length > 0 ? available.join(", ") : "(none defined)"
      }`
    );
  }
  return ids;
}
