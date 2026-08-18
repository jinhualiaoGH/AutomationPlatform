import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionDurableHistoryService,
} from "../src/recovery/scheduler_control_admission_durable_history_service.js";

import type {
  SchedulerControlAdmissionEventRepository,
  StoredSchedulerControlAdmissionEvent,
} from "../src/recovery/scheduler_control_admission_event_repository.js";


function event(
  sequence:
    number,
): StoredSchedulerControlAdmissionEvent {

  return {
    sequence,

    observedAtUtc:
      new Date(
        `2026-08-18T15:${String(sequence).padStart(2, "0")}:00.000Z`,
      ),

    disposition:
      sequence % 2 === 0
        ? "denied"
        : "admitted",

    command:
      sequence % 3 === 0
        ? "restart"
        : sequence % 3 === 1
          ? "start"
          : "stop",

    reason:
      sequence % 2 === 0
        ? "scheduler_standby"
        : null,
  };
}


class FakeRepository
implements SchedulerControlAdmissionEventRepository {

  public readonly events:
    StoredSchedulerControlAdmissionEvent[] =
    [];


  public listCalls =
    0;


  public async append(
    value:
      StoredSchedulerControlAdmissionEvent,
  ): Promise<void> {

    this.events.push(
      value,
    );
  }


  public async list():
    Promise<
      readonly StoredSchedulerControlAdmissionEvent[]
    > {

    this.listCalls +=
      1;


    return this.events;
  }
}


describe(
  "SchedulerControlAdmissionDurableHistoryService",
  () => {

    it(
      "returns an empty restart-safe snapshot",
      async () => {

        const repository =
          new FakeRepository();

        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        expect(
          await service.getSnapshot(),
        ).toEqual({
          total:
            0,

          returned:
            0,

          limit:
            256,

          events:
            [],
        });
      },
    );


    it(
      "returns all durable events when below the limit",
      async () => {

        const repository =
          new FakeRepository();

        repository.events.push(
          event(1),
          event(2),
          event(3),
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot();


        expect(snapshot.total)
          .toBe(
            3,
          );

        expect(snapshot.returned)
          .toBe(
            3,
          );

        expect(
          snapshot.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          2,
          3,
        ]);
      },
    );


    it(
      "returns only the newest bounded durable events",
      async () => {

        const repository =
          new FakeRepository();

        repository.events.push(
          event(1),
          event(2),
          event(3),
          event(4),
          event(5),
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        const snapshot =
          await service.getSnapshot(
            3,
          );


        expect(snapshot.total)
          .toBe(
            5,
          );

        expect(snapshot.returned)
          .toBe(
            3,
          );

        expect(snapshot.limit)
          .toBe(
            3,
          );

        expect(
          snapshot.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          3,
          4,
          5,
        ]);
      },
    );


    it(
      "preserves chronological sequence order inside the bounded result",
      async () => {

        const repository =
          new FakeRepository();

        repository.events.push(
          event(7),
          event(8),
          event(9),
          event(10),
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        expect(
          (
            await service.getSnapshot(
              2,
            )
          ).events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          9,
          10,
        ]);
      },
    );


    it(
      "reads the repository once per snapshot",
      async () => {

        const repository =
          new FakeRepository();

        repository.events.push(
          event(1),
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        await service.getSnapshot();


        expect(repository.listCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "returns defensive event objects and dates",
      async () => {

        const repository =
          new FakeRepository();

        const source =
          event(1);

        repository.events.push(
          source,
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        const first =
          await service.getSnapshot();

        const second =
          await service.getSnapshot();


        expect(first.events[0])
          .not.toBe(
            source,
          );

        expect(first.events[0])
          .not.toBe(
            second.events[0],
          );

        expect(
          first.events[0]
            ?.observedAtUtc,
        ).not.toBe(
          source.observedAtUtc,
        );

        expect(
          first.events[0]
            ?.observedAtUtc,
        ).not.toBe(
          second.events[0]
            ?.observedAtUtc,
        );
      },
    );


    it(
      "does not mutate repository-owned events",
      async () => {

        const repository =
          new FakeRepository();

        const source =
          event(1);

        repository.events.push(
          source,
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        const snapshot =
          await service.getSnapshot();


        snapshot.events[0]
          ?.observedAtUtc
          .setUTCFullYear(
            2000,
          );


        expect(
          source.observedAtUtc.toISOString(),
        ).toBe(
          "2026-08-18T15:01:00.000Z",
        );
      },
    );


    it(
      "accepts an explicit limit of one",
      async () => {

        const repository =
          new FakeRepository();

        repository.events.push(
          event(1),
          event(2),
        );


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        const snapshot =
          await service.getSnapshot(
            1,
          );


        expect(
          snapshot.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          2,
        ]);
      },
    );


    it(
      "rejects zero snapshot limit",
      async () => {

        const repository =
          new FakeRepository();

        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        await expect(
          service.getSnapshot(
            0,
          ),
        ).rejects.toThrow(
          "Durable admission history limit must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects non-integer snapshot limit",
      async () => {

        const repository =
          new FakeRepository();

        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        await expect(
          service.getSnapshot(
            1.5,
          ),
        ).rejects.toThrow(
          "Durable admission history limit must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects invalid constructor default limit",
      () => {

        const repository =
          new FakeRepository();


        expect(
          () =>
            new SchedulerControlAdmissionDurableHistoryService(
              repository,
              0,
            ),
        ).toThrow(
          "Durable admission history limit must be a positive safe integer.",
        );
      },
    );


    it(
      "propagates repository read failures",
      async () => {

        const failure =
          new Error(
            "database unavailable",
          );


        const repository:
          SchedulerControlAdmissionEventRepository =
          {
            async append() {
              return;
            },

            async list() {
              throw failure;
            },
          };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
          );


        await expect(
          service.getSnapshot(),
        ).rejects.toBe(
          failure,
        );
      },
    );
  },
);

describe(
  "A22 bounded durable-history snapshot",
  () => {

    it(
      "prefers listPage when the repository exposes bounded capability",
      async () => {

        const queries:
          unknown[] =
          [];


        let fullListCalled =
          false;


        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {

            fullListCalled =
              true;

            throw new Error(
              "full list should not be called",
            );
          },


          async listPage(
            query:
              {
                readonly limit:
                  number;

                readonly beforeSequence?:
                  number;
              },
          ) {

            queries.push(
              query,
            );


            return {
              total:
                7,

              events:
                [],

              hasMore:
                true,

              nextBeforeSequence:
                null,
            };
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot(
            25,
          );


        expect(queries)
          .toEqual([
            {
              limit:
                25,
            },
          ]);


        expect(fullListCalled)
          .toBe(
            false,
          );


        expect(snapshot)
          .toEqual({
            total:
              7,

            returned:
              0,

            limit:
              25,

            events:
              [],
          });
      },
    );


    it(
      "uses the frozen default limit on the bounded path",
      async () => {

        const queries:
          unknown[] =
          [];


        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {
            throw new Error(
              "full list should not be called",
            );
          },


          async listPage(
            query:
              {
                readonly limit:
                  number;

                readonly beforeSequence?:
                  number;
              },
          ) {

            queries.push(
              query,
            );


            return {
              total:
                0,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot();


        expect(queries)
          .toEqual([
            {
              limit:
                256,
            },
          ]);


        expect(snapshot.limit)
          .toBe(
            256,
          );
      },
    );


    it(
      "preserves frozen repositories that do not yet implement listPage",
      async () => {

        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {

            return [
              {
                sequence:
                  1,

                observedAtUtc:
                  new Date(
                    "2026-08-18T21:01:00.000Z",
                  ),

                disposition:
                  "admitted" as const,

                command:
                  "start" as const,

                reason:
                  null,
              },

              {
                sequence:
                  2,

                observedAtUtc:
                  new Date(
                    "2026-08-18T21:02:00.000Z",
                  ),

                disposition:
                  "admitted" as const,

                command:
                  "start" as const,

                reason:
                  null,
              },
            ];
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot(
            1,
          );


        expect(snapshot.total)
          .toBe(
            2,
          );


        expect(snapshot.returned)
          .toBe(
            1,
          );


        expect(snapshot.limit)
          .toBe(
            1,
          );


        expect(
          snapshot.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          2,
        ]);
      },
    );
  },
);

describe(
  "A22 durable-history cursor service",
  () => {

    it(
      "forwards beforeSequence to the bounded repository",
      async () => {

        const queries:
          unknown[] =
          [];


        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {
            throw new Error(
              "full list should not be called",
            );
          },


          async listPage(
            query:
              {
                readonly limit:
                  number;

                readonly beforeSequence?:
                  number;
              },
          ) {

            queries.push(
              query,
            );


            return {
              total:
                4999,

              events:
                [],

              hasMore:
                true,

              nextBeforeSequence:
                4900,
            };
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot({
            limit:
              100,

            beforeSequence:
              5000,
          });


        expect(queries)
          .toEqual([
            {
              limit:
                100,

              beforeSequence:
                5000,
            },
          ]);


        expect(snapshot.total)
          .toBe(
            4999,
          );


        expect(snapshot.hasMore)
          .toBe(
            true,
          );


        expect(snapshot.nextBeforeSequence)
          .toBe(
            4900,
          );
      },
    );


    it(
      "returns pagination metadata for a structured newest-page query",
      async () => {

        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {
            throw new Error(
              "full list should not be called",
            );
          },


          async listPage() {

            return {
              total:
                17,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot({
            limit:
              25,
          });


        expect(snapshot)
          .toMatchObject({
            total:
              17,

            returned:
              0,

            limit:
              25,

            hasMore:
              false,

            nextBeforeSequence:
              null,
          });
      },
    );


    it(
      "preserves the frozen numeric invocation shape",
      async () => {

        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {
            throw new Error(
              "full list should not be called",
            );
          },


          async listPage() {

            return {
              total:
                0,

              events:
                [],

              hasMore:
                false,

              nextBeforeSequence:
                null,
            };
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot(
            25,
          );


        expect(snapshot)
          .toEqual({
            total:
              0,

            returned:
              0,

            limit:
              25,

            events:
              [],
          });
      },
    );


    it(
      "rejects an invalid beforeSequence",
      async () => {

        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {
            return [];
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        await expect(
          service.getSnapshot({
            limit:
              25,

            beforeSequence:
              0,
          }),
        ).rejects.toThrow(
          "Durable admission history beforeSequence must be a positive safe integer.",
        );
      },
    );


    it(
      "supports cursor semantics through the legacy list fallback",
      async () => {

        const repository = {

          async append() {
            throw new Error(
              "append should not be called",
            );
          },


          async list() {

            return [
              {
                sequence:
                  1,

                observedAtUtc:
                  new Date(
                    "2026-08-18T13:01:00.000Z",
                  ),

                disposition:
                  "admitted" as const,

                command:
                  "start" as const,

                reason:
                  null,
              },

              {
                sequence:
                  2,

                observedAtUtc:
                  new Date(
                    "2026-08-18T13:02:00.000Z",
                  ),

                disposition:
                  "admitted" as const,

                command:
                  "start" as const,

                reason:
                  null,
              },

              {
                sequence:
                  3,

                observedAtUtc:
                  new Date(
                    "2026-08-18T13:03:00.000Z",
                  ),

                disposition:
                  "admitted" as const,

                command:
                  "start" as const,

                reason:
                  null,
              },
            ];
          },
        };


        const service =
          new SchedulerControlAdmissionDurableHistoryService(
            repository,
            256,
          );


        const snapshot =
          await service.getSnapshot({
            limit:
              1,

            beforeSequence:
              3,
          });


        expect(snapshot.total)
          .toBe(
            2,
          );


        expect(
          snapshot.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          2,
        ]);


        expect(snapshot.hasMore)
          .toBe(
            true,
          );


        expect(snapshot.nextBeforeSequence)
          .toBe(
            2,
          );
      },
    );
  },
);
