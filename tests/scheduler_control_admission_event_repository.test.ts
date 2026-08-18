import {
  describe,
  expect,
  it,
} from "vitest";

import {
  InMemorySchedulerControlAdmissionEventRepository,
} from "../src/recovery/scheduler_control_admission_event_repository.js";


describe(
  "InMemorySchedulerControlAdmissionEventRepository",
  () => {

    it(
      "starts empty",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        expect(
          await repository.list(),
        ).toEqual(
          [],
        );
      },
    );


    it(
      "appends and lists admission events",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            new Date(
              "2026-08-18T13:00:00.000Z",
            ),

          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        expect(
          await repository.list(),
        ).toEqual([
          {
            sequence:
              1,

            observedAtUtc:
              new Date(
                "2026-08-18T13:00:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },
        ]);
      },
    );


    it(
      "preserves insertion order",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            new Date(
              "2026-08-18T13:01:00.000Z",
            ),

          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        await repository.append({
          sequence:
            2,

          observedAtUtc:
            new Date(
              "2026-08-18T13:02:00.000Z",
            ),

          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        expect(
          (await repository.list())
            .map(
              (event) =>
                event.sequence,
            ),
        ).toEqual([
          1,
          2,
        ]);
      },
    );


    it(
      "stores defensive event dates",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();

        const sourceDate =
          new Date(
            "2026-08-18T13:03:00.000Z",
          );


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            sourceDate,

          disposition:
            "admitted",

          command:
            "stop",

          reason:
            null,
        });


        sourceDate.setUTCFullYear(
          2000,
        );


        expect(
          (await repository.list())[0]
            ?.observedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-18T13:03:00.000Z",
        );
      },
    );


    it(
      "returns defensive event copies",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            new Date(
              "2026-08-18T13:04:00.000Z",
            ),

          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_fail_closed",
        });


        const first =
          await repository.list();

        const second =
          await repository.list();


        expect(first)
          .not.toBe(
            second,
          );

        expect(first[0])
          .not.toBe(
            second[0],
          );

        expect(
          first[0]?.observedAtUtc,
        ).not.toBe(
          second[0]?.observedAtUtc,
        );
      },
    );


    it(
      "rejects duplicate sequence identity",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            new Date(
              "2026-08-18T13:05:00.000Z",
            ),

          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        await expect(
          repository.append({
            sequence:
              1,

            observedAtUtc:
              new Date(
                "2026-08-18T13:06:00.000Z",
              ),

            disposition:
              "denied",

            command:
              "stop",

            reason:
              "scheduler_stopped",
          }),
        ).rejects.toThrow(
          "Admission event sequence 1 already exists.",
        );
      },
    );


    it(
      "rejects invalid sequence identity",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await expect(
          repository.append({
            sequence:
              0,

            observedAtUtc:
              new Date(
                "2026-08-18T13:07:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          }),
        ).rejects.toThrow(
          "Admission event sequence must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects invalid observation time",
      async () => {

        const repository =
          new InMemorySchedulerControlAdmissionEventRepository();


        await expect(
          repository.append({
            sequence:
              1,

            observedAtUtc:
              new Date(
                Number.NaN,
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          }),
        ).rejects.toThrow(
          "Admission event observation time is invalid.",
        );
      },
    );
  },
);
