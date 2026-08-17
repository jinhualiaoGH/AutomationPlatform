import {
  type AcquireOrRenewSchedulerOwnershipInput,
  type AcquireOrRenewSchedulerOwnershipResult,
  type ReleaseSchedulerOwnershipInput,
  type ReleaseSchedulerOwnershipResult,
} from "./durable_scheduler_ownership_engine.js";

import {
  type FencedSchedulerRuntimeIdentity,
} from "./fenced_scheduler_runtime_adapter.js";


export type OwnershipAwareSchedulerRuntimeTarget = {
  start():
    void;

  stop():
    Promise<void>;
};


export type SchedulerOwnershipLifecycleEngine = {
  acquireOrRenew(
    input:
      AcquireOrRenewSchedulerOwnershipInput,
  ): Promise<AcquireOrRenewSchedulerOwnershipResult>;

  release(
    input:
      ReleaseSchedulerOwnershipInput,
  ): Promise<ReleaseSchedulerOwnershipResult>;
};


export type SchedulerOwnershipLifecycleClock = {
  nowEpochMs():
    number;
};


export class SystemSchedulerOwnershipLifecycleClock
implements SchedulerOwnershipLifecycleClock {

  public nowEpochMs():
    number {

    return Date.now();
  }
}


export type OwnershipAwareSchedulerRuntimeLifecycleOptions = {
  readonly generation:
    number;

  readonly ownerId:
    string;

  readonly leaseDurationMs:
    number;
};


export type OwnershipAwareSchedulerRuntimeLifecycleState =
  | "idle"
  | "running"
  | "stopped"
  | "lost_authority";


export type OwnershipAwareSchedulerRuntimeStartResult =
  | {
      readonly kind:
        "started";

      readonly identity:
        FencedSchedulerRuntimeIdentity;
    }
  | {
      readonly kind:
        "contended";

      readonly result:
        Extract<
          AcquireOrRenewSchedulerOwnershipResult,
          {
            readonly kind:
              "contended";
          }
        >;
    }
  | {
      readonly kind:
        "generation_mismatch";

      readonly result:
        Extract<
          AcquireOrRenewSchedulerOwnershipResult,
          {
            readonly kind:
              "generation_mismatch";
          }
        >;
    };


export type OwnershipAwareSchedulerRuntimeRenewResult =
  | {
      readonly kind:
        "renewed";

      readonly identity:
        FencedSchedulerRuntimeIdentity;
    }
  | {
      readonly kind:
        "lost_authority";

      readonly result:
        Exclude<
          AcquireOrRenewSchedulerOwnershipResult,
          {
            readonly kind:
              "renewed";
          }
        >;
    };


export type OwnershipAwareSchedulerRuntimeStopResult = {
  readonly kind:
    "stopped";

  readonly release:
    ReleaseSchedulerOwnershipResult |
    null;
};


function assertPositiveSafeInteger(
  value: number,
  label: string,
): void {

  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${label} must be a positive safe integer.`,
    );
  }
}


export class OwnershipAwareSchedulerRuntimeLifecycle {

  private stateValue:
    OwnershipAwareSchedulerRuntimeLifecycleState =
    "idle";


  private identityValue:
    FencedSchedulerRuntimeIdentity |
    null =
    null;


  public constructor(
    private readonly runtime:
      OwnershipAwareSchedulerRuntimeTarget,

    private readonly ownership:
      SchedulerOwnershipLifecycleEngine,

    private readonly options:
      OwnershipAwareSchedulerRuntimeLifecycleOptions,

    private readonly clock:
      SchedulerOwnershipLifecycleClock =
      new SystemSchedulerOwnershipLifecycleClock(),
  ) {

    assertPositiveSafeInteger(
      options.generation,
      "Scheduler generation",
    );


    assertPositiveSafeInteger(
      options.leaseDurationMs,
      "Scheduler lease duration",
    );


    if (
      options.ownerId.trim().length ===
      0
    ) {
      throw new Error(
        "Scheduler owner identity must not be empty.",
      );
    }
  }


  public get state():
    OwnershipAwareSchedulerRuntimeLifecycleState {

    return this.stateValue;
  }


  public get identity():
    FencedSchedulerRuntimeIdentity |
    null {

    return this.identityValue;
  }


  public async start():
    Promise<OwnershipAwareSchedulerRuntimeStartResult> {

    if (
      this.stateValue !==
      "idle"
    ) {
      throw new Error(
        "Ownership-aware scheduler runtime can only be started once.",
      );
    }


    const result =
      await this.ownership.acquireOrRenew({
        generation:
          this.options.generation,

        ownerId:
          this.options.ownerId,

        nowEpochMs:
          this.clock.nowEpochMs(),

        leaseDurationMs:
          this.options.leaseDurationMs,
      });


    if (
      result.kind ===
      "contended"
    ) {
      return Object.freeze({
        kind:
          "contended",

        result,
      });
    }


    if (
      result.kind ===
      "generation_mismatch"
    ) {
      return Object.freeze({
        kind:
          "generation_mismatch",

        result,
      });
    }


    /*
     * Starting from the idle lifecycle must obtain a new
     * acquisition, never a renewal of an already-active owner.
     */
    if (
      result.kind !==
      "acquired"
    ) {
      throw new Error(
        "Initial scheduler ownership transition was not an acquisition.",
      );
    }


    const identity =
      Object.freeze({
        generation:
          result.ownership.generation,

        ownerId:
          result.ownership.ownerId,

        fencingToken:
          result.ownership.fencingToken,
      });


    /*
     * Publish authority before runtime.start(). If start throws,
     * immediately release the exact fencing identity that was
     * allocated for this failed runtime.
     */
    this.identityValue =
      identity;


    try {

      this.runtime.start();

      this.stateValue =
        "running";
    }
    catch (error) {

      this.identityValue =
        null;


      await this.ownership.release({
        generation:
          identity.generation,

        ownerId:
          identity.ownerId,

        fencingToken:
          identity.fencingToken,
      });


      throw error;
    }


    return Object.freeze({
      kind:
        "started",

      identity,
    });
  }


  public async renew():
    Promise<OwnershipAwareSchedulerRuntimeRenewResult> {

    if (
      this.stateValue !==
      "running" ||
      this.identityValue ===
      null
    ) {
      throw new Error(
        "Scheduler ownership can only be renewed while the runtime is running.",
      );
    }


    const result =
      await this.ownership.acquireOrRenew({
        generation:
          this.options.generation,

        ownerId:
          this.options.ownerId,

        nowEpochMs:
          this.clock.nowEpochMs(),

        leaseDurationMs:
          this.options.leaseDurationMs,
      });


    if (
      result.kind ===
      "renewed"
    ) {

      const identity =
        Object.freeze({
          generation:
            result.ownership.generation,

          ownerId:
            result.ownership.ownerId,

          fencingToken:
            result.ownership.fencingToken,
        });


      this.identityValue =
        identity;


      return Object.freeze({
        kind:
          "renewed",

        identity,
      });
    }


    /*
     * A runtime that cannot renew its exact durable authority
     * must stop before doing additional scheduler work.
     *
     * A12.6 independently fences every dispatch, providing
     * the second fail-closed boundary.
     */
    this.stateValue =
      "lost_authority";

    this.identityValue =
      null;


    await this.runtime.stop();


    return Object.freeze({
      kind:
        "lost_authority",

      result,
    });
  }


  public async stop():
    Promise<OwnershipAwareSchedulerRuntimeStopResult> {

    if (
      this.stateValue ===
      "stopped"
    ) {
      return Object.freeze({
        kind:
          "stopped",

        release:
          null,
      });
    }


    const identity =
      this.identityValue;


    /*
     * Stop runtime activity before releasing durable authority.
     * This prevents this process from continuing scheduler work
     * after another process becomes eligible to acquire.
     */
    if (
      this.stateValue ===
        "running" ||
      this.stateValue ===
        "lost_authority"
    ) {
      await this.runtime.stop();
    }


    this.stateValue =
      "stopped";

    this.identityValue =
      null;


    if (identity === null) {
      return Object.freeze({
        kind:
          "stopped",

        release:
          null,
      });
    }


    const release =
      await this.ownership.release({
        generation:
          identity.generation,

        ownerId:
          identity.ownerId,

        fencingToken:
          identity.fencingToken,
      });


    return Object.freeze({
      kind:
        "stopped",

      release,
    });
  }
}
