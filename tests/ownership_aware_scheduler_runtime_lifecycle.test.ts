import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  OwnershipAwareSchedulerRuntimeLifecycle,
  type SchedulerOwnershipLifecycleEngine,
} from "../src/recovery/ownership_aware_scheduler_runtime_lifecycle.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";


function ownership(
  fencingToken:
    number,
) {

  return createDurableSchedulerOwnership({
    generation:
      7,

    fencingToken,

    ownerId:
      "process-a",

    leaseExpiresAtEpochMs:
      20_000,
  });
}


function runtimeFixture() {

  return {
    start:
      vi.fn(
        () => {},
      ),

    stop:
      vi.fn(
        async () => {},
      ),
  };
}


function lifecycle(
  input: {
    readonly acquireOrRenew:
      SchedulerOwnershipLifecycleEngine["acquireOrRenew"];

    readonly release?:
      SchedulerOwnershipLifecycleEngine["release"];
  },
) {

  const runtime =
    runtimeFixture();


  const release =
    input.release ??
    vi.fn(
      async () => ({
        kind:
          "released",
      } as const),
    );


  const engine:
    SchedulerOwnershipLifecycleEngine =
    {
      acquireOrRenew:
        input.acquireOrRenew,

      release,
    };


  const value =
    new OwnershipAwareSchedulerRuntimeLifecycle(
      runtime,
      engine,
      {
        generation:
          7,

        ownerId:
          "process-a",

        leaseDurationMs:
          5_000,
      },
      {
        nowEpochMs:
          () =>
            10_000,
      },
    );


  return {
    value,
    runtime,
    release,
  };
}


describe(
  "OwnershipAwareSchedulerRuntimeLifecycle",
  () => {

    it(
      "acquires durable authority before starting the runtime",
      async () => {

        const order:
          string[] =
          [];


        const runtime =
          {
            start:
              vi.fn(
                () => {
                  order.push(
                    "runtime-start",
                  );
                },
              ),

            stop:
              vi.fn(
                async () => {},
              ),
          };


        const engine:
          SchedulerOwnershipLifecycleEngine =
          {
            acquireOrRenew:
              vi.fn<SchedulerOwnershipLifecycleEngine["acquireOrRenew"]>(
                async () => {

                  order.push(
                    "acquire",
                  );


                  return {
                    kind:
                      "acquired",

                    ownership:
                      ownership(
                        11,
                      ),
                  };
                },
              ),

            release:
              vi.fn<SchedulerOwnershipLifecycleEngine["release"]>(
                async () => ({
                  kind:
                    "released",
                }),
              ),
          };


        const target =
          new OwnershipAwareSchedulerRuntimeLifecycle(
            runtime,
            engine,
            {
              generation:
                7,

              ownerId:
                "process-a",

              leaseDurationMs:
                5_000,
            },
            {
              nowEpochMs:
                () =>
                  10_000,
            },
          );


        const result =
          await target.start();


        expect(result)
          .toEqual({
            kind:
              "started",

            identity:
              {
                generation:
                  7,

                ownerId:
                  "process-a",

                fencingToken:
                  11,
              },
          });


        expect(order)
          .toEqual([
            "acquire",
            "runtime-start",
          ]);


        expect(target.state)
          .toBe(
            "running",
          );


        expect(target.identity)
          .toEqual({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              11,
          });
      },
    );


    it(
      "does not start the runtime when ownership is contended",
      async () => {

        const test =
          lifecycle({
            acquireOrRenew:
              vi.fn<SchedulerOwnershipLifecycleEngine["acquireOrRenew"]>(
                async () => ({
                  kind:
                    "contended",

                  observedOwnership:
                    ownership(
                      19,
                    ),
                }),
              ),
          });


        const result =
          await test.value.start();


        expect(result.kind)
          .toBe(
            "contended",
          );


        expect(test.runtime.start)
          .not.toHaveBeenCalled();


        expect(test.value.state)
          .toBe(
            "idle",
          );
      },
    );


    it(
      "does not start against another durable generation",
      async () => {

        const test =
          lifecycle({
            acquireOrRenew:
              vi.fn<SchedulerOwnershipLifecycleEngine["acquireOrRenew"]>(
                async () => ({
                  kind:
                    "generation_mismatch",

                  observedGeneration:
                    8,
                }),
              ),
          });


        const result =
          await test.value.start();


        expect(result)
          .toMatchObject({
            kind:
              "generation_mismatch",
          });


        expect(test.runtime.start)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "releases acquired authority if runtime start throws",
      async () => {

        const release =
          vi.fn(
            async () => ({
              kind:
                "released",
            } as const),
          );


        const runtime =
          {
            start:
              vi.fn(
                () => {
                  throw new Error(
                    "runtime-start-failure",
                  );
                },
              ),

            stop:
              vi.fn(
                async () => {},
              ),
          };


        const target =
          new OwnershipAwareSchedulerRuntimeLifecycle(
            runtime,
            {
              acquireOrRenew:
                async () => ({
                  kind:
                    "acquired",

                  ownership:
                    ownership(
                      11,
                    ),
                }),

              release,
            },
            {
              generation:
                7,

              ownerId:
                "process-a",

              leaseDurationMs:
                5_000,
            },
            {
              nowEpochMs:
                () =>
                  10_000,
            },
          );


        await expect(
          target.start(),
        ).rejects.toThrow(
          "runtime-start-failure",
        );


        expect(release)
          .toHaveBeenCalledWith({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              11,
          });


        expect(target.identity)
          .toBeNull();
      },
    );


    it(
      "renews ownership and advances the active fencing identity",
      async () => {

        const acquireOrRenew =
          vi.fn()
            .mockResolvedValueOnce({
              kind:
                "acquired",

              ownership:
                ownership(
                  11,
                ),
            })
            .mockResolvedValueOnce({
              kind:
                "renewed",

              ownership:
                ownership(
                  12,
                ),
            });


        const test =
          lifecycle({
            acquireOrRenew,
          });


        await test.value.start();


        const result =
          await test.value.renew();


        expect(result)
          .toEqual({
            kind:
              "renewed",

            identity:
              {
                generation:
                  7,

                ownerId:
                  "process-a",

                fencingToken:
                  12,
              },
          });


        expect(test.value.identity)
          .toEqual({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              12,
          });


        expect(test.runtime.stop)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "fails closed and stops the runtime when renewal loses authority",
      async () => {

        const acquireOrRenew =
          vi.fn()
            .mockResolvedValueOnce({
              kind:
                "acquired",

              ownership:
                ownership(
                  11,
                ),
            })
            .mockResolvedValueOnce({
              kind:
                "contended",

              observedOwnership:
                createDurableSchedulerOwnership({
                  generation:
                    7,

                  fencingToken:
                    12,

                  ownerId:
                    "process-b",

                  leaseExpiresAtEpochMs:
                    20_000,
                }),
            });


        const test =
          lifecycle({
            acquireOrRenew,
          });


        await test.value.start();


        const result =
          await test.value.renew();


        expect(result.kind)
          .toBe(
            "lost_authority",
          );


        expect(test.runtime.stop)
          .toHaveBeenCalledTimes(
            1,
          );


        expect(test.value.state)
          .toBe(
            "lost_authority",
          );


        expect(test.value.identity)
          .toBeNull();
      },
    );


    it(
      "stops runtime before releasing the latest fencing identity",
      async () => {

        const order:
          string[] =
          [];


        const runtime =
          {
            start:
              vi.fn(
                () => {},
              ),

            stop:
              vi.fn(
                async () => {
                  order.push(
                    "runtime-stop",
                  );
                },
              ),
          };


        const release =
          vi.fn(
            async () => {

              order.push(
                "release",
              );


              return {
                kind:
                  "released",
              } as const;
            },
          );


        const acquireOrRenew =
          vi.fn()
            .mockResolvedValueOnce({
              kind:
                "acquired",

              ownership:
                ownership(
                  11,
                ),
            })
            .mockResolvedValueOnce({
              kind:
                "renewed",

              ownership:
                ownership(
                  12,
                ),
            });


        const target =
          new OwnershipAwareSchedulerRuntimeLifecycle(
            runtime,
            {
              acquireOrRenew,
              release,
            },
            {
              generation:
                7,

              ownerId:
                "process-a",

              leaseDurationMs:
                5_000,
            },
            {
              nowEpochMs:
                () =>
                  10_000,
            },
          );


        await target.start();

        await target.renew();

        const result =
          await target.stop();


        expect(order)
          .toEqual([
            "runtime-stop",
            "release",
          ]);


        expect(release)
          .toHaveBeenCalledWith({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              12,
          });


        expect(result)
          .toEqual({
            kind:
              "stopped",

            release:
              {
                kind:
                  "released",
              },
          });


        expect(target.state)
          .toBe(
            "stopped",
          );


        expect(target.identity)
          .toBeNull();
      },
    );


    it(
      "makes repeated stop idempotent without a second release",
      async () => {

        const test =
          lifecycle({
            acquireOrRenew:
              vi.fn<SchedulerOwnershipLifecycleEngine["acquireOrRenew"]>(
                async () => ({
                  kind:
                    "acquired",

                  ownership:
                    ownership(
                      11,
                    ),
                }),
              ),
          });


        await test.value.start();

        await test.value.stop();

        const second =
          await test.value.stop();


        expect(second)
          .toEqual({
            kind:
              "stopped",

            release:
              null,
          });


        expect(test.release)
          .toHaveBeenCalledTimes(
            1,
          );


        expect(test.runtime.stop)
          .toHaveBeenCalledTimes(
            1,
          );
      },
    );
  },
);
