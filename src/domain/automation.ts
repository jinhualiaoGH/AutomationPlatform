export const automationStatuses = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export type AutomationStatus =
  (typeof automationStatuses)[number];

export type AutomationDefinition = {
  automationId: bigint;
  publicId: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  rowVersion: Buffer;
};

export type CreateAutomationDefinition = {
  name: string;
  description?: string | null;
};

export type UpdateAutomationStatus = {
  publicId: string;
  status: AutomationStatus;
  rowVersion: Buffer;
};

export type AutomationTrigger = {
  triggerId: bigint;
  publicId: string;
  automationId: bigint;
  triggerType: string;
  configurationJson: string;
  isEnabled: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type CreateAutomationTrigger = {
  automationId: bigint;
  triggerType: string;
  configurationJson?: string;
  isEnabled?: boolean;
};

export type AutomationStep = {
  stepId: bigint;
  publicId: string;
  automationId: bigint;
  stepOrder: number;
  stepType: string;
  name: string;
  configurationJson: string;
  timeoutSeconds: number | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
};

export type CreateAutomationStep = {
  automationId: bigint;
  stepOrder: number;
  stepType: string;
  name: string;
  configurationJson?: string;
  timeoutSeconds?: number | null;
};

export const executionStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type ExecutionStatus =
  (typeof executionStatuses)[number];

export type AutomationExecution = {
  executionId: bigint;
  publicId: string;
  automationId: bigint;
  triggerId: bigint | null;
  status: ExecutionStatus;
  requestedAtUtc: Date;
  startedAtUtc: Date | null;
  completedAtUtc: Date | null;
  inputJson: string | null;
  outputJson: string | null;
  errorMessage: string | null;
  rowVersion: Buffer;
};

export type CreateAutomationExecution = {
  automationId: bigint;
  triggerId?: bigint | null;
  inputJson?: string | null;
};

export type AutomationStepExecution = {
  stepExecutionId: bigint;
  publicId: string;
  executionId: bigint;
  stepId: bigint;
  attemptNumber: number;
  status: ExecutionStatus;
  startedAtUtc: Date | null;
  completedAtUtc: Date | null;
  inputJson: string | null;
  outputJson: string | null;
  errorMessage: string | null;
};

export type CreateAutomationStepExecution = {
  executionId: bigint;
  stepId: bigint;
  attemptNumber?: number;
  inputJson?: string | null;
};
