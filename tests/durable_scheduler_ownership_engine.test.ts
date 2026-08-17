import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DurableSchedulerOwnershipEngine,
  type SchedulerOwnershipStateStore,
} from "../src/recovery/durable_scheduler_ownership_engine.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

import {
  type ReplaceSchedulerOwnershipInput,
  type ReplaceSchedulerOwnershipResult,
  type SchedulerOwnershipState,
} from "../src/repositories/scheduler_ownership_state_repository.js";


function rowVersion(
  value: number,
): Buffer {

  const buffer =
    Buffer.alloc(8);

  buffer.writeBigUInt64BE(
    BigInt(value),
  );

  return buffer;
}


class FakeOwnershipStore
implements SchedulerOwnershipStateStore {

  readonly replacements:
    ReplaceSchedulerOwnershipInput[] =
    [];


  staleNextReplace =
    false;


  constructor(
    private state:
      SchedulerOwnershipState,
  ) {}


  setState(
    state: SchedulerOwnershipState,
  ): void {

    this.state =
      state;
  }


  async read():
    Promise<SchedulerOwnershipState> {

    return this.state;
  }


  async replaceIfCurrent(
    input: ReplaceSchedulerOwnershipInput,
  ): Promise<ReplaceSchedulerOwnershipResult> {

    this.replacements.push(
      input,
    );


    if (this.staleNextReplace) {

      this.staleNextReplace =
        false;

      return {
        kind:
          "stale",
      };
    }


    if (
      !input.expectedRowVersion.equals(
        this.state.rowVersion,
      )
    ) {
      return {
        kind:
          "stale",
      };
    }


    const nextRowVersion =
      rowVersion(
        this.replacements.length + 1,
      );


    const ownership =
      input.ownerId === null
        ? null
        : createDurableSchedulerOwnership({
            generation:
              input.generation,

            fencingToken:
              input.fencingToken,

            ownerId:
              input.ownerId,

            leaseExpiresAtEpochMs:
              input.leaseExpiresAtEpochMs as number,
          });


    this.state =
      Object.freeze({
        generation:
          input.generation,

        fencingToken:
          input.fencingToken,

        ownership,

        rowVersion:
          nextRowVersion,
      });


    return {
      kind:
        "updated",

      state:
        this.state,
    };
  }
}


function unownedState(
  generation = 1,
  fencingToken = 0,
): SchedulerOwnershipState {

  return Object.freeze({
    generation,
    fencingToken,
    ownership:
      null,

    rowVersion:
      rowVersion(1),
  });
}


function ownedState(
  ownerId: string,
  fencingToken: number,
  leaseExpiresAtEpochMs: number,
  generation = 1,
): SchedulerOwnershipState {

  return Object.freeze({
    generation,
    fencingToken,

    ownership:
      createDurableSchedulerOwnership({
        generation,
        fencingToken,
        ownerId,
        leaseExpiresAtEpochMs,
      }),

    rowVersion:
      rowVersion(1),
  });
}


describe(
  "DurableSchedulerOwnershipEngine",
  () => {

    it(
      "acquires an unowned scheduler with the next fencing token",
      async () => {

        const store =
          new FakeOwnershipStore(
            unownedState(),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-a",
            nowEpochMs: 1_000,
            leaseDurationMs: 500,
          });


        expect(result.kind)
          .toBe("acquired");


        if (result.kind !== "acquired") {
          throw new Error(
            "Expected acquired.",
          );
        }


        expect(result.ownership)
          .toEqual({
            generation: 1,
            fencingToken: 1,
            ownerId: "process-a",
            leaseExpiresAtEpochMs: 1_500,
          });


        expect(store.replacements)
          .toHaveLength(1);
      },
    );


    it(
      "renews the same active owner with exactly one new fencing token",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              7,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-a",
            nowEpochMs: 1_500,
            leaseDurationMs: 700,
          });


        expect(result.kind)
          .toBe("renewed");


        if (result.kind !== "renewed") {
          throw new Error(
            "Expected renewed.",
          );
        }


        expect(result.ownership.fencingToken)
          .toBe(8);

        expect(
          result.ownership
            .leaseExpiresAtEpochMs,
        ).toBe(2_200);
      },
    );


    it(
      "does not steal another active owner's lease",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              4,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-b",
            nowEpochMs: 1_500,
            leaseDurationMs: 500,
          });


        expect(result.kind)
          .toBe("contended");

        expect(store.replacements)
          .toHaveLength(0);
      },
    );


    it(
      "allows takeover exactly at the expiration boundary",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              10,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-b",
            nowEpochMs: 2_000,
            leaseDurationMs: 500,
          });


        expect(result.kind)
          .toBe("acquired");


        if (result.kind !== "acquired") {
          throw new Error(
            "Expected acquired.",
          );
        }


        expect(result.ownership.ownerId)
          .toBe("process-b");

        expect(result.ownership.fencingToken)
          .toBe(11);
      },
    );


    it(
      "rejects ownership activity against another durable generation",
      async () => {

        const store =
          new FakeOwnershipStore(
            unownedState(
              7,
              3,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.acquireOrRenew({
            generation: 6,
            ownerId: "process-a",
            nowEpochMs: 1_000,
            leaseDurationMs: 500,
          });


        expect(result)
          .toEqual({
            kind:
              "generation_mismatch",

            observedGeneration:
              7,
          });

        expect(store.replacements)
          .toHaveLength(0);
      },
    );


    it(
      "re-reads durable state after losing acquisition CAS",
      async () => {

        const store =
          new FakeOwnershipStore(
            unownedState(),
          );


        store.staleNextReplace =
          true;


        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const competing =
          ownedState(
            "process-b",
            1,
            1_500,
          );


        const originalRead =
          store.read.bind(
            store,
          );


        let reads =
          0;


        store.read =
          async () => {

            reads += 1;


            if (reads === 2) {
              store.setState(
                competing,
              );
            }


            return originalRead();
          };


        const result =
          await engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-a",
            nowEpochMs: 1_000,
            leaseDurationMs: 500,
          });


        expect(result.kind)
          .toBe("contended");


        if (result.kind !== "contended") {
          throw new Error(
            "Expected contended.",
          );
        }


        expect(
          result.observedOwnership?.ownerId,
        ).toBe("process-b");

        expect(reads)
          .toBe(2);
      },
    );


    it(
      "releases only the current owner with the current fencing token",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              12,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.release({
            generation: 1,
            ownerId: "process-a",
            fencingToken: 12,
          });


        expect(result)
          .toEqual({
            kind:
              "released",
          });


        const after =
          await store.read();


        expect(after.ownership)
          .toBeNull();

        expect(after.fencingToken)
          .toBe(12);
      },
    );


    it(
      "fences a stale release token",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              12,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.release({
            generation: 1,
            ownerId: "process-a",
            fencingToken: 11,
          });


        expect(result.kind)
          .toBe("fenced");

        expect(store.replacements)
          .toHaveLength(0);
      },
    );


    it(
      "fences a foreign owner release",
      async () => {

        const store =
          new FakeOwnershipStore(
            ownedState(
              "process-a",
              12,
              2_000,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.release({
            generation: 1,
            ownerId: "process-b",
            fencingToken: 12,
          });


        expect(result.kind)
          .toBe("fenced");

        expect(store.replacements)
          .toHaveLength(0);
      },
    );


    it(
      "treats release of an unowned scheduler as idempotent",
      async () => {

        const store =
          new FakeOwnershipStore(
            unownedState(
              1,
              9,
            ),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        const result =
          await engine.release({
            generation: 1,
            ownerId: "process-a",
            fencingToken: 9,
          });


        expect(result)
          .toEqual({
            kind:
              "already_unowned",
          });
      },
    );


    it(
      "rejects lease-expiration overflow before storage",
      async () => {

        const store =
          new FakeOwnershipStore(
            unownedState(),
          );

        const engine =
          new DurableSchedulerOwnershipEngine(
            store,
          );


        await expect(
          engine.acquireOrRenew({
            generation: 1,
            ownerId: "process-a",
            nowEpochMs:
              Number.MAX_SAFE_INTEGER,

            leaseDurationMs:
              1,
          }),
        ).rejects.toThrow(
          "overflow",
        );


        expect(store.replacements)
          .toHaveLength(0);
      },
    );
  },
);
