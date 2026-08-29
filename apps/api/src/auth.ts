import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import { CANONICAL_CLIENT_IP_HEADER, configuredTrustedProxies } from "./client-ip";

const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];
const PLACEHOLDER_SECRET = "replace-with-at-least-32-random-characters";

export interface AuthOptions {
  baseURL?: string;
  secret?: string;
  trustedOrigins?: string[];
  trustedProxies?: string[];
}

function configuredOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_TRUSTED_ORIGINS;
}

export function createAuth(pool: Pool, options: AuthOptions = {}) {
  const secret = options.secret
    ?? process.env.BETTER_AUTH_SECRET
    ?? (process.env.NODE_ENV === "production" ? undefined : "strategy-court-insecure-local-development-secret");
  if (!secret || (process.env.NODE_ENV === "production" && (secret === PLACEHOLDER_SECRET || secret.length < 32))) {
    throw new Error("BETTER_AUTH_SECRET must be a non-placeholder secret of at least 32 characters in production");
  }
  const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;
  const trustedProxies = options.trustedProxies ?? configuredTrustedProxies();

  return betterAuth({
    appName: "Strategy Court",
    baseURL: options.baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
    secret,
    database: pool,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    trustedOrigins: options.trustedOrigins ?? configuredOrigins(),
    advanced: {
      ipAddress: {
        ipAddressHeaders: [CANONICAL_CLIENT_IP_HEADER],
        ...(trustedProxies ? { trustedProxies } : {}),
      },
    },
    ...(google ? { socialProviders: google } : {}),
  });
}

export type StrategyCourtAuth = ReturnType<typeof createAuth>;
