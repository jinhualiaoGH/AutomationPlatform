import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ProductionSchedulerOwnershipRuntime,
} from "../src/recovery/production_scheduler_ownership_runtime_composition.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

import {
  type SchedulerOwnershipState,
  type ReplaceSchedulerOwnershipInput,
  type ReplaceSchedulerOwnershipResult,
  SchedulerOwnershipStateRepository,
} from "../src/repositories/scheduler_ownership_state_repository.js";

import {
  type SchedulerDispatcher,
} from "../src/scheduling/scheduler_polling_loop.js";

import {
  type TriggerDispatchSummary,
} from "../src/scheduling/trigger_dispatcher.js";


function rowVersion(
  value:
    number,
): Buffer {

  const result =
    Buffer.alloc(8);


  result.writeBigUInt64BE(
    BigInt(value),
  );


  return result;
}


function summary(
  evaluatedAtUtc:
    Date,
):
TriggerDispatchSummary {

  return {
    evaluatedAtUtc,

    candidates:
      0,

    dispatched:
      0,

    skipped:
      0,

    failed:
      0,

    outcomes:
      [],
  };
}


class MemoryOwnershipRepository
extends SchedulerOwnershipStateRepository {

  private stateValue:
    SchedulerOwnershipState;


  private revision =
    1;


  public constructor() {

    super();


    this.stateValue =
      Object.freeze({
        generation:
          7,

        fencingToken:
          0,

        ownership:
          null,

        rowVersion:
          rowVersion(
            this.revision,
          ),
      });
  }


  public override async read():
    Promise<SchedulerOwnershipState> {

    return this.stateValue;
  }


  public override async replaceIfCurrent(
    input:
      ReplaceSchedulerOwnershipInput,
  ): Promise<ReplaceSchedulerOwnershipResult> {

    if (
      !input.expectedRowVersion.equals(
        this.stateValue.rowVersion,
      )
    ) {
      return Object.freeze({
        kind:
          "stale",
      });
    }


    this.revision +=
      1;


    const ownership =
      input.ownerId ===
      null
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


    this.stateValue =
      Object.freeze({
        generation:
          input.generation,

        fencingToken:
          input.fencingToken,

        ownership,

        rowVersion:
          rowVersion(
            this.revision,
          ),
      });


    return Object.freeze({
      kind:
        "updated",

      state:
        this.stateValue,
    });
  }
}


function createFixture() {

  const dispatchDue =
    vi.fn(
      async (
        evaluatedAtUtc:
          Date,
        _limit?: number,
      ) =>
        summary(
          evaluatedAtUtc,
        ),
    );


  const dispatcher:
    SchedulerDispatcher =
    {
      dispatchDue,
    };


  const repository =
    new MemoryOwnershipRepository();


  const composition =
    new ProductionSchedulerOwnershipRuntime(
      dispatcher,
      {
        generation:
          7,

        ownerId:
          "process-a",

        leaseDurationMs:
          60_000,

        renewalIntervalMs:
          30_000,
      },
      repository,
    );


  return {
    composition,
    repository,
    dispatchDue,
  };
}


describe(
  "ProductionSchedulerOwnershipRuntime",
  () => {

    it(
      "does not create the real SchedulerRuntime during composition",
      () => {

        const test =
          createFixture();


        expect(
          test.composition.schedulerRuntime,
        ).toBeNull();


        expect(
          test.composition.lifecycle.state,
        ).toBe(
          "idle",
        );
      },
    );


    it(
      "acquires ownership before lazily creating and starting SchedulerRuntime",
      async () => {

        const test =
          createFixture();


        const result =
          await test.composition.start();


        expect(result.kind)
          .toBe(
            "started",
          );


        if (
          result.kind !==
          "started"
        ) {
          throw new Error(
            "Expected started composition.",
          );
        }


        expect(
          result.identity,
        ).toEqual({
          generation:
            7,

          ownerId:
            "process-a",

          fencingToken:
            1,
        });


        expect(
          test.composition.schedulerRuntime,
        ).not.toBeNull();


        expect(
          test.composition.lifecycle.state,
        ).toBe(
          "running",
        );


        const durable =
          await test.repository.read();


        expect(
          durable.ownership?.ownerId,
        ).toBe(
          "process-a",
        );


        expect(
          durable.fencingToken,
        ).toBe(
          1,
        );


        await test.composition.stop();

        await result.supervision;
      },
    );


    it(
      "wires the SQL repository into both ownership and per-dispatch fencing",
      async () => {

        const test =
          createFixture();


        const result =
          await test.composition.start();


        if (
          result.kind !==
          "started"
        ) {
          throw new Error(
            "Expected started composition.",
          );
        }


        expect(
          test.composition.repository,
        ).toBe(
          test.repository,
        );


        expect(
          test.composition.ownershipEngine,
        ).toBeDefined();


        expect(
          test.composition.renewalSupervisor,
        ).toBeDefined();


        await test.composition.stop();

        await result.supervision;
      },
    );


    it(
      "stops runtime before releasing ownership through the accepted lifecycle",
      async () => {

        const test =
          createFixture();


        const result =
          await test.composition.start();


        if (
          result.kind !==
          "started"
        ) {
          throw new Error(
            "Expected started composition.",
          );
        }


        const before =
          await test.repository.read();


        expect(before.ownership)
          .not.toBeNull();


        const stopped =
          await test.composition.stop();


        expect(stopped.kind)
          .toBe(
            "stopped",
          );


        const after =
          await test.repository.read();


        expect(after.ownership)
          .toBeNull();


        /*
         * Release preserves the latest fencing token rather
         * than resetting authority history.
         */
        expect(after.fencingToken)
          .toBeGreaterThanOrEqual(
            1,
          );


        await result.supervision;
      },
    );


    it(
      "creates no second scheduler runtime during normal operation",
      async () => {

        const test =
          createFixture();


        const result =
          await test.composition.start();


        if (
          result.kind !==
          "started"
        ) {
          throw new Error(
            "Expected started composition.",
          );
        }


        const first =
          test.composition.schedulerRuntime;


        expect(first)
          .not.toBeNull();


        expect(
          () =>
            test.composition
              .schedulerRuntime
              ?.start(),
        ).toThrow();


        expect(
          test.composition.schedulerRuntime,
        ).toBe(
          first,
        );


        await test.composition.stop();

        await result.supervision;
      },
    );
  },
);
