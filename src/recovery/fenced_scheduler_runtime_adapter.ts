import {
  isSchedulerOwnershipExpired,
  normalizeSchedulerOwnerId,
} from "./durable_scheduler_ownership_contract.js";

import {
  type SchedulerOwnershipState,
} from "../repositories/scheduler_ownership_state_repository.js";

import {
  type TriggerDispatchSummary,
} from "../scheduling/trigger_dispatcher.js";


export type FencedSchedulerRuntimeStateReader = {
  read():
    Promise<SchedulerOwnershipState>;
};


export type FencedSchedulerRuntimeDispatcher = {
  dispatchDue(
    now: Date,
  ): Promise<TriggerDispatchSummary>;
};


export type FencedSchedulerRuntimeIdentity = {
  readonly generation: number;
  readonly ownerId: string;
  readonly fencingToken: number;
};


export type FencedSchedulerDispatchResult =
  | {
      readonly kind: "dispatched";
      readonly summary:
        TriggerDispatchSummary;
    }
  | {
      readonly kind: "unowned";
    }
  | {
      readonly kind: "generation_mismatch";
      readonly observedGeneration: number;
    }
  | {
      readonly kind: "foreign_owner";
      readonly observedOwnerId: string;
    }
  | {
      readonly kind: "fenced";
      readonly observedFencingToken: number;
    }
  | {
      readonly kind: "lease_expired";
      readonly leaseExpiresAtEpochMs: number;
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


export class FencedSchedulerRuntimeAdapter {

  private readonly identity:
    FencedSchedulerRuntimeIdentity;


  constructor(
    private readonly stateReader:
      FencedSchedulerRuntimeStateReader,

    private readonly dispatcher:
      FencedSchedulerRuntimeDispatcher,

    identity:
      FencedSchedulerRuntimeIdentity,
  ) {

    assertPositiveSafeInteger(
      identity.generation,
      "Scheduler generation",
    );

    assertPositiveSafeInteger(
      identity.fencingToken,
      "Scheduler fencing token",
    );

    this.identity =
      Object.freeze({
        generation:
          identity.generation,

        ownerId:
          normalizeSchedulerOwnerId(
            identity.ownerId,
          ),

        fencingToken:
          identity.fencingToken,
      });
  }


  public async dispatchDue(
    now: Date,
  ): Promise<FencedSchedulerDispatchResult> {

    const nowEpochMs =
      now.getTime();


    assertPositiveSafeInteger(
      nowEpochMs,
      "Current epoch time",
    );


    const state =
      await this.stateReader.read();


    if (
      state.generation !==
      this.identity.generation
    ) {
      return Object.freeze({
        kind:
          "generation_mismatch",

        observedGeneration:
          state.generation,
      });
    }


    const ownership =
      state.ownership;


    if (ownership === null) {
      return Object.freeze({
        kind:
          "unowned",
      });
    }


    if (
      ownership.ownerId !==
      this.identity.ownerId
    ) {
      return Object.freeze({
        kind:
          "foreign_owner",

        observedOwnerId:
          ownership.ownerId,
      });
    }


    if (
      ownership.fencingToken !==
      this.identity.fencingToken
    ) {
      return Object.freeze({
        kind:
          "fenced",

        observedFencingToken:
          ownership.fencingToken,
      });
    }


    if (
      isSchedulerOwnershipExpired(
        ownership,
        nowEpochMs,
      )
    ) {
      return Object.freeze({
        kind:
          "lease_expired",

        leaseExpiresAtEpochMs:
          ownership.leaseExpiresAtEpochMs,
      });
    }


    const summary =
      await this.dispatcher.dispatchDue(
        now,
      );


    return Object.freeze({
      kind:
        "dispatched",

      summary,
    });
  }
}
