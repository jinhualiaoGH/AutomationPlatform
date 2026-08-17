import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CoordinatedRecoveryAwareSchedulerControlCoordinator,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlCommand,
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";


function deferred<T>() {
  let resolve:
    (value: T) => void =
      () => {};

  let reject:
    (reason?: unknown) => void =
      () => {};


  const promise =
    new Promise<T>(
      (
        resolveValue,
        rejectValue,
      ) => {
        resolve =
          resolveValue;

        reject =
          rejectValue;
      },
    );


  return {
    promise,
    resolve,
    reject,
  };
}


describe(
  "CoordinatedRecoveryAwareSchedulerControlCoordinator",
  () => {

    it(
      "normalizes surrounding whitespace in request keys",
      async () => {

        let calls =
          0;

        const result = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            1,

          observedGeneration:
            2,
        };


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                return result;
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "  key-1  ",
          });


        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "key-1",
          });


        expect(second)
          .toBe(
            first,
          );


        await expect(first)
          .resolves
          .toBe(
            result,
          );


        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "deduplicates concurrent commands with the same request key",
      async () => {

        const gate =
          deferred<
            CoordinatedRecoveryAwareSchedulerControlResult
          >();


        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                return gate.promise;
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "same",
          });


        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "same",
          });


        expect(second)
          .toBe(
            first,
          );


        gate.resolve({
          disposition:
            "superseded",

          attemptedGeneration:
            3,

          observedGeneration:
            4,
        });


        await first;


        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "keeps a completed request key idempotent",
      async () => {

        let calls =
          0;

        const expected = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            5,

          observedGeneration:
            6,
        };


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                return expected;
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "completed",
          });


        await first;


        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "completed",
          });


        expect(second)
          .toBe(
            first,
          );

        await expect(second)
          .resolves
          .toBe(
            expected,
          );

        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "keeps a failed request key idempotent",
      async () => {

        const expected =
          new Error(
            "synthetic coordinated failure",
          );


        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                throw expected;
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "failed",
          });


        await expect(first)
          .rejects
          .toBe(
            expected,
          );


        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "failed",
          });


        expect(second)
          .toBe(
            first,
          );


        await expect(second)
          .rejects
          .toBe(
            expected,
          );


        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "does not deduplicate distinct request keys",
      async () => {

        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {

                calls +=
                  1;

                return {
                  disposition:
                    "superseded" as const,

                  attemptedGeneration:
                    calls,

                  observedGeneration:
                    calls + 1,
                };
              },
            },
          );


        await Promise.all([
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "one",
          }),

          coordinator.execute({
            command:
              "restart",

            requestKey:
              "two",
          }),
        ]);


        expect(calls)
          .toBe(
            2,
          );
      },
    );


    it(
      "does not deduplicate commands without request keys",
      async () => {

        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {

                calls +=
                  1;

                return {
                  disposition:
                    "superseded" as const,

                  attemptedGeneration:
                    calls,

                  observedGeneration:
                    calls + 1,
                };
              },
            },
          );


        await Promise.all([
          coordinator.execute({
            command:
              "restart",
          }),

          coordinator.execute({
            command:
              "restart",
          }),
        ]);


        expect(calls)
          .toBe(
            2,
          );
      },
    );


    it(
      "rejects an empty request key before enqueueing",
      () => {

        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                throw new Error(
                  "must not execute",
                );
              },
            },
          );


        expect(
          () =>
            coordinator.execute({
              command:
                "restart",

              requestKey:
                "   ",
            }),
        )
          .toThrow(
            "requestKey must not be empty.",
          );


        expect(calls)
          .toBe(
            0,
          );
      },
    );


    it(
      "rejects an oversized request key before enqueueing",
      () => {

        let calls =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                throw new Error(
                  "must not execute",
                );
              },
            },
          );


        expect(
          () =>
            coordinator.execute({
              command:
                "restart",

              requestKey:
                "x".repeat(
                  129,
                ),
            }),
        )
          .toThrow(
            "requestKey must not exceed 128 characters.",
          );


        expect(calls)
          .toBe(
            0,
          );
      },
    );


    it(
      "does not let a failed command poison later queued commands",
      async () => {

        const failure =
          new Error(
            "first failed",
          );


        const seen:
          CoordinatedRecoveryAwareSchedulerControlCommand[] =
          [];


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute(
                command,
              ) {

                seen.push(
                  command,
                );


                if (command === "start") {
                  throw failure;
                }


                return {
                  disposition:
                    "superseded" as const,

                  attemptedGeneration:
                    10,

                  observedGeneration:
                    11,
                };
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "start",
          });


        const second =
          coordinator.execute({
            command:
              "restart",
          });


        await expect(first)
          .rejects
          .toBe(
            failure,
          );


        await expect(second)
          .resolves
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              10,

            observedGeneration:
              11,
          });


        expect(seen)
          .toEqual([
            "start",
            "restart",
          ]);
      },
    );


    it(
      "deduplicates by request key even when repeated submission names a different command",
      async () => {

        let calls =
          0;


        const expected = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            20,

          observedGeneration:
            21,
        };


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {
                calls +=
                  1;

                return expected;
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "same-key",
          });


        const second =
          coordinator.execute({
            command:
              "start",

            requestKey:
              "same-key",
          });


        expect(second)
          .toBe(
            first,
          );


        await expect(second)
          .resolves
          .toBe(
            expected,
          );


        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "serializes command execution",
      async () => {

        const firstGate =
          deferred<
            CoordinatedRecoveryAwareSchedulerControlResult
          >();


        let active =
          0;

        let maximumActive =
          0;

        let call =
          0;


        const coordinator =
          new CoordinatedRecoveryAwareSchedulerControlCoordinator(
            {
              async execute() {

                call +=
                  1;

                active +=
                  1;

                maximumActive =
                  Math.max(
                    maximumActive,
                    active,
                  );


                if (call === 1) {
                  await firstGate.promise;
                }


                active -=
                  1;


                return {
                  disposition:
                    "superseded" as const,

                  attemptedGeneration:
                    call,

                  observedGeneration:
                    call + 1,
                };
              },
            },
          );


        const first =
          coordinator.execute({
            command:
              "restart",
          });


        const second =
          coordinator.execute({
            command:
              "restart",
          });


        await Promise.resolve();


        expect(maximumActive)
          .toBe(
            1,
          );


        firstGate.resolve({
          disposition:
            "superseded",

          attemptedGeneration:
            1,

          observedGeneration:
            2,
        });


        await Promise.all([
          first,
          second,
        ]);


        expect(maximumActive)
          .toBe(
            1,
          );
      },
    );
  },
);
