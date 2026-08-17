import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
  ProductionDurableRecoveryCoordinationAdapter,
  type ProductionDurableRecoveryGenerationObserver,
  type ProductionDurableRecoveryInner,
} from "../src/recovery/production_durable_recovery_coordination_adapter.js";


type RestartResult = {
  readonly disposition:
    "executed" |
    "rejected";

  readonly previousGeneration:
    number;

  readonly currentGeneration:
    number;

  readonly marker?:
    string;
};


class FakeInner
implements ProductionDurableRecoveryInner<RestartResult> {
  public restartCalls =
    0;

  public constructor(
    public durableGeneration:
      number | null,

    private readonly result:
      RestartResult |
      Error,
  ) {}


  public async restart():
    Promise<RestartResult> {

    this.restartCalls +=
      1;

    if (this.result instanceof Error) {
      throw this.result;
    }

    if (
      this.result.currentGeneration >
      this.result.previousGeneration
    ) {
      this.durableGeneration =
        this.result.currentGeneration;
    }

    return this.result;
  }
}


class FakeObserver
implements ProductionDurableRecoveryGenerationObserver {
  public loadCalls =
    0;


  public constructor(
    private readonly generation:
      number,

    private readonly error:
      Error | null =
        null,
  ) {}


  public async load() {

    this.loadCalls +=
      1;

    if (this.error) {
      throw this.error;
    }

    return {
      generation:
        this.generation,

      rowVersion:
        Uint8Array.from([
          1,
          2,
          3,
        ]),
    };
  }
}


describe(
  "ProductionDurableRecoveryCoordinationAdapter",
  () => {

    it(
      "wraps a successful frozen A10 restart as restarted",
      async () => {

        const result = {
          disposition:
            "executed" as const,

          previousGeneration:
            7,

          currentGeneration:
            8,

          marker:
            "preserved",
        };

        const inner =
          new FakeInner(
            7,
            result,
          );

        const observer =
          new FakeObserver(
            8,
          );

        const coordinated =
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          );

        await expect(
          coordinated.restart(),
        )
          .resolves
          .toEqual({
            disposition:
              "restarted",

            previousGeneration:
              7,

            currentGeneration:
              8,

            result,
          });

        expect(inner.restartCalls)
          .toBe(
            1,
          );

        expect(observer.loadCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "preserves a frozen rejected restart unchanged",
      async () => {

        const rejected = {
          disposition:
            "rejected" as const,

          previousGeneration:
            7,

          currentGeneration:
            7,

          marker:
            "frozen",
        };

        const inner =
          new FakeInner(
            7,
            rejected,
          );

        const observer =
          new FakeObserver(
            7,
          );

        const coordinated =
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          );

        const result =
          await coordinated.restart();

        expect(result)
          .toBe(
            rejected,
          );

        expect(observer.loadCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "translates stale A10 arbitration into superseded only after a later durable re-read",
      async () => {

        const stale =
          new Error(
            DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
          );

        const inner =
          new FakeInner(
            7,
            stale,
          );

        const observer =
          new FakeObserver(
            8,
          );

        const coordinated =
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          );

        await expect(
          coordinated.restart(),
        )
          .resolves
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              8,
          });

        expect(inner.restartCalls)
          .toBe(
            1,
          );

        expect(observer.loadCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "allows stale reconciliation to observe multiple later generations",
      async () => {

        const inner =
          new FakeInner(
            4,
            new Error(
              DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
            ),
          );

        const observer =
          new FakeObserver(
            9,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .resolves
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              4,

            observedGeneration:
              9,
          });
      },
    );


    it(
      "rethrows the original stale error when re-read remains at the attempted generation",
      async () => {

        const stale =
          new Error(
            DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
          );

        const inner =
          new FakeInner(
            7,
            stale,
          );

        const observer =
          new FakeObserver(
            7,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toBe(
            stale,
          );

        expect(observer.loadCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "rethrows the original stale error when re-read is behind the attempted generation",
      async () => {

        const stale =
          new Error(
            DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
          );

        const inner =
          new FakeInner(
            7,
            stale,
          );

        const observer =
          new FakeObserver(
            6,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toBe(
            stale,
          );
      },
    );


    it(
      "does not reinterpret unrelated A10 failures",
      async () => {

        const expected =
          new Error(
            "synthetic production failure",
          );

        const inner =
          new FakeInner(
            7,
            expected,
          );

        const observer =
          new FakeObserver(
            8,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toBe(
            expected,
          );

        expect(observer.loadCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "propagates reconciliation read failures unchanged",
      async () => {

        const readFailure =
          new Error(
            "synthetic durable read failure",
          );

        const inner =
          new FakeInner(
            7,
            new Error(
              DURABLE_RECOVERY_STALE_ALLOCATION_ERROR,
            ),
          );

        const observer =
          new FakeObserver(
            8,
            readFailure,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toBe(
            readFailure,
          );
      },
    );


    it(
      "requires the frozen A10 supervisor to be durably initialized",
      async () => {

        const inner =
          new FakeInner(
            null,
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const observer =
          new FakeObserver(
            1,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Production durable recovery coordination requires initialized durable generation.",
          );

        expect(inner.restartCalls)
          .toBe(
            0,
          );

        expect(observer.loadCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "rejects malformed successful provenance through the A11 contract",
      async () => {

        const inner =
          new FakeInner(
            7,
            {
              disposition:
                "executed",

              previousGeneration:
                7,

              currentGeneration:
                9,
            },
          );

        const observer =
          new FakeObserver(
            9,
          );

        await expect(
          new ProductionDurableRecoveryCoordinationAdapter(
            inner,
            observer,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Scheduler generation transition must advance exactly once.",
          );
      },
    );
  },
);
