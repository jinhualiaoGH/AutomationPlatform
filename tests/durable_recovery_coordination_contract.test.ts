import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createDurableRecoveryRestartedResult,
  createDurableRecoverySupersededResult,
  type DurableRecoveryCoordinationResult,
  type DurableRecoveryRestartProvenance,
} from "../src/recovery/durable_recovery_coordination_contract.js";


describe(
  "durable recovery coordination contract",
  () => {

    it(
      "represents a winning contender as restarted",
      () => {
        const restart = {
          previousGeneration:
            7,

          currentGeneration:
            8,

          command:
            "restart" as const,
        };

        const result =
          createDurableRecoveryRestartedResult(
            restart,
          );

        expect(result)
          .toEqual({
            disposition:
              "restarted",

            previousGeneration:
              7,

            currentGeneration:
              8,

            result:
              restart,
          });
      },
    );


    it(
      "preserves the winning restart result unchanged",
      () => {
        const restart = {
          previousGeneration:
            19,

          currentGeneration:
            20,

          marker:
            {
              value:
                "preserved",
            },
        };

        const result =
          createDurableRecoveryRestartedResult(
            restart,
          );

        expect(result.result)
          .toBe(
            restart,
          );
      },
    );


    it.each([
      [
        1,
        1,
      ],
      [
        2,
        1,
      ],
      [
        1,
        3,
      ],
      [
        10,
        12,
      ],
    ])(
      "rejects invalid winning transition %s -> %s",
      (
        previousGeneration,
        currentGeneration,
      ) => {
        expect(
          () =>
            createDurableRecoveryRestartedResult({
              previousGeneration,
              currentGeneration,
            }),
        )
          .toThrow(
            "Scheduler generation transition must advance exactly once.",
          );
      },
    );


    it(
      "represents a losing contender only after a later generation is observed",
      () => {
        expect(
          createDurableRecoverySupersededResult(
            7,
            8,
          ),
        )
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              8,
          });
      },
    );


    it(
      "allows reconciliation to observe more than one later generation",
      () => {
        expect(
          createDurableRecoverySupersededResult(
            7,
            10,
          ),
        )
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              10,
          });
      },
    );


    it(
      "does not reinterpret the same durable generation as superseded",
      () => {
        expect(
          () =>
            createDurableRecoverySupersededResult(
              7,
              7,
            ),
        )
          .toThrow(
            "Superseded durable recovery must observe a later durable generation.",
          );
      },
    );


    it(
      "rejects an observed generation behind the attempted generation",
      () => {
        expect(
          () =>
            createDurableRecoverySupersededResult(
              7,
              6,
            ),
        )
          .toThrow(
            "Superseded durable recovery must observe a later durable generation.",
          );
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      "rejects invalid attempted generation %s",
      (
        attemptedGeneration,
      ) => {
        expect(
          () =>
            createDurableRecoverySupersededResult(
              attemptedGeneration,
              2,
            ),
        )
          .toThrow(
            "Scheduler generation must be a safe integer greater than or equal to 1.",
          );
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      "rejects invalid observed generation %s",
      (
        observedGeneration,
      ) => {
        expect(
          () =>
            createDurableRecoverySupersededResult(
              1,
              observedGeneration,
            ),
        )
          .toThrow(
            "Scheduler generation must be a safe integer greater than or equal to 1.",
          );
      },
    );


    it(
      "supports exhaustive coordination discrimination",
      () => {
        function classify<
          TResult extends DurableRecoveryRestartProvenance,
        >(
          result:
            DurableRecoveryCoordinationResult<TResult>,
        ): string {
          switch (result.disposition) {

            case "restarted":
              return (
                `${result.previousGeneration}` +
                "->" +
                `${result.currentGeneration}`
              );

            case "superseded":
              return (
                `${result.attemptedGeneration}` +
                "~>" +
                `${result.observedGeneration}`
              );
          }
        }

        expect(
          classify(
            createDurableRecoveryRestartedResult({
              previousGeneration:
                3,

              currentGeneration:
                4,
            }),
          ),
        )
          .toBe(
            "3->4",
          );

        expect(
          classify(
            createDurableRecoverySupersededResult(
              3,
              4,
            ),
          ),
        )
          .toBe(
            "3~>4",
          );
      },
    );
  },
);
