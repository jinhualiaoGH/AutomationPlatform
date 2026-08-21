import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sql from "mssql";

import { environment } from "../config/environment.js";

export interface Migration {
  version: number;
  name: string;
  fileName: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAtUtc: Date;
}

const migrationFilePattern =
  /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/;

interface CertifiedLegacyMigrationCompatibility {
  historicalChecksum: string;
  currentChecksums: ReadonlySet<string>;
}

const certifiedLegacyMigrationCompatibility:
  ReadonlyMap<number, CertifiedLegacyMigrationCompatibility> =
  new Map<number, CertifiedLegacyMigrationCompatibility>([
    [
      1,
      {
        historicalChecksum:
          "80448a8097f71d2b8a609161235fade425afdb539781c85f27be4328289a955d",
        currentChecksums: new Set<string>([
          "498be287ac7e7b399aff17c236011e5fb19cd8b8e95c8d31d2e9e48a6ce9f354",
          "b17bae38be7f2e6a3306772a76f0036da785004370b7b0f806e1cbdcdbae304c",
        ]),
      },
    ],
    [
      2,
      {
        historicalChecksum:
          "e6c0477c979402fc3d91050a21cdb17af4ee2753d3e2edce560c23d017e52a28",
        currentChecksums: new Set<string>([
          "e6c0477c979402fc3d91050a21cdb17af4ee2753d3e2edce560c23d017e52a28",
          "4773f23a0cdff92846ccbdda56077719a3946100919462b1790439163a22e921",
        ]),
      },
    ],
    [
      3,
      {
        historicalChecksum:
          "970448dd7c000b445f8e62679b098f4a9f103c291aab7e0f4f729654d66ef985",
        currentChecksums: new Set<string>([
          "d2e9aaeb4d0ce0e1f84c79702467f3296c707aea6398f51cb6c40d770e55208e",
          "970448dd7c000b445f8e62679b098f4a9f103c291aab7e0f4f729654d66ef985",
        ]),
      },
    ],
    [
      4,
      {
        historicalChecksum:
          "db929ade57fe86a091b3abd00f47e0243c68096a5c7893ad89cc50fdb46b86e6",
        currentChecksums: new Set<string>([
          "5a2b0db8cca687e861d4f8fd63efba02d0a6212d27f8fdf24cddc23a364e9708",
          "aadc67960257f5e9eca7e596e414934c55c3b5a003c2597b350585d4ea485e76",
        ]),
      },
    ],
    [
      5,
      {
        historicalChecksum:
          "60b3a350aaaa07d94b704753094b8a7ed1675a11fcaab552fd99eeed07c7b5ff",
        currentChecksums: new Set<string>([
          "bcd8ba317727bc5da7e20c3700bc7330f0ac06c2c3e8aeafc4e01692e05e523a",
          "1be99741d297e07059ae70576d68710248b9d0f9d98bca0a5267f84fa8dc56da",
        ]),
      },
    ],
    [
      6,
      {
        historicalChecksum:
          "5d7ea7a1d4e557952ac5eee58e1c7c683d7a9cf3ffaa4269850546d829509a54",
        currentChecksums: new Set<string>([
          "eb4d58af2eaa89c76e3108837d92df9538fc1f92bcd338f5e35b9c15f564c0af",
          "886d51f318f76cbc4961978293c4fe15f5e096b2735403cdae5c8e55f9d821d2",
        ]),
      },
    ],
    [
      7,
      {
        historicalChecksum:
          "e6b286d5f659487aa8378f5a01ca489a07e94b0c1025916cb32ee08de597d480",
        currentChecksums: new Set<string>([
          "c46e309752c2207107a4790b440130f8818615a38a295a892217c992d8c3ee38",
          "7025690bccda2d86dc92630aff18b8ece0cb49b76ed97c4288636e316be540a5",
        ]),
      },
    ],
    [
      8,
      {
        historicalChecksum:
          "781cc7388f10d89aeb4675b7aba9f9fa06cbeff7ae77f400bfb45860e8dac945",
        currentChecksums: new Set<string>([
          "98b1026feb12d04a32b6b76149cba886c849026e816d6f46cb1dcac77ad6f3cb",
          "d05d789dbf5840a9a32d969720e16fb4f8862ae7305d3b8faaaf48dae2d6e3a0",
        ]),
      },
    ],
  ]);

export function isAcceptedAppliedMigrationChecksum(
  version: number,
  currentChecksum: string,
  storedChecksum: string,
): boolean {
  if (storedChecksum === currentChecksum) {
    return true;
  }

  const certified =
    certifiedLegacyMigrationCompatibility.get(version);

  if (!certified) {
    return false;
  }

  return (
    storedChecksum === certified.historicalChecksum &&
    certified.currentChecksums.has(currentChecksum)
  );
}
export function canonicalMigrationChecksumContent(
  content: string,
): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}
export function migrationChecksum(
  content: string,
): string {
  return crypto
    .createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
}

export function parseMigrationFileName(
  fileName: string,
): {
  version: number;
  name: string;
} {
  const match =
    migrationFilePattern.exec(fileName);

  if (
    !match ||
    match[1] === undefined ||
    match[2] === undefined
  ) {
    throw new Error(
      `Invalid migration filename: ${fileName}`,
    );
  }

  return {
    version: Number.parseInt(
      match[1],
      10,
    ),
    name: match[2],
  };
}

export async function loadMigrations(
  directory = path.resolve(
    process.cwd(),
    "database",
    "migrations",
  ),
): Promise<Migration[]> {
  const entries =
    await fs.readdir(directory, {
      withFileTypes: true,
    });

  const migrations: Migration[] = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".sql")
    ) {
      continue;
    }

    const { version, name } =
      parseMigrationFileName(entry.name);

    const migrationPath =
      path.join(directory, entry.name);

    const rawContent =
      await fs.readFile(
        migrationPath,
        "utf8",
      );

    const content =
      rawContent.replace(/^\uFEFF/, "");

    const checksumContent =
      canonicalMigrationChecksumContent(
        content,
      );

    migrations.push({
      version,
      name,
      fileName: entry.name,
      sql: content,
      checksum:
        migrationChecksum(checksumContent),
    });
  }

  migrations.sort(
    (left, right) =>
      left.version - right.version,
  );

  const versions = new Set<number>();

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(
        `Duplicate migration version: ${migration.version}`,
      );
    }

    versions.add(migration.version);
  }

  return migrations;
}

async function ensureMigrationTable(
  pool: sql.ConnectionPool,
): Promise<void> {
  await pool.request().batch(`
    IF OBJECT_ID(
        N'dbo.schema_migration',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE dbo.schema_migration
        (
            version INT NOT NULL,
            name NVARCHAR(200) NOT NULL,
            checksum CHAR(64) NOT NULL,
            applied_at_utc DATETIME2(7)
                NOT NULL
                CONSTRAINT
                    DF_schema_migration_applied_at_utc
                DEFAULT SYSUTCDATETIME(),

            CONSTRAINT
                PK_schema_migration
                PRIMARY KEY (version),

            CONSTRAINT
                UQ_schema_migration_name
                UNIQUE (name)
        );
    END;
  `);
}

async function readAppliedMigrations(
  pool: sql.ConnectionPool,
): Promise<Map<number, AppliedMigration>> {
  const result =
    await pool.request().query<{
      version: number;
      name: string;
      checksum: string;
      applied_at_utc: Date;
    }>(`
      SELECT
          version,
          name,
          checksum,
          applied_at_utc
      FROM dbo.schema_migration
      ORDER BY version;
    `);

  return new Map(
    result.recordset.map((row) => [
      row.version,
      {
        version: row.version,
        name: row.name,
        checksum: row.checksum,
        appliedAtUtc:
          row.applied_at_utc,
      },
    ]),
  );
}

async function getMigrationPool():
Promise<sql.ConnectionPool> {

  if (!environment.database.migrationUser) {
    throw new Error(
      "DB_MIGRATION_USER is required.",
    );
  }

  if (!environment.database.migrationPassword) {
    throw new Error(
      "DB_MIGRATION_PASSWORD is required.",
    );
  }

  const pool =
    new sql.ConnectionPool({
      server:
        environment.database.server,

      port:
        environment.database.port,

      database:
        environment.database.database,

      user:
        environment.database.migrationUser,

      password:
        environment.database.migrationPassword,

      options: {
        encrypt:
          environment.database.encrypt,

        trustServerCertificate:
          environment.database
            .trustServerCertificate,
      },

      connectionTimeout: 10_000,
      requestTimeout: 30_000,
    });

  return pool.connect();
}


export async function runMigrations(): Promise<void> {
  const pool =
  await getMigrationPool();

  try {
    await ensureMigrationTable(pool);

  const migrations =
    await loadMigrations();

  const applied =
    await readAppliedMigrations(pool);

  for (const migration of migrations) {
    const existing =
      applied.get(migration.version);

    if (existing) {
      if (
        existing.name !== migration.name
      ) {
        throw new Error(
          `Migration ${migration.version} name mismatch.`,
        );
      }

      if (
        !isAcceptedAppliedMigrationChecksum(
          migration.version,
          migration.checksum,
          existing.checksum,
        )
      ) {
        throw new Error(
          `Migration ${migration.version} checksum mismatch.`,
        );
      }

      continue;
    }

    const transaction =
      new sql.Transaction(pool);

    await transaction.begin();

    try {
      await new sql.Request(
        transaction,
      ).batch(migration.sql);

      await new sql.Request(transaction)
        .input(
          "version",
          sql.Int,
          migration.version,
        )
        .input(
          "name",
          sql.NVarChar(200),
          migration.name,
        )
        .input(
          "checksum",
          sql.Char(64),
          migration.checksum,
        )
        .query(`
          INSERT INTO dbo.schema_migration
          (
              version,
              name,
              checksum
          )
          VALUES
          (
              @version,
              @name,
              @checksum
          );
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  }
  finally {
    await pool.close();
  }
}




