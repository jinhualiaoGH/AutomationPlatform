import type {
  Schedule,
} from "./schedule_contract.js";

export interface ScheduleEvaluation {
  readonly nextFireAt: Date;
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

function evaluateIntervalSchedule(
  schedule: Schedule,
  referenceTime: Date,
): ScheduleEvaluation {
  if (schedule.kind !== "interval") {
    throw new Error(
      "Unsupported schedule kind: " + schedule.kind,
    );
  }

  const intervalMs =
    schedule.intervalSeconds * 1000;

  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs <= 0
  ) {
    throw new Error(
      "Interval duration must be a positive safe integer number of milliseconds.",
    );
  }

  const nextMs =
    referenceTime.getTime() + intervalMs;

  if (!Number.isSafeInteger(nextMs)) {
    throw new Error(
      "Computed next fire time is outside the supported timestamp range.",
    );
  }

  const nextFireAt =
    new Date(nextMs);

  assertValidDate(
    nextFireAt,
    "Computed next fire time",
  );

  return {
    nextFireAt,
  };
}

export function evaluateSchedule(
  schedule: Schedule,
  referenceTime: Date,
): ScheduleEvaluation {
  assertValidDate(
    referenceTime,
    "referenceTime",
  );

  return evaluateIntervalSchedule(
    schedule,
    referenceTime,
  );
}
