import {
  type AcquireOrRenewSchedulerOwnershipResult,
} from "./durable_scheduler_ownership_engine.js";

import {
  type DurableSchedulerStandbyAcquisitionLifecycle,
} from "./durable_scheduler_standby_acquisition_supervisor.js";

import {
  decideSchedulerFailoverTransition,
  type SchedulerFailoverMode,
  type SchedulerFailoverSignal,
} from "./scheduler_failover_contract.js";


type AcquiredOwnership =
  Extract<
    AcquireOrRenewSchedulerOwnershipResult,
    {
      readonly kind:
        "acquired";
    }
  >["ownership"];


export interface SchedulerStandbyOwnershipAuthority {
  acquireOrRenew():
    Promise<AcquireOrRenewSchedulerOwnershipResult>;
}


export interface SchedulerFailoverRuntimeController {
  activate(
    ownership:
      AcquiredOwnership,
  ): Promise<void>;

  deactivate():
    Promise<void>;
}


export class SchedulerStandbyActiveFailoverIntegration
implements DurableSchedulerStandbyAcquisitionLifecycle {

  private modeValue:
    SchedulerFailoverMode =
    "standby";


  public constructor(
    private readonly ownershipAuthority:
      SchedulerStandbyOwnershipAuthority,

    private readonly runtime:
      SchedulerFailoverRuntimeController,
  ) {}


  public get mode():
    SchedulerFailoverMode {

    return this.modeValue;
  }


  public get state():
    "standby" |
    "active" {

    /*
     * The D3 acquisition supervisor is only valid in standby.
     *
     * fail_closed must never be presented to D3 as active authority.
     * It therefore projects as standby only after the explicit
     * runtime_quiesced transition has actually occurred.
     */
    if (
      this.modeValue ===
      "active"
    ) {
      return "active";
    }


    return "standby";
  }


  public acquire():
    Promise<AcquireOrRenewSchedulerOwnershipResult> {

    if (
      this.modeValue !==
      "standby"
    ) {
      throw new Error(
        "Durable scheduler acquisition is permitted only from standby.",
      );
    }


    return this.ownershipAuthority.acquireOrRenew();
  }


  public async activate(
    ownership:
      AcquiredOwnership,
  ): Promise<void> {

    const transition =
      decideSchedulerFailoverTransition(
        this.modeValue,
        {
          kind:
            "ownership_acquired",
        },
      );


    if (
      transition.nextMode !==
        "active" ||
      transition.action !==
        "activate_runtime"
    ) {
      throw new Error(
        "Frozen failover contract rejected standby activation.",
      );
    }


    /*
     * State changes only after runtime activation succeeds.
     * A failed runtime start therefore cannot manufacture ACTIVE state.
     */
    await this.runtime.activate(
      ownership,
    );


    this.modeValue =
      transition.nextMode;
  }


  public async handleAuthoritySignal(
    signal:
      Extract<
        SchedulerFailoverSignal,
        {
          readonly kind:
            | "ownership_contended"
            | "ownership_released"
            | "ownership_lost"
            | "generation_mismatch";
        }
      >,
  ): Promise<void> {

    const transition =
      decideSchedulerFailoverTransition(
        this.modeValue,
        signal,
      );


    if (
      this.modeValue ===
        "active" &&
      transition.nextMode ===
        "fail_closed" &&
      transition.action ===
        "deactivate_runtime"
    ) {

      /*
       * Fail closed immediately in the state machine before awaiting
       * runtime teardown. No subsequent operation may treat this
       * instance as active authority.
       */
      this.modeValue =
        transition.nextMode;


      await this.runtime.deactivate();


      return;
    }


    this.modeValue =
      transition.nextMode;
  }


  public async runtimeQuiesced():
    Promise<void> {

    const transition =
      decideSchedulerFailoverTransition(
        this.modeValue,
        {
          kind:
            "runtime_quiesced",
        },
      );


    if (
      this.modeValue ===
        "fail_closed"
    ) {

      if (
        transition.nextMode !==
          "standby" ||
        transition.action !==
          "enter_standby"
      ) {
        throw new Error(
          "Frozen failover contract rejected controlled standby reentry.",
        );
      }
    }


    this.modeValue =
      transition.nextMode;
  }


  public async shutdown():
    Promise<void> {

    const transition =
      decideSchedulerFailoverTransition(
        this.modeValue,
        {
          kind:
            "shutdown",
        },
      );


    if (
      transition.action !==
      "stop"
    ) {
      throw new Error(
        "Frozen failover contract rejected shutdown.",
      );
    }


    if (
      this.modeValue ===
      "active"
    ) {
      this.modeValue =
        "fail_closed";


      await this.runtime.deactivate();
    }
  }
}