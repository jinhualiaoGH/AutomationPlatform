import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerStatusRoutes,
} from "../src/routes/scheduler_status.js";

import type {
  SchedulerOperationalStatus,
} from "../src/operations/scheduler_status_service.js";

function operationalStatus(
  overrides:
    Partial<SchedulerOperationalStatus> =
    {},
): SchedulerOperationalStatus {
  return {
    observedAtUtc:
      new Date(
        "2026-08-15T16:00:00.000Z",
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
        4,

      successfulCycles:
        4,

      failedCycles:
        0,

      candidates:
        9,

      dispatched:
        7,

      skipped:
        2,

      failedDispatches:
        0,

      lastEvaluatedAtUtc:
        new Date(
          "2026-08-15T15:59:59.000Z",
        ),

      lastCycleError:
        null,
    },

    ...overrides,
  };
}

class FakeStatusReader {
  public calls =
    0;

  public status:
    SchedulerOperationalStatus =
    operationalStatus();

  public error:
    unknown =
    null;

  public getStatus():
    SchedulerOperationalStatus {
    this.calls++;

    if (this.error !== null) {
      throw this.error;
    }

    return this.status;
  }
}

const apps:
  ReturnType<typeof Fastify>[] =
  [];

async function buildStatusApp(
  reader:
    FakeStatusReader,
) {
  const app =
    Fastify({
      logger:
        false,
    });

  apps.push(
    app,
  );

  await app.register(
    createSchedulerStatusRoutes(
      reader,
    ),
  );

  return app;
}

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
  "scheduler status REST API",
  () => {
    it(
      "returns the current scheduler operational status",
      async () => {
        const reader =
          new FakeStatusReader();

        const app =
          await buildStatusApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(reader.calls)
          .toBe(1);

        expect(response.json())
          .toEqual({
            observedAtUtc:
              "2026-08-15T16:00:00.000Z",

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
                4,

              successfulCycles:
                4,

              failedCycles:
                0,

              candidates:
                9,

              dispatched:
                7,

              skipped:
                2,

              failedDispatches:
                0,

              lastEvaluatedAtUtc:
                "2026-08-15T15:59:59.000Z",

              lastCycleError:
                null,
            },
          });
      },
    );

    it(
      "serializes a degraded running scheduler",
      async () => {
        const reader =
          new FakeStatusReader();

        reader.status =
          operationalStatus({
            health:
              "degraded",

            metrics: {
              ...operationalStatus()
                .metrics,

              cycles:
                5,

              successfulCycles:
                4,

              failedCycles:
                1,

              lastCycleError:
                "database unavailable",
            },
          });

        const app =
          await buildStatusApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(response.statusCode)
          .toBe(200);

        const body =
          response.json();

        expect(body.health)
          .toBe(
            "degraded",
          );

        expect(
          body.metrics.failedCycles,
        ).toBe(1);

        expect(
          body.metrics.lastCycleError,
        ).toBe(
          "database unavailable",
        );
      },
    );

    it(
      "serializes terminal failure without hiding metrics",
      async () => {
        const reader =
          new FakeStatusReader();

        reader.status =
          operationalStatus({
            runtimeState:
              "failed",

            isRunning:
              false,

            health:
              "failed",

            terminalError:
              "scheduler terminated",

            metrics: {
              ...operationalStatus()
                .metrics,

              failedCycles:
                2,
            },
          });

        const app =
          await buildStatusApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(response.statusCode)
          .toBe(200);

        const body =
          response.json();

        expect(body.health)
          .toBe("failed");

        expect(body.terminalError)
          .toBe(
            "scheduler terminated",
          );

        expect(
          body.metrics.failedCycles,
        ).toBe(2);
      },
    );

    it(
      "serializes null evaluation time",
      async () => {
        const reader =
          new FakeStatusReader();

        reader.status =
          operationalStatus({
            runtimeState:
              "idle",

            isRunning:
              false,

            health:
              "idle",

            metrics: {
              ...operationalStatus()
                .metrics,

              cycles:
                0,

              successfulCycles:
                0,

              candidates:
                0,

              dispatched:
                0,

              skipped:
                0,

              lastEvaluatedAtUtc:
                null,
            },
          });

        const app =
          await buildStatusApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(response.statusCode)
          .toBe(200);

        expect(
          response.json()
            .metrics
            .lastEvaluatedAtUtc,
        ).toBeNull();
      },
    );

    it(
      "reads fresh status for every request",
      async () => {
        const reader =
          new FakeStatusReader();

        const app =
          await buildStatusApp(
            reader,
          );

        const first =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(first.statusCode)
          .toBe(200);

        reader.status =
          operationalStatus({
            health:
              "degraded",

            metrics: {
              ...operationalStatus()
                .metrics,

              cycles:
                5,

              failedCycles:
                1,

              lastCycleError:
                "temporary failure",
            },
          });

        const second =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(second.statusCode)
          .toBe(200);

        expect(reader.calls)
          .toBe(2);

        expect(first.json().health)
          .toBe("healthy");

        expect(second.json().health)
          .toBe("degraded");
      },
    );

    it(
      "returns a stable 500 response when status observation fails",
      async () => {
        const reader =
          new FakeStatusReader();

        reader.error =
          new Error(
            "synthetic status failure",
          );

        const app =
          await buildStatusApp(
            reader,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/status",
          });

        expect(response.statusCode)
          .toBe(500);

        expect(response.json())
          .toEqual({
            error:
              "scheduler_status_error",

            message:
              "Unable to read scheduler operational status.",
          });
      },
    );

    it(
      "does not expose a mutation method on the status route",
      async () => {
        const reader =
          new FakeStatusReader();

        const app =
          await buildStatusApp(
            reader,
          );

        for (
          const method of [
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
          ] as const
        ) {
          const response =
            await app.inject({
              method,
              url:
                "/operations/scheduler/status",
            });

          expect(response.statusCode)
            .toBe(404);
        }

        expect(reader.calls)
          .toBe(0);
      },
    );
  },
);
