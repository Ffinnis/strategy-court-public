<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Copy, ExternalLink, Link2, RefreshCw, RotateCw, Unlink } from "lucide-vue-next";
import { apiRequest, unwrap } from "@/services/api";

interface ShareState {
  state: "not_shared" | "active" | "revoked";
  publicPath?: string;
  createdAt?: string;
  revokedAt?: string;
}

import { useNotifications } from "@/stores/notifications";
const notifications = useNotifications();

const props = defineProps<{
  entityType: "report" | "indicator";
  entityId: string;
  resourceName: string;
}>();

const share = ref<ShareState>({ state: "not_shared" });
const publicUrl = ref("");
const busy = ref<"load" | "issue" | "rotate" | "revoke" | null>(null);
const error = ref("");
const copied = ref(false);

const entityPath = computed(() => props.entityType === "report" ? "reports" : "indicators");
const endpoint = computed(() => `/api/${entityPath.value}/${encodeURIComponent(props.entityId)}/share`);
const statusCopy = computed(() => {
  if (share.value.state === "active" && publicUrl.value) return props.entityType === "report"
    ? "Anyone with this link can read the run and its confirmed decisions. Later confirmed revisions update this report; private drafts stay private."
    : "Anyone with this unlisted link can read the indicator record.";
  if (share.value.state === "active") return "An active link exists. Rotate it to reveal a new copyable URL.";
  if (share.value.state === "revoked") return "The previous link is revoked and no longer opens the record.";
  return "Create an unlisted, read-only link. It is shown once and can be revoked at any time.";
});

function absoluteUrl(path?: string): string {
  return path ? new URL(path, window.location.origin).toString() : "";
}

function selectUrl(event: FocusEvent): void {
  if (event.target instanceof HTMLInputElement) event.target.select();
}

async function load(): Promise<void> {
  const requestedId = props.entityId;
  publicUrl.value = "";
  error.value = "";
  busy.value = "load";
  try {
    const next = unwrap<ShareState>(await apiRequest(endpoint.value), "share");
    if (requestedId === props.entityId) share.value = next;
  } catch (issue) {
    if (requestedId === props.entityId) error.value = issue instanceof Error ? issue.message : "The share state could not be loaded.";
  } finally {
    if (requestedId === props.entityId) busy.value = null;
  }
}

async function mutate(operation: "issue" | "rotate" | "revoke"): Promise<void> {
  if (busy.value) return;
  if (operation === "rotate" && !window.confirm("Rotate this link? The current URL will stop working immediately.")) return;
  if (operation === "revoke" && !window.confirm("Revoke this link? Anyone using it will lose access immediately.")) return;
  busy.value = operation;
  error.value = "";
  copied.value = false;
  try {
    const suffix = operation === "issue" ? "" : `/${operation}`;
    const next = unwrap<ShareState>(await apiRequest(`${endpoint.value}${suffix}`, { method: "POST", body: "{}" }), "share");
    share.value = next;
    publicUrl.value = operation === "revoke" ? "" : absoluteUrl(next.publicPath);
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : `The link could not be ${operation === "revoke" ? "revoked" : "created"}.`;
  } finally {
    busy.value = null;
  }
}

async function copyLink(): Promise<void> {
  if (!publicUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    copied.value = true;
    notifications.push("Share link copied.");
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    error.value = "Copy is unavailable in this browser. Select the URL and copy it manually.";
  }
}

watch(() => props.entityId, () => void load(), { immediate: true });
</script>

<template>
  <section class="owner-share" :aria-busy="Boolean(busy)">
    <header>
      <span class="share-mark"><Link2 :size="15" aria-hidden="true" /></span>
      <div><h3>Share {{ resourceName }}</h3><p>{{ statusCopy }}</p></div>
      <span class="share-state"><i />{{ busy === "load" ? "Checking" : share.state === "active" ? "Link active" : share.state === "revoked" ? "Revoked" : "Private" }}</span>
    </header>

    <div v-if="publicUrl" class="share-url">
      <input :value="publicUrl" readonly aria-label="Share URL" @focus="selectUrl" />
      <a :href="publicUrl" target="_blank" rel="noopener noreferrer" aria-label="Open shared record"><ExternalLink :size="14" /></a>
      <button type="button" :aria-label="copied ? 'Share URL copied' : 'Copy share URL'" @click="copyLink">
        <Check v-if="copied" :size="14" /><Copy v-else :size="14" />
      </button>
    </div>

    <p v-if="error" class="share-error" role="alert">{{ error }}</p>

    <div class="share-actions">
      <button v-if="share.state !== 'active'" class="button button--secondary button--small" type="button" :disabled="Boolean(busy)" @click="mutate('issue')">
        <RefreshCw v-if="busy === 'issue'" :size="13" class="spinning" /><Link2 v-else :size="13" />
        {{ busy === "issue" ? "Creating link" : "Create share link" }}
      </button>
      <template v-else>
        <button class="share-action" type="button" :disabled="Boolean(busy)" @click="mutate('rotate')"><RotateCw :size="13" :class="{ spinning: busy === 'rotate' }" />{{ busy === "rotate" ? "Rotating" : "Rotate link" }}</button>
        <button class="share-action" type="button" :disabled="Boolean(busy)" @click="mutate('revoke')"><Unlink :size="13" />{{ busy === "revoke" ? "Revoking" : "Revoke link" }}</button>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.owner-share{display:grid;gap:15px;padding:18px 0;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.owner-share header{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:start;gap:11px}.share-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;color:#b8b8b8;background:rgba(255,255,255,.055);box-shadow:inset 0 1px rgba(255,255,255,.04),0 12px 28px rgba(0,0,0,.24)}
.owner-share h3{margin:1px 0 5px;color:#e5e5e5;font-size:13px}.owner-share p{margin:0;color:#777;font-size:10px;line-height:1.5}.share-state{display:inline-flex;min-height:23px;align-items:center;gap:6px;padding:0 8px;border:1px solid rgba(255,255,255,.09);border-radius:999px;color:#8b8b8b;font-size:9px;white-space:nowrap}.share-state i{width:5px;height:5px;border-radius:50%;background:#aaa}
.share-url{display:grid;grid-template-columns:minmax(0,1fr) 34px 34px;gap:6px}.share-url input{min-width:0;height:36px;padding:0 10px;border:1px solid #303030;border-radius:8px;outline:0;color:#bcbcbc;background:#111;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.share-url input:focus{border-color:#666;box-shadow:0 0 0 3px rgba(255,255,255,.05)}.share-url a,.share-url button,.share-action{display:inline-flex;align-items:center;justify-content:center;border:1px solid #303030;border-radius:8px;color:#aaa;background:#171717;cursor:pointer}.share-url a:hover,.share-url a:focus-visible,.share-url button:hover,.share-url button:focus-visible,.share-action:hover,.share-action:focus-visible{color:#eee;border-color:#555;outline:0}
.share-error{color:#c4c4c4!important}.share-actions{display:flex;flex-wrap:wrap;gap:7px}.share-action{min-height:32px;gap:7px;padding:0 10px;font:550 9px Inter,ui-sans-serif,system-ui,sans-serif}.share-action:disabled{opacity:.55;cursor:default}.spinning{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:560px){.owner-share header{grid-template-columns:34px 1fr}.share-state{grid-column:2;justify-self:start}.share-url{grid-template-columns:minmax(0,1fr) 36px 36px}}
@media(prefers-reduced-motion:reduce){.spinning{animation:none}}
</style>
