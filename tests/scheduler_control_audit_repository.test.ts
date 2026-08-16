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
  SchedulerControlAuditRepository,
} from "../src/repositories/scheduler_control_audit_repository.js";

describe(
  "SchedulerControlAuditRepository",
  () => {
    const repository =
      new SchedulerControlAuditRepository();

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
      "persists pending intent and completes it with command outcome",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "stop",

            requestKey:
              "repo-success-1",
          });

        expect(pending.auditStatus)
          .toBe(
            "pending",
          );

        expect(pending.command)
          .toBe(
            "stop",
          );

        expect(pending.requestKey)
          .toBe(
            "repo-success-1",
          );

        expect(pending.completedAtUtc)
          .toBeNull();

        const completed =
          await repository.complete(
            pending.publicId,
            {
              command:
                "stop",

              disposition:
                "executed",

              previousState:
                "running",

              currentState:
                "stopped",

              changed:
                true,

              reason:
                null,
            },
          );

        expect(completed?.auditStatus)
          .toBe(
            "completed",
          );

        expect(completed?.disposition)
          .toBe(
            "executed",
          );

        expect(completed?.previousState)
          .toBe(
            "running",
          );

        expect(completed?.currentState)
          .toBe(
            "stopped",
          );

        expect(completed?.changed)
          .toBe(true);

        expect(completed?.completedAtUtc)
          .toBeInstanceOf(
            Date,
          );
      },
      15_000,
    );

    it(
      "persists command execution failure",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "start",

            requestKey:
              "repo-failure-1",
          });

        const failed =
          await repository.fail(
            pending.publicId,
            "synthetic runtime failure",
          );

        expect(failed?.auditStatus)
          .toBe(
            "failed",
          );

        expect(failed?.disposition)
          .toBeNull();

        expect(failed?.errorMessage)
          .toBe(
            "synthetic runtime failure",
          );

        expect(failed?.completedAtUtc)
          .toBeInstanceOf(
            Date,
          );
      },
      15_000,
    );

    it(
      "does not finalize one audit record twice",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "stop",

            requestKey:
              null,
          });

        const completed =
          await repository.complete(
            pending.publicId,
            {
              command:
                "stop",

              disposition:
                "noop",

              previousState:
                "idle",

              currentState:
                "idle",

              changed:
                false,

              reason:
                "SchedulerRuntime is not currently running.",
            },
          );

        expect(completed)
          .not.toBeNull();

        const second =
          await repository.fail(
            pending.publicId,
            "should not overwrite",
          );

        expect(second)
          .toBeNull();
      },
      15_000,
    );

    it(
      "lists newest audit records first with a bounded limit",
      async () => {
        await repository.createPending({
          command:
            "start",

          requestKey:
            "first",
        });

        await repository.createPending({
          command:
            "stop",

          requestKey:
            "second",
        });

        const recent =
          await repository.listRecent(
            1,
          );

        expect(recent)
          .toHaveLength(1);

        expect(recent[0]?.requestKey)
          .toBe(
            "second",
          );

        await expect(
          repository.listRecent(
            0,
          ),
        ).rejects.toThrow(
          "limit must be an integer from 1 to 100.",
        );

        await expect(
          repository.listRecent(
            101,
          ),
        ).rejects.toThrow(
          "limit must be an integer from 1 to 100.",
        );
      },
      15_000,
    );
  },
);
