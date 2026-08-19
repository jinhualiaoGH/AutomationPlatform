import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionDurableHistoryTraversalService,
} from "../src/recovery/scheduler_control_admission_durable_history_traversal_service.js";


describe(
  "A25 durable-history traversal service",
  () => {

    function admittedEvent(
      sequence:
        number,
    ) {

      return {
        sequence,

        observedAtUtc:
          new Date(
            `2026-08-18T13:${String(
              sequence,
            ).padStart(
              2,
              "0",
            )}:00.000Z`,
          ),

        disposition:
          "admitted" as const,

        command:
          "restart" as const,

        reason:
          null,
      };
    }


    it(
      "returns one page when the snapshot is already exhausted",
      async () => {

        const calls:
          unknown[] =
          [];


        const service = {

          async getSnapshot(
            query:
              unknown,
          ) {

            calls.push(
              query,
            );

            return {
              total:
                2,

              returned:
                2,

              limit:
                10,

              events:
                [
                  admittedEvent(
                    1,
                  ),
                  admittedEvent(
                    2,
                  ),
                ],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        const result =
          await traversal.traverse({
            limit:
              10,
          });


        expect(calls)
          .toEqual([
            {
              limit:
                10,
            },
          ]);


        expect(
          result.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);


        expect(result.pages)
          .toBe(
            1,
          );

        expect(result.returned)
          .toBe(
            2,
          );

        expect(result.exhausted)
          .toBe(
            true,
          );

        expect(result.nextBeforeSequence)
          .toBe(
            null,
          );
      },
    );


    it(
      "continues using nextBeforeSequence until history is exhausted",
      async () => {

        const calls:
          unknown[] =
          [];


        const service = {

          async getSnapshot(
            query:
              {
                readonly beforeSequence?:
                  number;
              },
          ) {

            calls.push({
              ...query,
            });


            if (
              query.beforeSequence ===
                undefined
            ) {

              return {
                total:
                  5,

                returned:
                  2,

                limit:
                  2,

                events:
                  [
                    admittedEvent(
                      4,
                    ),
                    admittedEvent(
                      5,
                    ),
                  ],

                hasMore:
                  true,

                nextBeforeSequence:
                  4,
              };
            }


            if (
              query.beforeSequence ===
                4
            ) {

              return {
                total:
                  3,

                returned:
                  2,

                limit:
                  2,

                events:
                  [
                    admittedEvent(
                      2,
                    ),
                    admittedEvent(
                      3,
                    ),
                  ],

                hasMore:
                  true,

                nextBeforeSequence:
                  2,
              };
            }


            return {
              total:
                1,

              returned:
                1,

              limit:
                2,

              events:
                [
                  admittedEvent(
                    1,
                  ),
                ],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        const result =
          await traversal.traverse({
            limit:
              2,
          });


        expect(calls)
          .toEqual([
            {
              limit:
                2,
            },

            {
              limit:
                2,

              beforeSequence:
                4,
            },

            {
              limit:
                2,

              beforeSequence:
                2,
            },
          ]);


        expect(
          result.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          4,
          5,
          2,
          3,
          1,
        ]);


        expect(result.pages)
          .toBe(
            3,
          );

        expect(result.returned)
          .toBe(
            5,
          );

        expect(result.exhausted)
          .toBe(
            true,
          );
      },
    );


    it(
      "preserves command and temporal filters across every continuation",
      async () => {

        const calls:
          Array<Record<string, unknown>> =
          [];


        const lower =
          new Date(
            "2026-08-18T13:00:00.000Z",
          );

        const upper =
          new Date(
            "2026-08-18T14:00:00.000Z",
          );


        const service = {

          async getSnapshot(
            query:
              Record<string, unknown>,
          ) {

            calls.push(
              query,
            );


            if (
              query.beforeSequence ===
                undefined
            ) {

              return {
                total:
                  2,

                returned:
                  1,

                limit:
                  1,

                events:
                  [
                    admittedEvent(
                      2,
                    ),
                  ],

                hasMore:
                  true,

                nextBeforeSequence:
                  2,
              };
            }


            return {
              total:
                1,

              returned:
                1,

              limit:
                1,

              events:
                [
                  admittedEvent(
                    1,
                  ),
                ],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        await traversal.traverse({
          limit:
            1,

          command:
            "restart",

          observedAtOrAfter:
            lower,

          observedBefore:
            upper,
        });


        expect(calls)
          .toHaveLength(
            2,
          );


        for (
          const call of calls
        ) {

          expect(call.limit)
            .toBe(
              1,
            );

          expect(call.command)
            .toBe(
              "restart",
            );

          expect(call.observedAtOrAfter)
            .toEqual(
              lower,
            );

          expect(call.observedBefore)
            .toEqual(
              upper,
            );
        }


        expect(
          calls[0]!.beforeSequence,
        ).toBeUndefined();


        expect(
          calls[1]!.beforeSequence,
        ).toBe(
          2,
        );
      },
    );


    it(
      "respects an initial beforeSequence cursor",
      async () => {

        const calls:
          unknown[] =
          [];


        const service = {

          async getSnapshot(
            query:
              unknown,
          ) {

            calls.push(
              query,
            );

            return {
              total:
                0,

              returned:
                0,

              limit:
                10,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        await traversal.traverse({
          limit:
            10,

          beforeSequence:
            500,
        });


        expect(calls)
          .toEqual([
            {
              limit:
                10,

              beforeSequence:
                500,
            },
          ]);
      },
    );


    it(
      "propagates snapshot failures without swallowing them",
      async () => {

        const service = {

          async getSnapshot() {

            throw new Error(
              "durable read failed",
            );
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        await expect(
          traversal.traverse(),
        ).rejects.toThrow(
          "durable read failed",
        );
      },
    );

    it(
      "rejects invalid nextBeforeSequence values",
      async () => {

        for (
          const invalidNextBeforeSequence of [
            0,
            -1,
            1.5,
            Number.MAX_SAFE_INTEGER + 1,
          ]
        ) {

          let calls =
            0;


          const service = {

            async getSnapshot() {

              calls +=
                1;


              return {
                total:
                  1,

                returned:
                  0,

                limit:
                  10,

                events:
                  [],

                hasMore:
                  true,

                nextBeforeSequence:
                  invalidNextBeforeSequence,
              };
            },
          };


          const traversal =
            new SchedulerControlAdmissionDurableHistoryTraversalService(
              service as never,
            );


          await expect(
            traversal.traverse({
              limit:
                10,
            }),
          ).rejects.toThrow(
            "Durable admission history nextBeforeSequence must be a positive safe integer.",
          );


          expect(calls)
            .toBe(
              1,
            );
        }
      },
    );


    it(
      "rejects a repeated continuation cursor",
      async () => {

        const calls:
          Array<{
            readonly beforeSequence?:
              number;
          }> =
          [];


        const service = {

          async getSnapshot(
            query:
              {
                readonly beforeSequence?:
                  number;
              },
          ) {

            calls.push({
              ...query,
            });


            if (
              query.beforeSequence ===
                undefined
            ) {

              return {
                total:
                  2,

                returned:
                  0,

                limit:
                  1,

                events:
                  [],

                hasMore:
                  true,

                nextBeforeSequence:
                  900,
              };
            }


            return {
              total:
                1,

              returned:
                0,

              limit:
                1,

              events:
                [],

              hasMore:
                true,

              nextBeforeSequence:
                900,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        await expect(
          traversal.traverse({
            limit:
              1,
          }),
        ).rejects.toThrow(
          "Durable admission history continuation must make strict backward progress.",
        );


        expect(calls)
          .toEqual([
            {
              limit:
                1,
            },

            {
              limit:
                1,

              beforeSequence:
                900,
            },
          ]);
      },
    );


    it(
      "rejects a forward-moving continuation cursor",
      async () => {

        const calls:
          Array<{
            readonly beforeSequence?:
              number;
          }> =
          [];


        const service = {

          async getSnapshot(
            query:
              {
                readonly beforeSequence?:
                  number;
              },
          ) {

            calls.push({
              ...query,
            });


            if (
              query.beforeSequence ===
                undefined
            ) {

              return {
                total:
                  2,

                returned:
                  0,

                limit:
                  1,

                events:
                  [],

                hasMore:
                  true,

                nextBeforeSequence:
                  900,
              };
            }


            return {
              total:
                1,

              returned:
                0,

              limit:
                1,

              events:
                [],

              hasMore:
                true,

              nextBeforeSequence:
                950,
            };
          },
        };


        const traversal =
          new SchedulerControlAdmissionDurableHistoryTraversalService(
            service as never,
          );


        await expect(
          traversal.traverse({
            limit:
              1,
          }),
        ).rejects.toThrow(
          "Durable admission history continuation must make strict backward progress.",
        );


        expect(calls)
          .toEqual([
            {
              limit:
                1,
            },

            {
              limit:
                1,

              beforeSequence:
                900,
            },
          ]);
      },
    );
  },
);
