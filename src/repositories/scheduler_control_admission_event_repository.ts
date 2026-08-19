import sql from "mssql";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

import type {
  SchedulerControlAdmissionEventRepository,
  BoundedSchedulerControlAdmissionEventRepository,
  SchedulerControlAdmissionEventPageQuery,
  SchedulerControlAdmissionEventPage,
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


type AdmissionEventPageRow =
  AdmissionEventRow & {
    readonly page_total:
      number;
  };

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
implements BoundedSchedulerControlAdmissionEventRepository {

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

  public async listPage(
    query:
      SchedulerControlAdmissionEventPageQuery,
  ): Promise<SchedulerControlAdmissionEventPage> {

    if (
      !Number.isSafeInteger(
        query.limit,
      ) ||
      query.limit <= 0
    ) {

      throw new Error(
        "Admission event page limit must be a positive safe integer.",
      );
    }


    if (
      query.beforeSequence !== undefined &&
      (
        !Number.isSafeInteger(
          query.beforeSequence,
        ) ||
        query.beforeSequence <= 0
      )
    ) {

      throw new Error(
        "Admission event page beforeSequence must be a positive safe integer.",
      );
    }


    const limitPlusOne =
      query.limit + 1;


    if (
      !Number.isSafeInteger(
        limitPlusOne,
      )
    ) {

      throw new Error(
        "Admission event page limit is too large.",
      );
    }


    const pool =
      await this.poolProvider();


    const request =
      pool
        .request()
        .input(
          "limitPlusOne",
          sql.Int,
          limitPlusOne,
        );


    if (query.observedAtOrAfter !== undefined) {
      request.input(
        "observedAtOrAfter",
        sql.DateTime2,
        query.observedAtOrAfter,
      );
    }

    if (query.observedBefore !== undefined) {
      request.input(
        "observedBefore",
        sql.DateTime2,
        query.observedBefore,
      );
    }

    if (
      query.beforeSequence !== undefined
    ) {

      request.input(
        "beforeSequence",
        sql.BigInt,
        query.beforeSequence,
      );
    }

    if (
      query.command !== undefined
    ) {

      request.input(
        "command",
        sql.NVarChar(16),
        query.command,
      );
    }


    const commandPredicate =
      query.command === undefined
        ? ""
        : "command = @command";

        const observedAtOrAfterPredicate =
      query.observedAtOrAfter === undefined
        ? ""
        : "observed_at_utc >= @observedAtOrAfter";

    const observedBeforePredicate =
      query.observedBefore === undefined
        ? ""
        : "observed_at_utc < @observedBefore";
    const cursorPredicate =
      query.beforeSequence === undefined
        ? ""
        : "sequence < @beforeSequence";

    const predicates =
      [
        commandPredicate,
        observedAtOrAfterPredicate,
        observedBeforePredicate,
        cursorPredicate,

      ].filter(
        (predicate) =>
          predicate.length > 0,
      );

    const whereClause =
      predicates.length === 0
        ? ""
        : `
            WHERE
              ${predicates.join(
                "\n              AND ",
              )}
          `;

    const result =
      await request.query<AdmissionEventPageRow>(`
            SELECT TOP (@limitPlusOne)
              sequence,
              observed_at_utc,
              disposition,
              command,
              reason,
              COUNT_BIG(*) OVER () AS page_total
            FROM dbo.scheduler_control_admission_event
            ${whereClause}
            ORDER BY
              sequence DESC;
          `);


    const total =
      result.recordset.length > 0
        ? Number(
            result.recordset[0]!.page_total,
          )
        : 0;


    const hasMore =
      result.recordset.length >
      query.limit;


    const newestFirst =
      hasMore
        ? result.recordset.slice(
            0,
            query.limit,
          )
        : result.recordset;


    const chronological =
      newestFirst
        .slice()
        .reverse()
        .map(
          mapRow,
        );


    return {
      total,

      events:
        chronological,

      hasMore,

      nextBeforeSequence:
        hasMore &&
        chronological.length > 0
          ? chronological[0]!.sequence
          : null,
    };
  }
}
