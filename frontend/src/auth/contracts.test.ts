// ---- Mocks, fixtures & helpers ---- //

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  authErrorResponseSchema,
  authPathParamsSchema,
  authQuerySchema,
  authRequestSchema,
  authRequestToWire,
  authResponseSchema,
  pairingCompleteRequestSchema,
  sessionViewSchema,
} from "./schemas";

type OpenApiOperation = {
  parameters?: Array<{ in: string; name: string }>;
  requestBody?: unknown;
  responses?: Record<string, { content?: Record<string, unknown> }>;
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

function routePath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, "test-id");
}

const openApi = JSON.parse(
  readFileSync(resolve(process.cwd(), "../backend/auth/openapi.json"), "utf8"),
) as OpenApiDocument;

// ---- Happy path ---- //

describe("auth endpoint contract coverage", () => {
  it("public_auth_json_operations_have_zod_contracts", () => {
    let covered = 0;

    for (const [path, methods] of Object.entries(openApi.paths)) {
      if (path.startsWith("/internal/")) continue;
      for (const [method, operation] of Object.entries(methods)) {
        const hasJsonSuccess = Object.entries(operation.responses ?? {}).some(
          ([status, response]) =>
            status.startsWith("2") && Boolean(response.content?.["application/json"]),
        );
        if (!hasJsonSuccess) continue;

        const requestPath = routePath(path);
        expect(() => authResponseSchema(method.toUpperCase(), requestPath)).not.toThrow();
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (status.startsWith("2") || !response.content?.["application/json"]) continue;
          expect(authErrorResponseSchema(method.toUpperCase(), requestPath, status)).not.toBeNull();
        }
        if (operation.requestBody) {
          expect(authRequestSchema(method.toUpperCase(), requestPath)).not.toBeNull();
        }
        for (const parameter of operation.parameters ?? []) {
          if (parameter.in === "query") {
            expect(authQuerySchema(method.toUpperCase(), requestPath)).not.toBeNull();
          }
          if (parameter.in === "path") {
            expect(authPathParamsSchema(method.toUpperCase(), requestPath)).not.toBeNull();
          }
        }
        covered += 1;
      }
    }

    expect(covered).toBe(14);
  });

  it("session_response_maps_only_declared_wire_aliases", () => {
    const parsed = sessionViewSchema.parse({
      user: { user_id: "u-1", email: null, name: null },
    });

    expect(parsed).toEqual({
      user: { userId: "u-1", email: null, name: null },
    });
  });

  it("pairing_request_maps_outer_fields_and_preserves_provider_keys", () => {
    const body = {
      secret: "pairing-secret",
      tokenResponse: { access_token: "provider-token", expires_in: 60 },
    };

    expect(
      authRequestToWire("POST", "/laliga/pairings/test-id/complete", body),
    ).toEqual({
      secret: "pairing-secret",
      token_response: { access_token: "provider-token", expires_in: 60 },
    });
  });
});

// ---- Error paths ---- //

describe("auth request validation", () => {
  it("rejects_extra_pairing_fields", () => {
    expect(() => pairingCompleteRequestSchema.parse({
      secret: "pairing-secret",
      tokenResponse: {},
      userId: "caller-supplied",
    })).toThrow();
  });
});
