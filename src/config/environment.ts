import "dotenv/config";

function integer(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed)
    ? fallback
    : parsed;
}

function boolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export const environment = Object.freeze({
  nodeEnv:
    process.env.NODE_ENV ?? "development",

  server: {
    host:
      process.env.HOST ?? "127.0.0.1",

    port:
      integer(process.env.PORT, 3000),
  },

  database: {
    enabled:
      boolean(
        process.env.DB_ENABLED,
        false,
      ),

    server:
      process.env.DB_SERVER ??
      "127.0.0.1",

    port:
      integer(
        process.env.DB_PORT,
        14330,
      ),

    database:
      process.env.DB_DATABASE ??
      "AutomationPlatform",

    user:
      process.env.DB_USER ?? "",

    password:
      process.env.DB_PASSWORD ?? "",

    encrypt:
      boolean(
        process.env.DB_ENCRYPT,
        false,
      ),

    trustServerCertificate:
      boolean(
        process.env
          .DB_TRUST_SERVER_CERTIFICATE,
        true,
      ),
  },
});
