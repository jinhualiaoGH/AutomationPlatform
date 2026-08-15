import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../step_handler.js";

export type LogStepOutput = {
  kind: "log";

  stepType:
    string;

  executionId:
    string;

  stepId:
    string;

  attemptNumber:
    number;
};

export class LogStepHandler
  implements StepHandler {
  public readonly stepType =
    "log";

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const output:
      LogStepOutput = {
        kind: "log",

        stepType:
          context.step.stepType,

        executionId:
          context
            .automationExecution
            .executionId
            .toString(),

        stepId:
          context.step.stepId
            .toString(),

        attemptNumber:
          context.attemptNumber,
      };

    return {
      status: "succeeded",
      outputJson:
        JSON.stringify(output),
    };
  }
}
