import sql from "mssql";

import {
  type AutomationTrigger,
  type CreateAutomationTrigger,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type TriggerRow = {
  trigger_id: bigint;
  public_id: string;
  automation_id: bigint;
  trigger_type: string;
  configuration_json: string;
  is_enabled: boolean;
  created_at_utc: Date;
  updated_at_utc: Date;
};

function mapTrigger(
  row: TriggerRow,
): AutomationTrigger {
  return {
    triggerId: row.trigger_id,
    publicId: row.public_id,
    automationId: row.automation_id,
    triggerType: row.trigger_type,
    configurationJson: row.configuration_json,
    isEnabled: row.is_enabled,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
  };
}

export class AutomationTriggerRepository {
  async create(
    input: CreateAutomationTrigger,
  ): Promise<AutomationTrigger> {
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
          "triggerType",
          sql.NVarChar(50),
          input.triggerType,
        )
        .input(
          "configurationJson",
          sql.NVarChar(sql.MAX),
          input.configurationJson ?? "{}",
        )
        .input(
          "isEnabled",
          sql.Bit,
          input.isEnabled ?? true,
        )
        .query<TriggerRow>(`
          INSERT INTO dbo.automation_trigger
          (
              automation_id,
              trigger_type,
              configuration_json,
              is_enabled
          )
          OUTPUT
              inserted.trigger_id,
              inserted.public_id,
              inserted.automation_id,
              inserted.trigger_type,
              inserted.configuration_json,
              inserted.is_enabled,
              inserted.created_at_utc,
              inserted.updated_at_utc
          VALUES
          (
              @automationId,
              @triggerType,
              @configurationJson,
              @isEnabled
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Trigger creation returned no row.",
      );
    }

    return mapTrigger(row);
  }

  async listByAutomationId(
    automationId: bigint,
  ): Promise<AutomationTrigger[]> {
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
        .query<TriggerRow>(`
          SELECT
              trigger_id,
              public_id,
              automation_id,
              trigger_type,
              configuration_json,
              is_enabled,
              created_at_utc,
              updated_at_utc
          FROM dbo.automation_trigger
          WHERE automation_id = @automationId
          ORDER BY trigger_id;
        `);

    return result.recordset.map(
      mapTrigger,
    );
  }
}
