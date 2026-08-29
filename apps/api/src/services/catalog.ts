import { BUILT_IN_INDICATOR_DEFINITIONS } from "@strategy-court/schemas";

export const BUILT_IN_INDICATORS = BUILT_IN_INDICATOR_DEFINITIONS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  category: definition.category,
  available: true,
  requiredParameters: definition.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  allowedSources: definition.parameters.some((parameter) => parameter.type === "source")
    ? definition.parameters.find((parameter) => parameter.type === "source")?.options ?? []
    : [],
  parameters: definition.parameters,
  components: definition.components,
  outputType: definition.outputType,
  version: definition.version,
}));
