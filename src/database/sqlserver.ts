import sql from "mssql";

import { environment } from "../config/environment.js";

let pool: sql.ConnectionPool | undefined;

export type DatabaseHealth = {
  enabled: boolean;
  connected: boolean;
  database?: string;
  server?: string;
  login?: string;
  error?: string;
};

function createConfiguration(): sql.config {
  if (!environment.database.user) {
    throw new Error(
      "DB_USER is required when database connectivity is enabled.",
    );
  }

  if (!environment.database.password) {
    throw new Error(
      "DB_PASSWORD is required when database connectivity is enabled.",
    );
  }

  return {
    server:
      environment.database.server,

    port:
      environment.database.port,

    database:
      environment.database.database,

    user:
      environment.database.user,

    password:
      environment.database.password,

    options: {
      encrypt:
        environment.database.encrypt,

      trustServerCertificate:
        environment.database
          .trustServerCertificate,
    },

    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },

    connectionTimeout: 10_000,
    requestTimeout: 30_000,
  };
}

export async function getDatabasePool():
Promise<sql.ConnectionPool> {

  if (!environment.database.enabled) {
    throw new Error(
      "Database connectivity is disabled.",
    );
  }

  if (pool?.connected) {
    return pool;
  }

  const candidate =
    new sql.ConnectionPool(
      createConfiguration(),
    );

  candidate.on(
    "error",
    (error) => {
      console.error(
        "SQL Server connection pool error:",
        error,
      );
    },
  );

  pool =
    await candidate.connect();

  return pool;
}

export async function databaseHealth():
Promise<DatabaseHealth> {

  if (!environment.database.enabled) {
    return {
      enabled: false,
      connected: false,
    };
  }

  try {
    const connection =
      await getDatabasePool();

    const result =
      await connection
        .request()
        .query(`
          SELECT
            @@SERVERNAME AS server_name,
            DB_NAME() AS database_name,
            SYSTEM_USER AS login_name;
        `);

    const row =
      result.recordset[0];

    return {
      enabled: true,
      connected: true,

      server:
        String(
          row?.server_name ?? "",
        ),

      database:
        String(
          row?.database_name ?? "",
        ),

      login:
        String(
          row?.login_name ?? "",
        ),
    };
  }
  catch (error) {
    return {
      enabled: true,
      connected: false,

      error:
        error instanceof Error
          ? error.message
          : "Unknown database error",
    };
  }
}

export async function closeDatabase():
Promise<void> {

  if (!pool) {
    return;
  }

  await pool.close();

  pool = undefined;
}
