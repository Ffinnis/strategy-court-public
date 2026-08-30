<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus } from "lucide-vue-next";
import FormChip from "@/components/forms/FormChip.vue";
import FormDatePicker from "@/components/forms/FormDatePicker.vue";
import FormSelect from "@/components/forms/FormSelect.vue";
import { formatCalendarDate, moveCalendarDay, moveCalendarMonth, parseCalendarDate } from "@/components/forms/calendar";
import { intakeStepHasErrors, validateCaseIntake } from "@/lib/case-intake-validation";
import { useCourtStore } from "@/stores/court";
import type { CaseInput } from "@/types";

type IntakeStep = 1 | 2 | 3;
const symbols = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "NFLX", "JPM",
  "XOM", "WMT", "COST", "JNJ", "KO", "SPY", "QQQ", "IWM", "DIA", "XLK",
];
const steps: { number: IntakeStep; label: string; description: string }[] = [
  { number: 1, label: "Strategy", description: "Name and trading rules" },
  { number: 2, label: "Test data", description: "Symbols and history" },
  { number: 3, label: "Review", description: "Setup and trading costs" },
];
const fieldIds: Record<keyof CaseInput, string> = {
  name: "case-name", description: "case-description", symbols: "symbol-select",
  startDate: "start-date", endDate: "end-date", initialCapital: "capital",
  commissionBpsPerSide: "commission", slippageBpsPerSide: "slippage",
};
const store = useCourtStore();
const router = useRouter();
const step = ref<IntakeStep>(1);
const submitting = ref(false);
const createdCaseId = ref<string | null>(null);
const stepError = ref(false);
const submitError = ref("");
const selectedSymbol = ref("");
const stepHeading = ref<HTMLElement | null>(null);
const symbolSelect = ref<{ focus: () => void } | null>(null);
const maximumDate = new Date().toISOString().slice(0, 10);
const form = reactive<CaseInput>({
  name: "", description: "", symbols: ["SPY"],
  startDate: "2020-01-02", endDate: "2024-12-31",
  initialCapital: 10000, commissionBpsPerSide: 0, slippageBpsPerSide: 5,
});

const errors = computed(() => validateCaseIntake(form, maximumDate));
const availableSymbolOptions = computed(() => symbols
  .filter((symbol) => !form.symbols.includes(symbol))
  .map((symbol) => ({ value: symbol, label: symbol })));
const startMaximumDate = computed(() => {
  const end = parseCalendarDate(form.endDate);
  const prior = end ? formatCalendarDate(moveCalendarDay(end, -1)) : maximumDate;
  return prior < maximumDate ? prior : maximumDate;
});
const endMinimumDate = computed(() => {
  const start = parseCalendarDate(form.startDate);
  return start ? formatCalendarDate(moveCalendarDay(start, 1)) : undefined;
});

function fieldError(field: keyof CaseInput) {
  return stepError.value ? errors.value[field] : undefined;
}

async function focusFirstError() {
  await nextTick();
  const field = (Object.keys(errors.value) as (keyof CaseInput)[])
    .find((key) => document.getElementById(fieldIds[key]));
  if (field) document.getElementById(fieldIds[field])?.focus();
}

async function addSymbol() {
  if (!selectedSymbol.value || form.symbols.length >= 5 || form.symbols.includes(selectedSymbol.value)) return;
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

function readableDate(value: string) {
  if (!parseCalendarDate(value)) return value;
  return new Date(value + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

async function goToStep(nextStep: IntakeStep) {
  if (submitting.value || createdCaseId.value) return;
  stepError.value = false;
  submitError.value = "";
  step.value = nextStep;
  await nextTick();
  stepHeading.value?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function next() {
  if (submitting.value) return;
  stepError.value = true;
  if (intakeStepHasErrors(errors.value, step.value)) {
    await focusFirstError();
    return;
  }
  if (step.value < 3) await goToStep((step.value + 1) as IntakeStep);
}

async function submit() {
  if (submitting.value) return;
  // Enter advances the current step. Persistence only happens from the review.
  if (step.value !== 3) {
    await next();
    return;
  }
  stepError.value = true;
  if (intakeStepHasErrors(errors.value, 3)) {
    await focusFirstError();
    return;
  }
  submitting.value = true;
  submitError.value = "";
  try {
    if (!createdCaseId.value) {
      const id = await store.createCase({ ...form, symbols: [...form.symbols] });
      if (!id) {
        submitError.value = store.error || "The case could not be created. Try again.";
        return;
      }
      createdCaseId.value = id;
    }
    await router.push("/case/" + createdCaseId.value);
  } catch {
    submitError.value = createdCaseId.value
      ? "Your case was created, but the workspace could not open. Try opening it again."
      : "The case could not be created. Your inputs are still here. Try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="intake-page">
    <aside class="intake-progress">
      <p class="intake-title">New strategy</p>
      <nav class="stepper" aria-label="Strategy creation progress">
        <ol>
          <li v-for="item in steps" :key="item.number">
            <button
              type="button"
              :class="{ active: step === item.number, complete: step > item.number }"
              :disabled="item.number > step || submitting || Boolean(createdCaseId)"
              :aria-current="step === item.number ? 'step' : undefined"
              @click="goToStep(item.number)"
            >
              <span class="step-number" aria-hidden="true">
                <Check v-if="step > item.number" :size="13" />
                <template v-else>{{ item.number }}</template>
              </span>
              <span class="step-label"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            </button>
          </li>
        </ol>
      </nav>
    </aside>

    <form class="wizard" novalidate :aria-busy="submitting" @submit.prevent="submit">
      <fieldset class="wizard-fields" :disabled="submitting || Boolean(createdCaseId)" aria-labelledby="intake-heading">
        <section v-if="step === 1" class="wizard-step">
          <header class="step-heading">
            <h1 id="intake-heading" ref="stepHeading" tabindex="-1">Describe your strategy</h1>
            <p>Start with the rules you want to test.</p>
          </header>

          <div class="intake-field">
            <label for="case-name">Strategy name</label>
            <input
              id="case-name" v-model.trim="form.name" class="intake-control"
              placeholder="e.g. SMA 120 trend" maxlength="90" autocomplete="off" required
              :aria-invalid="Boolean(fieldError('name'))"
              :aria-describedby="fieldError('name') ? 'name-error' : undefined"
            />
            <p v-if="fieldError('name')" id="name-error" class="field-error" role="alert">{{ fieldError('name') }}</p>
          </div>

          <div class="intake-field rules-field">
            <label for="case-description">Trading rules</label>
            <textarea
              id="case-description" v-model.trim="form.description" class="intake-control"
              placeholder="When do you buy?&#10;When do you sell?&#10;How do you limit risk?"
              maxlength="2000" rows="6" required
              :aria-invalid="Boolean(fieldError('description'))"
              :aria-describedby="fieldError('description') ? 'rules-hint rules-error' : 'rules-hint'"
            />
            <div class="rules-meta">
              <span id="rules-hint">Entry, exit and risk, in your own words.</span>
              <span aria-label="Characters used">{{ form.description.length }} / 2000</span>
            </div>
            <p v-if="fieldError('description')" id="rules-error" class="field-error" role="alert">{{ fieldError('description') }}</p>
          </div>

          <details class="rules-example">
            <summary>See an example <ChevronDown :size="14" aria-hidden="true" /></summary>
            <p>Buy when the daily close is above SMA 120. Sell when it falls below SMA 120. Trade long only at the next open, with a 5% stop loss.</p>
          </details>
        </section>

        <section v-else-if="step === 2" class="wizard-step">
          <header class="step-heading">
            <h1 id="intake-heading" ref="stepHeading" tabindex="-1">Choose your test data</h1>
            <p>Select the markets and history for this case.</p>
          </header>

          <fieldset class="control-group" :aria-describedby="fieldError('symbols') ? 'symbols-error' : undefined">
            <legend class="sr-only">Symbols</legend>
            <div class="group-heading" aria-hidden="true"><span>Symbols</span><small>{{ form.symbols.length }} of 5</small></div>
            <div class="selected-symbols" aria-label="Selected symbols">
              <FormChip v-for="symbol in form.symbols" :key="symbol" :label="symbol" :removable="form.symbols.length > 1" @remove="removeSymbol(symbol)" />
            </div>
            <div class="add-symbol">
              <FormSelect
                id="symbol-select" ref="symbolSelect" v-model="selectedSymbol"
                aria-label="Symbol to add" :options="availableSymbolOptions"
                :placeholder="form.symbols.length >= 5 ? 'Five symbols selected' : 'Select a stock or ETF'"
                :disabled="form.symbols.length >= 5"
                :aria-invalid="Boolean(fieldError('symbols'))"
              />
              <button class="button button--secondary" type="button" :disabled="!selectedSymbol" @click="addSymbol"><Plus :size="15" aria-hidden="true" /> Add</button>
            </div>
            <p v-if="fieldError('symbols')" id="symbols-error" class="field-error" role="alert">{{ fieldError('symbols') }}</p>
          </fieldset>

          <fieldset class="control-group period-group">
            <legend class="sr-only">Historical window</legend>
            <div class="group-heading">
              <span aria-hidden="true">Historical window</span>
              <div class="period-presets" role="group" aria-label="Set historical window">
                <button v-for="years in [3, 5]" :key="years" type="button" :aria-pressed="form.startDate === periodStart(years)" @click="setPeriod(years)">{{ years }} years</button>
              </div>
            </div>
            <div class="date-row">
              <div class="intake-field">
                <label for="start-date">From</label>
                <FormDatePicker
                  id="start-date" v-model="form.startDate" aria-label="Start date" required
                  :max="startMaximumDate" :aria-invalid="Boolean(fieldError('startDate'))"
                  :aria-describedby="fieldError('startDate') ? 'start-error' : undefined"
                />
                <p v-if="fieldError('startDate')" id="start-error" class="field-error" role="alert">{{ fieldError('startDate') }}</p>
              </div>
              <div class="intake-field">
                <label for="end-date">To</label>
                <FormDatePicker
                  id="end-date" v-model="form.endDate" aria-label="End date" required
                  :min="endMinimumDate" :max="maximumDate" :aria-invalid="Boolean(fieldError('endDate'))"
                  :aria-describedby="fieldError('endDate') ? 'end-error' : undefined"
                />
                <p v-if="fieldError('endDate')" id="end-error" class="field-error" role="alert">{{ fieldError('endDate') }}</p>
              </div>
            </div>
            <p class="field-hint">Daily bars. Year presets end on your selected "To" date.</p>
          </fieldset>
        </section>

        <section v-else class="wizard-step">
          <header class="step-heading">
            <h1 id="intake-heading" ref="stepHeading" tabindex="-1">Review your setup</h1>
            <p>Check the details before creating your case.</p>
          </header>

          <section class="review-section" aria-labelledby="review-strategy">
            <div class="group-heading"><h2 id="review-strategy">Strategy</h2><button class="edit-link" type="button" aria-label="Edit strategy" @click="goToStep(1)">Edit</button></div>
            <h3>{{ form.name }}</h3>
            <p class="review-rules">{{ form.description }}</p>
          </section>
          <section class="review-section" aria-labelledby="review-data">
            <div class="group-heading"><h2 id="review-data">Test data</h2><button class="edit-link" type="button" aria-label="Edit test data" @click="goToStep(2)">Edit</button></div>
            <div class="review-market"><strong>{{ form.symbols.join(" · ") }}</strong><span>{{ readableDate(form.startDate) }} to {{ readableDate(form.endDate) }}</span></div>
          </section>

          <fieldset class="control-group execution-group">
            <legend class="sr-only">Execution assumptions</legend>
            <div class="group-heading" aria-hidden="true"><span>Execution assumptions</span></div>
            <div class="execution-grid">
              <div class="intake-field capital-field">
                <label for="capital">Starting capital</label>
                <div class="input-affix input-affix--prefix">
                  <span aria-hidden="true">$</span>
                  <input id="capital" v-model.number="form.initialCapital" class="intake-control" type="number" min="1000" max="10000000" step="any" required :aria-invalid="Boolean(fieldError('initialCapital'))" :aria-describedby="fieldError('initialCapital') ? 'capital-error' : undefined" />
                </div>
                <p v-if="fieldError('initialCapital')" id="capital-error" class="field-error" role="alert">{{ fieldError('initialCapital') }}</p>
              </div>
              <div class="intake-field">
                <label for="commission">Commission</label>
                <div class="input-affix">
                  <input id="commission" v-model.number="form.commissionBpsPerSide" class="intake-control" type="number" min="0" max="100" step="any" required :aria-invalid="Boolean(fieldError('commissionBpsPerSide'))" :aria-describedby="fieldError('commissionBpsPerSide') ? 'cost-hint commission-error' : 'cost-hint'" />
                  <span aria-hidden="true">bps</span>
                </div>
                <p v-if="fieldError('commissionBpsPerSide')" id="commission-error" class="field-error" role="alert">{{ fieldError('commissionBpsPerSide') }}</p>
              </div>
              <div class="intake-field">
                <label for="slippage">Slippage</label>
                <div class="input-affix">
                  <input id="slippage" v-model.number="form.slippageBpsPerSide" class="intake-control" type="number" min="0" max="100" step="any" required :aria-invalid="Boolean(fieldError('slippageBpsPerSide'))" :aria-describedby="fieldError('slippageBpsPerSide') ? 'cost-hint slippage-error' : 'cost-hint'" />
                  <span aria-hidden="true">bps</span>
                </div>
                <p v-if="fieldError('slippageBpsPerSide')" id="slippage-error" class="field-error" role="alert">{{ fieldError('slippageBpsPerSide') }}</p>
              </div>
            </div>
            <p id="cost-hint" class="field-hint">Costs apply per side. 1 bps = 0.01%.</p>
          </fieldset>
          <p class="review-note">Creating a case does not run a test. You'll review and confirm the exact trading rules next.</p>
        </section>
      </fieldset>

      <footer class="wizard-actions">
        <p v-if="submitError" class="submit-error field-error" role="alert">{{ submitError }}</p>
        <button v-if="step > 1" class="back-button" type="button" :disabled="submitting || Boolean(createdCaseId)" @click="goToStep((step - 1) as IntakeStep)"><ArrowLeft :size="15" aria-hidden="true" /> Back</button>
        <button class="button continue-button" type="submit" :disabled="submitting">
          {{ step < 3 ? "Continue" : submitting ? (createdCaseId ? "Opening case…" : "Creating case…") : createdCaseId ? "Open case" : "Create case" }}
          <ArrowRight v-if="!submitting" :size="16" aria-hidden="true" />
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped lang="scss">
.intake-page {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 80px;
  width: min(1000px, calc(100% - var(--workspace-gutter) - var(--workspace-gutter)));
  min-height: calc(100svh - var(--app-header-height) - 64px);
  margin-inline: auto;
  padding: 48px 0 80px;
  align-items: start;
}
.intake-progress { padding-top: 5px; }
.intake-title { margin: 0 0 29px; color: #e6e6e6; font-size: 16px; font-weight: 560; letter-spacing: -.02em; }
.stepper ol { position: relative; display: grid; gap: 24px; margin: 0; padding: 0; list-style: none; }
.stepper ol::before { position: absolute; top: 15px; bottom: 23px; left: 11px; width: 1px; background: #282828; content: ""; }
.stepper button { position: relative; display: flex; width: 100%; min-height: 44px; align-items: flex-start; gap: 13px; padding: 0; border: 0; color: #818181; background: transparent; text-align: left; cursor: pointer; }
.stepper button:disabled { cursor: default; }
.step-number { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; border: 1px solid #353535; border-radius: 50%; color: #858585; background: #080808; font-size: 11px; line-height: 1; }
.step-label { display: grid; gap: 6px; padding-top: 3px; }
.step-label strong { font-size: 13px; font-weight: 550; }
.step-label small { color: #707070; font-size: 11px; line-height: 1.4; }
.stepper .active .step-number { border-color: #e5e5e5; color: #101010; background: #ededed; }
.stepper .active strong { color: #f1f1f1; }
.stepper .active small { color: #939393; }
.stepper .complete { color: #b5b5b5; }
.stepper .complete .step-number { color: #dedede; }
.stepper .complete:hover strong { color: #fff; }
.wizard { min-width: 0; }
.wizard-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.wizard-step { min-height: 500px; }
.step-heading { margin-bottom: 32px; }
.step-heading h1 { margin: 0; color: #f1f1f1; font-size: 30px; font-weight: 560; letter-spacing: -.035em; line-height: 1.2; outline: 0; }
.step-heading p { margin: 11px 0 0; color: #959595; font-size: 14px; line-height: 1.55; }
.intake-field { display: grid; min-width: 0; gap: 10px; align-content: start; }
.intake-field label, .group-heading > span, .group-heading h2 { margin: 0; color: #c4c4c4; font-size: 13px; font-weight: 550; }
.intake-control { width: 100%; min-width: 0; min-height: 48px; padding: 12px 14px; border: 1px solid #303030; border-radius: 8px; outline: 0; color: #eee; background: #121212; box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 2px 5px rgba(0,0,0,.15); font-size: 14px; line-height: 1.5; transition: border-color 130ms ease, box-shadow 130ms ease; }
.intake-control::placeholder { color: #717171; opacity: 1; }
.intake-control:hover { border-color: #454545; }
.intake-control:focus { border-color: #868686; box-shadow: 0 0 0 3px rgba(255,255,255,.045); }
.intake-control[aria-invalid="true"] { border-color: #9a6b62; }
.intake-control:disabled { color: #818181; cursor: wait; }
.rules-field { margin-top: 26px; }
textarea.intake-control { display: block; min-height: 192px; max-height: 500px; line-height: 1.75; resize: vertical; }
.rules-meta { display: flex; justify-content: space-between; gap: 16px; color: #828282; font-size: 11px; line-height: 1.5; }
.rules-meta > :last-child { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.rules-example { margin-top: 18px; color: #949494; font-size: 12px; }
.rules-example summary { display: flex; width: max-content; min-height: 28px; align-items: center; gap: 6px; list-style: none; cursor: pointer; }
.rules-example summary::-webkit-details-marker { display: none; }
.rules-example summary:hover { color: #e5e5e5; }
.rules-example[open] summary svg { transform: rotate(180deg); }
.rules-example p { margin: 8px 0 0; padding-left: 13px; border-left: 1px solid #3a3a3a; color: #a5a5a5; line-height: 1.7; }
.control-group { min-width: 0; margin: 0; padding: 0; border: 0; }
.group-heading { display: flex; min-height: 24px; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.group-heading small { color: #818181; font-size: 12px; font-variant-numeric: tabular-nums; }
.selected-symbols { display: flex; min-height: 34px; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.add-symbol { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.add-symbol .button { min-width: 86px; }
.period-group { margin-top: 32px; padding-top: 28px; border-top: 1px solid #262626; }
.period-presets { display: flex; gap: 4px; }
.period-presets button { min-height: 32px; padding: 0 10px; border: 1px solid transparent; border-radius: 6px; color: #929292; background: transparent; font-size: 12px; cursor: pointer; }
.period-presets button:hover { color: #e8e8e8; background: #171717; }
.period-presets button[aria-pressed="true"] { color: #e5e5e5; border-color: #363636; background: #1c1c1c; }
.date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field-hint { margin: 12px 0 0; color: #818181; font-size: 11px; line-height: 1.6; }
.field-error { margin: 0; color: #ddb2a8; font-size: 12px; line-height: 1.5; }
.control-group > .field-error { margin-top: 10px; }
.review-section { padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid #262626; }
.review-section .group-heading { margin-bottom: 10px; }
.review-section h3 { margin: 0; color: #e5e5e5; font-size: 18px; font-weight: 550; letter-spacing: -.015em; overflow-wrap: anywhere; }
.review-rules { margin: 10px 0 0; color: #a5a5a5; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.edit-link { min-width: 40px; min-height: 32px; margin: -4px 0; padding: 0; border: 0; color: #a0a0a0; background: transparent; font-size: 12px; text-align: right; cursor: pointer; }
.edit-link:hover { color: #fff; }
.review-market { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px 24px; font-size: 13px; line-height: 1.55; }
.review-market strong { color: #e0e0e0; font-weight: 550; }
.review-market span { color: #9c9c9c; }
.execution-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 14px; }
.input-affix { position: relative; min-width: 0; }
.input-affix > span { position: absolute; top: 0; right: 13px; display: flex; height: 48px; align-items: center; color: #838383; font-size: 12px; pointer-events: none; }
.input-affix input { padding-right: 45px; appearance: textfield; -moz-appearance: textfield; font-variant-numeric: tabular-nums; }
.input-affix input::-webkit-inner-spin-button, .input-affix input::-webkit-outer-spin-button { margin: 0; -webkit-appearance: none; }
.input-affix--prefix > span { right: auto; left: 14px; }
.input-affix--prefix input { padding-left: 29px; padding-right: 12px; }
.review-note { margin: 25px 0 0; color: #969696; font-size: 12px; line-height: 1.65; }
.wizard-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #262626; }
.continue-button { min-width: 136px; min-height: 44px; gap: 20px; margin-left: auto; border-radius: 8px; font-size: 13px; }
.wizard .button, .wizard .button:hover:not(:disabled) { transform: none; }
.back-button { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; padding: 0; border: 0; color: #a4a4a4; background: transparent; font-size: 13px; cursor: pointer; }
.back-button:hover:not(:disabled) { color: #eee; }
.back-button:disabled { opacity: .5; cursor: wait; }
.submit-error { flex: 1 0 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

@media (max-width: 1050px) {
  .intake-page { grid-template-columns: 175px minmax(0, 1fr); gap: 44px; }
}
@media (max-width: 760px) {
  .intake-page { grid-template-columns: minmax(0, 1fr); gap: 32px; width: calc(100% - 40px); padding: 28px 0 52px; }
  .intake-progress { padding: 0 0 23px; border-bottom: 1px solid #242424; }
  .intake-title { margin-bottom: 22px; font-size: 14px; }
  .stepper ol { grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stepper ol::before { display: none; }
  .stepper button { min-height: 28px; gap: 8px; align-items: center; }
  .step-label { padding: 0; }
  .step-label small { display: none; }
  .step-label strong { font-size: 12px; }
  .wizard-step { min-height: 0; }
  .step-heading { margin-bottom: 28px; }
  .step-heading h1 { font-size: 28px; }
  .intake-control { font-size: 16px; }
  .rules-meta { font-size: 11px; gap: 10px; }
  textarea.intake-control { min-height: 210px; }
  .wizard-actions { margin-top: 28px; }
}
@media (max-width: 460px) {
  .intake-page { width: calc(100% - 32px); }
  .stepper ol { gap: 8px; }
  .step-number { width: 22px; height: 22px; flex-basis: 22px; }
  .stepper button { gap: 6px; }
  .step-label strong { font-size: 11px; }
  .step-heading h1 { font-size: 26px; }
  .step-heading p { font-size: 13px; }
  .date-row { grid-template-columns: 1fr; gap: 20px; }
  .execution-grid { grid-template-columns: 1fr 1fr; }
  .capital-field { grid-column: 1 / -1; }
  .group-heading { gap: 8px; }
  .period-presets { gap: 0; }
  .period-presets button { padding-inline: 8px; font-size: 11px; }
  .rules-meta { align-items: start; }
  .rules-meta > :first-child { max-width: 185px; }
}
@media (prefers-reduced-motion: reduce) {
  .intake-control { transition: none; }
}
</style>
