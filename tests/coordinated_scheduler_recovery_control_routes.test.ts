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
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";


const apps:
  ReturnType<typeof Fastify>[] =
  [];


async function buildTestApp(
  execute:
    (
      request:
        CoordinatedRecoveryAwareSchedulerControlRequest,
    ) =>
      Promise<
        CoordinatedRecoveryAwareSchedulerControlResult
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
  "A11.9 coordinated scheduler recovery HTTP API",
  () => {

    it(
      "preserves frozen start response semantics",
      async () => {

        const app =
          await buildTestApp(
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

              requestKey:
                "start-1",
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
      "unwraps a winning restart to the frozen A9 HTTP shape",
      async () => {

        const restart = {
          command:
            "restart" as const,

          disposition:
            "executed" as const,

          previousGeneration:
            7,

          currentGeneration:
            8,

          previousState:
            "running" as const,

          currentState:
            "running" as const,

          changed:
            true,

          reason:
            null,
        };


        const app =
          await buildTestApp(
            async () => ({
              disposition:
                "restarted",

              previousGeneration:
                7,

              currentGeneration:
                8,

              result:
                restart,
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
                "restart",

              requestKey:
                "winner-1",
            },
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(response.json())
          .toEqual(
            restart,
          );
      },
    );


    it(
      "preserves frozen rejected restart as HTTP 409",
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
          await buildTestApp(
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


    it(
      "returns superseded cross-process loser as HTTP 409 rather than 500",
      async () => {

        const app =
          await buildTestApp(
            async () => ({
              disposition:
                "superseded",

              attemptedGeneration:
                11,

              observedGeneration:
                12,
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
                "restart",

              requestKey:
                "loser-1",
            },
          });


        expect(response.statusCode)
          .toBe(
            409,
          );


        expect(response.json())
          .toEqual({
            command:
              "restart",

            disposition:
              "superseded",

            attemptedGeneration:
              11,

            observedGeneration:
              12,

            changed:
              false,

            reason:
              "Superseded by a later durable scheduler generation.",
          });
      },
    );


    it(
      "normalizes request keys before execution",
      async () => {

        const requests:
          CoordinatedRecoveryAwareSchedulerControlRequest[] =
          [];


        const app =
          await buildTestApp(
            async (
              request,
            ) => {

              requests.push(
                request,
              );


              return {
                disposition:
                  "superseded",

                attemptedGeneration:
                  2,

                observedGeneration:
                  3,
              };
            },
          );


        await app.inject({
          method:
            "POST",

          url:
            "/operations/scheduler/commands",

          payload: {
            command:
              "restart",

            requestKey:
              "  key-1  ",
          },
        });


        expect(requests)
          .toEqual([
            {
              command:
                "restart",

              requestKey:
                "key-1",
            },
          ]);
      },
    );


    it(
      "rejects unsupported commands without execution",
      async () => {

        let calls =
          0;


        const app =
          await buildTestApp(
            async () => {

              calls +=
                1;


              throw new Error(
                "must not execute",
              );
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
                "pause",
            },
          });


        expect(response.statusCode)
          .toBe(
            400,
          );


        expect(calls)
          .toBe(
            0,
          );
      },
    );


    it(
      "preserves bounded request-key validation",
      async () => {

        const app =
          await buildTestApp(
            async () => ({
              disposition:
                "superseded",

              attemptedGeneration:
                1,

              observedGeneration:
                2,
            }),
          );


        const empty =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "restart",

              requestKey:
                "   ",
            },
          });


        expect(empty.statusCode)
          .toBe(
            400,
          );


        const oversized =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/commands",

            payload: {
              command:
                "restart",

              requestKey:
                "x".repeat(
                  129,
                ),
            },
          });


        expect(oversized.statusCode)
          .toBe(
            400,
          );
      },
    );


    it(
      "maps execution failure to generic HTTP 500",
      async () => {

        const app =
          await buildTestApp(
            async () => {

              throw new Error(
                "secret internal failure",
              );
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
            },
          });


        expect(response.statusCode)
          .toBe(
            500,
          );


        expect(response.json())
          .toEqual({
            error:
              "scheduler_control_error",

            message:
              "Unable to execute scheduler control command.",
          });
      },
    );
    it(
      "routes dedicated start stop and restart through the coordinated executor",
      async () => {

        const requests:
          CoordinatedRecoveryAwareSchedulerControlRequest[] =
          [];


        const app =
          await buildTestApp(
            async (
              request,
            ) => {

              requests.push(
                request,
              );


              if (
                request.command ===
                "start"
              ) {
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
                };
              }


              if (
                request.command ===
                "stop"
              ) {
                return {
                  command:
                    "stop",

                  disposition:
                    "executed",

                  previousState:
                    "running",

                  currentState:
                    "idle",

                  changed:
                    true,

                  reason:
                    null,
                };
              }


              return {
                disposition:
                  "superseded",

                attemptedGeneration:
                  11,

                observedGeneration:
                  12,
              };
            },
          );


        const start =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/start",

            payload: {
              requestKey:
                "  start-dedicated-1  ",
            },
          });


        const stop =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/stop",

            payload: {
              requestKey:
                "  stop-dedicated-1  ",
            },
          });


        const restart =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/restart",

            payload: {
              requestKey:
                "  restart-dedicated-1  ",
            },
          });


        expect(start.statusCode)
          .toBe(
            200,
          );

        expect(stop.statusCode)
          .toBe(
            200,
          );

        expect(restart.statusCode)
          .toBe(
            409,
          );


        expect(requests)
          .toEqual([
            {
              command:
                "start",

              requestKey:
                "start-dedicated-1",
            },
            {
              command:
                "stop",

              requestKey:
                "stop-dedicated-1",
            },
            {
              command:
                "restart",

              requestKey:
                "restart-dedicated-1",
            },
          ]);
      },
    );


    it(
      "keeps dedicated pause and resume routes unpublished",
      async () => {

        let calls =
          0;


        const app =
          await buildTestApp(
            async () => {

              calls +=
                1;


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
              };
            },
          );


        for (
          const path of [
            "/operations/scheduler/pause",
            "/operations/scheduler/resume",
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
            .toBe(
              404,
            );
        }


        expect(calls)
          .toBe(
            0,
          );
      },
    );
  },
);
