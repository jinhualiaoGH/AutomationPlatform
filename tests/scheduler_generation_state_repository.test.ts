import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  SchedulerGenerationStateRepository,
} from "../src/repositories/scheduler_generation_state_repository.js";


async function resetGenerationState():
  Promise<void> {
  const pool =
    await getDatabasePool();

  await pool
    .request()
    .query(`
      DELETE FROM
          dbo.scheduler_generation_state;

      INSERT INTO
          dbo.scheduler_generation_state
      (
          scheduler_generation_state_id,
          current_generation
      )
      VALUES
      (
          1,
          1
      );
    `);
}


describe(
  "SchedulerGenerationStateRepository",
  () => {
    const repository =
      new SchedulerGenerationStateRepository();


    beforeEach(
      async () => {
        await resetGenerationState();
        await closeDatabase();
      },
      15_000,
    );


    afterEach(
      async () => {
        await resetGenerationState();
        await closeDatabase();
      },
      15_000,
    );


    it(
      "reads the durable initial generation",
      async () => {
        const state =
          await repository.read();

        expect(
          state.currentGeneration,
        ).toBe(1);

        expect(
          state.rowVersion.length,
        ).toBeGreaterThan(0);
      },
      15_000,
    );


    it(
      "atomically advances generation exactly once",
      async () => {
        const before =
          await repository.read();

        const result =
          await repository.allocateNext(
            before.currentGeneration,
            before.rowVersion,
          );

        expect(
          result.disposition,
        ).toBe(
          "allocated",
        );

        expect(
          result.allocation,
        ).not.toBeNull();

        expect(
          result.allocation?.previousGeneration,
        ).toBe(1);

        expect(
          result.allocation?.currentGeneration,
        ).toBe(2);

        expect(
          Array.from(
            result.allocation?.rowVersion ?? [],
          ),
        ).not.toEqual(
          Array.from(
            before.rowVersion,
          ),
        );

        const after =
          await repository.read();

        expect(
          after.currentGeneration,
        ).toBe(2);
      },
      15_000,
    );


    it(
      "returns stale for a stale generation precondition",
      async () => {
        const before =
          await repository.read();

        const first =
          await repository.allocateNext(
            before.currentGeneration,
            before.rowVersion,
          );

        expect(
          first.disposition,
        ).toBe(
          "allocated",
        );

        const stale =
          await repository.allocateNext(
            before.currentGeneration,
            before.rowVersion,
          );

        expect(
          stale,
        ).toEqual({
          disposition:
            "stale",

          allocation:
            null,
        });

        const current =
          await repository.read();

        expect(
          current.currentGeneration,
        ).toBe(2);
      },
      15_000,
    );


    it(
      "returns stale when generation matches but row version is stale",
      async () => {
        const before =
          await repository.read();

        const pool =
          await getDatabasePool();

        await pool
          .request()
          .query(`
            UPDATE
                dbo.scheduler_generation_state
            SET
                updated_at_utc =
                    SYSUTCDATETIME()
            WHERE
                scheduler_generation_state_id = 1;
          `);

        await closeDatabase();

        const stale =
          await repository.allocateNext(
            before.currentGeneration,
            before.rowVersion,
          );

        expect(
          stale,
        ).toEqual({
          disposition:
            "stale",

          allocation:
            null,
        });

        const current =
          await repository.read();

        expect(
          current.currentGeneration,
        ).toBe(1);
      },
      15_000,
    );


    it(
      "allows only one concurrent allocation from the same state",
      async () => {
        const before =
          await repository.read();

        const results =
          await Promise.all([
            repository.allocateNext(
              before.currentGeneration,
              before.rowVersion,
            ),

            repository.allocateNext(
              before.currentGeneration,
              before.rowVersion,
            ),
          ]);

        expect(
          results.filter(
            item =>
              item.disposition ===
              "allocated",
          ),
        ).toHaveLength(1);

        expect(
          results.filter(
            item =>
              item.disposition ===
              "stale",
          ),
        ).toHaveLength(1);

        const current =
          await repository.read();

        expect(
          current.currentGeneration,
        ).toBe(2);
      },
      20_000,
    );


    it(
      "supports a later allocation using the returned row version",
      async () => {
        const state1 =
          await repository.read();

        const result1 =
          await repository.allocateNext(
            state1.currentGeneration,
            state1.rowVersion,
          );

        if (
          result1.disposition !==
          "allocated"
        ) {
          throw new Error(
            "Expected first allocation.",
          );
        }

        const result2 =
          await repository.allocateNext(
            result1.allocation.currentGeneration,
            result1.allocation.rowVersion,
          );

        expect(
          result2.disposition,
        ).toBe(
          "allocated",
        );

        expect(
          result2.allocation?.previousGeneration,
        ).toBe(2);

        expect(
          result2.allocation?.currentGeneration,
        ).toBe(3);
      },
      15_000,
    );


    it(
      "returns defensive row-version copies",
      async () => {
        const first =
          await repository.read();

        const original =
          Array.from(
            first.rowVersion,
          );

        const mutable =
          first.rowVersion as Uint8Array;

        const firstByte =
          mutable[0];

        if (firstByte === undefined) {
          throw new Error(
            "Expected a non-empty scheduler generation rowVersion.",
          );
        }

        mutable[0] =
          firstByte ^ 0xff;

        const second =
          await repository.read();

        expect(
          Array.from(
            second.rowVersion,
          ),
        ).toEqual(
          original,
        );
      },
      15_000,
    );
  },
);
