import {
  describe,
  expect,
  it,
} from "vitest";

import {
  InMemorySchedulerControlAdmissionEventRepository,
} from "../src/recovery/scheduler_control_admission_event_repository.js";

import type {
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
        `2026-08-18T12:${String(sequence).padStart(2, "0")}:00.000Z`,
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


async function repositoryWith(
  ...sequences:
    number[]
) {

  const repository =
    new InMemorySchedulerControlAdmissionEventRepository();


  for (const sequence of sequences) {

    await repository.append(
      event(
        sequence,
      ),
    );
  }


  return repository;
}


describe(
  "bounded scheduler control admission event repository",
  () => {

    it(
      "returns an empty page",
      async () => {

        const repository =
          await repositoryWith();


        await expect(
          repository.listPage({
            limit:
              3,
          }),
        ).resolves.toEqual({
          total:
            0,

          events:
            [],

          hasMore:
            false,

          nextBeforeSequence:
            null,
        });
      },
    );


    it(
      "returns the newest bounded events in ascending order",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
            5,
          );


        const page =
          await repository.listPage({
            limit:
              3,
          });


        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          3,
          4,
          5,
        ]);

        expect(page.hasMore)
          .toBe(
            true,
          );

        expect(page.nextBeforeSequence)
          .toBe(
            3,
          );
      },
    );


    it(
      "uses beforeSequence as an exclusive cursor",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
            5,
          );


        const page =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              5,
          });


        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          3,
          4,
        ]);

        expect(page.hasMore)
          .toBe(
            true,
          );

        expect(page.nextBeforeSequence)
          .toBe(
            3,
          );
      },
    );


    it(
      "does not repeat the cursor sequence",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
          );


        const page =
          await repository.listPage({
            limit:
              3,

            beforeSequence:
              4,
          });


        expect(
          page.events.map(
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
      "returns null cursor when no older page exists",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
          );


        const page =
          await repository.listPage({
            limit:
              5,
          });


        expect(page.hasMore)
          .toBe(
            false,
          );

        expect(page.nextBeforeSequence)
          .toBeNull();
      },
    );


    it(
      "supports deterministic backward traversal without overlap",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
            5,
            6,
          );


        const newest =
          await repository.listPage({
            limit:
              2,
          });


        const middle =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              newest.nextBeforeSequence!,
          });


        const oldest =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              middle.nextBeforeSequence!,
          });


        expect(
          newest.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          5,
          6,
        ]);

        expect(
          middle.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          3,
          4,
        ]);

        expect(
          oldest.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);

        expect(oldest.hasMore)
          .toBe(
            false,
          );

        expect(oldest.nextBeforeSequence)
          .toBeNull();
      },
    );


    it(
      "is stable when newer events are appended between pages",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
          );


        const first =
          await repository.listPage({
            limit:
              2,
          });


        await repository.append(
          event(
            5,
          ),
        );


        const second =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              first.nextBeforeSequence!,
          });


        expect(
          first.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          3,
          4,
        ]);

        expect(
          second.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);
      },
    );


    it(
      "returns defensive event and date copies",
      async () => {

        const repository =
          await repositoryWith(
            1,
          );


        const first =
          await repository.listPage({
            limit:
              1,
          });

        const second =
          await repository.listPage({
            limit:
              1,
          });


        expect(first.events[0])
          .not.toBe(
            second.events[0],
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
      "rejects zero page limit",
      async () => {

        const repository =
          await repositoryWith();


        await expect(
          repository.listPage({
            limit:
              0,
          }),
        ).rejects.toThrow(
          "Admission event page limit must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects non-integer page limit",
      async () => {

        const repository =
          await repositoryWith();


        await expect(
          repository.listPage({
            limit:
              1.5,
          }),
        ).rejects.toThrow(
          "Admission event page limit must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects invalid beforeSequence",
      async () => {

        const repository =
          await repositoryWith();


        await expect(
          repository.listPage({
            limit:
              1,

            beforeSequence:
              0,
          }),
        ).rejects.toThrow(
          "Admission event page beforeSequence must be a positive safe integer.",
        );
      },
    );


    it(
      "preserves the frozen A20 list contract",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
          );


        expect(
          (
            await repository.list()
          ).map(
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
  },
);


describe(
  "A22 bounded page total",
  () => {

    it(
      "reports the eligible durable total",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        for (
          const sequence of [
            1,
            2,
            3,
            4,
            5,
          ]
        ) {

          await repository.append({
            sequence,

            observedAtUtc:
              new Date(
                `2026-08-18T17:${String(sequence).padStart(2, "0")}:00.000Z`,
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          });
        }


        const page =
          await repository.listPage({
            limit:
              2,
          });


        expect(page.total)
          .toBe(
            5,
          );
      },
    );


    it(
      "reports cursor-eligible total for bounded traversal",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        for (
          const sequence of [
            1,
            2,
            3,
            4,
            5,
          ]
        ) {

          await repository.append({
            sequence,

            observedAtUtc:
              new Date(
                `2026-08-18T18:${String(sequence).padStart(2, "0")}:00.000Z`,
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          });
        }


        const page =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              5,
          });


        expect(page.total)
          .toBe(
            4,
          );
      },
    );
  },
);

describe(
  "A23.2C1 in-memory command-filter contract",
  () => {

    it(
      "filters eligible events by command before bounded pagination",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
            5,
            6,
            7,
          );

        const page =
          await repository.listPage({
            limit:
              2,

            command:
              "start",
          });

        expect(page.total)
          .toBe(
            3,
          );

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          4,
          7,
        ]);

        expect(page.hasMore)
          .toBe(
            true,
          );

        expect(page.nextBeforeSequence)
          .toBe(
            4,
          );
      },
    );


    it(
      "composes command filtering with the exclusive beforeSequence cursor",
      async () => {

        const repository =
          await repositoryWith(
            1,
            2,
            3,
            4,
            5,
            6,
            7,
          );

        const page =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              7,

            command:
              "start",
          });

        expect(page.total)
          .toBe(
            2,
          );

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          4,
        ]);

        expect(page.hasMore)
          .toBe(
            false,
          );

        expect(page.nextBeforeSequence)
          .toBe(
            null,
          );
      },
    );
  },
);

describe(
  "A24.2C2 in-memory temporal-query contract",
  () => {

    function temporalEvent(
      sequence: number,
      observedAtUtc: string,
      command:
        "start" |
        "stop" |
        "restart" =
          "start",
    ) {
      return {
        sequence,
        observedAtUtc:
          new Date(
            observedAtUtc,
          ),
        disposition:
          "admitted" as const,
        command,
        reason:
          null,
      };
    }


    it(
      "treats observedAtOrAfter as an inclusive lower bound",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        await repository.append(
          temporalEvent(
            1,
            "2026-08-18T10:00:00.000Z",
          ),
        );

        await repository.append(
          temporalEvent(
            2,
            "2026-08-18T11:00:00.000Z",
          ),
        );

        await repository.append(
          temporalEvent(
            3,
            "2026-08-18T12:00:00.000Z",
          ),
        );

        const page =
          await repository.listPage({
            limit:
              10,
            observedAtOrAfter:
              new Date(
                "2026-08-18T11:00:00.000Z",
              ),
          });

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          2,
          3,
        ]);

        expect(page.total)
          .toBe(
            2,
          );
      },
    );


    it(
      "treats observedBefore as an exclusive upper bound",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        await repository.append(
          temporalEvent(
            1,
            "2026-08-18T10:00:00.000Z",
          ),
        );

        await repository.append(
          temporalEvent(
            2,
            "2026-08-18T11:00:00.000Z",
          ),
        );

        await repository.append(
          temporalEvent(
            3,
            "2026-08-18T12:00:00.000Z",
          ),
        );

        const page =
          await repository.listPage({
            limit:
              10,
            observedBefore:
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
          });

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);

        expect(page.total)
          .toBe(
            2,
          );
      },
    );


    it(
      "uses a half-open observedAtUtc window",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        for (
          const value of [
            temporalEvent(
              1,
              "2026-08-18T09:00:00.000Z",
            ),
            temporalEvent(
              2,
              "2026-08-18T10:00:00.000Z",
            ),
            temporalEvent(
              3,
              "2026-08-18T11:00:00.000Z",
            ),
            temporalEvent(
              4,
              "2026-08-18T12:00:00.000Z",
            ),
          ]
        ) {
          await repository.append(
            value,
          );
        }

        const page =
          await repository.listPage({
            limit:
              10,
            observedAtOrAfter:
              new Date(
                "2026-08-18T10:00:00.000Z",
              ),
            observedBefore:
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
          });

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          2,
          3,
        ]);

        expect(page.total)
          .toBe(
            2,
          );
      },
    );


    it(
      "composes temporal filtering with command filtering",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        for (
          const value of [
            temporalEvent(
              1,
              "2026-08-18T10:00:00.000Z",
              "start",
            ),
            temporalEvent(
              2,
              "2026-08-18T10:30:00.000Z",
              "stop",
            ),
            temporalEvent(
              3,
              "2026-08-18T11:00:00.000Z",
              "start",
            ),
            temporalEvent(
              4,
              "2026-08-18T11:30:00.000Z",
              "restart",
            ),
            temporalEvent(
              5,
              "2026-08-18T12:00:00.000Z",
              "start",
            ),
          ]
        ) {
          await repository.append(
            value,
          );
        }

        const page =
          await repository.listPage({
            limit:
              10,
            command:
              "start",
            observedAtOrAfter:
              new Date(
                "2026-08-18T10:00:00.000Z",
              ),
            observedBefore:
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
          });

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          1,
          3,
        ]);

        expect(page.total)
          .toBe(
            2,
          );
      },
    );


    it(
      "composes temporal filtering with cursor and bounded pagination",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        for (
          const value of [
            temporalEvent(
              1,
              "2026-08-18T09:00:00.000Z",
            ),
            temporalEvent(
              2,
              "2026-08-18T10:00:00.000Z",
            ),
            temporalEvent(
              3,
              "2026-08-18T10:30:00.000Z",
            ),
            temporalEvent(
              4,
              "2026-08-18T11:00:00.000Z",
            ),
            temporalEvent(
              5,
              "2026-08-18T11:30:00.000Z",
            ),
            temporalEvent(
              6,
              "2026-08-18T12:00:00.000Z",
            ),
          ]
        ) {
          await repository.append(
            value,
          );
        }

        const page =
          await repository.listPage({
            limit:
              2,
            beforeSequence:
              6,
            observedAtOrAfter:
              new Date(
                "2026-08-18T10:00:00.000Z",
              ),
            observedBefore:
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
          });

        expect(page.total)
          .toBe(
            4,
          );

        expect(
          page.events.map(
            (value) =>
              value.sequence,
          ),
        ).toEqual([
          4,
          5,
        ]);

        expect(page.hasMore)
          .toBe(
            true,
          );

        expect(
          page.nextBeforeSequence,
        ).toBe(
          4,
        );
      },
    );


    it(
      "rejects invalid and non-increasing temporal windows",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        await expect(
          repository.listPage({
            limit:
              10,
            observedAtOrAfter:
              new Date(
                "not-a-date",
              ),
          }),
        ).rejects.toThrow(
          "observedAtOrAfter must be a valid Date",
        );

        await expect(
          repository.listPage({
            limit:
              10,
            observedBefore:
              new Date(
                "not-a-date",
              ),
          }),
        ).rejects.toThrow(
          "observedBefore must be a valid Date",
        );

        await expect(
          repository.listPage({
            limit:
              10,
            observedAtOrAfter:
              new Date(
                "2026-08-18T11:00:00.000Z",
              ),
            observedBefore:
              new Date(
                "2026-08-18T11:00:00.000Z",
              ),
          }),
        ).rejects.toThrow(
          "observedAtOrAfter < observedBefore",
        );

        await expect(
          repository.listPage({
            limit:
              10,
            observedAtOrAfter:
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
            observedBefore:
              new Date(
                "2026-08-18T11:00:00.000Z",
              ),
          }),
        ).rejects.toThrow(
          "observedAtOrAfter < observedBefore",
        );
      },
    );
  },
);
