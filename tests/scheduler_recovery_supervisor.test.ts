import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerRecoverySupervisor,
} from "../src/recovery/scheduler_recovery_supervisor.js";

import type {
  SchedulerGenerationFactory,
  SchedulerGenerationRuntime,
} from "../src/recovery/scheduler_recovery_contract.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";

class FakeRuntime
implements SchedulerGenerationRuntime {
  public startCalls =
    0;

  public stopCalls =
    0;

  public startFailure:
    unknown =
    null;

  public stopFailure:
    unknown =
    null;

  public constructor(
    public state:
      SchedulerRuntimeState =
      "idle",

    private readonly events?:
      string[],

    private readonly generation?:
      number,
  ) {}

  public get isRunning():
    boolean {
    return this.state ===
      "running";
  }

  public start():
    void {
    this.startCalls++;

    this.events?.push(
      `start:${this.generation}`,
    );

    if (
      this.startFailure !==
      null
    ) {
      throw this.startFailure;
    }

    if (
      this.state !==
      "idle"
    ) {
      throw new Error(
        "FakeRuntime can only start from idle.",
      );
    }

    this.state =
      "running";
  }

  public async stop():
    Promise<unknown> {
    this.stopCalls++;

    this.events?.push(
      `stop:${this.generation}`,
    );

    if (
      this.stopFailure !==
      null
    ) {
      throw this.stopFailure;
    }

    if (
      this.state ===
      "running"
    ) {
      this.state =
        "stopped";
    }

    return null;
  }
}

class FakeFactory
implements SchedulerGenerationFactory {
  public readonly generations:
    number[] =
    [];

  public readonly runtimes =
    new Map<
      number,
      FakeRuntime
    >();

  public readonly events:
    string[] =
    [];

  public createFailureAt:
    number | null =
    null;

  public startFailureAt:
    number | null =
    null;

  public create(
    generation:
      number,
  ): SchedulerGenerationRuntime {
    this.generations.push(
      generation,
    );

    this.events.push(
      `create:${generation}`,
    );

    if (
      this.createFailureAt ===
      generation
    ) {
      throw new Error(
        `factory failure:${generation}`,
      );
    }

    const runtime =
      new FakeRuntime(
        "idle",
        this.events,
        generation,
      );

    if (
      this.startFailureAt ===
      generation
    ) {
      runtime.startFailure =
        new Error(
          `start failure:${generation}`,
        );
    }

    this.runtimes.set(
      generation,
      runtime,
    );

    return runtime;
  }
}

function runtimeFor(
  factory:
    FakeFactory,

  generation:
    number,
): FakeRuntime {
  const runtime =
    factory.runtimes.get(
      generation,
    );

  if (!runtime) {
    throw new Error(
      `Missing fake runtime generation ${generation}.`,
    );
  }

  return runtime;
}

describe(
  "SchedulerRecoverySupervisor",
  () => {
    it(
      "creates generation one without starting it",
      () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        expect(factory.generations)
          .toEqual([
            1,
          ]);

        expect(supervisor.generation)
          .toBe(1);

        expect(supervisor.state)
          .toBe(
            "idle",
          );

        expect(supervisor.isRunning)
          .toBe(false);

        expect(
          runtimeFor(
            factory,
            1,
          ).startCalls,
        ).toBe(0);
      },
    );

    it(
      "delegates initial lifecycle start and stop to generation one",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        expect(supervisor.state)
          .toBe(
            "running",
          );

        expect(supervisor.isRunning)
          .toBe(true);

        await supervisor.stop();

        expect(supervisor.state)
          .toBe(
            "stopped",
          );

        expect(
          runtimeFor(
            factory,
            1,
          ).startCalls,
        ).toBe(1);

        expect(
          runtimeFor(
            factory,
            1,
          ).stopCalls,
        ).toBe(1);
      },
    );

    it(
      "rejects restart while the initial generation is still idle",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        const result =
          await supervisor.restart();

        expect(result)
          .toEqual({
            command:
              "restart",

            disposition:
              "rejected",

            previousGeneration:
              1,

            currentGeneration:
              1,

            previousState:
              "idle",

            currentState:
              "idle",

            changed:
              false,

            reason:
              "An idle scheduler generation has not entered operational service.",
          });

        expect(factory.generations)
          .toEqual([
            1,
          ]);
      },
    );

    it(
      "retires a running generation before constructing and starting its replacement",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        factory.events.length =
          0;

        const result =
          await supervisor.restart();

        expect(factory.events)
          .toEqual([
            "stop:1",
            "create:2",
            "start:2",
          ]);

        expect(result)
          .toEqual({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              1,

            currentGeneration:
              2,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });

        expect(supervisor.generation)
          .toBe(2);

        expect(supervisor.state)
          .toBe(
            "running",
          );

        expect(
          runtimeFor(
            factory,
            1,
          ).state,
        ).toBe(
          "stopped",
        );
      },
    );

    it(
      "replaces a stopped generation without stopping it again",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();
        await supervisor.stop();

        factory.events.length =
          0;

        const result =
          await supervisor.restart();

        expect(factory.events)
          .toEqual([
            "create:2",
            "start:2",
          ]);

        expect(result.disposition)
          .toBe(
            "executed",
          );

        expect(result.previousState)
          .toBe(
            "stopped",
          );

        expect(result.currentState)
          .toBe(
            "running",
          );

        expect(supervisor.generation)
          .toBe(2);
      },
    );

    it(
      "replaces a failed generation without invoking stop again",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        const first =
          runtimeFor(
            factory,
            1,
          );

        first.state =
          "failed";

        factory.events.length =
          0;

        const result =
          await supervisor.restart();

        expect(factory.events)
          .toEqual([
            "create:2",
            "start:2",
          ]);

        expect(result.previousState)
          .toBe(
            "failed",
          );

        expect(result.currentGeneration)
          .toBe(2);

        expect(supervisor.state)
          .toBe(
            "running",
          );

        expect(first.stopCalls)
          .toBe(0);
      },
    );

    it(
      "does not advance generation when retirement of a running generation fails",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        const first =
          runtimeFor(
            factory,
            1,
          );

        first.stopFailure =
          new Error(
            "retirement failure",
          );

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "retirement failure",
        );

        expect(supervisor.generation)
          .toBe(1);

        expect(factory.generations)
          .toEqual([
            1,
          ]);

        expect(
          factory.runtimes.has(
            2,
          ),
        ).toBe(false);
      },
    );

    it(
      "does not publish a new generation when factory creation fails",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        factory.createFailureAt =
          2;

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "factory failure:2",
        );

        expect(supervisor.generation)
          .toBe(1);

        expect(supervisor.state)
          .toBe(
            "stopped",
          );

        expect(factory.generations)
          .toEqual([
            1,
            2,
          ]);
      },
    );

    it(
      "does not publish a replacement generation when replacement start fails",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        factory.startFailureAt =
          2;

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "start failure:2",
        );

        expect(supervisor.generation)
          .toBe(1);

        expect(supervisor.state)
          .toBe(
            "stopped",
          );

        const second =
          runtimeFor(
            factory,
            2,
          );

        expect(second.startCalls)
          .toBe(1);

        expect(second.state)
          .toBe(
            "idle",
          );
      },
    );

    it(
      "advances monotonically across successful restart generations",
      async () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        const firstRestart =
          await supervisor.restart();

        expect(
          firstRestart.currentGeneration,
        ).toBe(2);

        const secondRestart =
          await supervisor.restart();

        expect(
          secondRestart.previousGeneration,
        ).toBe(2);

        expect(
          secondRestart.currentGeneration,
        ).toBe(3);

        expect(supervisor.generation)
          .toBe(3);

        expect(factory.generations)
          .toEqual([
            1,
            2,
            3,
          ]);

        expect(
          runtimeFor(
            factory,
            1,
          ).startCalls,
        ).toBe(1);

        expect(
          runtimeFor(
            factory,
            2,
          ).startCalls,
        ).toBe(1);

        expect(
          runtimeFor(
            factory,
            3,
          ).startCalls,
        ).toBe(1);
      },
    );

    it(
      "reports a defensive supervisor snapshot",
      () => {
        const factory =
          new FakeFactory();

        const supervisor =
          new SchedulerRecoverySupervisor(
            factory,
          );

        supervisor.start();

        expect(
          supervisor.snapshot(),
        ).toEqual({
          generation:
            1,

          state:
            "running",

          isRunning:
            true,
        });
      },
    );
  },
);
