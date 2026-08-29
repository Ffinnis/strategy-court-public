<script setup lang="ts">
import type { VerdictStatus } from "@/types";

defineProps<{ status: VerdictStatus | string; dot?: boolean }>();
</script>

<template><span class="pill" :class="`pill--${status.toLowerCase()}`"><span v-if="dot !== false" class="pill__dot" />{{ status }}</span></template>
