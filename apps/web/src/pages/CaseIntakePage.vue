<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-vue-next";
import FormChip from "@/components/forms/FormChip.vue";
import FormDatePicker from "@/components/forms/FormDatePicker.vue";
import FormSelect from "@/components/forms/FormSelect.vue";
import { formatCalendarDate, moveCalendarDay, moveCalendarMonth, parseCalendarDate } from "@/components/forms/calendar";
import { useCourtStore } from "@/stores/court";
import type { CaseInput } from "@/types";

const symbols = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "NFLX", "JPM",
  "XOM", "WMT", "COST", "JNJ", "KO", "SPY", "QQQ", "IWM", "DIA", "XLK",
];
const steps = [
  { number: 1, label: "Strategy" },
  { number: 2, label: "Test data" },
  { number: 3, label: "Review" },
];

const store = useCourtStore();
const router = useRouter();
const step = ref(1);
const submitting = ref(false);
const stepError = ref(false);
const selectedSymbol = ref("");
const stepHeading = ref<HTMLElement | null>(null);
const symbolSelect = ref<{ focus: () => void } | null>(null);
const maximumDate = new Date().toISOString().slice(0, 10);
const form = reactive<CaseInput>({
  name: "",
  description: "",
  symbols: ["SPY"],
  startDate: "2020-01-02",
  endDate: "2024-12-31",
  initialCapital: 10000,
  commissionBpsPerSide: 0,
  slippageBpsPerSide: 5,
});

const availableSymbols = computed(() => symbols.filter((symbol) => !form.symbols.includes(symbol)));
const availableSymbolOptions = computed(() => availableSymbols.value.map((symbol) => ({ value: symbol, label: symbol })));
const nameInvalid = computed(() => stepError.value && form.name.trim().length < 3);
const rulesInvalid = computed(() => stepError.value && form.description.trim().length < 20);
const strategyValid = computed(() => !nameInvalid.value && !rulesInvalid.value && form.name.trim().length >= 3 && form.description.trim().length >= 20);
const dataValid = computed(() => form.symbols.length >= 1 && form.symbols.length <= 5 && form.startDate < form.endDate && form.endDate <= maximumDate);
const valid = computed(() => strategyValid.value && dataValid.value && form.initialCapital >= 1000);
const stepValid = computed(() => step.value === 1 ? strategyValid.value : step.value === 2 ? dataValid.value : valid.value);
const startMaximumDate = computed(() => {
  const end = parseCalendarDate(form.endDate);
  const prior = end ? formatCalendarDate(moveCalendarDay(end, -1)) : maximumDate;
  return prior < maximumDate ? prior : maximumDate;
});
const endMinimumDate = computed(() => {
  const start = parseCalendarDate(form.startDate);
  return start ? formatCalendarDate(moveCalendarDay(start, 1)) : undefined;
});

async function addSymbol() {
  if (!selectedSymbol.value || form.symbols.length >= 5) return;
  form.symbols.push(selectedSymbol.value);
  selectedSymbol.value = "";
  await nextTick();
  if (form.symbols.length < 5) symbolSelect.value?.focus();
  else document.getElementById("start-date")?.focus({ preventScroll: true });
}

async function removeSymbol(symbol: string) {
  if (form.symbols.length === 1) return;
  form.symbols = form.symbols.filter((item) => item !== symbol);
  await nextTick();
  symbolSelect.value?.focus();
}

function periodStart(years: number) {
  const end = parseCalendarDate(form.endDate);
  return end ? formatCalendarDate(moveCalendarMonth(end, -years * 12)) : form.startDate;
}

function setPeriod(years: number) {
  form.startDate = periodStart(years);
}

function periodSelected(years: number) {
  return form.startDate === periodStart(years);
}

async function goToStep(nextStep: number) {
  stepError.value = false;
  step.value = nextStep;
  await nextTick();
  stepHeading.value?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function next() {
  stepError.value = true;
  if (!stepValid.value) return;
  if (step.value < 3) await goToStep(step.value + 1);
}

async function back() {
  if (step.value > 1) await goToStep(step.value - 1);
}

async function submit() {
  stepError.value = true;
  if (!valid.value) return;
  submitting.value = true;
  const id = await store.createCase({ ...form, symbols: [...form.symbols] });
  submitting.value = false;
  if (id) await router.push(`/case/${id}`);
}
</script>

<template>
  <main class="intake-page">
    <div class="intake-nav">
      <RouterLink class="back-link" to="/"><ArrowLeft :size="14" /> Strategy Court</RouterLink>
      <nav class="stepper" aria-label="Strategy creation progress">
        <button
          v-for="item in steps"
          :key="item.number"
          type="button"
          :class="{ active: step === item.number, complete: step > item.number }"
          :disabled="item.number > step"
          :aria-current="step === item.number ? 'step' : undefined"
          @click="goToStep(item.number)"
        >
          <span class="step-number"><Check v-if="step > item.number" :size="11" /><template v-else>{{ item.number }}</template></span>
          <span class="step-label">{{ item.label }}</span>
        </button>
      </nav>
    </div>

    <form class="wizard" novalidate @submit.prevent="submit">
      <Transition name="step" mode="out-in">
        <section v-if="step === 1" key="strategy" class="wizard-step">
          <header class="step-copy">
            <p class="step-kicker"><span>Step 1</span> Strategy</p>
            <h1 ref="stepHeading" tabindex="-1">Write the rules.</h1>
            <span>Describe what opens, closes, and limits a trade.</span>
            <ol class="rule-anatomy" aria-label="Information to include">
              <li><b>Entry</b><span>What must be true?</span></li>
              <li><b>Exit</b><span>What closes it?</span></li>
              <li><b>Risk</b><span>What caps the loss?</span></li>
            </ol>
          </header>

          <div>
            <div class="form-panel composer" :class="{ 'form-panel--invalid': stepError && !strategyValid }">
              <div class="composer-name">
                <label for="case-name">Strategy name</label>
                <input
                  id="case-name"
                  v-model.trim="form.name"
                  placeholder="RSI pullback"
                  maxlength="90"
                  required
                  :aria-invalid="nameInvalid"
                  :aria-describedby="nameInvalid ? 'strategy-error' : undefined"
                />
              </div>
              <div class="composer-rules">
                <label for="case-description">Trading rules</label>
                <textarea
                  id="case-description"
                  v-model.trim="form.description"
                  placeholder="Buy SPY when RSI falls below 35 while price is above its 200-day moving average. Exit when RSI rises above 60, after 20 days, or at a 5% stop."
                  maxlength="2000"
                  required
                  autofocus
                  :aria-invalid="rulesInvalid"
                  :aria-describedby="rulesInvalid ? 'rules-hint strategy-error' : 'rules-hint'"
                />
                <footer class="composer-meta">
                  <span id="rules-hint">Entry · Exit · Risk</span>
                  <span>{{ form.description.length }}/2000</span>
                </footer>
              </div>
            </div>
            <p v-if="stepError && !strategyValid" id="strategy-error" class="inline-error" role="alert">Add a name and at least 20 characters of rules.</p>
          </div>
        </section>

        <section v-else-if="step === 2" key="data" class="wizard-step">
          <header class="step-copy">
            <p class="step-kicker"><span>Step 2</span> Test data</p>
            <h1 ref="stepHeading" tabindex="-1">Choose the market.</h1>
            <span>Pick up to five symbols and the history the Court should test.</span>
          </header>

          <div>
            <div class="form-panel data-panel" :class="{ 'form-panel--invalid': stepError && !dataValid }">
              <fieldset class="control-group" :aria-describedby="stepError && !dataValid ? 'data-error' : undefined">
                <legend class="sr-only">Symbols, {{ form.symbols.length }} of 5 selected</legend>
                <div class="control-group__head" aria-hidden="true">
                  <span>Symbols</span>
                  <span class="group-count">{{ form.symbols.length }} of 5</span>
                </div>
                <div class="selected-symbols" aria-label="Selected symbols">
                  <FormChip
                    v-for="symbol in form.symbols"
                    :key="symbol"
                    :label="symbol"
                    :removable="form.symbols.length > 1"
                    @remove="removeSymbol(symbol)"
                  />
                </div>
                <div class="add-symbol">
                  <FormSelect
                    id="symbol-select"
                    ref="symbolSelect"
                    v-model="selectedSymbol"
                    class="symbol-select"
                    aria-label="Symbol to add"
                    :options="availableSymbolOptions"
                    :placeholder="form.symbols.length >= 5 ? 'Maximum of five symbols' : 'Select a symbol'"
                    :disabled="form.symbols.length >= 5"
                  />
                  <button class="button button--secondary add-symbol__button" type="button" :disabled="!selectedSymbol" @click="addSymbol"><Plus :size="14" /> Add</button>
                </div>
              </fieldset>

              <fieldset class="control-group period-group" :aria-describedby="stepError && !dataValid ? 'data-error' : undefined">
                <legend class="sr-only">Historical window</legend>
                <div class="period-head">
                  <span class="period-title" aria-hidden="true">Historical window</span>
                  <div class="period-presets" role="group" aria-label="Set historical window">
                    <button type="button" :class="{ active: periodSelected(3) }" :aria-pressed="periodSelected(3)" @click="setPeriod(3)">3 years</button>
                    <button type="button" :class="{ active: periodSelected(5) }" :aria-pressed="periodSelected(5)" @click="setPeriod(5)">5 years</button>
                  </div>
                </div>
                <div class="date-row">
                  <div class="field">
                    <label for="start-date">From</label>
                    <FormDatePicker
                      id="start-date"
                      v-model="form.startDate"
                      aria-label="Start date"
                      required
                      :max="startMaximumDate"
                      :aria-invalid="stepError && !dataValid"
                      :aria-describedby="stepError && !dataValid ? 'data-error' : undefined"
                    />
                  </div>
                  <div class="field">
                    <label for="end-date">To</label>
                    <FormDatePicker
                      id="end-date"
                      v-model="form.endDate"
                      aria-label="End date"
                      required
                      :min="endMinimumDate"
                      :max="maximumDate"
                      :aria-invalid="stepError && !dataValid"
                      :aria-describedby="stepError && !dataValid ? 'data-error' : undefined"
                    />
                  </div>
                </div>
              </fieldset>
            </div>
            <p v-if="stepError && !dataValid" id="data-error" class="inline-error" role="alert">Select at least one symbol and a historical date range that does not end in the future.</p>
          </div>
        </section>

        <section v-else key="review" class="wizard-step">
          <header class="step-copy">
            <p class="step-kicker"><span>Step 3</span> Review</p>
            <h1 ref="stepHeading" tabindex="-1">Lock the setup.</h1>
            <span>Check the inputs before the Court interprets the strategy.</span>
          </header>

          <div>
            <div class="form-panel review-panel" :class="{ 'form-panel--invalid': stepError && !valid }">
              <div class="review-list">
                <button type="button" @click="goToStep(1)">
                  <span><small>Strategy</small><strong>{{ form.name }}</strong></span><em>Edit</em>
                </button>
                <button type="button" @click="goToStep(2)">
                  <span><small>Test data</small><strong>{{ form.symbols.join(", ") }}</strong><small>{{ form.startDate }} to {{ form.endDate }}</small></span><em>Edit</em>
                </button>
              </div>

              <fieldset class="execution">
                <legend>Execution assumptions</legend>
                <div class="execution-grid">
                  <div class="field">
                    <label for="capital">Starting capital</label>
                    <input id="capital" v-model.number="form.initialCapital" class="input" type="number" min="1000" max="10000000" step="500" required :aria-invalid="stepError && form.initialCapital < 1000" :aria-describedby="stepError && !valid ? 'review-error' : undefined" />
                  </div>
                  <div class="field">
                    <label for="commission">Commission, bps</label>
                    <input id="commission" v-model.number="form.commissionBpsPerSide" class="input" type="number" min="0" max="100" step="1" />
                  </div>
                  <div class="field">
                    <label for="slippage">Slippage, bps</label>
                    <input id="slippage" v-model.number="form.slippageBpsPerSide" class="input" type="number" min="0" max="100" step="1" />
                  </div>
                </div>
                <p>Daily adjusted bars · Long only · Next-open fills</p>
              </fieldset>
            </div>
            <p v-if="stepError && !valid" id="review-error" class="inline-error" role="alert">Starting capital must be at least $1,000.</p>
            <p v-if="store.error" class="inline-error" role="alert">{{ store.error }}</p>
          </div>
        </section>
      </Transition>

      <footer class="wizard-actions">
        <span aria-hidden="true">Step {{ step }} of 3</span>
        <div class="wizard-actions__buttons">
          <button v-if="step > 1" class="button button--secondary" type="button" @click="back"><ArrowLeft :size="15" /> Back</button>
          <button v-if="step < 3" class="button" type="button" @click="next">Continue <ArrowRight :size="15" /></button>
          <button v-else class="button" type="submit" :disabled="submitting">{{ submitting ? "Creating…" : "Create strategy" }}<ArrowRight :size="15" /></button>
        </div>
      </footer>
    </form>
  </main>
</template>

<style scoped lang="scss">
.intake-page {
  width: min(1160px, calc(100% - 48px));
  min-height: calc(100vh - 104px);
  margin: 0 auto;
  padding: 28px 0 72px;
}

.intake-nav,
.wizard-step,
.wizard-actions {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 48px;
}

.intake-nav {
  align-items: center;
  margin-bottom: 38px;
}

.back-link {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 8px;
  color: #737373;
  font-size: 11px;
  transition: color 150ms ease, transform 150ms ease;
}

.back-link:hover {
  color: #fff;
  transform: translateX(-3px);
}

.stepper {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.stepper::after {
  position: absolute;
  z-index: 0;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  content: "";
  background: #202020;
}

.stepper button {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 38px;
  align-items: flex-start;
  gap: 8px;
  padding: 0;
  border: 0;
  color: #505050;
  background: transparent;
  font-size: 10px;
  text-align: left;
  cursor: default;
}

.stepper button::after {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  content: "";
  background: #f4f4f4;
  opacity: 0;
  transform: scaleX(.35);
  transform-origin: left;
  transition: opacity 160ms ease, transform 220ms ease;
}

.stepper button.active {
  color: #f2f2f2;
}

.stepper button.active::after {
  opacity: 1;
  transform: scaleX(1);
  box-shadow: 0 0 16px rgba(255,255,255,.25);
}

.stepper button.complete {
  color: #929292;
  cursor: pointer;
}

.step-number {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  place-items: center;
  border: 1px solid #313131;
  border-radius: 999px;
  color: currentColor;
  background: #121212;
  font-size: 10px;
  font-weight: 650;
  line-height: 1;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.stepper button.active .step-number {
  color: #0a0a0a;
  border-color: #f2f2f2;
  background: #f2f2f2;
  box-shadow: 0 5px 16px rgba(0,0,0,.35);
}

.stepper button.complete .step-number {
  border-color: #555;
}

.step-label {
  padding-top: 4px;
  font-weight: 550;
}

.wizard-step {
  align-items: start;
}

.step-copy {
  padding-top: 12px;
}

.step-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 18px;
  color: #8b8b8b;
  font-size: 11px;
  font-weight: 560;
}

.step-kicker span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid #303030;
  border-radius: 999px;
  color: #c4c4c4;
  background: #151515;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 5px 14px rgba(0,0,0,.2);
}

.step-copy h1 {
  margin: 0;
  color: #f7f7f7;
  font-size: clamp(42px, 4.2vw, 58px);
  font-weight: 590;
  line-height: .96;
  letter-spacing: -.055em;
  outline: 0;
}

.step-copy > span {
  display: block;
  max-width: 280px;
  margin-top: 20px;
  color: #9a9a9a;
  font-size: 13px;
  line-height: 1.55;
}

.rule-anatomy {
  margin: 34px 0 0;
  padding: 0;
  border-top: 1px solid #242424;
  list-style: none;
}

.rule-anatomy li {
  display: grid;
  grid-template-columns: 58px 1fr;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid #202020;
  font-size: 10px;
}

.rule-anatomy b {
  color: #bdbdbd;
  font-weight: 550;
}

.rule-anatomy span {
  color: #606060;
}

.form-panel {
  overflow: hidden;
  border: 1px solid #303030;
  border-radius: 18px;
  background: #111;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    inset 0 -1px 0 rgba(0,0,0,.65),
    0 3px 8px rgba(0,0,0,.45),
    0 32px 100px rgba(0,0,0,.52);
  transition: border-color 180ms ease, box-shadow 220ms ease, transform 180ms ease;
}

.form-panel:focus-within {
  border-color: #5c5c5c;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.075),
    0 0 0 4px rgba(255,255,255,.035),
    0 4px 12px rgba(0,0,0,.5),
    0 38px 120px rgba(0,0,0,.62);
  transform: translateY(-1px);
}

.form-panel--invalid {
  border-color: #555;
}

.composer-name,
.composer-rules {
  display: grid;
  gap: 10px;
  padding: 20px 24px;
}

.composer-name {
  border-bottom: 1px solid #272727;
}

.composer label,
.control-group__head,
.period-title,
.field label,
.execution legend {
  color: #a0a0a0;
  font-size: 11px;
  font-weight: 600;
}

.composer-name input,
.composer-rules textarea {
  width: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  color: #f0f0f0;
  background: transparent;
  resize: none;
}

.composer-name input {
  height: 30px;
  font-size: 19px;
  font-weight: 550;
  letter-spacing: -.025em;
}

.composer-rules textarea {
  min-height: 210px;
  font-size: 14px;
  line-height: 1.7;
}

.composer-name input::placeholder,
.composer-rules textarea::placeholder {
  color: #696969;
  opacity: 1;
}

.composer-meta {
  display: flex;
  justify-content: space-between;
  padding-top: 13px;
  border-top: 1px solid #242424;
  color: #5f5f5f;
  font-size: 10px;
  font-weight: 500;
}

.data-panel,
.review-panel {
  padding: 0 28px;
}

.data-panel {
  overflow: visible;
}

.control-group,
.execution {
  min-width: 0;
  margin: 0;
  padding: 26px 0;
  border: 0;
  border-bottom: 1px solid #272727;
}

.control-group:last-child,
.execution:last-child {
  border-bottom: 0;
}

.control-group__head,
.period-head {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.group-count {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid #343434;
  border-radius: 999px;
  color: #a8a8a8;
  background: #181818;
  font-size: 10px;
  font-weight: 550;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 5px 15px rgba(0,0,0,.18);
}

.selected-symbols {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.add-symbol {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 10px;
}

.symbol-select {
  min-width: 0;
}

.add-symbol__button {
  min-width: 92px;
  min-height: 46px;
}

.period-head {
  margin-bottom: 16px;
}

.period-title {
  color: #a0a0a0;
}

.period-presets {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid #2f2f2f;
  border-radius: 9px;
  background: #171717;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
}

.period-head button {
  height: 27px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  color: #8f8f8f;
  background: transparent;
  font-size: 10px;
  font-weight: 550;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.period-head button:hover {
  color: #fff;
  background: #202020;
}

.period-head button.active {
  color: #ededed;
  background: #292929;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.065), 0 5px 14px rgba(0,0,0,.24);
}

.date-row,
.execution-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: grid;
  gap: 8px;
}

.review-list {
  border-bottom: 1px solid #272727;
}

.review-list button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 19px 0;
  border: 0;
  border-bottom: 1px solid #252525;
  color: #e4e4e4;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.review-list button:last-child {
  border-bottom: 0;
}

.review-list button span {
  display: grid;
  gap: 5px;
}

.review-list small {
  color: #6e6e6e;
  font-size: 9px;
}

.review-list strong {
  font-size: 13px;
  font-weight: 550;
}

.review-list em {
  color: #8a8a8a;
  font-size: 10px;
  font-style: normal;
}

.execution {
  padding-bottom: 24px;
}

.execution legend {
  margin-bottom: 17px;
}

.execution-grid {
  grid-template-columns: 1.1fr 1fr 1fr;
}

.execution > p {
  margin: 13px 0 0;
  color: #606060;
  font-size: 10px;
}

.inline-error {
  margin: 12px 2px 0;
  color: #cfcfcf;
  font-size: 11px;
}

.wizard-actions {
  align-items: center;
  margin-top: 22px;
}

.wizard-actions > span {
  grid-column: 1;
  color: #4f4f4f;
  font-size: 10px;
  font-weight: 550;
}

.wizard-actions__buttons {
  grid-column: 2;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.wizard-actions .button {
  min-width: 116px;
}

.step-enter-active,
.step-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1);
}

.step-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.step-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.sr-only {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}

@media (max-width: 880px) {
  .intake-nav,
  .wizard-step,
  .wizard-actions {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .intake-nav {
    gap: 30px;
    margin-bottom: 42px;
  }

  .step-copy {
    padding: 0 0 30px;
  }

  .step-copy > span {
    max-width: 460px;
  }

  .rule-anatomy {
    display: none;
  }

  .wizard-actions {
    display: flex;
    justify-content: space-between;
  }

  .wizard-actions > span,
  .wizard-actions__buttons {
    grid-column: auto;
  }
}

@media (max-height: 680px) and (min-width: 881px) {
  .intake-page {
    padding-top: 20px;
    padding-bottom: 44px;
  }

  .intake-nav {
    margin-bottom: 28px;
  }

  .step-copy {
    padding-top: 4px;
  }

  .step-kicker {
    margin-bottom: 14px;
  }

  .step-copy h1 {
    font-size: 52px;
  }

  .step-copy > span {
    margin-top: 16px;
  }

  .control-group,
  .execution {
    padding-block: 21px;
  }

  .wizard-actions {
    margin-top: 18px;
  }
}

@media (max-width: 560px) {
  .intake-page {
    width: calc(100% - 28px);
    padding-top: 22px;
  }

  .intake-nav {
    gap: 24px;
    margin-bottom: 34px;
  }

  .stepper button {
    gap: 5px;
  }

  .step-label {
    font-size: 9px;
  }

  .step-copy {
    padding-bottom: 24px;
  }

  .step-copy h1 {
    font-size: 42px;
  }

  .step-copy > span {
    margin-top: 14px;
    font-size: 12px;
  }

  .form-panel {
    border-radius: 14px;
  }

  .composer-name,
  .composer-rules {
    padding: 18px;
  }

  .composer-rules textarea {
    min-height: 230px;
    font-size: 13px;
  }

  .data-panel,
  .review-panel {
    padding-inline: 18px;
  }

  .date-row,
  .execution-grid {
    grid-template-columns: 1fr;
  }

  .wizard-actions {
    margin-top: 20px;
  }

  .wizard-actions > span {
    display: none;
  }

  .wizard-actions__buttons {
    width: 100%;
  }

  .wizard-actions__buttons .button:last-child {
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .form-panel,
  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
}
</style>
