import { expect, test } from "bun:test";

const source = async (path: string) => Bun.file(new URL(path, import.meta.url)).text();

function openingTag(content: string, className: string): string {
  return content.match(new RegExp(`<[^>]+class="[^"]*\\b${className}\\b[^"]*"[^>]*>`))?.[0] ?? "";
}

function relativeLuminance(color: string): number {
  const channels = color.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (lighter! + 0.05) / (darker! + 0.05);
}

test("mobile authentication puts account access before the promotional preview", async () => {
  const auth = await source("../src/pages/AuthPage.vue");
  expect(auth).toMatch(/@media\(max-width:940px\)[^{]*\{[^}]*\.auth-page[^}]*\}[^}]*\.auth-entry\{[^}]*grid-row:1/s);
  expect(auth).toMatch(/@media\(max-width:940px\)[\s\S]*?\.auth-context\{[^}]*grid-row:2/);
});

test("invalid authentication announces one summary and focuses fields in form order", async () => {
  const auth = await source("../src/pages/AuthPage.vue");
  const validation = auth.match(/if \(!validName \|\| !validEmail \|\| !validPassword\) \{(?<body>[\s\S]*?)\n  \}/)?.groups?.body ?? "";
  expect(auth).toContain('class="auth-message auth-message--error" role="alert"');
  expect(auth).toContain("Check the highlighted fields, then try again.");
  expect(validation).toContain("await nextTick()");
  expect(validation.indexOf("nameField.value?.focus()")).toBeLessThan(validation.indexOf("emailField.value?.focus()"));
  expect(validation.indexOf("emailField.value?.focus()")).toBeLessThan(validation.indexOf("passwordField.value?.focus()"));
});

test("the mobile indicator catalog never hides its tall primary layout behind a reveal threshold", async () => {
  const indicators = await source("../src/pages/IndicatorCatalogPage.vue");
  expect(openingTag(indicators, "catalog-summary")).toContain("v-motion-reveal");
  expect(openingTag(indicators, "indicator-layout")).not.toContain("v-motion-reveal");
});

test("parameter trials keep the clicked square visibly selected and expose its result", async () => {
  const matrix = await source("../src/components/ParameterMatrix.vue");
  expect(matrix).toContain(':aria-pressed="isSelected(path, factor)"');
  expect(matrix).toContain('class="matrix-cell__selected"');
  expect(matrix).toContain('class="matrix-selection" role="status" aria-live="polite"');
  expect(matrix).toContain("Selected trial");
  expect(matrix).toContain('thead th[data-selected="true"]');
  expect(matrix).toContain('tbody tr[data-selected="true"] > th');
  expect(matrix).toMatch(/\.matrix-cell\[aria-pressed="true"\][^{]*\{[^}]*box-shadow:/s);
});

test("indicator relationship and formula errors expose the field that receives focus", async () => {
  const indicators = await source("../src/pages/IndicatorCatalogPage.vue");
  expect(indicators).toContain('parameter.name === "slowPeriod" && macdRelationshipInvalid.value');
  expect(indicators).toContain('parameter.name === "maximum" && sarRelationshipInvalid.value');
  expect(indicators).toContain(':aria-invalid="attempted && parameterInvalid(parameter)"');
  expect(indicators.match(/:aria-invalid="attempted && formulaDefaultInvalid"/g)).toHaveLength(2);
  expect(indicators.match(/aria-describedby="indicator-validation"/g)?.length).toBeGreaterThanOrEqual(5);
  expect(indicators).toContain("!Number.isFinite(form.threshold)");
  expect(indicators).toContain("!Number.isFinite(form.scale)");
  expect(indicators).toContain("MACD slow period must be greater than fast period.");
  expect(indicators).toContain("SAR maximum acceleration must not be below acceleration.");
  expect(indicators).toContain("document.querySelector<HTMLElement>('.builder-form [aria-invalid=\"true\"]')");
});

test("unconfirmed strategy review precedes the only confirmation action", async () => {
  const strategy = await source("../src/components/tabs/StrategyTab.vue");
  const review = strategy.indexOf("Review exact rules");
  const ledger = strategy.indexOf('<div ref="ruleLedger" class="rule-ledger"');
  const assumptions = strategy.indexOf('<details class="strategy-detail"');
  const approval = strategy.indexOf('<section v-if="!store.confirmed" class="approval-actions"');
  expect(review).toBeGreaterThan(-1);
  expect(review).toBeLessThan(ledger);
  expect(ledger).toBeLessThan(assumptions);
  expect(assumptions).toBeLessThan(approval);
  expect(strategy.match(/Confirm this interpretation/g)).toHaveLength(1);
  expect(strategy).toContain('<div ref="ruleLedger" class="rule-ledger" aria-label="Trading rules" tabindex="-1">');
  expect(strategy).toContain('ruleLedger.value?.scrollIntoView({ behavior: "auto", block: "start" })');
  expect(strategy).toContain('ruleLedger.value?.focus({ preventScroll: true })');
  expect(strategy).toContain("scroll-margin-top: calc(var(--app-header-height) + 78px)");
  expect(strategy).toContain("scroll-margin-top: calc(var(--app-header-height) + 72px)");
  expect(strategy).not.toContain("approvalRegion");
});

test("the workspace keeps WebMCP readiness next to its primary navigation", async () => {
  const workspace = await source("../src/pages/CaseWorkspacePage.vue");
  const status = await source("../src/components/WebMcpWorkspaceStatus.vue");
  expect(workspace).toContain('<WebMcpWorkspaceStatus @open="openAgentActivity" />');
  expect(workspace).toContain("async function revealSelectedTab(focus = false)");
  expect(workspace).toContain("selectedTab?.scrollIntoView({ behavior: \"auto\", block: \"nearest\", inline: \"center\" })");
  expect(workspace).toContain("if (focus) selectedTab?.focus({ preventScroll: true })");
  expect(workspace).toContain("await revealSelectedTab();");
  expect(workspace).toContain("await revealSelectedTab(true);");
  expect(status).toContain("WebMCP tools ready");
  expect(status).toContain('unsupported: "WebMCP unavailable"');
  expect(status).toContain('registering: "WebMCP connecting"');
  expect(status).toContain('ready: `WebMCP · ${store.registeredToolNames.length} tools`');
  expect(status).toContain('partial: `WebMCP · ${store.registeredToolNames.length}/${store.webMcpExpectedToolNames.length} tools`');
  expect(status).toContain('failed: "WebMCP attention"');
  expect(status).toContain("min-width:128px;max-width:128px;grid-template-columns:16px minmax(0,1fr)");
  expect(status).toContain(".workspace-agent-status__mark{display:grid;width:16px;height:16px");
  expect(status).toContain("Latest recorded change:");
  expect(status).not.toContain("Latest:");
  expect(status).toContain('data-webmcp-status');
  const subcopy = status.match(/\.workspace-agent-status small\{color:(#[a-f\d]{6});font-size:9px\}/i)?.[1];
  expect(subcopy).toBeDefined();
  expect(contrastRatio(subcopy!, "#080808")).toBeGreaterThanOrEqual(4.5);
});

test("wide Evidence and Activity ledgers are named keyboard-scrollable regions", async () => {
  const evidence = await source("../src/components/tabs/EvidenceTab.vue");
  const audit = await source("../src/components/tabs/AuditTab.vue");
  const trades = openingTag(evidence, "trade-table-wrap");
  const signals = openingTag(evidence, "signal-table-wrap");
  const activity = openingTag(audit, "audit-table-wrap");
  for (const region of [trades, signals, activity]) {
    expect(region).toContain('role="region"');
    expect(region).toContain('tabindex="0"');
    expect(region).toMatch(/aria-label="[^"]+"/);
  }
  expect(evidence).toContain(".trade-table-wrap:focus-visible");
  expect(audit).toContain(".audit-table-wrap:focus-visible");
  expect(audit).toContain("grid-template-columns: minmax(0, 1fr)");
  expect(audit).toContain(".audit-table{width:100%;min-width:680px;");
});

test("the trade ledger scrolls every column together beneath one sticky header layer", async () => {
  const evidence = await source("../src/components/tabs/EvidenceTab.vue");
  const tableHead = evidence.match(/\.trade-table-wrap thead\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  const headerCells = evidence.match(/\.trade-table-wrap th \{(?<body>[^}]*)\}/)?.groups?.body ?? "";
  const firstColumnRules = [...evidence.matchAll(/(?<selectors>[^{}]*\.trade-table-wrap[^{}]*:first-child[^{}]*)\{(?<body>[^}]*)\}/g)];
  expect(tableHead).not.toContain("position:sticky");
  expect(headerCells).toContain("position: sticky");
  expect(headerCells).toContain("z-index: 2");
  expect(firstColumnRules.length).toBeGreaterThan(0);
  for (const rule of firstColumnRules) {
    const body = rule.groups?.body ?? "";
    expect(body).not.toContain("position: sticky");
    expect(body).not.toMatch(/(?:^|;)\s*left:\s*0\s*;/);
    expect(body).not.toMatch(/(?:^|;)\s*inset-inline-start:\s*0\s*;/);
  }
  expect(evidence).toContain(".trade-table-wrap tbody tr:hover:not(.trade-row--selected)");
});

test("mobile trade rows expose a labeled Inspect action in the identity column", async () => {
  const evidence = await source("../src/components/tabs/EvidenceTab.vue");
  const firstCell = evidence.match(/<td><div class="trade-identity">(?<body>[\s\S]*?)<\/div><\/td>/)?.groups?.body ?? "";
  expect(firstCell).toContain("inspect-button--mobile");
  expect(firstCell).toContain("<span>Inspect</span>");
  expect(evidence).toMatch(/@media\(max-width:720px\)[\s\S]*?\.inspect-button--mobile\s*\{[^}]*display:\s*inline-flex/);
  expect(evidence).toMatch(/@media\(max-width:720px\)[\s\S]*?\.inspect-button--desktop\s*\{[^}]*display:\s*none/);
  expect(evidence).toContain("candidate?.isConnected && candidate.getClientRects().length > 0");
  expect(evidence).toContain("isVisibleFocusTarget(previousFocus) ? previousFocus : origin");
  expect(evidence).toContain(".find(isVisibleFocusTarget)");
});

test("signed-in landing restores recent work with all request states", async () => {
  const landing = await source("../src/pages/LandingPage.vue");
  const recent = await source("../src/components/RecentInvestigations.vue");
  expect(landing).toContain('<RecentInvestigations v-if="sessionState.data?.user"');
  expect(recent).toContain('v-if="loading"');
  expect(recent).toContain('v-else-if="error"');
  expect(recent).toContain('v-else-if="cases.length === 0"');
  expect(recent).toContain('v-else class="recent-cases__list"');
});
