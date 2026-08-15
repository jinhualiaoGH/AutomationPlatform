import type {
  StepExecutionContext,
  StepExecutionResult,
} from "./step_handler.js";

import {
  HandlerRegistry,
} from "./handler_registry.js";

export class StepExecutionEngine {
  public constructor(
    private readonly registry:
      HandlerRegistry,
  ) {}

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const handler =
      this.registry.get(
        context.step.stepType,
      );

    try {
      return await handler.execute(
        context,
      );
    }
    catch (error) {
      return {
        status: "failed",

        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown step execution error.",
      };
    }
  }
}
