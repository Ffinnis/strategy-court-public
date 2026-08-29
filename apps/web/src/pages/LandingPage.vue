<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowRight, Check, FlaskConical } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import { authClient } from "@/services/auth";

const router = useRouter();
const route = useRoute();
const store = useCourtStore();
const sessionState = authClient.useSession();
const sampleBusy = ref(false);
async function openSample(){
  if (!sessionState.value.data?.user) {
    await router.push({ name: "auth", query: { redirect: "/?sample=1" } });
    return;
  }
  sampleBusy.value=true;
  const id=await store.createSample();
  sampleBusy.value=false;
  if(id)await router.push(`/case/${id}`);
}
onMounted(() => { if (route.query.sample === "1" && sessionState.value.data?.user) void openSample(); });
const tests=["Evidence sufficiency","Out-of-sample","Parameter stability","Execution resilience","Regime stability","Profit concentration","Risk profile"];
</script>

<template>
  <main class="landing">
    <section class="hero">
      <div class="hero__copy">
        <h1>Test your strategy before risking capital.</h1>
        <p>Define the rules, run seven robustness tests, and inspect every failure.</p>
        <div class="hero__actions">
          <RouterLink class="button" to="/new">Create strategy <ArrowRight :size="15" /></RouterLink>
          <button class="button button--secondary" type="button" :disabled="sampleBusy" @click="openSample"><FlaskConical :size="15" />{{ sampleBusy ? "Opening…" : "Open sample" }}</button>
        </div>
      </div>

      <div class="preview" aria-label="Example robustness test result">
        <header class="preview__header"><div><strong>RSI pullback</strong><span>SPY · 2020–2024</span></div><span class="preview__status">Fragile</span></header>
        <div class="preview__chart" aria-hidden="true">
          <svg viewBox="0 0 900 230" preserveAspectRatio="none"><path class="grid" d="M0 45H900M0 115H900M0 185H900"/><path class="benchmark" d="M0 190L90 179L180 166L270 153L360 139L450 122L540 103L630 82L720 67L810 49L900 31"/><path class="strategy" d="M0 193L70 183L140 188L210 154L280 144L350 116L420 132L490 91L560 72L630 94L700 61L770 76L840 39L900 49"/></svg>
        </div>
        <div class="preview__metrics"><div><span>Net return</span><strong>+58.4%</strong></div><div><span>Max drawdown</span><strong>−18.6%</strong></div><div><span>Trades</span><strong>24</strong></div><div><span>Tests passed</span><strong>3 / 7</strong></div></div>
        <div class="preview__findings"><div><span>Parameter stability</span><strong>Failed</strong></div><div><span>Regime stability</span><strong>Inconclusive</strong></div><div><span>Execution resilience</span><strong>Passed</strong></div></div>
      </div>
    </section>

    <section class="test-section">
      <div><h2>Seven checks. One record.</h2><p>A profitable curve cannot hide a weak test.</p></div>
      <ol><li v-for="(test,index) in tests" :key="test"><span>{{ String(index+1).padStart(2,"0") }}</span><strong>{{ test }}</strong><Check :size="14" /></li></ol>
    </section>

    <section class="steps">
      <div><h2>How it works</h2><p>The rules are fixed before results are shown.</p></div>
      <ol><li><span>1</span><div><strong>Describe the strategy</strong><p>Enter the setup, symbols, dates, and costs.</p></div></li><li><span>2</span><div><strong>Confirm the rules</strong><p>Review the structured entry, exit, and risk logic.</p></div></li><li><span>3</span><div><strong>Run the tests</strong><p>Inspect results, failures, trades, and assumptions.</p></div></li></ol>
    </section>
  </main>
</template>

<style scoped lang="scss">
.landing{max-width:1180px;margin:0 auto;padding:0 24px 110px}.hero{display:grid;min-height:690px;align-content:center;justify-items:center;gap:58px;padding:80px 0 70px;text-align:center}.hero__copy{display:grid;justify-items:center}.hero h1{max-width:850px;margin:0;font-size:clamp(48px,6.5vw,78px);font-weight:650;line-height:1.02;letter-spacing:-.055em}.hero__copy>p{max-width:610px;margin:23px 0 27px;color:#a1a1aa;font-size:17px;line-height:1.55}.hero__actions{display:flex;gap:8px}.preview{width:100%;overflow:hidden;border:1px solid #27272a;border-radius:12px;background:#111;text-align:left}.preview__header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #27272a}.preview__header div{display:grid;gap:4px}.preview__header strong{font-size:14px}.preview__header span{color:#71717a;font-size:11px}.preview__status{padding:5px 9px!important;border:1px solid #3f3f46;border-radius:999px;color:#e4e4e7!important;background:#18181b}.preview__chart{padding:30px 22px 10px}.preview__chart svg{display:block;width:100%;height:230px}.grid{fill:none;stroke:#27272a;stroke-width:1;vector-effect:non-scaling-stroke}.benchmark{fill:none;stroke:#52525b;stroke-width:1.5;stroke-dasharray:5 5;vector-effect:non-scaling-stroke}.strategy{fill:none;stroke:#f4f4f5;stroke-width:2;vector-effect:non-scaling-stroke}.preview__metrics{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #27272a;border-bottom:1px solid #27272a}.preview__metrics div{display:grid;gap:6px;padding:16px 18px;border-left:1px solid #27272a}.preview__metrics div:first-child{border-left:0}.preview__metrics span{color:#71717a;font-size:10px}.preview__metrics strong{font-size:20px}.preview__findings{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#27272a}.preview__findings div{display:flex;justify-content:space-between;gap:14px;padding:14px 18px;background:#111;font-size:11px}.preview__findings span{color:#a1a1aa}.preview__findings strong{font-weight:550}.test-section,.steps{display:grid;grid-template-columns:.75fr 1.25fr;gap:80px;padding:96px 0;border-top:1px solid #27272a}.test-section h2,.steps h2{margin:0;font-size:36px;font-weight:620;letter-spacing:-.035em}.test-section>div p,.steps>div>p{margin:12px 0 0;color:#71717a;font-size:14px}.test-section ol,.steps ol{margin:0;padding:0;list-style:none}.test-section li{display:grid;grid-template-columns:34px 1fr auto;align-items:center;padding:15px 0;border-bottom:1px solid #27272a}.test-section li:first-child{border-top:1px solid #27272a}.test-section li span{color:#71717a;font-size:10px}.test-section li strong{font-size:13px;font-weight:500}.test-section li svg{color:#71717a}.steps li{display:grid;grid-template-columns:32px 1fr;gap:14px;padding:20px 0;border-bottom:1px solid #27272a}.steps li:first-child{border-top:1px solid #27272a}.steps li>span{display:grid;width:24px;height:24px;place-items:center;border:1px solid #3f3f46;border-radius:6px;color:#a1a1aa;font-size:10px}.steps li strong{font-size:14px}.steps li p{margin:6px 0 0;color:#71717a;font-size:12px;line-height:1.55}
@media(max-width:760px){.landing{padding-inline:16px}.hero{min-height:auto;padding-top:65px}.hero h1{font-size:50px}.hero__actions{display:grid;width:100%}.preview__metrics{grid-template-columns:1fr 1fr}.preview__metrics div:nth-child(odd){border-left:0}.preview__metrics div:nth-child(n+3){border-top:1px solid #27272a}.preview__findings{grid-template-columns:1fr}.test-section,.steps{grid-template-columns:1fr;gap:38px;padding:72px 0}}@media(max-width:430px){.hero h1{font-size:42px}.preview__chart{padding-inline:10px}.preview__metrics strong{font-size:17px}}
.landing{position:relative}.landing::before{position:absolute;z-index:-1;top:-80px;left:50%;width:min(1050px,95vw);height:680px;border-radius:50%;content:"";background:radial-gradient(ellipse,rgba(255,255,255,.055),rgba(255,255,255,.012) 48%,transparent 72%);filter:blur(30px);transform:translateX(-50%);animation:landing-ambient 12s ease-in-out infinite alternate}@keyframes landing-ambient{to{transform:translate(-48%,25px) scale(1.04)}}.preview{border-color:#303030;border-radius:18px;background:#141414;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 2px 4px rgba(0,0,0,.3),0 35px 90px rgba(0,0,0,.38);transition:transform 400ms cubic-bezier(.2,.8,.2,1),box-shadow 400ms ease}.preview:hover{transform:translateY(-4px);box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 3px 6px rgba(0,0,0,.32),0 45px 110px rgba(0,0,0,.48)}.preview__header{padding:21px 23px;border-bottom-color:rgba(255,255,255,.07)}.preview__chart{background:linear-gradient(180deg,rgba(255,255,255,.012),transparent)}.preview__metrics{border-color:rgba(255,255,255,.075)}.preview__metrics div{border-color:rgba(255,255,255,.065)}.preview__findings{background:rgba(255,255,255,.065)}.preview__findings div{background:#141414}.test-section,.steps{border-top-color:rgba(255,255,255,.07)}.test-section li,.steps li{border-bottom-color:rgba(255,255,255,.065);transition:padding 170ms ease,background 170ms ease}.test-section li:hover,.steps li:hover{padding-inline:12px;border-radius:10px;background:rgba(255,255,255,.026)}@media(prefers-reduced-motion:reduce){.landing::before{animation:none}}
</style>
