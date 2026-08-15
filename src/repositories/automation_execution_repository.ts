import sql from "mssql";

import {
  type AutomationExecution,
  type CreateAutomationExecution,
  type ExecutionStatus,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type ExecutionRow = {
  execution_id: bigint;
  public_id: string;
  automation_id: bigint;
  trigger_id: bigint | null;
  status: ExecutionStatus;
  requested_at_utc: Date;
  started_at_utc: Date | null;
  completed_at_utc: Date | null;
  input_json: string | null;
  output_json: string | null;
  error_message: string | null;
  row_version: Buffer;
};

function mapExecution(
  row: ExecutionRow,
): AutomationExecution {
  return {
    executionId: row.execution_id,
    publicId: row.public_id,
    automationId: row.automation_id,
    triggerId: row.trigger_id,
    status: row.status,
    requestedAtUtc: row.requested_at_utc,
    startedAtUtc: row.started_at_utc,
    completedAtUtc: row.completed_at_utc,
    inputJson: row.input_json,
    outputJson: row.output_json,
    errorMessage: row.error_message,
    rowVersion: row.row_version,
  };
}

export class AutomationExecutionRepository {
  async create(
    input: CreateAutomationExecution,
  ): Promise<AutomationExecution> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "automationId",
          sql.BigInt,
          input.automationId,
        )
        .input(
          "triggerId",
          sql.BigInt,
          input.triggerId ?? null,
        )
        .input(
          "inputJson",
          sql.NVarChar(sql.MAX),
          input.inputJson ?? null,
        )
        .query<ExecutionRow>(`
          INSERT INTO dbo.automation_execution
          (
              automation_id,
              trigger_id,
              input_json
          )
          OUTPUT
              inserted.execution_id,
              inserted.public_id,
              inserted.automation_id,
              inserted.trigger_id,
              inserted.status,
              inserted.requested_at_utc,
              inserted.started_at_utc,
              inserted.completed_at_utc,
              inserted.input_json,
              inserted.output_json,
              inserted.error_message,
              inserted.row_version
          VALUES
          (
              @automationId,
              @triggerId,
              @inputJson
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Execution creation returned no row.",
      );
    }

    return mapExecution(row);
  }

  async getByPublicId(
    publicId: string,
  ): Promise<AutomationExecution | null> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "publicId",
          sql.UniqueIdentifier,
          publicId,
        )
        .query<ExecutionRow>(`
          SELECT
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
          FROM dbo.automation_execution
          WHERE public_id = @publicId;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapExecution(row)
      : null;
  }

  async transitionStatus(
    publicId: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    rowVersion: Buffer,
    outputJson?: string | null,
    errorMessage?: string | null,
  ): Promise<AutomationExecution | null> {
    const pool =
      await getDatabasePool();

    const isStarting =
      nextStatus === "running";

    const isTerminal =
      nextStatus === "succeeded" ||
      nextStatus === "failed" ||
      nextStatus === "cancelled";

    const result =
      await pool
        .request()
        .input(
          "publicId",
          sql.UniqueIdentifier,
          publicId,
        )
        .input(
          "expectedStatus",
          sql.NVarChar(20),
          expectedStatus,
        )
        .input(
          "nextStatus",
          sql.NVarChar(20),
          nextStatus,
        )
        .input(
          "rowVersion",
          sql.VarBinary(8),
          rowVersion,
        )
        .input(
          "outputJson",
          sql.NVarChar(sql.MAX),
          outputJson ?? null,
        )
        .input(
          "errorMessage",
          sql.NVarChar(4000),
          errorMessage ?? null,
        )
        .input(
          "isStarting",
          sql.Bit,
          isStarting,
        )
        .input(
          "isTerminal",
          sql.Bit,
          isTerminal,
        )
        .query<ExecutionRow>(`
          UPDATE dbo.automation_execution
          SET
              status = @nextStatus,

              started_at_utc =
                  CASE
                      WHEN @isStarting = 1
                           AND started_at_utc IS NULL
                      THEN SYSUTCDATETIME()
                      ELSE started_at_utc
                  END,

              completed_at_utc =
                  CASE
                      WHEN @isTerminal = 1
                      THEN SYSUTCDATETIME()
                      ELSE completed_at_utc
                  END,

              output_json =
                  CASE
                      WHEN @isTerminal = 1
                      THEN @outputJson
                      ELSE output_json
                  END,

              error_message =
                  CASE
                      WHEN @isTerminal = 1
                      THEN @errorMessage
                      ELSE error_message
                  END

          OUTPUT
              inserted.execution_id,
              inserted.public_id,
              inserted.automation_id,
              inserted.trigger_id,
              inserted.status,
              inserted.requested_at_utc,
              inserted.started_at_utc,
              inserted.completed_at_utc,
              inserted.input_json,
              inserted.output_json,
              inserted.error_message,
              inserted.row_version

          WHERE
              public_id = @publicId
              AND status = @expectedStatus
              AND row_version = @rowVersion;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapExecution(row)
      : null;
  }
}
