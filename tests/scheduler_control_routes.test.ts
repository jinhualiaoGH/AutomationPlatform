import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerControlRoutes,
} from "../src/routes/scheduler_control.js";

import type {
  SchedulerControlRequest,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

function controlResult(
  overrides:
    Partial<SchedulerControlResult> =
    {},
): SchedulerControlResult {
  return {
    command:
      "start",

    disposition:
      "executed",

    previousState:
      "idle",

    currentState:
      "running",

    changed:
      true,

    reason:
      null,

    ...overrides,
  };
}

class FakeControlExecutor {
  public calls:
    SchedulerControlRequest[] =
    [];

  public result:
    SchedulerControlResult =
    controlResult();

  public error:
    unknown =
    null;

  public async execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult> {
    this.calls.push(
      request,
    );

    if (this.error !== null) {
      throw this.error;
    }

    return this.result;
  }
}

const apps:
  ReturnType<typeof Fastify>[] =
  [];

async function buildControlApp(
  executor:
    FakeControlExecutor,
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
    createSchedulerControlRoutes(
      executor,
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
  "scheduler control REST API",
  () => {
    it(
      "executes a start command and returns HTTP 200",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "start",
            },
          });

        expect(response.statusCode)
          .toBe(200);

        expect(executor.calls)
          .toEqual([
            {
              command:
                "start",

              requestKey:
                undefined,
            },
          ]);

        expect(response.json())
          .toEqual({
            command:
              "start",

            disposition:
              "executed",

            previousState:
              "idle",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });
      },
    );

    it(
      "forwards a normalized request key to the coordinator",
      async () => {
        const executor =
          new FakeControlExecutor();

        executor.result =
          controlResult({
            command:
              "stop",

            previousState:
              "running",

            currentState:
              "stopped",
          });

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "stop",

              requestKey:
                "  request-123  ",
            },
          });

        expect(response.statusCode)
          .toBe(200);

        expect(executor.calls)
          .toEqual([
            {
              command:
                "stop",

              requestKey:
                "request-123",
            },
          ]);
      },
    );

    it(
      "returns HTTP 200 for governed no-op outcomes",
      async () => {
        const executor =
          new FakeControlExecutor();

        executor.result =
          controlResult({
            command:
              "stop",

            disposition:
              "noop",

            previousState:
              "stopped",

            currentState:
              "stopped",

            changed:
              false,

            reason:
              "SchedulerRuntime is not currently running.",
          });

        const app =
          await buildControlApp(
            executor,
          );

        const response =
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

        expect(response.statusCode)
          .toBe(200);

        expect(
          response.json()
            .disposition,
        ).toBe(
          "noop",
        );
      },
    );

    it(
      "returns HTTP 409 for a governed rejected command",
      async () => {
        const executor =
          new FakeControlExecutor();

        executor.result =
          controlResult({
            disposition:
              "rejected",

            previousState:
              "running",

            currentState:
              "running",

            changed:
              false,

            reason:
              "SchedulerRuntime is single-start and can only start from idle.",
          });

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "start",

              requestKey:
                "duplicate-start",
            },
          });

        expect(response.statusCode)
          .toBe(409);

        expect(response.json())
          .toEqual({
            command:
              "start",

            disposition:
              "rejected",

            previousState:
              "running",

            currentState:
              "running",

            changed:
              false,

            reason:
              "SchedulerRuntime is single-start and can only start from idle.",
          });
      },
    );

    it(
      "rejects missing or unsupported commands before coordinator invocation",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        for (
          const payload of [
            {},
            {
              command:
                "restart",
            },
            {
              command:
                "pause",
            },
            {
              command:
                123,
            },
          ]
        ) {
          const response =
            await app.inject({
              method:
                "POST",

              url:
                "/operations/scheduler/commands",

              payload,
            });

          expect(response.statusCode)
            .toBe(400);

          expect(response.json())
            .toEqual({
              error:
                "invalid_scheduler_control_request",

              message:
                'command must be either "start" or "stop".',
            });
        }

        expect(executor.calls)
          .toEqual([]);
      },
    );

    it(
      "rejects a non-string request key before coordinator invocation",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "start",

              requestKey:
                123,
            },
          });

        expect(response.statusCode)
          .toBe(400);

        expect(response.json())
          .toEqual({
            error:
              "invalid_scheduler_control_request",

            message:
              "requestKey must be a string when provided.",
          });

        expect(executor.calls)
          .toEqual([]);
      },
    );

    it(
      "rejects empty and oversized request keys before coordinator invocation",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        const empty =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "start",

              requestKey:
                "   ",
            },
          });

        expect(empty.statusCode)
          .toBe(400);

        expect(empty.json())
          .toEqual({
            error:
              "invalid_scheduler_control_request",

            message:
              "requestKey must not be empty.",
          });

        const oversized =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "start",

              requestKey:
                "x".repeat(
                  129,
                ),
            },
          });

        expect(oversized.statusCode)
          .toBe(400);

        expect(oversized.json())
          .toEqual({
            error:
              "invalid_scheduler_control_request",

            message:
              "requestKey must not exceed 128 characters.",
          });

        expect(executor.calls)
          .toEqual([]);
      },
    );

    it(
      "returns stable HTTP 500 when coordinator execution fails",
      async () => {
        const executor =
          new FakeControlExecutor();

        executor.error =
          new Error(
            "synthetic coordinator failure",
          );

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "stop",

              requestKey:
                "failure-key",
            },
          });

        expect(response.statusCode)
          .toBe(500);

        expect(response.json())
          .toEqual({
            error:
              "scheduler_control_error",

            message:
              "Unable to execute scheduler control command.",
          });

        expect(executor.calls)
          .toHaveLength(1);
      },
    );

    it(
      "does not expose GET on the scheduler command resource",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/commands",
          });

        expect(response.statusCode)
          .toBe(404);

        expect(executor.calls)
          .toEqual([]);
      },
    );

    it(
      "does not expose dedicated start stop pause resume or restart endpoints",
      async () => {
        const executor =
          new FakeControlExecutor();

        const app =
          await buildControlApp(
            executor,
          );

        for (
          const path of [
            "/operations/scheduler/start",
            "/operations/scheduler/stop",
            "/operations/scheduler/pause",
            "/operations/scheduler/resume",
            "/operations/scheduler/restart",
          ]
        ) {
          const response =
            await app.inject({
              method:
                "POST",

              url:
                path,
            });

          expect(response.statusCode)
            .toBe(404);
        }

        expect(executor.calls)
          .toEqual([]);
      },
    );
  },
);
