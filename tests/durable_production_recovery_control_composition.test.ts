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
  createDurableProductionRecoveryControlComposition,
} from "../src/recovery/durable_production_recovery_control_composition.js";

import {
  SchedulerGenerationStateRepository,
} from "../src/repositories/scheduler_generation_state_repository.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

import {
  TriggerDispatcher,
} from "../src/scheduling/trigger_dispatcher.js";


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
  "createDurableProductionRecoveryControlComposition",
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
      "constructs frozen runtime compatibility plus durable recovery control",
      async () => {
        const composition =
          await createDurableProductionRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        expect(
          composition.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          composition.supervisor.generation,
        ).toBe(1);

        expect(
          composition.offsetRecovery.generation,
        ).toBe(1);

        expect(
          composition.durableSupervisor
            .durableGeneration,
        ).toBe(1);

        expect(
          composition.scheduler.state,
        ).toBe("idle");
      },
      15_000,
    );


    it(
      "bootstraps a fresh process-local generation one onto persisted durable generation seven",
      async () => {
        await setDurableGeneration(
          7,
        );

        const composition =
          await createDurableProductionRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        expect(
          composition.supervisor.generation,
        ).toBe(1);

        expect(
          composition.offsetRecovery.generation,
        ).toBe(7);

        expect(
          composition.durableSupervisor
            .durableGeneration,
        ).toBe(7);

        expect(
          composition.scheduler.state,
        ).toBe("idle");
      },
      15_000,
    );


    it(
      "preserves frozen start semantics without allocating a durable generation",
      async () => {
        await setDurableGeneration(
          11,
        );

        const composition =
          await createDurableProductionRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        const result =
          composition.recoveryControlService
            .start();

        expect(
          result.disposition,
        ).toBe("executed");

        expect(
          composition.supervisor.state,
        ).toBe("running");

        expect(
          composition.supervisor.generation,
        ).toBe(1);

        expect(
          composition.offsetRecovery.generation,
        ).toBe(11);

        const persisted =
          await composition
            .generationRepository
            .read();

        expect(
          persisted.currentGeneration,
        ).toBe(11);

        await composition
          .recoveryControlService
          .stop();
      },
      15_000,
    );


    it(
      "routes restart through durable allocation while frozen A9 advances locally",
      async () => {
        await setDurableGeneration(
          19,
        );

        const composition =
          await createDurableProductionRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        composition
          .recoveryControlService
          .start();

        const result =
          await composition
            .recoveryControlService
            .restart();

        expect(
          result.disposition,
        ).toBe("executed");

        expect(
          result.previousGeneration,
        ).toBe(19);

        expect(
          result.currentGeneration,
        ).toBe(20);

        expect(
          composition.supervisor.generation,
        ).toBe(2);

        expect(
          composition.offsetRecovery.generation,
        ).toBe(20);

        expect(
          composition.durableSupervisor
            .durableGeneration,
        ).toBe(20);

        expect(
          composition.supervisor.state,
        ).toBe("running");

        const persisted =
          await composition
            .generationRepository
            .read();

        expect(
          persisted.currentGeneration,
        ).toBe(20);

        await composition
          .recoveryControlService
          .stop();
      },
      20_000,
    );


    it(
      "allows the same production composition to continue monotonically across multiple restarts",
      async () => {
        await setDurableGeneration(
          30,
        );

        const composition =
          await createDurableProductionRecoveryControlComposition(
            new TriggerDispatcher(),
          );

        composition
          .recoveryControlService
          .start();

        const first =
          await composition
            .recoveryControlService
            .restart();

        const second =
          await composition
            .recoveryControlService
            .restart();

        expect(
          first.previousGeneration,
        ).toBe(30);

        expect(
          first.currentGeneration,
        ).toBe(31);

        expect(
          second.previousGeneration,
        ).toBe(31);

        expect(
          second.currentGeneration,
        ).toBe(32);

        expect(
          composition.supervisor.generation,
        ).toBe(3);

        expect(
          composition.offsetRecovery.generation,
        ).toBe(32);

        const persisted =
          await new SchedulerGenerationStateRepository()
            .read();

        expect(
          persisted.currentGeneration,
        ).toBe(32);

        await composition
          .recoveryControlService
          .stop();
      },
      20_000,
    );
  },
);
