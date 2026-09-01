<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { parameterMatrix, type TrialCell } from "@/services/resultPresentation";
const props = defineProps<{ trials: Array<Record<string, unknown>> }>();
const matrix = computed(() => parameterMatrix(props.trials));
const selected = ref<TrialCell | null>(null);
watch(
  () => props.trials,
  () => {
    selected.value = null;
  },
);
const find = (path: string, factor: number) =>
  matrix.value.cells.find(
    (cell) => cell.path === path && cell.factor === factor,
  );
const label = (path: string) =>
  path
    .replace(/^\//, "")
    .replace(/\//g, " · ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, letter => letter.toUpperCase());
const money = (value: number | null) =>
  value === null
    ? "Not reported"
    : `${value < 0 ? "−" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const description = (cell: TrialCell) =>
  `${label(cell.path)}, tested ${cell.value ?? "unavailable"}, ${cell.factor}× baseline. ${cell.state === "invalid" ? `Invalid: ${cell.reason}` : `Net profit ${money(cell.profit)}`}`;
</script>
<template>
  <section class="parameter-matrix" aria-labelledby="matrix-title">
    <header>
      <div>
        <h3 id="matrix-title">How much depends on one setting?</h3>
        <p>
          One parameter changes at a time. Every mark is a returned evaluation
          trial.
        </p>
      </div>
      <strong>{{ matrix.cells.length }}<small>trials</small></strong>
    </header>
    <div v-if="matrix.paths.length" class="matrix-scroll">
      <table
        aria-label="Parameter sensitivity, rows are parameters and columns are tested multipliers"
      >
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Baseline</th>
            <th v-for="factor in matrix.factors" :key="factor">
              {{ factor }}×
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="path in matrix.paths" :key="path">
            <th>{{ label(path) }}</th>
            <td>
              {{
                matrix.cells.find((cell) => cell.path === path)?.baseline ?? "—"
              }}
            </td>
            <td v-for="factor in matrix.factors" :key="factor">
              <button
                v-if="find(path, factor)"
                class="matrix-cell"
                :data-state="find(path, factor)!.state"
                :aria-pressed="selected === find(path, factor)"
                :aria-label="description(find(path, factor)!)"
                :title="description(find(path, factor)!)"
                @click="selected = find(path, factor)!"
              >
                {{
                  find(path, factor)!.state === "invalid"
                    ? "×"
                    : find(path, factor)!.state === "profit"
                      ? "+"
                      : find(path, factor)!.state === "loss"
                        ? "−"
                        : find(path, factor)!.state === "unavailable" ? "—" : "·"
                }}</button
              ><span v-else aria-label="Not tested">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="matrix-empty">
      No variable numerical parameters were returned for this strategy.
    </p>
    <footer>
      <div class="matrix-legend">
        <span><i data-state="profit" />Profit</span
        ><span><i data-state="loss" />Loss</span
        ><span><i data-state="invalid" />Invalid</span
        ><span><i data-state="flat" />Zero</span><span><i data-state="unavailable" />Unavailable</span>
      </div>
      <p role="status">
        {{
          selected
            ? description(selected)
            : "Select a mark to inspect its exact value and outcome."
        }}
      </p>
    </footer>
  </section>
</template>
<style scoped>
.parameter-matrix {
  padding: 26px 0;
  border-top: 1px solid #303030;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
}
h3 {
  margin: 0;
  color: #eee;
  font-size: 22px;
  font-weight: 550;
  letter-spacing: -0.025em;
}
header p {
  margin: 8px 0 0;
  color: #909096;
  font-size: 12px;
  line-height: 1.6;
}
header > strong {
  display: grid;
  gap: 4px;
  text-align: right;
  color: #e4e4e7;
  font-size: 32px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
}
header small {
  color: #8d8d92;
  font-size: 10px;
  font-weight: 450;
}
.matrix-scroll {
  overflow-x: auto;
  margin-top: 25px;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 460px;
}
th,
td {
  padding: 12px 16px;
  text-align: center;
  border-bottom: 1px solid #202020;
  font-size: 12px;
  color: #a6a6ac;
}
thead th {
  color: #828288;
  font-size: 10px;
  font-weight: 500;
}
th:first-child {
  width: 42%;
  padding-left: 0;
  text-align: left;
  font-weight: 500;
  font-size: 11px;
}
tbody th {
  color: #b2b2b7;
}
td:nth-child(2) {
  font-variant-numeric: tabular-nums;
}
.matrix-cell {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #555;
  border-radius: 5px;
  background: #161616;
  color: #aaa;
  font-size: 13px;
  cursor: pointer;
  transition:
    transform var(--duration-control),
    box-shadow var(--duration-control);
}
.matrix-cell:hover {
  transform: scale(1.1);
}
[data-state="profit"] {
  background: #d7d7db;
  color: #111;
  border-color: #d7d7db;
}
[data-state="loss"] {
  background: #535358;
  color: #fff;
  border-color: #75757a;
}
[data-state="invalid"] {
  background: repeating-linear-gradient(
    135deg,
    transparent 0 4px,
    #5e5e64 4px 5px
  );
  color: #ddd;
  border-style: dashed;
}
.matrix-cell[aria-pressed="true"] {
  outline: 2px solid #fff;
  outline-offset: 4px;
}
.matrix-cell[data-state="unavailable"], .matrix-legend i[data-state="unavailable"] { border-style: dashed; background: transparent; }
footer {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}
.matrix-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}
.matrix-legend span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #8d8d93;
  font-size: 10px;
}
.matrix-legend i {
  width: 10px;
  height: 10px;
  border: 1px solid #64646a;
  border-radius: 2px;
}
footer p,
.matrix-empty {
  min-height: 36px;
  margin: 0;
  color: #b1b1b7;
  font-size: 12px;
  line-height: 1.6;
}
</style>
