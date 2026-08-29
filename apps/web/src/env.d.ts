/// <reference types="vite/client" />

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
}

interface RegisteredModelContextTool {
  name: string;
  title: string;
  description: string;
  inputSchema?: string;
  annotations?: ModelContextTool["annotations"];
  origin: string;
  window: Window;
}

interface ModelContext extends EventTarget {
  registerTool: (tool: ModelContextTool, options?: { exposedTo?: string[]; signal?: AbortSignal }) => Promise<void>;
  getTools: (options?: { fromOrigins?: string[] }) => Promise<RegisteredModelContextTool[]>;
  executeTool: (tool: RegisteredModelContextTool, inputArguments?: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

interface Document {
  readonly modelContext?: ModelContext;
}
