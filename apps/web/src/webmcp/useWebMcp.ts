import {
  EXECUTABLE_INDICATOR_DEFINITIONS,
  PRICE_SOURCES,
  courtRunRequestJsonSchema,
  replayAdvanceJsonSchema,
  strategyDefinitionJsonSchema,
  variantRequestsJsonSchema,
  type DataSnapshotPolicy,
  type ReplayAdvanceMode,
} from "@strategy-court/schemas";
import { getCurrentScope, onScopeDispose, readonly, ref, watch, type DeepReadonly, type Ref } from "vue";
import { ApiError, apiRequest, unwrap } from "@/services/api";
import { useCourtStore } from "@/stores/court";
import type { StrategyDefinition, StrategyVersion } from "@/types";
import {
  disposeWebMcpTools,
  reconcileWebMcpTools,
  type WebMcpRegistrationFailure,
  type WebMcpRegistrations,
} from "@/webmcp/registry";

type Schema = Record<string, unknown>;
interface ObjectSchema extends Schema {
  properties: Record<string, Schema>;
  required?: string[];
  $defs?: Record<string, Schema>;
}

const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const oneOf = (...schemas: Schema[]): Schema => ({ oneOf: schemas });
const described = (schema: Schema, description: string): Schema => ({ ...schema, description });
const cloneObjectSchema = (schema: unknown): ObjectSchema => structuredClone(schema) as ObjectSchema;

const sharedStrategy = cloneObjectSchema(strategyDefinitionJsonSchema);
const sharedStrategyDefs = sharedStrategy.$defs!;
const valueExpression = sharedStrategyDefs.value!;
const condition = sharedStrategyDefs.condition!;
const { $schema: _strategyDialect, $defs: _nestedStrategyDefs, ...strategyShape } = sharedStrategy;
const definition: Schema = {
  ...strategyShape,
  description: "Complete deterministic daily, long-only strategy definition for the active case.",
  properties: {
    ...sharedStrategy.properties,
    name: described(sharedStrategy.properties.name!, "Short strategy name shown in the case."),
    universe: described(sharedStrategy.properties.universe!, "One to five symbols from the curated US stock and ETF universe."),
    timeframe: described(sharedStrategy.properties.timeframe!, "Daily bars. The MVP supports only 1d."),
    direction: described(sharedStrategy.properties.direction!, "Long-only direction. The MVP does not support short positions."),
    entry: described(sharedStrategy.properties.entry!, "Condition tree that opens a position when true on a completed daily close."),
    exit: described(sharedStrategy.properties.exit!, "Condition tree that closes an open position when true on a completed daily close."),
    execution: described(sharedStrategy.properties.execution!, "Locked signal, fill, and order assumptions."),
    risk: described(sharedStrategy.properties.risk!, "Optional stop-loss, take-profit, and maximum holding-period controls."),
    costs: described(sharedStrategy.properties.costs!, "Commission and slippage assumptions in basis points per side."),
  },
};
const strategyDefs: Record<string, Schema> = { ...sharedStrategyDefs, definition };
const withStrategy = (schema: Schema): Schema => ({ ...schema, $defs: strategyDefs });

const sharedRun = cloneObjectSchema(courtRunRequestJsonSchema);
const sharedDateRange = sharedRun.properties.dateRange as ObjectSchema;
const date = described(sharedDateRange.properties.start!, "Calendar date in YYYY-MM-DD format. Must match the active case range.");
const sharedReplayAdvance = cloneObjectSchema(replayAdvanceJsonSchema);
const replayIncrement = described(sharedReplayAdvance.properties.mode!, "How far to reveal the active hidden-period replay.");
const sharedVariant = cloneObjectSchema((variantRequestsJsonSchema as unknown as { items: unknown }).items);
const sharedVariantPatch = sharedVariant.properties.patch!;
const { patch: _sharedPatch, ...sharedVariantProperties } = sharedVariant.properties;
const agentVariant: Schema = {
  ...sharedVariant,
  required: (sharedVariant.required ?? []).map((name) => name === "patch" ? "structuredPatch" : name),
  properties: {
    ...sharedVariantProperties,
    name: described(sharedVariant.properties.name!, "Name that identifies this controlled strategy variant."),
    hypothesis: described(sharedVariant.properties.hypothesis!, "Falsifiable claim this variant is intended to test."),
    rationale: described(sharedVariant.properties.rationale!, "Why this exact change may address the observed weakness."),
    expectedWeaknessAddressed: described(sharedVariant.properties.expectedWeaknessAddressed!, "Court weakness or verdict category this change targets."),
    structuredPatch: described(sharedVariantPatch, "Exact bounded changes to apply to the active strategy definition."),
  },
};

const id = { type: "string", minLength: 1, maxLength: 100 } satisfies Schema;
const caseId = described(id, "Strategy Court case ID. It must match the active case for mutations.");
const optionalCaseId = described(id, "Optional case ID. Omit it to read the active case in the current app session.");
const versionId = described(id, "Immutable strategy version ID from get_case_context.");
const source = { type: "string", enum: [...PRICE_SOURCES], description: "Daily OHLCV price source or supported derived price." } satisfies Schema;
const comparisonBranch = (condition.oneOf as Schema[]).at(-1)!;
const comparisonOperator = ((comparisonBranch.properties as Record<string, Schema>).operator)!;
const customIndicatorId = described({
  type: "string",
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
}, "Owner-scoped custom indicator ID returned by list_indicator_catalog or create_custom_indicator.");

const catalogParameterSchema = (parameter: (typeof EXECUTABLE_INDICATOR_DEFINITIONS)[number]["parameters"][number]): Schema => {
  if (parameter.type === "integer") return { type: "integer", minimum: parameter.min, maximum: parameter.max };
  if (parameter.type === "number") return { type: "number", minimum: parameter.min, maximum: parameter.max };
  return { type: "string", enum: [...(parameter.options ?? [])] };
};

const catalogFormulaBranches = EXECUTABLE_INDICATOR_DEFINITIONS.map((indicator) => object({
  indicator: described({ const: indicator.id }, indicator.name),
  parameters: object(
    Object.fromEntries(indicator.parameters.map((parameter) => [parameter.name, described(catalogParameterSchema(parameter), parameter.label)])),
    indicator.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  ),
}, ["indicator", "parameters"]));

const indicatorInput = oneOf(
  object({ name: described({ type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" }, "Stable input name used by the formula."), type: { const: "number" }, default: { type: "number" }, min: { type: "number" }, max: { type: "number" }, description: { type: "string", maxLength: 500 } }, ["name", "type", "default"]),
  object({ name: described({ type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" }, "Stable input name used by the formula."), type: { const: "source" }, default: source, description: { type: "string", maxLength: 500 } }, ["name", "type", "default"]),
  object({ name: described({ type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" }, "Stable input name used by the formula."), type: { const: "boolean" }, default: { type: "boolean" }, description: { type: "string", maxLength: 500 } }, ["name", "type", "default"]),
);
const formula = oneOf(
  object({ all: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/$defs/formula" } } }, ["all"]),
  object({ any: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/$defs/formula" } } }, ["any"]),
  object({ not: { $ref: "#/$defs/formula" } }, ["not"]),
  object({ left: { $ref: "#/$defs/formula" }, operator: comparisonOperator, right: { $ref: "#/$defs/formula" } }, ["left", "operator", "right"]),
  object({ constant: { type: "number", minimum: -1e12, maximum: 1e12 } }, ["constant"]),
  object({ source }, ["source"]),
  object({ input: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" } }, ["input"]),
  ...catalogFormulaBranches,
  object({ indicator: customIndicatorId, arguments: { type: "array", maxItems: 20, items: object({ name: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" }, value: { $ref: "#/$defs/formulaArgument" } }, ["name", "value"]) } }, ["indicator", "arguments"]),
  object({ lag: object({ value: { $ref: "#/$defs/formula" }, bars: { type: "integer", minimum: 0, maximum: 2520 } }, ["value", "bars"]) }, ["lag"]),
  object({ operation: { type: "string", enum: ["add", "subtract", "multiply", "divide", "min", "max"] }, left: { $ref: "#/$defs/formula" }, right: { $ref: "#/$defs/formula" } }, ["operation", "left", "right"]),
  object({ absolute: { $ref: "#/$defs/formula" } }, ["absolute"]),
);
const formulaArgument = oneOf({ type: "number", minimum: -1e12, maximum: 1e12 }, { type: "boolean" }, source, { $ref: "#/$defs/formula" });
const indicatorDependencies: Schema = {
  type: "array",
  maxItems: 20,
  uniqueItems: true,
  items: id,
  description: "All built-in or owner-scoped custom indicator IDs referenced anywhere in the formula.",
};
const customStrategyArgument = oneOf(
  { type: "number", minimum: -1e12, maximum: 1e12 },
  { type: "boolean" },
  source,
  { $ref: "#/$defs/value" },
);
const customStrategyValue = object({
  indicator: customIndicatorId,
  arguments: {
    type: "array",
    maxItems: 20,
    items: object({
      name: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" },
      value: { $ref: "#/$defs/customStrategyArgument" },
    }, ["name", "value"]),
  },
}, ["indicator", "arguments"]);
const agentValueExpression: Schema = {
  ...valueExpression,
  oneOf: [...(valueExpression.oneOf as Schema[]), customStrategyValue],
};
const agentCondition: Schema = {
  ...condition,
  oneOf: [...(condition.oneOf as Schema[]), customStrategyValue],
};
sharedStrategyDefs.value = agentValueExpression;
sharedStrategyDefs.condition = agentCondition;
sharedStrategyDefs.customStrategyArgument = customStrategyArgument;
strategyDefs.value = agentValueExpression;
strategyDefs.condition = agentCondition;
strategyDefs.customStrategyArgument = customStrategyArgument;

export const webMcpSchemaContract = {
  definition,
  condition: agentCondition,
  valueExpression: agentValueExpression,
  indicatorInput,
  formula,
  formulaArgument,
  indicatorDependencies,
  monitoringInput: object({ caseId, strategyVersionId: versionId }, ["caseId", "strategyVersionId"]),
};

export function transformAgentFormula(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformAgentFormula);
  if (!value || typeof value !== "object") return value;
  const node = value as Record<string, unknown>;
  if (typeof node.indicator === "string" && Array.isArray(node.arguments)) {
    const parameters: Record<string, unknown> = {};
    for (const argumentValue of node.arguments) {
      if (!argumentValue || typeof argumentValue !== "object" || Array.isArray(argumentValue)) throw new Error("Every custom indicator argument must be a name/value object.");
      const argument = argumentValue as Record<string, unknown>;
      const name = String(argument.name ?? "");
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) throw new Error(`Custom indicator argument name ${name || "(empty)"} is invalid.`);
      if (Object.hasOwn(parameters, name)) throw new Error(`Duplicate custom indicator argument ${name}.`);
      parameters[name] = transformAgentFormula(argument.value);
    }
    return { indicator: node.indicator, parameters };
  }
  return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, transformAgentFormula(item)]));
}

function nextActions(store: ReturnType<typeof useCourtStore>): string[] {
  if (!store.currentCase) return ["Create or open a case in the visible app, then call get_case_context without a caseId."];
  if (!store.activeVersion) return ["Call create_strategy_draft for the active case."];
  if (!store.confirmed) return ["Ask the user to review and confirm the visible strategy interpretation. Confirmation is intentionally user-controlled."];
  if (!store.courtComplete) return ["Call run_court with the active version and the case's locked date range."];
  const actions: string[] = [];
  if (store.monitoringCandidate && store.monitoringStatus?.strategyVersionId !== store.monitoringCandidate.id) {
    actions.push("Call get_monitoring_status to refresh the confirmed version against the latest completed bar. Monitoring is separate from historical replay.");
  }
  if (store.variants.length === 0) actions.push("Inspect a returned failure, then create up to three controlled strategy variants.");
  if (!store.replay) actions.push("Compare the tested versions and start replay probation only for an eligible version.");
  else actions.push("Advance the hidden-period replay separately with advance_replay.");
  return actions;
}

function snapshot(store: ReturnType<typeof useCourtStore>) {
  return {
    caseId: store.currentCase?.id ?? null,
    activeVersionId: store.activeVersion?.id ?? null,
    confirmed: store.confirmed,
    courtStatus: store.latestRun?.status ?? "not_started",
    summaryLabel: store.result?.summaryLabel ?? null,
    activeTab: store.activeTab,
    variantCount: store.variants.length,
    replayId: store.replay?.id ?? null,
    replayStatus: store.replay?.status ?? "not_started",
    monitoringStatus: store.monitoringStatus?.status ?? "not_started",
    latestEvaluatedBar: store.monitoringStatus?.evaluatedDate ?? null,
    monitoringChanges: store.monitoringStatus?.changes.length ?? 0,
    monitoringLastSuccessAt: store.monitoringLastSuccessAt,
    nextActions: nextActions(store),
  };
}

type ToolHandler = (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;

export type WebMcpRegistrationStatus = "unsupported" | "registering" | "ready" | "partial" | "failed";
export interface WebMcpRegistrationState {
  status: WebMcpRegistrationStatus;
  expectedToolNames: string[];
  registeredToolNames: string[];
  errors: WebMcpRegistrationFailure[];
}

export function useWebMcp(enabled: Readonly<Ref<boolean>> = ref(true)): DeepReadonly<Ref<WebMcpRegistrationState>> {
  const store = useCourtStore();
  const registration = ref<WebMcpRegistrationState>({ status: "registering", expectedToolNames: [], registeredToolNames: [], errors: [] });
  const registrations: WebMcpRegistrations = new Map();
  let activeContext: ModelContext | null = null;
  let disposed = false;
  let queue = Promise.resolve();

  const state = (message: string, data: unknown, changedIds: string[] = []) => ({ ok: true, message, data, changedIds, currentState: snapshot(store) });
  const execute = (handler: ToolHandler): ModelContextTool["execute"] => async (input, options) => {
    const signal = options?.signal ?? new AbortController().signal;
    try {
      signal.throwIfAborted();
      const result = await handler(input, signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      const message = error instanceof Error ? error.message : "The tool could not complete the request.";
      const apiError = error instanceof ApiError ? error : null;
      store.error = message;
      return {
        ok: false,
        message,
        error: { code: apiError?.code ?? "TOOL_EXECUTION_FAILED", details: apiError?.details ?? null },
        changedIds: [],
        currentState: snapshot(store),
      };
    }
  };
  const agentApi = (path: string, signal: AbortSignal, init: RequestInit = {}) => apiRequest<unknown>(path, { ...init, signal }, "agent");
  const visibleCase = (input: Record<string, unknown>) => {
    const current = store.currentCase;
    if (!current) throw new Error("No active Strategy Court case. Create or open a case in the visible app, then retry this tool.");
    const requested = String(input.caseId ?? current.id);
    if (requested !== current.id) throw new Error(`Open case ${requested} before using this tool. The active case is ${current.id}.`);
    return current;
  };

  const tools = (): ModelContextTool[] => {
    const result: ModelContextTool[] = [
      {
        name: "get_case_context",
        title: "Get case context",
        description: "Read a Strategy Court case and the exact next useful action. Omit caseId to inspect the active case in the current app session.",
        inputSchema: object({ caseId: optionalCaseId }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal) => {
          const requestedId = typeof input.caseId === "string" && input.caseId ? input.caseId : store.currentCase?.id;
          if (!requestedId) return state("No case is active. Create or open a case in the visible app first.", { case: null });
          if (store.currentCase?.id === requestedId) {
            if (!await store.refreshCase("agent", signal)) throw new Error(store.error ?? "The active case could not be refreshed.");
            return state(`Returned active case ${requestedId}.`, { case: store.currentCase });
          }
          return state(`Returned case ${requestedId}. Open it in the app before using a mutating case tool.`, await agentApi(`/api/cases/${encodeURIComponent(requestedId)}`, signal));
        }),
      },
      {
        name: "list_indicator_catalog",
        title: "List indicator catalog",
        description: "List deterministic indicators, their parameters, allowed sources, and output types before drafting a strategy or custom indicator.",
        inputSchema: object({}),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (_input, signal) => state(
          "Returned the supported indicator catalog.",
          await agentApi("/api/indicators", signal),
        )),
      },
      {
        name: "create_strategy_draft",
        title: "Create strategy draft",
        description: "Create a new unconfirmed structured strategy draft for the active case. Use this after interpreting the user's natural-language rules; the user must still review and confirm the result.",
        inputSchema: withStrategy(object({
          caseId,
          definition: { $ref: "#/$defs/definition", description: "Strict deterministic strategy definition derived from the user's stated rules." },
          interpretation: { type: "string", minLength: 1, maxLength: 4000, description: "Plain-language explanation of the exact rules, assumptions, and unresolved ambiguity." },
        }, ["caseId", "definition", "interpretation"])),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal) => {
          const current = visibleCase(input);
          const before = new Set(current.versions.map((item) => item.id));
          const resolved = transformAgentFormula(input.definition) as StrategyDefinition;
          if (!await store.createDraft(resolved, String(input.interpretation), "agent", signal)) throw new Error(store.error ?? "Draft creation failed.");
          const changed = store.currentCase?.versions.filter((item) => !before.has(item.id)).map((item) => item.id) ?? [];
          if (!changed.length) throw new Error("The draft request completed without returning a new strategy version ID.");
          store.activeTab = "strategy";
          return state(`Created unconfirmed strategy draft ${changed[0]}. Ask the user to review and confirm it before running the Court.`, { changedVersionIds: changed }, changed);
        }),
      },
      {
        name: "create_custom_indicator",
        title: "Create custom indicator",
        description: "Create a reusable safe formula-tree indicator. Use this only when the built-in catalog cannot express the user's rule.",
        inputSchema: {
          ...object({
            name: { type: "string", minLength: 1, maxLength: 120, description: "Indicator name shown in Strategy Court." },
            description: { type: "string", minLength: 1, maxLength: 2000, description: "What the indicator measures and when it is useful." },
            inputs: { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/$defs/indicatorInput" }, description: "Typed inputs exposed to strategies that use this indicator." },
            dependencies: indicatorDependencies,
            outputType: { type: "string", enum: ["number", "boolean"], description: "Value type produced for each daily bar." },
            sharingState: { type: "string", enum: ["private", "unlisted"], description: "Whether the indicator remains private or receives an unlisted share link." },
            formula: { $ref: "#/$defs/formula", description: "Bounded formula tree. Arbitrary executable code is not accepted." },
          }, ["name", "description", "inputs", "dependencies", "outputType", "sharingState", "formula"]),
          $defs: { indicatorInput, formula, formulaArgument },
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal) => {
          const response = await agentApi("/api/indicators", signal, { method: "POST", body: JSON.stringify({ ...input, formula: transformAgentFormula(input.formula) }) });
          const indicator = unwrap<Record<string, unknown>>(response, "indicator");
          const changed = indicator?.id ? [String(indicator.id)] : [];
          if (!changed.length) throw new Error("The API did not return a created indicator ID.");
          return state(
            `Created custom indicator ${changed[0]}. Owner-scoped strategy drafts can reference this ID and the server compiles it into the immutable strategy tree.`,
            { indicator, strategyExecutionSupported: true },
            changed,
          );
        }),
      },
    ];

    if (store.confirmed) result.push({
      name: "run_court",
      title: "Run Court",
      description: "Run all configured robustness tests for the active confirmed strategy version and its locked case range.",
      inputSchema: object({
        caseId,
        strategyVersionId: described(sharedRun.properties.strategyVersionId!, "Confirmed active strategy version ID."),
        startDate: date,
        endDate: date,
        courtProfile: described(sharedRun.properties.courtProfile!, "Court test profile. The MVP supports balanced."),
        dataSnapshotPolicy: {
          ...described(sharedRun.properties.dataSnapshotPolicy!, "Omit to use live Alpaca data. Use prefer_cache for cached data or frozen for an explicit reproducible fixture run."),
          default: "refresh",
        },
      }, ["caseId", "strategyVersionId", "startDate", "endDate", "courtProfile"]),
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: execute(async (input, signal) => {
        const current = visibleCase(input);
        if (input.strategyVersionId !== store.activeVersion?.id) throw new Error("Use the active confirmed strategyVersionId returned by get_case_context.");
        if (input.startDate !== current.startDate || input.endDate !== current.endDate) throw new Error(`Use the locked case range ${current.startDate} through ${current.endDate}.`);
        const runId = await store.runCourt(input.dataSnapshotPolicy as DataSnapshotPolicy | undefined, "balanced", "agent", signal);
        if (!runId) throw new Error(store.error ?? "Court did not create a completed run.");
        const run = store.currentCase?.runs.find((item) => item.id === runId);
        return state(`Court run ${runId} completed. Call get_case_context, then inspect the weakest returned verdict.`, {
          changedRunId: runId,
          runId,
          runState: run?.status ?? "completed",
          progress: run?.progress ?? 100,
          dataSnapshotId: run?.dataSnapshotId ?? null,
          summaryLabel: run?.result?.summaryLabel ?? null,
        }, [runId]);
      }),
    });

    if (store.courtComplete) result.push(
      {
        name: "inspect_failure_period",
        title: "Inspect failure period",
        description: "Load trades, market regime, indicator values, costs, and equity evidence for one failure from the active completed Court run.",
        inputSchema: object({ runId: described(id, "Completed Court run ID from get_case_context."), failureId: described(id, "Failure ID attached to a returned verdict.") }, ["runId", "failureId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal) => {
          if (!store.currentCase?.runs.some((run) => run.id === input.runId)) throw new Error("Use a runId from the active case returned by get_case_context.");
          const failure = await store.inspectFailure(String(input.runId), String(input.failureId), "agent", signal);
          if (!failure) throw new Error(store.failureEvidenceError ?? "Failure evidence could not be loaded.");
          store.activeTab = "evidence";
          return state(`Loaded failure ${String(input.failureId)}. Use its evidence to form a bounded variant hypothesis.`, { failure });
        }),
      },
      {
        name: "create_strategy_variants",
        title: "Create strategy variants",
        description: "Create and evaluate one to three controlled variants of the active strategy after inspecting a concrete Court weakness.",
        inputSchema: withStrategy(object({ caseId, variants: { type: "array", minItems: 1, maxItems: 3, items: agentVariant, description: "One to three distinct hypotheses with exact structured patches." } }, ["caseId", "variants"])),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal) => {
          visibleCase(input);
          const before = new Set(store.variants.map((item: StrategyVersion) => item.id));
          const variants = transformAgentFormula(input.variants) as Array<Record<string, unknown>>;
          const ids = await store.createVariants(variants, "agent", signal);
          if (!ids.length) throw new Error(store.error ?? "No variants were created.");
          const changed = store.variants.filter((item: StrategyVersion) => !before.has(item.id)).map((item: StrategyVersion) => item.id);
          if (!changed.length) throw new Error("The variant request completed without returning new strategy version IDs.");
          store.activeTab = "variants";
          return state(`Created and evaluated ${changed.length} controlled variant${changed.length === 1 ? "" : "s"}. Compare every returned version next.`, { changedVersionIds: changed }, changed);
        }),
      },
      {
        name: "compare_strategy_versions",
        title: "Compare strategy versions",
        description: "Compare exact rule changes, metrics, verdicts, assumptions, and evaluation-contamination labels for two to four active-case versions.",
        inputSchema: object({ caseId, versionIds: { type: "array", minItems: 2, maxItems: 4, uniqueItems: true, items: versionId, description: "Two to four version IDs from the active case." } }, ["caseId", "versionIds"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal) => {
          const current = visibleCase(input);
          const ids = input.versionIds as string[];
          if (ids.some((candidate) => !current.versions.some((version) => version.id === candidate))) throw new Error("Every versionId must belong to the active case.");
          store.activeTab = "variants";
          const comparison = await agentApi(`/api/cases/${encodeURIComponent(current.id)}/comparison?versionIds=${encodeURIComponent(ids.join(","))}`, signal);
          return state("Compared all requested versions. Report failed variants as well as any improvement.", comparison);
        }),
      },
      {
        name: "start_replay_probation",
        title: "Start replay probation",
        description: "Start hidden-period replay for an eligible completed strategy version after comparing its Court result with the alternatives.",
        inputSchema: object({ caseId, strategyVersionId: versionId, startDate: described(date, "First reserved replay date."), endDate: described(date, "Last reserved replay date.") }, ["caseId", "strategyVersionId", "startDate", "endDate"]),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal) => {
          visibleCase(input);
          const requested = String(input.strategyVersionId);
          if (!store.eligibleReplayVersions.some((item) => item.id === requested)) throw new Error("Choose a version listed as replay-eligible by get_case_context.");
          const replayId = await store.startReplay(requested, { startDate: String(input.startDate), endDate: String(input.endDate) }, "agent", signal);
          if (!replayId) throw new Error(store.error ?? "Replay did not start.");
          return state(`Started replay probation ${replayId}. Read monitoring status before revealing more bars.`, { changedReplayId: replayId }, [replayId]);
        }),
      },
      {
        name: "export_case_report",
        title: "Export case report",
        description: "Return the machine-readable and human-readable report manifest for the active completed Court case.",
        inputSchema: object({ caseId }, ["caseId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal) => {
          const current = visibleCase(input);
          const report = await agentApi(`/api/reports/${encodeURIComponent(current.id)}`, signal);
          return state(`Returned the report manifest for case ${current.id}.`, report);
        }),
      },
    );

    if (store.replay) result.push({
      name: "get_monitoring_status",
      title: "Get monitoring status",
      description: "Read the active replay-probation state together with any saved latest-completed-bar evaluation. This tool does not fetch, advance, or persist market state.",
      inputSchema: webMcpSchemaContract.monitoringInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: execute(async (input, signal) => {
        visibleCase(input);
        const requested = String(input.strategyVersionId);
        const replay = store.replay;
        if (!replay || replay.versionId !== requested) throw new Error("Use the strategyVersionId from the active replay probation.");
        const [probation, monitoring] = await Promise.all([
          agentApi(`/api/replay/${encodeURIComponent(replay.id)}/status`, signal),
          store.loadMonitoringStatus(requested, { refresh: false, actor: "agent", signal }),
        ]);
        if (!monitoring) throw new Error(store.monitoringError ?? "Latest-bar monitoring could not be loaded.");
        return state(`Returned monitoring and replay-probation state for strategy version ${requested}.`, { probation, latestBar: monitoring });
      }),
    });

    if (store.replay) result.push(
      {
        name: "advance_replay",
        title: "Advance replay",
        description: "Reveal one bounded increment of the active hidden-period replay after reading its current monitoring status.",
        inputSchema: object({ replayId: described(id, "Active replay ID from get_case_context."), increment: replayIncrement }, ["replayId", "increment"]),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal) => {
          if (input.replayId !== store.replay?.id) throw new Error("Use the active replayId returned by get_case_context.");
          if (!await store.advanceReplay(input.increment as ReplayAdvanceMode, "agent", signal)) throw new Error(store.error ?? "Replay did not advance.");
          const replay = store.replay;
          if (!replay) throw new Error("The replay advanced, but its refreshed state is unavailable. Read the case context again.");
          return state(`Advanced replay ${replay.id} by ${String(input.increment).replaceAll("_", " ")}. Read monitoring status again before the next step.`, { changedReplayId: replay.id }, [replay.id]);
        }),
      },
    );
    return result;
  };

  const publish = (next: WebMcpRegistrationState) => {
    registration.value = next;
    store.webMcpStatus = next.status;
    store.webMcpExpectedToolNames = [...next.expectedToolNames];
    store.webMcpErrors = next.errors.map((error) => ({ ...error }));
    store.registeredToolNames = [...next.registeredToolNames];
    store.webMcpSupported = next.status === "ready";
  };

  const reconcile = async () => {
    if (disposed) return;
    if (!enabled.value) {
      disposeWebMcpTools(registrations);
      activeContext = null;
      publish({ status: "unsupported", expectedToolNames: [], registeredToolNames: [], errors: [] });
      return;
    }
    const desired = tools();
    const expectedToolNames = desired.map((tool) => tool.name);
    const context = document.modelContext;
    if (!context?.registerTool) {
      disposeWebMcpTools(registrations);
      activeContext = null;
      publish({ status: "unsupported", expectedToolNames, registeredToolNames: [], errors: [] });
      return;
    }
    if (activeContext !== context) {
      disposeWebMcpTools(registrations);
      activeContext = context;
    }
    const alreadyRegistered = expectedToolNames.filter((name) => registrations.get(name)?.ready);
    publish({ status: "registering", expectedToolNames, registeredToolNames: alreadyRegistered, errors: [] });
    const report = await reconcileWebMcpTools(context, desired, registrations);
    if (disposed) return;
    const complete = report.registeredToolNames.length === report.expectedToolNames.length;
    const status: WebMcpRegistrationStatus = complete
      ? "ready"
      : report.registeredToolNames.length > 0
        ? "partial"
        : "failed";
    publish({ status, ...report });
    report.errors.forEach((error) => console.warn(`WebMCP could not register ${error.toolName}: ${error.message}`));
  };

  const sync = () => {
    queue = queue.then(reconcile).catch((error: unknown) => {
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      const expectedToolNames = tools().map((tool) => tool.name);
      const registeredToolNames = expectedToolNames.filter((name) => registrations.get(name)?.ready);
      publish({
        status: registeredToolNames.length ? "partial" : "failed",
        expectedToolNames,
        registeredToolNames,
        errors: [{ toolName: "registration", message }],
      });
      console.warn(`WebMCP registration failed: ${message}`);
    });
  };

  watch(() => [enabled.value, store.currentCase?.id, store.confirmed, store.latestRun?.status, store.variants.length, store.replay?.id, store.monitoringCandidate?.id], sync, { immediate: true });
  const dispose = () => {
    disposed = true;
    disposeWebMcpTools(registrations);
    store.webMcpStatus = "unsupported";
    store.webMcpExpectedToolNames = [];
    store.webMcpErrors = [];
    store.webMcpSupported = false;
    store.registeredToolNames = [];
  };
  if (getCurrentScope()) onScopeDispose(dispose);
  return readonly(registration);
}
