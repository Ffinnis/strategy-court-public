<script setup lang="ts">
import { toRef } from "vue";
import { AlertCircle, ArrowRight, FileSearch, Plus, RotateCcw } from "lucide-vue-next";
import { recentCaseStatus, useRecentCases } from "@/services/recentCases";

const props = defineProps<{ active: boolean; accountId: string }>();
const { cases, loading, error, refresh } = useRecentCases(toRef(props, "accountId"), toRef(props, "active"));

function dateLabel(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

</script>

<template>
  <section class="recent-cases" aria-labelledby="recent-cases-title">
    <header class="recent-cases__header">
      <div>
        <span>Your workspace</span>
        <h2 id="recent-cases-title">Recent investigations</h2>
      </div>
      <RouterLink to="/new">New strategy <Plus :size="14" /></RouterLink>
    </header>

    <div v-if="loading" class="recent-cases__loading" role="status" aria-label="Loading recent investigations">
      <span /><span /><span />
    </div>

    <div v-else-if="error" class="recent-cases__message" role="alert">
      <AlertCircle :size="16" />
      <div><strong>Investigations could not be loaded</strong><p>{{ error }}</p></div>
      <button type="button" @click="refresh"><RotateCcw :size="13" /> Retry</button>
    </div>

    <div v-else-if="cases.length === 0" class="recent-cases__message recent-cases__message--empty">
      <FileSearch :size="17" />
      <div><strong>No investigations yet</strong><p>Create a strategy or open the sample to start a case record.</p></div>
      <RouterLink to="/new">Create strategy <ArrowRight :size="13" /></RouterLink>
    </div>

    <ol v-else class="recent-cases__list">
      <li v-for="item in cases.slice(0, 5)" :key="item.id">
        <RouterLink :to="`/case/${encodeURIComponent(item.id)}`">
          <div class="recent-cases__name"><strong>{{ item.name }}</strong><span>{{ item.symbols.join(" · ") || "No symbols" }}</span></div>
          <span class="recent-cases__period">{{ item.startDate }} to {{ item.endDate }}</span>
          <span class="recent-cases__status" :data-status="item.status"><i />{{ recentCaseStatus(item.status) }}</span>
          <time :datetime="item.updatedAt">{{ dateLabel(item.updatedAt) }}</time>
          <ArrowRight :size="15" aria-hidden="true" />
        </RouterLink>
      </li>
    </ol>
  </section>
</template>

<style scoped lang="scss">
.recent-cases{margin:5px 0 42px;border-top:1px solid var(--line-subtle);border-bottom:1px solid var(--line-subtle)}
.recent-cases__header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:24px 0 20px}
.recent-cases__header>div{display:grid;gap:7px}.recent-cases__header span{color:#7f7f87;font-size:11px}.recent-cases__header h2{margin:0;font-size:23px;font-weight:560;letter-spacing:-.03em}
.recent-cases__header>a,.recent-cases__message>a,.recent-cases__message button{display:inline-flex;align-items:center;gap:7px;border:0;color:#cfcfd4;background:transparent;font-size:11px;font-weight:560;cursor:pointer}.recent-cases__header>a:hover,.recent-cases__message>a:hover,.recent-cases__message button:hover{color:#fff}
.recent-cases__list{margin:0;padding:0;list-style:none}.recent-cases__list li{border-top:1px solid rgba(255,255,255,.065)}
.recent-cases__list a{display:grid;min-height:68px;grid-template-columns:minmax(180px,1.35fr) minmax(170px,.8fr) minmax(125px,.55fr) 96px 18px;align-items:center;gap:18px;color:inherit;transition:background 150ms ease,transform 150ms ease}
.recent-cases__list a:hover{background:rgba(255,255,255,.018);transform:translateX(3px)}.recent-cases__name{display:grid;min-width:0;gap:5px}.recent-cases__name strong{overflow:hidden;font-size:13px;font-weight:570;text-overflow:ellipsis;white-space:nowrap}.recent-cases__name span,.recent-cases__period,.recent-cases__list time{color:#77777f;font-size:10px}.recent-cases__period{font-variant-numeric:tabular-nums}.recent-cases__status{display:inline-flex;align-items:center;gap:7px;color:#a6a6ad;font-size:10px}.recent-cases__status i{width:5px;height:5px;border-radius:50%;background:#6d6d74}.recent-cases__status[data-status="evaluated"] i{background:#d6d6da}.recent-cases__status[data-status="running"] i,.recent-cases__status[data-status="queued"] i{background:#a6a6ad;box-shadow:0 0 0 4px rgba(255,255,255,.04)}.recent-cases__list time{text-align:right}.recent-cases__list svg{color:#73737a}
.recent-cases__message{display:flex;min-height:82px;align-items:center;gap:12px;padding:17px 0;border-top:1px solid rgba(255,255,255,.065);color:#9b9ba2}.recent-cases__message>svg{flex:none}.recent-cases__message>div{display:grid;gap:4px}.recent-cases__message strong{color:#ceced2;font-size:12px;font-weight:560}.recent-cases__message p{margin:0;color:#7c7c84;font-size:11px;line-height:1.5}.recent-cases__message>a,.recent-cases__message button{margin-left:auto}
.recent-cases__loading{display:grid;gap:1px;border-top:1px solid rgba(255,255,255,.065)}.recent-cases__loading span{height:66px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.025),transparent);background-size:220% 100%;animation:recent-loading 1.4s ease infinite}.recent-cases__loading span+span{border-top:1px solid rgba(255,255,255,.045)}
@keyframes recent-loading{to{background-position:-220% 0}}
@media(max-width:800px){.recent-cases__list a{grid-template-columns:minmax(0,1fr) minmax(112px,.5fr) 18px}.recent-cases__period,.recent-cases__list time{display:none}}
@media(max-width:520px){.recent-cases{margin-bottom:30px}.recent-cases__header{align-items:center;padding-block:20px 17px}.recent-cases__header h2{font-size:20px}.recent-cases__list a{min-height:70px;grid-template-columns:minmax(0,1fr) 18px;gap:11px}.recent-cases__status{grid-column:1}.recent-cases__name{grid-row:1}.recent-cases__list a>svg{grid-column:2;grid-row:1/span 2}.recent-cases__message{align-items:flex-start;flex-wrap:wrap}.recent-cases__message>a,.recent-cases__message button{width:100%;margin:4px 0 0 28px}}
@media(prefers-reduced-motion:reduce){.recent-cases__list a{transition:none}.recent-cases__loading span{animation:none}}
</style>
