import {
  describe,
  expect,
  it,
} from "vitest";
import crypto from "node:crypto";

import {
  migrationChecksum,
  parseMigrationFileName,
} from "../src/database/migrations.js";

describe("database migrations", () => {
  it("parses a valid migration filename", () => {
    expect(
      parseMigrationFileName(
        "0001_migration_foundation.sql",
      ),
    ).toEqual({
      version: 1,
      name: "migration_foundation",
    });
  });

  it("rejects an invalid migration filename", () => {
    expect(() =>
      parseMigrationFileName(
        "migration.sql",
      ),
    ).toThrow(
      "Invalid migration filename",
    );
  });

  it("creates a SHA-256 migration checksum", () => {
    const content =
      "SELECT 1;";

    const expected =
      crypto
        .createHash("sha256")
        .update(content, "utf8")
        .digest("hex");

    expect(
      migrationChecksum(content),
    ).toBe(expected);

    expect(expected).toHaveLength(64);
  });
});

