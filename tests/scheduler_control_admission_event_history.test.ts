import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionEventHistory,
} from "../src/recovery/scheduler_control_admission_event_history.js";


describe(
  "SchedulerControlAdmissionEventHistory",
  () => {

    it(
      "starts with an empty bounded history",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            3,
          );


        expect(
          history.getSnapshot(),
        ).toEqual({
          capacity:
            3,

          size:
            0,

          dropped:
            0,

          events:
            [],
        });
      },
    );


    it(
      "records an admitted event",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            3,
          );


        const event =
          history.record(
            {
              disposition:
                "admitted",

              command:
                "start",

              reason:
                null,
            },

            new Date(
              "2026-08-18T16:00:00.000Z",
            ),
          );


        expect(event)
          .toEqual({
            sequence:
              1,

            observedAtUtc:
              new Date(
                "2026-08-18T16:00:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          });
      },
    );


    it(
      "records denied events with their denial reason",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            3,
          );


        history.record(
          {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_fail_closed",
          },

          new Date(
            "2026-08-18T16:01:00.000Z",
          ),
        );


        expect(
          history.getSnapshot()
            .events[0],
        ).toMatchObject({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_fail_closed",
        });
      },
    );


    it(
      "assigns monotonically increasing sequence numbers",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },

          new Date(
            "2026-08-18T16:02:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "stop",

            reason:
              null,
          },

          new Date(
            "2026-08-18T16:03:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_standby",
          },

          new Date(
            "2026-08-18T16:04:00.000Z",
          ),
        );


        expect(
          history.getSnapshot()
            .events
            .map(
              (event) =>
                event.sequence,
            ),
        ).toEqual([
          1,
          2,
          3,
        ]);
      },
    );


    it(
      "drops the oldest event when capacity is exceeded",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },

          new Date(
            "2026-08-18T16:05:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "stop",

            reason:
              null,
          },

          new Date(
            "2026-08-18T16:06:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_stopped",
          },

          new Date(
            "2026-08-18T16:07:00.000Z",
          ),
        );


        const snapshot =
          history.getSnapshot();


        expect(snapshot.size)
          .toBe(
            2,
          );

        expect(snapshot.dropped)
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
          3,
        ]);
      },
    );


    it(
      "continues sequence numbers after bounded eviction",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            1,
          );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },

          new Date(
            "2026-08-18T16:08:00.000Z",
          ),
        );


        const second =
          history.record(
            {
              disposition:
                "denied",

              command:
                "stop",

              reason:
                "scheduler_standby",
            },

            new Date(
              "2026-08-18T16:09:00.000Z",
            ),
          );


        expect(second.sequence)
          .toBe(
            2,
          );

        expect(
          history.getSnapshot()
            .events[0]
            ?.sequence,
        ).toBe(
          2,
        );
      },
    );


    it(
      "returns defensive event dates",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );


        const sourceDate =
          new Date(
            "2026-08-18T16:10:00.000Z",
          );


        const returned =
          history.record(
            {
              disposition:
                "admitted",

              command:
                "restart",

              reason:
                null,
            },

            sourceDate,
          );


        sourceDate.setUTCFullYear(
          2000,
        );

        returned.observedAtUtc.setUTCFullYear(
          2001,
        );


        expect(
          history.getSnapshot()
            .events[0]
            ?.observedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-18T16:10:00.000Z",
        );
      },
    );


    it(
      "returns defensive history snapshots",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );


        history.record(
          {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_fail_closed",
          },

          new Date(
            "2026-08-18T16:11:00.000Z",
          ),
        );


        const first =
          history.getSnapshot();

        const second =
          history.getSnapshot();


        expect(first)
          .not.toBe(
            second,
          );

        expect(first.events)
          .not.toBe(
            second.events,
          );

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
      "rejects a zero capacity",
      () => {

        expect(
          () =>
            new SchedulerControlAdmissionEventHistory(
              0,
            ),
        ).toThrow(
          "Admission event history capacity must be a positive safe integer.",
        );
      },
    );


    it(
      "rejects an invalid observation time",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );


        expect(
          () =>
            history.record(
              {
                disposition:
                  "admitted",

                command:
                  "start",

                reason:
                  null,
              },

              new Date(
                Number.NaN,
              ),
            ),
        ).toThrow(
          "Admission event observation time is invalid.",
        );
      },
    );
  },
);
