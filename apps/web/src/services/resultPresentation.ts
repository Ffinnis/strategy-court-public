import type { ComparisonVersion, CourtRun } from "@/types";

export const runStages = [
  { id: "queued", label: "Queue", detail: "Waiting for an available worker" },
  {
    id: "market_data",
    label: "Market history",
    detail: "Loading and validating the selected snapshot",
  },
  {
    id: "baseline",
    label: "Court calculation",
    detail: "Baseline, evaluation, sensitivity and verdicts",
  },
  {
    id: "completed",
    label: "Result recorded",
    detail: "Evidence and reproducibility record saved",
  },
] as const;
export function runStageIndex(run?: CourtRun): number {
  if (!run) return -1;
  if (run.status === "completed") return 3;
  return runStages.findIndex((stage) => stage.id === run.stage);
}
export function numericMetric(
  row: ComparisonVersion | undefined,
  key: string,
): number | null {
  if (key === "tradeCount" && row?.metrics == null) return null;
  const value = key === "tradeCount" ? row?.tradeCount : row?.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function metricDifference(
  before: number | null,
  after: number | null,
  key: string,
): string {
  if (before === null || after === null) return "Not available";
  const difference = after - before;
  const unit = key.endsWith("Percent")
    ? " pp"
    : key === "tradeCount"
      ? " trades"
      : "";
  const precision = key === "tradeCount" ? 0 : key === "profitFactor" ? 2 : 1;
  const rounded = Number(difference.toFixed(precision));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(precision)}${unit}`;
}
export interface TrialCell {
  path: string;
  baseline: number | null;
  value: number | null;
  factor: number;
  profit: number | null;
  state: "profit" | "loss" | "flat" | "invalid" | "unavailable";
  reason: string;
}
export function parameterMatrix(trials: Array<Record<string, unknown>>) {
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const cells: TrialCell[] = trials.flatMap((trial) => {
    const factor = number(trial.factor);
    if (typeof trial.path !== "string" || factor === null) return [];
    const profit = number(trial.netProfit);
    return [
      {
        path: trial.path,
        baseline: number(trial.baseline),
        value: number(trial.value),
        factor,
        profit,
        state:
          trial.status === "invalid"
            ? "invalid"
            : profit === null
              ? "unavailable"
              : profit > 0
                ? "profit"
                : profit < 0
                  ? "loss"
                  : "flat",
        reason:
          typeof trial.invalidReason === "string" ? trial.invalidReason : "",
      },
    ];
  });
  return {
    cells,
    paths: [...new Set(cells.map((cell) => cell.path))],
    factors: [...new Set(cells.map((cell) => cell.factor))].sort(
      (a, b) => a - b,
    ),
  };
}
