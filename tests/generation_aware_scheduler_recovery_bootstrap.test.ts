import {
  describe,
  expect,
  it,
} from "vitest";

import {
  GenerationAwareSchedulerRecoveryBootstrap,
  type SchedulerGenerationCursorLoader,
  type SchedulerGenerationFactory,
} from "../src/recovery/generation_aware_scheduler_recovery_bootstrap.js";


type Generation = {
  readonly generation:
    number;
};


type Recovery = {
  readonly initialGeneration:
    Generation;
};


function cursor(
  generation:
    number,

  rowVersion:
    number[] = [
      1,
    ],
) {
  return {
    generation,

    rowVersion:
      Uint8Array.from(
        rowVersion,
      ),
  };
}


describe(
  "GenerationAwareSchedulerRecoveryBootstrap",
  () => {
    it(
      "loads durable identity before creating the generation",
      async () => {
        const events:
          string[] =
          [];

        const loader:
          SchedulerGenerationCursorLoader =
          {
            async load() {
              events.push(
                "load",
              );

              return cursor(
                7,
              );
            },
          };

        const factory:
          SchedulerGenerationFactory<Generation> =
          {
            create(
              generation,
            ) {
              events.push(
                `create:${generation}`,
              );

              return {
                generation,
              };
            },
          };

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            loader,
            factory,
            (
              generation,
            ): Recovery => {
              events.push(
                `recovery:${generation.generation}`,
              );

              return {
                initialGeneration:
                  generation,
              };
            },
          );

        const result =
          await bootstrap.create();

        expect(
          events,
        ).toEqual([
          "load",
          "create:7",
          "recovery:7",
        ]);

        expect(
          result.cursor.generation,
        ).toBe(7);

        expect(
          result.initialGeneration.generation,
        ).toBe(7);

        expect(
          result.recovery.initialGeneration
            .generation,
        ).toBe(7);
      },
    );


    it(
      "uses durable generation rather than assuming generation one",
      async () => {
        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return cursor(
                  42,
                );
              },
            },

            {
              create(
                generation,
              ) {
                return {
                  generation,
                };
              },
            },

            (
              generation,
            ): Recovery => ({
              initialGeneration:
                generation,
            }),
          );

        const result =
          await bootstrap.create();

        expect(
          result.initialGeneration.generation,
        ).toBe(42);

        expect(
          result.recovery.initialGeneration
            .generation,
        ).toBe(42);
      },
    );


    it(
      "does not construct a generation when durable loading fails",
      async () => {
        const expected =
          new Error(
            "synthetic durable read failure",
          );

        let generationCalls =
          0;

        let recoveryCalls =
          0;

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                throw expected;
              },
            },

            {
              create(
                generation,
              ) {
                generationCalls +=
                  1;

                return {
                  generation,
                };
              },
            },

            (
              generation,
            ): Recovery => {
              recoveryCalls +=
                1;

              return {
                initialGeneration:
                  generation,
              };
            },
          );

        await expect(
          bootstrap.create(),
        ).rejects.toBe(
          expected,
        );

        expect(
          generationCalls,
        ).toBe(0);

        expect(
          recoveryCalls,
        ).toBe(0);
      },
    );


    it(
      "does not construct recovery when generation construction fails",
      async () => {
        const expected =
          new Error(
            "synthetic generation construction failure",
          );

        let recoveryCalls =
          0;

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return cursor(
                  3,
                );
              },
            },

            {
              create() {
                throw expected;
              },
            },

            (
              generation,
            ): Recovery => {
              recoveryCalls +=
                1;

              return {
                initialGeneration:
                  generation,
              };
            },
          );

        await expect(
          bootstrap.create(),
        ).rejects.toBe(
          expected,
        );

        expect(
          recoveryCalls,
        ).toBe(0);
      },
    );


    it(
      "propagates recovery construction failure unchanged",
      async () => {
        const expected =
          new Error(
            "synthetic recovery construction failure",
          );

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return cursor(
                  8,
                );
              },
            },

            {
              create(
                generation,
              ) {
                return {
                  generation,
                };
              },
            },

            () => {
              throw expected;
            },
          );

        await expect(
          bootstrap.create(),
        ).rejects.toBe(
          expected,
        );
      },
    );


    it(
      "returns a defensive copy of the durable cursor",
      async () => {
        const source =
          new Uint8Array([
            9,
            8,
            7,
          ]);

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return {
                  generation:
                    5,

                  rowVersion:
                    source,
                };
              },
            },

            {
              create(
                generation,
              ) {
                return {
                  generation,
                };
              },
            },

            (
              generation,
            ): Recovery => ({
              initialGeneration:
                generation,
            }),
          );

        const result =
          await bootstrap.create();

        source[0] =
          0;

        expect(
          Array.from(
            result.cursor.rowVersion,
          ),
        ).toEqual([
          9,
          8,
          7,
        ]);
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
      "rejects invalid durable generation %s before generation construction",
      async (
        generation,
      ) => {
        let factoryCalls =
          0;

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return {
                  generation,

                  rowVersion:
                    new Uint8Array([
                      1,
                    ]),
                };
              },
            },

            {
              create(
                value,
              ) {
                factoryCalls +=
                  1;

                return {
                  generation:
                    value,
                };
              },
            },

            (
              value,
            ): Recovery => ({
              initialGeneration:
                value,
            }),
          );

        await expect(
          bootstrap.create(),
        ).rejects.toThrow(
          "Durable scheduler generation must be a positive safe integer.",
        );

        expect(
          factoryCalls,
        ).toBe(0);
      },
    );


    it(
      "does not own startup or restart behavior",
      async () => {
        const generation =
          {
            generation:
              11,
          };

        const recovery =
          {
            initialGeneration:
              generation,
          };

        const bootstrap =
          new GenerationAwareSchedulerRecoveryBootstrap(
            {
              async load() {
                return cursor(
                  11,
                );
              },
            },

            {
              create() {
                return generation;
              },
            },

            () =>
              recovery,
          );

        const result =
          await bootstrap.create();

        expect(
          result.initialGeneration,
        ).toBe(
          generation,
        );

        expect(
          result.recovery,
        ).toBe(
          recovery,
        );
      },
    );
  },
);
