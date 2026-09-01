import { describe, expect, test } from "bun:test";
import { reportTradesCsv } from "../src/services/csv";

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\r" && csv[index + 1] === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      index += 1;
    } else {
      value += character;
    }
  }
  if (row.length || value) rows.push([...row, value]);
  return rows;
}

function rowByColumn(csv: string): Record<string, string> {
  const [columns = [], values = []] = parseCsv(csv);
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
}

describe("CSV exports", () => {
  test("keeps negative trade numbers numeric and neutralizes dangerous strings", () => {
    const output = reportTradesCsv({
      id: "report-1",
      case: {
        name: "=1+1",
        dateRange: { start: "2024-01-01", end: "2024-12-31" },
        costs: { commissionBpsPerSide: -1, slippageBpsPerSide: 5 },
      },
      run: { summary: "+cmd" },
      trades: [{
        symbol: "@AAPL",
        grossProfit: -125.5,
        costs: 5,
        netProfit: -130.5,
        returnPercent: -3.25,
        entryReason: "-10+20",
      }],
    });
    const row = rowByColumn(output);

    expect(row.commission_bps_per_side).toBe("-1");
    expect(row.grossProfit).toBe("-125.5");
    expect(row.netProfit).toBe("-130.5");
    expect(row.returnPercent).toBe("-3.25");
    expect(row.report_name).toBe("'=1+1");
    expect(row.summary).toBe("'+cmd");
    expect(row.symbol).toBe("'@AAPL");
    expect(row.entryReason).toBe("'-10+20");
  });

  test("neutralizes control-prefixed and full-width spreadsheet formulas", () => {
    const output = reportTradesCsv({
      id: "report-controls",
      case: { name: "\tplain" },
      run: { summary: "\rplain" },
      dataMetadata: { provider: "\nplain", adjustment: " \u000b=1+1" },
      trades: [{
        symbol: "\u00a0\uff0bcommand",
        entryReason: "\u3000\uff0d10+20",
        exitReason: "\u0000 \uff1d1+1",
        marketRegime: " \uff20reference\u007f",
      }],
    });
    const row = rowByColumn(output);

    expect(row.report_name).toBe("'\tplain");
    expect(row.summary).toBe("'\rplain");
    expect(row.data_provider).toBe("'\nplain");
    expect(row.data_adjustment).toBe("' =1+1");
    expect(row.symbol).toBe("'\u00a0\uff0bcommand");
    expect(row.entryReason).toBe("'\u3000\uff0d10+20");
    expect(row.exitReason).toBe("' \uff1d1+1");
    expect(row.marketRegime).toBe("' \uff20reference");
    expect(output).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u);
    expect(output).toContain("\"'\tplain\"");
  });

  test("preserves boolean and structured serialization while dropping nonfinite numbers", () => {
    const output = reportTradesCsv({
      id: "report-2",
      case: {
        name: {},
        costs: { commissionBpsPerSide: Number.NEGATIVE_INFINITY, slippageBpsPerSide: Number.NaN },
      },
      run: { summary: true },
      dataMetadata: { provider: false },
      trades: [],
    });
    const row = rowByColumn(output);

    expect(row.report_name).toBe("{}");
    expect(row.summary).toBe("true");
    expect(row.data_provider).toBe("false");
    expect(row.commission_bps_per_side).toBe("");
    expect(row.slippage_bps_per_side).toBe("");
  });
});
