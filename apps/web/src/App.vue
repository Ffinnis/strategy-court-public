<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { ShieldCheck } from "lucide-vue-next";
import AppHeader from "@/components/AppHeader.vue";
import { useWebMcp } from "@/webmcp/useWebMcp";
import { authClient } from "@/services/auth";

const route = useRoute();
const router = useRouter();
const sessionState = authClient.useSession();
const currentUser = computed(() => sessionState.value.data?.user ?? null);
const webMcpEnabled = computed(() => Boolean(currentUser.value));
const isAuthPage = computed(() => route.name === "auth");
const signingOut = ref(false);
const signOutError = ref("");

useWebMcp(webMcpEnabled);

watch(() => [sessionState.value.isPending, Boolean(currentUser.value)] as const, ([pending, signedIn]) => {
  if (!pending && !signedIn && route.meta.requiresAuth) {
    void router.replace({ name: "auth", query: { redirect: route.fullPath } });
  }
});

async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  signOutError.value = "";
  try {
    const result = await authClient.signOut();
    if (result.error) {
      signOutError.value = result.error.message || "Could not sign out.";
      return;
    }
    await sessionState.value.refetch();
    await router.replace("/");
  } catch (issue) {
    signOutError.value = issue instanceof Error ? issue.message : "Could not sign out.";
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <AppHeader
      :user="currentUser"
      :pending="sessionState.isPending"
      :signing-out="signingOut"
      :sign-out-error="signOutError"
      @sign-out="signOut"
    />

    <main id="main-content" tabindex="-1">
      <RouterView />
    </main>

    <footer v-if="!isAuthPage" class="limitation-bar">
      <ShieldCheck :size="15" aria-hidden="true" />
      <span>Historical tests cannot establish that a strategy will remain profitable in future market conditions. Strategy Court does not place trades. <a href="/chart-attribution.txt" target="_blank" rel="noopener">Chart attribution</a></span>
    </footer>
  </div>
</template>
