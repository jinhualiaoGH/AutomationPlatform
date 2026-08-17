import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DEFAULT_OWNERSHIP_LEASE_DURATION_MS,
  DEFAULT_OWNERSHIP_RENEWAL_INTERVAL_MS,
  DEFAULT_SCHEDULER_GENERATION,
  resolveProductionSchedulerOwnershipIdentity,
} from "../src/recovery/production_scheduler_ownership_identity.js";


describe(
  "production scheduler ownership identity",
  () => {

    it(
      "uses explicit production configuration when supplied",
      () => {

        const identity =
          resolveProductionSchedulerOwnershipIdentity({
            environment: {
              AUTOMATION_PLATFORM_OWNER_ID:
                "scheduler-alpha",

              AUTOMATION_PLATFORM_SCHEDULER_GENERATION:
                "7",

              AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS:
                "45000",

              AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS:
                "15000",
            },

            hostname:
              () =>
                "ignored-host",

            processId:
              999,
          });


        expect(
          identity,
        ).toEqual({
          generation:
            7,

          ownerId:
            "scheduler-alpha",

          leaseDurationMs:
            45_000,

          renewalIntervalMs:
            15_000,
        });
      },
    );


    it(
      "derives a process-scoped owner identity from hostname and pid",
      () => {

        const identity =
          resolveProductionSchedulerOwnershipIdentity({
            environment:
              {},

            hostname:
              () =>
                "worker-01",

            processId:
              4321,
          });


        expect(
          identity,
        ).toEqual({
          generation:
            DEFAULT_SCHEDULER_GENERATION,

          ownerId:
            "automation-platform:worker-01:pid-4321",

          leaseDurationMs:
            DEFAULT_OWNERSHIP_LEASE_DURATION_MS,

          renewalIntervalMs:
            DEFAULT_OWNERSHIP_RENEWAL_INTERVAL_MS,
        });
      },
    );


    it(
      "normalizes an explicit owner id",
      () => {

        const identity =
          resolveProductionSchedulerOwnershipIdentity({
            environment: {
              AUTOMATION_PLATFORM_OWNER_ID:
                "  scheduler-beta  ",
            },

            hostname:
              () =>
                "unused",

            processId:
              1,
          });


        expect(
          identity.ownerId,
        ).toBe(
          "scheduler-beta",
        );
      },
    );


    it.each([
      [
        "AUTOMATION_PLATFORM_SCHEDULER_GENERATION",
        "0",
      ],
      [
        "AUTOMATION_PLATFORM_SCHEDULER_GENERATION",
        "-1",
      ],
      [
        "AUTOMATION_PLATFORM_SCHEDULER_GENERATION",
        "1.5",
      ],
      [
        "AUTOMATION_PLATFORM_SCHEDULER_GENERATION",
        "abc",
      ],
      [
        "AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS",
        "0",
      ],
      [
        "AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS",
        "-10",
      ],
    ])(
      "rejects invalid positive integer configuration %s=%s",
      (
        name,
        value,
      ) => {

        expect(
          () =>
            resolveProductionSchedulerOwnershipIdentity({
              environment: {
                [name]:
                  value,
              },

              hostname:
                () =>
                  "worker",

              processId:
                10,
            }),
        ).toThrow();
      },
    );


    it(
      "rejects renewal interval equal to lease duration",
      () => {

        expect(
          () =>
            resolveProductionSchedulerOwnershipIdentity({
              environment: {
                AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS:
                  "30000",

                AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS:
                  "30000",
              },

              hostname:
                () =>
                  "worker",

              processId:
                10,
            }),
        ).toThrow(
          /must be less than/,
        );
      },
    );


    it(
      "rejects renewal interval greater than lease duration",
      () => {

        expect(
          () =>
            resolveProductionSchedulerOwnershipIdentity({
              environment: {
                AUTOMATION_PLATFORM_OWNERSHIP_LEASE_MS:
                  "30000",

                AUTOMATION_PLATFORM_OWNERSHIP_RENEWAL_MS:
                  "30001",
              },

              hostname:
                () =>
                  "worker",

              processId:
                10,
            }),
        ).toThrow(
          /must be less than/,
        );
      },
    );


    it(
      "rejects an explicitly empty owner id",
      () => {

        expect(
          () =>
            resolveProductionSchedulerOwnershipIdentity({
              environment: {
                AUTOMATION_PLATFORM_OWNER_ID:
                  "   ",
              },

              hostname:
                () =>
                  "worker",

              processId:
                10,
            }),
        ).toThrow(
          /must not be empty/,
        );
      },
    );


    it(
      "rejects invalid fallback process identity",
      () => {

        expect(
          () =>
            resolveProductionSchedulerOwnershipIdentity({
              environment:
                {},

              hostname:
                () =>
                  "worker",

              processId:
                0,
            }),
        ).toThrow(
          /process ID/,
        );
      },
    );


    it(
      "returns an immutable configuration object",
      () => {

        const identity =
          resolveProductionSchedulerOwnershipIdentity({
            environment:
              {},

            hostname:
              () =>
                "worker",

            processId:
              123,
          });


        expect(
          Object.isFrozen(
            identity,
          ),
        ).toBe(
          true,
        );
      },
    );
  },
);