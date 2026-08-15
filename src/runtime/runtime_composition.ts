import {
  HandlerRegistry,
} from "./handler_registry.js";

import {
  LogStepHandler,
} from "./handlers/log_step_handler.js";

export function createDefaultHandlerRegistry():
  HandlerRegistry {
  const registry =
    new HandlerRegistry();

  registry.register(
    new LogStepHandler(),
  );

  return registry;
}
