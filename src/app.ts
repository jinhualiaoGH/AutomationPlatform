import Fastify, {
  type FastifyInstance,
} from "fastify";

import { healthRoutes } from "./routes/health.js";

import { automationRoutes } from "./routes/automations.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(healthRoutes);
  app.register(automationRoutes);

  return app;
}
