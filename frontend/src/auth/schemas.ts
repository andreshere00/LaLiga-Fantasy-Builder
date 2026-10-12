import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function addDeclaredAliases(value: unknown, schema: z.ZodType): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return addDeclaredAliases(value, schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodArray) {
    return Array.isArray(value)
      ? value.map((item) => addDeclaredAliases(item, schema.element as z.ZodType))
      : value;
  }
  if (
    schema instanceof z.ZodRecord ||
    schema instanceof z.ZodUnion ||
    schema instanceof z.ZodLazy
  ) {
    return value;
  }
  if (schema instanceof z.ZodObject && typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const output = { ...source };
    for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
      const wireName = snakeCase(fieldName);
      if (fieldName in source && wireName in source) continue;
      if (fieldName in source) {
        output[fieldName] = addDeclaredAliases(source[fieldName], fieldSchema as z.ZodType);
      } else if (wireName in source) {
        output[fieldName] = addDeclaredAliases(source[wireName], fieldSchema as z.ZodType);
        delete output[wireName];
      }
    }
    return output;
  }
  return value;
}

function wireObject<T extends z.ZodType>(shape: T) {
  return z.preprocess((value) => addDeclaredAliases(value, shape), shape);
}

export const csrfTokenInputSchema = z.string().min(1);

const sessionUserShape = z
  .strictObject({
    userId: z.string().min(1),
    email: z.string().nullable(),
    name: z.string().nullable(),
  });

export const sessionUserSchema = wireObject(sessionUserShape);

const sessionViewShape = z.strictObject({
  user: sessionUserSchema,
  csrfToken: z.string().min(1),
});

export const sessionViewSchema = wireObject(sessionViewShape);

const accessTokenShape = z.strictObject({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export const accessTokenSchema = wireObject(accessTokenShape);

const laligaConnectionShape = z.strictObject({
  linked: z.boolean(),
  needsReauth: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
  avatar: z.string().nullable(),
});

export const laligaConnectionSchema = wireObject(laligaConnectionShape);

export const okResponseSchema = wireObject(z.strictObject({ ok: z.literal(true) }));
export const authErrorSchema = wireObject(
  z.strictObject({ error: z.string(), detail: z.string().nullable().optional() }),
);
const validationIssueSchema = z.strictObject({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string(),
  input: jsonValueSchema.optional(),
  ctx: z.record(z.string(), jsonValueSchema).optional(),
});
export const httpValidationErrorSchema = z.strictObject({
  detail: z.array(validationIssueSchema),
});

export const pairingCreateResponseSchema = wireObject(
  z.strictObject({
    pairingId: z.string().min(1),
    secret: z.string().min(8),
    expiresAt: z.number().int().positive(),
    nonce: z.string().min(1),
  }),
);

export const completeRedirectRequestSchema = z.strictObject({ callback: z.string().min(8) });
export const completeRedirectResponseSchema = wireObject(
  z.strictObject({ ok: z.literal(true), frontendOrigin: z.string().min(1) }),
);

export const pairingCompleteRequestSchema = z.strictObject({
  secret: z.string().min(8),
  tokenResponse: z.record(z.string(), jsonValueSchema),
});
export const pairingCompleteResponseSchema = wireObject(
  z.strictObject({
    ok: z.literal(true),
    userId: z.string().min(1),
    managerId: z.string().min(1),
    managerName: z.string().nullable(),
    email: z.string().nullable(),
  }),
);

const healthShape = z.strictObject({ status: z.string().min(1) });
export const healthResponseSchema = wireObject(healthShape);
export const healthReadyResponseSchema = wireObject(
  z.strictObject({ status: z.string().min(1), store: z.string().min(1) }),
);
export const healthNotReadyResponseSchema = wireObject(
  z.strictObject({ status: z.string().min(1), detail: z.string().min(1) }),
);

const jsonWebKeyShape = z.strictObject({
  kty: z.string().min(1),
  use: z.string().nullable(),
  kid: z.string().min(1),
  alg: z.string().nullable(),
  n: z.string().min(1),
  e: z.string().min(1),
});
export const jwksResponseSchema = wireObject(z.strictObject({ keys: z.array(jsonWebKeyShape) }));

export function authResponseSchema(method: string, path: string): z.ZodType {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" && ["/auth/callback", "/auth/me"].includes(path)) {
    return sessionViewSchema;
  }
  if (normalizedMethod === "POST" && path === "/auth/logout") return okResponseSchema;
  if (normalizedMethod === "POST" && path === "/auth/token") return accessTokenSchema;
  if (normalizedMethod === "GET" && path === "/.well-known/jwks.json") {
    return jwksResponseSchema;
  }
  if (normalizedMethod === "POST" && path === "/laliga/pairings") {
    return pairingCreateResponseSchema;
  }
  if (normalizedMethod === "POST" && path === "/laliga/pairings/complete-redirect") {
    return completeRedirectResponseSchema;
  }
  if (
    normalizedMethod === "POST" &&
    /^\/laliga\/pairings\/[^/]+\/complete$/.test(path)
  ) {
    return pairingCompleteResponseSchema;
  }
  if (normalizedMethod === "GET" && path === "/laliga/connection") {
    return laligaConnectionSchema;
  }
  if (normalizedMethod === "DELETE" && path === "/laliga/connection") {
    return okResponseSchema;
  }
  if (normalizedMethod === "GET" && ["/health", "/health/live"].includes(path)) {
    return healthResponseSchema;
  }
  if (normalizedMethod === "GET" && path === "/health/ready") {
    return healthReadyResponseSchema;
  }
  throw new Error(`No auth response schema for ${normalizedMethod} ${path}`);
}

export function authErrorResponseSchema(
  method: string,
  path: string,
  status: string,
): z.ZodType | null {
  if (status === "422") return httpValidationErrorSchema;
  if (method.toUpperCase() === "GET" && path === "/health/ready" && status === "503") {
    return healthNotReadyResponseSchema;
  }
  if (["400", "401", "403", "404", "409", "429", "500", "502", "503"].includes(status)) {
    return authErrorSchema;
  }
  return null;
}

export function authRequestSchema(method: string, path: string): z.ZodType | null {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "POST" && path === "/laliga/pairings/complete-redirect") {
    return completeRedirectRequestSchema;
  }
  if (
    normalizedMethod === "POST" &&
    /^\/laliga\/pairings\/[^/]+\/complete$/.test(path)
  ) {
    return pairingCompleteRequestSchema;
  }
  return null;
}

export function authQuerySchema(method: string, path: string): z.ZodType | null {
  if (method.toUpperCase() === "GET" && path === "/auth/callback") {
    return z.strictObject({ code: z.string().min(1), state: z.string().min(1) });
  }
  return null;
}

export function authPathParamsSchema(method: string, path: string): z.ZodType | null {
  if (
    method.toUpperCase() === "POST" &&
    /^\/laliga\/pairings\/[^/]+\/complete$/.test(path)
  ) {
    return z.strictObject({ pairingId: z.string().min(1) });
  }
  return null;
}

export function authRequestToWire(method: string, path: string, value: unknown): unknown {
  const schema = authRequestSchema(method, path);
  if (!schema) throw new Error(`No auth request schema for ${method.toUpperCase()} ${path}`);
  const parsed = schema.parse(value);
  if (/^\/laliga\/pairings\/[^/]+\/complete$/.test(path)) {
    const body = parsed as { secret: string; tokenResponse: Record<string, unknown> };
    return { secret: body.secret, token_response: body.tokenResponse };
  }
  return parsed;
}

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
export type AccessToken = z.infer<typeof accessTokenSchema>;
export type LaligaConnection = z.infer<typeof laligaConnectionSchema>;
