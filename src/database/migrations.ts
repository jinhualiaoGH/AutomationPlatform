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

    migrations.push({
      version,
      name,
      fileName: entry.name,
      sql: content,
      checksum:
        migrationChecksum(content),
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
        existing.checksum !==
        migration.checksum
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




