import {
  type AutomationDefinition,
  type AutomationExecution,
  type AutomationStatus,
} from "../domain/automation.js";

import {
  AutomationDefinitionRepository,
} from "../repositories/automation_definition_repository.js";

import {
  AutomationExecutionRepository,
} from "../repositories/automation_execution_repository.js";

export class AutomationService {
  constructor(
    private readonly definitions =
      new AutomationDefinitionRepository(),

    private readonly executions =
      new AutomationExecutionRepository(),
  ) {}

  async createAutomation(
    name: string,
    description?: string | null,
  ): Promise<AutomationDefinition> {
    const normalizedName =
      name.trim();

    if (!normalizedName) {
      throw new Error(
        "Automation name is required.",
      );
    }

    return this.definitions.create({
      name: normalizedName,
      description:
        description?.trim() || null,
    });
  }

  async getAutomation(
    publicId: string,
  ): Promise<AutomationDefinition> {
    const automation =
      await this.definitions
        .getByPublicId(publicId);

    if (!automation) {
      throw new Error(
        "Automation not found.",
      );
    }

    return automation;
  }

  async changeAutomationStatus(
    publicId: string,
    nextStatus: AutomationStatus,
    rowVersion: Buffer,
  ): Promise<AutomationDefinition> {
    const current =
      await this.definitions
        .getByPublicId(publicId);

    if (!current) {
      throw new Error(
        "Automation not found.",
      );
    }

    const allowed =
      this.isAutomationTransitionAllowed(
        current.status,
        nextStatus,
      );

    if (!allowed) {
      throw new Error(
        `Invalid automation status transition: ${current.status} -> ${nextStatus}.`,
      );
    }

    const updated =
      await this.definitions.updateStatus(
        publicId,
        nextStatus,
        rowVersion,
      );

    if (!updated) {
      throw new Error(
        "Automation update conflict.",
      );
    }

    return updated;
  }

  async startExecution(
    automationPublicId: string,
    input?: unknown,
  ): Promise<AutomationExecution> {
    const automation =
      await this.definitions
        .getByPublicId(
          automationPublicId,
        );

    if (!automation) {
      throw new Error(
        "Automation not found.",
      );
    }

    if (automation.status !== "active") {
      throw new Error(
        "Only active automations can be executed.",
      );
    }

    const created =
      await this.executions.create({
        automationId:
          automation.automationId,

        inputJson:
          input === undefined
            ? null
            : JSON.stringify(input),
      });

    const running =
      await this.executions
        .transitionStatus(
          created.publicId,
          "pending",
          "running",
          created.rowVersion,
        );

    if (!running) {
      throw new Error(
        "Execution start conflict.",
      );
    }

    return running;
  }

  async completeExecution(
    execution: AutomationExecution,
    output?: unknown,
  ): Promise<AutomationExecution> {
    if (execution.status !== "running") {
      throw new Error(
        "Only running executions can succeed.",
      );
    }

    const completed =
      await this.executions
        .transitionStatus(
          execution.publicId,
          "running",
          "succeeded",
          execution.rowVersion,
          output === undefined
            ? null
            : JSON.stringify(output),
        );

    if (!completed) {
      throw new Error(
        "Execution completion conflict.",
      );
    }

    return completed;
  }

  async failExecution(
    execution: AutomationExecution,
    errorMessage: string,
  ): Promise<AutomationExecution> {
    if (execution.status !== "running") {
      throw new Error(
        "Only running executions can fail.",
      );
    }

    const failed =
      await this.executions
        .transitionStatus(
          execution.publicId,
          "running",
          "failed",
          execution.rowVersion,
          null,
          errorMessage,
        );

    if (!failed) {
      throw new Error(
        "Execution failure conflict.",
      );
    }

    return failed;
  }

  private isAutomationTransitionAllowed(
    current: AutomationStatus,
    next: AutomationStatus,
  ): boolean {
    const transitions:
      Record<
        AutomationStatus,
        readonly AutomationStatus[]
      > = {
        draft: [
          "active",
          "archived",
        ],

        active: [
          "paused",
          "archived",
        ],

        paused: [
          "active",
          "archived",
        ],

        archived: [],
      };

    return transitions[
      current
    ].includes(next);
  }
}
