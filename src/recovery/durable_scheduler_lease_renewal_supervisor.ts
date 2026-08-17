import {
  type OwnershipAwareSchedulerRuntimeRenewResult,
  type OwnershipAwareSchedulerRuntimeStopResult,
} from "./ownership_aware_scheduler_runtime_lifecycle.js";


export type DurableSchedulerLeaseRenewalLifecycle = {
  readonly state:
    "idle" |
    "running" |
    "stopped" |
    "lost_authority";

  renew():
    Promise<OwnershipAwareSchedulerRuntimeRenewResult>;

  stop():
    Promise<OwnershipAwareSchedulerRuntimeStopResult>;
};


export type DurableSchedulerLeaseRenewalSleeper = {
  sleep(
    milliseconds:
      number,

    signal:
      AbortSignal,
  ): Promise<void>;
};


export class AbortableSchedulerLeaseRenewalSleeper
implements DurableSchedulerLeaseRenewalSleeper {

  public sleep(
    milliseconds:
      number,

    signal:
      AbortSignal,
  ): Promise<void> {

    return new Promise<void>(
      (
        resolve,
        reject,
      ) => {

        if (signal.aborted) {
          resolve();
          return;
        }


        const timer =
          setTimeout(
            () => {

              signal.removeEventListener(
                "abort",
                onAbort,
              );


              resolve();
            },
            milliseconds,
          );


        const onAbort =
          () => {

            clearTimeout(
              timer,
            );


            resolve();
          };


        signal.addEventListener(
          "abort",
          onAbort,
          {
            once:
              true,
          },
        );
      },
    );
  }
}


export type DurableSchedulerLeaseRenewalSupervisorOptions = {
  readonly renewalIntervalMs:
    number;
};


export type DurableSchedulerLeaseRenewalSupervisorExit =
  | {
      readonly kind:
        "stopped";
    }
  | {
      readonly kind:
        "lost_authority";

      readonly renewal:
        Extract<
          OwnershipAwareSchedulerRuntimeRenewResult,
          {
            readonly kind:
              "lost_authority";
          }
        >;
    }
  | {
      readonly kind:
        "renewal_error";

      readonly error:
        unknown;
    };


function assertPositiveSafeInteger(
  value: number,
  label: string,
): void {

  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${label} must be a positive safe integer.`,
    );
  }
}


export class DurableSchedulerLeaseRenewalSupervisor {

  private readonly abortController =
    new AbortController();


  private runPromise:
    Promise<DurableSchedulerLeaseRenewalSupervisorExit> |
    null =
    null;


  public constructor(
    private readonly lifecycle:
      DurableSchedulerLeaseRenewalLifecycle,

    private readonly options:
      DurableSchedulerLeaseRenewalSupervisorOptions,

    private readonly sleeper:
      DurableSchedulerLeaseRenewalSleeper =
      new AbortableSchedulerLeaseRenewalSleeper(),
  ) {

    assertPositiveSafeInteger(
      options.renewalIntervalMs,
      "Scheduler lease renewal interval",
    );
  }


  public start():
    Promise<DurableSchedulerLeaseRenewalSupervisorExit> {

    if (this.runPromise !== null) {
      return this.runPromise;
    }


    if (
      this.lifecycle.state !==
      "running"
    ) {
      throw new Error(
        "Lease renewal supervision requires a running ownership-aware runtime.",
      );
    }


    this.runPromise =
      this.run();


    return this.runPromise;
  }


  private async run():
    Promise<DurableSchedulerLeaseRenewalSupervisorExit> {

    while (
      !this.abortController.signal.aborted
    ) {

      await this.sleeper.sleep(
        this.options.renewalIntervalMs,
        this.abortController.signal,
      );


      if (
        this.abortController.signal.aborted
      ) {
        return Object.freeze({
          kind:
            "stopped",
        });
      }


      try {

        const renewal =
          await this.lifecycle.renew();


        if (
          renewal.kind ===
          "lost_authority"
        ) {

          this.abortController.abort();


          return Object.freeze({
            kind:
              "lost_authority",

            renewal,
          });
        }
      }
      catch (error) {

        /*
         * Unknown renewal errors are treated as authority
         * uncertainty. Stop the local runtime before reporting
         * the renewal failure.
         */
        try {
          await this.lifecycle.stop();
        }
        finally {
          this.abortController.abort();
        }


        const exit:
          DurableSchedulerLeaseRenewalSupervisorExit =
          {
            kind:
              "renewal_error",

            error,
          };


        return Object.freeze(
          exit,
        );
      }
    }


    return Object.freeze({
      kind:
        "stopped",
    });
  }


  public async stop():
    Promise<OwnershipAwareSchedulerRuntimeStopResult> {

    this.abortController.abort();


    const result =
      await this.lifecycle.stop();


    if (this.runPromise !== null) {
      await this.runPromise;
    }


    return result;
  }
}
