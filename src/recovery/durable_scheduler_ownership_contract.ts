export const MAX_SCHEDULER_OWNER_ID_LENGTH =
  200;


export interface DurableSchedulerOwnership {
  readonly generation: number;
  readonly fencingToken: number;
  readonly ownerId: string;
  readonly leaseExpiresAtEpochMs: number;
}


export interface CreateDurableSchedulerOwnershipInput {
  readonly generation: number;
  readonly fencingToken: number;
  readonly ownerId: string;
  readonly leaseExpiresAtEpochMs: number;
}


function assertSafePositiveInteger(
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


export function normalizeSchedulerOwnerId(
  ownerId: string,
): string {

  const normalized =
    ownerId.trim();


  if (normalized.length === 0) {
    throw new Error(
      "Scheduler owner id must not be empty.",
    );
  }


  if (
    normalized.length >
    MAX_SCHEDULER_OWNER_ID_LENGTH
  ) {
    throw new Error(
      "Scheduler owner id exceeds the maximum length.",
    );
  }


  return normalized;
}


export function createDurableSchedulerOwnership(
  input: CreateDurableSchedulerOwnershipInput,
): DurableSchedulerOwnership {

  assertSafePositiveInteger(
    input.generation,
    "Scheduler generation",
  );


  assertSafePositiveInteger(
    input.fencingToken,
    "Scheduler fencing token",
  );


  assertSafePositiveInteger(
    input.leaseExpiresAtEpochMs,
    "Scheduler lease expiration",
  );


  return Object.freeze({
    generation:
      input.generation,

    fencingToken:
      input.fencingToken,

    ownerId:
      normalizeSchedulerOwnerId(
        input.ownerId,
      ),

    leaseExpiresAtEpochMs:
      input.leaseExpiresAtEpochMs,
  });
}


export function assertNextSchedulerFencingToken(
  previousToken: number,
  nextToken: number,
): void {

  assertSafePositiveInteger(
    previousToken,
    "Previous scheduler fencing token",
  );


  assertSafePositiveInteger(
    nextToken,
    "Next scheduler fencing token",
  );


  if (
    previousToken ===
    Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      "Scheduler fencing token overflow.",
    );
  }


  if (
    nextToken !==
    previousToken + 1
  ) {
    throw new Error(
      "Scheduler fencing token must advance exactly once.",
    );
  }
}


export function isSchedulerOwnershipExpired(
  ownership: DurableSchedulerOwnership,
  nowEpochMs: number,
): boolean {

  assertSafePositiveInteger(
    nowEpochMs,
    "Current epoch time",
  );


  return (
    nowEpochMs >=
    ownership.leaseExpiresAtEpochMs
  );
}


export function assertSchedulerOwnershipGeneration(
  ownership: DurableSchedulerOwnership,
  expectedGeneration: number,
): void {

  assertSafePositiveInteger(
    expectedGeneration,
    "Expected scheduler generation",
  );


  if (
    ownership.generation !==
    expectedGeneration
  ) {
    throw new Error(
      "Scheduler ownership generation does not match the active durable generation.",
    );
  }
}


export function assertCurrentSchedulerFencingToken(
  ownership: DurableSchedulerOwnership,
  presentedToken: number,
): void {

  assertSafePositiveInteger(
    presentedToken,
    "Presented scheduler fencing token",
  );


  if (
    presentedToken !==
    ownership.fencingToken
  ) {
    throw new Error(
      "Scheduler fencing token is stale.",
    );
  }
}
