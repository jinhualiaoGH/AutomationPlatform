import {
  getDatabasePool,
} from "../database/sqlserver.js";

import {
  assertSchedulerGeneration,
  cloneGenerationRowVersion,
  createSchedulerGenerationAllocation,
  type SchedulerGeneration,
  type SchedulerGenerationAllocationResult,
  type SchedulerGenerationState,
  type SchedulerGenerationStateStore,
} from "../recovery/scheduler_generation_state_contract.js";


type GenerationStateRow = {
  current_generation:
    string | number;

  row_version:
    Buffer;
};


type GenerationAllocationRow = {
  previous_generation:
    string | number;

  current_generation:
    string | number;

  row_version:
    Buffer;
};


function generationFromSql(
  value:
    string | number,
): SchedulerGeneration {
  const numeric =
    typeof value === "number"
      ? value
      : Number(
          value,
        );

  assertSchedulerGeneration(
    numeric,
  );

  return numeric;
}


function rowVersionBuffer(
  value:
    Readonly<Uint8Array>,
): Buffer {
  if (value.length === 0) {
    throw new Error(
      "Scheduler generation rowVersion must not be empty.",
    );
  }

  return Buffer.from(
    value,
  );
}


export class SchedulerGenerationStateRepository
implements SchedulerGenerationStateStore {

  public async read():
    Promise<SchedulerGenerationState> {
    const pool =
      await getDatabasePool();

    const result =
      await pool
        .request()
        .query<GenerationStateRow>(`
          SELECT
              current_generation,
              row_version
          FROM
              dbo.scheduler_generation_state
          WHERE
              scheduler_generation_state_id = 1;
        `);

    const row =
      result.recordset[0];

    if (!row) {
      throw new Error(
        "Scheduler generation state row is missing.",
      );
    }

    return {
      currentGeneration:
        generationFromSql(
          row.current_generation,
        ),

      rowVersion:
        cloneGenerationRowVersion(
          row.row_version,
        ),
    };
  }


  public async allocateNext(
    expectedGeneration:
      SchedulerGeneration,

    expectedRowVersion:
      Readonly<Uint8Array>,
  ):
    Promise<SchedulerGenerationAllocationResult> {

    assertSchedulerGeneration(
      expectedGeneration,
    );

    if (
      expectedGeneration ===
      Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        "Scheduler generation cannot advance beyond Number.MAX_SAFE_INTEGER.",
      );
    }

    const expectedRowVersionBuffer =
      rowVersionBuffer(
        expectedRowVersion,
      );

    const pool =
      await getDatabasePool();

    const request =
      pool.request();

    request.input(
      "expectedGeneration",
      expectedGeneration,
    );

    request.input(
      "expectedRowVersion",
      expectedRowVersionBuffer,
    );

    const result =
      await request
        .query<GenerationAllocationRow>(`
          UPDATE
              dbo.scheduler_generation_state
          SET
              current_generation =
                  current_generation + 1,

              updated_at_utc =
                  SYSUTCDATETIME()
          OUTPUT
              deleted.current_generation
                  AS previous_generation,

              inserted.current_generation
                  AS current_generation,

              inserted.row_version
                  AS row_version
          WHERE
              scheduler_generation_state_id = 1

              AND current_generation =
                  @expectedGeneration

              AND row_version =
                  @expectedRowVersion;
        `);

    const row =
      result.recordset[0];

    if (!row) {
      return {
        disposition:
          "stale",

        allocation:
          null,
      };
    }

    const previousGeneration =
      generationFromSql(
        row.previous_generation,
      );

    const currentGeneration =
      generationFromSql(
        row.current_generation,
      );

    return {
      disposition:
        "allocated",

      allocation:
        createSchedulerGenerationAllocation(
          previousGeneration,
          currentGeneration,
          row.row_version,
        ),
    };
  }
}
