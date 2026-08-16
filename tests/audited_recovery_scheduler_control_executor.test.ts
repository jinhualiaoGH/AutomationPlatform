import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuditedRecoverySchedulerControlExecutor,
} from "../src/recovery/audited_recovery_scheduler_control_executor.js";

import type {
  RecoverySchedulerControlAuditWriter,
  RecoverySchedulerControlCommandExecutor,
} from "../src/recovery/audited_recovery_scheduler_control_executor.js";

import type {
  RecoveryAwareSchedulerControlResult,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";

function restartResult():
  RecoveryAwareSchedulerControlResult {
  return {
    command:
      "restart",

    disposition:
      "executed",

    previousGeneration:
      7,

    currentGeneration:
      8,

    previousState:
      "running",

    currentState:
      "running",

    changed:
      true,

    reason:
      null,
  };
}

describe(
  "AuditedRecoverySchedulerControlExecutor",
  () => {
    it(
      "persists pending intent before executing the recovery command",
      async () => {
        const events:
          string[] =
          [];

        const inner:
          RecoverySchedulerControlCommandExecutor = {
            execute:
              async () => {
                events.push(
                  "execute",
                );

                return restartResult();
              },
          };

        const audit:
          RecoverySchedulerControlAuditWriter = {
            createPending:
              async input => {
                events.push(
                  `pending:${input.command}:${input.requestKey}`,
                );

                return {
                  publicId:
                    "audit-1",
                };
              },

            complete:
              async () => {
                events.push(
                  "complete",
                );
              },

            fail:
              async () => {
                events.push(
                  "fail",
                );
              },
          };

        const executor =
          new AuditedRecoverySchedulerControlExecutor(
            inner,
            audit,
          );

        const result =
          await executor.execute({
            command:
              "restart",

            requestKey:
              " recovery-001 ",
          });

        expect(events)
          .toEqual([
            "pending:restart:recovery-001",
            "execute",
            "complete",
          ]);

        expect(result)
          .toEqual(
            restartResult(),
          );
      },
    );

    it(
      "does not execute the command when pending audit persistence fails",
      async () => {
        let calls =
          0;

        const expected =
          new Error(
            "pending persistence failure",
          );

        const inner:
          RecoverySchedulerControlCommandExecutor = {
            execute:
              async () => {
                calls++;

                return restartResult();
              },
          };

        const audit:
          RecoverySchedulerControlAuditWriter = {
            createPending:
              async () => {
                throw expected;
              },

            complete:
              async () => {},

            fail:
              async () => {},
          };

        const executor =
          new AuditedRecoverySchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "restart",
          }),
        ).rejects.toBe(
          expected,
        );

        expect(calls)
          .toBe(0);
      },
    );

    it(
      "durably records a thrown command failure and rethrows the original error",
      async () => {
        const expected =
          new Error(
            "synthetic restart failure",
          );

        const failures:
          string[] =
          [];

        const inner:
          RecoverySchedulerControlCommandExecutor = {
            execute:
              async () => {
                throw expected;
              },
          };

        const audit:
          RecoverySchedulerControlAuditWriter = {
            createPending:
              async () => ({
                publicId:
                  "audit-2",
              }),

            complete:
              async () => {
                throw new Error(
                  "unexpected completion",
                );
              },

            fail:
              async (
                publicId,
                errorMessage,
              ) => {
                failures.push(
                  `${publicId}:${errorMessage}`,
                );
              },
          };

        const executor =
          new AuditedRecoverySchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "restart",
          }),
        ).rejects.toBe(
          expected,
        );

        expect(failures)
          .toEqual([
            "audit-2:synthetic restart failure",
          ]);
      },
    );

    it(
      "preserves the original command error if failure auditing also fails",
      async () => {
        const expected =
          new Error(
            "original command failure",
          );

        const inner:
          RecoverySchedulerControlCommandExecutor = {
            execute:
              async () => {
                throw expected;
              },
          };

        const audit:
          RecoverySchedulerControlAuditWriter = {
            createPending:
              async () => ({
                publicId:
                  "audit-3",
              }),

            complete:
              async () => {},

            fail:
              async () => {
                throw new Error(
                  "secondary audit failure",
                );
              },
          };

        const executor =
          new AuditedRecoverySchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "restart",
          }),
        ).rejects.toBe(
          expected,
        );
      },
    );

    it(
      "fails the request if successful completion cannot be durably recorded",
      async () => {
        const expected =
          new Error(
            "completion persistence failure",
          );

        const inner:
          RecoverySchedulerControlCommandExecutor = {
            execute:
              async () =>
                restartResult(),
          };

        const audit:
          RecoverySchedulerControlAuditWriter = {
            createPending:
              async () => ({
                publicId:
                  "audit-4",
              }),

            complete:
              async () => {
                throw expected;
              },

            fail:
              async () => {},
          };

        const executor =
          new AuditedRecoverySchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "restart",
          }),
        ).rejects.toBe(
          expected,
        );
      },
    );
  },
);
