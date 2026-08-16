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
  AuditedSchedulerControlExecutor,
} from "../src/operations/audited_scheduler_control_executor.js";

import {
  SchedulerControlCoordinator,
} from "../src/operations/scheduler_control_coordinator.js";

import {
  SchedulerControlService,
} from "../src/operations/scheduler_control_service.js";

import {
  SchedulerControlAuditRepository,
} from "../src/repositories/scheduler_control_audit_repository.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";

class IntegrationScheduler {
  public state:
    SchedulerRuntimeState =
    "idle";

  public startCalls =
    0;

  public stopCalls =
    0;

  public get isRunning():
    boolean {
    return this.state ===
      "running";
  }

  public start():
    void {
    this.startCalls++;

    if (this.state !== "idle") {
      throw new Error(
        "SchedulerRuntime can only be started once.",
      );
    }

    this.state =
      "running";
  }

  public async stop():
    Promise<unknown> {
    this.stopCalls++;

    if (this.state === "running") {
      this.state =
        "stopped";
    }

    return null;
  }
}

describe(
  "A8.6 durable scheduler-control integration",
  () => {
    beforeEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool
          .request()
          .query(`
            DELETE FROM dbo.scheduler_control_command_audit;
          `);
      },
    );

    afterEach(
      async () => {
        const pool =
          await getDatabasePool();

        await pool
          .request()
          .query(`
            DELETE FROM dbo.scheduler_control_command_audit;
          `);

        await closeDatabase();
      },
    );

    it(
      "persists a completed start command around the governed coordinator",
      async () => {
        const scheduler =
          new IntegrationScheduler();

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const coordinator =
          new SchedulerControlCoordinator(
            service,
          );

        const repository =
          new SchedulerControlAuditRepository();

        const executor =
          new AuditedSchedulerControlExecutor(
            coordinator,
            repository,
          );

        const result =
          await executor.execute({
            command:
              "start",

            requestKey:
              "a8.6-start-1",
          });

        expect(result.disposition)
          .toBe(
            "executed",
          );

        expect(scheduler.startCalls)
          .toBe(1);

        const audit =
          await repository.listRecent(
            10,
          );

        expect(audit)
          .toHaveLength(1);

        expect(audit[0]?.requestKey)
          .toBe(
            "a8.6-start-1",
          );

        expect(audit[0]?.command)
          .toBe(
            "start",
          );

        expect(audit[0]?.auditStatus)
          .toBe(
            "completed",
          );

        expect(audit[0]?.disposition)
          .toBe(
            "executed",
          );

        expect(audit[0]?.previousState)
          .toBe(
            "idle",
          );

        expect(audit[0]?.currentState)
          .toBe(
            "running",
          );

        expect(audit[0]?.changed)
          .toBe(true);
      },
      15_000,
    );

    it(
      "persists a governed rejected command as a completed audit outcome",
      async () => {
        const scheduler =
          new IntegrationScheduler();

        scheduler.state =
          "running";

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const coordinator =
          new SchedulerControlCoordinator(
            service,
          );

        const repository =
          new SchedulerControlAuditRepository();

        const executor =
          new AuditedSchedulerControlExecutor(
            coordinator,
            repository,
          );

        const result =
          await executor.execute({
            command:
              "start",

            requestKey:
              "a8.6-rejected-1",
          });

        expect(result.disposition)
          .toBe(
            "rejected",
          );

        expect(scheduler.startCalls)
          .toBe(0);

        const audit =
          await repository.listRecent(
            10,
          );

        expect(audit)
          .toHaveLength(1);

        expect(audit[0]?.auditStatus)
          .toBe(
            "completed",
          );

        expect(audit[0]?.disposition)
          .toBe(
            "rejected",
          );

        expect(audit[0]?.changed)
          .toBe(false);
      },
      15_000,
    );

    it(
      "persists a governed noop stop as a completed audit outcome",
      async () => {
        const scheduler =
          new IntegrationScheduler();

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const coordinator =
          new SchedulerControlCoordinator(
            service,
          );

        const repository =
          new SchedulerControlAuditRepository();

        const executor =
          new AuditedSchedulerControlExecutor(
            coordinator,
            repository,
          );

        const result =
          await executor.execute({
            command:
              "stop",

            requestKey:
              "a8.6-noop-1",
          });

        expect(result.disposition)
          .toBe(
            "noop",
          );

        expect(scheduler.stopCalls)
          .toBe(0);

        const audit =
          await repository.listRecent(
            10,
          );

        expect(audit)
          .toHaveLength(1);

        expect(audit[0]?.auditStatus)
          .toBe(
            "completed",
          );

        expect(audit[0]?.disposition)
          .toBe(
            "noop",
          );

        expect(audit[0]?.previousState)
          .toBe(
            "idle",
          );

        expect(audit[0]?.currentState)
          .toBe(
            "idle",
          );
      },
      15_000,
    );

    it(
      "preserves request-key coordinator idempotency while auditing each admitted request",
      async () => {
        const scheduler =
          new IntegrationScheduler();

        const service =
          new SchedulerControlService(
            scheduler,
          );

        const coordinator =
          new SchedulerControlCoordinator(
            service,
          );

        const repository =
          new SchedulerControlAuditRepository();

        const executor =
          new AuditedSchedulerControlExecutor(
            coordinator,
            repository,
          );

        const first =
          await executor.execute({
            command:
              "start",

            requestKey:
              "a8.6-idempotent-1",
          });

        const duplicate =
          await executor.execute({
            command:
              "start",

            requestKey:
              "a8.6-idempotent-1",
          });

        expect(first)
          .toEqual(
            duplicate,
          );

        expect(scheduler.startCalls)
          .toBe(1);

        const audits =
          await repository.listRecent(
            10,
          );

        expect(audits)
          .toHaveLength(2);

        expect(
          audits.every(
            (item) =>
              item.requestKey ===
              "a8.6-idempotent-1",
          ),
        ).toBe(true);

        expect(
          audits.every(
            (item) =>
              item.auditStatus ===
              "completed",
          ),
        ).toBe(true);
      },
      15_000,
    );
  },
);
