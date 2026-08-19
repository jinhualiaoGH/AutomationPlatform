import Fastify from "fastify";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createSchedulerControlAdmissionDurableHistoryRoutes,
} from "../src/routes/scheduler_control_admission_durable_history.js";

import type {
  SchedulerControlAdmissionDurableHistorySnapshot,
} from "../src/recovery/scheduler_control_admission_durable_history_service.js";


class FakeService {

  public readonly limits:
    Array<
      number |
      undefined
    > =
    [];


  public failure:
    unknown =
    null;


  public snapshot:
    SchedulerControlAdmissionDurableHistorySnapshot =
    {
      total:
        0,

      returned:
        0,

      limit:
        256,

      events:
        [],
    };


  public async getSnapshot(
    limit?:
      number,
  ):
    Promise<SchedulerControlAdmissionDurableHistorySnapshot> {

    this.limits.push(
      limit,
    );


    if (this.failure !== null) {
      throw this.failure;
    }


    return this.snapshot;
  }
}


async function buildApp(
  service:
    FakeService,
) {

  const app =
    Fastify({
      logger:
        false,
    });


  await app.register(
    createSchedulerControlAdmissionDurableHistoryRoutes(
      service as never,
    ),
  );


  return app;
}


describe(
  "scheduler control admission durable history routes",
  () => {

    it(
      "returns durable history with the service default limit",
      async () => {

        const service =
          new FakeService();

        service.snapshot = {
          total:
            2,

          returned:
            2,

          limit:
            256,

          events:
            [],
        };


        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );

        expect(service.limits)
          .toEqual([
            undefined,
          ]);

        expect(response.json())
          .toEqual(
            service.snapshot,
          );


        await app.close();
      },
    );


    it(
      "forwards an explicit bounded limit",
      async () => {

        const service =
          new FakeService();

        service.snapshot = {
          total:
            10,

          returned:
            3,

          limit:
            3,

          events:
            [],
        };


        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=3",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );

        expect(service.limits)
          .toEqual([
            3,
          ]);


        await app.close();
      },
    );


    it(
      "accepts a limit of one",
      async () => {

        const service =
          new FakeService();

        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=1",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );

        expect(service.limits)
          .toEqual([
            1,
          ]);


        await app.close();
      },
    );


    it(
      "rejects zero limit as HTTP 400",
      async () => {

        const service =
          new FakeService();

        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=0",
          });


        expect(response.statusCode)
          .toBe(
            400,
          );

        expect(response.json())
          .toMatchObject({
            error:
              "invalid_durable_history_limit",
          });

        expect(service.limits)
          .toEqual(
            [],
          );


        await app.close();
      },
    );


    it(
      "rejects negative limit as HTTP 400",
      async () => {

        const service =
          new FakeService();

        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=-1",
          });


        expect(response.statusCode)
          .toBe(
            400,
          );

        expect(service.limits)
          .toEqual(
            [],
          );


        await app.close();
      },
    );


    it(
      "rejects decimal limit as HTTP 400",
      async () => {

        const service =
          new FakeService();

        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=1.5",
          });


        expect(response.statusCode)
          .toBe(
            400,
          );

        expect(service.limits)
          .toEqual(
            [],
          );


        await app.close();
      },
    );


    it(
      "rejects non-numeric limit as HTTP 400",
      async () => {

        const service =
          new FakeService();

        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=abc",
          });


        expect(response.statusCode)
          .toBe(
            400,
          );

        expect(service.limits)
          .toEqual(
            [],
          );


        await app.close();
      },
    );


    it(
      "returns HTTP 503 when durable history storage is unavailable",
      async () => {

        const service =
          new FakeService();

        service.failure =
          new Error(
            "database unavailable",
          );


        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable",
          });


        expect(response.statusCode)
          .toBe(
            503,
          );

        expect(response.json())
          .toEqual({
            error:
              "durable_history_unavailable",

            message:
              "Durable scheduler control admission history is unavailable.",
          });


        await app.close();
      },
    );


    it(
      "does not confuse durable storage failure with empty history",
      async () => {

        const service =
          new FakeService();

        service.failure =
          new Error(
            "SQL Server unavailable",
          );


        const app =
          await buildApp(
            service,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=10",
          });


        expect(response.statusCode)
          .not.toBe(
            200,
          );

        expect(response.json())
          .not.toMatchObject({
            total:
              0,

            returned:
              0,

            events:
              [],
          });


        await app.close();
      },
    );
  },
);

describe(
  "A22 durable-history HTTP cursor pagination",
  () => {

    it(
      "forwards limit and beforeSequence through the structured service query",
      async () => {

        const received:
          unknown[] =
          [];


        const service = {
          async getSnapshot(
            input?: unknown,
          ) {

            received.push(
              input,
            );


            return {
              total:
                4,

              returned:
                2,

              limit:
                2,

              events:
                [],

              hasMore:
                true,

              nextBeforeSequence:
                3,
            };
          },
        };


        const app =
          await buildApp(
            service as never,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=2&beforeSequence=5",
          });


        expect(
          response.statusCode,
        ).toBe(
          200,
        );


        expect(received)
          .toEqual([
            {
              limit:
                2,

              beforeSequence:
                5,
            },
          ]);


        expect(
          response.json(),
        ).toMatchObject({
          limit:
            2,

          hasMore:
            true,

          nextBeforeSequence:
            3,
        });


        await app.close();
      },
    );


    it(
      "supports beforeSequence without an explicit limit",
      async () => {

        const received:
          unknown[] =
          [];


        const service = {
          async getSnapshot(
            input?: unknown,
          ) {

            received.push(
              input,
            );


            return {
              total:
                3,

              returned:
                3,

              limit:
                256,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const app =
          await buildApp(
            service as never,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?beforeSequence=5",
          });


        expect(
          response.statusCode,
        ).toBe(
          200,
        );


        expect(received)
          .toEqual([
            {
              beforeSequence:
                5,
            },
          ]);


        await app.close();
      },
    );


    it.each([
      "0",
      "-1",
      "1.5",
      "abc",
      "9007199254740992",
    ])(
      "rejects invalid beforeSequence=%s before calling the service",
      async (
        beforeSequence,
      ) => {

        let called =
          false;


        const service = {
          async getSnapshot() {

            called =
              true;

            throw new Error(
              "service must not be called",
            );
          },
        };


        const app =
          await buildApp(
            service as never,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?beforeSequence=" +
              encodeURIComponent(
                beforeSequence,
              ),
          });


        expect(
          response.statusCode,
        ).toBe(
          400,
        );


        expect(
          response.json(),
        ).toMatchObject({
          error:
            "invalid_durable_history_before_sequence",
        });


        expect(called)
          .toBe(
            false,
          );


        await app.close();
      },
    );
  },
);

describe(
  "A23.2C1 durable-history HTTP command filter",
  () => {

    it(
      "forwards canonical command with limit and cursor",
      async () => {

        const received:
          unknown[] =
          [];

        const service = {

          async getSnapshot(
            input?:
              unknown,
          ) {

            received.push(
              input,
            );

            return {
              total:
                1,

              returned:
                1,

              limit:
                2,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };

        const app =
          await buildApp(
            service as never,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?limit=2&beforeSequence=5&command=restart",
          });

        expect(
          response.statusCode,
        ).toBe(
          200,
        );

        expect(received)
          .toEqual([
            {
              limit:
                2,

              beforeSequence:
                5,

              command:
                "restart",
            },
          ]);

        await app.close();
      },
    );


    it.each([
      "start",
      "stop",
      "restart",
    ])(
      "accepts canonical command=%s",
      async (
        command,
      ) => {

        const received:
          unknown[] =
          [];

        const service = {

          async getSnapshot(
            input?:
              unknown,
          ) {

            received.push(
              input,
            );

            return {
              total:
                0,

              returned:
                0,

              limit:
                256,

              events:
                [],
            };
          },
        };

        const app =
          await buildApp(
            service as never,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?command=" +
              encodeURIComponent(
                command,
              ),
          });

        expect(
          response.statusCode,
        ).toBe(
          200,
        );

        expect(received)
          .toEqual([
            {
              command,
            },
          ]);

        await app.close();
      },
    );


    it.each([
      "",
      "START",
      "pause",
      " start ",
      "restart-now",
    ])(
      "rejects invalid command=%j before calling the service",
      async (
        command,
      ) => {

        let called =
          false;

        const service = {

          async getSnapshot() {

            called =
              true;

            throw new Error(
              "service must not be called",
            );
          },
        };

        const app =
          await buildApp(
            service as never,
          );

        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable?command=" +
              encodeURIComponent(
                command,
              ),
          });

        expect(
          response.statusCode,
        ).toBe(
          400,
        );

        expect(
          response.json(),
        ).toMatchObject({
          error:
            "invalid_durable_history_command",
        });

        expect(called)
          .toBe(
            false,
          );

        await app.close();
      },
    );
  },
);

describe(
  "A24.2F3 HTTP temporal query contract",
  () => {

    async function createTemporalTestApp(
      getSnapshot:
        (
          input?:
            unknown,
        ) =>
          Promise<{
            readonly total:
              number;

            readonly returned:
              number;

            readonly limit:
              number;

            readonly events:
              readonly unknown[];

            readonly hasMore:
              boolean;

            readonly nextBeforeSequence:
              number |
              null;
          }>,
    ) {

      const {
        default:
          fastify,
      } =
        await import(
          "fastify"
        );


      const service = {
        getSnapshot,
      } as unknown as
        Parameters<
          typeof createSchedulerControlAdmissionDurableHistoryRoutes
        >[0];


      const app =
        fastify();


      await app.register(
        createSchedulerControlAdmissionDurableHistoryRoutes(
          service,
        ),
      );


      return app;
    }


    function emptySnapshot() {

      return {
        total:
          0,

        returned:
          0,

        limit:
          256,

        events:
          [],

        hasMore:
          false,

        nextBeforeSequence:
          null,
      };
    }


    it(
      "forwards canonical UTC bounds with limit cursor and command as Date values",
      async () => {

        const calls:
          unknown[] =
          [];


        const app =
          await createTemporalTestApp(
            async (
              input,
            ) => {

              calls.push(
                input,
              );

              return emptySnapshot();
            },
          );


        const lower =
          "2026-08-18T13:01:00.000Z";

        const upper =
          "2026-08-18T14:00:00.000Z";


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable" +
              "?limit=2" +
              "&beforeSequence=5" +
              "&command=restart" +
              "&observedAtOrAfter=" +
              encodeURIComponent(
                lower,
              ) +
              "&observedBefore=" +
              encodeURIComponent(
                upper,
              ),
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(calls)
          .toHaveLength(
            1,
          );


        expect(calls[0])
          .toEqual({
            limit:
              2,

            beforeSequence:
              5,

            command:
              "restart",

            observedAtOrAfter:
              new Date(
                lower,
              ),

            observedBefore:
              new Date(
                upper,
              ),
          });


        await app.close();
      },
    );


    it(
      "supports an observedAtOrAfter lower bound without an upper bound",
      async () => {

        const calls:
          unknown[] =
          [];


        const app =
          await createTemporalTestApp(
            async (
              input,
            ) => {

              calls.push(
                input,
              );

              return emptySnapshot();
            },
          );


        const lower =
          "2026-08-18T13:01:00.000Z";


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable" +
              "?observedAtOrAfter=" +
              encodeURIComponent(
                lower,
              ),
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(calls)
          .toEqual([
            {
              observedAtOrAfter:
                new Date(
                  lower,
                ),
            },
          ]);


        await app.close();
      },
    );


    it(
      "supports an observedBefore upper bound without a lower bound",
      async () => {

        const calls:
          unknown[] =
          [];


        const app =
          await createTemporalTestApp(
            async (
              input,
            ) => {

              calls.push(
                input,
              );

              return emptySnapshot();
            },
          );


        const upper =
          "2026-08-18T14:00:00.000Z";


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable" +
              "?observedBefore=" +
              encodeURIComponent(
                upper,
              ),
          });


        expect(response.statusCode)
          .toBe(
            200,
          );


        expect(calls)
          .toEqual([
            {
              observedBefore:
                new Date(
                  upper,
                ),
            },
          ]);


        await app.close();
      },
    );


    it(
      "rejects malformed canonical UTC input before calling the service",
      async () => {

        let called =
          false;


        const app =
          await createTemporalTestApp(
            async () => {

              called =
                true;

              return emptySnapshot();
            },
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history/durable" +
              "?observedAtOrAfter=" +
              encodeURIComponent(
                "2026-08-18T13:01:00Z",
              ),
          });


        expect(response.statusCode)
          .toBe(
            400,
          );


        expect(
          response.json(),
        ).toMatchObject({
          error:
            "invalid_durable_history_observed_at_or_after",
        });


        expect(called)
          .toBe(
            false,
          );


        await app.close();
      },
    );


    it(
      "rejects timezone-less and offset timestamps before calling the service",
      async () => {

        for (
          const raw of [
            "2026-08-18T13:01:00.000",
            "2026-08-18T13:01:00.000+00:00",
          ]
        ) {

          let called =
            false;


          const app =
            await createTemporalTestApp(
              async () => {

                called =
                  true;

                return emptySnapshot();
              },
            );


          const response =
            await app.inject({
              method:
                "GET",

              url:
                "/operations/scheduler/control-admission/history/durable" +
                "?observedAtOrAfter=" +
                encodeURIComponent(
                  raw,
                ),
            });


          expect(response.statusCode)
            .toBe(
              400,
            );


          expect(
            response.json(),
          ).toMatchObject({
            error:
              "invalid_durable_history_observed_at_or_after",
          });


          expect(called)
            .toBe(
              false,
            );


          await app.close();
        }
      },
    );


    it(
      "rejects zero-width and reversed temporal windows before calling the service",
      async () => {

        for (
          const window of [
            [
              "2026-08-18T13:02:00.000Z",
              "2026-08-18T13:02:00.000Z",
            ],

            [
              "2026-08-18T13:03:00.000Z",
              "2026-08-18T13:02:00.000Z",
            ],
          ]
        ) {

          let called =
            false;


          const app =
            await createTemporalTestApp(
              async () => {

                called =
                  true;

                return emptySnapshot();
              },
            );


          const response =
            await app.inject({
              method:
                "GET",

              url:
                "/operations/scheduler/control-admission/history/durable" +
                "?observedAtOrAfter=" +
                encodeURIComponent(
                  window[0]!,
                ) +
                "&observedBefore=" +
                encodeURIComponent(
                  window[1]!,
                ),
            });


          expect(response.statusCode)
            .toBe(
              400,
            );


          expect(
            response.json(),
          ).toMatchObject({
            error:
              "invalid_durable_history_temporal_window",
          });


          expect(called)
            .toBe(
              false,
            );


          await app.close();
        }
      },
    );
  },
);
