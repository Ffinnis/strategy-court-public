export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown, headers: HeadersInit = {}): Response {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "internal_error", "The request could not be completed");
  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details === undefined ? {} : { details: apiError.details }),
      },
    },
    { status: apiError.status, headers },
  );
}

export function requireObject(value: unknown, message = "A JSON object is required"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", message);
  }
  return value as Record<string, unknown>;
}
