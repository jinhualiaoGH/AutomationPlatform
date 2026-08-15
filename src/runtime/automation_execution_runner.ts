import type {
  AutomationExecution,
  AutomationStepExecution,
} from "../domain/automation.js";

import {
  AutomationStepRepository,
} from "../repositories/automation_step_repository.js";

import {
  AutomationService,
} from "../services/automation_service.js";

import type {
  PersistentStepRunInput,
} from "./persistent_step_runner.js";

import {
  RetryingStepRunner,
} from "./retrying_step_runner.js";

export type AutomationRunResult = {
  execution:
    AutomationExecution;

  stepExecutions:
    AutomationStepExecution[];
};

type OrderedStepRunner = {
  run(
    input: PersistentStepRunInput,
  ): Promise<AutomationStepExecution>;
};

function unknownErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown automation execution error.";
}

export class AutomationExecutionRunner {
  public constructor(
    private readonly service =
      new AutomationService(),

    private readonly steps =
      new AutomationStepRepository(),

    private readonly stepRunner:
      OrderedStepRunner =
      new RetryingStepRunner(),
  ) {}

  public async run(
    automationPublicId: string,
    input?: unknown,
  ): Promise<AutomationRunResult> {
    const running =
      await this.service.startExecution(
        automationPublicId,
        input,
      );

    const persistedSteps =
      await this.steps.listByAutomationId(
        running.automationId,
      );

    const stepExecutions:
      AutomationStepExecution[] = [];

    try {
      for (const step of persistedSteps) {
        const stepExecution =
          await this.stepRunner.run({
            automationExecution:
              running,

            step,

            attemptNumber: 1,

            inputJson:
              running.inputJson,
          });

        stepExecutions.push(
          stepExecution,
        );

        if (
          stepExecution.status ===
          "failed"
        ) {
          const failed =
            await this.service.failExecution(
              running,
              stepExecution.errorMessage ??
                `Automation step ${step.stepId.toString()} failed.`,
            );

          return {
            execution:
              failed,

            stepExecutions,
          };
        }
      }

      const succeeded =
        await this.service.completeExecution(
          running,
          {
            stepsCompleted:
              stepExecutions.length,
          },
        );

      return {
        execution:
          succeeded,

        stepExecutions,
      };
    }
    catch (error) {
      await this.service.failExecution(
        running,
        unknownErrorMessage(error),
      );

      throw error;
    }
  }
}
