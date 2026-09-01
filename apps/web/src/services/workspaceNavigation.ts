import type { WorkspaceTab } from "@/types";

export const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "court", label: "Results" },
  { id: "evidence", label: "Evidence" },
  { id: "variants", label: "Compare" },
  { id: "strategy", label: "Rules" },
  { id: "probation", label: "Replay" },
  { id: "audit", label: "Activity" },
];

/** Open a cited finding even when its details are collapsed. */
export function revealFinding(id: string) {
  const finding = document.getElementById(`verdict-${id}`);
  if (!finding) return;
  if (finding instanceof HTMLDetailsElement) finding.open = true;
  finding.scrollIntoView({ block: "center", behavior: "auto" });
  (finding.querySelector("summary") ?? finding).focus({ preventScroll: true });
}
