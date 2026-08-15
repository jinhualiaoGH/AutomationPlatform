export type AutomationScheduleState = {
  scheduleStateId: bigint;
  triggerId: bigint;
  nextFireAtUtc: Date;
  lastEvaluatedAtUtc: Date | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  rowVersion: Buffer;
};

export type InitializeAutomationScheduleState = {
  triggerId: bigint;
  nextFireAtUtc: Date;
};

export type AdvanceAutomationScheduleState = {
  triggerId: bigint;
  evaluatedAtUtc: Date;
  nextFireAtUtc: Date;
  rowVersion: Buffer;
};

export type DueAutomationSchedule = {
  scheduleStateId: bigint;
  triggerId: bigint;
  triggerPublicId: string;
  automationId: bigint;
  automationPublicId: string;
  configurationJson: string;
  nextFireAtUtc: Date;
  lastEvaluatedAtUtc: Date | null;
  rowVersion: Buffer;
};
