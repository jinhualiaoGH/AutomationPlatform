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
  createSchedulerControlRoutes,
} from "./routes/scheduler_control.js";

import {
  createSchedulerControlAuditRoutes,
} from "./routes/scheduler_control_audit.js";

import type {
  SchedulerControlAuditHistoryReader,
} from "./routes/scheduler_control_audit.js";

import type {
  SchedulerControlExecutor,
} from "./routes/scheduler_control.js";

import {
  createSchedulerRecoveryControlRoutes,
} from "./routes/scheduler_recovery_control.js";

import type {
  SchedulerRecoveryHttpGateway,
} from "./routes/scheduler_recovery_control.js";

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

  /*
   * Frozen A8 start/stop route dependency.
   * Retained for backward compatibility.
   */
  schedulerControl?:
    SchedulerControlExecutor;

  /*
   * A9 production command gateway.
   * When supplied, it owns the single command resource and
   * dispatches start/stop to A8 and restart to A9.
   */
  schedulerRecoveryControl?:
    SchedulerRecoveryHttpGateway;

  schedulerControlAudit?:
    SchedulerControlAuditHistoryReader;
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

    if (
      operational.schedulerRecoveryControl
    ) {
      app.register(
        createSchedulerRecoveryControlRoutes(
          operational.schedulerRecoveryControl,
        ),
      );
    }
    else if (
      operational.schedulerControl
    ) {
      app.register(
        createSchedulerControlRoutes(
          operational.schedulerControl,
        ),
      );
    }

    if (
      operational.schedulerControlAudit
    ) {
      app.register(
        createSchedulerControlAuditRoutes(
          operational.schedulerControlAudit,
        ),
      );
    }
  }

  return app;
}
