import sql from "mssql";

import {
  type AutomationStep,
  type CreateAutomationStep,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type StepRow = {
  step_id: bigint;
  public_id: string;
  automation_id: bigint;
  step_order: number;
  step_type: string;
  name: string;
  configuration_json: string;
  timeout_seconds: number | null;
  created_at_utc: Date;
  updated_at_utc: Date;
};

function mapStep(
  row: StepRow,
): AutomationStep {
  return {
    stepId: row.step_id,
    publicId: row.public_id,
    automationId: row.automation_id,
    stepOrder: row.step_order,
    stepType: row.step_type,
    name: row.name,
    configurationJson: row.configuration_json,
    timeoutSeconds: row.timeout_seconds,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
  };
}

export class AutomationStepRepository {
  async create(
    input: CreateAutomationStep,
  ): Promise<AutomationStep> {
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
          "stepOrder",
          sql.Int,
          input.stepOrder,
        )
        .input(
          "stepType",
          sql.NVarChar(50),
          input.stepType,
        )
        .input(
          "name",
          sql.NVarChar(200),
          input.name,
        )
        .input(
          "configurationJson",
          sql.NVarChar(sql.MAX),
          input.configurationJson ?? "{}",
        )
        .input(
          "timeoutSeconds",
          sql.Int,
          input.timeoutSeconds ?? null,
        )
        .query<StepRow>(`
          INSERT INTO dbo.automation_step
          (
              automation_id,
              step_order,
              step_type,
              name,
              configuration_json,
              timeout_seconds
          )
          OUTPUT
              inserted.step_id,
              inserted.public_id,
              inserted.automation_id,
              inserted.step_order,
              inserted.step_type,
              inserted.name,
              inserted.configuration_json,
              inserted.timeout_seconds,
              inserted.created_at_utc,
              inserted.updated_at_utc
          VALUES
          (
              @automationId,
              @stepOrder,
              @stepType,
              @name,
              @configurationJson,
              @timeoutSeconds
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Step creation returned no row.",
      );
    }

    return mapStep(row);
  }

  async listByAutomationId(
    automationId: bigint,
  ): Promise<AutomationStep[]> {
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
        .query<StepRow>(`
          SELECT
              step_id,
              public_id,
              automation_id,
              step_order,
              step_type,
              name,
              configuration_json,
              timeout_seconds,
              created_at_utc,
              updated_at_utc
          FROM dbo.automation_step
          WHERE automation_id = @automationId
          ORDER BY step_order;
        `);

    return result.recordset.map(
      mapStep,
    );
  }
}
