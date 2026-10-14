// ---- Mocks, fixtures & helpers ---- //

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { endpointRequestSchema, endpointResponseSchema } from "./schemas";

type OpenApiOperation = {
  requestBody?: unknown;
  responses?: Record<string, { content?: Record<string, unknown> }>;
};

type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

function clientPath(openApiPath: string): string {
  const path = openApiPath.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    /week|page|competition_id/i.test(name) ? "1" : "test-id",
  );
  return `/api${path}`;
}

const openApi = JSON.parse(
  readFileSync(resolve(process.cwd(), "../backend/api/openapi.json"), "utf8"),
) as OpenApiDocument;

// ---- Happy path ---- //

describe("endpoint contract coverage", () => {
  it("endpoint_contracts_cover_every_JSON_success_operation", () => {
    let covered = 0;

    for (const [path, methods] of Object.entries(openApi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const hasJsonSuccess = Object.entries(operation.responses ?? {}).some(
          ([status, response]) =>
            status.startsWith("2") && Boolean(response.content?.["application/json"]),
        );
        if (!hasJsonSuccess) continue;

        const requestPath = clientPath(path);
        expect(() => endpointResponseSchema(method.toUpperCase(), requestPath)).not.toThrow();
        if (operation.requestBody) {
          expect(endpointRequestSchema(method.toUpperCase(), requestPath)).not.toBeNull();
        }
        covered += 1;
      }
    }

    expect(covered).toBe(47);
  });
});
