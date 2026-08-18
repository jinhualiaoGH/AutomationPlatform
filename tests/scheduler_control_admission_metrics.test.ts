import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "../src/recovery/scheduler_control_admission_metrics.js";


describe(
  "SchedulerControlAdmissionMetricsAccumulator",
  () => {

    it(
      "starts with an empty defensive snapshot",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        expect(
          metrics.getSnapshot(),
        ).toEqual({
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
        });
      },
    );


    it(
      "records an admitted command",
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


        expect(
          metrics.getSnapshot(),
        ).toEqual({
          total:
            1,

          admitted:
            1,

          denied:
            0,

          byCommand: {
            start:
              1,

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

          lastDecision: {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },
        });
      },
    );


    it(
      "records standby denial",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        const snapshot =
          metrics.getSnapshot();


        expect(snapshot.total)
          .toBe(
            1,
          );

        expect(snapshot.admitted)
          .toBe(
            0,
          );

        expect(snapshot.denied)
          .toBe(
            1,
          );

        expect(
          snapshot.byCommand.restart,
        ).toBe(
          1,
        );

        expect(
          snapshot.deniedByReason
            .scheduler_standby,
        ).toBe(
          1,
        );
      },
    );


    it(
      "counts every denial reason independently",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "denied",

          command:
            "start",

          reason:
            "scheduler_standby",
        });


        metrics.record({
          disposition:
            "denied",

          command:
            "stop",

          reason:
            "scheduler_fail_closed",
        });


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_stopped",
        });


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          total:
            3,

          admitted:
            0,

          denied:
            3,

          deniedByReason: {
            scheduler_standby:
              1,

            scheduler_fail_closed:
              1,

            scheduler_stopped:
              1,
          },
        });
      },
    );


    it(
      "counts admitted and denied attempts by command",
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
            "start",

          reason:
            "scheduler_standby",
        });


        metrics.record({
          disposition:
            "admitted",

          command:
            "stop",

          reason:
            null,
        });


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_stopped",
        });


        expect(
          metrics.getSnapshot()
            .byCommand,
        ).toEqual({
          start:
            2,

          stop:
            1,

          restart:
            1,
        });
      },
    );


    it(
      "tracks the most recent decision",
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
            "stop",

          reason:
            "scheduler_fail_closed",
        });


        expect(
          metrics.getSnapshot()
            .lastDecision,
        ).toEqual({
          disposition:
            "denied",

          command:
            "stop",

          reason:
            "scheduler_fail_closed",
        });
      },
    );


    it(
      "returns defensive nested snapshots",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        const first =
          metrics.getSnapshot();


        (
          first.byCommand as {
            restart: number;
          }
        ).restart =
          999;


        (
          first.deniedByReason as {
            scheduler_standby: number;
          }
        ).scheduler_standby =
          999;


        if (first.lastDecision) {

          (
            first.lastDecision as {
              command:
                "start" |
                "stop" |
                "restart";
            }
          ).command =
            "start";
        }


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          byCommand: {
            restart:
              1,
          },

          deniedByReason: {
            scheduler_standby:
              1,
          },

          lastDecision: {
            command:
              "restart",
          },
        });
      },
    );


    it(
      "returns a new snapshot object for every read",
      () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        const first =
          metrics.getSnapshot();

        const second =
          metrics.getSnapshot();


        expect(first)
          .not.toBe(
            second,
          );

        expect(first.byCommand)
          .not.toBe(
            second.byCommand,
          );

        expect(first.deniedByReason)
          .not.toBe(
            second.deniedByReason,
          );
      },
    );
  },
);
