import {
  EXECUTABLE_INDICATOR_IDS,
  PRICE_SOURCES,
  courtRunRequestJsonSchema,
  replayAdvanceJsonSchema,
  strategyDefinitionJsonSchema,
  variantRequestsJsonSchema,
  decisionFieldsSchema,
  parseDecisionFields,
  type DataSnapshotPolicy,
  type ReplayAdvanceMode,
} from "@strategy-court/schemas";
import { getCurrentScope, onScopeDispose, readonly, ref, watch, type DeepReadonly, type Ref } from "vue";
import { ApiError, apiRequest, unwrap } from "@/services/api";
import { normalizeCase, useCourtStore } from "@/stores/court";
import { caseListPage, catalogPage, reportBrief, ToolResults } from "@/webmcp/results";
import type { CaseInput, StrategyDefinition, StrategyVersion } from "@/types";
import { validateCaseIntake } from "@/lib/case-intake-validation";
import { investigationGuidance } from "@/services/investigationGuidance";
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
const sharedRun = cloneObjectSchema(courtRunRequestJsonSchema);
const sharedDateRange = sharedRun.properties.dateRange as ObjectSchema;
const date = described(sharedDateRange.properties.start!, "Calendar date in YYYY-MM-DD format. Must match the active case range.");
const caseIntakeProperties = {
  requestId: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9_-]+$" },
  name: { type: "string", minLength: 3, maxLength: 90 }, description: { type: "string", minLength: 20, maxLength: 2000 },
  symbols: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: { type: "string" } },
  startDate: date, endDate: date, initialCapital: { type: "number", minimum: 1000, maximum: 10000000 },
  commissionBpsPerSide: { type: "number", minimum: 0, maximum: 100 }, slippageBpsPerSide: { type: "number", minimum: 0, maximum: 100 },
};
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
const catalogIndicatorId = described(oneOf(
  { type: "string", enum: [...EXECUTABLE_INDICATOR_IDS] },
  customIndicatorId,
), "Built-in or owner-scoped indicator ID returned by list_indicator_catalog.");
const argumentName = described({ type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" }, "Parameter name from list_indicator_catalog.");
const indicatorCall = (indicator: Schema, valueRef: string): Schema => object({
  indicator,
  arguments: {
    type: "array",
    maxItems: 20,
    items: object({ name: argumentName, value: { $ref: valueRef } }, ["name", "value"]),
    description: "Named parameter values from list_indicator_catalog. Use an empty array when the indicator has no parameters.",
  },
}, ["indicator", "arguments"]);

const strategyArgument = oneOf(
  { type: "number", minimum: -1e12, maximum: 1e12 },
  { type: "boolean" },
  { type: "string", minLength: 1, maxLength: 64 },
  { $ref: "#/$defs/value" },
);
const agentValueExpression = oneOf(
  object({ constant: { type: "number", minimum: -1e12, maximum: 1e12 } }, ["constant"]),
  object({ source }, ["source"]),
  indicatorCall(catalogIndicatorId, "#/$defs/argument"),
  object({ lag: object({ value: { $ref: "#/$defs/value" }, bars: { type: "integer", minimum: 0, maximum: 2520 } }, ["value", "bars"]) }, ["lag"]),
  object({ operation: { enum: ["add", "subtract", "multiply", "divide", "min", "max"] }, left: { $ref: "#/$defs/value" }, right: { $ref: "#/$defs/value" } }, ["operation", "left", "right"]),
  object({ absolute: { $ref: "#/$defs/value" } }, ["absolute"]),
);
const agentCondition = oneOf(
  object({ all: { type: "array", minItems: 1, maxItems: 5, items: { $ref: "#/$defs/condition" } } }, ["all"]),
  object({ any: { type: "array", minItems: 1, maxItems: 5, items: { $ref: "#/$defs/condition" } } }, ["any"]),
  object({ not: { $ref: "#/$defs/condition" } }, ["not"]),
  object({ left: { $ref: "#/$defs/value" }, operator: comparisonOperator, right: { $ref: "#/$defs/value" } }, ["left", "operator", "right"]),
  indicatorCall(customIndicatorId, "#/$defs/argument"),
);
const strategyDefs: Record<string, Schema> = {
  definition,
  value: agentValueExpression,
  condition: agentCondition,
  argument: strategyArgument,
};
const withStrategy = (schema: Schema): Schema => ({ ...schema, $defs: strategyDefs });

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
  indicatorCall(catalogIndicatorId, "#/$defs/formulaArgument"),
  object({ lag: object({ value: { $ref: "#/$defs/formula" }, bars: { type: "integer", minimum: 0, maximum: 2520 } }, ["value", "bars"]) }, ["lag"]),
  object({ operation: { type: "string", enum: ["add", "subtract", "multiply", "divide", "min", "max"] }, left: { $ref: "#/$defs/formula" }, right: { $ref: "#/$defs/formula" } }, ["operation", "left", "right"]),
  object({ absolute: { $ref: "#/$defs/formula" } }, ["absolute"]),
);
const formulaArgument = oneOf(
  { type: "number", minimum: -1e12, maximum: 1e12 },
  { type: "boolean" },
  { type: "string", minLength: 1, maxLength: 64 },
);
const indicatorDependencies: Schema = {
  type: "array",
  maxItems: 20,
  uniqueItems: true,
  items: id,
  description: "All built-in or owner-scoped custom indicator IDs referenced anywhere in the formula.",
};
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
      if (!argumentValue || typeof argumentValue !== "object" || Array.isArray(argumentValue)) throw new Error("Every indicator argument must be a name/value object.");
      const argument = argumentValue as Record<string, unknown>;
      const name = String(argument.name ?? "");
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) throw new Error(`Indicator argument name ${name || "(empty)"} is invalid.`);
      if (Object.hasOwn(parameters, name)) throw new Error(`Duplicate indicator argument ${name}.`);
      parameters[name] = transformAgentFormula(argument.value);
    }
    return { indicator: node.indicator, parameters };
  }
  return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, transformAgentFormula(item)]));
}

function nextActions(store: ReturnType<typeof useCourtStore>): string[] {
  if (!store.currentCase) return ["Use create_case with the user's stated idea and reviewed test settings, or open an existing case in the app."];
  if (!store.activeVersion) return ["Call create_strategy_draft for the active case."];
  if (!store.confirmed) return ["Ask the user to review and confirm the visible strategy interpretation. Confirmation is intentionally user-controlled."];
  if (store.running) return ["Call get_case_context to check the queued or running Court result. Do not start a duplicate run."];
  if (store.courtInvalid) return ["Read the invalid reason in get_case_context. Correct the data configuration, then retry run_court."];
  if (!store.courtComplete) return ["Call run_court with the active version and the case's locked date range."];
  const guidance = investigationGuidance(store.recordedDecision, store.result?.summaryLabel);
  return [guidance.detail];
}

function snapshot(store: ReturnType<typeof useCourtStore>) {
  return {
    caseId: store.currentCase?.id ?? null,
    activeVersionId: store.activeVersion?.id ?? null,
    confirmed: store.confirmed,
    courtStatus: store.latestRun?.status ?? "not_started",
    summaryLabel: store.result?.summaryLabel ?? null,
    activeTab: store.activeTab,
    evidenceSelection: store.evidenceSelection ? { ...store.evidenceSelection, inspectorVisible: store.activeTab === "evidence", focus: store.evidenceFocus } : null,
    decision: store.recordedDecision ? { id: store.recordedDecision.id, outcome: store.recordedDecision.outcome, runId: store.recordedDecision.runId } : null,
    decisionDraftId: store.decisionDraft?.id ?? null,
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

interface ToolResponseContext {
  state(message: string, data: unknown, changedIds?: string[]): unknown;
  reference(data: unknown): ReturnType<ToolResults["reference"]>;
  rebase(): void;
}
type ToolHandler = (input: Record<string, unknown>, signal: AbortSignal, response: ToolResponseContext) => Promise<unknown>;

export type WebMcpRegistrationStatus = "unsupported" | "registering" | "ready" | "partial" | "failed";
export interface WebMcpRegistrationState {
  status: WebMcpRegistrationStatus;
  expectedToolNames: string[];
  registeredToolNames: string[];
  errors: WebMcpRegistrationFailure[];
}

export function useWebMcp(
  enabled: Readonly<Ref<boolean>> = ref(true),
  navigateToCase?: (caseId: string) => Promise<unknown>,
  accountId?: Readonly<Ref<string | null>>,
): DeepReadonly<Ref<WebMcpRegistrationState>> {
  const store = useCourtStore();
  const registration = ref<WebMcpRegistrationState>({ status: "registering", expectedToolNames: [], registeredToolNames: [], errors: [] });
  const registrations: WebMcpRegistrations = new Map();
  const results = new ToolResults();
  let accountGeneration = 0;
  watch([
    () => enabled.value,
    () => accountId?.value ?? null,
    () => store.currentCase?.id,
  ], () => results.clear(), { flush: "sync" });
  if (accountId) watch(accountId, (next, previous) => {
    if (next === previous) return;
    accountGeneration += 1;
    store.clearCaseSession();
  }, { flush: "sync" });
  let activeContext: ModelContext | null = null;
  let disposed = false;
  let queue = Promise.resolve();

  const state = (scope: number, message: string, data: unknown, changedIds: string[] = []) => {
    const envelope = { ok: true, message, changedIds, currentState: snapshot(store) };
    return { ...envelope, data: results.pack(data, envelope, scope) };
  };
  const execute = (handler: ToolHandler): ModelContextTool["execute"] => async (input, options) => {
    const signal = options?.signal ?? new AbortController().signal;
    const executionAccount = accountGeneration;
    let resultScope = results.scope();
    const response: ToolResponseContext = {
      state: (message, data, changedIds = []) => state(resultScope, message, data, changedIds),
      reference: data => results.reference(data, resultScope),
      rebase: () => { resultScope = results.scope(); },
    };
    try {
      signal.throwIfAborted();
      const result = await handler(input, signal, response);
      signal.throwIfAborted();
      if (executionAccount !== accountGeneration || !results.isCurrent(resultScope)) {
        throw new DOMException("The account or case changed while this tool was running.", "AbortError");
      }
      return result;
    } catch (error) {
      if (signal.aborted || executionAccount !== accountGeneration || !results.isCurrent(resultScope)) throw signal.reason ?? error;
      const message = (error instanceof Error ? error.message : "The tool could not complete the request.").slice(0, 1000);
      const apiError = error instanceof ApiError ? error : null;
      store.error = message;
      let details: unknown = null;
      try {
        details = results.pack(apiError?.details ?? null, { message, currentState: snapshot(store) }, resultScope);
      } catch {
        details = { omitted: true, reason: "Error details exceed the browser evidence cache." };
      }
      return {
        ok: false,
        message,
        error: { code: apiError?.code ?? "TOOL_EXECUTION_FAILED", details },
        changedIds: [],
        currentState: snapshot(store),
      };
    }
  };
  const agentApi = (path: string, signal: AbortSignal, init: RequestInit = {}) => apiRequest<unknown>(path, { ...init, signal }, "agent");
  const caseListPath = (input: Record<string, unknown>) => {
    if (input.query !== undefined && typeof input.query !== "string") throw new Error("query must be a string.");
    const query = String(input.query ?? "").trim();
    const offset = input.offset === undefined ? 0 : Number(input.offset);
    const limit = input.limit === undefined ? 10 : Number(input.limit);
    if (query.length > 100) throw new Error("query must contain at most 100 characters.");
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
      throw new Error("Use a nonnegative offset and a limit from 1 to 10.");
    }
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (query) params.set("query", query);
    return `/api/cases?${params}`;
  };
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
        name: "list_cases",
        title: "List investigations",
        description: "List the signed-in user's recent Strategy Court cases. Search by name, description, or symbol, then use open_case with an exact ID.",
        inputSchema: object({
          query: { type: "string", maxLength: 100 },
          offset: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 10 },
        }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => response.state(
          "Returned recent investigations. Use open_case with an exact case ID to continue in the visible app.",
          caseListPage(await agentApi(caseListPath(input), signal)),
        )),
      },
      {
        name: "open_case",
        title: "Open investigation",
        description: "Open an owned Strategy Court case in the visible app. Use a case ID returned by list_cases.",
        inputSchema: object({ caseId: described(id, "Owned case ID returned by list_cases.") }, ["caseId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => {
          const requestedId = String(input.caseId);
          if (!await store.loadCase(requestedId, "agent", signal, true) || store.currentCase?.id !== requestedId) {
            throw new Error(store.error ?? "The requested case could not be opened.");
          }
          const current = store.currentCase;
          if (!navigateToCase) throw new Error("This app session cannot navigate to a case.");
          store.prepareCaseRouteHandoff(current.id);
          try {
            await navigateToCase(current.id);
          } catch (error) {
            store.consumeCaseRouteHandoff(current.id);
            throw error;
          }
          if (store.currentCase?.id !== current.id) throw new DOMException("Case navigation changed before the investigation opened.", "AbortError");
          response.rebase();
          return response.state(`Opened case ${current.id}. The returned state is the loaded visible investigation.`, {
            case: {
              id: current.id,
              name: current.name,
              description: current.description,
              symbols: current.symbols,
              startDate: current.startDate,
              endDate: current.endDate,
              status: current.status,
              activeVersionId: current.activeVersionId,
            },
            path: `/case/${current.id}`,
            opened: true,
          });
        }),
      },
      {
        name: "create_case", title: "Create case",
        description: "Create and open a case from the user's stated trading idea and proposed test settings. Do not invent missing entry or exit rules. This saves setup only; draft exact rules separately and leave confirmation to the user. Reuse requestId on retries.",
        inputSchema: object(caseIntakeProperties, Object.keys(caseIntakeProperties)),
        annotations:{readOnlyHint:false,untrustedContentHint:true},
        execute: execute(async (input,signal,response) => {
          if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected case settings as an object.");
          const unknownFields = Object.keys(input).filter(key => !Object.hasOwn(caseIntakeProperties, key));
          if (unknownFields.length) throw new Error(`Unsupported case fields: ${unknownFields.join(", ")}.`);
          const requestId = input.requestId;
          const key = caseIntakeProperties.requestId;
          if (typeof requestId !== "string" || requestId.length < key.minLength || requestId.length > key.maxLength || !new RegExp(key.pattern).test(requestId)) {
            throw new Error("requestId must contain 8 to 120 letters, numbers, underscores or hyphens. Reuse it when retrying the same settings.");
          }
          for (const field of ["name", "description"] as const) {
            if (typeof input[field] === "string" && input[field].length > caseIntakeProperties[field].maxLength) throw new Error(`${field} exceeds the allowed length.`);
          }
          const errors = validateCaseIntake(input as unknown as CaseInput,new Date().toISOString().slice(0,10));
          if (Object.keys(errors).length) throw new Error(Object.values(errors).join(" "));
          const id = await store.createCase(input as unknown as CaseInput,false,"agent",signal,requestId);
          if (!id) throw new Error(store.error ?? "Case creation failed.");
          let opened = false;
          try { if (navigateToCase) { store.prepareCaseRouteHandoff(id); await navigateToCase(id); opened = true; } } catch { store.consumeCaseRouteHandoff(id); /* The case is saved; never create again just to navigate. */ }
          if (store.currentCase?.id !== id) throw new DOMException("Case navigation changed after creation.", "AbortError");
          response.rebase();
          return response.state(opened ? "Case opened. Read the indicator catalog, then draft the exact rules for human review." : `Case saved. Open /case/${id} to continue; do not repeat creation.`,
            {caseId:id,path:`/case/${id}`,opened,settings:store.currentCase ? {symbols:store.currentCase.symbols,startDate:store.currentCase.startDate,endDate:store.currentCase.endDate,initialCapital:store.currentCase.initialCapital,costs:store.caseCosts} : null},[id]);
        }),
      },
      {
        name: "get_case_context",
        title: "Get case context",
        description: "Read case IDs, locked settings, verdicts, and next actions. Use detail=strategy for exact active rules without price history, or detail=full for all evidence in pages.",
        inputSchema: object({ caseId: optionalCaseId, detail: { type: "string", enum: ["summary", "strategy", "full"], default: "summary" } }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => {
          const requestedId = typeof input.caseId === "string" && input.caseId ? input.caseId : store.currentCase?.id;
          if (!requestedId) return response.state("No case is active. Use create_case with the user's stated idea, or open an existing case.", { case: null });
          let current;
          if (store.currentCase?.id === requestedId) {
            if (!await store.refreshCase("agent", signal)) throw new Error(store.error ?? "The active case could not be refreshed.");
            current = store.currentCase!;
          } else {
            current = normalizeCase(unwrap(await agentApi(`/api/cases/${encodeURIComponent(requestedId)}`, signal), "case"));
          }
          const activeVersionId = current.id === store.currentCase?.id ? store.activeVersion?.id : current.activeVersionId;
          const latest = current.runs.find(run => run.versionId === activeVersionId);
          const summary = {
            id: current.id, name: current.name, description: current.description,
            sampleId: current.sampleId ?? null,
            suggestedDataPolicy: current.sampleId ? "saved_sample" : "refresh",
            evidenceSelection: current.id === store.currentCase?.id ? store.evidenceSelection : null,
            decisions: (current.decisions ?? []).filter(item => item.runId === latest?.id),
            evidenceIds: latest?.result ? { verdicts: latest.result.verdicts.map(item=>({kind:"verdict",id:item.id})), failures: latest.result.failures.map(item=>({kind:"failure",id:item.id})), trades: latest.result.trades.map(item=>({kind:"trade",id:item.id,symbol:item.symbol,entryDate:item.entryDate,exitDate:item.exitDate})) } : null,
            symbols: current.symbols, startDate: current.startDate, endDate: current.endDate, initialCapital: current.initialCapital,
            activeVersionId,
            versions: current.versions.slice(-10).map(version => ({ id: version.id, name: version.definition.name, confirmed: Boolean(version.confirmed || version.confirmedAt), evaluationInformed: version.evaluationInformed })),
            versionCount: current.versions.length,
            latestRun: latest ? { id: latest.id, versionId: latest.versionId, status: latest.status, progress: latest.progress, error: latest.error,
              summaryLabel: latest.result?.summaryLabel, metrics: latest.result?.metrics, verdicts: latest.result?.verdicts, invalidReason: latest.result?.invalidReason } : null,
            runCount: current.runs.length,
            replayEligibleVersionIds: current.versions.filter(version => {
              const run = current.runs.find(item => item.versionId === version.id && item.status === "completed" && item.result);
              return run && !["invalid", "fragile", "reject"].includes(String(run.result?.summaryLabel).toLowerCase());
            }).map(version => version.id),
            replay: current.replays[0] ? { id: current.replays[0].id, versionId: current.replays[0].versionId, status: current.replays[0].status } : null,
          };
          const strategy = {
            id: current.id, activeVersionId,
            version: current.versions.find(version => version.id === activeVersionId) ?? null,
          };
          return response.state(`Returned case ${requestedId}. Mutations require this case to be open in the app.`, { case: input.detail === "full" ? current : input.detail === "strategy" ? strategy : summary });
        }),
      },
      {
        name: "list_indicator_catalog",
        title: "List indicator catalog",
        description: "Search or page indicator summaries. Pass ids to retrieve exact parameters and allowed sources before drafting. Large details use read_tool_result pages.",
        inputSchema: object({
          query: { type: "string", maxLength: 100 },
          ids: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: id },
          offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 10 },
        }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => response.state(
          "Returned the requested indicator page. Follow nextOffset for more; pass ids for exact parameters.",
          catalogPage(await agentApi("/api/indicators", signal), input),
        )),
      },
      {
        name: "read_tool_result", title: "Read tool result",
        description: "Read a bounded page of a large tool result. Concatenate jsonText pages in offset order, then parse JSON. Results expire after five minutes or when the case/session changes.",
        inputSchema: object({ resultId: id, offset: { type: "integer", minimum: 0, default: 0 } }, ["resultId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async input => ({
          ok: true,
          message: "Returned one result page. Continue at nextOffset until it is null.",
          changedIds: [],
          currentState: snapshot(store),
          data: results.read(String(input.resultId), Number(input.offset ?? 0)),
        })),
      },
      {
        name: "create_strategy_draft",
        title: "Create strategy draft",
        description: "Create a new unconfirmed structured strategy draft for the active case. Call list_indicator_catalog first and pass each indicator's named parameters as an arguments array. The user must still review and confirm the result.",
        inputSchema: withStrategy(object({
          caseId,
          definition: { $ref: "#/$defs/definition", description: "Strict deterministic strategy definition derived from the user's stated rules." },
          interpretation: { type: "string", minLength: 1, maxLength: 4000, description: "Plain-language explanation of the exact rules, assumptions, and unresolved ambiguity." },
        }, ["caseId", "definition", "interpretation"])),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal, response) => {
          const current = visibleCase(input);
          const before = new Set(current.versions.map((item) => item.id));
          const resolved = transformAgentFormula(input.definition) as StrategyDefinition;
          if (!await store.createDraft(resolved, String(input.interpretation), "agent", signal)) throw new Error(store.error ?? "Draft creation failed.");
          const changed = store.currentCase?.versions.filter((item) => !before.has(item.id)).map((item) => item.id) ?? [];
          if (!changed.length) throw new Error("The draft request completed without returning a new strategy version ID.");
          store.activeTab = "strategy";
          return response.state(`Created unconfirmed strategy draft ${changed[0]}. Ask the user to review and confirm it before running the Court.`, { changedVersionIds: changed }, changed);
        }),
      },
      {
        name: "create_custom_indicator",
        title: "Create custom indicator",
        description: "Create a reusable safe formula-tree indicator. Call list_indicator_catalog first and pass indicator parameters as named arguments. Use this only when the built-in catalog cannot express the user's rule.",
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
        execute: execute(async (input, signal, response) => {
          const apiResponse = await agentApi("/api/indicators", signal, { method: "POST", body: JSON.stringify({ ...input, formula: transformAgentFormula(input.formula) }) });
          const indicator = unwrap<Record<string, unknown>>(apiResponse, "indicator");
          const changed = indicator?.id ? [String(indicator.id)] : [];
          if (!changed.length) throw new Error("The API did not return a created indicator ID.");
          return response.state(
            `Created custom indicator ${changed[0]}. Owner-scoped strategy drafts can reference this ID and the server compiles it into the immutable strategy tree.`,
            { indicator, strategyExecutionSupported: true },
            changed,
          );
        }),
      },
    ];

    if (!store.currentCase) {
      const deferredUntilCaseOpen = new Set([
        "get_case_context",
        "list_indicator_catalog",
        "create_strategy_draft",
        "create_custom_indicator",
      ]);
      return result.filter((tool) => !deferredUntilCaseOpen.has(tool.name));
    }

    if (store.confirmed) {
      const draftIndex = result.findIndex((tool) => tool.name === "create_strategy_draft");
      if (draftIndex >= 0) result.splice(draftIndex, 1);
      result.push({
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
            ...described(sharedRun.properties.dataSnapshotPolicy!, "Use saved_sample for a prepared sample, refresh for a fresh Alpaca request, prefer_cache for compatible cached real data, or frozen for synthetic software testing."),
            default: store.currentCase?.sampleId ? "saved_sample" : "refresh",
          },
        }, ["caseId", "strategyVersionId", "startDate", "endDate", "courtProfile"]),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal, response) => {
          const current = visibleCase(input);
          if (input.strategyVersionId !== store.activeVersion?.id) throw new Error("Use the active confirmed strategyVersionId returned by get_case_context.");
          if (input.startDate !== current.startDate || input.endDate !== current.endDate) throw new Error(`Use the locked case range ${current.startDate} through ${current.endDate}.`);
          const policy = input.dataSnapshotPolicy as DataSnapshotPolicy | undefined ?? (current.sampleId ? "saved_sample" : "refresh");
          const runId = await store.runCourt(policy, "balanced", "agent", signal);
          if (!runId) throw new Error(store.error ?? "Court did not create a completed run.");
          const run = store.currentCase?.runs.find((item) => item.id === runId);
          return response.state(`Court run ${runId} ended with status ${run?.status ?? "unknown"}. Call get_case_context for its verdicts or invalid reason.`, {
            changedRunId: runId,
            runId,
            runState: run?.status ?? "completed",
            progress: run?.progress ?? 100,
            dataSnapshotId: run?.dataSnapshotId ?? null,
            summaryLabel: run?.result?.summaryLabel ?? null,
          }, [runId]);
        }),
      });
    }

    if (store.courtComplete && !store.courtInvalid) result.push(
      {
        name:"propose_case_decision",title:"Propose investigation decision",
        description:"Save a private draft conclusion citing this run's evidence. The user reviews and confirms it in the Court screen. A rejection is a valid outcome; do not automatically optimize a weak strategy.",
        inputSchema: object({caseId,runId:id,fields:decisionFieldsSchema,requestId:{type:"string",minLength:8,maxLength:120,pattern:"^[A-Za-z0-9_-]+$"}},["caseId","runId","fields","requestId"]),
        annotations:{readOnlyHint:false,untrustedContentHint:true},
        execute:execute(async (input,signal,response)=>{
          visibleCase(input);
          if (input.runId !== store.latestRun?.id) throw new Error("Use the currently displayed completed run.");
          const decision = await store.proposeDecision(parseDecisionFields(input.fields),String(input.requestId),"agent",signal);
          if (!decision) throw new Error(store.decisionError ?? "Could not save decision draft.");
          return response.state("Decision draft saved. Ask the user to review and confirm it in the Court screen.",{decision},[decision.id]);
        }),
      },
      {
        name:"inspect_trade",title:"Inspect trade",
        description:"Select one trade in the displayed completed run and focus its chart period. Read assumptions and historical bars for that exact trade.",
        inputSchema:object({runId:id,tradeId:id},["runId","tradeId"]),
        annotations:{readOnlyHint:true,untrustedContentHint:true},
        execute:execute(async(input,signal,response)=>{
          await store.selectEvidence(String(input.runId),{kind:"trade",id:String(input.tradeId)},"agent",signal);
          const trade = store.selectedTrade;
          if (!trade) return response.state("Selection changed while inspecting. Read the current context.",{trade:null});
          return response.state("Selected the trade in the visible inspector and chart.",{trade,assumptions:store.result?.assumptions,
            marketBars:store.result?.marketEvidence[trade.symbol]?.filter(bar=>bar.date>=trade.entryDate && bar.date<=trade.exitDate),
            relatedFailureIds:store.result?.failures.filter(item=>item.dateRange && item.dateRange.start<=trade.exitDate && item.dateRange.end>=trade.entryDate && item.symbols.includes(trade.symbol)).map(item=>item.id)});
        }),
      },
      {
        name: "inspect_failure_period",
        title: "Inspect failure period",
        description: "Load trades, market regime, indicator values, costs, and equity evidence for one failure from the active completed Court run.",
        inputSchema: object({ runId: described(id, "Completed Court run ID from get_case_context."), failureId: described(id, "Failure ID attached to a returned verdict.") }, ["runId", "failureId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => {
          const failure = await store.selectEvidence(String(input.runId), {kind:"failure",id:String(input.failureId)}, "agent", signal);
          return response.state(failure ? `Selected failure ${String(input.failureId)}. Use the evidence to assess whether to stop or investigate further.` : "Selection changed during inspection. Read the current context.", { failure });
        }),
      },
      {
        name: "create_strategy_variants",
        title: "Create strategy variants",
        description: "Create and evaluate one to three controlled variants of the active strategy after inspecting a concrete Court weakness.",
        inputSchema: withStrategy(object({ caseId, variants: { type: "array", minItems: 1, maxItems: 3, items: agentVariant, description: "One to three distinct hypotheses with exact structured patches." } }, ["caseId", "variants"])),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal, response) => {
          visibleCase(input);
          const before = new Set(store.variants.map((item: StrategyVersion) => item.id));
          const variants = transformAgentFormula(input.variants) as Array<Record<string, unknown>>;
          const ids = await store.createVariants(variants, "agent", signal);
          if (!ids.length) throw new Error(store.error ?? "No variants were created.");
          const changed = store.variants.filter((item: StrategyVersion) => !before.has(item.id)).map((item: StrategyVersion) => item.id);
          if (!changed.length) throw new Error("The variant request completed without returning new strategy version IDs.");
          store.activeTab = "variants";
          return response.state(`Created and evaluated ${changed.length} controlled variant${changed.length === 1 ? "" : "s"}. Compare every returned version next.`, { changedVersionIds: changed }, changed);
        }),
      },
      {
        name: "compare_strategy_versions",
        title: "Compare strategy versions",
        description: "Compare exact rule changes, metrics, verdicts, assumptions, and evaluation-contamination labels for two to four active-case versions.",
        inputSchema: object({ caseId, versionIds: { type: "array", minItems: 2, maxItems: 4, uniqueItems: true, items: versionId, description: "Two to four version IDs from the active case." } }, ["caseId", "versionIds"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => {
          const current = visibleCase(input);
          const ids = input.versionIds as string[];
          if (ids.some((candidate) => !current.versions.some((version) => version.id === candidate))) throw new Error("Every versionId must belong to the active case.");
          store.activeTab = "variants";
          const comparison = await agentApi(`/api/cases/${encodeURIComponent(current.id)}/comparison?versionIds=${encodeURIComponent(ids.join(","))}`, signal);
          return response.state("Compared all requested versions. Report failed variants as well as any improvement.", comparison);
        }),
      },
      {
        name: "start_replay_probation",
        title: "Start replay probation",
        description: "Start hidden-period replay for an eligible completed strategy version after reviewing its Court evidence. Prepared samples require a pinned replay snapshot. Recording a decision does not start replay.",
        inputSchema: object({ caseId, strategyVersionId: versionId, startDate: described(date, "First reserved replay date."), endDate: described(date, "Last reserved replay date.") }, ["caseId", "strategyVersionId", "startDate", "endDate"]),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal, response) => {
          visibleCase(input);
          const requested = String(input.strategyVersionId);
          if (!store.eligibleReplayVersions.some((item) => item.id === requested)) throw new Error("Choose a version listed as replay-eligible by get_case_context.");
          const replayId = await store.startReplay(requested, { startDate: String(input.startDate), endDate: String(input.endDate) }, "agent", signal);
          if (!replayId) throw new Error(store.error ?? "Replay did not start.");
          return response.state(`Started replay probation ${replayId}. Read monitoring status before revealing more bars.`, { changedReplayId: replayId }, [replayId]);
        }),
      },
      {
        name: "export_case_report",
        title: "Export case report",
        description: "Return the machine-readable and human-readable report manifest for the active completed Court case.",
        inputSchema: object({ caseId }, ["caseId"]),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: execute(async (input, signal, response) => {
          const current = visibleCase(input);
          const run = store.latestRun;
          if (!run || run.status !== "completed" || !run.result) throw new Error("The active version has no completed report.");
          const report = unwrap<Record<string, unknown>>(await agentApi(`/api/reports/${encodeURIComponent(run.id)}`, signal), "report");
          const message = `Returned a compact report brief for run ${run.id}. Read every manifest page before claiming full provenance.`;
          const manifest = response.reference(report);
          return {
            ok: true,
            message,
            changedIds: [],
            currentState: snapshot(store),
            data: { summary: reportBrief(report), manifest },
          };
        }),
      },
    );

    if (store.monitoringCandidate) result.push({
      name: "get_monitoring_status",
      title: "Get monitoring status",
      description: "Read saved latest-completed-bar evidence for a confirmed version, plus its replay if present. Does not fetch new prices. Use refresh_monitoring for a new evaluation.",
      inputSchema: webMcpSchemaContract.monitoringInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: execute(async (input, signal, response) => {
        visibleCase(input);
        const requested = String(input.strategyVersionId);
        const replay = store.replay;
        const [probation, monitoring] = await Promise.all([
          replay?.versionId === requested ? agentApi(`/api/replay/${encodeURIComponent(replay.id)}/status`, signal) : Promise.resolve(null),
          store.loadMonitoringStatus(requested, { refresh: false, actor: "agent", signal }),
        ]);
        if (!monitoring) throw new Error(store.monitoringError ?? "Latest-bar monitoring could not be loaded.");
        return response.state(`Returned monitoring and replay-probation state for strategy version ${requested}.`, { probation, latestBar: monitoring });
      }),
    }, {
      name: "refresh_monitoring", title: "Refresh monitoring",
      description: "Fetch market data and persist a new latest-completed-bar evaluation for a confirmed version. Use only when the user requests a fresh check. Does not advance replay or place orders.",
      inputSchema: object({ caseId, strategyVersionId: versionId, dataSnapshotPolicy: { type: "string", enum: ["refresh", "frozen"], default: "refresh" } }, ["caseId", "strategyVersionId"]),
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: execute(async (input, signal, response) => {
        visibleCase(input);
        const monitoring = await store.loadMonitoringStatus(String(input.strategyVersionId), { refresh: true, dataSnapshotPolicy: input.dataSnapshotPolicy as "refresh" | "frozen" | undefined, actor: "agent", signal });
        if (!monitoring) throw new Error(store.monitoringError ?? "Latest-bar monitoring could not be refreshed.");
        store.activeTab = "probation";
        return response.state("Saved a latest-bar evaluation. Historical replay was not advanced.", monitoring, store.monitoringEvaluation?.id ? [store.monitoringEvaluation.id] : []);
      }),
    });

    if (store.replay) result.push(
      {
        name: "advance_replay",
        title: "Advance replay",
        description: "Reveal one bounded increment of the active hidden-period replay after reading its current monitoring status.",
        inputSchema: object({ replayId: described(id, "Active replay ID from get_case_context."), increment: replayIncrement }, ["replayId", "increment"]),
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: execute(async (input, signal, response) => {
          if (input.replayId !== store.replay?.id) throw new Error("Use the active replayId returned by get_case_context.");
          if (!await store.advanceReplay(input.increment as ReplayAdvanceMode, "agent", signal)) throw new Error(store.error ?? "Replay did not advance.");
          const replay = store.replay;
          if (!replay) throw new Error("The replay advanced, but its refreshed state is unavailable. Read the case context again.");
          return response.state(`Advanced replay ${replay.id} by ${String(input.increment).replaceAll("_", " ")}. Read monitoring status again before the next step.`, { changedReplayId: replay.id }, [replay.id]);
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
      store.clearCaseSession();
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

  watch(() => [enabled.value, accountId?.value ?? null, store.currentCase?.id, store.confirmed, store.latestRun?.status, store.variants.length, store.replay?.id, store.monitoringCandidate?.id], sync, { immediate: true });
  const dispose = () => {
    disposed = true;
    results.clear();
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
