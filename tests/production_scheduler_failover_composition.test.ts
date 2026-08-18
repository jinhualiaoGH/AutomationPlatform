import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AcquireOrRenewSchedulerOwnershipResult,
} from "../src/recovery/durable_scheduler_ownership_engine.js";

import {
  ProductionSchedulerFailoverComposition,
  type ProductionSchedulerFailoverClock,
  type ProductionSchedulerFailoverOwnershipRuntime,
} from "../src/recovery/production_scheduler_failover_composition.js";


function acquired(
  fencingToken:
    number,
): AcquireOrRenewSchedulerOwnershipResult {

  return {
    kind:
      "acquired",

    ownership: {
      generation:
        7,

      fencingToken,

      ownerId:
        "node-a",

      leaseExpiresAtEpochMs:
        2000,
    },
  };
}


class FakeClock
implements ProductionSchedulerFailoverClock {

  public constructor(
    private readonly value:
      number,
  ) {}


  public nowEpochMs():
    number {

    return this.value;
  }
}


class FakeOwnershipRuntime
implements ProductionSchedulerFailoverOwnershipRuntime {

  public acquireCalls:
    Array<{
      generation: number;
      ownerId: string;
      nowEpochMs: number;
      leaseDurationMs: number;
    }> =
    [];


  public startCalls =
    0;


  public stopCalls =
    0;


  public nextResult:
    AcquireOrRenewSchedulerOwnershipResult =
    acquired(1);


  public readonly ownershipEngine = {
    acquireOrRenew:
      async (
        input: {
          readonly generation: number;
          readonly ownerId: string;
          readonly nowEpochMs: number;
          readonly leaseDurationMs: number;
        },
      ): Promise<AcquireOrRenewSchedulerOwnershipResult> => {

        this.acquireCalls.push({
          ...input,
        });

        return this.nextResult;
      },
  };


  public async start():
    Promise<{
      readonly kind:
        "started";
    }> {

    this.startCalls +=
      1;

    return {
      kind:
        "started",
    };
  }


  public async stop():
    Promise<void> {

    this.stopCalls +=
      1;
  }
}


describe(
  "ProductionSchedulerFailoverComposition",
  () => {

    it(
      "constructs in standby without activating ownership runtime",
      () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        expect(composition.mode)
          .toBe("standby");

        expect(composition.runtime.state)
          .toBe("idle");

        expect(ownershipRuntime.startCalls)
          .toBe(0);

        expect(ownershipRuntime.stopCalls)
          .toBe(0);
      },
    );


    it(
      "uses production generation owner and lease coordinates for acquisition",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        await composition.integration.acquire();


        expect(
          ownershipRuntime.acquireCalls,
        ).toEqual([
          {
            generation:
              7,

            ownerId:
              "node-a",

            nowEpochMs:
              1000,

            leaseDurationMs:
              500,
          },
        ]);
      },
    );


    it(
      "activates the existing production ownership runtime after ownership acquisition",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        const result =
          await composition.integration.acquire();


        if (result.kind !== "acquired") {
          throw new Error(
            "Expected acquired ownership.",
          );
        }


        await composition.integration.activate(
          result.ownership,
        );


        expect(composition.mode)
          .toBe("active");

        expect(ownershipRuntime.startCalls)
          .toBe(1);
      },
    );


    it(
      "deactivates the production ownership runtime on authority loss",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        const result =
          await composition.integration.acquire();


        if (result.kind !== "acquired") {
          throw new Error(
            "Expected acquired ownership.",
          );
        }


        await composition.integration.activate(
          result.ownership,
        );


        await composition.integration
          .handleAuthoritySignal({
            kind:
              "ownership_lost",
          });


        expect(composition.mode)
          .toBe("fail_closed");

        expect(ownershipRuntime.stopCalls)
          .toBe(1);
      },
    );


    it(
      "returns to standby only after runtime quiescence",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        const result =
          await composition.integration.acquire();


        if (result.kind !== "acquired") {
          throw new Error(
            "Expected acquired ownership.",
          );
        }


        await composition.integration.activate(
          result.ownership,
        );


        await composition.integration
          .handleAuthoritySignal({
            kind:
              "ownership_lost",
          });


        expect(composition.mode)
          .toBe("fail_closed");


        await composition.integration
          .runtimeQuiesced();


        expect(composition.mode)
          .toBe("standby");
      },
    );


    it(
      "stops the production ownership runtime through the failover lifecycle",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        composition.runtime.start();

        await composition.runtime.stop();


        expect(ownershipRuntime.stopCalls)
          .toBe(1);

        expect(composition.runtime.state)
          .toBe("stopped");
      },
    );

    it(
      "exposes a production failover runtime bound to the same integration",
      () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          new ProductionSchedulerFailoverComposition(
            ownershipRuntime,
            {
              generation:
                7,

              ownerId:
                "node-a",

              leaseDurationMs:
                500,
            },
            {
              acquisitionIntervalMs:
                25,
            },
            new FakeClock(1000),
          );


        expect(
          composition.runtime.mode,
        ).toBe(
          composition.integration.mode,
        );

        expect(
          composition.reacquisitionSupervisor.cycleCount,
        ).toBe(0);
      },
    );
  },
);
