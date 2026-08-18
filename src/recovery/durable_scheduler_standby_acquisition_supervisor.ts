import {
  type AcquireOrRenewSchedulerOwnershipResult,
} from "./durable_scheduler_ownership_engine.js";


export type DurableSchedulerStandbyAcquisitionLifecycle = {
  readonly state:
    "standby" |
    "active";

  acquire():
    Promise<AcquireOrRenewSchedulerOwnershipResult>;

  activate(
    ownership:
      Extract<
        AcquireOrRenewSchedulerOwnershipResult,
        {
          readonly kind:
            "acquired";
        }
      >["ownership"],
  ): Promise<void>;
};


export type DurableSchedulerStandbyAcquisitionSleeper = {
  sleep(
    milliseconds:
      number,

    signal:
      AbortSignal,
  ): Promise<void>;
};


export class AbortableSchedulerStandbyAcquisitionSleeper
implements DurableSchedulerStandbyAcquisitionSleeper {

  public sleep(
    milliseconds:
      number,

    signal:
      AbortSignal,
  ): Promise<void> {

    return new Promise<void>(
      (
        resolve,
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


export type DurableSchedulerStandbyAcquisitionSupervisorOptions = {
  readonly acquisitionIntervalMs:
    number;
};


export type DurableSchedulerStandbyAcquisitionSupervisorExit =
  | {
      readonly kind:
        "activated";

      readonly acquisition:
        Extract<
          AcquireOrRenewSchedulerOwnershipResult,
          {
            readonly kind:
              "acquired";
          }
        >;
    }
  | {
      readonly kind:
        "stopped";
    }
  | {
      readonly kind:
        "acquisition_error";

      readonly error:
        unknown;
    };


function assertPositiveSafeInteger(
  value:
    number,

  label:
    string,
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


export class DurableSchedulerStandbyAcquisitionSupervisor {

  private readonly abortController =
    new AbortController();


  private runPromise:
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> |
    null =
    null;


  public constructor(
    private readonly lifecycle:
      DurableSchedulerStandbyAcquisitionLifecycle,

    private readonly options:
      DurableSchedulerStandbyAcquisitionSupervisorOptions,

    private readonly sleeper:
      DurableSchedulerStandbyAcquisitionSleeper =
      new AbortableSchedulerStandbyAcquisitionSleeper(),
  ) {

    assertPositiveSafeInteger(
      options.acquisitionIntervalMs,
      "Scheduler standby acquisition interval",
    );
  }


  public start():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    if (this.runPromise !== null) {
      return this.runPromise;
    }


    if (
      this.lifecycle.state !==
      "standby"
    ) {
      throw new Error(
        "Standby acquisition supervision requires a standby scheduler.",
      );
    }


    this.runPromise =
      this.run();


    return this.runPromise;
  }


  private async run():
    Promise<DurableSchedulerStandbyAcquisitionSupervisorExit> {

    while (
      !this.abortController.signal.aborted
    ) {

      await this.sleeper.sleep(
        this.options.acquisitionIntervalMs,
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

        const acquisition =
          await this.lifecycle.acquire();


        if (
          acquisition.kind ===
          "contended"
        ) {
          continue;
        }


        /*
         * A standby supervisor is never allowed to convert a renewal
         * into activation authority.
         *
         * A "renewed" result proves that the supplied owner already
         * possessed authority.  That is inconsistent with standby
         * acquisition and therefore fails closed.
         */
        if (
          acquisition.kind ===
          "renewed"
        ) {
          throw new Error(
            "Standby acquisition unexpectedly renewed existing scheduler authority.",
          );
        }

        if (
          acquisition.kind ===
          "generation_mismatch"
        ) {
          throw new Error(
            `Standby acquisition generation mismatch: observed generation ${acquisition.observedGeneration}.`,
          );
        }


        /*
         * Durable acquisition is the sole authority-producing event.
         * Activation occurs only after the ownership engine returns
         * an explicit acquired result.
         */
        await this.lifecycle.activate(
          acquisition.ownership,
        );


        this.abortController.abort();


        return Object.freeze({
          kind:
            "activated",

          acquisition,
        });
      }
      catch (error) {

        this.abortController.abort();


        const exit:
          DurableSchedulerStandbyAcquisitionSupervisorExit =
          {
            kind:
              "acquisition_error",

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
    Promise<void> {

    this.abortController.abort();


    if (this.runPromise !== null) {
      await this.runPromise;
    }
  }
}
