import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  createOperationalComposition,
} from "../src/operations/operational_composition.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

import {
  SchedulerRecoverySupervisor,
} from "../src/recovery/scheduler_recovery_supervisor.js";


describe(
  "A9.8 application recovery wiring",
  () => {
    afterEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool
          .request()
          .query(`
            DELETE FROM
                dbo.scheduler_recovery_command_audit;
          `);

        await closeDatabase();
      },
    );

    it(
      "preserves the frozen A8 SchedulerRuntime ABI",
      () => {
        const composition =
          createOperationalComposition();

        expect(
          composition.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          composition.recovery.supervisor,
        ).toBeInstanceOf(
          SchedulerRecoverySupervisor,
        );

        expect(
          composition.recovery.supervisor.generation,
        ).toBe(
          1,
        );

        expect(
          composition.scheduler.state,
        ).toBe(
          "idle",
        );

        expect(
          composition.scheduler.isRunning,
        ).toBe(false);
      },
    );

    it(
      "preserves scheduler observation before startup",
      () => {
        const composition =
          createOperationalComposition();

        expect(
          composition.scheduler.getLastResult(),
        ).toBeNull();

        expect(
          composition.scheduler.getTerminalError(),
        ).toBeNull();

        expect(
          composition.statusService.getStatus(),
        ).toMatchObject({
          runtimeState:
            "idle",

          isRunning:
            false,

          health:
            "idle",

          terminalError:
            null,
        });
      },
    );

    it(
      "preserves frozen start semantics through the facade",
      () => {
        const composition =
          createOperationalComposition();

        const result =
          composition.controlService.start();

        expect(result)
          .toMatchObject({
            command:
              "start",

            disposition:
              "executed",

            previousState:
              "idle",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });

        expect(
          composition.recovery.supervisor.generation,
        ).toBe(
          1,
        );

        expect(
          composition.scheduler.state,
        ).toBe(
          "running",
        );
      },
    );

    it(
      "keeps one facade identity while following replacement generation",
      async () => {
        const composition =
          createOperationalComposition();

        const schedulerFacade =
          composition.scheduler;

        composition.scheduler.start();

        const result =
          await composition.recovery.coordinator.execute({
            command:
              "restart",

            requestKey:
              "a9-8-r2-restart-001",
          });

        expect(result)
          .toMatchObject({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,
          });

        expect(
          composition.scheduler,
        ).toBe(
          schedulerFacade,
        );

        expect(
          composition.scheduler,
        ).toBeInstanceOf(
          SchedulerRuntime,
        );

        expect(
          composition.recovery.supervisor.generation,
        ).toBe(
          2,
        );

        /*
         * The same facade now observes generation 2.
         */
        expect(
          composition.scheduler.state,
        ).toBe(
          "running",
        );

        expect(
          composition.scheduler.isRunning,
        ).toBe(true);

        await composition.scheduler.stop();

        expect(
          composition.scheduler.state,
        ).toBe(
          "stopped",
        );
      },
      15_000,
    );

    it(
      "keeps one metrics accumulator across generations",
      async () => {
        const composition =
          createOperationalComposition();

        const metrics =
          composition.metrics;

        composition.scheduler.start();

        await composition.recovery.coordinator.execute({
          command:
            "restart",

          requestKey:
            "a9-8-r2-metrics-001",
        });

        expect(
          composition.metrics,
        ).toBe(
          metrics,
        );

        expect(
          composition.recovery.supervisor.generation,
        ).toBe(
          2,
        );

        await composition.scheduler.stop();
      },
      15_000,
    );

    it(
      "persists durable restart provenance through production recovery",
      async () => {
        const composition =
          createOperationalComposition();

        composition.scheduler.start();

        const result =
          await composition.recovery.auditedExecutor.execute({
            command:
              "restart",

            requestKey:
              "a9-8-r2-audit-001",
          });

        expect(result)
          .toMatchObject({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,
          });

        const rows =
          await composition.recovery
            .auditRepository
            .listRecent(
              10,
            );

        expect(rows)
          .toHaveLength(
            1,
          );

        expect(rows[0])
          .toMatchObject({
            command:
              "restart",

            requestKey:
              "a9-8-r2-audit-001",

            auditStatus:
              "completed",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,
          });

        await composition.scheduler.stop();
      },
      15_000,
    );
  },
);
