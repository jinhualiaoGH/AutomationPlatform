import {
  type FastifyInstance,
  type FastifyReply,
} from "fastify";

import {
  automationStatuses,
  type AutomationDefinition,
  type AutomationStatus,
} from "../domain/automation.js";

import {
  AutomationService,
} from "../services/automation_service.js";

type CreateAutomationBody = {
  name?: unknown;
  description?: unknown;
};

type StatusBody = {
  status?: unknown;
  rowVersion?: unknown;
};

type PublicIdParameters = {
  publicId: string;
};

const publicIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeAutomation(
  automation: AutomationDefinition,
) {
  return {
    publicId:
      automation.publicId,

    name:
      automation.name,

    description:
      automation.description,

    status:
      automation.status,

    createdAtUtc:
      automation.createdAtUtc
        .toISOString(),

    updatedAtUtc:
      automation.updatedAtUtc
        .toISOString(),

    rowVersion:
      automation.rowVersion
        .toString("base64"),
  };
}

function isAutomationStatus(
  value: unknown,
): value is AutomationStatus {
  return (
    typeof value === "string" &&
    automationStatuses.includes(
      value as AutomationStatus,
    )
  );
}

function decodeRowVersion(
  value: unknown,
): Buffer | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const buffer =
      Buffer.from(
        value,
        "base64",
      );

    if (buffer.length !== 8) {
      return null;
    }

    return buffer;
  }
  catch {
    return null;
  }
}

function validatePublicId(
  publicId: string,
): boolean {
  return publicIdPattern.test(
    publicId,
  );
}

function sendServiceError(
  reply: FastifyReply,
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown automation error.";

  if (
    message ===
    "Automation not found."
  ) {
    return reply
      .code(404)
      .send({
        error: "not_found",
        message,
      });
  }

  if (
    message ===
      "Automation update conflict." ||
    message.startsWith(
      "Invalid automation status transition:",
    )
  ) {
    return reply
      .code(409)
      .send({
        error: "conflict",
        message,
      });
  }

  return reply
    .code(500)
    .send({
      error: "internal_error",
      message:
        "Automation operation failed.",
    });
}

export async function automationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service =
    new AutomationService();

  app.post(
    "/automations",
    async (request, reply) => {
      const body =
        (request.body ?? {}) as
        CreateAutomationBody;

      if (
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "name must be a non-empty string.",
          });
      }

      if (
        body.description !== undefined &&
        body.description !== null &&
        typeof body.description !== "string"
      ) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "description must be a string or null.",
          });
      }

      try {
        const automation =
          await service
            .createAutomation(
              body.name,
              body.description as
                string | null | undefined,
            );

        return reply
          .code(201)
          .send(
            serializeAutomation(
              automation,
            ),
          );
      }
      catch (error) {
        return sendServiceError(
          reply,
          error,
        );
      }
    },
  );

  app.get<{
    Params: PublicIdParameters;
  }>(
    "/automations/:publicId",
    async (request, reply) => {
      const {
        publicId,
      } = request.params;

      if (
        !validatePublicId(
          publicId,
        )
      ) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "publicId must be a valid UUID.",
          });
      }

      try {
        const automation =
          await service
            .getAutomation(
              publicId,
            );

        return reply.send(
          serializeAutomation(
            automation,
          ),
        );
      }
      catch (error) {
        return sendServiceError(
          reply,
          error,
        );
      }
    },
  );

  app.patch<{
    Params: PublicIdParameters;
  }>(
    "/automations/:publicId/status",
    async (request, reply) => {
      const {
        publicId,
      } = request.params;

      if (
        !validatePublicId(
          publicId,
        )
      ) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "publicId must be a valid UUID.",
          });
      }

      const body =
        (request.body ?? {}) as
        StatusBody;

      if (
        !isAutomationStatus(
          body.status,
        )
      ) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "status is invalid.",
          });
      }

      const rowVersion =
        decodeRowVersion(
          body.rowVersion,
        );

      if (!rowVersion) {
        return reply
          .code(400)
          .send({
            error: "validation_error",
            message:
              "rowVersion must be an 8-byte Base64 value.",
          });
      }

      try {
        const automation =
          await service
            .changeAutomationStatus(
              publicId,
              body.status,
              rowVersion,
            );

        return reply.send(
          serializeAutomation(
            automation,
          ),
        );
      }
      catch (error) {
        return sendServiceError(
          reply,
          error,
        );
      }
    },
  );
}
