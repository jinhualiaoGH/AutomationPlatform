import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ProductionSchedulerGenerationFactory,
} from "../src/recovery/production_scheduler_generation_factory.js";

import {
  SchedulerRuntime,
} from "../src/scheduling/scheduler_runtime.js";

import {
  TriggerDispatcher,
} from "../src/scheduling/trigger_dispatcher.js";

describe(
  "ProductionSchedulerGenerationFactory",
  () => {
    it(
      "creates an idle concrete SchedulerRuntime for a valid generation",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const factory =
          new ProductionSchedulerGenerationFactory(
            dispatcher,
          );

        const runtime =
          factory.create(
            1,
          );

        expect(runtime)
          .toBeInstanceOf(
            SchedulerRuntime,
          );

        expect(runtime.state)
          .toBe(
            "idle",
          );

        expect(runtime.isRunning)
          .toBe(false);
      },
    );

    it(
      "creates a fresh SchedulerRuntime instance for every generation",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const factory =
          new ProductionSchedulerGenerationFactory(
            dispatcher,
          );

        const first =
          factory.create(
            1,
          );

        const second =
          factory.create(
            2,
          );

        const third =
          factory.create(
            3,
          );

        expect(second)
          .not.toBe(
            first,
          );

        expect(third)
          .not.toBe(
            second,
          );

        expect(third)
          .not.toBe(
            first,
          );

        expect(first.state)
          .toBe(
            "idle",
          );

        expect(second.state)
          .toBe(
            "idle",
          );

        expect(third.state)
          .toBe(
            "idle",
          );
      },
    );

    it(
      "does not start a runtime during construction",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const factory =
          new ProductionSchedulerGenerationFactory(
            dispatcher,
          );

        const runtime =
          factory.create(
            7,
          );

        expect(runtime.state)
          .toBe(
            "idle",
          );

        expect(runtime.isRunning)
          .toBe(false);
      },
    );

    it(
      "accepts non-consecutive valid generations because monotonic ordering belongs to the supervisor",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const factory =
          new ProductionSchedulerGenerationFactory(
            dispatcher,
          );

        const first =
          factory.create(
            1,
          );

        const later =
          factory.create(
            42,
          );

        expect(first.state)
          .toBe(
            "idle",
          );

        expect(later.state)
          .toBe(
            "idle",
          );

        expect(later)
          .not.toBe(
            first,
          );
      },
    );

    it(
      "rejects invalid generations before runtime creation",
      () => {
        const dispatcher =
          new TriggerDispatcher();

        const factory =
          new ProductionSchedulerGenerationFactory(
            dispatcher,
          );

        for (
          const generation of [
            0,
            -1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.MAX_SAFE_INTEGER + 1,
          ]
        ) {
          expect(
            () =>
              factory.create(
                generation,
              ),
          ).toThrow(
            "generation must be a positive safe integer.",
          );
        }
      },
    );
  },
);
