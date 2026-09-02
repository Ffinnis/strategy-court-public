<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ArrowLeft, ArrowUpRight, ChevronDown, LogOut, Menu, X } from "lucide-vue-next";

import CreateMenu from "@/components/ui/CreateMenu.vue";

const props = defineProps<{
  user: { id: string; name?: string | null; email: string } | null;
  pending: boolean;
  signingOut: boolean;
  signOutError: string;
}>();
const emit = defineEmits<{ signOut: [] }>();
const route = useRoute();
const isLandingPage = computed(() => route.name === "home");
const isAuthPage = computed(() => route.name === "auth");
const showCreate = computed(() => route.name !== "new-case");
const openDisclosure = ref<"navigation" | "account" | null>(null);
const navigationTrigger = ref<HTMLButtonElement | null>(null);
const navigationPanel = ref<HTMLElement | null>(null);
const accountTrigger = ref<HTMLButtonElement | null>(null);
const accountPanel = ref<HTMLElement | null>(null);
const headerElement = ref<HTMLElement | null>(null);
const initials = computed(() => {
  const source = props.user?.name?.trim() || props.user?.email || "account";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
});

function toggleDisclosure(disclosure: "navigation" | "account") {
  openDisclosure.value = openDisclosure.value === disclosure ? null : disclosure;
}

function closeDisclosures() {
  openDisclosure.value = null;
}

function isInsideDisclosure(target: EventTarget | null) {
  if (!(target instanceof Node)) return false;
  const trigger = openDisclosure.value === "account" ? accountTrigger.value : navigationTrigger.value;
  const panel = openDisclosure.value === "account" ? accountPanel.value : navigationPanel.value;
  return Boolean(trigger?.contains(target) || panel?.contains(target));
}

function dismissOutside(event: PointerEvent | FocusEvent) {
  if (openDisclosure.value && !isInsideDisclosure(event.target)) closeDisclosures();
}

async function dismissWithEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !openDisclosure.value) return;
  event.preventDefault();
  const trigger = openDisclosure.value === "account" ? accountTrigger.value : navigationTrigger.value;
  closeDisclosures();
  await nextTick();
  trigger?.focus();
}

let mobileQuery: MediaQueryList | undefined;
function onBreakpointChange() {
  if (!mobileQuery?.matches) {
    const focusWasInside = navigationPanel.value?.contains(document.activeElement)
      || navigationTrigger.value === document.activeElement;
    if (openDisclosure.value === "navigation") closeDisclosures();
    if (focusWasInside) headerElement.value?.querySelector<HTMLAnchorElement>(".app-brand")?.focus();
  }
}

watch(() => [route.fullPath, props.user?.id, props.pending], closeDisclosures);

onMounted(() => {
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("focusin", dismissOutside);
  document.addEventListener("keydown", dismissWithEscape);
  mobileQuery = window.matchMedia("(max-width: 900px)");
  mobileQuery.addEventListener("change", onBreakpointChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", dismissOutside);
  document.removeEventListener("focusin", dismissOutside);
  document.removeEventListener("keydown", dismissWithEscape);
  mobileQuery?.removeEventListener("change", onBreakpointChange);
});
</script>

<template>
  <header ref="headerElement" class="app-header" :class="{ 'app-header--workspace': route.name === 'case' }">
    <div class="app-header__inner">
      <RouterLink class="app-brand" to="/" aria-label="Retrade home" @click="closeDisclosures">
        <img src="/brand/strategy-court-mark.svg" width="32" height="32" alt="" aria-hidden="true" />
        <span>Retrade</span>
      </RouterLink>

      <nav v-if="!isAuthPage" class="app-header__navigation" aria-label="Main navigation">
        <template v-if="isLandingPage">
          <a href="#tests">The tests</a>
          <a href="#process">How it works</a>
        </template>
        <RouterLink v-else to="/">Overview</RouterLink>
        <RouterLink to="/indicators" :aria-current="route.name === 'indicators' ? 'page' : undefined">Indicators</RouterLink>
      </nav>

      <div class="app-header__actions">
        <RouterLink v-if="isAuthPage" class="header-back" to="/">
          <ArrowLeft :size="15" aria-hidden="true" />
          <span>Back to overview</span>
        </RouterLink>
        <template v-else>
          <CreateMenu v-if="showCreate" class="header-create--desktop" />
          <span v-if="pending" class="account-loading" role="status" aria-label="Checking account" />
          <div v-else-if="user" class="header-account">
            <button
              ref="accountTrigger"
              class="account-trigger"
              type="button"
              :aria-label="`Account for ${user.name || user.email}`"
              :aria-expanded="openDisclosure === 'account'"
              aria-controls="header-account-panel"
              @click="toggleDisclosure('account')"
            >
              <span class="account-avatar" aria-hidden="true">{{ initials }}</span>
              <ChevronDown class="account-chevron" :size="13" aria-hidden="true" />
            </button>
            <Transition name="header-popover">
              <div v-if="openDisclosure === 'account'" id="header-account-panel" ref="accountPanel" class="account-popover">
                <div class="account-identity">
                  <strong>{{ user.name || "Retrade account" }}</strong>
                  <span>{{ user.email }}</span>
                </div>
                <button class="account-sign-out" type="button" :disabled="signingOut" :aria-busy="signingOut" @click="emit('signOut')">
                  <LogOut :size="16" aria-hidden="true" />
                  {{ signingOut ? "Signing out…" : "Sign out" }}
                </button>
                <p v-if="signOutError" class="account-error" role="alert">{{ signOutError }} Try again.</p>
              </div>
            </Transition>
          </div>
          <RouterLink v-else class="header-sign-in" :to="{ name: 'auth' }">Sign in</RouterLink>
          <button
            ref="navigationTrigger"
            class="navigation-trigger"
            type="button"
            :aria-label="openDisclosure === 'navigation' ? 'Close navigation' : 'Open navigation'"
            :aria-expanded="openDisclosure === 'navigation'"
            aria-controls="header-navigation-panel"
            @click="toggleDisclosure('navigation')"
          >
            <Transition name="navigation-icon" mode="out-in">
              <X v-if="openDisclosure === 'navigation'" key="close" :size="20" aria-hidden="true" />
              <Menu v-else key="open" :size="20" aria-hidden="true" />
            </Transition>
          </button>
        </template>
      </div>
    </div>

    <Transition name="mobile-menu">
      <nav v-if="!isAuthPage && openDisclosure === 'navigation'" id="header-navigation-panel" ref="navigationPanel" class="mobile-navigation" aria-label="Mobile navigation">
        <div class="mobile-navigation__links" @click="closeDisclosures">
          <template v-if="isLandingPage">
            <a href="#tests">The tests <ArrowUpRight :size="16" aria-hidden="true" /></a>
            <a href="#process">How it works <ArrowUpRight :size="16" aria-hidden="true" /></a>
          </template>
          <RouterLink v-else to="/">Overview <ArrowUpRight :size="16" aria-hidden="true" /></RouterLink>
          <RouterLink to="/indicators" :aria-current="route.name === 'indicators' ? 'page' : undefined">Indicators <ArrowUpRight :size="16" aria-hidden="true" /></RouterLink>
        </div>
        <RouterLink v-if="showCreate" class="header-create" to="/new" @click="closeDisclosures">
          New strategy <ArrowUpRight :size="15" aria-hidden="true" />
        </RouterLink>
      </nav>
    </Transition>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  position: relative;
  z-index: 100;
  min-width: 0;
  height: var(--app-header-height);
  border-bottom: 1px solid var(--line-subtle);
  background: #0b0b0b;
}
.app-header--workspace { position: sticky; top: 0; }
.app-header__inner {
  display: flex;
  width: min(var(--workspace-shell), calc(100% - var(--workspace-gutter) - var(--workspace-gutter)));
  height: 100%;
  align-items: center;
  gap: 40px;
  margin-inline: auto;
}
.app-brand {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  color: #f4f4f5;
  font-size: 18px;
  font-weight: 570;
  letter-spacing: -.035em;
  white-space: nowrap;
}
.app-brand img { display: block; flex: 0 0 auto; object-fit: contain; }
.app-header__navigation { display: flex; height: 100%; align-items: center; gap: 27px; }
.app-header__navigation a {
  position: relative;
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: #a5a5a5;
  font-size: 13px;
  transition: color 140ms ease;
  white-space: nowrap;
}
.app-header__navigation a:hover, .app-header__navigation a:focus-visible, .app-header__navigation a[aria-current="page"] { color: #f4f4f5; }
.app-header__navigation a[aria-current="page"]::after { position: absolute; right: 0; bottom: -14px; left: 0; height: 1px; background: #e6e6e6; content: ""; }
.app-header__actions { display: flex; flex: 0 0 auto; align-items: center; gap: 22px; margin-left: auto; }
.header-create {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 13px;
  padding: 0 15px;
  border: 1px solid #e7e7e7;
  border-radius: 7px;
  color: #151515;
  background: #ededed;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 140ms ease, border-color 140ms ease;
}
.header-create:hover { border-color: #fff; background: #fff; }
.header-sign-in, .header-back { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 7px; color: #c4c4c4; font-size: 13px; white-space: nowrap; transition: color 140ms ease; }
.header-sign-in:hover, .header-back:hover { color: #fff; }
.header-account { position: relative; }
.account-trigger { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; gap: 7px; padding: 0; border: 0; border-radius: 7px; color: #8e8e8e; background: transparent; cursor: pointer; }
.account-trigger:hover, .account-trigger[aria-expanded="true"] { color: #ededed; }
.account-chevron { transition: transform var(--duration-control) var(--ease-out); }
.account-trigger[aria-expanded="true"] .account-chevron { transform: rotate(180deg); }
.account-avatar { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid #343434; border-radius: 50%; color: #d8d8d8; background: #191919; font-size: 11px; font-weight: 550; }
.account-loading { display: block; width: 32px; height: 32px; border: 1px solid #282828; border-radius: 50%; background: #151515; }
.account-popover { position: absolute; z-index: 1; top: calc(100% + 9px); right: 0; width: min(290px, calc(100vw - 32px)); padding: 8px; border: 1px solid #303030; border-radius: 11px; background: #141414; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.header-popover-enter-active,.header-popover-leave-active{transform-origin:top right;transition:opacity 130ms ease,transform var(--duration-control) var(--ease-out)}
.header-popover-enter-from,.header-popover-leave-to{opacity:0;transform:translateY(-6px) scale(.985)}
.navigation-icon-enter-active,.navigation-icon-leave-active{transition:opacity 90ms ease,transform 120ms var(--ease-out)}
.navigation-icon-enter-from{opacity:0;transform:rotate(-35deg) scale(.8)}
.navigation-icon-leave-to{opacity:0;transform:rotate(35deg) scale(.8)}
.account-identity { display: grid; gap: 5px; padding: 13px 12px 16px; border-bottom: 1px solid var(--line-subtle); }
.account-identity strong { color: #eeeeef; font-size: 14px; font-weight: 550; overflow-wrap: anywhere; }
.account-identity span { color: #969699; font-size: 12px; overflow-wrap: anywhere; }
.account-sign-out { display: flex; width: 100%; min-height: 44px; align-items: center; gap: 10px; margin-top: 6px; padding: 0 12px; border: 0; border-radius: 6px; color: #c3c3c5; background: transparent; font-size: 13px; cursor: pointer; }
.account-sign-out:hover:not(:disabled) { color: #fff; background: #222; }
.account-sign-out:disabled { opacity: .55; cursor: wait; }
.account-error { margin: 8px 12px 9px; color: #d8b6b6; font-size: 12px; line-height: 1.5; }
.navigation-trigger { display: none; width: 40px; height: 44px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; color: #c8c8c8; background: transparent; cursor: pointer; }
.navigation-trigger:hover, .navigation-trigger[aria-expanded="true"] { color: #fff; background: #181818; }
.mobile-navigation { display: none; }
.mobile-menu-enter-active,.mobile-menu-leave-active{transform-origin:top center;transition:opacity 150ms ease,transform 220ms var(--ease-out),clip-path 220ms var(--ease-out)}
.mobile-menu-enter-from,.mobile-menu-leave-to{opacity:0;transform:translateY(-7px);clip-path:inset(0 0 100% 0)}

@media (max-width: 1100px) {
  .app-header__inner { gap: 28px; }
  .app-header__navigation { gap: 20px; }
  .app-header__actions { gap: 16px; }
}
@media (max-width: 900px) {
  .app-header__inner { gap: 12px; }
  .app-header__navigation, .header-create--desktop { display: none; }
  .app-header__actions { gap: 13px; }
  .navigation-trigger { display: inline-flex; }
  .account-chevron { display: none; }
  .account-trigger { min-width: 36px; }
  .account-popover { right: -53px; }
  .mobile-navigation { position: absolute; top: 100%; right: 0; left: 0; display: grid; gap: 20px; max-height: calc(100dvh - var(--app-header-height)); overflow-y: auto; padding: 10px var(--workspace-gutter) 24px; border-bottom: 1px solid #303030; background: #0e0e0e; box-shadow: 0 24px 40px rgba(0,0,0,.35); }
  .mobile-navigation__links { display: grid; }
  .mobile-navigation__links a { display: flex; min-height: 56px; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line-subtle); color: #b8b8b8; font-size: 14px; }
  .mobile-navigation__links a:hover, .mobile-navigation__links a[aria-current="page"] { color: #fff; }
  .mobile-navigation__links svg { color: #6b6b6b; }
  .mobile-navigation .header-create { min-height: 44px; justify-content: space-between; }
}
@media (max-width: 380px) {
  .app-brand { gap: 8px; font-size: 16px; }
  .app-header__actions { gap: 10px; }
  .header-back { gap: 5px; font-size: 11px; }
  .header-back svg { width: 13px; height: 13px; }
  .account-popover { right: -50px; }
}
</style>
