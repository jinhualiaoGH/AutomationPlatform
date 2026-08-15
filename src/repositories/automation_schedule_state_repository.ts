import sql from "mssql";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

import type {
  AdvanceAutomationScheduleState,
  AutomationScheduleState,
  DueAutomationSchedule,
  InitializeAutomationScheduleState,
} from "../scheduling/schedule_state.js";

type ScheduleStateRow = {
  schedule_state_id: bigint;
  trigger_id: bigint;
  next_fire_at_utc: Date;
  last_evaluated_at_utc: Date | null;
  created_at_utc: Date;
  updated_at_utc: Date;
  row_version: Buffer;
};

type DueScheduleRow = ScheduleStateRow & {
  trigger_public_id: string;
  automation_id: bigint;
  automation_public_id: string;
  configuration_json: string;
};

function mapScheduleState(
  row: ScheduleStateRow,
): AutomationScheduleState {
  return {
    scheduleStateId: row.schedule_state_id,
    triggerId: row.trigger_id,
    nextFireAtUtc: row.next_fire_at_utc,
    lastEvaluatedAtUtc: row.last_evaluated_at_utc,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
    rowVersion: row.row_version,
  };
}

function mapDueSchedule(
  row: DueScheduleRow,
): DueAutomationSchedule {
  return {
    scheduleStateId: row.schedule_state_id,
    triggerId: row.trigger_id,
    triggerPublicId: row.trigger_public_id,
    automationId: row.automation_id,
    automationPublicId: row.automation_public_id,
    configurationJson: row.configuration_json,
    nextFireAtUtc: row.next_fire_at_utc,
    lastEvaluatedAtUtc: row.last_evaluated_at_utc,
    rowVersion: row.row_version,
  };
}

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(
      name + " must be a valid Date.",
    );
  }
}

export class AutomationScheduleStateRepository {
  async initialize(
    input: InitializeAutomationScheduleState,
  ): Promise<AutomationScheduleState> {
    assertValidDate(
      input.nextFireAtUtc,
      "nextFireAtUtc",
    );

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "triggerId",
          sql.BigInt,
          input.triggerId,
        )
        .input(
          "nextFireAtUtc",
          sql.DateTime2(7),
          input.nextFireAtUtc,
        )
        .query<ScheduleStateRow>(`
          INSERT INTO dbo.automation_schedule_state
          (
              trigger_id,
              next_fire_at_utc
          )
          OUTPUT
              inserted.schedule_state_id,
              inserted.trigger_id,
              inserted.next_fire_at_utc,
              inserted.last_evaluated_at_utc,
              inserted.created_at_utc,
              inserted.updated_at_utc,
              inserted.row_version
          VALUES
          (
              @triggerId,
              @nextFireAtUtc
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Schedule-state initialization returned no row.",
      );
    }

    return mapScheduleState(row);
  }

  async getByTriggerId(
    triggerId: bigint,
  ): Promise<AutomationScheduleState | null> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "triggerId",
          sql.BigInt,
          triggerId,
        )
        .query<ScheduleStateRow>(`
          SELECT
              schedule_state_id,
              trigger_id,
              next_fire_at_utc,
              last_evaluated_at_utc,
              created_at_utc,
              updated_at_utc,
              row_version
          FROM dbo.automation_schedule_state
          WHERE trigger_id = @triggerId;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapScheduleState(row)
      : null;
  }

  async listDue(
    evaluatedAtUtc: Date,
    limit = 100,
  ): Promise<DueAutomationSchedule[]> {
    assertValidDate(
      evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    ) {
      throw new Error(
        "limit must be an integer from 1 through 1000.",
      );
    }

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "evaluatedAtUtc",
          sql.DateTime2(7),
          evaluatedAtUtc,
        )
        .input(
          "limit",
          sql.Int,
          limit,
        )
        .query<DueScheduleRow>(`
          SELECT TOP (@limit)
              state.schedule_state_id,
              state.trigger_id,
              trigger_row.public_id AS trigger_public_id,
              trigger_row.automation_id,
              automation.public_id AS automation_public_id,
              trigger_row.configuration_json,
              state.next_fire_at_utc,
              state.last_evaluated_at_utc,
              state.created_at_utc,
              state.updated_at_utc,
              state.row_version
          FROM dbo.automation_schedule_state AS state
          INNER JOIN dbo.automation_trigger AS trigger_row
              ON trigger_row.trigger_id = state.trigger_id
          INNER JOIN dbo.automation_definition AS automation
              ON automation.automation_id =
                 trigger_row.automation_id
          WHERE
              state.next_fire_at_utc <= @evaluatedAtUtc
              AND trigger_row.trigger_type = N'schedule'
              AND trigger_row.is_enabled = 1
              AND automation.status = N'active'
          ORDER BY
              state.next_fire_at_utc,
              state.trigger_id;
        `);

    return result.recordset.map(
      mapDueSchedule,
    );
  }

  async advance(
    input: AdvanceAutomationScheduleState,
  ): Promise<AutomationScheduleState | null> {
    assertValidDate(
      input.evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    assertValidDate(
      input.nextFireAtUtc,
      "nextFireAtUtc",
    );

    if (
      input.nextFireAtUtc.getTime() <=
      input.evaluatedAtUtc.getTime()
    ) {
      throw new Error(
        "nextFireAtUtc must be later than evaluatedAtUtc.",
      );
    }

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "triggerId",
          sql.BigInt,
          input.triggerId,
        )
        .input(
          "evaluatedAtUtc",
          sql.DateTime2(7),
          input.evaluatedAtUtc,
        )
        .input(
          "nextFireAtUtc",
          sql.DateTime2(7),
          input.nextFireAtUtc,
        )
        .input(
          "rowVersion",
          sql.VarBinary(8),
          input.rowVersion,
        )
        .query<ScheduleStateRow>(`
          UPDATE dbo.automation_schedule_state
          SET
              last_evaluated_at_utc =
                  @evaluatedAtUtc,
              next_fire_at_utc =
                  @nextFireAtUtc,
              updated_at_utc =
                  SYSUTCDATETIME()
          OUTPUT
              inserted.schedule_state_id,
              inserted.trigger_id,
              inserted.next_fire_at_utc,
              inserted.last_evaluated_at_utc,
              inserted.created_at_utc,
              inserted.updated_at_utc,
              inserted.row_version
          WHERE
              trigger_id = @triggerId
              AND row_version = @rowVersion;
        `);

    const row =
      result.recordset[0];

    return row
      ? mapScheduleState(row)
      : null;
  }
}
