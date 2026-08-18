import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionEventHistory,
} from "../src/recovery/scheduler_control_admission_event_history.js";

import {
  SchedulerControlAdmissionHistoryStatusService,
} from "../src/recovery/scheduler_control_admission_history_status_service.js";


describe(
  "SchedulerControlAdmissionHistoryStatusService",
  () => {

    it(
      "projects an empty history status",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
            () =>
              new Date(
                "2026-08-18T18:00:00.000Z",
              ),
          );


        expect(
          service.getStatus(),
        ).toEqual({
          observedAtUtc:
            new Date(
              "2026-08-18T18:00:00.000Z",
            ),

          capacity:
            4,

          size:
            0,

          dropped:
            0,

          hasEvents:
            false,

          events:
            [],
        });
      },
    );


    it(
      "projects current chronological events",
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
            "2026-08-18T18:01:00.000Z",
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
            "2026-08-18T18:02:00.000Z",
          ),
        );


        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
            () =>
              new Date(
                "2026-08-18T18:03:00.000Z",
              ),
          );


        expect(
          service.getStatus(),
        ).toMatchObject({
          capacity:
            4,

          size:
            2,

          dropped:
            0,

          hasEvents:
            true,

          events: [
            {
              sequence:
                1,

              disposition:
                "admitted",

              command:
                "start",

              reason:
                null,
            },

            {
              sequence:
                2,

              disposition:
                "denied",

              command:
                "restart",

              reason:
                "scheduler_standby",
            },
          ],
        });
      },
    );


    it(
      "projects bounded-history eviction state",
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
            "2026-08-18T18:04:00.000Z",
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
            "2026-08-18T18:05:00.000Z",
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
            "2026-08-18T18:06:00.000Z",
          ),
        );


        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
          );

        const status =
          service.getStatus();


        expect(status.capacity)
          .toBe(
            2,
          );

        expect(status.size)
          .toBe(
            2,
          );

        expect(status.dropped)
          .toBe(
            1,
          );

        expect(
          status.events.map(
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
      "samples live history on every read",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
          );


        expect(
          service.getStatus()
            .size,
        ).toBe(
          0,
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
            "2026-08-18T18:07:00.000Z",
          ),
        );


        expect(
          service.getStatus()
            .size,
        ).toBe(
          1,
        );
      },
    );


    it(
      "samples the status clock on every read",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const times = [
          new Date(
            "2026-08-18T18:08:00.000Z",
          ),

          new Date(
            "2026-08-18T18:09:00.000Z",
          ),
        ];

        let index =
          0;


        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
            () =>
              times[index++]!,
          );


        expect(
          service.getStatus()
            .observedAtUtc,
        ).toEqual(
          times[0],
        );

        expect(
          service.getStatus()
            .observedAtUtc,
        ).toEqual(
          times[1],
        );
      },
    );


    it(
      "returns defensive status timestamps",
      () => {

        const sourceDate =
          new Date(
            "2026-08-18T18:10:00.000Z",
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
            () =>
              sourceDate,
          );


        const status =
          service.getStatus();


        status.observedAtUtc.setUTCFullYear(
          2000,
        );


        expect(
          sourceDate.toISOString(),
        ).toBe(
          "2026-08-18T18:10:00.000Z",
        );

        expect(
          service.getStatus()
            .observedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-18T18:10:00.000Z",
        );
      },
    );


    it(
      "returns defensive event objects and dates",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
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
            "2026-08-18T18:11:00.000Z",
          ),
        );


        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
          );


        const first =
          service.getStatus();

        const second =
          service.getStatus();


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


        first.events[0]
          ?.observedAtUtc
          .setUTCFullYear(
            2001,
          );


        expect(
          service.getStatus()
            .events[0]
            ?.observedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-18T18:11:00.000Z",
        );
      },
    );


    it(
      "rejects an invalid status observation time",
      () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const service =
          new SchedulerControlAdmissionHistoryStatusService(
            history,
            () =>
              new Date(
                Number.NaN,
              ),
          );


        expect(
          () =>
            service.getStatus(),
        ).toThrow(
          "Admission history status clock returned an invalid Date.",
        );
      },
    );
  },
);
