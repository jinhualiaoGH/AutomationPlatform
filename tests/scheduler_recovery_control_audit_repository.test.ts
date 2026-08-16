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
  SchedulerRecoveryControlAuditRepository,
} from "../src/repositories/scheduler_recovery_control_audit_repository.js";

describe(
  "SchedulerRecoveryControlAuditRepository",
  () => {
    const repository =
      new SchedulerRecoveryControlAuditRepository();

    beforeEach(
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
      "persists and completes restart generation provenance",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "restart",

            requestKey:
              "restart-audit-001",
          });

        await repository.complete(
          pending.publicId,
          {
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              4,

            currentGeneration:
              5,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          },
        );

        const rows =
          await repository.listRecent(
            10,
          );

        expect(rows)
          .toHaveLength(1);

        expect(rows[0])
          .toMatchObject({
            publicId:
              pending.publicId,

            command:
              "restart",

            requestKey:
              "restart-audit-001",

            auditStatus:
              "completed",

            disposition:
              "executed",

            previousState:
              "running",

            currentState:
              "running",

            previousGeneration:
              4,

            currentGeneration:
              5,

            changed:
              true,

            reason:
              null,

            errorMessage:
              null,
          });

        expect(
          rows[0]?.createdAtUtc,
        ).toBeInstanceOf(
          Date,
        );

        expect(
          rows[0]?.completedAtUtc,
        ).toBeInstanceOf(
          Date,
        );
      },
      15_000,
    );

    it(
      "preserves start and stop outcomes without synthetic generation identity",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "stop",

            requestKey:
              null,
          });

        await repository.complete(
          pending.publicId,
          {
            command:
              "stop",

            disposition:
              "noop",

            previousState:
              "stopped",

            currentState:
              "stopped",

            changed:
              false,

            reason:
              "SchedulerRuntime is not currently running.",
          },
        );

        const rows =
          await repository.listRecent(
            10,
          );

        expect(rows[0])
          .toMatchObject({
            command:
              "stop",

            auditStatus:
              "completed",

            disposition:
              "noop",

            previousGeneration:
              null,

            currentGeneration:
              null,

            changed:
              false,
          });
      },
      15_000,
    );

    it(
      "persists thrown recovery failures durably",
      async () => {
        const pending =
          await repository.createPending({
            command:
              "restart",

            requestKey:
              "restart-failure-001",
          });

        await repository.fail(
          pending.publicId,
          "synthetic restart failure",
        );

        const rows =
          await repository.listRecent(
            10,
          );

        expect(rows[0])
          .toMatchObject({
            command:
              "restart",

            auditStatus:
              "failed",

            disposition:
              null,

            errorMessage:
              "synthetic restart failure",
          });

        expect(
          rows[0]?.completedAtUtc,
        ).toBeInstanceOf(
          Date,
        );
      },
      15_000,
    );

    it(
      "returns newest records first and enforces bounded limits",
      async () => {
        await repository.createPending({
          command:
            "start",

          requestKey:
            "first",
        });

        await repository.createPending({
          command:
            "restart",

          requestKey:
            "second",
        });

        const latest =
          await repository.listRecent(
            1,
          );

        expect(latest)
          .toHaveLength(1);

        expect(
          latest[0]?.requestKey,
        ).toBe(
          "second",
        );

        await expect(
          repository.listRecent(
            0,
          ),
        ).rejects.toThrow(
          "limit must be an integer from 1 through 100.",
        );

        await expect(
          repository.listRecent(
            101,
          ),
        ).rejects.toThrow(
          "limit must be an integer from 1 through 100.",
        );
      },
      15_000,
    );
  },
);
