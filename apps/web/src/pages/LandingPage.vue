<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Plus } from "lucide-vue-next";
import PixelButton from "@/components/ui/PixelButton.vue";
import LandingMarketPreview from "@/components/LandingMarketPreview.vue";
import { useCourtStore } from "@/stores/court";
import { authClient } from "@/services/auth";
import { LANDING_MARKET_SOURCE } from "@/data/syntheticLandingMarket";

const router = useRouter();
const route = useRoute();
const store = useCourtStore();
const sessionState = authClient.useSession();
const sampleBusy = ref(false);
const sampleError = ref("");
let sampleRequestHandled = false;

async function openSample(kind: "real" | "synthetic" = "real") {
  if (sampleBusy.value || sessionState.value.isPending) return;
  sampleError.value = "";
  if (!sessionState.value.data?.user) {
    await router.push({ name: "auth", query: { redirect: kind === "synthetic" ? "/?sample=synthetic" : "/?sample=1" } });
    return;
  }
  sampleBusy.value = true;
  try {
    const id = kind === "synthetic" ? await store.createSyntheticSample() : await store.createSample();
    if (id) await router.push(`/case/${id}`);
    else sampleError.value = store.error || "Could not open the sample. Please try again.";
  } catch {
    sampleError.value = "Could not open the sample. Please try again.";
  } finally {
    sampleBusy.value = false;
  }
}

watch(
  () => [route.query.sample, sessionState.value.isPending, sessionState.value.data?.user?.id] as const,
  ([requested, pending, userId]) => {
    if (requested !== "1" && requested !== "synthetic") sampleRequestHandled = false;
    if ((requested === "1" || requested === "synthetic") && !pending && userId && !sampleRequestHandled) {
      sampleRequestHandled = true;
      void openSample(requested === "synthetic" ? "synthetic" : "real");
    }
  },
  { immediate: true },
);

const tests = [
  { name: "Evidence sufficiency", question: "Enough trades to draw a conclusion?", detail: "Counts completed trades in the evaluation period. A small sample stays inconclusive, even when its return looks good." },
  { name: "Out-of-sample", question: "Does it work on unseen history?", detail: "Separates development and evaluation periods. The confirmed rules are tested on the evaluation period without changing them." },
  { name: "Parameter stability", question: "What if the settings move a little?", detail: "Tests nearby supported parameter values. It shows when a result depends on one unusually precise setting." },
  { name: "Execution resilience", question: "Do costs and delayed fills erase the result?", detail: "Repeats the test with execution stresses, including higher transaction costs and delayed fills." },
  { name: "Regime stability", question: "Does it depend on one kind of market?", detail: "Breaks down results by market trend and volatility. Strong and weak regimes remain visible in the evidence." },
  { name: "Profit concentration", question: "Are a few trades doing all the work?", detail: "Measures how much of the net profit comes from the best trades. A handful of winners can hide a fragile result." },
  { name: "Risk profile", question: "What happened between the highs?", detail: "Examines drawdown, recovery and time underwater. The path to the final balance matters as much as the balance itself." },
];
const steps = [
  { name: "Write the rules", detail: "Your entry, exit, symbols and costs. In plain language or with an agent." },
  { name: "Lock the strategy", detail: "Review the exact logic before the Court sees the results." },
  { name: "Inspect the evidence", detail: "Follow each finding back to the chart, the trades and the test." },
];
</script>

<template>
  <div class="landing">
    <section class="hero" aria-labelledby="landing-heading">
      <h1 id="landing-heading">Find the weak spot.<br><span>Before you trade.</span></h1>
      <div class="hero__action-area">
        <p>Bring a trading idea from your AI assistant. Investigate its weaknesses together, with inspectable rules and historical evidence.</p>
        <div class="hero__actions">
          <RouterLink class="button hero__primary" to="/new">Create strategy <ArrowUpRight :size="17" /></RouterLink>
          <PixelButton class="hero__sample" :disabled="sampleBusy || sessionState.isPending" @click="openSample()">
            {{ sampleBusy ? "Opening sample…" : "Open sample" }} <ArrowRight :size="15" />
          </PixelButton>
        </div>
        <div v-if="sampleError"><p class="sample-error" role="alert">{{ sampleError }}</p><button class="hero__sample" type="button" :disabled="sampleBusy" @click="openSample('synthetic')">Use synthetic software demo</button></div>
        <span v-else class="hero__note">Historical tests. No orders placed.</span>
      </div>
    </section>

    <section v-motion-reveal class="investigation" aria-label="Synthetic chart and example trading rules">
      <header class="investigation__header">
        <div class="investigation__instrument"><strong>{{ LANDING_MARKET_SOURCE.symbol }}</strong><span>Example symbol <i>·</i> 2024</span></div>
        <span class="investigation__status"><span />Synthetic demo</span>
      </header>
      <div class="investigation__body">
        <LandingMarketPreview />
        <aside class="strategy-note" aria-labelledby="example-strategy-heading">
          <span class="strategy-note__label">An example rule</span>
          <h2 id="example-strategy-heading">Follow the<br>120-day trend.</h2>
          <div class="strategy-note__rules">
            <div><ArrowUpRight :size="17" /><p><strong>Buy</strong><span>Close above SMA 120</span></p></div>
            <div><ArrowDown :size="17" /><p><strong>Sell</strong><span>Close below SMA 120</span></p></div>
          </div>
          <p class="strategy-note__execution"><Check :size="13" />Next open <span>·</span> Long only</p>
          <div class="strategy-note__question">
            <p>The rule is simple.<br>Is the result robust?</p>
            <a href="#tests">See what gets tested <ArrowDown :size="14" /></a>
          </div>
        </aside>
      </div>
      <footer class="investigation__source">
        <span>{{ LANDING_MARKET_SOURCE.note }}</span>
        <span>Backtests use Alpaca by default.</span>
      </footer>
    </section>

    <section id="tests" v-motion-reveal class="tests-section" aria-labelledby="tests-heading">
      <div class="section-intro">
        <span class="section-intro__context">The Court</span>
        <h2 id="tests-heading">A return number<br> leaves things out.</h2>
        <p>Open any test to see the question behind it. A good-looking curve doesn't skip the scrutiny.</p>
        <a href="#process" class="text-link">How an investigation works <ArrowRight :size="15" /></a>
      </div>
      <div class="test-list">
        <details v-for="(test, index) in tests" :key="test.name" class="test-row">
          <summary>
            <span class="test-row__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="test-row__copy"><strong>{{ test.name }}</strong><span>{{ test.question }}</span></span>
            <Plus :size="18" class="test-row__toggle" />
          </summary>
          <p>{{ test.detail }}</p>
        </details>
      </div>
    </section>

    <section id="process" v-motion-reveal class="process-section" aria-labelledby="process-heading">
      <header><div><span class="section-intro__context">Your investigation</span><h2 id="process-heading">From a rule to a record.</h2></div><span class="process-section__note">Every change stays in the history.</span></header>
      <ol class="process-list">
        <li v-for="(step, index) in steps" :key="step.name"><span class="process-list__number">{{ index + 1 }}</span><h3>{{ step.name }}</h3><p>{{ step.detail }}</p></li>
      </ol>
      <div class="agent-note"><span class="agent-note__mark"><Check :size="14" /></span><p>Work by hand or with a WebMCP agent. <span>You confirm the rules before a test runs.</span></p></div>
    </section>

    <section v-motion-reveal class="landing-close" aria-label="Create your first strategy">
      <h2>Bring a rule.<br><span>Leave with evidence.</span></h2>
      <RouterLink class="button hero__primary" to="/new">Create strategy <ArrowUpRight :size="17" /></RouterLink>
    </section>
  </div>
</template>

<style scoped lang="scss">
.landing { width: 100%; max-width: var(--workspace-shell); margin: 0 auto; padding: 0 var(--workspace-gutter); }
.hero { display: grid; grid-template-columns: 1.25fr 1fr; align-items: end; gap: clamp(36px, 7vw, 110px); padding: 60px 0 42px; }
.hero h1 { margin: 0; font-size: clamp(45px, 4.4vw, 66px); font-weight: 600; line-height: 1.06; letter-spacing: -.05em; }
.hero h1 span { color: #85858a; }
.hero__action-area { max-width: 415px; padding-bottom: 3px; }
.hero__action-area > p:first-child { margin: 0 0 23px; color: #b4b4bb; font-size: 16px; line-height: 1.65; }
.hero__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; }
.hero__primary { min-height: 46px; gap: 22px; padding-inline: 19px; border-radius: 9px; box-shadow: 0 4px 18px rgba(0,0,0,.24); }
.hero__sample { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; padding: 0; border: 0; color: #d1d1d5; background: none; font-size: 13px; cursor: pointer; }
.hero__sample:hover { color: #fff; }
.hero__sample:disabled { opacity: .5; cursor: wait; }
.hero__note { display: block; margin-top: 15px; color: #797980; font-size: 11px; }
.sample-error { margin: 12px 0 0; color: #d8b2b2; font-size: 12px; line-height: 1.5; }
.investigation { overflow: hidden; border: 1px solid #2b2b2b; border-radius: 14px; background: #101010; box-shadow: var(--shadow-main), inset 0 1px 0 rgba(255,255,255,.04); }
.investigation__header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 28px; border-bottom: 1px solid var(--line-subtle); }
.investigation__instrument { display: flex; align-items: center; gap: 15px; }
.investigation__instrument strong { font-size: 20px; font-weight: 650; letter-spacing: -.025em; }
.investigation__instrument > span { color: var(--text-muted); font-size: 12px; }
.investigation__instrument i { margin: 0 7px; font-style: normal; color: #555; }
.investigation__status { display: inline-flex; align-items: center; gap: 7px; color: #a6a6ad; font-size: 11px; }
.investigation__status > span { width: 5px; height: 5px; border-radius: 50%; background: #88888e; }
.investigation__body { display: grid; grid-template-columns: minmax(0, 1fr) 285px; }
.strategy-note { display: flex; flex-direction: column; align-items: flex-start; padding: 29px 28px 25px; border-left: 1px solid var(--line-subtle); }
.strategy-note__label { color: #88888f; font-size: 11px; }
.strategy-note h2 { margin: 13px 0 30px; color: #ededee; font-size: 27px; font-weight: 550; line-height: 1.2; letter-spacing: -.035em; }
.strategy-note__rules { display: grid; gap: 23px; }
.strategy-note__rules > div { display: flex; align-items: flex-start; gap: 12px; }
.strategy-note__rules svg { margin-top: 1px; color: #939399; }
.strategy-note__rules p { display: grid; gap: 6px; margin: 0; }
.strategy-note__rules strong { font-size: 12px; font-weight: 550; }
.strategy-note__rules span { color: #a5a5ac; font-size: 12px; }
.strategy-note__execution { display: flex; align-items: center; gap: 6px; margin: 24px 0 0; color: #77777f; font-size: 10px; }
.strategy-note__execution > span { margin: 0 2px; }
.strategy-note__question { width: 100%; margin-top: auto; padding-top: 30px; }
.strategy-note__question > p { margin: 0; padding-top: 21px; border-top: 1px solid var(--line-subtle); color: #c4c4ca; font-size: 15px; line-height: 1.6; }
.strategy-note__question > a { display: inline-flex; align-items: center; gap: 10px; margin-top: 13px; color: #96969e; font-size: 11px; }
.strategy-note__question > a:hover { color: #fff; }
.investigation__source { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 28px; border-top: 1px solid var(--line-subtle); color: #7d7d84; font-size: 10px; line-height: 1.5; }
.tests-section { display: grid; grid-template-columns: .85fr 1.35fr; gap: clamp(45px, 7vw, 115px); padding: 122px 0 106px; scroll-margin-top: 36px; }
.section-intro { padding-top: 18px; }
.section-intro__context { display: block; margin-bottom: 17px; color: #8b8b92; font-size: 12px; }
.section-intro h2,.process-section h2 { margin: 0; font-size: clamp(30px, 3vw, 40px); font-weight: 550; line-height: 1.14; letter-spacing: -.04em; }
.section-intro > p { max-width: 315px; margin: 22px 0; color: #929299; font-size: 14px; line-height: 1.7; }
.text-link { display: inline-flex; align-items: center; gap: 10px; margin-top: 12px; color: #d0d0d4; font-size: 12px; }
.text-link:hover { color: #fff; }
.test-row { border-bottom: 1px solid var(--line-subtle); }
.test-row:first-child { border-top: 1px solid var(--line-subtle); }
.test-row summary { display: flex; align-items: center; gap: 18px; min-height: 85px; padding: 19px 0; cursor: pointer; list-style: none; }
.test-row summary::-webkit-details-marker { display: none; }
.test-row__number { align-self: flex-start; width: 24px; padding-top: 3px; color: #66666d; font-size: 11px; font-variant-numeric: tabular-nums; }
.test-row__copy { display: grid; gap: 7px; }
.test-row__copy strong { color: #dcdcdf; font-size: 15px; font-weight: 500; }
.test-row__copy > span { color: #85858d; font-size: 12px; line-height: 1.45; }
.test-row__toggle { flex-shrink: 0; margin-left: auto; color: #727279; transition: transform var(--motion-fast); }
.test-row summary:hover .test-row__copy strong,.test-row summary:hover .test-row__toggle { color: #fff; }
.test-row[open] .test-row__toggle { transform: rotate(45deg); }
.test-row > p { max-width: 500px; margin: -1px 32px 23px 42px; color: #aaaab1; font-size: 13px; line-height: 1.75; }
.process-section { padding: 69px 0 58px; border-top: 1px solid var(--line-subtle); scroll-margin-top: 32px; }
.process-section > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.process-section__note { padding-bottom: 5px; color: #82828a; font-size: 12px; }
.process-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 54px; margin: 51px 0 43px; padding: 0; list-style: none; }
.process-list li { padding-top: 22px; border-top: 1px solid #323232; }
.process-list__number { color: #727279; font-size: 12px; }
.process-list h3 { margin: 19px 0 12px; color: #e2e2e5; font-size: 19px; font-weight: 500; letter-spacing: -.02em; }
.process-list p { max-width: 305px; margin: 0; color: #929299; font-size: 13px; line-height: 1.7; }
.agent-note { display: flex; align-items: center; gap: 11px; color: #b6b6bc; font-size: 12px; }
.agent-note__mark { display: inline-flex; color: #8c8c92; }
.agent-note p { margin: 0; line-height: 1.6; }
.agent-note p > span { color: #77777f; }
.landing-close { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 65px 0 85px; border-top: 1px solid var(--line-subtle); }
.landing-close h2 { margin: 0; font-size: clamp(30px, 3.5vw, 45px); font-weight: 550; line-height: 1.13; letter-spacing: -.045em; }
.landing-close h2 > span { color: #83838a; }
@media (max-width: 1100px) {
  .hero { gap: 40px; padding-top: 62px; }
  .hero h1 { font-size: 49px; }
  .investigation__body { grid-template-columns: minmax(0, 1fr) 255px; }
  .strategy-note { padding-inline: 23px; }
  .strategy-note h2 { font-size: 25px; }
  .hero__actions { gap: 17px; }
  .tests-section { gap: 50px; }
}
@media (max-width: 820px) {
  .hero { grid-template-columns: 1fr; gap: 25px; padding: 49px 0 34px; }
  .hero h1 { font-size: clamp(43px, 7vw, 59px); }
  .hero__action-area { max-width: 510px; }
  .hero__action-area > p:first-child { margin-bottom: 21px; font-size: 15px; }
  .investigation__body { grid-template-columns: minmax(0, 1fr); }
  .strategy-note { display: grid; grid-template-columns: 1fr 1.1fr; gap: 0 30px; padding: 25px 28px; border-top: 1px solid var(--line-subtle); border-left: 0; }
  .strategy-note__label { grid-column: 1; }
  .strategy-note h2 { grid-column: 1; margin: 12px 0 0; }
  .strategy-note__rules { grid-column: 2; grid-row: 1 / span 3; gap: 20px; }
  .strategy-note__execution { grid-column: 1; margin-top: 20px; }
  .strategy-note__question { display: none; }
  .investigation__source { flex-wrap: wrap; gap: 2px; }
  .tests-section { grid-template-columns: 1fr; gap: 37px; padding: 75px 0; }
  .section-intro > p { max-width: 460px; margin-block: 17px; }
  .section-intro h2 br { display: none; }
  .section-intro .text-link { display: none; }
  .process-section > header { display: block; }
  .process-section__note { display: block; margin-top: 16px; }
  .process-list { gap: 24px; }
}
@media (max-width: 560px) {
  .hero { padding-top: 39px; }
  .hero h1 { font-size: clamp(35px, 8.9vw, 48px); }
  .hero__actions { gap: 23px; }
  .hero__primary { min-height: 45px; padding-inline: 15px; gap: 15px; }
  .hero__note { font-size: 10px; }
  .investigation { border-radius: 11px; }
  .investigation__header { gap: 10px; padding: 17px 18px; }
  .investigation__instrument { gap: 9px; }
  .investigation__instrument > span { font-size: 10px; }
  .investigation__instrument i { margin: 0 4px; }
  .investigation__instrument strong { font-size: 18px; }
  .investigation__status { font-size: 9px; gap: 5px; }
  .strategy-note { gap: 0 17px; padding: 24px 18px; }
  .strategy-note h2 { font-size: 22px; }
  .strategy-note__rules { gap: 19px; }
  .strategy-note__rules > div { gap: 8px; }
  .strategy-note__rules span { font-size: 10px; }
  .strategy-note__rules strong { font-size: 11px; }
  .strategy-note__execution { font-size: 9px; gap: 4px; }
  .investigation__source { padding: 12px 18px; font-size: 9px; }
  .tests-section { padding: 54px 0 59px; gap: 26px; }
  .section-intro h2,.process-section h2 { font-size: 30px; }
  .test-row summary { gap: 11px; }
  .test-row__number { width: 20px; font-size: 10px; }
  .test-row__copy strong { font-size: 14px; }
  .test-row__copy > span { font-size: 11px; }
  .test-row > p { margin-left: 31px; margin-right: 20px; font-size: 12px; }
  .process-section { padding: 44px 0; }
  .process-list { grid-template-columns: 1fr; gap: 25px; margin: 32px 0; }
  .process-list li { display: grid; grid-template-columns: 20px 1fr; gap: 9px 13px; padding-top: 20px; }
  .process-list__number { grid-row: 1 / span 2; padding-top: 3px; }
  .process-list h3 { margin: 0; font-size: 17px; }
  .process-list p { grid-column: 2; font-size: 12px; }
  .agent-note { align-items: flex-start; font-size: 11px; }
  .agent-note__mark { padding-top: 2px; }
  .agent-note p > span { display: block; }
  .landing-close { align-items: flex-start; flex-direction: column; gap: 24px; padding: 43px 0 55px; }
  .landing-close h2 { font-size: 34px; }
}
</style>
