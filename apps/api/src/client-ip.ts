export const CANONICAL_CLIENT_IP_HEADER = "x-strategy-court-forwarded-for";

export function configuredTrustedProxies(): string[] | undefined {
  const configured = process.env.AUTH_TRUSTED_PROXIES
    ?.split(",")
    .map((range) => range.trim())
    .filter(Boolean);
  return configured?.length ? configured : undefined;
}

export function attachClientIp(
  request: Request,
  directAddress: string | undefined,
  trustedProxies = configuredTrustedProxies(),
): Request {
  const headers = new Headers(request.headers);
  headers.set(CANONICAL_CLIENT_IP_HEADER, "");

  if (directAddress) {
    const forwarded = trustedProxies?.length ? headers.get("x-forwarded-for")?.trim() : undefined;
    headers.set(
      CANONICAL_CLIENT_IP_HEADER,
      forwarded ? `${forwarded}, ${directAddress}` : directAddress,
    );
  }

  return new Request(request, { headers });
}
