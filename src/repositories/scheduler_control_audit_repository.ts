import {
  getDatabasePool,
} from "../database/sqlserver.js";

import type {
  SchedulerControlCommand,
  SchedulerControlDisposition,
  SchedulerControlResult,
} from "../operations/scheduler_control_service.js";

import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

export type SchedulerControlAuditStatus =
  | "pending"
  | "completed"
  | "failed";

export type SchedulerControlAuditRecord = {
  auditId:
    bigint;

  publicId:
    string;

  requestKey:
    string | null;

  command:
    SchedulerControlCommand;

  auditStatus:
    SchedulerControlAuditStatus;

  disposition:
    SchedulerControlDisposition | null;

  previousState:
    SchedulerRuntimeState | null;

  currentState:
    SchedulerRuntimeState | null;

  changed:
    boolean | null;

  reason:
    string | null;

  errorMessage:
    string | null;

  createdAtUtc:
    Date;

  completedAtUtc:
    Date | null;

  rowVersion:
    Buffer;
};

export type CreateSchedulerControlAuditInput = {
  command:
    SchedulerControlCommand;

  requestKey:
    string | null;
};

type AuditRow = {
  audit_id:
    bigint;

  public_id:
    string;

  request_key:
    string | null;

  command:
    SchedulerControlCommand;

  audit_status:
    SchedulerControlAuditStatus;

  disposition:
    SchedulerControlDisposition | null;

  previous_state:
    SchedulerRuntimeState | null;

  current_state:
    SchedulerRuntimeState | null;

  changed:
    boolean | null;

  reason:
    string | null;

  error_message:
    string | null;

  created_at_utc:
    Date;

  completed_at_utc:
    Date | null;

  row_version:
    Buffer;
};

function mapAudit(
  row:
    AuditRow,
): SchedulerControlAuditRecord {
  return {
    auditId:
      row.audit_id,

    publicId:
      row.public_id,

    requestKey:
      row.request_key,

    command:
      row.command,

    auditStatus:
      row.audit_status,

    disposition:
      row.disposition,

    previousState:
      row.previous_state,

    currentState:
      row.current_state,

    changed:
      row.changed,

    reason:
      row.reason,

    errorMessage:
      row.error_message,

    createdAtUtc:
      new Date(
        row.created_at_utc,
      ),

    completedAtUtc:
      row.completed_at_utc === null
        ? null
        : new Date(
            row.completed_at_utc,
          ),

    rowVersion:
      Buffer.from(
        row.row_version,
      ),
  };
}

function assertLimit(
  limit:
    number,
): void {
  if (
    !Number.isInteger(
      limit,
    ) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error(
      "limit must be an integer from 1 to 100.",
    );
  }
}

export class SchedulerControlAuditRepository {
  public async createPending(
    input:
      CreateSchedulerControlAuditInput,
  ): Promise<SchedulerControlAuditRecord> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "command",
          input.command,
        )
        .input(
          "requestKey",
          input.requestKey,
        )
        .query<AuditRow>(`
          INSERT INTO dbo.scheduler_control_command_audit
          (
              request_key,
              command,
              audit_status
          )
          OUTPUT
              inserted.audit_id,
              inserted.public_id,
              inserted.request_key,
              inserted.command,
              inserted.audit_status,
              inserted.disposition,
              inserted.previous_state,
              inserted.current_state,
              inserted.changed,
              inserted.reason,
              inserted.error_message,
              inserted.created_at_utc,
              inserted.completed_at_utc,
              inserted.row_version
          VALUES
          (
              @requestKey,
              @command,
              N'pending'
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Unable to persist scheduler control audit intent.",
      );
    }

    return mapAudit(
      row,
    );
  }

  public async complete(
    publicId:
      string,

    result:
      SchedulerControlResult,
  ): Promise<SchedulerControlAuditRecord | null> {
    const pool =
      await getDatabasePool();

    const updated =
      await pool
        .request()
        .input(
          "publicId",
          publicId,
        )
        .input(
          "disposition",
          result.disposition,
        )
        .input(
          "previousState",
          result.previousState,
        )
        .input(
          "currentState",
          result.currentState,
        )
        .input(
          "changed",
          result.changed,
        )
        .input(
          "reason",
          result.reason,
        )
        .query<AuditRow>(`
          UPDATE dbo.scheduler_control_command_audit
          SET
              audit_status =
                  N'completed',
              disposition =
                  @disposition,
              previous_state =
                  @previousState,
              current_state =
                  @currentState,
              changed =
                  @changed,
              reason =
                  @reason,
              error_message =
                  NULL,
              completed_at_utc =
                  SYSUTCDATETIME()
          OUTPUT
              inserted.audit_id,
              inserted.public_id,
              inserted.request_key,
              inserted.command,
              inserted.audit_status,
              inserted.disposition,
              inserted.previous_state,
              inserted.current_state,
              inserted.changed,
              inserted.reason,
              inserted.error_message,
              inserted.created_at_utc,
              inserted.completed_at_utc,
              inserted.row_version
          WHERE
              public_id =
                  @publicId
              AND audit_status =
                  N'pending';
        `);

    const row =
      updated.recordset[0];

    return row
      ? mapAudit(
          row,
        )
      : null;
  }

  public async fail(
    publicId:
      string,

    errorMessage:
      string,
  ): Promise<SchedulerControlAuditRecord | null> {
    const pool =
      await getDatabasePool();

    const updated =
      await pool
        .request()
        .input(
          "publicId",
          publicId,
        )
        .input(
          "errorMessage",
          errorMessage,
        )
        .query<AuditRow>(`
          UPDATE dbo.scheduler_control_command_audit
          SET
              audit_status =
                  N'failed',
              disposition =
                  NULL,
              previous_state =
                  NULL,
              current_state =
                  NULL,
              changed =
                  NULL,
              reason =
                  NULL,
              error_message =
                  @errorMessage,
              completed_at_utc =
                  SYSUTCDATETIME()
          OUTPUT
              inserted.audit_id,
              inserted.public_id,
              inserted.request_key,
              inserted.command,
              inserted.audit_status,
              inserted.disposition,
              inserted.previous_state,
              inserted.current_state,
              inserted.changed,
              inserted.reason,
              inserted.error_message,
              inserted.created_at_utc,
              inserted.completed_at_utc,
              inserted.row_version
          WHERE
              public_id =
                  @publicId
              AND audit_status =
                  N'pending';
        `);

    const row =
      updated.recordset[0];

    return row
      ? mapAudit(
          row,
        )
      : null;
  }

  public async listRecent(
    limit =
      50,
  ): Promise<SchedulerControlAuditRecord[]> {
    assertLimit(
      limit,
    );

    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .input(
          "limit",
          limit,
        )
        .query<AuditRow>(`
          SELECT TOP (@limit)
              audit_id,
              public_id,
              request_key,
              command,
              audit_status,
              disposition,
              previous_state,
              current_state,
              changed,
              reason,
              error_message,
              created_at_utc,
              completed_at_utc,
              row_version
          FROM dbo.scheduler_control_command_audit
          ORDER BY
              audit_id DESC;
        `);

    return result.recordset.map(
      mapAudit,
    );
  }
}
