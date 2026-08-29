import { describe, expect, test } from "bun:test";
import { disposeWebMcpTools, reconcileWebMcpTools, type WebMcpRegistrations } from "../src/webmcp/registry";

const tool = (name: string) => ({
  name,
  title: name,
  description: `${name} test tool`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute: async () => ({ ok: true }),
}) as ModelContextTool;

describe("webmcp registration", () => {
  test("adds and removes only the changed tool names", async () => {
    const calls: string[] = [];
    const signals = new Map<string, AbortSignal>();
    const context = {
      registerTool: async (candidate: ModelContextTool, options?: { signal?: AbortSignal }) => {
        calls.push(candidate.name);
        if (options?.signal) signals.set(candidate.name, options.signal);
      },
    } as ModelContext;
    const registrations: WebMcpRegistrations = new Map();

    const initial = await reconcileWebMcpTools(context, [tool("context"), tool("draft")], registrations);
    expect(initial.registeredToolNames).toEqual(["context", "draft"]);
    expect(calls).toEqual(["context", "draft"]);

    await reconcileWebMcpTools(context, [tool("context"), tool("draft")], registrations);
    expect(calls).toEqual(["context", "draft"]);

    const changed = await reconcileWebMcpTools(context, [tool("draft"), tool("court")], registrations);
    expect(signals.get("context")?.aborted).toBe(true);
    expect(changed.registeredToolNames).toEqual(["draft", "court"]);
    expect(calls).toEqual(["context", "draft", "court"]);

    disposeWebMcpTools(registrations);
    expect(signals.get("draft")?.aborted).toBe(true);
    expect(signals.get("court")?.aborted).toBe(true);
  });

  test("reports individual failures and retries them later", async () => {
    let attempts = 0;
    const context = {
      registerTool: async (candidate: ModelContextTool) => {
        if (candidate.name === "broken" && attempts++ === 0) throw new Error("duplicate tool name");
      },
    } as ModelContext;
    const registrations: WebMcpRegistrations = new Map();

    const partial = await reconcileWebMcpTools(context, [tool("ready"), tool("broken")], registrations);
    expect(partial.registeredToolNames).toEqual(["ready"]);
    expect(partial.errors).toEqual([{ toolName: "broken", message: "duplicate tool name" }]);

    const recovered = await reconcileWebMcpTools(context, [tool("ready"), tool("broken")], registrations);
    expect(recovered.registeredToolNames).toEqual(["ready", "broken"]);
    expect(recovered.errors).toEqual([]);
  });
});
