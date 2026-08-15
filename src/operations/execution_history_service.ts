import type {
  AutomationExecution,
  ExecutionStatus,
} from "../domain/automation.js";

import {
  defaultExecutionHistoryLimit,
} from "../repositories/automation_execution_history_repository.js";

export type ExecutionHistorySource = {
  listRecent(
    limit?: number,
  ): Promise<AutomationExecution[]>;

  listRecentByAutomationId(
    automationId: bigint,
    limit?: number,
  ): Promise<AutomationExecution[]>;

  listRecentFailures(
    limit?: number,
  ): Promise<AutomationExecution[]>;
};

export type ExecutionHistoryItem = {
  publicId:
    string;

  automationId:
    bigint;

  triggerId:
    bigint | null;

  status:
    ExecutionStatus;

  requestedAtUtc:
    Date;

  startedAtUtc:
    Date | null;

  completedAtUtc:
    Date | null;

  durationMilliseconds:
    number | null;

  errorMessage:
    string | null;

  hasFailure:
    boolean;
};

export type ExecutionHistoryResult = {
  count:
    number;

  items:
    ExecutionHistoryItem[];
};

function cloneDate(
  value:
    Date | null,
): Date | null {
  return value
    ? new Date(
        value.getTime(),
      )
    : null;
}

function executionDuration(
  execution:
    AutomationExecution,
): number | null {
  if (
    !execution.startedAtUtc ||
    !execution.completedAtUtc
  ) {
    return null;
  }

  return Math.max(
    0,
    execution.completedAtUtc.getTime() -
      execution.startedAtUtc.getTime(),
  );
}

function toHistoryItem(
  execution:
    AutomationExecution,
): ExecutionHistoryItem {
  return {
    publicId:
      execution.publicId,

    automationId:
      execution.automationId,

    triggerId:
      execution.triggerId,

    status:
      execution.status,

    requestedAtUtc:
      new Date(
        execution.requestedAtUtc.getTime(),
      ),

    startedAtUtc:
      cloneDate(
        execution.startedAtUtc,
      ),

    completedAtUtc:
      cloneDate(
        execution.completedAtUtc,
      ),

    durationMilliseconds:
      executionDuration(
        execution,
      ),

    errorMessage:
      execution.errorMessage,

    hasFailure:
      execution.status === "failed",
  };
}

function toResult(
  executions:
    AutomationExecution[],
): ExecutionHistoryResult {
  const items =
    executions.map(
      toHistoryItem,
    );

  return {
    count:
      items.length,

    items,
  };
}

export class ExecutionHistoryService {
  public constructor(
    private readonly source:
      ExecutionHistorySource,
  ) {}

  public async getRecent(
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<ExecutionHistoryResult> {
    return toResult(
      await this.source.listRecent(
        limit,
      ),
    );
  }

  public async getRecentForAutomation(
    automationId: bigint,
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<ExecutionHistoryResult> {
    return toResult(
      await this.source
        .listRecentByAutomationId(
          automationId,
          limit,
        ),
    );
  }

  public async getRecentFailures(
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<ExecutionHistoryResult> {
    return toResult(
      await this.source
        .listRecentFailures(
          limit,
        ),
    );
  }
}
