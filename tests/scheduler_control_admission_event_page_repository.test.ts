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
