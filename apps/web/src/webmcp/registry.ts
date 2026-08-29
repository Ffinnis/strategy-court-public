export interface WebMcpRegistrationFailure {
  toolName: string;
  message: string;
}

export interface WebMcpRegistrationReport {
  expectedToolNames: string[];
  registeredToolNames: string[];
  errors: WebMcpRegistrationFailure[];
}

export interface WebMcpRegistration {
  controller: AbortController;
  ready: boolean;
}

export type WebMcpRegistrations = Map<string, WebMcpRegistration>;

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileWebMcpTools(
  context: ModelContext,
  tools: ModelContextTool[],
  registrations: WebMcpRegistrations,
): Promise<WebMcpRegistrationReport> {
  const expectedToolNames = tools.map((tool) => tool.name);
  const expected = new Set(expectedToolNames);

  for (const [name, registration] of registrations) {
    if (!expected.has(name)) {
      registration.controller.abort();
      registrations.delete(name);
    }
  }

  const additions = tools.filter((tool) => !registrations.has(tool.name));
  const attempts = additions.map((tool) => {
    const controller = new AbortController();
    registrations.set(tool.name, { controller, ready: false });
    const promise = Promise.resolve().then(() => context.registerTool(tool, { signal: controller.signal }));
    return { controller, promise, tool };
  });
  const outcomes = await Promise.allSettled(attempts.map(({ promise }) => promise));
  const errors: WebMcpRegistrationFailure[] = [];

  outcomes.forEach((outcome, index) => {
    const attempt = attempts[index]!;
    if (outcome.status === "fulfilled" && !attempt.controller.signal.aborted) {
      registrations.set(attempt.tool.name, { controller: attempt.controller, ready: true });
      return;
    }
    attempt.controller.abort();
    registrations.delete(attempt.tool.name);
    if (outcome.status === "rejected") errors.push({ toolName: attempt.tool.name, message: messageFor(outcome.reason) });
  });

  return {
    expectedToolNames,
    registeredToolNames: expectedToolNames.filter((name) => registrations.get(name)?.ready),
    errors,
  };
}

export function disposeWebMcpTools(registrations: WebMcpRegistrations): void {
  for (const registration of registrations.values()) registration.controller.abort();
  registrations.clear();
}
