<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Braces, Check, Copy, Download, RefreshCw } from "lucide-vue-next";
import { ApiError, apiDownload, apiRequest, saveDownload, unwrap } from "@/services/api";
import { flattenFormula, normalizeSharedIndicator, type SharedIndicatorView } from "@/data/shared";
import StatusBadge from "@/components/StatusBadge.vue";
import OwnerShareControls from "@/components/OwnerShareControls.vue";

const route = useRoute();
const indicator = ref<SharedIndicatorView | null>(null);
const loading = ref(true);
const error = ref("");
const importing = ref(false);
const importError = ref("");
const importedId = ref("");
const copied = ref(false);
const downloadFormat = ref<"json" | "csv" | null>(null);
const downloadError = ref("");
const sharedResource = ref(true);
const token = computed(() => String(route.params.token ?? ""));
const formula = computed(() => flattenFormula(indicator.value?.formula));
const signInTarget = computed(() => ({ name: "auth", query: { redirect: route.fullPath } }));

function inputDetails(input: Record<string, unknown>): string {
  const details = [String(input.type ?? "number")];
  if (input.default !== undefined) details.push(`default ${String(input.default)}`);
  if (input.min !== undefined || input.max !== undefined) details.push(`${String(input.min ?? "unbounded")} to ${String(input.max ?? "unbounded")}`);
  return details.join(" · ");
}

async function loadIndicator() {
  loading.value = true;
  error.value = "";
  try {
    const payload = await apiRequest<unknown>(`/api/shared/indicators/${encodeURIComponent(token.value)}`);
    indicator.value = normalizeSharedIndicator(unwrap(payload, "indicator"));
    sharedResource.value = true;
  } catch (sharedIssue) {
    try {
      const payload = await apiRequest<unknown>(`/api/indicators/${encodeURIComponent(token.value)}`);
      indicator.value = normalizeSharedIndicator(unwrap(payload, "indicator"));
      sharedResource.value = false;
    } catch {
      indicator.value = null;
      error.value = sharedIssue instanceof Error ? sharedIssue.message : "This indicator could not be loaded.";
    }
  } finally {
    loading.value = false;
  }
}

async function importIndicator() {
  if (!sharedResource.value || importing.value) return;
  importing.value = true;
  importError.value = "";
  try {
    const payload = await apiRequest<unknown>(`/api/shared/indicators/${encodeURIComponent(token.value)}/import`, { method: "POST", body: "{}" });
    const imported = unwrap<Record<string, unknown>>(payload, "indicator");
    importedId.value = String(imported.id ?? "");
    if (!importedId.value) throw new Error("The API imported the indicator without returning its ID.");
  } catch (issue) {
    importError.value = issue instanceof ApiError && issue.code === "authentication_required"
      ? "Sign in to add this indicator to your catalog."
      : issue instanceof Error ? issue.message : "The indicator could not be imported.";
  } finally {
    importing.value = false;
  }
}

async function copyDefinition() {
  if (!indicator.value) return;
  await navigator.clipboard.writeText(JSON.stringify(indicator.value.raw, null, 2));
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1800);
}

async function downloadDefinition(format: "json" | "csv") {
  if (!indicator.value || downloadFormat.value) return;
  downloadFormat.value = format;
  downloadError.value = "";
  try {
    const prefix = sharedResource.value ? "/api/shared/indicators" : "/api/indicators";
    const slug = indicator.value.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() || "indicator";
    const file = await apiDownload(
      `${prefix}/${encodeURIComponent(token.value)}/export?format=${format}`,
      `${slug}.${format}`,
    );
    saveDownload(file);
  } catch (issue) {
    downloadError.value = issue instanceof Error ? issue.message : "The indicator could not be downloaded.";
  } finally {
    downloadFormat.value = null;
  }
}

onMounted(loadIndicator);
</script>

<template>
  <main class="shared-indicator">
    <div class="indicator-shell">
      <RouterLink class="back-link" to="/"><ArrowLeft :size="14" />Strategy Court</RouterLink>

      <section v-if="loading" class="page-state" role="status">
        <span class="loading-ring" aria-hidden="true" />
        <h1>Opening the indicator</h1>
        <p>Loading its inputs, dependencies and formula.</p>
      </section>

      <section v-else-if="error" class="page-state">
        <Braces :size="25" aria-hidden="true" />
        <StatusBadge status="Unavailable" />
        <h1>This indicator is not available</h1>
        <p role="alert">{{ error }}</p>
        <button class="indicator-button" type="button" @click="loadIndicator"><RefreshCw :size="15" />Try again</button>
      </section>

      <template v-else-if="indicator">
        <header class="indicator-hero">
          <div class="indicator-hero__copy">
            <div class="hero-status"><StatusBadge :status="indicator.sharingState" /><span>Indicator version {{ indicator.version }}</span></div>
            <h1>{{ indicator.name }}</h1>
            <p>{{ indicator.description }}</p>
            <div class="hero-facts"><span>{{ indicator.outputType }} output</span><span>{{ indicator.creatorType }} created</span><span>{{ indicator.dependencies.length }} dependencies</span></div>
          </div>
          <div class="hero-actions">
            <button class="icon-button" type="button" :aria-label="copied ? 'Definition copied' : 'Copy indicator definition'" @click="copyDefinition"><Check v-if="copied" :size="15" /><Copy v-else :size="15" /></button>
            <button class="export-button" type="button" :disabled="Boolean(downloadFormat)" @click="downloadDefinition('json')"><Download :size="14" />{{ downloadFormat === "json" ? "Preparing" : "JSON" }}</button>
            <button class="export-button" type="button" :disabled="Boolean(downloadFormat)" @click="downloadDefinition('csv')"><Download :size="14" />{{ downloadFormat === "csv" ? "Preparing" : "CSV" }}</button>
            <button v-if="sharedResource" class="indicator-button" type="button" :disabled="importing || Boolean(importedId)" @click="importIndicator">
              <Check v-if="importedId" :size="15" /><Download v-else :size="15" />
              {{ importedId ? "Added to your catalog" : importing ? "Adding indicator…" : "Add to my catalog" }}
            </button>
          </div>
        </header>

        <p v-if="downloadError" class="download-error" role="alert">{{ downloadError }}</p>
        <OwnerShareControls v-if="!sharedResource && indicator.raw.sharingState === 'unlisted'" entity-type="indicator" :entity-id="String(indicator.raw.id ?? token)" resource-name="this indicator" />

        <div v-if="importError || importedId" class="import-state" :class="{ 'import-state--success': importedId }" :role="importError ? 'alert' : 'status'">
          <template v-if="importedId"><Check :size="15" /><span>This indicator and its dependencies are now in your catalog.</span><RouterLink to="/indicators">Open catalog</RouterLink></template>
          <template v-else><span>{{ importError }}</span><RouterLink v-if="importError.includes('Sign in')" :to="signInTarget">Sign in</RouterLink></template>
        </div>

        <section class="indicator-section">
          <header><span class="section-badge">Inputs</span><h2>Controls exposed by this version</h2></header>
          <div v-if="indicator.inputs.length" class="input-grid">
            <article v-for="input in indicator.inputs" :key="String(input.name)">
              <span class="input-type">{{ input.type ?? "number" }}</span>
              <h3>{{ input.name }}</h3>
              <p>{{ input.description ?? "No input description was supplied." }}</p>
              <small>{{ inputDetails(input) }}</small>
            </article>
          </div>
          <p v-else class="empty-copy">This formula has no configurable inputs.</p>
        </section>

        <section class="indicator-section formula-section">
          <header><span class="section-badge">Formula</span><h2>Inspectable formula tree</h2></header>
          <div class="formula-surface">
            <div class="formula-rail" aria-hidden="true" />
            <dl>
              <div v-for="(line, index) in formula" :key="`${line.path}-${index}`">
                <dt>{{ line.path }}</dt>
                <dd>{{ line.value }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="indicator-section dependency-section">
          <header><span class="section-badge">Dependencies</span><h2>Portable supporting definitions</h2></header>
          <div v-if="indicator.dependencyDefinitions.length" class="dependency-list">
            <article v-for="dependency in indicator.dependencyDefinitions" :key="String(dependency.key)">
              <div><strong>{{ dependency.name }}</strong><span>{{ dependency.key }} · version {{ dependency.version }}</span></div>
              <p>{{ dependency.description }}</p>
            </article>
          </div>
          <div v-else class="dependency-empty"><Check :size="17" /><div><strong>Self-contained formula</strong><p>No custom indicator dependencies are required.</p></div></div>
        </section>

        <footer class="indicator-footer">
          <p>Review formulas and inputs before using an imported indicator in a strategy. Definitions are deterministic calculations, not forecasts.</p>
          <span>Manifest schema {{ indicator.schemaVersion }}</span>
        </footer>
      </template>
    </div>
  </main>
</template>

<style scoped lang="scss">
.export-button{display:inline-flex;min-height:43px;align-items:center;justify-content:center;gap:7px;padding:0 11px;border:1px solid #343434;border-radius:4px;color:#bbb;background:#171717;font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 16px 36px rgba(0,0,0,.4),inset 0 1px rgba(255,255,255,.04)}.export-button:disabled{opacity:.55;cursor:default}.export-button:not(:disabled):hover,.export-button:not(:disabled):focus-visible{color:#eee;border-color:#666;outline:2px solid #fff;outline-offset:2px}.download-error{margin:16px 0 0;color:#aaa;font-size:11px}
.shared-indicator{min-height:100vh;color:#d8d8d8;background:#090909}.indicator-shell{width:min(1080px,calc(100% - 48px));margin:0 auto;padding:36px 0 96px}.back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:54px;color:#777;font-size:11px;text-decoration:none}.back-link:hover,.back-link:focus-visible{color:#eee}.page-state{display:grid;min-height:62vh;place-items:center;align-content:center;gap:12px;text-align:center}.page-state h1{margin:8px 0 0;color:#f4f4f4;font-size:clamp(32px,5vw,58px);letter-spacing:-.055em}.page-state p{max-width:480px;margin:0 0 12px;color:#777;font-size:13px}.loading-ring{width:25px;height:25px;border:2px solid #303030;border-top-color:#f1f1f1;border-radius:50%;animation:spin 900ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.indicator-button{display:inline-flex;min-height:43px;align-items:center;justify-content:center;gap:9px;padding:0 16px;border:1px solid #e8e8e8;border-radius:4px;color:#080808;background:#ececec;font:600 11px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 16px 36px rgba(0,0,0,.48)}.indicator-button:disabled{opacity:.64;cursor:default}.indicator-button:not(:disabled):hover,.indicator-button:not(:disabled):focus-visible,.icon-button:hover,.icon-button:focus-visible{filter:brightness(1.12);outline:2px solid #fff;outline-offset:2px}.indicator-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:48px;padding:0 0 64px;border-bottom:1px solid rgba(255,255,255,.1)}.hero-status{display:flex;align-items:center;gap:13px;margin-bottom:20px;color:#6f6f6f;font-size:10px}.indicator-hero h1{max-width:780px;margin:0;color:#f7f7f7;font-size:clamp(50px,8vw,92px);font-weight:570;line-height:.92;letter-spacing:-.075em}.indicator-hero__copy>p{max-width:680px;margin:24px 0 0;color:#959595;font-size:15px;line-height:1.65}.hero-facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:25px}.hero-facts span,.section-badge,.input-type{display:inline-flex;min-height:25px;align-items:center;padding:0 9px;border:1px solid #2e2e2e;border-radius:999px;color:#9f9f9f;background:#151515;font:550 10px Inter,ui-sans-serif,system-ui,sans-serif}.hero-actions{display:flex;align-items:center;gap:8px}.icon-button{display:grid;width:43px;height:43px;place-items:center;border:1px solid #343434;border-radius:4px;color:#bbb;background:#171717;cursor:pointer;box-shadow:0 16px 36px rgba(0,0,0,.4),inset 0 1px rgba(255,255,255,.04)}.import-state{display:flex;min-height:52px;align-items:center;justify-content:center;gap:10px;margin-top:18px;padding:12px 16px;border:1px solid #383838;color:#b4b4b4;background:#141414;font-size:11px;box-shadow:0 18px 40px rgba(0,0,0,.35)}.import-state a{color:#f1f1f1}.import-state--success{border-color:#4a4a4a}.indicator-section{margin-top:72px}.indicator-section>header{display:grid;gap:11px;margin-bottom:25px}.indicator-section h2{margin:0;color:#efefef;font-size:clamp(27px,4vw,46px);font-weight:550;letter-spacing:-.055em}.input-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;padding:1px;background:#292929;box-shadow:0 34px 84px rgba(0,0,0,.48)}.input-grid article{min-height:210px;padding:24px;background:#111}.input-grid h3{margin:33px 0 8px;color:#e7e7e7;font-size:18px;letter-spacing:-.025em}.input-grid p{min-height:48px;margin:0;color:#7f7f7f;font-size:11px;line-height:1.55}.input-grid small{display:block;margin-top:24px;color:#aaa;font-size:10px}.input-type{min-height:22px}.formula-surface{position:relative;overflow:hidden;border:1px solid #2c2c2c;background:#0f0f0f;box-shadow:0 36px 88px rgba(0,0,0,.54),inset 0 1px rgba(255,255,255,.035)}.formula-rail{position:absolute;top:0;bottom:0;left:24px;width:1px;background:#343434}.formula-surface dl{position:relative;margin:0;padding:18px 25px 18px 52px}.formula-surface dl div{display:grid;grid-template-columns:minmax(240px,1fr) minmax(150px,.45fr);gap:28px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.065)}.formula-surface dl div:last-child{border-bottom:0}.formula-surface dt{color:#7d7d7d;font-size:10px}.formula-surface dd{margin:0;color:#dedede;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.dependency-list{border-top:1px solid rgba(255,255,255,.1)}.dependency-list article{display:grid;grid-template-columns:minmax(220px,.55fr) 1fr;gap:30px;padding:20px 0;border-bottom:1px solid rgba(255,255,255,.075)}.dependency-list article>div{display:grid;gap:7px}.dependency-list strong{color:#e2e2e2;font-size:13px}.dependency-list span{color:#636363;font-size:9px}.dependency-list p{margin:0;color:#878787;font-size:11px;line-height:1.6}.dependency-empty{display:flex;align-items:center;gap:14px;padding:24px;border:1px solid #2b2b2b;background:#101010}.dependency-empty strong{color:#ddd;font-size:12px}.dependency-empty p{margin:5px 0 0;color:#737373;font-size:10px}.empty-copy{margin:0;padding:25px 0;border-top:1px solid rgba(255,255,255,.1);color:#737373;font-size:11px}.indicator-footer{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;margin-top:78px;padding-top:23px;border-top:1px solid rgba(255,255,255,.1);color:#6f6f6f;font-size:10px}.indicator-footer p{max-width:650px;margin:0;line-height:1.6}.indicator-footer span{white-space:nowrap}
@media(max-width:820px){.indicator-hero{grid-template-columns:1fr}.hero-actions{justify-self:start}.input-grid{grid-template-columns:1fr 1fr}.formula-surface dl div{grid-template-columns:1fr}.dependency-list article{grid-template-columns:1fr;gap:8px}}
@media(max-width:560px){.indicator-shell{width:min(100% - 30px,1080px);padding-top:22px}.back-link{margin-bottom:38px}.input-grid{grid-template-columns:1fr}.hero-actions{flex-wrap:wrap}.indicator-button{flex-basis:100%}.formula-surface dl{padding-left:36px}.formula-rail{left:18px}.indicator-footer{flex-direction:column}}
</style>
