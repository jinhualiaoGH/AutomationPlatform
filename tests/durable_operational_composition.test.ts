import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  createDurableOperationalComposition,
  createOperationalComposition,
} from "../src/operations/operational_composition.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";


async function setDurableGeneration(
  generation:
    number,
): Promise<void> {
  const pool =
    await getDatabasePool();

  await pool
    .request()
    .input(
      "generation",
      generation,
    )
    .query(`
      DELETE FROM
          dbo.scheduler_generation_state;

      INSERT INTO
          dbo.scheduler_generation_state
      (
          scheduler_generation_state_id,
          current_generation
      )
      VALUES
      (
          1,
          @generation
      );
    `);

  await closeDatabase();
}


describe(
  "A10.7 durable operational composition",
  () => {
    beforeEach(
      async () => {
        await setDurableGeneration(
          1,
        );
      },
      15_000,
    );


    afterEach(
      async () => {
        await setDurableGeneration(
          1,
        );
      },
      15_000,
    );


    it(
      "preserves the frozen synchronous operational composition API",
      () => {
        const frozen =
          createOperationalComposition();

        expect(
          frozen.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          frozen.recovery.supervisor.generation,
        ).toBe(1);

        expect(
          frozen.scheduler.state,
        ).toBe("idle");
      },
    );


    it(
      "creates a SchedulerRuntime-compatible durable production composition",
      async () => {
        const durable =
          await createDurableOperationalComposition();

        expect(
          durable.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          durable.scheduler,
        ).toBe(
          durable.recovery.scheduler,
        );

        expect(
          durable.recovery.supervisor.generation,
        ).toBe(1);

        expect(
          durable.recovery.offsetRecovery.generation,
        ).toBe(1);

        expect(
          durable.recovery.durableSupervisor
            .durableGeneration,
        ).toBe(1);

        expect(
          durable.scheduler.state,
        ).toBe("idle");
      },
      15_000,
    );


    it(
      "adopts a persisted generation before production lifecycle startup",
      async () => {
        await setDurableGeneration(
          41,
        );

        const durable =
          await createDurableOperationalComposition();

        /*
         * Frozen A9 remains local generation one.
         */
        expect(
          durable.recovery.supervisor.generation,
        ).toBe(1);

        /*
         * A10 durable coordinate is already 41 before scheduler.start().
         */
        expect(
          durable.recovery.offsetRecovery.generation,
        ).toBe(41);

        expect(
          durable.recovery.durableSupervisor
            .durableGeneration,
        ).toBe(41);

        expect(
          durable.scheduler.state,
        ).toBe("idle");

        expect(
          durable.scheduler.isRunning,
        ).toBe(false);
      },
      15_000,
    );


    it(
      "keeps legacy start on the frozen A8 path without consuming durable identity",
      async () => {
        await setDurableGeneration(
          55,
        );

        const durable =
          await createDurableOperationalComposition();

        const result =
          await durable
            .auditedControlExecutor
            .execute({
              command:
                "start",

              requestKey:
                "a10-7-start",
            });

        expect(
          result.disposition,
        ).toBe("executed");

        expect(
          durable.scheduler.state,
        ).toBe("running");

        const persisted =
          await durable
            .recovery
            .generationRepository
            .read();

        expect(
          persisted.currentGeneration,
        ).toBe(55);

        await durable
          .auditedControlExecutor
          .execute({
            command:
              "stop",

            requestKey:
              "a10-7-stop",
          });
      },
      20_000,
    );


    it(
      "routes production recovery restart through durable generation coordinates",
      async () => {
        await setDurableGeneration(
          80,
        );

        const durable =
          await createDurableOperationalComposition();

        await durable
          .auditedControlExecutor
          .execute({
            command:
              "start",

            requestKey:
              "a10-7-start-restart",
          });

        const result =
          await durable
            .recovery
            .auditedExecutor
            .execute({
              command:
                "restart",

              requestKey:
                "a10-7-restart",
            });

        expect(
          result.disposition,
        ).toBe("executed");

        if (
          !(
            "previousGeneration" in result
          ) ||
          !(
            "currentGeneration" in result
          )
        ) {
          throw new Error(
            "Expected restart generation provenance.",
          );
        }

        expect(
          result.previousGeneration,
        ).toBe(80);

        expect(
          result.currentGeneration,
        ).toBe(81);

        expect(
          durable.recovery.supervisor.generation,
        ).toBe(2);

        expect(
          durable.recovery.offsetRecovery.generation,
        ).toBe(81);

        expect(
          durable.scheduler.state,
        ).toBe("running");

        const persisted =
          await durable
            .recovery
            .generationRepository
            .read();

        expect(
          persisted.currentGeneration,
        ).toBe(81);

        await durable
          .auditedControlExecutor
          .execute({
            command:
              "stop",

            requestKey:
              "a10-7-final-stop",
          });
      },
      20_000,
    );
  },
);
