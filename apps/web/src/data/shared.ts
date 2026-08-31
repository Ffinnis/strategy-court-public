import { parseDecisionFields, tradeEvidenceId, type DecisionFields } from "@strategy-court/schemas";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const humanize = (value: unknown) => {
  const words = String(value ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll(/[._-]+/g, " ").toLowerCase();
  return words.replace(/^./, (letter) => letter.toUpperCase());
};
const text = (value: unknown, fallback = "Not reported") => typeof value === "string" && value.trim() ? value : fallback;

export interface SharedVerdictView {
  id: string;
  category: string;
  status: string;
  finding: string;
  measure: string;
  threshold: string;
}

export interface SharedTradeView {
  id: string;
  symbol: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  netProfit: number;
  costs: number;
  exitReason: string;
}

export interface SharedVersionView {
  version: number;
  parentVersion: number | null;
  interpretation: string;
  source: string;
  confirmed: boolean;
  evaluationInformed: boolean;
  createdAt: string;
}

export interface SharedReportView {
  decisions: Array<DecisionFields & {confirmedAt:string}>;
  failures: Array<{id:string;title:string;summary:string}>;
  schemaVersion: number;
  name: string;
  description: string;
  symbols: string[];
  dateRange: { start: string; end: string };
  initialCapital: number;
  profile: string;
  summary: string;
  strategyDefinition: Record<string, unknown>;
  interpretation: string;
  strategyVersion: number;
  evaluationInformed: boolean;
  verdicts: SharedVerdictView[];
  assumptions: Array<{ label: string; value: string }>;
  metrics: Array<{ label: string; value: string }>;
  trades: SharedTradeView[];
  versions: SharedVersionView[];
  data: Array<{ label: string; value: string }>;
  engineVersion: string;
  reproducibilityId: string;
  limitation: string;
  raw: Record<string, unknown>;
}

function displayValue(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(String).join(" · ");
  return text(value);
}

function entries(value: unknown): Array<{ label: string; value: string }> {
  return Object.entries(object(value))
    .filter(([, item]) => item === null || typeof item !== "object" || Array.isArray(item))
    .map(([label, value]) => ({ label: humanize(label), value: displayValue(value) }));
}

export function normalizeSharedReport(value: unknown): SharedReportView {
  const raw = object(value);
  const courtCase = object(raw.case);
  const run = object(raw.run);
  const version = object(raw.strategyVersion);
  const dateRange = object(courtCase.dateRange);
  const dataMetadata = object(raw.dataMetadata);
  const dataDateRange = object(dataMetadata.dateRange);
  const metricsValue = object(raw.metrics).metrics ?? raw.metrics;
  const verdicts = (Array.isArray(raw.verdicts) ? raw.verdicts : []).map((value, index): SharedVerdictView => {
    const verdict = object(value);
    const evidence = Object.entries(object(verdict.evidence))[0];
    return {
      id: text(verdict.id ?? verdict.category, `verdict-${index + 1}`),
      category: text(verdict.title, humanize(verdict.category) || "Court finding"),
      status: text(verdict.status ?? verdict.verdict, "Inconclusive"),
      finding: text(verdict.finding ?? verdict.summary, "No written finding was returned."),
      measure: text(verdict.measure, evidence ? `${humanize(evidence[0])}: ${displayValue(evidence[1])}` : "No measure returned"),
      threshold: text(verdict.threshold, Array.isArray(verdict.thresholds) ? verdict.thresholds.map(String).join(" · ") : "No threshold returned"),
    };
  });
  const trades = (Array.isArray(raw.trades) ? raw.trades : []).map((value, index): SharedTradeView => {
    const trade = object(value);
    return {
      id: tradeEvidenceId(index),
      symbol: text(trade.symbol, "N/A"),
      entryDate: text(trade.entryDate, ""),
      entryPrice: finite(trade.entryPrice),
      exitDate: text(trade.exitDate, ""),
      exitPrice: finite(trade.exitPrice),
      netProfit: finite(trade.netProfit),
      costs: finite(trade.costs),
      exitReason: humanize(trade.exitReason),
    };
  });
  const versions = (Array.isArray(raw.versionHistory) ? raw.versionHistory : []).map((value, index): SharedVersionView => {
    const item = object(value);
    return {
      version: finite(item.version) || index + 1,
      parentVersion: typeof item.parentVersion === "number" ? item.parentVersion : null,
      interpretation: text(item.interpretation, "No interpretation was returned."),
      source: humanize(item.source || "user"),
      confirmed: item.confirmed === true,
      evaluationInformed: item.evaluationInformed === true,
      createdAt: text(item.createdAt, ""),
    };
  });
  const data = [
    { label: "Provider", value: displayValue(dataMetadata.provider) },
    { label: "Feed", value: displayValue(dataMetadata.feed) },
    { label: "Retrieved", value: displayValue(dataMetadata.fetchedAt) },
    { label: "Adjustment", value: displayValue(dataMetadata.adjustment) },
    { label: "Data range", value: dataDateRange.start && dataDateRange.end ? `${dataDateRange.start} to ${dataDateRange.end}` : "Not reported" },
    { label: "Snapshot hash", value: displayValue(dataMetadata.snapshotHash) },
    { label: "Bars", value: displayValue(dataMetadata.barCount) },
  ];
  return {
    schemaVersion: finite(raw.schemaVersion),
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).flatMap(value=>{
      const item=object(value);
      if(item.state !== "confirmed") return [];
      try { return [{...parseDecisionFields({outcome:item.outcome,rationale:item.rationale,evidenceRefs:item.evidenceRefs,uncertainties:item.uncertainties,revisitCriteria:item.revisitCriteria}),confirmedAt:text(item.confirmedAt,"")}]; }
      catch {return [];}
    }),
    failures: (Array.isArray(raw.failures) ? raw.failures : []).map((value,index)=>{const item=object(value);return {id:text(item.id,`failure-${index+1}`),title:text(item.title,humanize(item.category ?? item.id) || "Failure evidence"),summary:text(item.summary ?? item.finding ?? item.explanation,"See the exported record for the full evidence.")};}),
    name: text(courtCase.name, "Court report"),
    description: text(courtCase.description, ""),
    symbols: Array.isArray(courtCase.symbols) ? courtCase.symbols.map(String) : [],
    dateRange: { start: text(dateRange.start, ""), end: text(dateRange.end, "") },
    initialCapital: finite(courtCase.initialCapital),
    profile: humanize(courtCase.profile ?? run.profile),
    summary: text(run.summary, "Inconclusive"),
    strategyDefinition: object(raw.strategyDefinition ?? version.definition),
    interpretation: text(version.interpretation, "No interpretation was returned."),
    strategyVersion: finite(version.version) || 1,
    evaluationInformed: version.evaluationInformed === true,
    verdicts,
    assumptions: entries(raw.assumptions),
    metrics: entries(metricsValue),
    trades,
    versions,
    data,
    engineVersion: text(raw.engineVersion ?? run.engineVersion),
    reproducibilityId: text(run.reproducibilityId),
    limitation: text(raw.limitation, "Historical results do not predict or guarantee future performance."),
    raw,
  };
}

export interface SharedIndicatorView {
  schemaVersion: number;
  key: string;
  name: string;
  description: string;
  version: number;
  creatorType: string;
  createdAt: string;
  inputs: Array<Record<string, unknown>>;
  dependencies: string[];
  dependencyDefinitions: Array<Record<string, unknown>>;
  outputType: string;
  sharingState: string;
  formula: unknown;
  raw: Record<string, unknown>;
}

export function normalizeSharedIndicator(value: unknown): SharedIndicatorView {
  const raw = object(value);
  return {
    schemaVersion: finite(raw.schemaVersion),
    key: text(raw.key, "root"),
    name: text(raw.name, "Shared indicator"),
    description: text(raw.description, ""),
    version: finite(raw.version) || 1,
    creatorType: humanize(raw.creatorType || "user"),
    createdAt: text(raw.createdAt, ""),
    inputs: (Array.isArray(raw.inputs) ? raw.inputs : []).map(object),
    dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.map(String) : [],
    dependencyDefinitions: (Array.isArray(raw.dependencyDefinitions) ? raw.dependencyDefinitions : []).map(object),
    outputType: humanize(raw.outputType || "series"),
    sharingState: humanize(raw.sharingState || "unlisted"),
    formula: raw.formula,
    raw,
  };
}

export interface FormulaLine { path: string; value: string }

export function flattenFormula(value: unknown, path = "formula"): FormulaLine[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenFormula(item, `${path} ${index + 1}`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenFormula(item, `${path} · ${humanize(key)}`));
  return [{ path, value: displayValue(value) }];
}
