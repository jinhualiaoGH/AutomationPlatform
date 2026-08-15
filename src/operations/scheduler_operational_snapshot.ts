import type {
  SchedulerPollingLoopResult,
} from "../scheduling/scheduler_polling_loop.js";

import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

export type SchedulerOperationalHealth =
  | "idle"
  | "healthy"
  | "degraded"
  | "stopped"
  | "failed";

export type SchedulerOperationalSnapshot = {
  observedAtUtc: Date;

  runtimeState:
    SchedulerRuntimeState;

  isRunning:
    boolean;

  health:
    SchedulerOperationalHealth;

  lastRun:
    SchedulerPollingLoopResult | null;

  terminalError:
    string | null;
};

export type SchedulerOperationalSource = {
  readonly state:
    SchedulerRuntimeState;

  readonly isRunning:
    boolean;

  getLastResult():
    SchedulerPollingLoopResult | null;

  getTerminalError():
    unknown;
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

function clonePollingResult(
  result:
    SchedulerPollingLoopResult,
): SchedulerPollingLoopResult {
  return {
    ...result,

    lastEvaluatedAtUtc:
      result.lastEvaluatedAtUtc
        ? new Date(
            result.lastEvaluatedAtUtc
              .getTime(),
          )
        : null,
  };
}

function normalizeTerminalError(
  error: unknown,
): string | null {
  if (error === null ||
      error === undefined) {
    return null;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown scheduler runtime error.";
}

function classifyHealth(
  state:
    SchedulerRuntimeState,

  isRunning:
    boolean,

  lastRun:
    SchedulerPollingLoopResult | null,

  terminalError:
    string | null,
): SchedulerOperationalHealth {
  if (
    state === "failed" ||
    terminalError !== null
  ) {
    return "failed";
  }

  if (state === "idle") {
    return "idle";
  }

  if (state === "stopped") {
    return "stopped";
  }

  if (
    state === "running" &&
    (
      lastRun?.failedCycles !== 0 &&
      lastRun?.failedCycles !== undefined
    )
  ) {
    return "degraded";
  }

  if (
    state === "running" &&
    (
      lastRun?.failedDispatches !== 0 &&
      lastRun?.failedDispatches !== undefined
    )
  ) {
    return "degraded";
  }

  if (
    state === "running" &&
    lastRun?.lastCycleError
  ) {
    return "degraded";
  }

  if (
    state === "running" &&
    isRunning
  ) {
    return "healthy";
  }

  return "degraded";
}

function assertConsistentRuntimeState(
  state:
    SchedulerRuntimeState,

  isRunning:
    boolean,
): void {
  if (
    state === "running" &&
    !isRunning
  ) {
    throw new Error(
      "Scheduler runtime state is inconsistent: running state requires isRunning=true.",
    );
  }

  if (
    state !== "running" &&
    isRunning
  ) {
    throw new Error(
      "Scheduler runtime state is inconsistent: isRunning=true requires running state.",
    );
  }
}

export function captureSchedulerOperationalSnapshot(
  source:
    SchedulerOperationalSource,

  observedAtUtc:
    Date,
): SchedulerOperationalSnapshot {
  assertValidDate(
    observedAtUtc,
    "observedAtUtc",
  );

  assertConsistentRuntimeState(
    source.state,
    source.isRunning,
  );

  const lastResult =
    source.getLastResult();

  const lastRun =
    lastResult
      ? clonePollingResult(
          lastResult,
        )
      : null;

  const terminalError =
    normalizeTerminalError(
      source.getTerminalError(),
    );

  return {
    observedAtUtc:
      new Date(
        observedAtUtc.getTime(),
      ),

    runtimeState:
      source.state,

    isRunning:
      source.isRunning,

    health:
      classifyHealth(
        source.state,
        source.isRunning,
        lastRun,
        terminalError,
      ),

    lastRun,

    terminalError,
  };
}
