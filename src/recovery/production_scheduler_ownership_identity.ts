import {
  hostname,
} from "node:os";


export const
  DEFAULT_SCHEDULER_GENERATION =
    1;


export const
  DEFAULT_OWNERSHIP_LEASE_DURATION_MS =
    30_000;


export const
  DEFAULT_OWNERSHIP_RENEWAL_INTERVAL_MS =
    10_000;


export type ProductionSchedulerOwnershipIdentity =
  Readonly<{
    generation:
      number;

    ownerId:
      string;

    leaseDurationMs:
      number;

    renewalIntervalMs:
      number;
  }>;


export type ProductionSchedulerOwnershipIdentityEnvironment =
  Readonly<
    Record<
      string,
      string | undefined
    >
  >;


export type ProductionSchedulerOwnershipIdentityDependencies =
  Readonly<{
    environment?:
      ProductionSchedulerOwnershipIdentityEnvironment;

    hostname?:
      () => string;

    processId?:
      number;
  }>;


function readPositiveSafeInteger(
  name:
    string,
  raw:
    string | undefined,
  fallback:
    number,
): number {

  if (
    raw === undefined ||
    raw.trim().length === 0
  ) {
    return fallback;
  }


  const normalized =
    raw.trim();


  if (
    !/^[0-9]+$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }


  const value =
    Number(
      normalized,
    );


  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive safe integer.`,
    );
  }


  return value;
}


function normalizeOwnerId(
  raw:
    string,
): string {

  const normalized =
    raw.trim();


  if (normalized.length === 0) {
    throw new Error(
      "AUTOMATION_PLATFORM_OWNER_ID must not be empty.",
    );
  }


  return normalized;
}


function resolveDefaultOwnerId(
  host:
    string,
  processId:
    number,
): string {

  const normalizedHost =
    host.trim();


  if (normalizedHost.length === 0) {
    throw new Error(
      "Production scheduler hostname must not be empty.",
    );
  }


  if (
    !Number.isSafeInteger(
      processId,
    ) ||
    processId <= 0
  ) {
    throw new Error(
      "Production scheduler process ID must be a positive safe integer.",
    );
  }


  return (
    `automation-platform:${normalizedHost}:pid-${processId}`
  );
}


export function
resolveProductionSchedulerOwnershipIdentity(
  dependencies:
    ProductionSchedulerOwnershipIdentityDependencies =
      {},
): ProductionSchedulerOwnershipIdentity {

  const environment =
    dependencies.environment ??
    process.env;


  const generation =
    readPositiveSafeInteger(
      "AUTOMATION_PLATFORM_SCHEDULER_GENERATION",
      environment[
        "AUTOMATION_PLATFORM_SCHEDULER_GENERATION"
      ],
      DEFAULT_SCHEDULER_GENERATION,
    );


  const leaseDurationMs =
    readPositiveSafeInteger(
      "AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS",
      environment[
        "AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS"
      ],
      DEFAULT_OWNERSHIP_LEASE_DURATION_MS,
    );


  const renewalIntervalMs =
    readPositiveSafeInteger(
      "AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS",
      environment[
        "AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS"
      ],
      DEFAULT_OWNERSHIP_RENEWAL_INTERVAL_MS,
    );


  if (
    renewalIntervalMs >=
    leaseDurationMs
  ) {
    throw new Error(
      "AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS " +
      "must be less than " +
      "AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS.",
    );
  }


  const explicitOwnerId =
    environment[
      "AUTOMATION_PLATFORM_OWNER_ID"
    ];


  const ownerId =
    explicitOwnerId !== undefined
      ? normalizeOwnerId(
          explicitOwnerId,
        )
      : resolveDefaultOwnerId(
          (
            dependencies.hostname ??
            hostname
          )(),
          dependencies.processId ??
            process.pid,
        );


  return Object.freeze({
    generation,
    ownerId,
    leaseDurationMs,
    renewalIntervalMs,
  });
}