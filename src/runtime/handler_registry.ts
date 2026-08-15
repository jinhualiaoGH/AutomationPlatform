import type {
  StepHandler,
} from "./step_handler.js";

export class DuplicateStepHandlerError
  extends Error {
  public constructor(
    stepType: string,
  ) {
    super(
      `A handler is already registered for step type "${stepType}".`,
    );

    this.name =
      "DuplicateStepHandlerError";
  }
}

export class UnknownStepHandlerError
  extends Error {
  public constructor(
    stepType: string,
  ) {
    super(
      `No handler is registered for step type "${stepType}".`,
    );

    this.name =
      "UnknownStepHandlerError";
  }
}

export class HandlerRegistry {
  private readonly handlers =
    new Map<string, StepHandler>();

  public register(
    handler: StepHandler,
  ): void {
    const stepType =
      handler.stepType;

    if (this.handlers.has(stepType)) {
      throw new DuplicateStepHandlerError(
        stepType,
      );
    }

    this.handlers.set(
      stepType,
      handler,
    );
  }

  public has(
    stepType: string,
  ): boolean {
    return this.handlers.has(stepType);
  }

  public get(
    stepType: string,
  ): StepHandler {
    const handler =
      this.handlers.get(stepType);

    if (!handler) {
      throw new UnknownStepHandlerError(
        stepType,
      );
    }

    return handler;
  }

  public registeredStepTypes():
    readonly string[] {
    return Array.from(
      this.handlers.keys(),
    ).sort();
  }
}
