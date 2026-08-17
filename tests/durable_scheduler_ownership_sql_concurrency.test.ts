import {
  afterAll,
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
  DurableSchedulerOwnershipEngine,
} from "../src/recovery/durable_scheduler_ownership_engine.js";

import {
  SchedulerOwnershipStateRepository,
} from "../src/repositories/scheduler_ownership_state_repository.js";


async function resetOwnership():
  Promise<void> {

  const pool =
    await getDatabasePool();


  await pool
    .request()
    .query(`
      DELETE FROM
          dbo.scheduler_ownership_state;

      INSERT INTO
          dbo.scheduler_ownership_state
      (
          scheduler_ownership_state_id,
          current_generation,
          fencing_token,
          owner_id,
          lease_expires_at_epoch_ms
      )
      VALUES
      (
          1,
          1,
          0,
          NULL,
          NULL
      );
    `);
}


describe(
  "A12.3 real SQL scheduler ownership concurrency",
  () => {

    beforeEach(
      async () => {
        await resetOwnership();
      },
    );


    afterAll(
      async () => {
        await resetOwnership();
        await closeDatabase();
      },
    );


    it(
      "allows exactly one owner to acquire from a shared durable cursor",
      async () => {

        const repositoryA =
          new SchedulerOwnershipStateRepository();

        const repositoryB =
          new SchedulerOwnershipStateRepository();


        const engineA =
          new DurableSchedulerOwnershipEngine(
            repositoryA,
          );

        const engineB =
          new DurableSchedulerOwnershipEngine(
            repositoryB,
          );


        const [
          resultA,
          resultB,
        ] =
          await Promise.all([
            engineA.acquireOrRenew({
              generation: 1,
              ownerId: "process-a",
              nowEpochMs: 1_000,
              leaseDurationMs: 10_000,
            }),

            engineB.acquireOrRenew({
              generation: 1,
              ownerId: "process-b",
              nowEpochMs: 1_000,
              leaseDurationMs: 10_000,
            }),
          ]);


        const acquired =
          [
            resultA,
            resultB,
          ].filter(
            (result) =>
              result.kind ===
              "acquired",
          );


        const contended =
          [
            resultA,
            resultB,
          ].filter(
            (result) =>
              result.kind ===
              "contended",
          );


        expect(acquired)
          .toHaveLength(1);

        expect(contended)
          .toHaveLength(1);


        const finalState =
          await repositoryA.read();


        expect(finalState.generation)
          .toBe(1);

        expect(finalState.fencingToken)
          .toBe(1);

        expect(
          finalState.ownership?.ownerId,
        ).toMatch(
          /^process-[ab]$/,
        );


        console.log(
          "A12_3_SQL_CONCURRENCY=" +
          JSON.stringify({
            acquired:
              acquired.length,

            contended:
              contended.length,

            finalGeneration:
              finalState.generation,

            finalFencingToken:
              finalState.fencingToken,

            finalOwner:
              finalState.ownership?.ownerId,
          }),
        );
      },
    );


    it(
      "fences the previous owner after an expired takeover",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const engine =
          new DurableSchedulerOwnershipEngine(
            repository,
          );


        const first =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-a",
            nowEpochMs: 1_000,
            leaseDurationMs: 500,
          });


        expect(first.kind)
          .toBe("acquired");


        if (first.kind !== "acquired") {
          throw new Error(
            "Expected first acquisition.",
          );
        }


        const takeover =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-b",
            nowEpochMs: 1_500,
            leaseDurationMs: 500,
          });


        expect(takeover.kind)
          .toBe("acquired");


        if (takeover.kind !== "acquired") {
          throw new Error(
            "Expected takeover acquisition.",
          );
        }


        expect(
          takeover.ownership.fencingToken,
        ).toBe(
          first.ownership.fencingToken +
          1,
        );


        const staleRelease =
          await engine.release({
            generation: 1,
            ownerId: "process-a",
            fencingToken:
              first.ownership.fencingToken,
          });


        expect(staleRelease.kind)
          .toBe("fenced");


        const finalState =
          await repository.read();


        expect(
          finalState.ownership?.ownerId,
        ).toBe(
          "process-b",
        );


        expect(
          finalState.fencingToken,
        ).toBe(
          takeover.ownership.fencingToken,
        );


        console.log(
          "A12_3_SQL_TAKEOVER=" +
          JSON.stringify({
            firstToken:
              first.ownership.fencingToken,

            takeoverToken:
              takeover.ownership.fencingToken,

            staleRelease:
              staleRelease.kind,

            finalOwner:
              finalState.ownership?.ownerId,
          }),
        );
      },
    );
  },
);
