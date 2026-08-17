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
  SchedulerOwnershipStateRepository,
} from "../src/repositories/scheduler_ownership_state_repository.js";


async function resetOwnershipState():
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
  "SchedulerOwnershipStateRepository",
  () => {

    beforeEach(
      async () => {
        await resetOwnershipState();
      },
    );


    afterAll(
      async () => {
        await resetOwnershipState();
        await closeDatabase();
      },
    );


    it(
      "reads the durable unowned initial state",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const state =
          await repository.read();


        expect(state.generation)
          .toBe(1);

        expect(state.fencingToken)
          .toBe(0);

        expect(state.ownership)
          .toBeNull();

        expect(state.rowVersion)
          .toBeInstanceOf(Buffer);

        expect(state.rowVersion)
          .toHaveLength(8);
      },
    );


    it(
      "returns defensive row-version copies",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const first =
          await repository.read();


        const original =
          Buffer.from(
            first.rowVersion,
          );


        const firstByte =
          first.rowVersion.readUInt8(
            0,
          );


        first.rowVersion.writeUInt8(
          firstByte ^ 0xff,
          0,
        );


        const second =
          await repository.read();


        expect(
          second.rowVersion,
        ).toEqual(
          original,
        );
      },
    );


    it(
      "atomically replaces the current state",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const before =
          await repository.read();


        const result =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              before.rowVersion,

            generation:
              1,

            fencingToken:
              1,

            ownerId:
              "process-a",

            leaseExpiresAtEpochMs:
              10_000,
          });


        expect(result.kind)
          .toBe("updated");


        if (result.kind !== "updated") {
          throw new Error(
            "Expected updated result.",
          );
        }


        expect(result.state.generation)
          .toBe(1);

        expect(result.state.fencingToken)
          .toBe(1);

        expect(result.state.ownership)
          .toEqual({
            generation: 1,
            fencingToken: 1,
            ownerId: "process-a",
            leaseExpiresAtEpochMs: 10_000,
          });

        expect(result.state.rowVersion)
          .not.toEqual(
            before.rowVersion,
          );
      },
    );


    it(
      "returns stale for an obsolete row version",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const before =
          await repository.read();


        const winner =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              before.rowVersion,

            generation:
              1,

            fencingToken:
              1,

            ownerId:
              "process-a",

            leaseExpiresAtEpochMs:
              10_000,
          });


        expect(winner.kind)
          .toBe("updated");


        const stale =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              before.rowVersion,

            generation:
              1,

            fencingToken:
              1,

            ownerId:
              "process-b",

            leaseExpiresAtEpochMs:
              10_000,
          });


        expect(stale)
          .toEqual({
            kind: "stale",
          });
      },
    );


    it(
      "allows only one concurrent CAS from the same state",
      async () => {

        const repositoryA =
          new SchedulerOwnershipStateRepository();

        const repositoryB =
          new SchedulerOwnershipStateRepository();


        const before =
          await repositoryA.read();


        const [
          resultA,
          resultB,
        ] =
          await Promise.all([
            repositoryA.replaceIfCurrent({
              expectedRowVersion:
                before.rowVersion,

              generation:
                1,

              fencingToken:
                1,

              ownerId:
                "process-a",

              leaseExpiresAtEpochMs:
                10_000,
            }),

            repositoryB.replaceIfCurrent({
              expectedRowVersion:
                before.rowVersion,

              generation:
                1,

              fencingToken:
                1,

              ownerId:
                "process-b",

              leaseExpiresAtEpochMs:
                10_000,
            }),
          ]);


        const updated =
          [
            resultA,
            resultB,
          ].filter(
            (result) =>
              result.kind ===
              "updated",
          );


        const stale =
          [
            resultA,
            resultB,
          ].filter(
            (result) =>
              result.kind ===
              "stale",
          );


        expect(updated)
          .toHaveLength(1);

        expect(stale)
          .toHaveLength(1);


        const after =
          await repositoryA.read();


        expect(after.fencingToken)
          .toBe(1);

        expect(
          after.ownership?.ownerId,
        ).toMatch(
          /^process-[ab]$/,
        );
      },
    );


    it(
      "can durably return to an unowned state",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const initial =
          await repository.read();


        const acquired =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              initial.rowVersion,

            generation:
              1,

            fencingToken:
              1,

            ownerId:
              "process-a",

            leaseExpiresAtEpochMs:
              10_000,
          });


        if (acquired.kind !== "updated") {
          throw new Error(
            "Expected ownership acquisition.",
          );
        }


        const released =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              acquired.state.rowVersion,

            generation:
              1,

            fencingToken:
              1,

            ownerId:
              null,

            leaseExpiresAtEpochMs:
              null,
          });


        expect(released.kind)
          .toBe("updated");


        if (released.kind !== "updated") {
          throw new Error(
            "Expected release update.",
          );
        }


        expect(released.state.ownership)
          .toBeNull();

        expect(released.state.fencingToken)
          .toBe(1);
      },
    );


    it(
      "preserves fencing history while generation advances",
      async () => {

        const repository =
          new SchedulerOwnershipStateRepository();


        const initial =
          await repository.read();


        const result =
          await repository.replaceIfCurrent({
            expectedRowVersion:
              initial.rowVersion,

            generation:
              2,

            fencingToken:
              1,

            ownerId:
              "process-b",

            leaseExpiresAtEpochMs:
              20_000,
          });


        expect(result.kind)
          .toBe("updated");


        if (result.kind !== "updated") {
          throw new Error(
            "Expected update.",
          );
        }


        expect(result.state.generation)
          .toBe(2);

        expect(result.state.fencingToken)
          .toBe(1);
      },
    );
  },
);
