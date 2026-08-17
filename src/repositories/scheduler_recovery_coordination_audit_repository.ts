import {
  getDatabasePool,
} from "../database/sqlserver.js";


export type SchedulerRecoveryCoordinationAuditResultKind =
  | "control"
  | "rejected"
  | "restarted"
  | "superseded";


export type SchedulerRecoveryCoordinationAuditCompletion = {
  readonly resultKind:
    SchedulerRecoveryCoordinationAuditResultKind;

  readonly disposition:
    string | null;

  readonly previousState:
    string | null;

  readonly currentState:
    string | null;

  readonly previousGeneration:
    number | null;

  readonly currentGeneration:
    number | null;

  readonly attemptedGeneration:
    number | null;

  readonly observedGeneration:
    number | null;

  readonly changed:
    boolean | null;

  readonly reason:
    string | null;
};


export type SchedulerRecoveryCoordinationAuditRecord = {
  readonly publicId:
    string;

  readonly command:
    string;

  readonly requestKey:
    string | null;

  readonly auditStatus:
    string;

  readonly resultKind:
    string | null;

  readonly disposition:
    string | null;

  readonly previousState:
    string | null;

  readonly currentState:
    string | null;

  readonly previousGeneration:
    number | null;

  readonly currentGeneration:
    number | null;

  readonly attemptedGeneration:
    number | null;

  readonly observedGeneration:
    number | null;

  readonly changed:
    boolean | null;

  readonly reason:
    string | null;

  readonly errorMessage:
    string | null;

  readonly createdAtUtc:
    Date;

  readonly completedAtUtc:
    Date | null;
};


type AuditRow = {
  readonly public_id:
    string;

  readonly command:
    string;

  readonly request_key:
    string | null;

  readonly audit_status:
    string;

  readonly result_kind:
    string | null;

  readonly disposition:
    string | null;

  readonly previous_state:
    string | null;

  readonly current_state:
    string | null;

  readonly previous_generation:
    number | string | null;

  readonly current_generation:
    number | string | null;

  readonly attempted_generation:
    number | string | null;

  readonly observed_generation:
    number | string | null;

  readonly changed:
    boolean | null;

  readonly reason:
    string | null;

  readonly error_message:
    string | null;

  readonly created_at_utc:
    Date;

  readonly completed_at_utc:
    Date | null;
};


function mapGeneration(
  value:
    number | string | null,
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
    )
  ) {
    throw new Error(
      "Recovery coordination audit generation is not a safe integer.",
    );
  }


  return mapped;
}


function mapRow(
  row:
    AuditRow,
): SchedulerRecoveryCoordinationAuditRecord {

  return {
    publicId:
      row.public_id,

    command:
      row.command,

    requestKey:
      row.request_key,

    auditStatus:
      row.audit_status,

    resultKind:
      row.result_kind,

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

    attemptedGeneration:
      mapGeneration(
        row.attempted_generation,
      ),

    observedGeneration:
      mapGeneration(
        row.observed_generation,
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


export class SchedulerRecoveryCoordinationAuditRepository {

  public async createPending(
    input: {
      readonly command:
        string;

      readonly requestKey:
        string | null;
    },
  ):
    Promise<{
      readonly publicId:
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
              dbo.scheduler_recovery_coordination_audit
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
        "Recovery coordination audit pending insert returned no row.",
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

    completion:
      SchedulerRecoveryCoordinationAuditCompletion,
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
          "resultKind",
          completion.resultKind,
        )
        .input(
          "disposition",
          completion.disposition,
        )
        .input(
          "previousState",
          completion.previousState,
        )
        .input(
          "currentState",
          completion.currentState,
        )
        .input(
          "previousGeneration",
          completion.previousGeneration,
        )
        .input(
          "currentGeneration",
          completion.currentGeneration,
        )
        .input(
          "attemptedGeneration",
          completion.attemptedGeneration,
        )
        .input(
          "observedGeneration",
          completion.observedGeneration,
        )
        .input(
          "changed",
          completion.changed,
        )
        .input(
          "reason",
          completion.reason,
        )
        .query(`
          UPDATE
              dbo.scheduler_recovery_coordination_audit
          SET
              audit_status =
                  N'completed',

              result_kind =
                  @resultKind,

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

              attempted_generation =
                  @attemptedGeneration,

              observed_generation =
                  @observedGeneration,

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
        "Recovery coordination audit completion did not update exactly one pending row.",
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
              dbo.scheduler_recovery_coordination_audit
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
        "Recovery coordination audit failure did not update exactly one pending row.",
      );
    }
  }


  public async listRecent(
    limit:
      number,
  ): Promise<
    SchedulerRecoveryCoordinationAuditRecord[]
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
              result_kind,
              disposition,
              previous_state,
              current_state,
              previous_generation,
              current_generation,
              attempted_generation,
              observed_generation,
              changed,
              reason,
              error_message,
              created_at_utc,
              completed_at_utc
          FROM
              dbo.scheduler_recovery_coordination_audit
          ORDER BY
              scheduler_recovery_coordination_audit_id DESC;
        `);


    return result.recordset.map(
      mapRow,
    );
  }
}
