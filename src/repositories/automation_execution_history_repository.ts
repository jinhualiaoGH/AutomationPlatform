import sql from "mssql";

import type {
  AutomationExecution,
  ExecutionStatus,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type ExecutionHistoryRow = {
  execution_id:
    bigint;

  public_id:
    string;

  automation_id:
    bigint;

  trigger_id:
    bigint | null;

  status:
    ExecutionStatus;

  requested_at_utc:
    Date;

  started_at_utc:
    Date | null;

  completed_at_utc:
    Date | null;

  input_json:
    string | null;

  output_json:
    string | null;

  error_message:
    string | null;

  row_version:
    Buffer;
};

export const defaultExecutionHistoryLimit =
  50;

export const maximumExecutionHistoryLimit =
  200;

function validateLimit(
  limit: number,
): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > maximumExecutionHistoryLimit
  ) {
    throw new Error(
      "Execution history limit must be an integer from 1 through " +
      maximumExecutionHistoryLimit +
      ".",
    );
  }
}

function mapExecution(
  row:
    ExecutionHistoryRow,
): AutomationExecution {
  return {
    executionId:
      row.execution_id,

    publicId:
      row.public_id,

    automationId:
      row.automation_id,

    triggerId:
      row.trigger_id,

    status:
      row.status,

    requestedAtUtc:
      row.requested_at_utc,

    startedAtUtc:
      row.started_at_utc,

    completedAtUtc:
      row.completed_at_utc,

    inputJson:
      row.input_json,

    outputJson:
      row.output_json,

    errorMessage:
      row.error_message,

    rowVersion:
      row.row_version,
  };
}

const executionProjection = `
    execution_id,
    public_id,
    automation_id,
    trigger_id,
    status,
    requested_at_utc,
    started_at_utc,
    completed_at_utc,
    input_json,
    output_json,
    error_message,
    row_version
`;

export class AutomationExecutionHistoryRepository {
  public async listRecent(
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<AutomationExecution[]> {
    validateLimit(
      limit,
    );

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "limit",
          sql.Int,
          limit,
        )
        .query<ExecutionHistoryRow>(`
          SELECT TOP (@limit)
              ${executionProjection}
          FROM dbo.automation_execution
          ORDER BY
              requested_at_utc DESC,
              execution_id DESC;
        `);

    return result.recordset.map(
      mapExecution,
    );
  }

  public async listRecentByAutomationId(
    automationId: bigint,
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<AutomationExecution[]> {
    if (automationId <= 0n) {
      throw new Error(
        "automationId must be positive.",
      );
    }

    validateLimit(
      limit,
    );

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "automationId",
          sql.BigInt,
          automationId,
        )
        .input(
          "limit",
          sql.Int,
          limit,
        )
        .query<ExecutionHistoryRow>(`
          SELECT TOP (@limit)
              ${executionProjection}
          FROM dbo.automation_execution
          WHERE automation_id = @automationId
          ORDER BY
              requested_at_utc DESC,
              execution_id DESC;
        `);

    return result.recordset.map(
      mapExecution,
    );
  }

  public async listRecentFailures(
    limit:
      number =
      defaultExecutionHistoryLimit,
  ): Promise<AutomationExecution[]> {
    validateLimit(
      limit,
    );

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "limit",
          sql.Int,
          limit,
        )
        .input(
          "status",
          sql.NVarChar(20),
          "failed",
        )
        .query<ExecutionHistoryRow>(`
          SELECT TOP (@limit)
              ${executionProjection}
          FROM dbo.automation_execution
          WHERE status = @status
          ORDER BY
              requested_at_utc DESC,
              execution_id DESC;
        `);

    return result.recordset.map(
      mapExecution,
    );
  }
}
