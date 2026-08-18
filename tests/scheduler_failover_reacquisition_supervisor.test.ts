import {
  describe,
  expect,
  it,
} from "vitest";

import {
  type DurableSchedulerStandbyAcquisitionSupervisorExit,
} from "../src/recovery/durable_scheduler_standby_acquisition_supervisor.js";

import {
  SchedulerFailoverReacquisitionSupervisor,
  type SchedulerReacquisitionFailoverIntegration,
  type SchedulerStandbyAcquisitionCycle,
  type SchedulerStandbyAcquisitionCycleFactory,
} from "../src/recovery/scheduler_failover_reacquisition_supervisor.js";


class ControlledCycle
implements SchedulerStandbyAcquisitionCycle {

  public startCount =
    0;


  public stopCount =
    0;


  private resolveRun:
    (
      value:
        DurableSchedulerStandbyAcquisitionSupervisorExit,
    ) => void =
    () => {};


  private readonly run =
    new Promise<DurableSchedulerStandbyAcquisitionSupervisorExit>(
      (
        resolve,
      ) => {

        this.resolveRun =
          resolve;
      },
    );


  public start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    this.startCount +=
      1;


    return this.run;
  }


  public async stop():
    Promise<void> {

    this.stopCount +=
      1;


    this.resolveRun({
      kind:
        "stopped",
    });
  }


  public activate():
    void {

    this.resolveRun({
      kind:
        "activated",

      acquisition:
        {
          kind:
            "acquired",

          ownership:
            {
              generation:
                13,

              fencingToken:
                101,

              ownerId:
                "d5-owner",

              leaseExpiresAtEpochMs:
                30_000,
            },
        },
    });
  }
}


class ControlledCycleFactory
implements SchedulerStandbyAcquisitionCycleFactory {

  public readonly cycles:
    ControlledCycle[] =
    [];


  public create():
    SchedulerStandbyAcquisitionCycle {

    const cycle =
      new ControlledCycle();


    this.cycles.push(
      cycle,
    );


    return cycle;
  }
}


class ControlledIntegration
implements SchedulerReacquisitionFailoverIntegration {

  public mode:
    "standby" |
    "active" |
    "fail_closed" =
    "standby";


  public authoritySignals =
    0;


  public quiescenceCalls =
    0;


  public async handleAuthoritySignal():
    Promise<void> {

    this.authoritySignals +=
      1;


    if (
      this.mode ===
      "active"
    ) {
      this.mode =
        "fail_closed";
    }
  }


  public async runtimeQuiesced():
    Promise<void> {

    this.quiescenceCalls +=
      1;


    if (
      this.mode !==
      "fail_closed"
    ) {
      throw new Error(
        "Expected fail_closed before quiescence.",
      );
    }


    this.mode =
      "standby";
  }
}


describe(
  "SchedulerFailoverReacquisitionSupervisor",
  () => {

    it(
      "creates exactly one initial standby acquisition cycle",
      async () => {

        const integration =
          new ControlledIntegration();

        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        const run =
          supervisor.start();


        expect(
          factory.cycles,
        ).toHaveLength(
          1,
        );

        expect(
          supervisor.cycleCount,
        ).toBe(
          1,
        );


        factory.cycles[0]!.activate();


        await run;
      },
    );


    it(
      "coalesces concurrent start requests into one acquisition cycle",
      async () => {

        const integration =
          new ControlledIntegration();

        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        const first =
          supervisor.start();

        const second =
          supervisor.start();


        expect(
          factory.cycles,
        ).toHaveLength(
          1,
        );

        expect(
          first,
        ).toBe(
          second,
        );


        factory.cycles[0]!.activate();


        await Promise.all([
          first,
          second,
        ]);
      },
    );


    it(
      "does not start reacquisition directly from fail_closed",
      async () => {

        const integration =
          new ControlledIntegration();

        integration.mode =
          "active";


        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        await supervisor.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );

        expect(
          factory.cycles,
        ).toHaveLength(
          0,
        );


        expect(
          () =>
            supervisor.start(),
        ).toThrow(
          "Scheduler acquisition cycle may begin only from standby.",
        );
      },
    );


    it(
      "creates a fresh acquisition cycle only after runtime quiescence",
      async () => {

        const integration =
          new ControlledIntegration();

        integration.mode =
          "active";


        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        await supervisor.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );


        const reentry =
          supervisor.runtimeQuiescedAndReacquire();


        /*
         * runtimeQuiescedAndReacquire() crosses an awaited
         * runtimeQuiesced() boundary before creating the fresh
         * acquisition cycle. Allow that continuation to run.
         */
        await Promise.resolve();


        expect(
          integration.quiescenceCalls,
        ).toBe(
          1,
        );

        expect(
          integration.mode,
        ).toBe(
          "standby",
        );

        expect(
          factory.cycles,
        ).toHaveLength(
          1,
        );


        factory.cycles[0]!.activate();


        await reentry;
      },
    );


    it(
      "coalesces duplicate quiescence reentry requests",
      async () => {

        const integration =
          new ControlledIntegration();

        integration.mode =
          "active";


        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        await supervisor.handleAuthoritySignal({
          kind:
            "generation_mismatch",
        });


        const first =
          supervisor.runtimeQuiescedAndReacquire();

        const second =
          supervisor.runtimeQuiescedAndReacquire();


        /*
         * Both requests are synchronously coalesced, while fresh
         * cycle creation occurs after the quiescence await.
         */
        await Promise.resolve();


        expect(
          first,
        ).toBe(
          second,
        );

        expect(
          integration.quiescenceCalls,
        ).toBe(
          1,
        );

        expect(
          factory.cycles,
        ).toHaveLength(
          1,
        );


        factory.cycles[0]!.activate();


        await Promise.all([
          first,
          second,
        ]);
      },
    );


    it(
      "uses a new supervisor generation after each completed failover cycle",
      async () => {

        const integration =
          new ControlledIntegration();

        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        const firstRun =
          supervisor.start();


        factory.cycles[0]!.activate();

        await firstRun;


        integration.mode =
          "active";


        await supervisor.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        const secondRun =
          supervisor.runtimeQuiescedAndReacquire();


        /*
         * The second acquisition generation is created only after
         * fail-closed runtime quiescence completes asynchronously.
         */
        await Promise.resolve();


        expect(
          factory.cycles,
        ).toHaveLength(
          2,
        );

        expect(
          factory.cycles[1],
        ).not.toBe(
          factory.cycles[0],
        );

        expect(
          supervisor.cycleCount,
        ).toBe(
          2,
        );


        factory.cycles[1]!.activate();


        await secondRun;
      },
    );


    it(
      "stop prevents all future acquisition generations",
      async () => {

        const integration =
          new ControlledIntegration();

        const factory =
          new ControlledCycleFactory();

        const supervisor =
          new SchedulerFailoverReacquisitionSupervisor(
            integration,
            factory,
          );


        const run =
          supervisor.start();


        await supervisor.stop();


        await run;


        expect(
          supervisor.stopped,
        ).toBe(
          true,
        );

        expect(
          factory.cycles[0]!.stopCount,
        ).toBe(
          1,
        );


        expect(
          () =>
            supervisor.start(),
        ).toThrow(
          "Scheduler reacquisition supervision has been stopped.",
        );


        expect(
          factory.cycles,
        ).toHaveLength(
          1,
        );
      },
    );
  },
);