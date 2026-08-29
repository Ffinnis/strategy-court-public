<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { LogOut, Scale, ShieldCheck } from "lucide-vue-next";
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
const accountMenu = ref<HTMLDetailsElement | null>(null);

const initials = computed(() => {
  const source = currentUser.value?.name?.trim() || currentUser.value?.email || "account";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
});

useWebMcp(webMcpEnabled);

watch(() => [sessionState.value.isPending, Boolean(currentUser.value)] as const, ([pending, signedIn]) => {
  if (!pending && !signedIn && route.meta.requiresAuth) {
    void router.replace({ name: "auth", query: { redirect: route.fullPath } });
  }
});

async function signOut() {
  signingOut.value = true;
  signOutError.value = "";
  try {
    const result = await authClient.signOut();
    if (result.error) {
      signOutError.value = result.error.message || "Could not sign out.";
      return;
    }
    await sessionState.value.refetch();
    if (accountMenu.value) accountMenu.value.open = false;
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
    <header class="topbar" :class="{ 'topbar--workspace': route.name === 'case', 'topbar--auth': isAuthPage }">
      <RouterLink class="brand" to="/" aria-label="Strategy Court home">
        <span class="brand__mark"><Scale :size="17" aria-hidden="true" /></span>
        <span>Strategy Court</span>
      </RouterLink>
      <div class="topbar__meta">
        <template v-if="isAuthPage">
          <RouterLink class="button button--quiet button--small" to="/">Back to overview</RouterLink>
        </template>
        <template v-else>
          <span class="system-chip"><span class="system-chip__dot" /> 7 robustness tests</span>
          <template v-if="sessionState.isPending">
            <span class="account-loading" aria-label="Checking account" />
          </template>
          <template v-else-if="currentUser">
            <RouterLink v-if="route.name !== 'indicators'" class="button button--quiet button--small" to="/indicators">Indicators</RouterLink>
            <RouterLink v-if="route.name !== 'new-case'" class="button button--quiet button--small" to="/new">New case</RouterLink>
            <details ref="accountMenu" class="account-menu">
              <summary aria-label="Open account menu">
                <span class="account-avatar">{{ initials }}</span>
                <span class="account-name">{{ currentUser.name || currentUser.email }}</span>
              </summary>
              <div class="account-popover">
                <div class="account-identity">
                  <strong>{{ currentUser.name || "Strategy Court account" }}</strong>
                  <span>{{ currentUser.email }}</span>
                </div>
                <button type="button" :disabled="signingOut" @click="signOut">
                  <LogOut :size="15" />
                  {{ signingOut ? "Signing out…" : "Sign out" }}
                </button>
                <p v-if="signOutError" role="alert">{{ signOutError }}</p>
              </div>
            </details>
          </template>
          <RouterLink v-else class="button button--quiet button--small" :to="{ name: 'auth' }">Sign in</RouterLink>
        </template>
      </div>
    </header>

    <main id="main-content" tabindex="-1">
      <RouterView />
    </main>

    <footer v-if="!isAuthPage" class="limitation-bar">
      <ShieldCheck :size="15" aria-hidden="true" />
      <span>Historical tests cannot establish that a strategy will remain profitable in future market conditions. Strategy Court does not place trades.</span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.account-loading{width:32px;height:32px;border-radius:10px;background:#171717;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);animation:account-pulse 1.2s ease-in-out infinite}.account-menu{position:relative}.account-menu summary{display:flex;height:38px;align-items:center;gap:8px;padding:0 7px 0 4px;border:1px solid transparent;border-radius:11px;color:#b4b4bb;cursor:pointer;list-style:none;transition:color 150ms ease,background 150ms ease,border-color 150ms ease}.account-menu summary::-webkit-details-marker{display:none}.account-menu summary:hover,.account-menu[open] summary{border-color:#2e2e2e;color:#f4f4f5;background:#171717}.account-avatar{display:grid;width:28px;height:28px;place-items:center;border:1px solid #3b3b3b;border-radius:8px;color:#ededee;background:#202020;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 6px 16px rgba(0,0,0,.25);font-size:10px;font-weight:650}.account-name{max-width:130px;overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.account-popover{position:absolute;top:calc(100% + 9px);right:0;width:260px;padding:9px;border:1px solid #303030;border-radius:13px;background:rgba(20,20,20,.97);box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 24px 70px rgba(0,0,0,.52);backdrop-filter:blur(18px)}.account-identity{display:grid;gap:4px;padding:10px 10px 12px;border-bottom:1px solid rgba(255,255,255,.065)}.account-identity strong{overflow:hidden;font-size:12px;font-weight:590;text-overflow:ellipsis;white-space:nowrap}.account-identity span{overflow:hidden;color:#77777f;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.account-popover>button{display:flex;width:100%;min-height:38px;align-items:center;gap:9px;margin-top:7px;padding:0 10px;border:0;border-radius:8px;color:#b9b9bf;background:transparent;font-size:11px;cursor:pointer}.account-popover>button:hover:not(:disabled){color:#f4f4f5;background:#222}.account-popover>button:disabled{opacity:.55;cursor:wait}.account-popover>p{margin:7px 10px 5px;color:#bcbcc2;font-size:10px;line-height:1.45}@keyframes account-pulse{50%{opacity:.45}}@media(max-width:620px){.account-name{display:none}.account-menu summary{padding-right:4px}.topbar--auth .button{display:none}}@media(prefers-reduced-motion:reduce){.account-loading{animation:none}}
</style>
