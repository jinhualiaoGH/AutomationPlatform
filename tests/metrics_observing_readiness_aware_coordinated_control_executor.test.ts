import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ReadinessAwareCoordinatedSchedulerControlHandler,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "../src/recovery/readiness_aware_coordinated_control_executor.js";

import {
  MetricsObservingReadinessAwareCoordinatedControlExecutor,
} from "../src/recovery/metrics_observing_readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "../src/recovery/scheduler_control_admission_metrics.js";


type ExecuteRequest =
  Parameters<
    ReadinessAwareCoordinatedSchedulerControlHandler["execute"]
  >[0];


function request(
  command:
    ExecuteRequest["command"],
): ExecuteRequest {

  return {
    command,
  };
}


class FakeDelegate
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public calls:
    ExecuteRequest[] =
    [];


  public result:
    ReadinessAwareCoordinatedSchedulerControlResult;


  public error:
    Error |
    null =
    null;


  public constructor(
    result:
      ReadinessAwareCoordinatedSchedulerControlResult,
  ) {

    this.result =
      result;
  }


  public async execute(
    value:
      ExecuteRequest,
  ):
    Promise<
      ReadinessAwareCoordinatedSchedulerControlResult
    > {

    this.calls.push(
      value,
    );


    if (this.error !== null) {
      throw this.error;
    }


    return this.result;
  }
}


function admittedResult():
  ReadinessAwareCoordinatedSchedulerControlResult {

  /*
   * The decorator deliberately treats every non-admission-denied
   * A17 result as an admitted command. Its job is observation,
   * not reinterpretation of the frozen downstream result ABI.
   */
  return {
    kind:
      "executed",
  } as unknown as
    ReadinessAwareCoordinatedSchedulerControlResult;
}


function deniedResult(
  command:
    ExecuteRequest["command"],

  reason:
    "scheduler_standby" |
    "scheduler_fail_closed" |
    "scheduler_stopped",
):
  ReadinessAwareCoordinatedSchedulerControlResult {

  return {
    kind:
      "admission_denied",

    command,

    reason,
  };
}


describe(
  "MetricsObservingReadinessAwareCoordinatedControlExecutor",
  () => {

    it(
      "delegates the original request unchanged",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );

        const input =
          request(
            "restart",
          );


        await executor.execute(
          input,
        );


        expect(delegate.calls)
          .toEqual([
            input,
          ]);

        expect(delegate.calls[0])
          .toBe(
            input,
          );
      },
    );


    it(
      "returns the delegate result unchanged",
      async () => {

        const result =
          admittedResult();

        const delegate =
          new FakeDelegate(
            result,
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        const returned =
          await executor.execute(
            request(
              "start",
            ),
          );


        expect(returned)
          .toBe(
            result,
          );
      },
    );


    it(
      "records admitted commands",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          total:
            1,

          admitted:
            1,

          denied:
            0,

          byCommand: {
            start:
              1,
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
      "records standby admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "restart",
              "scheduler_standby",
            ),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          total:
            1,

          admitted:
            0,

          denied:
            1,

          deniedByReason: {
            scheduler_standby:
              1,
          },

          lastDecision: {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_standby",
          },
        });
      },
    );


    it(
      "records fail-closed admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "stop",
              "scheduler_fail_closed",
            ),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await executor.execute(
          request(
            "stop",
          ),
        );


        expect(
          metrics.getSnapshot()
            .deniedByReason
            .scheduler_fail_closed,
        ).toBe(
          1,
        );
      },
    );


    it(
      "records stopped admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "start",
              "scheduler_stopped",
            ),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(
          metrics.getSnapshot()
            .deniedByReason
            .scheduler_stopped,
        ).toBe(
          1,
        );
      },
    );


    it(
      "records exactly one observation per successful delegate result",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await executor.execute(
          request(
            "start",
          ),
        );

        await executor.execute(
          request(
            "stop",
          ),
        );

        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          total:
            3,

          admitted:
            3,

          denied:
            0,

          byCommand: {
            start:
              1,

            stop:
              1,

            restart:
              1,
          },
        });
      },
    );


    it(
      "does not invent an observation when the delegate throws",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        delegate.error =
          new Error(
            "delegate failure",
          );

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const executor =
          new MetricsObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            metrics,
          );


        await expect(
          executor.execute(
            request(
              "restart",
            ),
          ),
        ).rejects.toThrow(
          "delegate failure",
        );


        expect(
          metrics.getSnapshot(),
        ).toMatchObject({
          total:
            0,

          admitted:
            0,

          denied:
            0,

          lastDecision:
            null,
        });
      },
    );
  },
);
