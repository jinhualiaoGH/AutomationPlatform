export type ApplicationScheduler = {
  start(): void;

  stop(): Promise<unknown>;
};

export type ApplicationServer = {
  close(): Promise<unknown>;
};

export type DatabaseCloser =
  () => Promise<void>;

export type ApplicationLifecycleState =
  | "idle"
  | "running"
  | "stopping"
  | "stopped";

export class ApplicationLifecycle {
  private stateValue:
    ApplicationLifecycleState =
    "idle";

  private stopPromise:
    Promise<void> | null =
    null;

  public constructor(
    private readonly scheduler:
      ApplicationScheduler,

    private readonly server:
      ApplicationServer,

    private readonly closeDatabase:
      DatabaseCloser,
  ) {}

  public get state():
    ApplicationLifecycleState {
    return this.stateValue;
  }

  public start(): void {
    if (
      this.stateValue !==
      "idle"
    ) {
      throw new Error(
        "ApplicationLifecycle can only be started once.",
      );
    }

    this.scheduler.start();

    this.stateValue =
      "running";
  }

  public stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise =
      this.stopCore();

    return this.stopPromise;
  }

  private async stopCore():
    Promise<void> {
    this.stateValue =
      "stopping";

    const failures:
      unknown[] = [];

    try {
      await this.scheduler.stop();
    }
    catch (error) {
      failures.push(error);
    }

    try {
      await this.server.close();
    }
    catch (error) {
      failures.push(error);
    }

    try {
      await this.closeDatabase();
    }
    catch (error) {
      failures.push(error);
    }

    this.stateValue =
      "stopped";

    if (failures.length === 1) {
      throw failures[0];
    }

    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        "Application shutdown encountered multiple failures.",
      );
    }
  }
}
