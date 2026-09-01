import type { EvidenceSelection } from "@/stores/evidence";
export function evidenceLink(
  origin: string,
  selection: EvidenceSelection,
): string {
  const url = new URL(`/case/${encodeURIComponent(selection.caseId)}`, origin);
  url.searchParams.set("tab", "evidence");
  url.searchParams.set("version", selection.versionId);
  url.searchParams.set("run", selection.runId);
  url.searchParams.set("kind", selection.kind);
  url.searchParams.set("evidence", selection.id);
  return url.toString();
}
