import sql from "mssql";

import {
  type AutomationStepExecution,
  type CreateAutomationStepExecution,
  type ExecutionStatus,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type StepExecutionRow = {
  step_execution_id: bigint;
  public_id: string;
  execution_id: bigint;
  step_id: bigint;
  attempt_number: number;
  status: ExecutionStatus;
  started_at_utc: Date | null;
  completed_at_utc: Date | null;
  input_json: string | null;
  output_json: string | null;
  error_message: string | null;
};

function mapStepExecution(
  row: StepExecutionRow,
): AutomationStepExecution {
  return {
    stepExecutionId:
      row.step_execution_id,
    publicId:
      row.public_id,
    executionId:
      row.execution_id,
    stepId:
      row.step_id,
    attemptNumber:
      row.attempt_number,
    status:
      row.status,
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
  };
}

export class AutomationStepExecutionRepository {
  async create(
    input: CreateAutomationStepExecution,
  ): Promise<AutomationStepExecution> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "executionId",
          sql.BigInt,
          input.executionId,
        )
        .input(
          "stepId",
          sql.BigInt,
          input.stepId,
        )
        .input(
          "attemptNumber",
          sql.Int,
          input.attemptNumber ?? 1,
        )
        .input(
          "inputJson",
          sql.NVarChar(sql.MAX),
          input.inputJson ?? null,
        )
        .query<StepExecutionRow>(`
          INSERT INTO dbo.automation_step_execution
          (
              execution_id,
              step_id,
              attempt_number,
              input_json
          )
          OUTPUT
              inserted.step_execution_id,
              inserted.public_id,
              inserted.execution_id,
              inserted.step_id,
              inserted.attempt_number,
              inserted.status,
              inserted.started_at_utc,
              inserted.completed_at_utc,
              inserted.input_json,
              inserted.output_json,
              inserted.error_message
          VALUES
          (
              @executionId,
              @stepId,
              @attemptNumber,
              @inputJson
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Step execution creation returned no row.",
      );
    }

    return mapStepExecution(row);
  }

  async transitionStatus(
    stepExecutionId: bigint,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    outputJson?: string | null,
    errorMessage?: string | null,
  ): Promise<AutomationStepExecution | null> {
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
          "stepExecutionId",
          sql.BigInt,
          stepExecutionId,
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
        .query<StepExecutionRow>(`
          UPDATE dbo.automation_step_execution
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
              inserted.step_execution_id,
              inserted.public_id,
              inserted.execution_id,
              inserted.step_id,
              inserted.attempt_number,
              inserted.status,
              inserted.started_at_utc,
              inserted.completed_at_utc,
              inserted.input_json,
              inserted.output_json,
              inserted.error_message

          WHERE
              step_execution_id =
                  @stepExecutionId
              AND status =
                  @expectedStatus;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapStepExecution(row)
      : null;
  }

  async listByExecutionId(
    executionId: bigint,
  ): Promise<AutomationStepExecution[]> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "executionId",
          sql.BigInt,
          executionId,
        )
        .query<StepExecutionRow>(`
          SELECT
              step_execution_id,
              public_id,
              execution_id,
              step_id,
              attempt_number,
              status,
              started_at_utc,
              completed_at_utc,
              input_json,
              output_json,
              error_message
          FROM dbo.automation_step_execution
          WHERE execution_id =
              @executionId
          ORDER BY
              step_id,
              attempt_number;
        `);

    return result.recordset.map(
      mapStepExecution,
    );
  }
}
