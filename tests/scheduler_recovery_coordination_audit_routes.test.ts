import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerRecoveryCoordinationAuditRoutes,
} from "../src/routes/scheduler_recovery_coordination_audit.js";


const apps:
  ReturnType<typeof Fastify>[] =
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


async function buildAuditApp(
  listRecent:
    (
      limit:
        number,
    ) => Promise<any[]>,
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
    createSchedulerRecoveryCoordinationAuditRoutes({
      listRecent,
    }),
  );


  return app;
}


describe(
  "A11.9 scheduler recovery coordination audit HTTP API",
  () => {

    it(
      "returns recent coordination audit records",
      async () => {

        const limits:
          number[] =
          [];


        const item = {
          publicId:
            "audit-1",

          command:
            "restart",

          requestKey:
            "request-1",

          auditStatus:
            "completed",

          resultKind:
            "superseded",

          disposition:
            "superseded",

          previousState:
            null,

          currentState:
            null,

          previousGeneration:
            null,

          currentGeneration:
            null,

          attemptedGeneration:
            7,

          observedGeneration:
            8,

          changed:
            false,

          reason:
            "Superseded by a later durable scheduler generation.",

          errorMessage:
            null,

          createdAtUtc:
            new Date(
              "2026-08-16T00:00:00.000Z",
            ),

          completedAtUtc:
            new Date(
              "2026-08-16T00:00:01.000Z",
            ),
        };


        const app =
          await buildAuditApp(
            async (
              limit,
            ) => {

              limits.push(
                limit,
              );


              return [
                item,
              ];
            },
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/recovery-coordination?limit=10",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(limits)
          .toEqual([
            10,
          ]);


        expect(response.json())
          .toMatchObject({
            count:
              1,

            items: [
              {
                publicId:
                  "audit-1",

                resultKind:
                  "superseded",

                attemptedGeneration:
                  7,

                observedGeneration:
                  8,
              },
            ],
          });
      },
    );


    it(
      "uses limit 50 by default",
      async () => {

        const limits:
          number[] =
          [];


        const app =
          await buildAuditApp(
            async (
              limit,
            ) => {

              limits.push(
                limit,
              );

              return [];
            },
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/recovery-coordination",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(limits)
          .toEqual([
            50,
          ]);
      },
    );


    it(
      "rejects invalid limits before repository access",
      async () => {

        let calls =
          0;


        const app =
          await buildAuditApp(
            async () => {

              calls +=
                1;

              return [];
            },
          );


        for (const limit of [
          "0",
          "101",
          "abc",
          "1.5",
        ]) {

          const response =
            await app.inject({
              method:
                "GET",

              url:
                `/operations/scheduler/recovery-coordination?limit=${limit}`,
            });


          expect(response.statusCode)
            .toBe(
              400,
            );
        }


        expect(calls)
          .toBe(
            0,
          );
      },
    );


    it(
      "maps repository failure to generic HTTP 500",
      async () => {

        const app =
          await buildAuditApp(
            async () => {

              throw new Error(
                "database detail",
              );
            },
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/recovery-coordination",
          });


        expect(response.statusCode)
          .toBe(
            500,
          );


        expect(response.json())
          .toEqual({
            error:
              "scheduler_recovery_coordination_audit_error",

            message:
              "Unable to read scheduler recovery coordination audit.",
          });
      },
    );
  },
);
