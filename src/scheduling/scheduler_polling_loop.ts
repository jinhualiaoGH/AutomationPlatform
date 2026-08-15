import {
  setTimeout as sleepTimer,
} from "node:timers/promises";

import {
  TriggerDispatcher,
} from "./trigger_dispatcher.js";

import type {
  TriggerDispatchSummary,
} from "./trigger_dispatcher.js";

export type SchedulerClock = {
  now(): Date;
};

export type SchedulerSleeper = {
  sleep(
    milliseconds: number,
    signal: AbortSignal,
  ): Promise<void>;
};

export type SchedulerDispatcher = {
  dispatchDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<TriggerDispatchSummary>;
};

export type SchedulerPollingLoopOptions = {
  pollIntervalMs?: number;
  batchLimit?: number;
};

export type SchedulerPollingLoopResult = {
  cycles: number;
  successfulCycles: number;
  failedCycles: number;
  candidates: number;
  dispatched: number;
  skipped: number;
  failedDispatches: number;
  lastEvaluatedAtUtc: Date | null;
  lastCycleError: string | null;
};

export class SystemSchedulerClock
implements SchedulerClock {
  public now(): Date {
    return new Date();
  }
}

export class AbortableSchedulerSleeper
implements SchedulerSleeper {
  public async sleep(
    milliseconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    try {
      await sleepTimer(
        milliseconds,
        undefined,
        {
          signal,
        },
      );
    }
    catch (error) {
      if (signal.aborted) {
        return;
      }

      throw error;
    }
  }
}

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

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown scheduler polling error.";
}

function validatePositiveInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      name + " must be a positive integer.",
    );
  }
}

export class SchedulerPollingLoop {
  private readonly pollIntervalMs:
    number;

  private readonly batchLimit:
    number;

  public constructor(
    private readonly dispatcher:
      SchedulerDispatcher =
      new TriggerDispatcher(),

    private readonly clock:
      SchedulerClock =
      new SystemSchedulerClock(),

    private readonly sleeper:
      SchedulerSleeper =
      new AbortableSchedulerSleeper(),

    options:
      SchedulerPollingLoopOptions = {},
  ) {
    this.pollIntervalMs =
      options.pollIntervalMs ??
      1_000;

    this.batchLimit =
      options.batchLimit ??
      100;

    validatePositiveInteger(
      this.pollIntervalMs,
      "pollIntervalMs",
    );

    validatePositiveInteger(
      this.batchLimit,
      "batchLimit",
    );

    if (this.batchLimit > 1_000) {
      throw new Error(
        "batchLimit must be at most 1000.",
      );
    }
  }

  public async run(
    signal: AbortSignal,
  ): Promise<SchedulerPollingLoopResult> {
    let cycles =
      0;

    let successfulCycles =
      0;

    let failedCycles =
      0;

    let candidates =
      0;

    let dispatched =
      0;

    let skipped =
      0;

    let failedDispatches =
      0;

    let lastEvaluatedAtUtc:
      Date | null = null;

    let lastCycleError:
      string | null = null;

    while (!signal.aborted) {
      const evaluatedAtUtc =
        this.clock.now();

      assertValidDate(
        evaluatedAtUtc,
        "Scheduler clock value",
      );

      lastEvaluatedAtUtc =
        new Date(
          evaluatedAtUtc.getTime(),
        );

      cycles++;

      try {
        const summary =
          await this.dispatcher.dispatchDue(
            evaluatedAtUtc,
            this.batchLimit,
          );

        successfulCycles++;

        candidates +=
          summary.candidates;

        dispatched +=
          summary.dispatched;

        skipped +=
          summary.skipped;

        failedDispatches +=
          summary.failed;
      }
      catch (error) {
        failedCycles++;

        lastCycleError =
          getErrorMessage(error);
      }

      if (signal.aborted) {
        break;
      }

      try {
        await this.sleeper.sleep(
          this.pollIntervalMs,
          signal,
        );
      }
      catch (error) {
        if (signal.aborted) {
          break;
        }

        throw error;
      }
    }

    return {
      cycles,
      successfulCycles,
      failedCycles,
      candidates,
      dispatched,
      skipped,
      failedDispatches,

      lastEvaluatedAtUtc:
        lastEvaluatedAtUtc
          ? new Date(
              lastEvaluatedAtUtc.getTime(),
            )
          : null,

      lastCycleError,
    };
  }
}
