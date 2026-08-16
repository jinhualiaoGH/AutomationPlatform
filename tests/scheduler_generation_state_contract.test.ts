import {
  describe,
  expect,
  it,
} from "vitest";

import {
  INITIAL_SCHEDULER_GENERATION,
  assertSchedulerGeneration,
  cloneGenerationRowVersion,
  createInitialSchedulerGenerationState,
  createSchedulerGenerationAllocation,
  nextSchedulerGeneration,
  validateGenerationTransition,
} from "../src/recovery/scheduler_generation_state_contract.js";


describe(
  "scheduler generation state contract",
  () => {
    it(
      "defines generation one as the durable initial identity",
      () => {
        expect(
          INITIAL_SCHEDULER_GENERATION,
        ).toBe(1);
      },
    );


    it.each([
      1,
      2,
      100,
      Number.MAX_SAFE_INTEGER,
    ])(
      "accepts valid generation %s",
      (
        generation,
      ) => {
        expect(
          () =>
            assertSchedulerGeneration(
              generation,
            ),
        ).not.toThrow();
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "1",
      null,
      undefined,
    ])(
      "rejects invalid generation %s",
      (
        generation,
      ) => {
        expect(
          () =>
            assertSchedulerGeneration(
              generation,
            ),
        ).toThrow(
          "Scheduler generation must be a safe integer greater than or equal to 1.",
        );
      },
    );


    it(
      "advances generation exactly once",
      () => {
        expect(
          nextSchedulerGeneration(
            1,
          ),
        ).toBe(2);

        expect(
          nextSchedulerGeneration(
            41,
          ),
        ).toBe(42);
      },
    );


    it(
      "rejects generation overflow",
      () => {
        expect(
          () =>
            nextSchedulerGeneration(
              Number.MAX_SAFE_INTEGER,
            ),
        ).toThrow(
          "Scheduler generation cannot advance beyond Number.MAX_SAFE_INTEGER.",
        );
      },
    );


    it.each([
      [
        1,
        2,
      ],
      [
        10,
        11,
      ],
      [
        999,
        1000,
      ],
    ])(
      "accepts exact monotonic transition %i -> %i",
      (
        previousGeneration,
        currentGeneration,
      ) => {
        expect(
          () =>
            validateGenerationTransition(
              previousGeneration,
              currentGeneration,
            ),
        ).not.toThrow();
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
        100,
        102,
      ],
    ])(
      "rejects invalid transition %i -> %i",
      (
        previousGeneration,
        currentGeneration,
      ) => {
        expect(
          () =>
            validateGenerationTransition(
              previousGeneration,
              currentGeneration,
            ),
        ).toThrow(
          "Scheduler generation transition must advance exactly once.",
        );
      },
    );


    it(
      "creates the initial generation state defensively",
      () => {
        const source =
          new Uint8Array([
            1,
            2,
            3,
          ]);

        const state =
          createInitialSchedulerGenerationState(
            source,
          );

        expect(
          state.currentGeneration,
        ).toBe(1);

        expect(
          Array.from(
            state.rowVersion,
          ),
        ).toEqual([
          1,
          2,
          3,
        ]);

        source[0] =
          99;

        expect(
          Array.from(
            state.rowVersion,
          ),
        ).toEqual([
          1,
          2,
          3,
        ]);
      },
    );


    it(
      "creates an exact one-step allocation defensively",
      () => {
        const source =
          new Uint8Array([
            9,
            8,
            7,
          ]);

        const allocation =
          createSchedulerGenerationAllocation(
            4,
            5,
            source,
          );

        expect(
          allocation.previousGeneration,
        ).toBe(4);

        expect(
          allocation.currentGeneration,
        ).toBe(5);

        expect(
          Array.from(
            allocation.rowVersion,
          ),
        ).toEqual([
          9,
          8,
          7,
        ]);

        source[0] =
          0;

        expect(
          Array.from(
            allocation.rowVersion,
          ),
        ).toEqual([
          9,
          8,
          7,
        ]);
      },
    );


    it(
      "rejects empty row-version state",
      () => {
        expect(
          () =>
            cloneGenerationRowVersion(
              new Uint8Array(),
            ),
        ).toThrow(
          "Scheduler generation rowVersion must not be empty.",
        );
      },
    );


    it(
      "does not expose mutable row-version aliases",
      () => {
        const source =
          new Uint8Array([
            3,
            4,
          ]);

        const clone =
          cloneGenerationRowVersion(
            source,
          );

        expect(
          clone,
        ).not.toBe(
          source,
        );

        clone[0] =
          100;

        expect(
          Array.from(
            source,
          ),
        ).toEqual([
          3,
          4,
        ]);
      },
    );
  },
);
