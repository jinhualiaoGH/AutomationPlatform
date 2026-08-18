import {
  describe,
  expect,
  it,
} from "vitest";

import {
  decideSchedulerFailoverTransition,
  type SchedulerFailoverSignal,
} from "../src/recovery/scheduler_failover_contract.js";

describe(
  "scheduler failover contract",
  () => {
    it(
      "activates runtime only after ownership acquisition",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "standby",
            {
              kind: "ownership_acquired",
            },
          ),
        ).toEqual({
          nextMode: "active",
          action: "activate_runtime",
        });
      },
    );

    it(
      "remains standby while ownership is contended",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "standby",
            {
              kind: "ownership_contended",
            },
          ),
        ).toEqual({
          nextMode: "standby",
          action: "remain_standby",
        });
      },
    );

    it(
      "does not treat renewal alone as initial authority",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "standby",
            {
              kind: "ownership_renewed",
            },
          ),
        ).toEqual({
          nextMode: "standby",
          action: "remain_standby",
        });
      },
    );

    it(
      "remains standby when an already-passive runtime reports quiescence",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "standby",
            {
              kind: "runtime_quiesced",
            },
          ),
        ).toEqual({
          nextMode: "standby",
          action: "remain_standby",
        });
      },
    );

    it(
      "remains active while durable ownership is renewed",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "active",
            {
              kind: "ownership_renewed",
            },
          ),
        ).toEqual({
          nextMode: "active",
          action: "remain_active",
        });
      },
    );

    it.each([
      "ownership_contended",
      "ownership_released",
      "ownership_lost",
      "generation_mismatch",
      "runtime_quiesced",
    ] as const)(
      "fails closed from active on %s",
      (kind) => {
        expect(
          decideSchedulerFailoverTransition(
            "active",
            {
              kind,
            },
          ),
        ).toEqual({
          nextMode: "fail_closed",
          action: "deactivate_runtime",
        });
      },
    );

    it.each([
      "ownership_acquired",
      "ownership_contended",
      "ownership_renewed",
      "ownership_released",
      "ownership_lost",
      "generation_mismatch",
    ] as const)(
      "keeps fail-closed state sticky until runtime quiescence on %s",
      (kind) => {
        const signal: SchedulerFailoverSignal = {
          kind,
        };

        expect(
          decideSchedulerFailoverTransition(
            "fail_closed",
            signal,
          ),
        ).toEqual({
          nextMode: "fail_closed",
          action: "remain_fail_closed",
        });
      },
    );

    it(
      "returns fail-closed runtime to standby only after explicit quiescence",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "fail_closed",
            {
              kind: "runtime_quiesced",
            },
          ),
        ).toEqual({
          nextMode: "standby",
          action: "enter_standby",
        });
      },
    );

    it(
      "does not activate runtime on runtime quiescence",
      () => {
        const decision =
          decideSchedulerFailoverTransition(
            "fail_closed",
            {
              kind: "runtime_quiesced",
            },
          );

        expect(decision.nextMode)
          .toBe("standby");

        expect(decision.action)
          .toBe("enter_standby");

        expect(decision.action)
          .not
          .toBe("activate_runtime");
      },
    );

    it(
      "requires fresh acquisition after fail-closed quiescence",
      () => {
        const quiesced =
          decideSchedulerFailoverTransition(
            "fail_closed",
            {
              kind: "runtime_quiesced",
            },
          );

        expect(quiesced)
          .toEqual({
            nextMode: "standby",
            action: "enter_standby",
          });

        expect(
          decideSchedulerFailoverTransition(
            quiesced.nextMode,
            {
              kind: "ownership_acquired",
            },
          ),
        ).toEqual({
          nextMode: "active",
          action: "activate_runtime",
        });
      },
    );

    it(
      "does not allow ownership-acquired signal to reactivate fail-closed runtime directly",
      () => {
        expect(
          decideSchedulerFailoverTransition(
            "fail_closed",
            {
              kind: "ownership_acquired",
            },
          ),
        ).toEqual({
          nextMode: "fail_closed",
          action: "remain_fail_closed",
        });
      },
    );

    it.each([
      "standby",
      "active",
      "fail_closed",
    ] as const)(
      "allows shutdown from %s without manufacturing authority",
      (mode) => {
        expect(
          decideSchedulerFailoverTransition(
            mode,
            {
              kind: "shutdown",
            },
          ),
        ).toEqual({
          nextMode: mode,
          action: "stop",
        });
      },
    );
  },
);