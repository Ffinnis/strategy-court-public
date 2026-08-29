import { toRaw } from "vue";
import { getIndicatorDefinition } from "@strategy-court/schemas";
import type { ConditionNode, ValueExpression } from "@/types";

export interface IndicatorPeriodTarget {
  index: number;
  indicator: string;
  label: string;
  period: number;
  min: number;
  max: number;
}

function visitPeriodExpressions(node: ConditionNode, callback: (expression: ValueExpression, index: number) => void): void {
  let index = 0;
  const visitExpression = (expression?: ValueExpression) => {
    if (!expression) return;
    if (expression.indicator && typeof expression.parameters?.period === "number") callback(expression, index++);
    if (expression.lag) visitExpression(expression.lag.value);
    if (expression.operation) {
      visitExpression(expression.left);
      visitExpression(expression.right);
    }
    if (expression.absolute) visitExpression(expression.absolute);
  };
  const visitCondition = (current: ConditionNode) => {
    visitExpression(current.left);
    visitExpression(current.right);
    current.all?.forEach(visitCondition);
    current.any?.forEach(visitCondition);
    if (current.not) visitCondition(current.not);
  };
  visitCondition(node);
}

export function indicatorPeriodTargets(node: ConditionNode): IndicatorPeriodTarget[] {
  const result: IndicatorPeriodTarget[] = [];
  visitPeriodExpressions(node, (expression, index) => {
    const definition = getIndicatorDefinition(expression.indicator!);
    const period = definition?.parameters.find((parameter) => parameter.name === "period");
    if (!definition || !period || (period.type !== "integer" && period.type !== "number")) return;
    result.push({
      index,
      indicator: expression.indicator!,
      label: definition.name,
      period: expression.parameters!.period!,
      min: period.min ?? 1,
      max: period.max ?? 2520,
    });
  });
  return result;
}

export function withIndicatorPeriod(node: ConditionNode, targetIndex: number, value: number): ConditionNode {
  const changed = structuredClone(toRaw(node));
  visitPeriodExpressions(changed, (expression, index) => {
    if (index === targetIndex && expression.parameters) expression.parameters.period = value;
  });
  return changed;
}
