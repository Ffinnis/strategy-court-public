<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Search, ArrowUpRight, CornerDownLeft, X } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import { workspaceTabs } from "@/services/workspaceNavigation";
const store = useCourtStore();
const router = useRouter();
const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const query = ref("");
const active = ref(0);
let returnFocus: HTMLElement | null = null;
type Command = {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
  run: () => unknown;
};
const commands = computed<Command[]>(() => {
  const all: Command[] = workspaceTabs.map((tab) => ({
    id: tab.id,
    label: `Open ${tab.label.toLowerCase()}`,
    detail: `Workspace · ${tab.id}`,
    run: () => {
      store.activeTab = tab.id;
    },
  }));
  all.push({
    id: "indicators",
    label: "Find an indicator",
    detail: "Definitions and parameters",
    run: () => router.push("/indicators"),
  });
  all.push({
    id: "new",
    label: "Create a strategy",
    detail: "Review a new setup",
    run: () => router.push("/new"),
  });
  for (const finding of store.result?.failures ?? [])
    all.push({
      id: `failure:${finding.id}`,
      label: finding.title,
      detail: `Evidence · ${finding.period}`,
      run: () =>
        store.selectEvidence(store.latestRun!.id, {
          kind: "failure",
          id: finding.id,
        }),
    });
  for (const trade of store.result?.trades ?? [])
    if (trade.id)
      all.push({
        id: `trade:${trade.id}`,
        label: `${trade.symbol} · ${trade.entryDate} → ${trade.exitDate}`,
        detail: `Trade · ${trade.exitReason}`,
        run: () =>
          store.selectEvidence(store.latestRun!.id, {
            kind: "trade",
            id: trade.id!,
          }),
      });
  return all
    .filter((command) =>
      `${command.label} ${command.detail}`
        .toLowerCase()
        .includes(query.value.toLowerCase().trim()),
    )
    .slice(0, 40);
});
async function open() {
  returnFocus = document.activeElement as HTMLElement;
  query.value = "";
  active.value = 0;
  dialog.value?.showModal();
  await nextTick();
  input.value?.focus();
}
function close() {
  dialog.value?.close();
  returnFocus?.focus();
}
async function choose(command?: Command) {
  if (!command || command.disabled) return;
  close();
  try {
    await command.run();
  } catch {
    /* Evidence owns the recoverable error state. */
  }
}
function shortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    dialog.value?.open ? close() : void open();
  }
}
async function navigate(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    void choose(commands.value[active.value]);
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  active.value =
    (active.value +
      (event.key === "ArrowDown" ? 1 : -1) +
      commands.value.length) %
    (commands.value.length || 1);
  await nextTick();
  dialog.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView({ block: "nearest" });
}
onMounted(() => document.addEventListener("keydown", shortcut));
onBeforeUnmount(() => document.removeEventListener("keydown", shortcut));
</script>
<template>
  <button
    class="command-trigger"
    type="button"
    aria-label="Jump to a section or evidence"
    @click="open"
  >
    <Search :size="14" /><span>Jump to…</span><kbd>⌘ K</kbd>
  </button>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="command-dialog"
      aria-label="Jump to a workspace section or evidence"
      @click="$event.target === dialog && close()"
      @cancel.prevent="close"
    >
      <div class="command-search">
        <Search :size="18" /><input
          ref="input"
          v-model="query"
          role="combobox"
          aria-label="Search commands and evidence"
          aria-autocomplete="list"
          aria-controls="workspace-command-results"
          :aria-expanded="true"
          :aria-activedescendant="
            commands[active] ? `command-${active}` : undefined
          "
          placeholder="Search sections, findings, symbols…"
          @input="active = 0"
          @keydown="navigate"
        /><button type="button" aria-label="Close search" @click="close">
          <X :size="18" />
        </button>
      </div>
      <div
        id="workspace-command-results"
        class="command-results"
        role="listbox"
        aria-label="Results"
      >
        <div
          v-for="(command, index) in commands"
          :id="`command-${index}`"
          :key="command.id"
          role="option"
          :aria-selected="index === active"
          @pointermove="active = index"
          @click="choose(command)"
        >
          <span
            >{{ command.label }}<small>{{ command.detail }}</small></span
          ><ArrowUpRight :size="14" />
        </div>
        <p v-if="!commands.length">
          No matching section or evidence. Try a symbol or date.
        </p>
      </div>
      <footer>
        <span>↑ ↓ to navigate</span
        ><span><CornerDownLeft :size="12" /> Open</span
        ><span>Esc to close</span>
      </footer>
    </dialog></Teleport
  >
</template>
<style scoped>
.command-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8b8b90;
  font-size: 11px;
  cursor: pointer;
}
.command-trigger:hover {
  background: #191919;
  color: #eee;
}
kbd {
  padding: 3px 5px;
  border: 1px solid #333;
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
}
.command-dialog {
  position: fixed;
  top: 14vh;
  width: min(580px, calc(100% - 32px));
  max-height: 76dvh;
  margin: 0 auto;
  padding: 0;
  border: 1px solid #3b3b3b;
  border-radius: 14px;
  color: #eee;
  background: #151515;
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
  animation: overlay-in var(--duration-overlay) var(--ease-out);
}
.command-dialog::backdrop {
  background: #0009;
  backdrop-filter: blur(5px);
}
.command-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #303030;
}
.command-search input {
  width: 100%;
  padding: 5px 0;
  border: 0;
  outline: 0;
  color: #eee;
  background: transparent;
  font-size: 14px;
}
.command-search button {
  display: grid;
  min-width: 32px;
  min-height: 32px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #aaa;
  cursor: pointer;
}
.command-results {
  max-height: 48dvh;
  overflow-y: auto;
  padding: 7px;
}
.command-results [role="option"] {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 11px 13px;
  border-radius: 7px;
  color: #d6d6d8;
  font-size: 13px;
  cursor: pointer;
}
.command-results [aria-selected="true"] {
  background: #292929;
  color: #fff;
}
.command-results span {
  display: grid;
  gap: 5px;
}
.command-results small {
  color: #949499;
  font-size: 11px;
}
.command-results p {
  margin: 24px 12px;
  color: #999;
  font-size: 13px;
}
footer {
  display: flex;
  gap: 18px;
  padding: 12px 18px;
  border-top: 1px solid #292929;
  color: #909095;
  font-size: 10px;
}
footer span {
  display: flex;
  align-items: center;
  gap: 5px;
}
@media (max-width: 720px) {
  .command-trigger span,
  .command-trigger kbd {
    display: none;
  }
  .command-trigger {
    min-width: 36px;
    justify-content: center;
  }
  .command-dialog {
    top: 8vh;
  }
}
</style>
