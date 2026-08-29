import type { Store } from "../store";
import type { IndicatorRecord } from "../types";
import { ApiError } from "../errors";
import { BUILT_IN_INDICATORS } from "./catalog";

interface IndicatorInput {
  name: string;
  type: "number" | "source" | "boolean";
  default?: unknown;
}

export interface ResolvedCustomIndicator {
  id: string;
  name: string;
  version: number;
  outputType: string;
}

export interface ResolvedStrategyDefinition {
  definition: unknown;
  customIndicators: ResolvedCustomIndicator[];
}

const PRIMITIVES = new Set(["highest", "lowest", "rolling_average"]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function inputs(row: IndicatorRecord): IndicatorInput[] {
  if (!Array.isArray(row.inputs)) return [];
  return row.inputs.filter((item): item is IndicatorInput => {
    const input = object(item);
    return Boolean(input && typeof input.name === "string" && ["number", "source", "boolean"].includes(String(input.type)));
  });
}

function booleanConstant(value: boolean): Record<string, unknown> {
  return {
    left: { constant: 1 },
    operator: "eq",
    right: { constant: value ? 1 : 0 },
  };
}

function suppliedInput(value: unknown, type: IndicatorInput["type"]): unknown {
  if (object(value)) return value;
  if (type === "number" && typeof value === "number") return { constant: value };
  if (type === "source" && typeof value === "string") return { source: value };
  if (type === "boolean" && typeof value === "boolean") return booleanConstant(value);
  throw new ApiError(422, "invalid_custom_indicator_argument", "A custom-indicator argument does not match its declared input type");
}

/**
 * Compiles owner-scoped custom indicator references into the immutable strategy
 * AST. The domain engine therefore remains synchronous and cannot observe a
 * later edit to an indicator definition.
 */
export async function resolveCustomIndicatorsInStrategy(
  value: unknown,
  store: Store,
  ownerUserId: string,
): Promise<ResolvedStrategyDefinition> {
  const stored = new Map((await store.listIndicators(ownerUserId)).map((row) => [row.id, row]));
  const builtIns = new Set<string>(BUILT_IN_INDICATORS.map((item) => item.id));
  const references = new Map<string, ResolvedCustomIndicator>();

  const expand = (
    current: unknown,
    bindings: ReadonlyMap<string, unknown> = new Map(),
    stack: readonly string[] = [],
  ): unknown => {
    if (Array.isArray(current)) return current.map((item) => expand(item, bindings, stack));
    const node = object(current);
    if (!node) return current;

    if (typeof node.input === "string" && Object.keys(node).length === 1) {
      if (!bindings.has(node.input)) {
        throw new ApiError(422, "invalid_custom_indicator_argument", `Custom formula references an unbound input ${node.input}`);
      }
      return expand(structuredClone(bindings.get(node.input)), bindings, stack);
    }

    if (typeof node.indicator === "string") {
      const indicatorId = node.indicator;
      if (builtIns.has(indicatorId) || PRIMITIVES.has(indicatorId)) {
        return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === "indicator" ? child : expand(child, bindings, stack)]));
      }
      const row = stored.get(indicatorId);
      if (!row) {
        throw new ApiError(422, "unknown_indicator", `Strategy references an unknown indicator ${indicatorId}`, { indicatorId });
      }
      if (stack.includes(indicatorId)) {
        throw new ApiError(422, "invalid_indicator_dependencies", "Custom indicator dependencies contain a cycle", {
          cycle: [...stack.slice(stack.indexOf(indicatorId)), indicatorId],
        });
      }
      const parameters = object(node.parameters ?? node.arguments) ?? {};
      const nextBindings = new Map<string, unknown>();
      for (const declared of inputs(row)) {
        const raw = Object.prototype.hasOwnProperty.call(parameters, declared.name)
          ? parameters[declared.name]
          : declared.default;
        if (raw === undefined) {
          throw new ApiError(422, "invalid_custom_indicator_argument", `${row.name}.${declared.name} is required`, {
            indicatorId,
            input: declared.name,
          });
        }
        nextBindings.set(declared.name, suppliedInput(expand(raw, bindings, stack), declared.type));
      }
      const unexpected = Object.keys(parameters).filter((key) => !inputs(row).some((item) => item.name === key));
      if (unexpected.length) {
        throw new ApiError(422, "invalid_custom_indicator_argument", `${row.name} received unsupported arguments`, {
          indicatorId,
          unexpected,
        });
      }
      references.set(row.id, { id: row.id, name: row.name, version: row.version, outputType: row.outputType });
      return expand(structuredClone(row.formula), nextBindings, [...stack, indicatorId]);
    }

    return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, expand(child, bindings, stack)]));
  };

  return {
    definition: expand(value),
    customIndicators: [...references.values()],
  };
}
