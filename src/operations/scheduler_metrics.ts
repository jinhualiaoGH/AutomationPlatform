import type {
  SchedulerDispatcher,
} from "../scheduling/scheduler_polling_loop.js";

import type {
  TriggerDispatchSummary,
} from "../scheduling/trigger_dispatcher.js";

export type SchedulerMetricsSnapshot = {
  cycles:
    number;

  successfulCycles:
    number;

  failedCycles:
    number;

  candidates:
    number;

  dispatched:
    number;

  skipped:
    number;

  failedDispatches:
    number;

  lastEvaluatedAtUtc:
    Date | null;

  lastCycleError:
    string | null;
};

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(
      name + " must be a valid Date.",
    );
  }
}

function normalizeError(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown scheduler cycle error.";
}

function assertCounter(
  value: number,
  name: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      name +
      " must be a non-negative safe integer.",
    );
  }
}

function assertSummary(
  summary: TriggerDispatchSummary,
): void {
  assertCounter(
    summary.candidates,
    "summary.candidates",
  );

  assertCounter(
    summary.dispatched,
    "summary.dispatched",
  );

  assertCounter(
    summary.skipped,
    "summary.skipped",
  );

  assertCounter(
    summary.failed,
    "summary.failed",
  );
}

function checkedAdd(
  current: number,
  increment: number,
  name: string,
): number {
  const next =
    current + increment;

  if (!Number.isSafeInteger(next)) {
    throw new Error(
      name +
      " exceeded the safe integer range.",
    );
  }

  return next;
}

export class SchedulerMetricsAccumulator {
  private cyclesValue =
    0;

  private successfulCyclesValue =
    0;

  private failedCyclesValue =
    0;

  private candidatesValue =
    0;

  private dispatchedValue =
    0;

  private skippedValue =
    0;

  private failedDispatchesValue =
    0;

  private lastEvaluatedAtUtcValue:
    Date | null =
    null;

  private lastCycleErrorValue:
    string | null =
    null;

  public recordSuccess(
    evaluatedAtUtc: Date,
    summary: TriggerDispatchSummary,
  ): void {
    assertValidDate(
      evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    assertSummary(
      summary,
    );

    this.cyclesValue =
      checkedAdd(
        this.cyclesValue,
        1,
        "cycles",
      );

    this.successfulCyclesValue =
      checkedAdd(
        this.successfulCyclesValue,
        1,
        "successfulCycles",
      );

    this.candidatesValue =
      checkedAdd(
        this.candidatesValue,
        summary.candidates,
        "candidates",
      );

    this.dispatchedValue =
      checkedAdd(
        this.dispatchedValue,
        summary.dispatched,
        "dispatched",
      );

    this.skippedValue =
      checkedAdd(
        this.skippedValue,
        summary.skipped,
        "skipped",
      );

    this.failedDispatchesValue =
      checkedAdd(
        this.failedDispatchesValue,
        summary.failed,
        "failedDispatches",
      );

    this.lastEvaluatedAtUtcValue =
      new Date(
        evaluatedAtUtc.getTime(),
      );

    this.lastCycleErrorValue =
      null;
  }

  public recordFailure(
    evaluatedAtUtc: Date,
    error: unknown,
  ): void {
    assertValidDate(
      evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    this.cyclesValue =
      checkedAdd(
        this.cyclesValue,
        1,
        "cycles",
      );

    this.failedCyclesValue =
      checkedAdd(
        this.failedCyclesValue,
        1,
        "failedCycles",
      );

    this.lastEvaluatedAtUtcValue =
      new Date(
        evaluatedAtUtc.getTime(),
      );

    this.lastCycleErrorValue =
      normalizeError(
        error,
      );
  }

  public getSnapshot():
    SchedulerMetricsSnapshot {
    return {
      cycles:
        this.cyclesValue,

      successfulCycles:
        this.successfulCyclesValue,

      failedCycles:
        this.failedCyclesValue,

      candidates:
        this.candidatesValue,

      dispatched:
        this.dispatchedValue,

      skipped:
        this.skippedValue,

      failedDispatches:
        this.failedDispatchesValue,

      lastEvaluatedAtUtc:
        this.lastEvaluatedAtUtcValue
          ? new Date(
              this.lastEvaluatedAtUtcValue
                .getTime(),
            )
          : null,

      lastCycleError:
        this.lastCycleErrorValue,
    };
  }
}

export class MetricsObservingSchedulerDispatcher
implements SchedulerDispatcher {
  public constructor(
    private readonly inner:
      SchedulerDispatcher,

    private readonly metrics:
      SchedulerMetricsAccumulator,
  ) {}

  public async dispatchDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<TriggerDispatchSummary> {
    assertValidDate(
      evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    try {
      const summary =
        await this.inner.dispatchDue(
          evaluatedAtUtc,
          limit,
        );

      this.metrics.recordSuccess(
        evaluatedAtUtc,
        summary,
      );

      return summary;
    }
    catch (error) {
      this.metrics.recordFailure(
        evaluatedAtUtc,
        error,
      );

      throw error;
    }
  }
}
