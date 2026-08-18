import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  DurableSchedulerStandbyAcquisitionSupervisorExit,
} from "../src/recovery/durable_scheduler_standby_acquisition_supervisor.js";

import type {
  SchedulerFailoverMode,
} from "../src/recovery/scheduler_failover_contract.js";

import {
  ProductionSchedulerFailoverRuntime,
  type ProductionSchedulerFailoverIntegration,
  type ProductionSchedulerFailoverReacquisitionSupervisor,
} from "../src/recovery/production_scheduler_failover_runtime.js";


function deferred<T>() {
  let resolvePromise:
    (value: T) => void =
    () => {
      throw new Error(
        "Deferred promise was not initialized.",
      );
    };


  const promise =
    new Promise<T>(
      (resolve) => {
        resolvePromise =
          resolve;
      },
    );


  return {
    promise,
    resolve:
      resolvePromise,
  };
}


class FakeIntegration
implements ProductionSchedulerFailoverIntegration {

  public mode:
    SchedulerFailoverMode =
    "standby";


  public shutdownCalls =
    0;


  public async shutdown():
    Promise<void> {

    this.shutdownCalls +=
      1;
  }
}


class FakeReacquisitionSupervisor
implements ProductionSchedulerFailoverReacquisitionSupervisor {

  public readonly run =
    deferred<DurableSchedulerStandbyAcquisitionSupervisorExit>();


  public startCalls =
    0;


  public stopCalls =
    0;


  public start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    this.startCalls +=
      1;

    return this.run.promise;
  }


  public async stop():
    Promise<void> {

    this.stopCalls +=
      1;

    this.run.resolve({
      kind:
        "stopped",
    });
  }
}


describe(
  "ProductionSchedulerFailoverRuntime",
  () => {

    it(
      "begins idle in standby",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        expect(runtime.state)
          .toBe("idle");

        expect(runtime.mode)
          .toBe("standby");

        expect(runtime.supervision)
          .toBeNull();

        expect(runtime.snapshot())
          .toEqual({
            state:
              "idle",

            mode:
              "standby",

            isRunning:
              false,
          });
      },
    );


    it(
      "starts reacquisition supervision without awaiting ownership",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        const supervision =
          runtime.start();


        expect(supervision)
          .toBe(supervisor.run.promise);

        expect(runtime.supervision)
          .toBe(supervisor.run.promise);

        expect(runtime.state)
          .toBe("running");

        expect(supervisor.startCalls)
          .toBe(1);
      },
    );


    it(
      "treats standby as a healthy running production state",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();


        expect(runtime.snapshot())
          .toEqual({
            state:
              "running",

            mode:
              "standby",

            isRunning:
              true,
          });
      },
    );


    it(
      "reports active mode through the integration",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();

        integration.mode =
          "active";


        expect(runtime.snapshot())
          .toEqual({
            state:
              "running",

            mode:
              "active",

            isRunning:
              true,
          });
      },
    );


    it(
      "returns the same supervision promise on repeated start",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        const first =
          runtime.start();

        const second =
          runtime.start();


        expect(second)
          .toBe(first);

        expect(supervisor.startCalls)
          .toBe(1);
      },
    );


    it(
      "rejects initial start outside standby",
      () => {

        const integration =
          new FakeIntegration();

        integration.mode =
          "active";


        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        expect(
          () =>
            runtime.start(),
        ).toThrow(
          "Production scheduler failover runtime must start in standby.",
        );

        expect(supervisor.startCalls)
          .toBe(0);

        expect(runtime.state)
          .toBe("idle");
      },
    );


    it(
      "stops reacquisition supervision",
      async () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();

        await runtime.stop();


        expect(supervisor.stopCalls)
          .toBe(1);

        expect(runtime.state)
          .toBe("stopped");

        expect(runtime.snapshot().isRunning)
          .toBe(false);
      },
    );


    it(
      "shuts down the active production integration after supervision stops",
      async () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();

        integration.mode =
          "active";

        await runtime.stop();


        expect(supervisor.stopCalls)
          .toBe(1);

        expect(integration.shutdownCalls)
          .toBe(1);

        expect(runtime.state)
          .toBe("stopped");
      },
    );

    it(
      "makes stop idempotent",
      async () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();

        await runtime.stop();
        await runtime.stop();


        expect(supervisor.stopCalls)
          .toBe(1);
      },
    );


    it(
      "cannot restart after stop",
      async () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();

        await runtime.stop();


        expect(
          () =>
            runtime.start(),
        ).toThrow(
          "Production scheduler failover runtime has been stopped.",
        );
      },
    );


    it(
      "returns a defensive snapshot",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        const snapshot =
          runtime.snapshot();


        expect(
          Object.isFrozen(snapshot),
        ).toBe(true);
      },
    );


    it(
      "does not duplicate supervisor start during repeated callers",
      () => {

        const integration =
          new FakeIntegration();

        const supervisor =
          new FakeReacquisitionSupervisor();

        const startSpy =
          vi.spyOn(
            supervisor,
            "start",
          );

        const runtime =
          new ProductionSchedulerFailoverRuntime(
            integration,
            supervisor,
          );


        runtime.start();
        runtime.start();
        runtime.start();


        expect(startSpy)
          .toHaveBeenCalledTimes(1);
      },
    );
  },
);
