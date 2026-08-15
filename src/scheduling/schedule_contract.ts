export const scheduledTriggerType =
  "schedule" as const;

export const minimumIntervalSeconds = 1;

export type ScheduledTriggerType =
  typeof scheduledTriggerType;

export type IntervalSchedule = {
  kind: "interval";
  intervalSeconds: number;
};

export type Schedule =
  | IntervalSchedule;

export type IntervalScheduleConfiguration = {
  intervalSeconds: number;
};
