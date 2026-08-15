import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildApp,
} from "../src/app.js";

import type {
  ExecutionHistoryReader,
} from "../src/routes/execution_history.js";

import type {
  SchedulerStatusReader,
} from "../src/routes/scheduler_status.js";

import type {
  ExecutionHistoryResult,
} from "../src/operations/execution_history_service.js";

import type {
  SchedulerOperationalStatus,
} from "../src/operations/scheduler_status_service.js";

class FakeSchedulerStatus
implements SchedulerStatusReader {
  public getStatus():
    SchedulerOperationalStatus {
    return {
      observedAtUtc:
        new Date(
          "2026-08-15T17:00:00.000Z",
        ),

      runtimeState:
        "running",

      isRunning:
        true,

      health:
        "healthy",

      terminalError:
        null,

      metrics: {
        cycles:
          3,

        successfulCycles:
          3,

        failedCycles:
          0,

        candidates:
          5,

        dispatched:
          4,

        skipped:
          1,

        failedDispatches:
          0,

        lastEvaluatedAtUtc:
          new Date(
            "2026-08-15T16:59:59.000Z",
          ),

        lastCycleError:
          null,
      },
    };
  }
}

class FakeExecutionHistory
implements ExecutionHistoryReader {
  public async getRecent(
    _limit = 50,
  ): Promise<ExecutionHistoryResult> {
    return {
      count:
        0,

      items:
        [],
    };
  }

  public async getRecentFailures(
    _limit = 50,
  ): Promise<ExecutionHistoryResult> {
    return {
      count:
        0,

      items:
        [],
    };
  }

  public async getRecentForAutomation(
    _automationId: bigint,
    _limit = 50,
  ): Promise<ExecutionHistoryResult> {
    return {
      count:
        0,

      items:
        [],
    };
  }
}

const apps:
  ReturnType<typeof buildApp>[] =
  [];

afterEach(
  async () => {
    while (apps.length > 0) {
      const app =
        apps.pop();

      if (app) {
        await app.close();
      }
    }
  },
);

describe(
  "operational application composition",
  () => {
    it(
      "registers scheduler status and execution history together",
      async () => {
        const app =
          buildApp({
            schedulerStatus:
              new FakeSchedulerStatus(),

            executionHistory:
              new FakeExecutionHistory(),
          });

        apps.push(
          app,
        );

        const scheduler =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(scheduler.statusCode)
          .toBe(200);

        expect(
          scheduler.json().health,
        ).toBe(
          "healthy",
        );

        const history =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(history.statusCode)
          .toBe(200);

        expect(history.json())
          .toEqual({
            count:
              0,

            items:
              [],
          });
      },
    );

    it(
      "preserves the legacy health endpoint when operational routes are enabled",
      async () => {
        const app =
          buildApp({
            schedulerStatus:
              new FakeSchedulerStatus(),

            executionHistory:
              new FakeExecutionHistory(),
          });

        apps.push(
          app,
        );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/health",
          });

        expect(response.statusCode)
          .toBe(200);
      },
    );

    it(
      "preserves backward-compatible buildApp without operational readers",
      async () => {
        const app =
          buildApp();

        apps.push(
          app,
        );

        const health =
          await app.inject({
            method:
              "GET",

            url:
              "/health",
          });

        expect(health.statusCode)
          .toBe(200);

        const scheduler =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(scheduler.statusCode)
          .toBe(404);

        const history =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(history.statusCode)
          .toBe(404);
      },
    );

    it(
      "keeps the integrated operational plane read-only",
      async () => {
        const app =
          buildApp({
            schedulerStatus:
              new FakeSchedulerStatus(),

            executionHistory:
              new FakeExecutionHistory(),
          });

        apps.push(
          app,
        );

        for (
          const method of [
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
          ] as const
        ) {
          const scheduler =
            await app.inject({
              method,

              url:
                "/operations/scheduler/status",
            });

          expect(
            scheduler.statusCode,
          ).toBe(404);

          const history =
            await app.inject({
              method,

              url:
                "/operations/executions",
            });

          expect(
            history.statusCode,
          ).toBe(404);
        }
      },
    );
  },
);
