import sql from "mssql";

import {
  type AutomationDefinition,
  type AutomationStatus,
  type CreateAutomationDefinition,
} from "../domain/automation.js";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

type AutomationRow = {
  automation_id: bigint;
  public_id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  created_at_utc: Date;
  updated_at_utc: Date;
  row_version: Buffer;
};

function mapAutomation(
  row: AutomationRow,
): AutomationDefinition {
  return {
    automationId: row.automation_id,
    publicId: row.public_id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
    rowVersion: row.row_version,
  };
}

export class AutomationDefinitionRepository {
  async create(
    input: CreateAutomationDefinition,
  ): Promise<AutomationDefinition> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "name",
          sql.NVarChar(200),
          input.name,
        )
        .input(
          "description",
          sql.NVarChar(1000),
          input.description ?? null,
        )
        .query<AutomationRow>(`
          INSERT INTO dbo.automation_definition
          (
              name,
              description
          )
          OUTPUT
              inserted.automation_id,
              inserted.public_id,
              inserted.name,
              inserted.description,
              inserted.status,
              inserted.created_at_utc,
              inserted.updated_at_utc,
              inserted.row_version
          VALUES
          (
              @name,
              @description
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Automation creation returned no row.",
      );
    }

    return mapAutomation(row);
  }

  async getByPublicId(
    publicId: string,
  ): Promise<AutomationDefinition | null> {
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
        .query<AutomationRow>(`
          SELECT
              automation_id,
              public_id,
              name,
              description,
              status,
              created_at_utc,
              updated_at_utc,
              row_version
          FROM dbo.automation_definition
          WHERE public_id = @publicId;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapAutomation(row)
      : null;
  }

  async list():
  Promise<AutomationDefinition[]> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .query<AutomationRow>(`
          SELECT
              automation_id,
              public_id,
              name,
              description,
              status,
              created_at_utc,
              updated_at_utc,
              row_version
          FROM dbo.automation_definition
          ORDER BY
              automation_id;
        `);

    return result.recordset.map(
      mapAutomation,
    );
  }

  async updateStatus(
    publicId: string,
    status: AutomationStatus,
    rowVersion: Buffer,
  ): Promise<AutomationDefinition | null> {
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
        .input(
          "status",
          sql.NVarChar(20),
          status,
        )
        .input(
          "rowVersion",
          sql.VarBinary(8),
          rowVersion,
        )
        .query<AutomationRow>(`
          UPDATE dbo.automation_definition
          SET
              status = @status,
              updated_at_utc =
                  SYSUTCDATETIME()
          OUTPUT
              inserted.automation_id,
              inserted.public_id,
              inserted.name,
              inserted.description,
              inserted.status,
              inserted.created_at_utc,
              inserted.updated_at_utc,
              inserted.row_version
          WHERE
              public_id = @publicId
              AND row_version = @rowVersion;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapAutomation(row)
      : null;
  }
}
