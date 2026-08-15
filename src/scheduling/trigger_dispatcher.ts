import {
  AutomationScheduleStateRepository,
} from "../repositories/automation_schedule_state_repository.js";

import {
  AutomationExecutionRunner,
} from "../runtime/automation_execution_runner.js";

import type {
  AdvanceAutomationScheduleState,
  AutomationScheduleState,
  DueAutomationSchedule,
} from "./schedule_state.js";

import type {
  Schedule,
} from "./schedule_contract.js";

import {
  evaluateScheduleDue,
} from "./schedule_due_evaluator.js";

import {
  evaluateSchedule,
} from "./schedule_evaluator.js";

import {
  parseScheduleConfiguration,
} from "./schedule_parser.js";

export type TriggerDispatchStatus =
  | "dispatched"
  | "skipped"
  | "failed";

export type TriggerDispatchOutcome = {
  triggerId: bigint;
  automationId: bigint;
  status: TriggerDispatchStatus;
  scheduledForUtc: Date;
  nextFireAtUtc: Date | null;
  errorMessage: string | null;
};

export type TriggerDispatchSummary = {
  evaluatedAtUtc: Date;
  candidates: number;
  dispatched: number;
  skipped: number;
  failed: number;
  outcomes: TriggerDispatchOutcome[];
};

type ScheduleStateStore = {
  listDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<DueAutomationSchedule[]>;

  advance(
    input: AdvanceAutomationScheduleState,
  ): Promise<AutomationScheduleState | null>;
};

type ExecutionRunner = {
  run(
    automationPublicId: string,
    input?: unknown,
    triggerId?: bigint,
  ): Promise<unknown>;
};

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(
      name + " must be a valid Date.",
    );
  }
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown trigger dispatch error.";
}

function calculateNextFutureFireAt(
  schedule: Schedule,
  scheduledForUtc: Date,
  evaluatedAtUtc: Date,
): Date {
  let nextFireAtUtc =
    evaluateSchedule(
      schedule,
      scheduledForUtc,
    ).nextFireAt;

  while (
    nextFireAtUtc.getTime() <=
    evaluatedAtUtc.getTime()
  ) {
    nextFireAtUtc =
      evaluateSchedule(
        schedule,
        nextFireAtUtc,
      ).nextFireAt;
  }

  return nextFireAtUtc;
}

export class TriggerDispatcher {
  public constructor(
    private readonly scheduleStates:
      ScheduleStateStore =
      new AutomationScheduleStateRepository(),

    private readonly executionRunner:
      ExecutionRunner =
      new AutomationExecutionRunner(),
  ) {}

  public async dispatchDue(
    evaluatedAtUtc: Date,
    limit = 100,
  ): Promise<TriggerDispatchSummary> {
    assertValidDate(
      evaluatedAtUtc,
      "evaluatedAtUtc",
    );

    const candidates =
      await this.scheduleStates.listDue(
        evaluatedAtUtc,
        limit,
      );

    const outcomes:
      TriggerDispatchOutcome[] = [];

    for (const candidate of candidates) {
      const scheduledForUtc =
        new Date(
          candidate.nextFireAtUtc.getTime(),
        );

      try {
        const due =
          evaluateScheduleDue(
            candidate.nextFireAtUtc,
            evaluatedAtUtc,
          );

        if (!due.due) {
          outcomes.push({
            triggerId:
              candidate.triggerId,

            automationId:
              candidate.automationId,

            status:
              "skipped",

            scheduledForUtc,

            nextFireAtUtc:
              null,

            errorMessage:
              null,
          });

          continue;
        }

        const schedule =
          parseScheduleConfiguration(
            candidate.configurationJson,
          );

        const nextFireAtUtc =
          calculateNextFutureFireAt(
            schedule,
            scheduledForUtc,
            evaluatedAtUtc,
          );

        const claimed =
          await this.scheduleStates.advance({
            triggerId:
              candidate.triggerId,

            evaluatedAtUtc,

            nextFireAtUtc,

            rowVersion:
              candidate.rowVersion,
          });

        if (!claimed) {
          outcomes.push({
            triggerId:
              candidate.triggerId,

            automationId:
              candidate.automationId,

            status:
              "skipped",

            scheduledForUtc,

            nextFireAtUtc,

            errorMessage:
              null,
          });

          continue;
        }

        try {
          await this.executionRunner.run(
            candidate.automationPublicId,
            {
              schedule: {
                scheduledForUtc:
                  scheduledForUtc.toISOString(),

                evaluatedAtUtc:
                  evaluatedAtUtc.toISOString(),
              },
            },
            candidate.triggerId,
          );

          outcomes.push({
            triggerId:
              candidate.triggerId,

            automationId:
              candidate.automationId,

            status:
              "dispatched",

            scheduledForUtc,

            nextFireAtUtc,

            errorMessage:
              null,
          });
        }
        catch (error) {
          outcomes.push({
            triggerId:
              candidate.triggerId,

            automationId:
              candidate.automationId,

            status:
              "failed",

            scheduledForUtc,

            nextFireAtUtc,

            errorMessage:
              getErrorMessage(error),
          });
        }
      }
      catch (error) {
        outcomes.push({
          triggerId:
            candidate.triggerId,

          automationId:
            candidate.automationId,

          status:
            "failed",

          scheduledForUtc,

          nextFireAtUtc:
            null,

          errorMessage:
            getErrorMessage(error),
        });
      }
    }

    return {
      evaluatedAtUtc:
        new Date(
          evaluatedAtUtc.getTime(),
        ),

      candidates:
        outcomes.length,

      dispatched:
        outcomes.filter(
          (outcome) =>
            outcome.status ===
            "dispatched",
        ).length,

      skipped:
        outcomes.filter(
          (outcome) =>
            outcome.status ===
            "skipped",
        ).length,

      failed:
        outcomes.filter(
          (outcome) =>
            outcome.status ===
            "failed",
        ).length,

      outcomes,
    };
  }
}
