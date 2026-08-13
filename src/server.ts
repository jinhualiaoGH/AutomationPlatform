import { buildApp } from "./app.js";
import { environment } from "./config/environment.js";
import { closeDatabase } from "./database/sqlserver.js";

const app = buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info(
    {
      signal,
    },
    "Shutdown requested",
  );

  try {
    await app.close();
    await closeDatabase();

    process.exit(0);
  } catch (error) {
    app.log.error(
      error,
      "Graceful shutdown failed",
    );

    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({
    host: environment.server.host,
    port: environment.server.port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
