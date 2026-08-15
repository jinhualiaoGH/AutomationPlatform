import type {
  FastifyPluginAsync,
} from "fastify";

import type {
  SchedulerOperationalStatus,
} from "../operations/scheduler_status_service.js";

export type SchedulerStatusReader = {
  getStatus():
    SchedulerOperationalStatus;
};

export type SchedulerStatusMetricsResponse = {
  cycles:
    number;

  successfulCycles:
    number;

  failedCycles:
    number;

  candidates:
    number;

  dispatched:
    number;

  skipped:
    number;

  failedDispatches:
    number;

  lastEvaluatedAtUtc:
    string | null;

  lastCycleError:
    string | null;
};

export type SchedulerStatusResponse = {
  observedAtUtc:
    string;

  runtimeState:
    SchedulerOperationalStatus["runtimeState"];

  isRunning:
    boolean;

  health:
    SchedulerOperationalStatus["health"];

  terminalError:
    string | null;

  metrics:
    SchedulerStatusMetricsResponse;
};

export type SchedulerStatusErrorResponse = {
  error:
    "scheduler_status_error";

  message:
    string;
};

function serializeSchedulerStatus(
  status:
    SchedulerOperationalStatus,
): SchedulerStatusResponse {
  return {
    observedAtUtc:
      status.observedAtUtc
        .toISOString(),

    runtimeState:
      status.runtimeState,

    isRunning:
      status.isRunning,

    health:
      status.health,

    terminalError:
      status.terminalError,

    metrics: {
      cycles:
        status.metrics.cycles,

      successfulCycles:
        status.metrics
          .successfulCycles,

      failedCycles:
        status.metrics.failedCycles,

      candidates:
        status.metrics.candidates,

      dispatched:
        status.metrics.dispatched,

      skipped:
        status.metrics.skipped,

      failedDispatches:
        status.metrics
          .failedDispatches,

      lastEvaluatedAtUtc:
        status.metrics
          .lastEvaluatedAtUtc
          ?.toISOString() ??
        null,

      lastCycleError:
        status.metrics
          .lastCycleError,
    },
  };
}

export function createSchedulerStatusRoutes(
  statusReader:
    SchedulerStatusReader,
): FastifyPluginAsync {
  return async function schedulerStatusRoutes(
    app,
  ): Promise<void> {
    app.get(
      "/operations/scheduler/status",
      async (
        _request,
        reply,
      ) => {
        try {
          const status =
            statusReader.getStatus();

          return reply.send(
            serializeSchedulerStatus(
              status,
            ),
          );
        }
        catch (error) {
          app.log.error(
            error,
            "Unable to read scheduler operational status",
          );

          const response:
            SchedulerStatusErrorResponse = {
              error:
                "scheduler_status_error",

              message:
                "Unable to read scheduler operational status.",
            };

          return reply
            .code(500)
            .send(
              response,
            );
        }
      },
    );
  };
}
