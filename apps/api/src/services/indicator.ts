import { ApiError, requireObject } from "../errors";
import type { Store } from "../store";
import {
  EXECUTABLE_INDICATOR_IDS,
  validateIndicatorParameters,
} from "@strategy-court/schemas";

const PRICE_SOURCES = new Set(["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"]);
const COMPARISONS = new Set(["gt", "gte", "lt", "lte", "eq", "crosses_above", "crosses_below"]);
const OPERATIONS = new Set(["add", "subtract", "multiply", "divide", "min", "max"]);
const OUTPUT_TYPES = new Set(["number", "boolean"]);
const SHARING_STATES = new Set(["private", "unlisted"]);
const EXECUTABLE_INDICATORS = new Set<string>(EXECUTABLE_INDICATOR_IDS);

interface IndicatorInput {
  name: string;
  type: "number" | "source" | "boolean";
  default: number | string | boolean;
  min?: number;
  max?: number;
  description?: string;
}

interface ValidatedIndicator {
  inputs: IndicatorInput[];
  dependencies: string[];
  outputType: string;
  sharingState: string;
}

type IndicatorOutputType = "number" | "boolean";

interface ResolvedIndicator {
  outputType: IndicatorOutputType;
  inputs: IndicatorInput[];
  custom: boolean;
}

function exactKeys(record: Record<string, unknown>, allowed: string[], path: string): void {
  const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new ApiError(422, "invalid_indicator", `${path} contains unsupported fields`, { path, unexpected });
}

function validateInputs(value: unknown): IndicatorInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ApiError(422, "invalid_indicator_inputs", "inputs must declare one to twenty named values with defaults");
  }
  const names = new Set<string>();
  return value.map((item, index) => {
    const record = requireObject(item, `inputs[${index}] must be an object`);
    exactKeys(record, ["name", "type", "default", "min", "max", "description"], `inputs[${index}]`);
    if (typeof record.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(record.name)) {
      throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].name must be an identifier of at most 40 characters`);
    }
    if (names.has(record.name)) throw new ApiError(422, "invalid_indicator_inputs", `Duplicate input ${record.name}`);
    names.add(record.name);
    if (!new Set(["number", "source", "boolean"]).has(String(record.type))) {
      throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].type is unsupported`);
    }
    if (record.type === "number") {
      if (typeof record.default !== "number" || !Number.isFinite(record.default)) throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].default must be a finite number`);
      if (record.min !== undefined && (typeof record.min !== "number" || record.default < record.min)) throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].default is below min`);
      if (record.max !== undefined && (typeof record.max !== "number" || record.default > record.max)) throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].default is above max`);
    } else if (record.type === "source" && (typeof record.default !== "string" || !PRICE_SOURCES.has(record.default))) {
      throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].default must be a supported price source`);
    } else if (record.type === "boolean" && typeof record.default !== "boolean") {
      throw new ApiError(422, "invalid_indicator_inputs", `inputs[${index}].default must be boolean`);
    }
    return record as unknown as IndicatorInput;
  });
}

function dependencyIds(value: unknown, path = "dependencies"): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(422, "invalid_indicator_dependencies", `${path} must be an array of indicator IDs`);
  }
  const dependencies = [...new Set(value as string[])];
  if (dependencies.length !== value.length || dependencies.length > 20) {
    throw new ApiError(422, "invalid_indicator_dependencies", `${path} must contain at most twenty unique indicator IDs`);
  }
  return dependencies;
}

export async function validateIndicatorDefinition(
  input: Record<string, unknown>,
  store: Store,
  ownerUserId: string,
): Promise<ValidatedIndicator> {
  exactKeys(input, ["name", "description", "inputs", "dependencies", "outputType", "sharingState", "formula"], "indicator");
  const inputs = validateInputs(input.inputs);
  const inputNames = new Set(inputs.map((item) => item.name));
  const dependencies = dependencyIds(input.dependencies);
  const storedIndicators = new Map((await store.listIndicators(ownerUserId)).map((indicator) => [indicator.id, indicator]));
  if (!OUTPUT_TYPES.has(String(input.outputType))) throw new ApiError(422, "invalid_indicator_output", "outputType must be number or boolean");
  const sharingState = input.sharingState === undefined ? "private" : String(input.sharingState);
  if (!SHARING_STATES.has(sharingState)) throw new ApiError(422, "invalid_indicator_sharing", "sharingState must be private or unlisted");

  const resolved = new Map<string, ResolvedIndicator>();
  const resolving: string[] = [];
  const resolveIndicator = (indicatorId: string): ResolvedIndicator => {
    const cached = resolved.get(indicatorId);
    if (cached) return cached;
    if (EXECUTABLE_INDICATORS.has(indicatorId)) {
      const builtIn: ResolvedIndicator = { outputType: "number", inputs: [], custom: false };
      resolved.set(indicatorId, builtIn);
      return builtIn;
    }
    const cycleIndex = resolving.indexOf(indicatorId);
    if (cycleIndex >= 0) {
      throw new ApiError(422, "invalid_indicator_dependencies", "Custom indicator dependencies contain a cycle", {
        cycle: [...resolving.slice(cycleIndex), indicatorId],
      });
    }
    const row = storedIndicators.get(indicatorId);
    if (!row) throw new ApiError(422, "invalid_indicator_dependencies", `Unknown indicator dependency ${indicatorId}`);
    const outputType = String(row.outputType);
    if (!OUTPUT_TYPES.has(outputType)) {
      throw new ApiError(422, "invalid_indicator_output", `Stored indicator ${indicatorId} has an invalid output type`);
    }
    const storedInputs = validateInputs(row.inputs);
    const storedDependencies = dependencyIds(row.dependencies, `dependencies for ${indicatorId}`);
    resolving.push(indicatorId);
    try {
      storedDependencies.forEach(resolveIndicator);
    } finally {
      resolving.pop();
    }
    const custom = { outputType: outputType as IndicatorOutputType, inputs: storedInputs, custom: true };
    resolved.set(indicatorId, custom);
    return custom;
  };
  dependencies.forEach(resolveIndicator);

  const referencedDependencies = new Set<string>();
  let nodes = 0;
  const visit = (value: unknown, depth: number, expected?: "number" | "boolean"): "number" | "boolean" => {
    const finish = (actual: "number" | "boolean"): "number" | "boolean" => {
      if (expected && actual !== expected) throw new ApiError(422, "invalid_indicator_output", `Formula node returns ${actual}, but ${expected} is required`);
      return actual;
    };
    nodes += 1;
    if (nodes > 100 || depth > 12) throw new ApiError(422, "invalid_indicator", "Formula exceeds the 100-node or 12-level limit");
    const node = requireObject(value, "Every formula node must be an object");
    if ("all" in node || "any" in node) {
      const key = "all" in node ? "all" : "any";
      exactKeys(node, [key], "formula condition");
      const children = node[key];
      if (!Array.isArray(children) || children.length === 0) throw new ApiError(422, "invalid_indicator", `${key} requires at least one condition`);
      children.forEach((child) => visit(child, depth + 1, "boolean"));
      return finish("boolean");
    }
    if ("not" in node) {
      exactKeys(node, ["not"], "formula not");
      visit(node.not, depth + 1, "boolean");
      return finish("boolean");
    }
    if ("left" in node && "operator" in node && "right" in node && COMPARISONS.has(String(node.operator))) {
      exactKeys(node, ["left", "operator", "right"], "formula comparison");
      visit(node.left, depth + 1, "number");
      visit(node.right, depth + 1, "number");
      return finish("boolean");
    }
    if ("constant" in node) {
      exactKeys(node, ["constant"], "formula constant");
      if (typeof node.constant !== "number" || !Number.isFinite(node.constant)) throw new ApiError(422, "invalid_indicator", "constant must be finite");
      return finish("number");
    }
    if ("source" in node) {
      exactKeys(node, ["source"], "formula source");
      if (typeof node.source !== "string" || !PRICE_SOURCES.has(node.source)) throw new ApiError(422, "invalid_indicator", "source is unsupported");
      return finish("number");
    }
    if ("input" in node) {
      exactKeys(node, ["input"], "formula input");
      if (typeof node.input !== "string" || !inputNames.has(node.input)) throw new ApiError(422, "invalid_indicator_inputs", `Formula references undeclared input ${String(node.input)}`);
      const declared = inputs.find((item) => item.name === node.input)!;
      return finish(declared.type === "boolean" ? "boolean" : "number");
    }
    if ("indicator" in node) {
      exactKeys(node, ["indicator", "parameters"], "formula indicator");
      if (typeof node.indicator !== "string" || !dependencies.includes(node.indicator)) {
        throw new ApiError(422, "invalid_indicator_dependencies", `Formula dependency ${String(node.indicator)} is not declared`);
      }
      referencedDependencies.add(node.indicator);
      const parameters = requireObject(node.parameters, "indicator parameters must be an object");
      const indicatorDefinition = resolveIndicator(node.indicator);
      if (!indicatorDefinition.custom) {
        const issues = validateIndicatorParameters(node.indicator, parameters);
        if (issues.length) {
          throw new ApiError(422, "invalid_indicator", `${node.indicator} parameters are invalid`, {
            indicator: node.indicator,
            issues,
          });
        }
      } else {
        exactKeys(parameters, indicatorDefinition.inputs.map((item) => item.name), `${node.indicator} parameters`);
        for (const declared of indicatorDefinition.inputs) {
          const supplied = Object.prototype.hasOwnProperty.call(parameters, declared.name);
          if (!supplied && !Object.prototype.hasOwnProperty.call(declared, "default")) {
            throw new ApiError(422, "invalid_indicator_inputs", `${node.indicator}.${declared.name} is required`);
          }
          const parameter = supplied ? parameters[declared.name] : declared.default;
          if (declared.type === "number") {
            if (parameter && typeof parameter === "object") visit(parameter, depth + 1, "number");
            else if (typeof parameter !== "number" || !Number.isFinite(parameter)) throw new ApiError(422, "invalid_indicator_inputs", `${node.indicator}.${declared.name} must be a finite number`);
            else if ((declared.min !== undefined && parameter < declared.min) || (declared.max !== undefined && parameter > declared.max)) {
              throw new ApiError(422, "invalid_indicator_inputs", `${node.indicator}.${declared.name} is outside its declared range`);
            }
          } else if (declared.type === "source") {
            if (typeof parameter !== "string" || !PRICE_SOURCES.has(parameter)) throw new ApiError(422, "invalid_indicator_inputs", `${node.indicator}.${declared.name} must be a supported price source`);
          } else if (parameter && typeof parameter === "object") visit(parameter, depth + 1, "boolean");
          else if (typeof parameter !== "boolean") throw new ApiError(422, "invalid_indicator_inputs", `${node.indicator}.${declared.name} must be boolean`);
        }
      }
      return finish(indicatorDefinition.outputType);
    }
    if ("lag" in node) {
      exactKeys(node, ["lag"], "formula lag");
      const lag = requireObject(node.lag, "lag must be an object");
      exactKeys(lag, ["value", "bars"], "formula lag");
      if (!Number.isInteger(lag.bars) || Number(lag.bars) < 0 || Number(lag.bars) > 2520) throw new ApiError(422, "invalid_indicator", "lag bars must be an integer from 0 to 2520");
      return visit(lag.value, depth + 1, expected);
    }
    if ("operation" in node) {
      exactKeys(node, ["operation", "left", "right"], "formula operation");
      if (!OPERATIONS.has(String(node.operation))) throw new ApiError(422, "invalid_indicator", `Operation ${String(node.operation)} is not allowed`);
      visit(node.left, depth + 1, "number");
      visit(node.right, depth + 1, "number");
      return finish("number");
    }
    if ("absolute" in node) {
      exactKeys(node, ["absolute"], "formula absolute");
      visit(node.absolute, depth + 1, "number");
      return finish("number");
    }
    throw new ApiError(422, "invalid_indicator", "Formula contains an unknown operation");
  };
  const rootType = visit(input.formula, 1);
  if (rootType !== input.outputType) throw new ApiError(422, "invalid_indicator_output", `Formula returns ${rootType}, not ${String(input.outputType)}`);
  const unused = dependencies.filter((item) => !referencedDependencies.has(item));
  if (unused.length) throw new ApiError(422, "invalid_indicator_dependencies", "Every declared dependency must be referenced", { unused });
  return { inputs, dependencies, outputType: String(input.outputType), sharingState };
}
