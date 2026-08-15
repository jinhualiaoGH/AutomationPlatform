import type {
  AutomationExecution,
  AutomationStep,
  AutomationStepExecution,
} from "../domain/automation.js";

import {
  AutomationStepExecutionRepository,
} from "../repositories/automation_step_execution_repository.js";

import {
  createDefaultHandlerRegistry,
} from "./runtime_composition.js";

import {
  StepExecutionEngine,
} from "./step_execution_engine.js";

export type PersistentStepRunInput = {
  automationExecution:
    AutomationExecution;

  step:
    AutomationStep;

  attemptNumber?:
    number;

  inputJson?:
    string | null;
};

export class StepExecutionPersistenceConflictError
  extends Error {
  public constructor(
    operation: string,
  ) {
    super(
      `Step execution persistence conflict during ${operation}.`,
    );

    this.name =
      "StepExecutionPersistenceConflictError";
  }
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown step execution error.";
}

export class PersistentStepRunner {
  public constructor(
    private readonly engine =
      new StepExecutionEngine(
        createDefaultHandlerRegistry(),
      ),

    private readonly stepExecutions =
      new AutomationStepExecutionRepository(),
  ) {}

  public async run(
    input: PersistentStepRunInput,
  ): Promise<AutomationStepExecution> {
    if (
      input.automationExecution.status !==
      "running"
    ) {
      throw new Error(
        "Persistent step execution requires a running automation execution.",
      );
    }

    const attemptNumber =
      input.attemptNumber ?? 1;

    if (
      !Number.isInteger(
        attemptNumber,
      ) ||
      attemptNumber < 1
    ) {
      throw new Error(
        "Step attempt number must be a positive integer.",
      );
    }

    const created =
      await this.stepExecutions.create({
        executionId:
          input
            .automationExecution
            .executionId,

        stepId:
          input.step.stepId,

        attemptNumber,

        inputJson:
          input.inputJson ?? null,
      });

    const running =
      await this.stepExecutions
        .transitionStatus(
          created.stepExecutionId,
          "pending",
          "running",
        );

    if (!running) {
      throw new StepExecutionPersistenceConflictError(
        "start",
      );
    }

    let result;

    try {
      result =
        await this.engine.execute({
          automationExecution:
            input.automationExecution,

          step:
            input.step,

          attemptNumber,
        });
    }
    catch (error) {
      const failed =
        await this.stepExecutions
          .transitionStatus(
            created.stepExecutionId,
            "running",
            "failed",
            null,
            errorMessage(error),
          );

      if (!failed) {
        throw new StepExecutionPersistenceConflictError(
          "runtime-error failure",
        );
      }

      throw error;
    }

    if (
      result.status ===
      "succeeded"
    ) {
      const succeeded =
        await this.stepExecutions
          .transitionStatus(
            created.stepExecutionId,
            "running",
            "succeeded",
            result.outputJson ?? null,
          );

      if (!succeeded) {
        throw new StepExecutionPersistenceConflictError(
          "success",
        );
      }

      return succeeded;
    }

    const failed =
      await this.stepExecutions
        .transitionStatus(
          created.stepExecutionId,
          "running",
          "failed",
          result.outputJson ?? null,
          result.errorMessage,
        );

    if (!failed) {
      throw new StepExecutionPersistenceConflictError(
        "failure",
      );
    }

    return failed;
  }
}
