import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  DurableSchedulerLeaseRenewalSupervisor,
  type DurableSchedulerLeaseRenewalLifecycle,
  type DurableSchedulerLeaseRenewalSleeper,
} from "../src/recovery/durable_scheduler_lease_renewal_supervisor.js";


class ControlledSleeper
implements DurableSchedulerLeaseRenewalSleeper {

  private resolvers:
    Array<() => void> =
    [];


  public sleep(
    _milliseconds:
      number,

    signal:
      AbortSignal,
  ): Promise<void> {

    if (signal.aborted) {
      return Promise.resolve();
    }


    return new Promise<void>(
      (resolve) => {

        const release =
          () => {

            signal.removeEventListener(
              "abort",
              onAbort,
            );


            resolve();
          };


        const onAbort =
          () => {
            release();
          };


        signal.addEventListener(
          "abort",
          onAbort,
          {
            once:
              true,
          },
        );


        this.resolvers.push(
          release,
        );
      },
    );
  }


  public releaseNext():
    void {

    const release =
      this.resolvers.shift();


    if (release === undefined) {
      throw new Error(
        "No pending sleeper.",
      );
    }


    release();
  }


  public get pending():
    number {

    return this.resolvers.length;
  }
}


async function flush():
Promise<void> {

  await Promise.resolve();
  await Promise.resolve();
}


function lifecycleFixture(
  input: {
    readonly renew:
      DurableSchedulerLeaseRenewalLifecycle["renew"];

    readonly stop?:
      DurableSchedulerLeaseRenewalLifecycle["stop"];

    readonly state?:
      DurableSchedulerLeaseRenewalLifecycle["state"];
  },
) {

  const stop =
    input.stop ??
    vi.fn<
      DurableSchedulerLeaseRenewalLifecycle["stop"]
    >(
      async () => ({
        kind:
          "stopped",

        release:
          null,
      }),
    );


  const lifecycle:
    DurableSchedulerLeaseRenewalLifecycle =
    {
      state:
        input.state ??
        "running",

      renew:
        input.renew,

      stop,
    };


  const sleeper =
    new ControlledSleeper();


  const supervisor =
    new DurableSchedulerLeaseRenewalSupervisor(
      lifecycle,
      {
        renewalIntervalMs:
          1_000,
      },
      sleeper,
    );


  return {
    supervisor,
    lifecycle,
    sleeper,
    stop,
  };
}


describe(
  "DurableSchedulerLeaseRenewalSupervisor",
  () => {

    it(
      "requires the ownership-aware runtime to be running",
      () => {

        const test =
          lifecycleFixture({
            state:
              "idle",

            renew:
              vi.fn<
                DurableSchedulerLeaseRenewalLifecycle["renew"]
              >(
                async () => ({
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
                }),
              ),
          });


        expect(
          () =>
            test.supervisor.start(),
        ).toThrow(
          "requires a running",
        );
      },
    );


    it(
      "renews after each controlled interval and continues supervising",
      async () => {

        const renew =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["renew"]
          >(
            async () => ({
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
            }),
          );


        const test =
          lifecycleFixture({
            renew,
          });


        const running =
          test.supervisor.start();


        expect(test.sleeper.pending)
          .toBe(1);


        test.sleeper.releaseNext();

        await flush();


        expect(renew)
          .toHaveBeenCalledTimes(1);


        expect(test.sleeper.pending)
          .toBe(1);


        const stop =
          await test.supervisor.stop();


        expect(stop.kind)
          .toBe("stopped");


        await expect(running)
          .resolves.toEqual({
            kind:
              "stopped",
          });
      },
    );


    it(
      "stops supervision when renewal loses authority",
      async () => {

        const renew =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["renew"]
          >(
            async () => ({
              kind:
                "lost_authority",

              result:
                {
                  kind:
                    "contended",

                  observedOwnership:
                    null,
                },
            }),
          );


        const test =
          lifecycleFixture({
            renew,
          });


        const running =
          test.supervisor.start();


        test.sleeper.releaseNext();

        await expect(running)
          .resolves.toMatchObject({
            kind:
              "lost_authority",

            renewal:
              {
                kind:
                  "lost_authority",
              },
          });


        expect(renew)
          .toHaveBeenCalledTimes(1);
      },
    );


    it(
      "stops the runtime fail closed when renewal throws",
      async () => {

        const error =
          new Error(
            "renewal-storage-failure",
          );


        const renew =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["renew"]
          >(
            async () => {
              throw error;
            },
          );


        const stop =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["stop"]
          >(
            async () => ({
              kind:
                "stopped",

              release:
                null,
            }),
          );


        const test =
          lifecycleFixture({
            renew,
            stop,
          });


        const running =
          test.supervisor.start();


        test.sleeper.releaseNext();


        const exit =
          await running;


        expect(exit.kind)
          .toBe(
            "renewal_error",
          );


        if (
          exit.kind !==
          "renewal_error"
        ) {
          throw new Error(
            "Expected renewal_error.",
          );
        }


        expect(exit.error)
          .toBe(error);


        expect(stop)
          .toHaveBeenCalledTimes(1);
      },
    );


    it(
      "external stop aborts a pending renewal wait and stops lifecycle once",
      async () => {

        const renew =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["renew"]
          >(
            async () => ({
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
            }),
          );


        const stop =
          vi.fn<
            DurableSchedulerLeaseRenewalLifecycle["stop"]
          >(
            async () => ({
              kind:
                "stopped",

              release:
                {
                  kind:
                    "released",
                },
            }),
          );


        const test =
          lifecycleFixture({
            renew,
            stop,
          });


        const running =
          test.supervisor.start();


        expect(test.sleeper.pending)
          .toBe(1);


        const stopped =
          await test.supervisor.stop();


        expect(stopped)
          .toEqual({
            kind:
              "stopped",

            release:
              {
                kind:
                  "released",
              },
          });


        await expect(running)
          .resolves.toEqual({
            kind:
              "stopped",
          });


        expect(renew)
          .not.toHaveBeenCalled();


        expect(stop)
          .toHaveBeenCalledTimes(1);
      },
    );


    it(
      "returns the same supervision promise when start is called twice",
      () => {

        const test =
          lifecycleFixture({
            renew:
              vi.fn<
                DurableSchedulerLeaseRenewalLifecycle["renew"]
              >(
                async () => ({
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
                }),
              ),
          });


        const first =
          test.supervisor.start();

        const second =
          test.supervisor.start();


        expect(second)
          .toBe(first);


        void test.supervisor.stop();
      },
    );
  },
);
