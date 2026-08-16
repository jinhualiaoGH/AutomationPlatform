import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerRecoveryControlRoutes,
  SchedulerRecoveryHttpGateway,
} from "../src/routes/scheduler_recovery_control.js";

import type {
  SchedulerControlRequest,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

import type {
  RecoveryAwareSchedulerControlRequest,
} from "../src/recovery/recovery_aware_scheduler_control_coordinator.js";

import type {
  RecoveryAwareSchedulerControlResult,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";


class FakeFrozenExecutor {
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


class FakeRecoveryExecutor {
  public calls:
    RecoveryAwareSchedulerControlRequest[] =
    [];

  public async execute(
    request:
      RecoveryAwareSchedulerControlRequest,
  ): Promise<RecoveryAwareSchedulerControlResult> {
    this.calls.push(
      request,
    );

    return {
      command:
        "restart",

      disposition:
        "executed",

      previousState:
        "running",

      currentState:
        "running",

      changed:
        true,

      reason:
        null,

      previousGeneration:
        1,

      currentGeneration:
        2,
    };
  }
}


const apps:
  ReturnType<typeof Fastify>[] =
  [];


async function buildTestApp(
  frozen:
    FakeFrozenExecutor,

  recovery:
    FakeRecoveryExecutor,
) {
  const app =
    Fastify({
      logger:
        false,
    });

  apps.push(
    app,
  );

  const gateway =
    new SchedulerRecoveryHttpGateway(
      frozen,
      recovery,
    );

  await app.register(
    createSchedulerRecoveryControlRoutes(
      gateway,
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
  "A9 recovery-aware scheduler command REST API",
  () => {
    it(
      "routes start only to the frozen A8 executor",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
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
                "  start-001  ",
            },
          });

        expect(response.statusCode)
          .toBe(200);

        expect(frozen.calls)
          .toEqual([
            {
              command:
                "start",

              requestKey:
                "start-001",
            },
          ]);

        expect(recovery.calls)
          .toEqual([]);
      },
    );

    it(
      "routes stop only to the frozen A8 executor",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
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

        expect(frozen.calls)
          .toHaveLength(1);

        expect(recovery.calls)
          .toEqual([]);
      },
    );

    it(
      "routes restart only to the audited recovery executor",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "restart",

              requestKey:
                "  restart-001  ",
            },
          });

        expect(response.statusCode)
          .toBe(200);

        expect(frozen.calls)
          .toEqual([]);

        expect(recovery.calls)
          .toEqual([
            {
              command:
                "restart",

              requestKey:
                "restart-001",
            },
          ]);

        expect(response.json())
          .toMatchObject({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,

            previousState:
              "running",

            currentState:
              "running",
          });
      },
    );

    it(
      "rejects unsupported commands without invoking either executor",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "pause",
            },
          });

        expect(response.statusCode)
          .toBe(400);

        expect(response.json())
          .toEqual({
            error:
              "invalid_scheduler_control_request",

            message:
              'command must be "start", "stop", or "restart".',
          });

        expect(frozen.calls)
          .toEqual([]);

        expect(recovery.calls)
          .toEqual([]);
      },
    );

    it(
      "preserves bounded request-key validation",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
          );

        for (
          const requestKey of [
            "   ",
            "x".repeat(
              129,
            ),
          ]
        ) {
          const response =
            await app.inject({
              method:
                "POST",

              url:
                "/operations/scheduler/commands",

              payload: {
                command:
                  "restart",

                requestKey,
              },
            });

          expect(response.statusCode)
            .toBe(400);
        }

        expect(frozen.calls)
          .toEqual([]);

        expect(recovery.calls)
          .toEqual([]);
      },
    );

    it(
      "does not expose a dedicated restart endpoint",
      async () => {
        const frozen =
          new FakeFrozenExecutor();

        const recovery =
          new FakeRecoveryExecutor();

        const app =
          await buildTestApp(
            frozen,
            recovery,
          );

        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/restart",
          });

        expect(response.statusCode)
          .toBe(404);
      },
    );
  },
);
