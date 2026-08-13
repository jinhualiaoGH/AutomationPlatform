import type { FastifyPluginAsync } from "fastify";

import { databaseHealth } from "../database/sqlserver.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "automation-platform-api",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/health/database", async (_request, reply) => {
    const database = await databaseHealth();

    if (database.enabled && !database.connected) {
      return reply.code(503).send({
        status: "degraded",
        database,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: database.connected ? "ok" : "disabled",
      database,
      timestamp: new Date().toISOString(),
    };
  });
};
