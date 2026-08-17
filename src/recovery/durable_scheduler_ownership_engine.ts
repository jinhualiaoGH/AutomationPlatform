import {
  assertCurrentSchedulerFencingToken,
  assertSchedulerOwnershipGeneration,
  createDurableSchedulerOwnership,
  isSchedulerOwnershipExpired,
  normalizeSchedulerOwnerId,
  type DurableSchedulerOwnership,
} from "./durable_scheduler_ownership_contract.js";

import {
  type ReplaceSchedulerOwnershipInput,
  type ReplaceSchedulerOwnershipResult,
  type SchedulerOwnershipState,
} from "../repositories/scheduler_ownership_state_repository.js";


export interface SchedulerOwnershipStateStore {
  read():
    Promise<SchedulerOwnershipState>;

  replaceIfCurrent(
    input: ReplaceSchedulerOwnershipInput,
  ): Promise<ReplaceSchedulerOwnershipResult>;
}


export interface AcquireOrRenewSchedulerOwnershipInput {
  readonly generation: number;
  readonly ownerId: string;
  readonly nowEpochMs: number;
  readonly leaseDurationMs: number;
}


export type AcquireOrRenewSchedulerOwnershipResult =
  | {
      readonly kind: "acquired";
      readonly ownership:
        DurableSchedulerOwnership;
    }
  | {
      readonly kind: "renewed";
      readonly ownership:
        DurableSchedulerOwnership;
    }
  | {
      readonly kind: "contended";
      readonly observedOwnership:
        DurableSchedulerOwnership |
        null;
    }
  | {
      readonly kind: "generation_mismatch";
      readonly observedGeneration: number;
    };


export interface ReleaseSchedulerOwnershipInput {
  readonly generation: number;
  readonly ownerId: string;
  readonly fencingToken: number;
}


export type ReleaseSchedulerOwnershipResult =
  | {
      readonly kind: "released";
    }
  | {
      readonly kind: "already_unowned";
    }
  | {
      readonly kind: "fenced";
      readonly observedOwnership:
        DurableSchedulerOwnership;
    }
  | {
      readonly kind: "generation_mismatch";
      readonly observedGeneration: number;
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


function addSafePositiveIntegers(
  left: number,
  right: number,
  label: string,
): number {

  assertPositiveSafeInteger(
    left,
    label,
  );


  assertPositiveSafeInteger(
    right,
    label,
  );


  if (
    left >
    Number.MAX_SAFE_INTEGER -
    right
  ) {
    throw new Error(
      `${label} overflow.`,
    );
  }


  return left + right;
}


function nextFencingToken(
  current: number,
): number {

  if (
    !Number.isSafeInteger(current) ||
    current < 0
  ) {
    throw new Error(
      "Current scheduler fencing token is invalid.",
    );
  }


  if (
    current ===
    Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "Scheduler fencing token overflow.",
    );
  }


  return current + 1;
}


export class DurableSchedulerOwnershipEngine {

  constructor(
    private readonly store:
      SchedulerOwnershipStateStore,
  ) {}


  async acquireOrRenew(
    input:
      AcquireOrRenewSchedulerOwnershipInput,
  ): Promise<AcquireOrRenewSchedulerOwnershipResult> {

    assertPositiveSafeInteger(
      input.generation,
      "Scheduler generation",
    );


    assertPositiveSafeInteger(
      input.nowEpochMs,
      "Current epoch time",
    );


    assertPositiveSafeInteger(
      input.leaseDurationMs,
      "Scheduler lease duration",
    );


    const ownerId =
      normalizeSchedulerOwnerId(
        input.ownerId,
      );


    const current =
      await this.store.read();


    if (
      current.generation !==
      input.generation
    ) {
      return Object.freeze({
        kind:
          "generation_mismatch",

        observedGeneration:
          current.generation,
      });
    }


    const existing =
      current.ownership;


    if (
      existing !== null &&
      !isSchedulerOwnershipExpired(
        existing,
        input.nowEpochMs,
      ) &&
      existing.ownerId !==
      ownerId
    ) {
      return Object.freeze({
        kind:
          "contended",

        observedOwnership:
          existing,
      });
    }


    const fencingToken =
      nextFencingToken(
        current.fencingToken,
      );


    const leaseExpiresAtEpochMs =
      addSafePositiveIntegers(
        input.nowEpochMs,
        input.leaseDurationMs,
        "Scheduler lease expiration",
      );


    const targetOwnership =
      createDurableSchedulerOwnership({
        generation:
          input.generation,

        fencingToken,

        ownerId,

        leaseExpiresAtEpochMs,
      });


    const replacement =
      await this.store.replaceIfCurrent({
        expectedRowVersion:
          current.rowVersion,

        generation:
          targetOwnership.generation,

        fencingToken:
          targetOwnership.fencingToken,

        ownerId:
          targetOwnership.ownerId,

        leaseExpiresAtEpochMs:
          targetOwnership
            .leaseExpiresAtEpochMs,
      });


    if (
      replacement.kind ===
      "stale"
    ) {

      const observed =
        await this.store.read();


      if (
        observed.generation !==
        input.generation
      ) {
        return Object.freeze({
          kind:
            "generation_mismatch",

          observedGeneration:
            observed.generation,
        });
      }


      return Object.freeze({
        kind:
          "contended",

        observedOwnership:
          observed.ownership,
      });
    }


    const persisted =
      replacement.state.ownership;


    if (persisted === null) {
      throw new Error(
        "Ownership CAS succeeded without an active owner.",
      );
    }


    assertSchedulerOwnershipGeneration(
      persisted,
      input.generation,
    );


    assertCurrentSchedulerFencingToken(
      persisted,
      fencingToken,
    );


    if (
      persisted.ownerId !==
      ownerId
    ) {
      throw new Error(
        "Ownership CAS returned a different owner.",
      );
    }


    const kind =
      existing !== null &&
      existing.ownerId ===
      ownerId &&
      !isSchedulerOwnershipExpired(
        existing,
        input.nowEpochMs,
      )
        ? "renewed"
        : "acquired";


    return Object.freeze({
      kind,
      ownership:
        persisted,
    });
  }


  async release(
    input:
      ReleaseSchedulerOwnershipInput,
  ): Promise<ReleaseSchedulerOwnershipResult> {

    assertPositiveSafeInteger(
      input.generation,
      "Scheduler generation",
    );


    assertPositiveSafeInteger(
      input.fencingToken,
      "Scheduler fencing token",
    );


    const ownerId =
      normalizeSchedulerOwnerId(
        input.ownerId,
      );


    const current =
      await this.store.read();


    if (
      current.generation !==
      input.generation
    ) {
      return Object.freeze({
        kind:
          "generation_mismatch",

        observedGeneration:
          current.generation,
      });
    }


    const existing =
      current.ownership;


    if (existing === null) {
      return Object.freeze({
        kind:
          "already_unowned",
      });
    }


    if (
      existing.ownerId !==
      ownerId ||
      existing.fencingToken !==
      input.fencingToken
    ) {
      return Object.freeze({
        kind:
          "fenced",

        observedOwnership:
          existing,
      });
    }


    const replacement =
      await this.store.replaceIfCurrent({
        expectedRowVersion:
          current.rowVersion,

        generation:
          current.generation,

        fencingToken:
          current.fencingToken,

        ownerId:
          null,

        leaseExpiresAtEpochMs:
          null,
      });


    if (
      replacement.kind ===
      "stale"
    ) {

      const observed =
        await this.store.read();


      if (
        observed.generation !==
        input.generation
      ) {
        return Object.freeze({
          kind:
            "generation_mismatch",

          observedGeneration:
            observed.generation,
        });
      }


      if (observed.ownership === null) {
        return Object.freeze({
          kind:
            "already_unowned",
        });
      }


      return Object.freeze({
        kind:
          "fenced",

        observedOwnership:
          observed.ownership,
      });
    }


    if (
      replacement.state.ownership !==
      null
    ) {
      throw new Error(
        "Ownership release CAS succeeded but ownership remains active.",
      );
    }


    if (
      replacement.state.fencingToken !==
      input.fencingToken
    ) {
      throw new Error(
        "Ownership release changed the fencing token unexpectedly.",
      );
    }


    return Object.freeze({
      kind:
        "released",
    });
  }
}
