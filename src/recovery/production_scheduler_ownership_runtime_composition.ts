import {
  DurableSchedulerLeaseRenewalSupervisor,
  type DurableSchedulerLeaseRenewalSupervisorExit,
} from "./durable_scheduler_lease_renewal_supervisor.js";

import {
  DurableSchedulerOwnershipEngine,
} from "./durable_scheduler_ownership_engine.js";

import {
  FencedSchedulerPollingDispatcher,
} from "./fenced_scheduler_polling_loop_composition.js";

import {
  OwnershipAwareSchedulerRuntimeLifecycle,
  type OwnershipAwareSchedulerRuntimeStartResult,
  type OwnershipAwareSchedulerRuntimeStopResult,
} from "./ownership_aware_scheduler_runtime_lifecycle.js";

import {
  type FencedSchedulerRuntimeIdentity,
  type FencedSchedulerRuntimeStateReader,
} from "./fenced_scheduler_runtime_adapter.js";

import {
  SchedulerOwnershipStateRepository,
} from "../repositories/scheduler_ownership_state_repository.js";

import {
  SchedulerPollingLoop,
  type SchedulerDispatcher,
} from "../scheduling/scheduler_polling_loop.js";

import {
  SchedulerRuntime,
} from "../scheduling/scheduler_runtime.js";


export type ProductionSchedulerOwnershipRuntimeOptions = {
  readonly generation:
    number;

  readonly ownerId:
    string;

  readonly leaseDurationMs:
    number;

  readonly renewalIntervalMs:
    number;
};


export type ProductionSchedulerOwnershipRuntimeStartResult =
  | {
      readonly kind:
        "started";

      readonly identity:
        FencedSchedulerRuntimeIdentity;

      readonly supervision:
        Promise<
          DurableSchedulerLeaseRenewalSupervisorExit
        >;
    }
  | Exclude<
      OwnershipAwareSchedulerRuntimeStartResult,
      {
        readonly kind:
          "started";
      }
    >;


export type ProductionSchedulerOwnershipRuntimeStopResult =
  OwnershipAwareSchedulerRuntimeStopResult;


export type ProductionSchedulerRuntimeIdentityProvider =
  () =>
    FencedSchedulerRuntimeIdentity |
    null;


export function createRenewalAwareFencedSchedulerDispatcher(
  stateReader:
    FencedSchedulerRuntimeStateReader,

  dispatcher:
    SchedulerDispatcher,

  identityProvider:
    ProductionSchedulerRuntimeIdentityProvider,
):
SchedulerDispatcher {

  return Object.freeze({
    async dispatchDue(
      evaluatedAtUtc:
        Date,

      limit?:
        number,
    ) {

      /*
       * The ownership engine advances the fencing token on every
       * successful renewal.
       *
       * Resolve the lifecycle identity immediately before every
       * dispatch so the polling runtime follows that durable token
       * rather than retaining the token captured at startup.
       */
      const identity =
        identityProvider();


      if (identity === null) {
        throw new Error(
          "Durable scheduler ownership identity is unavailable before dispatch.",
        );
      }


      const fenced =
        new FencedSchedulerPollingDispatcher(
          stateReader,
          dispatcher,
          identity,
        );


      return fenced.dispatchDue(
        evaluatedAtUtc,
        limit,
      );
    },
  });
}


class LazyFencedSchedulerRuntime {

  private runtime:
    SchedulerRuntime |
    null =
    null;


  public constructor(
    private readonly dispatcher:
      SchedulerDispatcher,

    private readonly identityProvider:
      ProductionSchedulerRuntimeIdentityProvider,

    private readonly stateReader:
      SchedulerOwnershipStateRepository,
  ) {}


  public start():
    void {

    if (this.runtime !== null) {
      throw new Error(
        "Lazy fenced scheduler runtime can only be started once.",
      );
    }


    const identity =
      this.identityProvider();


    if (identity === null) {
      throw new Error(
        "Durable scheduler ownership identity is unavailable at runtime start.",
      );
    }


    /*
     * Validate that authority has already been published by the
     * ownership-aware lifecycle before materializing SchedulerRuntime.
     */
    void identity;


    const renewalAwareDispatcher =
      createRenewalAwareFencedSchedulerDispatcher(
        this.stateReader,
        this.dispatcher,
        this.identityProvider,
      );


    const runtime =
      new SchedulerRuntime(
        new SchedulerPollingLoop(
          renewalAwareDispatcher,
        ),
      );


    this.runtime =
      runtime;


    runtime.start();
  }


  public async stop():
    Promise<void> {

    const runtime =
      this.runtime;


    if (runtime === null) {
      return;
    }


    await runtime.stop();
  }


  public get innerRuntime():
    SchedulerRuntime |
    null {

    return this.runtime;
  }
}


export class ProductionSchedulerOwnershipRuntime {

  public readonly repository:
    SchedulerOwnershipStateRepository;


  public readonly ownershipEngine:
    DurableSchedulerOwnershipEngine;


  public readonly lifecycle:
    OwnershipAwareSchedulerRuntimeLifecycle;


  public readonly renewalSupervisor:
    DurableSchedulerLeaseRenewalSupervisor;


  private readonly runtime:
    LazyFencedSchedulerRuntime;


  public constructor(
    dispatcher:
      SchedulerDispatcher,

    options:
      ProductionSchedulerOwnershipRuntimeOptions,

    repository =
      new SchedulerOwnershipStateRepository(),
  ) {

    this.repository =
      repository;


    this.ownershipEngine =
      new DurableSchedulerOwnershipEngine(
        this.repository,
      );


    let lifecycle:
      OwnershipAwareSchedulerRuntimeLifecycle |
      null =
      null;


    this.runtime =
      new LazyFencedSchedulerRuntime(
        dispatcher,

        () =>
          lifecycle?.identity ??
          null,

        this.repository,
      );


    lifecycle =
      new OwnershipAwareSchedulerRuntimeLifecycle(
        this.runtime,
        this.ownershipEngine,
        {
          generation:
            options.generation,

          ownerId:
            options.ownerId,

          leaseDurationMs:
            options.leaseDurationMs,
        },
      );


    this.lifecycle =
      lifecycle;


    this.renewalSupervisor =
      new DurableSchedulerLeaseRenewalSupervisor(
        this.lifecycle,
        {
          renewalIntervalMs:
            options.renewalIntervalMs,
        },
      );
  }


  public async start():
    Promise<ProductionSchedulerOwnershipRuntimeStartResult> {

    const result =
      await this.lifecycle.start();


    if (
      result.kind !==
      "started"
    ) {
      return result;
    }


    /*
     * The lifecycle acquires and publishes the ownership
     * identity before LazyFencedSchedulerRuntime.start().
     * Therefore the real SchedulerRuntime is already fenced
     * when the renewal supervisor begins.
     */
    const supervision =
      this.renewalSupervisor.start();


    return Object.freeze({
      kind:
        "started",

      identity:
        result.identity,

      supervision,
    });
  }


  public async stop():
    Promise<ProductionSchedulerOwnershipRuntimeStopResult> {

    return this.renewalSupervisor.stop();
  }


  public get schedulerRuntime():
    SchedulerRuntime |
    null {

    return this.runtime.innerRuntime;
  }
}


export function composeProductionSchedulerOwnershipRuntime(
  dispatcher:
    SchedulerDispatcher,

  options:
    ProductionSchedulerOwnershipRuntimeOptions,
):
ProductionSchedulerOwnershipRuntime {

  return new ProductionSchedulerOwnershipRuntime(
    dispatcher,
    options,
  );
}
