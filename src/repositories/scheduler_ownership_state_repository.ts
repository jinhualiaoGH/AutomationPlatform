import sql from "mssql";

import {
  getDatabasePool,
} from "../database/sqlserver.js";

import {
  createDurableSchedulerOwnership,
  type DurableSchedulerOwnership,
} from "../recovery/durable_scheduler_ownership_contract.js";


export interface SchedulerOwnershipState {
  readonly generation: number;
  readonly fencingToken: number;
  readonly ownership:
    DurableSchedulerOwnership |
    null;
  readonly rowVersion: Buffer;
}


export interface ReplaceSchedulerOwnershipInput {
  readonly expectedRowVersion: Buffer;
  readonly generation: number;
  readonly fencingToken: number;
  readonly ownerId: string | null;
  readonly leaseExpiresAtEpochMs:
    number |
    null;
}


export type ReplaceSchedulerOwnershipResult =
  | {
      readonly kind: "updated";
      readonly state:
        SchedulerOwnershipState;
    }
  | {
      readonly kind: "stale";
    };


interface SchedulerOwnershipRow {
  readonly current_generation:
    number | string;
  readonly fencing_token:
    number | string;
  readonly owner_id:
    string | null;
  readonly lease_expires_at_epoch_ms:
    number | string | null;
  readonly row_version:
    Buffer;
}


function parseSafeInteger(
  value: number | string,
  label: string,
  minimum: number,
): number {

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);


  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }


  return parsed;
}


function copyRowVersion(
  rowVersion: Buffer,
): Buffer {

  if (
    !Buffer.isBuffer(rowVersion) ||
    rowVersion.length !== 8
  ) {
    throw new Error(
      "Scheduler ownership row version is invalid.",
    );
  }


  return Buffer.from(
    rowVersion,
  );
}


function mapRow(
  row: SchedulerOwnershipRow,
): SchedulerOwnershipState {

  const generation =
    parseSafeInteger(
      row.current_generation,
      "Scheduler ownership generation",
      1,
    );


  const fencingToken =
    parseSafeInteger(
      row.fencing_token,
      "Scheduler ownership fencing token",
      0,
    );


  const rowVersion =
    copyRowVersion(
      row.row_version,
    );


  if (row.owner_id === null) {

    if (
      row.lease_expires_at_epoch_ms !==
      null
    ) {
      throw new Error(
        "Unowned scheduler state contains a lease expiration.",
      );
    }


    return Object.freeze({
      generation,
      fencingToken,
      ownership: null,
      rowVersion,
    });
  }


  if (
    row.lease_expires_at_epoch_ms ===
    null
  ) {
    throw new Error(
      "Owned scheduler state is missing a lease expiration.",
    );
  }


  const leaseExpiresAtEpochMs =
    parseSafeInteger(
      row.lease_expires_at_epoch_ms,
      "Scheduler ownership lease expiration",
      1,
    );


  const ownership =
    createDurableSchedulerOwnership({
      generation,
      fencingToken,
      ownerId:
        row.owner_id,
      leaseExpiresAtEpochMs,
    });


  return Object.freeze({
    generation,
    fencingToken,
    ownership,
    rowVersion,
  });
}


function assertReplacementShape(
  input: ReplaceSchedulerOwnershipInput,
): void {

  parseSafeInteger(
    input.generation,
    "Replacement scheduler generation",
    1,
  );


  parseSafeInteger(
    input.fencingToken,
    "Replacement scheduler fencing token",
    0,
  );


  copyRowVersion(
    input.expectedRowVersion,
  );


  const hasOwner =
    input.ownerId !== null;


  const hasExpiration =
    input.leaseExpiresAtEpochMs !==
    null;


  if (hasOwner !== hasExpiration) {
    throw new Error(
      "Scheduler ownership owner and lease expiration must be supplied together.",
    );
  }


  if (input.ownerId !== null) {

    createDurableSchedulerOwnership({
      generation:
        input.generation,

      fencingToken:
        input.fencingToken,

      ownerId:
        input.ownerId,

      leaseExpiresAtEpochMs:
        input.leaseExpiresAtEpochMs as number,
    });
  }
}


export class SchedulerOwnershipStateRepository {

  async read():
    Promise<SchedulerOwnershipState> {

    const pool =
      await getDatabasePool();


    const result =
      await pool
        .request()
        .query<SchedulerOwnershipRow>(`
          SELECT
              current_generation,
              fencing_token,
              owner_id,
              lease_expires_at_epoch_ms,
              row_version
          FROM
              dbo.scheduler_ownership_state
          WHERE
              scheduler_ownership_state_id = 1;
        `);


    if (result.recordset.length !== 1) {
      throw new Error(
        "Scheduler ownership singleton state is missing.",
      );
    }


    const row =
      result.recordset[0];


    if (row === undefined) {
      throw new Error(
        "Scheduler ownership singleton state is missing.",
      );
    }


    return mapRow(
      row,
    );
  }


  async replaceIfCurrent(
    input: ReplaceSchedulerOwnershipInput,
  ): Promise<ReplaceSchedulerOwnershipResult> {

    assertReplacementShape(
      input,
    );


    const pool =
      await getDatabasePool();


    const request =
      pool
        .request();


    request.input(
      "expectedRowVersion",
      sql.VarBinary(8),
      Buffer.from(
        input.expectedRowVersion,
      ),
    );


    request.input(
      "generation",
      sql.BigInt,
      input.generation,
    );


    request.input(
      "fencingToken",
      sql.BigInt,
      input.fencingToken,
    );


    request.input(
      "ownerId",
      sql.NVarChar(200),
      input.ownerId,
    );


    request.input(
      "leaseExpiresAtEpochMs",
      sql.BigInt,
      input.leaseExpiresAtEpochMs,
    );


    const result =
      await request
        .query<SchedulerOwnershipRow>(`
          UPDATE
              dbo.scheduler_ownership_state
          SET
              current_generation =
                  @generation,

              fencing_token =
                  @fencingToken,

              owner_id =
                  @ownerId,

              lease_expires_at_epoch_ms =
                  @leaseExpiresAtEpochMs
          OUTPUT
              inserted.current_generation,
              inserted.fencing_token,
              inserted.owner_id,
              inserted.lease_expires_at_epoch_ms,
              inserted.row_version
          WHERE
              scheduler_ownership_state_id = 1
              AND
              row_version =
                  @expectedRowVersion;
        `);


    if (result.recordset.length === 0) {
      return Object.freeze({
        kind: "stale",
      });
    }


    if (result.recordset.length !== 1) {
      throw new Error(
        "Scheduler ownership CAS returned an unexpected row count.",
      );
    }


    const row =
      result.recordset[0];


    if (row === undefined) {
      throw new Error(
        "Scheduler ownership CAS returned an unexpected row count.",
      );
    }


    return Object.freeze({
      kind: "updated",
      state:
        mapRow(
          row,
        ),
    });
  }
}
