import {
  parseStrategyDefinition,
  parseVariantRequests,
  type BacktestMetrics,
  type CourtCategory,
  type StrategyDefinition,
  type StrategyDifference,
  type StrategyPatch,
  type StrategyVariantRequest,
  type StrategyVersionRecord,
  type StrategyVersionResult,
  type VersionComparison,
  type VerdictStatus,
} from "@strategy-court/schemas";

export interface CreateVariantsOptions {
  evaluationViewed?: boolean;
  existingAttemptCount?: number;
  source?: "user" | "agent";
}

export function applyStrategyPatch(baseline: StrategyDefinition, patch: StrategyPatch): StrategyDefinition {
  const definition: StrategyDefinition = {
    ...structuredClone(baseline),
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.entry === undefined ? {} : { entry: structuredClone(patch.entry) }),
    ...(patch.exit === undefined ? {} : { exit: structuredClone(patch.exit) }),
    risk: { ...structuredClone(baseline.risk), ...structuredClone(patch.risk ?? {}) },
    costs: { ...structuredClone(baseline.costs), ...structuredClone(patch.costs ?? {}) },
  };
  for (const record of [definition.risk, definition.costs]) {
    for (const key of Object.keys(record) as Array<keyof typeof record>) if (record[key] === undefined) delete record[key];
  }
  const parsed = parseStrategyDefinition(definition);
  if (diffStrategies(baseline, parsed).length === 0) throw new RangeError("Variant patch must change the strategy definition");
  return parsed;
}

export function createVariants(
  baseline: StrategyVersionRecord,
  candidateRequests: unknown,
  options: CreateVariantsOptions = {},
): StrategyVersionRecord[] {
  const requests = parseVariantRequests(candidateRequests);
  const existing = options.existingAttemptCount ?? 0;
  if (existing < 0 || existing + requests.length > 3) throw new RangeError("An investigation may contain at most three variants");
  const definitions = requests.map((request) => applyStrategyPatch(baseline.definition, request.patch));
  return requests.map((request, index) => ({
    id: `${baseline.id}-variant-${existing + index + 1}`,
    version: baseline.version + existing + index + 1,
    parentVersionId: baseline.id,
    definition: definitions[index] as StrategyDefinition,
    source: options.source ?? "agent",
    evaluationInformed: options.evaluationViewed ?? false,
    hypothesis: request.hypothesis,
    rationale: request.rationale,
    expectedWeaknessAddressed: request.expectedWeaknessAddressed,
  }));
}

function walkDifferences(before: unknown, after: unknown, path: string, result: StrategyDifference[]): void {
  if (Object.is(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) walkDifferences(before[index], after[index], `${path}/${index}`, result);
    return;
  }
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) walkDifferences((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], `${path}/${key}`, result);
    return;
  }
  result.push({ path: path || "/", before, after });
}

export function diffStrategies(before: StrategyDefinition, after: StrategyDefinition): StrategyDifference[] {
  const result: StrategyDifference[] = [];
  walkDifferences(before, after, "", result);
  return result;
}

const METRIC_KEYS: Array<keyof BacktestMetrics> = [
  "finalEquity", "netProfit", "netReturnPercent", "annualizedReturnPercent", "numberOfTrades",
  "winRatePercent", "expectancyPerTrade", "profitFactor", "maximumDrawdownPercent",
  "recoveryTimeDays", "averageHoldingPeriodDays", "bestFiveTradesContributionPercent",
  "totalEstimatedCosts", "exposurePercent", "maximumConsecutiveLosses",
];

export function compareStrategyVersions(baseline: StrategyVersionResult, candidate: StrategyVersionResult): VersionComparison {
  const definitionDifferences = diffStrategies(baseline.version.definition, candidate.version.definition);
  const baselineMetrics = baseline.report?.baseline.metrics;
  const candidateMetrics = candidate.report?.baseline.metrics;
  const metricDifferences = METRIC_KEYS.map((metric) => {
    const before = baselineMetrics?.[metric];
    const after = candidateMetrics?.[metric];
    const baselineValue = typeof before === "number" || typeof before === "boolean" ? before : null;
    const candidateValue = typeof after === "number" || typeof after === "boolean" ? after : null;
    return {
      metric,
      baseline: baselineValue,
      candidate: candidateValue,
      delta: typeof baselineValue === "number" && typeof candidateValue === "number" ? candidateValue - baselineValue : null,
    };
  });
  const verdictMap = (result: StrategyVersionResult): Map<CourtCategory, VerdictStatus> => new Map(result.report?.verdicts.map((verdict) => [verdict.category, verdict.status]) ?? []);
  const beforeVerdicts = verdictMap(baseline);
  const afterVerdicts = verdictMap(candidate);
  const categories = [...new Set([...beforeVerdicts.keys(), ...afterVerdicts.keys()])];
  return {
    baselineVersionId: baseline.version.id,
    candidateVersionId: candidate.version.id,
    definitionDifferences,
    metricDifferences,
    verdictDifferences: categories.map((category) => ({ category, baseline: beforeVerdicts.get(category) ?? null, candidate: afterVerdicts.get(category) ?? null })),
    tradeCountDifference: baselineMetrics && candidateMetrics ? candidateMetrics.numberOfTrades - baselineMetrics.numberOfTrades : null,
    evaluationInformed: candidate.version.evaluationInformed,
    assumptionsChanged: definitionDifferences.some((difference) => difference.path.startsWith("/costs") || difference.path.startsWith("/execution")),
  };
}

export function assertVariantRequest(value: StrategyVariantRequest): StrategyVariantRequest {
  return value;
}
