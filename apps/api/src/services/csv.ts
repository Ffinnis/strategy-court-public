type CsvValue = string | number | boolean | null | undefined;

interface CsvRow {
  [column: string]: CsvValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function serialized(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function safeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function cell(value: CsvValue): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = safeSpreadsheetText(value).replaceAll('"', '""');
  return /[",\r\n]/.test(text) ? `"${text}"` : text;
}

function csv(columns: readonly string[], rows: readonly CsvRow[]): string {
  return [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
}

export function reportTradesCsv(value: unknown): string {
  const report = record(value);
  const courtCase = record(report.case);
  const caseRange = record(courtCase.dateRange);
  const strategyVersion = record(report.strategyVersion);
  const definition = record(report.strategyDefinition ?? strategyVersion.definition);
  const costs = record(definition.costs ?? courtCase.costs);
  const execution = record(definition.execution);
  const run = record(report.run);
  const data = record(report.dataMetadata);
  const trades = list(report.trades);
  const common: CsvRow = {
    report_id: serialized(report.id ?? run.id),
    report_name: serialized(courtCase.name),
    summary: serialized(run.summary),
    strategy_version: serialized(strategyVersion.version),
    engine_version: serialized(report.engineVersion ?? run.engineVersion),
    reproducibility_id: serialized(run.reproducibilityId),
    court_start: serialized(caseRange.start),
    court_end: serialized(caseRange.end),
    data_provider: serialized(data.provider),
    data_adjustment: serialized(data.adjustment),
    commission_bps_per_side: serialized(costs.commissionBpsPerSide),
    slippage_bps_per_side: serialized(costs.slippageBpsPerSide),
    signal_timing: serialized(execution.signalAt),
    execution_timing: serialized(execution.executeAt),
    order_type: serialized(execution.orderType),
  };
  const tradeColumns = [
    "symbol", "entryDate", "entryReferencePrice", "entryPrice", "exitDate", "exitReferencePrice",
    "exitPrice", "quantity", "grossProfit", "costs", "netProfit", "returnPercent", "holdingDays",
    "entryReason", "exitReason", "marketRegime",
  ] as const;
  const rows: CsvRow[] = trades.length
    ? trades.map((value, index) => {
        const trade = record(value);
        return {
          ...common,
          record_type: "trade",
          trade_number: index + 1,
          ...Object.fromEntries(tradeColumns.map((column) => [column, serialized(trade[column])])),
        };
      })
    : [{ ...common, record_type: "report_without_completed_trades", trade_number: 0 }];
  return csv([
    "record_type", ...Object.keys(common), "trade_number", ...tradeColumns,
  ], rows);
}

export function indicatorDefinitionCsv(value: unknown): string {
  const indicator = record(value);
  const common: CsvRow = {
    indicator_id: serialized(indicator.id),
    indicator_key: serialized(indicator.key),
    indicator_name: serialized(indicator.name),
    version: serialized(indicator.version),
    output_type: serialized(indicator.outputType),
    creator_type: serialized(indicator.creatorType),
    sharing_state: serialized(indicator.sharingState),
  };
  const rows: CsvRow[] = [
    { ...common, record_type: "metadata", field: "description", value: serialized(indicator.description) },
    { ...common, record_type: "metadata", field: "created_at", value: serialized(indicator.createdAt) },
    ...list(indicator.inputs).map((input, index) => ({
      ...common,
      record_type: "input",
      field: serialized(record(input).name || `input_${index + 1}`),
      value: serialized(input),
    })),
    ...list(indicator.dependencies).map((dependency, index) => ({
      ...common,
      record_type: "dependency",
      field: `dependency_${index + 1}`,
      value: serialized(dependency),
    })),
    { ...common, record_type: "formula", field: "formula", value: serialized(indicator.formula) },
    ...list(indicator.dependencyDefinitions).map((dependency, index) => ({
      ...common,
      record_type: "dependency_definition",
      field: serialized(record(dependency).key || `dependency_${index + 1}`),
      value: serialized(dependency),
    })),
  ];
  return csv([
    "record_type", ...Object.keys(common), "field", "value",
  ], rows);
}
