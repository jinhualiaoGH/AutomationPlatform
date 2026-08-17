import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuditedCoordinatedRecoverySchedulerControlExecutor,
} from "../src/recovery/audited_coordinated_recovery_scheduler_control_executor.js";

import type {
  CoordinatedRecoverySchedulerControlAuditWriter,
} from "../src/recovery/audited_coordinated_recovery_scheduler_control_executor.js";


describe(
  "AuditedCoordinatedRecoverySchedulerControlExecutor",
  () => {

    it(
      "persists pending intent before executing",
      async () => {

        const events:
          string[] =
          [];


        const audit:
          CoordinatedRecoverySchedulerControlAuditWriter =
        {
          async createPending(
            input,
          ) {
            events.push(
              `pending:${input.command}:${input.requestKey}`,
            );

            return {
              publicId:
                "audit-1",
            };
          },

          async complete() {
            events.push(
              "complete",
            );
          },

          async fail() {
            events.push(
              "fail",
            );
          },
        };


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {

                events.push(
                  "execute",
                );

                return {
                  disposition:
                    "superseded",

                  attemptedGeneration:
                    7,

                  observedGeneration:
                    8,
                };
              },
            },
            audit,
          );


        const result =
          await executor.execute({
            command:
              "restart",

            requestKey:
              "  request-1  ",
          });


        expect(events)
          .toEqual([
            "pending:restart:request-1",
            "execute",
            "complete",
          ]);


        expect(result)
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              8,
          });
      },
    );


    it(
      "projects superseded generation identity durably",
      async () => {

        let completion:
          unknown =
          null;


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {
                return {
                  disposition:
                    "superseded",

                  attemptedGeneration:
                    11,

                  observedGeneration:
                    12,
                };
              },
            },
            {
              async createPending() {
                return {
                  publicId:
                    "audit-2",
                };
              },

              async complete(
                _publicId,
                value,
              ) {
                completion =
                  value;
              },

              async fail() {},
            },
          );


        await executor.execute({
          command:
            "restart",
        });


        expect(completion)
          .toEqual({
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
              11,

            observedGeneration:
              12,

            changed:
              false,

            reason:
              "Superseded by a later durable scheduler generation.",
          });
      },
    );


    it(
      "projects a restarted winner without losing frozen provenance",
      async () => {

        let completion:
          unknown =
          null;


        const restart = {
          command:
            "restart" as const,

          disposition:
            "executed" as const,

          previousGeneration:
            3,

          currentGeneration:
            4,

          previousState:
            "running" as const,

          currentState:
            "running" as const,

          changed:
            true,

          reason:
            null,
        };


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {
                return {
                  disposition:
                    "restarted",

                  previousGeneration:
                    3,

                  currentGeneration:
                    4,

                  result:
                    restart,
                };
              },
            },
            {
              async createPending() {
                return {
                  publicId:
                    "audit-3",
                };
              },

              async complete(
                _publicId,
                value,
              ) {
                completion =
                  value;
              },

              async fail() {},
            },
          );


        await executor.execute({
          command:
            "restart",
        });


        expect(completion)
          .toMatchObject({
            resultKind:
              "restarted",

            disposition:
              "executed",

            previousGeneration:
              3,

            currentGeneration:
              4,

            attemptedGeneration:
              3,

            observedGeneration:
              4,

            changed:
              true,
          });
      },
    );


    it(
      "durably fails a thrown command and rethrows the original error",
      async () => {

        const expected =
          new Error(
            "synthetic coordinated failure",
          );


        const events:
          string[] =
          [];


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {
                throw expected;
              },
            },
            {
              async createPending() {
                events.push(
                  "pending",
                );

                return {
                  publicId:
                    "audit-4",
                };
              },

              async complete() {
                events.push(
                  "complete",
                );
              },

              async fail(
                _publicId,
                message,
              ) {
                events.push(
                  `fail:${message}`,
                );
              },
            },
          );


        await expect(
          executor.execute({
            command:
              "restart",
          }),
        )
          .rejects
          .toBe(
            expected,
          );


        expect(events)
          .toEqual([
            "pending",
            "fail:synthetic coordinated failure",
          ]);
      },
    );


    it(
      "preserves the original command error when failure auditing also fails",
      async () => {

        const expected =
          new Error(
            "original command failure",
          );


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {
                throw expected;
              },
            },
            {
              async createPending() {
                return {
                  publicId:
                    "audit-5",
                };
              },

              async complete() {},

              async fail() {
                throw new Error(
                  "audit failure",
                );
              },
            },
          );


        await expect(
          executor.execute({
            command:
              "restart",
          }),
        )
          .rejects
          .toBe(
            expected,
          );
      },
    );


    it(
      "fails the request when successful completion cannot be durably recorded",
      async () => {

        const expected =
          new Error(
            "completion persistence failure",
          );


        const executor =
          new AuditedCoordinatedRecoverySchedulerControlExecutor(
            {
              async execute() {
                return {
                  disposition:
                    "superseded",

                  attemptedGeneration:
                    1,

                  observedGeneration:
                    2,
                };
              },
            },
            {
              async createPending() {
                return {
                  publicId:
                    "audit-6",
                };
              },

              async complete() {
                throw expected;
              },

              async fail() {},
            },
          );


        await expect(
          executor.execute({
            command:
              "restart",
          }),
        )
          .rejects
          .toBe(
            expected,
          );
      },
    );
  },
);
