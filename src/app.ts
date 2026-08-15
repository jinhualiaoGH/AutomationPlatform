import Fastify, {
  type FastifyInstance,
} from "fastify";

import {
  automationRoutes,
} from "./routes/automations.js";

import {
  createExecutionHistoryRoutes,
} from "./routes/execution_history.js";

import type {
  ExecutionHistoryReader,
} from "./routes/execution_history.js";

import {
  healthRoutes,
} from "./routes/health.js";

import {
  createSchedulerStatusRoutes,
} from "./routes/scheduler_status.js";

import type {
  SchedulerStatusReader,
} from "./routes/scheduler_status.js";

export type ApplicationOperationalReaders = {
  schedulerStatus:
    SchedulerStatusReader;

  executionHistory:
    ExecutionHistoryReader;
};

export function buildApp(
  operational?:
    ApplicationOperationalReaders,
): FastifyInstance {
  const app =
    Fastify({
      logger:
        true,
    });

  app.register(
    healthRoutes,
  );

  app.register(
    automationRoutes,
  );

  if (operational) {
    app.register(
      createSchedulerStatusRoutes(
        operational.schedulerStatus,
      ),
    );

    app.register(
      createExecutionHistoryRoutes(
        operational.executionHistory,
      ),
    );
  }

  return app;
}
