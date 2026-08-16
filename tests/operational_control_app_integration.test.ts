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
  ExecutionHistoryResult,
} from "../src/operations/execution_history_service.js";

import type {
  SchedulerControlRequest,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

import type {
  SchedulerOperationalStatus,
} from "../src/operations/scheduler_status_service.js";

import type {
  ExecutionHistoryReader,
} from "../src/routes/execution_history.js";

import type {
  SchedulerControlExecutor,
} from "../src/routes/scheduler_control.js";

import type {
  SchedulerStatusReader,
} from "../src/routes/scheduler_status.js";

class FakeSchedulerStatus
implements SchedulerStatusReader {
  public getStatus():
    SchedulerOperationalStatus {
    return {
      observedAtUtc:
        new Date(
          "2026-08-15T18:00:00.000Z",
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
          7,

        successfulCycles:
          7,

        failedCycles:
          0,

        candidates:
          0,

        dispatched:
          0,

        skipped:
          0,

        failedDispatches:
          0,

        lastEvaluatedAtUtc:
          new Date(
            "2026-08-15T17:59:59.000Z",
          ),

        lastCycleError:
          null,
      },
    };
  }
}

class FakeHistory
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

class FakeControl
implements SchedulerControlExecutor {
  public calls:
    SchedulerControlRequest[] =
    [];

  public async execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult> {
    this.calls.push(
      request,
    );

    return {
      command:
        request.command,

      disposition:
        "executed",

      previousState:
        request.command === "start"
          ? "idle"
          : "running",

      currentState:
        request.command === "start"
          ? "running"
          : "stopped",

      changed:
        true,

      reason:
        null,
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
  "A8 operational control application integration",
  () => {
    it(
      "registers scheduler control alongside existing operational reads",
      async () => {
        const control =
          new FakeControl();

        const app =
          buildApp({
            schedulerStatus:
              new FakeSchedulerStatus(),

            executionHistory:
              new FakeHistory(),

            schedulerControl:
              control,
          });

        apps.push(
          app,
        );

        const status =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(status.statusCode)
          .toBe(200);

        const history =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/executions",
          });

        expect(history.statusCode)
          .toBe(200);

        const command =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "stop",

              requestKey:
                "app-control-1",
            },
          });

        expect(command.statusCode)
          .toBe(200);

        expect(control.calls)
          .toEqual([
            {
              command:
                "stop",

              requestKey:
                "app-control-1",
            },
          ]);
      },
    );

    it(
      "keeps scheduler control optional for backward-compatible operational injection",
      async () => {
        const app =
          buildApp({
            schedulerStatus:
              new FakeSchedulerStatus(),

            executionHistory:
              new FakeHistory(),
          });

        apps.push(
          app,
        );

        const status =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(status.statusCode)
          .toBe(200);

        const command =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "stop",
            },
          });

        expect(command.statusCode)
          .toBe(404);
      },
    );

    it(
      "preserves buildApp with no operational dependencies",
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

        const command =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "stop",
            },
          });

        expect(command.statusCode)
          .toBe(404);
      },
    );
  },
);
