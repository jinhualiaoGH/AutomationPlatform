import type {
  SchedulerMetricsSnapshot,
} from "./scheduler_metrics.js";

import type {
  SchedulerOperationalHealth,
  SchedulerOperationalSnapshot,
  SchedulerOperationalSource,
} from "./scheduler_operational_snapshot.js";

import {
  captureSchedulerOperationalSnapshot,
} from "./scheduler_operational_snapshot.js";

export type SchedulerMetricsSource = {
  getSnapshot():
    SchedulerMetricsSnapshot;
};

export type SchedulerOperationalStatus = {
  observedAtUtc:
    Date;

  runtimeState:
    SchedulerOperationalSnapshot["runtimeState"];

  isRunning:
    boolean;

  health:
    SchedulerOperationalHealth;

  terminalError:
    string | null;

  metrics:
    SchedulerMetricsSnapshot;
};

export type SchedulerStatusClock =
  () => Date;

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

function cloneMetrics(
  metrics:
    SchedulerMetricsSnapshot,
): SchedulerMetricsSnapshot {
  return {
    ...metrics,

    lastEvaluatedAtUtc:
      metrics.lastEvaluatedAtUtc
        ? new Date(
            metrics.lastEvaluatedAtUtc
              .getTime(),
          )
        : null,
  };
}

function classifyCurrentHealth(
  runtime:
    SchedulerOperationalSnapshot,

  metrics:
    SchedulerMetricsSnapshot,
): SchedulerOperationalHealth {
  if (
    runtime.runtimeState === "failed" ||
    runtime.terminalError !== null
  ) {
    return "failed";
  }

  if (runtime.runtimeState === "idle") {
    return "idle";
  }

  if (runtime.runtimeState === "stopped") {
    return "stopped";
  }

  if (
    runtime.runtimeState === "running" &&
    metrics.lastCycleError !== null
  ) {
    return "degraded";
  }

  if (
    runtime.runtimeState === "running" &&
    runtime.isRunning
  ) {
    return "healthy";
  }

  return "degraded";
}

export class SchedulerStatusService {
  public constructor(
    private readonly runtime:
      SchedulerOperationalSource,

    private readonly metrics:
      SchedulerMetricsSource,

    private readonly clock:
      SchedulerStatusClock =
      () => new Date(),
  ) {}

  public getStatus():
    SchedulerOperationalStatus {
    const observedAtUtc =
      this.clock();

    assertValidDate(
      observedAtUtc,
      "clock result",
    );

    const runtime =
      captureSchedulerOperationalSnapshot(
        this.runtime,
        observedAtUtc,
      );

    const metrics =
      cloneMetrics(
        this.metrics.getSnapshot(),
      );

    return {
      observedAtUtc:
        new Date(
          observedAtUtc.getTime(),
        ),

      runtimeState:
        runtime.runtimeState,

      isRunning:
        runtime.isRunning,

      health:
        classifyCurrentHealth(
          runtime,
          metrics,
        ),

      terminalError:
        runtime.terminalError,

      metrics,
    };
  }
}
