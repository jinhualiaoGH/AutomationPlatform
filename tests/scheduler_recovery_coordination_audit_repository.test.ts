import {
  afterEach,
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  SchedulerRecoveryCoordinationAuditRepository,
} from "../src/repositories/scheduler_recovery_coordination_audit_repository.js";


async function clearAudit():
  Promise<void> {

  const pool =
    await getDatabasePool();

  await pool
    .request()
    .query(`
      DELETE FROM
          dbo.scheduler_recovery_coordination_audit;
    `);
}


describe(
  "SchedulerRecoveryCoordinationAuditRepository",
  () => {

    const repository =
      new SchedulerRecoveryCoordinationAuditRepository();


    afterEach(
      async () => {
        await clearAudit();
      },
    );


    it(
      "persists and completes a superseded recovery",
      async () => {

        const pending =
          await repository.createPending({
            command:
              "restart",

            requestKey:
              "sql-superseded",
          });


        await repository.complete(
          pending.publicId,
          {
            resultKind:
              "superseded",

            disposition:
              "superseded",

            previousState:
              null,

            currentState:
              null,

            previousGeneration:
              null,

            currentGeneration:
              null,

            attemptedGeneration:
              7,

            observedGeneration:
              8,

            changed:
              false,

            reason:
              "Superseded by a later durable scheduler generation.",
          },
        );


        const recent =
          await repository.listRecent(
            1,
          );


        expect(recent)
          .toHaveLength(
            1,
          );


        expect(recent[0])
          .toMatchObject({
            publicId:
              pending.publicId,

            command:
              "restart",

            requestKey:
              "sql-superseded",

            auditStatus:
              "completed",

            resultKind:
              "superseded",

            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              8,

            changed:
              false,

            errorMessage:
              null,
          });
      },
      15000,
    );


    it(
      "durably records command failure",
      async () => {

        const pending =
          await repository.createPending({
            command:
              "restart",

            requestKey:
              null,
          });


        await repository.fail(
          pending.publicId,
          "synthetic failure",
        );


        const recent =
          await repository.listRecent(
            1,
          );


        expect(recent[0])
          .toMatchObject({
            auditStatus:
              "failed",

            errorMessage:
              "synthetic failure",
          });
      },
      15000,
    );


    it(
      "lists newest records first and validates limits",
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


        expect(latest[0]?.requestKey)
          .toBe(
            "second",
          );


        await expect(
          repository.listRecent(
            0,
          ),
        )
          .rejects
          .toThrow(
            "limit must be an integer from 1 through 100.",
          );


        await expect(
          repository.listRecent(
            101,
          ),
        )
          .rejects
          .toThrow(
            "limit must be an integer from 1 through 100.",
          );
      },
      15000,
    );
  },
);


afterAll(
  async () => {
    await clearAudit();
    await closeDatabase();
  },
);
