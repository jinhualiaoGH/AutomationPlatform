import sql from "mssql";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

import type {
  SchedulerControlAdmissionEventRepository,
  StoredSchedulerControlAdmissionEvent,
} from "../recovery/scheduler_control_admission_event_repository.js";


type AdmissionEventRow = {
  sequence:
    number;

  observed_at_utc:
    Date;

  disposition:
    string;

  command:
    string;

  reason:
    string |
    null;
};


type AdmissionEventSqlRequest = {
  input(
    name:
      string,

    type:
      unknown,

    value:
      unknown,
  ):
    AdmissionEventSqlRequest;

  query<T>(
    text:
      string,
  ):
    Promise<{
      recordset:
        T[];
    }>;
};


export type AdmissionEventSqlPool = {
  request():
    AdmissionEventSqlRequest;
};


export type AdmissionEventSqlPoolProvider =
  () => Promise<AdmissionEventSqlPool>;


function defaultPoolProvider():
  Promise<AdmissionEventSqlPool> {

  return getDatabasePool() as unknown as
    Promise<AdmissionEventSqlPool>;
}


function assertValidDate(
  value:
    Date,
): void {

  if (
    !Number.isFinite(
      value.getTime(),
    )
  ) {

    throw new Error(
      "Admission event observation time is invalid.",
    );
  }
}


function assertValidSequence(
  sequence:
    number,
): void {

  if (
    !Number.isSafeInteger(
      sequence,
    ) ||
    sequence <= 0
  ) {

    throw new Error(
      "Admission event sequence must be a positive safe integer.",
    );
  }
}


function mapRow(
  row:
    AdmissionEventRow,
): StoredSchedulerControlAdmissionEvent {

  return {
    sequence:
      row.sequence,

    observedAtUtc:
      new Date(
        row.observed_at_utc.getTime(),
      ),

    disposition:
      row.disposition as
        StoredSchedulerControlAdmissionEvent["disposition"],

    command:
      row.command as
        StoredSchedulerControlAdmissionEvent["command"],

    reason:
      row.reason as
        StoredSchedulerControlAdmissionEvent["reason"],
  };
}


function isDuplicateKeyError(
  error:
    unknown,
): boolean {

  if (
    typeof error !==
      "object" ||
    error ===
      null
  ) {

    return false;
  }


  const number =
    (
      error as {
        number?:
          unknown;
      }
    ).number;


  return (
    number ===
      2601 ||
    number ===
      2627
  );
}


/**
 * SQL Server implementation of the A20 admission-event repository.
 *
 * The database owns durable sequence uniqueness. Reads are projected
 * in ascending sequence order so restart-safe history preserves the
 * same logical ordering as the A20.1 repository contract.
 */
export class SqlSchedulerControlAdmissionEventRepository
implements SchedulerControlAdmissionEventRepository {

  public constructor(
    private readonly poolProvider:
      AdmissionEventSqlPoolProvider =
      defaultPoolProvider,
  ) {}


  public async append(
    event:
      StoredSchedulerControlAdmissionEvent,
  ): Promise<void> {

    assertValidSequence(
      event.sequence,
    );

    assertValidDate(
      event.observedAtUtc,
    );


    const pool =
      await this.poolProvider();


    try {

      await pool
        .request()
        .input(
          "sequence",
          sql.BigInt,
          event.sequence,
        )
        .input(
          "observedAtUtc",
          sql.DateTime2(3),
          event.observedAtUtc,
        )
        .input(
          "disposition",
          sql.NVarChar(16),
          event.disposition,
        )
        .input(
          "command",
          sql.NVarChar(16),
          event.command,
        )
        .input(
          "reason",
          sql.NVarChar(64),
          event.reason,
        )
        .query(`
          INSERT INTO dbo.scheduler_control_admission_event
          (
            sequence,
            observed_at_utc,
            disposition,
            command,
            reason
          )
          VALUES
          (
            @sequence,
            @observedAtUtc,
            @disposition,
            @command,
            @reason
          );
        `);
    }
    catch (error) {

      if (
        isDuplicateKeyError(
          error,
        )
      ) {

        throw new Error(
          `Admission event sequence ${event.sequence} already exists.`,
        );
      }


      throw error;
    }
  }


  public async list():
    Promise<
      readonly StoredSchedulerControlAdmissionEvent[]
    > {

    const pool =
      await this.poolProvider();


    const result =
      await pool
        .request()
        .query<AdmissionEventRow>(`
          SELECT
            sequence,
            observed_at_utc,
            disposition,
            command,
            reason
          FROM dbo.scheduler_control_admission_event
          ORDER BY
            sequence ASC;
        `);


    return result.recordset.map(
      mapRow,
    );
  }
}
