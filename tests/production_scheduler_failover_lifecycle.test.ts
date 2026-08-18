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
        11,

      fencingToken,

      ownerId:
        "node-a",

      leaseExpiresAtEpochMs:
        5000,
    },
  };
}


function contended():
AcquireOrRenewSchedulerOwnershipResult {

  return {
    kind:
      "contended",

    observedOwnership: {
      generation:
        11,

      fencingToken:
        7,

      ownerId:
        "node-b",

      leaseExpiresAtEpochMs:
        5000,
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

  public startCalls =
    0;


  public stopCalls =
    0;


  public acquireCalls =
    0;


  public nextResult:
    AcquireOrRenewSchedulerOwnershipResult =
    contended();


  public readonly ownershipEngine = {
    acquireOrRenew:
      async (): Promise<
        AcquireOrRenewSchedulerOwnershipResult
      > => {

        this.acquireCalls +=
          1;

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


function createComposition(
  ownershipRuntime:
    FakeOwnershipRuntime,
) {

  return new ProductionSchedulerFailoverComposition(
    ownershipRuntime,
    {
      generation:
        11,

      ownerId:
        "node-a",

      leaseDurationMs:
        1000,
    },
    {
      acquisitionIntervalMs:
        25,
    },
    new FakeClock(1000),
  );
}


describe(
  "production scheduler failover lifecycle",
  () => {

    it(
      "shuts down safely while still standby",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          createComposition(
            ownershipRuntime,
          );


        composition.runtime.start();

        await composition.runtime.stop();


        expect(composition.runtime.state)
          .toBe("stopped");

        expect(ownershipRuntime.startCalls)
          .toBe(0);

        expect(ownershipRuntime.stopCalls)
          .toBe(1);
      },
    );


    it(
      "keeps ownership contention in standby",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        ownershipRuntime.nextResult =
          contended();


        const composition =
          createComposition(
            ownershipRuntime,
          );


        const result =
          await composition.integration.acquire();


        expect(result.kind)
          .toBe("contended");

        expect(composition.mode)
          .toBe("standby");

        expect(ownershipRuntime.startCalls)
          .toBe(0);
      },
    );


    it(
      "activates after successful ownership acquisition",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        ownershipRuntime.nextResult =
          acquired(8);


        const composition =
          createComposition(
            ownershipRuntime,
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
      "fails closed after ownership loss",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        ownershipRuntime.nextResult =
          acquired(8);


        const composition =
          createComposition(
            ownershipRuntime,
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

        ownershipRuntime.nextResult =
          acquired(8);


        const composition =
          createComposition(
            ownershipRuntime,
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
      "can acquire and activate again after returning to standby",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        ownershipRuntime.nextResult =
          acquired(8);


        const composition =
          createComposition(
            ownershipRuntime,
          );


        const first =
          await composition.integration.acquire();


        if (first.kind !== "acquired") {
          throw new Error(
            "Expected first acquisition.",
          );
        }


        await composition.integration.activate(
          first.ownership,
        );


        await composition.integration
          .handleAuthoritySignal({
            kind:
              "ownership_lost",
          });


        await composition.integration
          .runtimeQuiesced();


        ownershipRuntime.nextResult =
          acquired(9);


        const second =
          await composition.integration.acquire();


        if (second.kind !== "acquired") {
          throw new Error(
            "Expected second acquisition.",
          );
        }


        await composition.integration.activate(
          second.ownership,
        );


        expect(composition.mode)
          .toBe("active");

        expect(ownershipRuntime.startCalls)
          .toBe(2);
      },
    );


    it(
      "makes production shutdown idempotent",
      async () => {

        const ownershipRuntime =
          new FakeOwnershipRuntime();

        const composition =
          createComposition(
            ownershipRuntime,
          );


        composition.runtime.start();

        await composition.runtime.stop();
        await composition.runtime.stop();


        expect(ownershipRuntime.stopCalls)
          .toBe(1);

        expect(composition.runtime.state)
          .toBe("stopped");
      },
    );
  },
);
