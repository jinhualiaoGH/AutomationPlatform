import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createCoordinatedSchedulerRecoveryControlRoutes,
} from "../src/routes/coordinated_scheduler_recovery_control.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "../src/recovery/readiness_aware_coordinated_control_executor.js";


const apps:
  ReturnType<typeof Fastify>[] =
  [];


async function buildApp(
  execute:
    (
      request:
        CoordinatedRecoveryAwareSchedulerControlRequest,
    ) =>
      Promise<
        ReadinessAwareCoordinatedSchedulerControlResult
      >,
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
    createCoordinatedSchedulerRecoveryControlRoutes({
      execute,
    }),
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
  "A17 coordinated scheduler-control admission HTTP",
  () => {

    it(
      "returns standby admission denial as HTTP 409",
      async () => {

        let received:
          CoordinatedRecoveryAwareSchedulerControlRequest |
          null =
          null;


        const app =
          await buildApp(
            async (
              request,
            ) => {

              received =
                request;


              return {
                kind:
                  "admission_denied",

                command:
                  request.command,

                reason:
                  "scheduler_standby",
              };
            },
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
                "  standby-1  ",
            },
          });


        expect(response.statusCode)
          .toBe(
            409,
          );


        expect(response.json())
          .toEqual({
            kind:
              "admission_denied",

            command:
              "restart",

            reason:
              "scheduler_standby",
          });


        expect(received)
          .toEqual({
            command:
              "restart",

            requestKey:
              "standby-1",
          });
      },
    );


    it(
      "returns fail-closed admission denial as HTTP 409",
      async () => {

        const app =
          await buildApp(
            async (
              request,
            ) => ({
              kind:
                "admission_denied",

              command:
                request.command,

              reason:
                "scheduler_fail_closed",
            }),
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
          .toBe(
            409,
          );


        expect(response.json())
          .toEqual({
            kind:
              "admission_denied",

            command:
              "start",

            reason:
              "scheduler_fail_closed",
          });
      },
    );


    it(
      "returns stopped-supervision admission denial as HTTP 409",
      async () => {

        const app =
          await buildApp(
            async (
              request,
            ) => ({
              kind:
                "admission_denied",

              command:
                request.command,

              reason:
                "scheduler_stopped",
            }),
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
          .toBe(
            409,
          );


        expect(response.json())
          .toEqual({
            kind:
              "admission_denied",

            command:
              "stop",

            reason:
              "scheduler_stopped",
          });
      },
    );


    it(
      "does not alter frozen successful start semantics",
      async () => {

        const app =
          await buildApp(
            async () => ({
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
            }),
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
          .toBe(
            200,
          );


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
      "does not alter frozen rejected restart HTTP 409 semantics",
      async () => {

        const rejected = {
          command:
            "restart" as const,

          disposition:
            "rejected" as const,

          previousGeneration:
            7,

          currentGeneration:
            7,

          previousState:
            "idle" as const,

          currentState:
            "idle" as const,

          changed:
            false,

          reason:
            "scheduler runtime is not restartable",
        };


        const app =
          await buildApp(
            async () =>
              rejected,
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
            },
          });


        expect(response.statusCode)
          .toBe(
            409,
          );


        expect(response.json())
          .toEqual(
            rejected,
          );
      },
    );
  },
);
