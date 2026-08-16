import {
  getDatabasePool,
} from "../database/sqlserver.js";

import type {
  RecoveryAwareSchedulerControlCommand,
  RecoveryAwareSchedulerControlResult,
} from "../recovery/recovery_aware_scheduler_control_service.js";

export type SchedulerRecoveryAuditStatus =
  | "pending"
  | "completed"
  | "failed";

export type SchedulerRecoveryAuditRecord = {
  publicId:
    string;

  command:
    RecoveryAwareSchedulerControlCommand;

  requestKey:
    string | null;

  auditStatus:
    SchedulerRecoveryAuditStatus;

  disposition:
    "executed" | "noop" | "rejected" | null;

  previousState:
    string | null;

  currentState:
    string | null;

  previousGeneration:
    number | null;

  currentGeneration:
    number | null;

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
};

type AuditRow = {
  public_id:
    string;

  command:
    RecoveryAwareSchedulerControlCommand;

  request_key:
    string | null;

  audit_status:
    SchedulerRecoveryAuditStatus;

  disposition:
    "executed" | "noop" | "rejected" | null;

  previous_state:
    string | null;

  current_state:
    string | null;

  previous_generation:
    string | number | null;

  current_generation:
    string | number | null;

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
};

function mapGeneration(
  value:
    string | number | null,
): number | null {
  if (value === null) {
    return null;
  }

  const mapped =
    typeof value === "number"
      ? value
      : Number(
          value,
        );

  if (
    !Number.isSafeInteger(
      mapped,
    ) ||
    mapped < 1
  ) {
    throw new Error(
      "Invalid scheduler generation returned from SQL Server.",
    );
  }

  return mapped;
}
function mapRow(
  row:
    AuditRow,
): SchedulerRecoveryAuditRecord {
  return {
    publicId:
      row.public_id,

    command:
      row.command,

    requestKey:
      row.request_key,

    auditStatus:
      row.audit_status,

    disposition:
      row.disposition,

    previousState:
      row.previous_state,

    currentState:
      row.current_state,

    previousGeneration:
      mapGeneration(
        row.previous_generation,
      ),

    currentGeneration:
      mapGeneration(
        row.current_generation,
      ),

    changed:
      row.changed,

    reason:
      row.reason,

    errorMessage:
      row.error_message,

    createdAtUtc:
      row.created_at_utc,

    completedAtUtc:
      row.completed_at_utc,
  };
}

function validateLimit(
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
      "limit must be an integer from 1 through 100.",
    );
  }
}

export class SchedulerRecoveryControlAuditRepository {
  public async createPending(
    input: {
      command:
        RecoveryAwareSchedulerControlCommand;

      requestKey:
        string | null;
    },
  ): Promise<{
    publicId:
      string;
  }> {
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
        .query<{
          public_id:
            string;
        }>(`
          INSERT INTO
              dbo.scheduler_recovery_command_audit
          (
              command,
              request_key,
              audit_status
          )
          OUTPUT
              inserted.public_id
          VALUES
          (
              @command,
              @requestKey,
              N'pending'
          );
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Recovery audit pending insert returned no row.",
      );
    }

    return {
      publicId:
        row.public_id,
    };
  }

  public async complete(
    publicId:
      string,

    result:
      RecoveryAwareSchedulerControlResult,
  ): Promise<void> {
    const generationResult =
      "previousGeneration" in result
        ? result
        : null;

    const pool =
      await getDatabasePool();

    const update =
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
          "previousGeneration",
          generationResult
            ?.previousGeneration ??
            null,
        )
        .input(
          "currentGeneration",
          generationResult
            ?.currentGeneration ??
            null,
        )
        .input(
          "changed",
          result.changed,
        )
        .input(
          "reason",
          result.reason,
        )
        .query(`
          UPDATE
              dbo.scheduler_recovery_command_audit
          SET
              audit_status =
                  N'completed',

              disposition =
                  @disposition,

              previous_state =
                  @previousState,

              current_state =
                  @currentState,

              previous_generation =
                  @previousGeneration,

              current_generation =
                  @currentGeneration,

              changed =
                  @changed,

              reason =
                  @reason,

              error_message =
                  NULL,

              completed_at_utc =
                  SYSUTCDATETIME()
          WHERE
              public_id =
                  @publicId
              AND audit_status =
                  N'pending';
        `);

    if (
      update.rowsAffected[0] !==
      1
    ) {
      throw new Error(
        "Recovery audit completion requires exactly one pending record.",
      );
    }
  }

  public async fail(
    publicId:
      string,

    errorMessage:
      string,
  ): Promise<void> {
    const pool =
      await getDatabasePool();

    const update =
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
        .query(`
          UPDATE
              dbo.scheduler_recovery_command_audit
          SET
              audit_status =
                  N'failed',

              error_message =
                  @errorMessage,

              completed_at_utc =
                  SYSUTCDATETIME()
          WHERE
              public_id =
                  @publicId
              AND audit_status =
                  N'pending';
        `);

    if (
      update.rowsAffected[0] !==
      1
    ) {
      throw new Error(
        "Recovery audit failure requires exactly one pending record.",
      );
    }
  }

  public async listRecent(
    limit:
      number = 50,
  ): Promise<
    SchedulerRecoveryAuditRecord[]
  > {
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
          limit,
        )
        .query<AuditRow>(`
          SELECT TOP (@limit)
              public_id,
              command,
              request_key,
              audit_status,
              disposition,
              previous_state,
              current_state,
              previous_generation,
              current_generation,
              changed,
              reason,
              error_message,
              created_at_utc,
              completed_at_utc
          FROM
              dbo.scheduler_recovery_command_audit
          ORDER BY
              recovery_audit_id DESC;
        `);

    return result.recordset.map(
      mapRow,
    );
  }
}
