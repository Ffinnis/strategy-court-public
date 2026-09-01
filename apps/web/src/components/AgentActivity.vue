<script setup lang="ts">
import { computed, ref } from "vue";
import { Bot, ChevronDown } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import RevealPanel from "@/components/ui/RevealPanel.vue";
const store = useCourtStore();
const open = ref(false);
const state = computed(() =>
  store.running
    ? "Engine running"
    : store.activeVersion && !store.confirmed
      ? "Waiting for your confirmation"
      : store.courtComplete
        ? "Evidence ready"
        : "Ready for a draft",
);
const events = computed(() =>
  (store.currentCase?.audit ?? [])
    .filter((event) => event.actor === "agent")
    .slice(-5)
    .reverse(),
);
</script>
<template>
  <section class="agent-activity" aria-label="Agent activity">
    <button
      type="button"
      class="agent-activity__trigger"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Bot :size="15" /><span>{{
        store.webMcpStatus === "ready"
          ? "Agent tools connected"
          : store.webMcpStatus === "registering"
            ? "Connecting tools"
            : "Manual controls available"
      }}</span
      ><small>{{ state }}</small
      ><ChevronDown :size="14" :class="{ rotated: open }" /></button
    ><RevealPanel :open="open"
      ><div class="agent-activity__body">
        <div>
          <h3>Available in this browser</h3>
          <p>
            {{ store.registeredToolNames.length }} tools registered. Operations
            below come from the case audit.
          </p>
          <details v-if="store.registeredToolNames.length">
            <summary>View registered tools</summary>
            <ul>
              <li v-for="name in store.registeredToolNames" :key="name">
                <code>{{ name }}</code>
              </li>
            </ul>
          </details>
          <p v-if="store.evidenceSelection?.actor === 'agent'">
            Agent selected {{ store.evidenceSelection.kind }}
            {{ store.evidenceSelection.id }}.
          </p>
          <p v-for="issue in store.webMcpErrors" :key="issue.toolName">
            {{ issue.toolName }}: {{ issue.message }}
          </p>
        </div>
        <div>
          <h3>Recent agent actions</h3>
          <ol v-if="events.length">
            <li v-for="event in events" :key="event.id">
              <strong>{{ event.action }}</strong
              ><time :datetime="event.createdAt">{{
                new Date(event.createdAt).toLocaleString()
              }}</time>
              <p>{{ event.detail }}</p>
            </li>
          </ol>
          <p v-else>No agent actions have been recorded for this case.</p>

        </div></div
    ></RevealPanel>
  </section>
</template>
<style scoped>
.agent-activity {
  margin: 0 0 18px;
  border-bottom: 1px solid #252525;
}
.agent-activity__trigger {
  display: flex;
  width: 100%;
  min-height: 35px;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  border: 0;
  background: transparent;
  color: #96969e;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.agent-activity__trigger small {
  margin-left: auto;
  font-size: 10px;
  color: #797981;
}
.agent-activity__trigger svg:last-child {
  margin-left: 10px;
  transition: transform var(--duration-control);
}
.rotated {
  transform: rotate(180deg);
}
.agent-activity__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  padding: 12px 0 22px;
}
.agent-activity h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 550;
  color: #d6d6dc;
}
.agent-activity p {
  color: #9999a2;
  font-size: 11px;
  line-height: 1.6;
}
.agent-activity details {
  font-size: 11px;
  color: #aaa;
}
.agent-activity summary {
  cursor: pointer;
}
.agent-activity ul {
  columns: 2;
  padding-left: 16px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.agent-activity code {
  font-size: 10px;
}
.agent-activity ol {
  list-style: none;
  padding: 0;
  margin: 10px 0;
}
.agent-activity li {
  padding: 5px 0;
}
.agent-activity strong {
  font-size: 11px;
  color: #aaa;
  font-weight: 500;
}
.agent-activity time {
  display: block;
  margin-top: 4px;
  color: #7d7d86;
  font-size: 10px;
}
@media (max-width: 720px) {
  .agent-activity__body {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .agent-activity__trigger small {
    max-width: 130px;
    text-align: right;
    line-height: 1.5;
  }
}
</style>
