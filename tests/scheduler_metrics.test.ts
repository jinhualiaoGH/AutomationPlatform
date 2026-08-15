import {
  describe,
  expect,
  it,
} from "vitest";

import {
  MetricsObservingSchedulerDispatcher,
  SchedulerMetricsAccumulator,
} from "../src/operations/scheduler_metrics.js";

import type {
  SchedulerDispatcher,
} from "../src/scheduling/scheduler_polling_loop.js";

import type {
  TriggerDispatchSummary,
} from "../src/scheduling/trigger_dispatcher.js";

function dispatchSummary(
  overrides:
    Partial<TriggerDispatchSummary> =
    {},
): TriggerDispatchSummary {
  return {
    evaluatedAtUtc:
      new Date(
        "2026-08-15T15:00:00.000Z",
      ),

    candidates:
      4,

    dispatched:
      2,

    skipped:
      1,

    failed:
      1,

    outcomes:
      [],

    ...overrides,
  };
}

class FakeDispatcher
implements SchedulerDispatcher {
  public calls:
    Array<{
      evaluatedAtUtc: Date;
      limit: number | undefined;
    }> = [];

  public result:
    TriggerDispatchSummary =
    dispatchSummary();

  public error:
    unknown = null;

  public async dispatchDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<TriggerDispatchSummary> {
    this.calls.push({
      evaluatedAtUtc:
        new Date(
          evaluatedAtUtc.getTime(),
        ),

      limit,
    });

    if (this.error !== null) {
      throw this.error;
    }

    return this.result;
  }
}

describe(
  "SchedulerMetricsAccumulator",
  () => {
    it(
      "starts with a zero-valued snapshot",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        expect(
          metrics.getSnapshot(),
        ).toEqual({
          cycles:
            0,

          successfulCycles:
            0,

          failedCycles:
            0,

          candidates:
            0,

          dispatched:
            0,

          skipped:
            0,

          failedDispatches:
            0,

          lastEvaluatedAtUtc:
            null,

          lastCycleError:
            null,
        });
      },
    );

    it(
      "accumulates a successful dispatch cycle",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        const evaluatedAtUtc =
          new Date(
            "2026-08-15T15:00:00.000Z",
          );

        metrics.recordSuccess(
          evaluatedAtUtc,
          dispatchSummary(),
        );

        const snapshot =
          metrics.getSnapshot();

        expect(snapshot.cycles)
          .toBe(1);

        expect(
          snapshot.successfulCycles,
        ).toBe(1);

        expect(snapshot.failedCycles)
          .toBe(0);

        expect(snapshot.candidates)
          .toBe(4);

        expect(snapshot.dispatched)
          .toBe(2);

        expect(snapshot.skipped)
          .toBe(1);

        expect(
          snapshot.failedDispatches,
        ).toBe(1);

        expect(
          snapshot.lastEvaluatedAtUtc
            ?.toISOString(),
        ).toBe(
          "2026-08-15T15:00:00.000Z",
        );

        expect(snapshot.lastCycleError)
          .toBeNull();
      },
    );

    it(
      "accumulates multiple successful cycles",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        metrics.recordSuccess(
          new Date(
            "2026-08-15T15:00:00.000Z",
          ),
          dispatchSummary(),
        );

        metrics.recordSuccess(
          new Date(
            "2026-08-15T15:00:01.000Z",
          ),
          dispatchSummary({
            candidates:
              3,

            dispatched:
              3,

            skipped:
              0,

            failed:
              0,
          }),
        );

        const snapshot =
          metrics.getSnapshot();

        expect(snapshot.cycles)
          .toBe(2);

        expect(
          snapshot.successfulCycles,
        ).toBe(2);

        expect(snapshot.candidates)
          .toBe(7);

        expect(snapshot.dispatched)
          .toBe(5);

        expect(snapshot.skipped)
          .toBe(1);

        expect(
          snapshot.failedDispatches,
        ).toBe(1);
      },
    );

    it(
      "records a failed cycle without changing dispatch counters",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        metrics.recordFailure(
          new Date(
            "2026-08-15T15:00:00.000Z",
          ),
          new Error(
            "database unavailable",
          ),
        );

        const snapshot =
          metrics.getSnapshot();

        expect(snapshot.cycles)
          .toBe(1);

        expect(snapshot.failedCycles)
          .toBe(1);

        expect(
          snapshot.successfulCycles,
        ).toBe(0);

        expect(snapshot.candidates)
          .toBe(0);

        expect(snapshot.dispatched)
          .toBe(0);

        expect(snapshot.lastCycleError)
          .toBe(
            "database unavailable",
          );
      },
    );

    it(
      "clears the previous cycle error after later success",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        metrics.recordFailure(
          new Date(
            "2026-08-15T15:00:00.000Z",
          ),
          "temporary failure",
        );

        metrics.recordSuccess(
          new Date(
            "2026-08-15T15:00:01.000Z",
          ),
          dispatchSummary(),
        );

        const snapshot =
          metrics.getSnapshot();

        expect(snapshot.cycles)
          .toBe(2);

        expect(snapshot.failedCycles)
          .toBe(1);

        expect(
          snapshot.successfulCycles,
        ).toBe(1);

        expect(snapshot.lastCycleError)
          .toBeNull();
      },
    );

    it(
      "returns defensive Date snapshots",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        const evaluatedAtUtc =
          new Date(
            "2026-08-15T15:00:00.000Z",
          );

        metrics.recordSuccess(
          evaluatedAtUtc,
          dispatchSummary(),
        );

        const first =
          metrics.getSnapshot();

        const second =
          metrics.getSnapshot();

        expect(
          first.lastEvaluatedAtUtc,
        ).not.toBe(
          evaluatedAtUtc,
        );

        expect(
          first.lastEvaluatedAtUtc,
        ).not.toBe(
          second.lastEvaluatedAtUtc,
        );

        first.lastEvaluatedAtUtc
          ?.setUTCFullYear(
            2030,
          );

        expect(
          second.lastEvaluatedAtUtc
            ?.toISOString(),
        ).toBe(
          "2026-08-15T15:00:00.000Z",
        );
      },
    );

    it(
      "rejects invalid metrics input before mutation",
      () => {
        const metrics =
          new SchedulerMetricsAccumulator();

        expect(
          () =>
            metrics.recordSuccess(
              new Date(
                Number.NaN,
              ),
              dispatchSummary(),
            ),
        ).toThrow(
          "evaluatedAtUtc must be a valid Date.",
        );

        expect(
          () =>
            metrics.recordSuccess(
              new Date(
                "2026-08-15T15:00:00.000Z",
              ),
              dispatchSummary({
                candidates:
                  -1,
              }),
            ),
        ).toThrow(
          "summary.candidates must be a non-negative safe integer.",
        );

        expect(
          metrics.getSnapshot().cycles,
        ).toBe(0);
      },
    );
  },
);

describe(
  "MetricsObservingSchedulerDispatcher",
  () => {
    it(
      "records success while preserving dispatcher result and limit",
      async () => {
        const inner =
          new FakeDispatcher();

        const metrics =
          new SchedulerMetricsAccumulator();

        const dispatcher =
          new MetricsObservingSchedulerDispatcher(
            inner,
            metrics,
          );

        const evaluatedAtUtc =
          new Date(
            "2026-08-15T15:00:00.000Z",
          );

        const result =
          await dispatcher.dispatchDue(
            evaluatedAtUtc,
            17,
          );

        expect(result)
          .toBe(
            inner.result,
          );

        expect(inner.calls)
          .toHaveLength(1);

        expect(
          inner.calls[0]?.limit,
        ).toBe(17);

        expect(
          metrics
            .getSnapshot()
            .successfulCycles,
        ).toBe(1);
      },
    );

    it(
      "records failure and rethrows the original error",
      async () => {
        const inner =
          new FakeDispatcher();

        const failure =
          new Error(
            "synthetic dispatch failure",
          );

        inner.error =
          failure;

        const metrics =
          new SchedulerMetricsAccumulator();

        const dispatcher =
          new MetricsObservingSchedulerDispatcher(
            inner,
            metrics,
          );

        await expect(
          dispatcher.dispatchDue(
            new Date(
              "2026-08-15T15:00:00.000Z",
            ),
            11,
          ),
        ).rejects.toBe(
          failure,
        );

        const snapshot =
          metrics.getSnapshot();

        expect(snapshot.cycles)
          .toBe(1);

        expect(snapshot.failedCycles)
          .toBe(1);

        expect(snapshot.lastCycleError)
          .toBe(
            "synthetic dispatch failure",
          );
      },
    );
  },
);
