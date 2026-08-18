import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "../src/recovery/scheduler_control_admission_metrics.js";

import {
  SchedulerControlAdmissionStatusService,
} from "../src/recovery/scheduler_control_admission_status_service.js";


describe(
  "SchedulerControlAdmissionStatusService",
  () => {

    it(
      "projects an empty initial operational status",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
            () =>
              new Date(
                "2026-08-18T12:00:00.000Z",
              ),
          );


        expect(
          service.getStatus(),
        ).toEqual({
          observedAtUtc:
            new Date(
              "2026-08-18T12:00:00.000Z",
            ),

          hasObservedDecisions:
            false,

          metrics: {
            total:
              0,

            admitted:
              0,

            denied:
              0,

            byCommand: {
              start:
                0,

              stop:
                0,

              restart:
                0,
            },

            deniedByReason: {
              scheduler_standby:
                0,

              scheduler_fail_closed:
                0,

              scheduler_stopped:
                0,
            },

            lastDecision:
              null,
          },
        });
      },
    );


    it(
      "projects current admission metrics",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
            () =>
              new Date(
                "2026-08-18T12:01:00.000Z",
              ),
          );


        expect(
          service.getStatus(),
        ).toMatchObject({
          observedAtUtc:
            new Date(
              "2026-08-18T12:01:00.000Z",
            ),

          hasObservedDecisions:
            true,

          metrics: {
            total:
              2,

            admitted:
              1,

            denied:
              1,

            byCommand: {
              start:
                1,

              stop:
                0,

              restart:
                1,
            },

            deniedByReason: {
              scheduler_standby:
                1,

              scheduler_fail_closed:
                0,

              scheduler_stopped:
                0,
            },

            lastDecision: {
              disposition:
                "denied",

              command:
                "restart",

              reason:
                "scheduler_standby",
            },
          },
        });
      },
    );


    it(
      "samples the live accumulator on every read",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
            () =>
              new Date(
                "2026-08-18T12:02:00.000Z",
              ),
          );


        expect(
          service.getStatus()
            .metrics.total,
        ).toBe(
          0,
        );


        metrics.record({
          disposition:
            "admitted",

          command:
            "stop",

          reason:
            null,
        });


        expect(
          service.getStatus()
            .metrics.total,
        ).toBe(
          1,
        );
      },
    );


    it(
      "samples the clock on every read",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        let current =
          0;


        const times = [
          new Date(
            "2026-08-18T12:03:00.000Z",
          ),

          new Date(
            "2026-08-18T12:04:00.000Z",
          ),
        ];


        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
            () =>
              times[current++]!,
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
      "returns defensive observation dates",
      () => {

        const sourceDate =
          new Date(
            "2026-08-18T12:05:00.000Z",
          );


        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
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
          "2026-08-18T12:05:00.000Z",
        );


        expect(
          service.getStatus()
            .observedAtUtc
            .toISOString(),
        ).toBe(
          "2026-08-18T12:05:00.000Z",
        );
      },
    );


    it(
      "returns defensive nested metric snapshots",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_fail_closed",
        });


        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
          );


        const status =
          service.getStatus();


        (
          status.metrics.byCommand as {
            restart: number;
          }
        ).restart =
          999;


        (
          status.metrics.deniedByReason as {
            scheduler_fail_closed: number;
          }
        ).scheduler_fail_closed =
          999;


        if (status.metrics.lastDecision) {

          (
            status.metrics.lastDecision as {
              command:
                "start" |
                "stop" |
                "restart";
            }
          ).command =
            "start";
        }


        expect(
          service.getStatus(),
        ).toMatchObject({
          metrics: {
            byCommand: {
              restart:
                1,
            },

            deniedByReason: {
              scheduler_fail_closed:
                1,
            },

            lastDecision: {
              command:
                "restart",
            },
          },
        });
      },
    );


    it(
      "returns new status and metrics objects for every read",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
          );


        const first =
          service.getStatus();

        const second =
          service.getStatus();


        expect(first)
          .not.toBe(
            second,
          );

        expect(first.metrics)
          .not.toBe(
            second.metrics,
          );

        expect(first.metrics.byCommand)
          .not.toBe(
            second.metrics.byCommand,
          );

        expect(first.metrics.deniedByReason)
          .not.toBe(
            second.metrics.deniedByReason,
          );
      },
    );


    it(
      "rejects an invalid observation time",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const service =
          new SchedulerControlAdmissionStatusService(
            metrics,
            () =>
              new Date(
                Number.NaN,
              ),
          );


        expect(
          () =>
            service.getStatus(),
        ).toThrow(
          "Admission status clock returned an invalid Date.",
        );
      },
    );
  },
);
