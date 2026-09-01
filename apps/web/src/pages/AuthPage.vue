<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, LockKeyhole } from "lucide-vue-next";
import { authClient, safeAuthRedirect } from "@/services/auth";

type AuthMode = "signin" | "signup";

const route = useRoute();
const router = useRouter();
const sessionState = authClient.useSession();
const mode = ref<AuthMode>(route.query.mode === "signup" ? "signup" : "signin");
const busy = ref(false);
const attempted = ref(false);
const showPassword = ref(false);
const error = ref("");
const success = ref("");
const nameField = ref<HTMLInputElement | null>(null);
const emailField = ref<HTMLInputElement | null>(null);
const passwordField = ref<HTMLInputElement | null>(null);
const form = reactive({ name: "", email: "", password: "" });
const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";

const isSignup = computed(() => mode.value === "signup");
const nameInvalid = computed(() => attempted.value && isSignup.value && form.name.trim().length < 2);
const emailInvalid = computed(() => attempted.value && !/^\S+@\S+\.\S+$/.test(form.email.trim()));
const passwordInvalid = computed(() => attempted.value && form.password.length < 8);
const validationMessage = computed(() => (
  nameInvalid.value || emailInvalid.value || passwordInvalid.value
    ? "Check the highlighted fields, then try again."
    : ""
));

function setMode(next: AuthMode) {
  mode.value = next;
  attempted.value = false;
  error.value = "";
  success.value = "";
  showPassword.value = false;
  const query = { ...route.query };
  if (next === "signup") query.mode = "signup";
  else delete query.mode;
  void router.replace({ query });
  void nextTick(() => emailField.value?.focus());
}

function messageForAuthError(issue: { message?: string; status?: number; statusText?: string } | null, action: string): string {
  if (!issue) return `Could not ${action}.`;
  if (issue.status === 401) return "Email or password is incorrect.";
  if (issue.status === 429) return "Too many attempts. Wait a few seconds, then try again.";
  if (issue.status === 503) return "The account service is warming up. Try again in a moment.";
  if (issue.status && issue.status >= 500) return "The account service could not finish that request. Try again.";
  if (issue.status === 409 || issue.message?.toLowerCase().includes("already exists")) {
    return "An account already exists for this email. Sign in instead.";
  }
  return issue.message || `Could not ${action}.`;
}

async function signInWithGoogle() {
  busy.value = true;
  error.value = "";
  success.value = "";
  try {
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: safeAuthRedirect(route.query.redirect),
    });
    if (result.error) error.value = messageForAuthError(result.error, "sign in with Google");
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : "Google sign-in is unavailable right now.";
  } finally {
    busy.value = false;
  }
}

async function submit() {
  attempted.value = true;
  error.value = "";
  success.value = "";
  const validName = !isSignup.value || form.name.trim().length >= 2;
  const validEmail = /^\S+@\S+\.\S+$/.test(form.email.trim());
  const validPassword = form.password.length >= 8;
  if (!validName || !validEmail || !validPassword) {
    await nextTick();
    if (!validName) nameField.value?.focus();
    else if (!validEmail) emailField.value?.focus();
    else passwordField.value?.focus();
    return;
  }

  busy.value = true;
  try {
    if (isSignup.value) {
      const result = await authClient.signUp.email({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (result.error) {
        error.value = messageForAuthError(result.error, "create your account");
        return;
      }
      success.value = "Account created. Opening your court.";
    } else {
      const result = await authClient.signIn.email({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        rememberMe: true,
      });
      if (result.error) {
        error.value = messageForAuthError(result.error, "sign in");
        return;
      }
      success.value = "Signed in. Opening your court.";
    }

    await sessionState.value.refetch();
    await router.replace(safeAuthRedirect(route.query.redirect));
  } catch (issue) {
    error.value = issue instanceof Error ? issue.message : "Authentication is unavailable right now.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-context" aria-labelledby="auth-context-title">
      <div class="auth-context__copy">
        <span class="context-badge"><LockKeyhole :size="14" /> Private workspace</span>
        <h1 id="auth-context-title">Return to the case, not a blank page.</h1>
        <p>Your strategies, evidence, and Court runs stay tied to this account.</p>
      </div>

      <div class="case-glimpse" aria-label="Saved strategy case preview">
        <header>
          <div>
            <span>Saved case</span>
            <strong>RSI pullback</strong>
          </div>
          <span class="verdict-badge"><span /> Fragile</span>
        </header>
        <div class="case-glimpse__chart" aria-hidden="true">
          <svg viewBox="0 0 640 176" preserveAspectRatio="none">
            <defs>
              <linearGradient id="auth-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#fff" stop-opacity=".13" />
                <stop offset="1" stop-color="#fff" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path class="chart-grid" d="M0 43.5H640M0 87.5H640M0 131.5H640" />
            <path class="chart-area" d="M0 143L46 137L92 122L138 126L184 96L230 105L276 81L322 88L368 52L414 63L460 42L506 59L552 26L598 36L640 15L640 176L0 176Z" />
            <path class="chart-line" d="M0 143L46 137L92 122L138 126L184 96L230 105L276 81L322 88L368 52L414 63L460 42L506 59L552 26L598 36L640 15" />
          </svg>
        </div>
        <footer>
          <span><b>SPY</b> 2020 to 2024</span>
          <span><Check :size="13" /> Rules locked</span>
          <span><Check :size="13" /> 7 tests recorded</span>
        </footer>
      </div>
    </section>

    <section class="auth-entry" aria-labelledby="auth-title">
      <div class="auth-form-wrap">
        <div class="auth-tabs" aria-label="Account access">
          <button type="button" :aria-pressed="mode === 'signin'" :class="{ active: mode === 'signin' }" @click="setMode('signin')">Sign in</button>
          <button type="button" :aria-pressed="mode === 'signup'" :class="{ active: mode === 'signup' }" @click="setMode('signup')">Create account</button>
        </div>

        <Transition name="auth-copy" mode="out-in">
          <header :key="mode" class="auth-heading">
            <h2 id="auth-title">{{ isSignup ? "Create your court" : "Open your court" }}</h2>
            <p>{{ isSignup ? "Save strategy versions and evidence under one login." : "Continue your saved strategy work." }}</p>
          </header>
        </Transition>

        <div v-if="googleEnabled" class="auth-social">
          <button type="button" :disabled="busy" @click="signInWithGoogle">
            <span aria-hidden="true">G</span>
            {{ busy ? "Opening Google…" : "Continue with Google" }}
          </button>
          <div><span>or use email</span></div>
        </div>

        <form novalidate @submit.prevent="submit">
          <Transition name="auth-field">
            <div v-if="isSignup" class="auth-field">
              <label for="auth-name">Name</label>
              <input
                id="auth-name"
                ref="nameField"
                v-model="form.name"
                type="text"
                autocomplete="name"
                placeholder="Your name"
                :aria-invalid="nameInvalid"
                :aria-describedby="nameInvalid ? 'auth-name-error' : undefined"
                :disabled="busy"
              />
              <span v-if="nameInvalid" id="auth-name-error" class="field-error">Enter at least two characters.</span>
            </div>
          </Transition>

          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input
              id="auth-email"
              ref="emailField"
              v-model="form.email"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="you@example.com"
              :aria-invalid="emailInvalid"
              :aria-describedby="emailInvalid ? 'auth-email-error' : undefined"
              :disabled="busy"
            />
            <span v-if="emailInvalid" id="auth-email-error" class="field-error">Enter a valid email address.</span>
          </div>

          <div class="auth-field">
            <label for="auth-password">Password</label>
            <div class="password-control">
              <input
                id="auth-password"
                ref="passwordField"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="isSignup ? 'new-password' : 'current-password'"
                placeholder="At least 8 characters"
                :aria-invalid="passwordInvalid"
                :aria-describedby="passwordInvalid ? 'auth-password-error' : undefined"
                :disabled="busy"
              />
              <button type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" :disabled="busy" @click="showPassword = !showPassword">
                <EyeOff v-if="showPassword" :size="17" />
                <Eye v-else :size="17" />
              </button>
            </div>
            <span v-if="passwordInvalid" id="auth-password-error" class="field-error">Use at least eight characters.</span>
          </div>

          <div v-if="validationMessage" class="auth-message auth-message--error" role="alert">
            <AlertCircle :size="16" />
            <span>{{ validationMessage }}</span>
          </div>
          <div v-else-if="error" class="auth-message auth-message--error" role="alert">
            <AlertCircle :size="16" />
            <span>{{ error }}</span>
          </div>
          <div v-else-if="success" class="auth-message" role="status">
            <Check :size="16" />
            <span>{{ success }}</span>
          </div>

          <button class="auth-submit" type="submit" :disabled="busy">
            <span v-if="busy" class="auth-spinner" aria-hidden="true" />
            {{ busy ? (isSignup ? "Creating account…" : "Signing in…") : (isSignup ? "Create account" : "Sign in") }}
            <ArrowRight v-if="!busy" :size="16" />
          </button>
        </form>

        <p class="auth-switch">
          {{ isSignup ? "Already have an account?" : "New to Strategy Court?" }}
          <button type="button" @click="setMode(isSignup ? 'signin' : 'signup')">{{ isSignup ? "Sign in" : "Create one" }}</button>
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.auth-page{display:grid;min-height:calc(100vh - 64px);grid-template-columns:minmax(0,1.14fr) minmax(420px,.86fr);overflow:hidden}.auth-context{position:relative;display:flex;min-height:700px;flex-direction:column;justify-content:center;padding:80px clamp(52px,7vw,112px);border-right:1px solid rgba(255,255,255,.06)}.auth-context::before{position:absolute;inset:7% 4% 8% 8%;z-index:-1;border-radius:50%;content:"";background:radial-gradient(ellipse at 48% 40%,rgba(255,255,255,.075),rgba(255,255,255,.017) 47%,transparent 72%);filter:blur(34px)}.auth-context__copy{max-width:650px}.context-badge{display:inline-flex;min-height:30px;align-items:center;gap:8px;padding:0 11px;border:1px solid #323232;border-radius:999px;color:#bcbcc1;background:#161616;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 10px 30px rgba(0,0,0,.25);font-size:12px}.auth-context h1{max-width:650px;margin:27px 0 0;font-size:clamp(46px,5.3vw,76px);font-weight:640;line-height:1.02;letter-spacing:-.055em}.auth-context__copy>p{max-width:510px;margin:22px 0 0;color:#97979f;font-size:16px;line-height:1.6}.case-glimpse{width:min(680px,100%);margin-top:62px;overflow:hidden;border:1px solid #303030;border-radius:18px;background:rgba(20,20,20,.9);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 3px 8px rgba(0,0,0,.42),0 40px 110px rgba(0,0,0,.45);backdrop-filter:blur(18px);transform:perspective(1100px) rotateX(1.5deg)}.case-glimpse header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.065)}.case-glimpse header>div{display:grid;gap:4px}.case-glimpse header span{color:#77777f;font-size:11px}.case-glimpse header strong{font-size:14px;font-weight:590}.verdict-badge{display:inline-flex;min-height:26px;align-items:center;gap:7px;padding:0 9px;border:1px solid #3a3a3a;border-radius:999px;color:#d7d7da!important;background:#1b1b1b;font-size:11px!important}.verdict-badge>span{width:6px;height:6px;border-radius:50%;background:#b7b7bb}.case-glimpse__chart{height:176px;background:linear-gradient(180deg,rgba(255,255,255,.012),transparent)}.case-glimpse__chart svg{display:block;width:100%;height:100%}.chart-grid{fill:none;stroke:#292929;stroke-width:1;vector-effect:non-scaling-stroke}.chart-area{fill:url(#auth-chart-fill)}.chart-line{fill:none;stroke:#f4f4f5;stroke-width:2;vector-effect:non-scaling-stroke}.case-glimpse footer{display:flex;align-items:center;gap:18px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.065);color:#85858c;font-size:11px}.case-glimpse footer span{display:inline-flex;align-items:center;gap:6px}.case-glimpse footer span:first-child{margin-right:auto}.case-glimpse footer b{color:#d9d9dc;font-weight:600}
.auth-entry{display:grid;place-items:center;padding:64px clamp(32px,6vw,86px);background:linear-gradient(135deg,rgba(255,255,255,.012),transparent 52%)}.auth-form-wrap{width:min(400px,100%)}.auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border:1px solid #2d2d2d;border-radius:12px;background:#111;box-shadow:inset 0 1px 2px rgba(0,0,0,.5),0 14px 35px rgba(0,0,0,.2)}.auth-tabs button{min-height:40px;padding:0 12px;border:0;border-radius:8px;color:#7d7d85;background:transparent;font-size:12px;font-weight:550;cursor:pointer;transition:color 150ms ease,background 150ms ease,box-shadow 150ms ease}.auth-tabs button:hover{color:#d5d5d9}.auth-tabs button.active{color:#f5f5f5;background:#202020;box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 5px 16px rgba(0,0,0,.3)}.auth-heading{margin:44px 0 31px}.auth-heading h2{margin:0;font-size:34px;font-weight:620;letter-spacing:-.04em}.auth-heading p{margin:10px 0 0;color:#85858d;font-size:13px;line-height:1.55}.auth-social{display:grid;gap:18px;margin:-4px 0 24px}.auth-social>button{display:flex;width:100%;height:46px;align-items:center;justify-content:center;gap:10px;border:1px solid #373737;border-radius:11px;color:#e7e7e9;background:#181818;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 26px rgba(0,0,0,.22);font-size:13px;font-weight:570;cursor:pointer}.auth-social>button:hover:not(:disabled){border-color:#505050;background:#1d1d1d}.auth-social>button:disabled{opacity:.55;cursor:wait}.auth-social>button>span{display:grid;width:21px;height:21px;place-items:center;border:1px solid #454545;border-radius:50%;background:#f2f2f2;color:#111;font-size:11px;font-weight:700}.auth-social>div{display:flex;align-items:center;gap:12px;color:#686870;font-size:11px}.auth-social>div::before,.auth-social>div::after{height:1px;flex:1;content:"";background:#282828}.auth-form-wrap form{display:grid;gap:20px}.auth-field{display:grid;gap:8px}.auth-field label{color:#dedee1;font-size:12px;font-weight:520}.auth-field input{width:100%;height:48px;padding:0 14px;border:1px solid #343434;border-radius:11px;outline:0;color:#f5f5f5;background:#151515;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 4px 12px rgba(0,0,0,.18);transition:border-color 160ms ease,background 160ms ease,box-shadow 180ms ease,transform 160ms ease}.auth-field input:hover:not(:disabled){border-color:#494949;background:#181818}.auth-field input:focus{border-color:#6b6b6b;background:#191919;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 4px rgba(255,255,255,.05),0 20px 52px rgba(0,0,0,.32);transform:translateY(-1px)}.auth-field input[aria-invalid=true]{border-color:#666}.auth-field input::placeholder{color:#5f5f67}.auth-field input:disabled{opacity:.55}.field-error{color:#bcbcc2;font-size:11px}.password-control{position:relative}.password-control input{padding-right:48px}.password-control button{position:absolute;top:5px;right:5px;display:grid;width:38px;height:38px;place-items:center;border:0;border-radius:8px;color:#77777f;background:transparent;cursor:pointer}.password-control button:hover:not(:disabled){color:#e4e4e7;background:#222}.auth-message{display:flex;align-items:flex-start;gap:9px;padding:12px 13px;border:1px solid #333;border-radius:11px;color:#d6d6da;background:#181818;font-size:12px;line-height:1.45}.auth-message--error{border-color:#444;background:#1a1a1a}.auth-message svg{flex:0 0 auto;margin-top:1px}.auth-submit{display:flex;width:100%;height:48px;align-items:center;justify-content:center;gap:9px;margin-top:4px;border:1px solid #fff;border-radius:11px;color:#090909;background:#f7f7f7;box-shadow:inset 0 1px 0 #fff,0 12px 32px rgba(0,0,0,.4);font-size:13px;font-weight:620;cursor:pointer;transition:background 150ms ease,transform 150ms ease,box-shadow 170ms ease}.auth-submit:hover:not(:disabled){background:#e6e6e6;box-shadow:inset 0 1px 0 #fff,0 18px 42px rgba(0,0,0,.48);transform:translateY(-1px)}.auth-submit:active:not(:disabled){transform:translateY(0)}.auth-submit:disabled{opacity:.6;cursor:wait}.auth-spinner{width:15px;height:15px;border:2px solid rgba(0,0,0,.25);border-top-color:#090909;border-radius:50%;animation:auth-spin .7s linear infinite}.auth-switch{margin:23px 0 0;color:#77777f;font-size:12px;text-align:center}.auth-switch button{padding:2px 4px;border:0;color:#d8d8dc;background:transparent;font-weight:550;cursor:pointer}.auth-switch button:hover{text-decoration:underline;text-underline-offset:3px}.auth-copy-enter-active,.auth-copy-leave-active,.auth-field-enter-active,.auth-field-leave-active{transition:opacity 150ms ease,transform 150ms ease}.auth-copy-enter-from,.auth-copy-leave-to{opacity:0;transform:translateY(4px)}.auth-field-enter-from,.auth-field-leave-to{opacity:0;transform:translateY(-5px)}@keyframes auth-spin{to{transform:rotate(360deg)}}
@media(max-width:940px){.auth-page{grid-template-columns:1fr}.auth-entry{grid-row:1;padding-block:72px}.auth-context{grid-row:2;min-height:auto;padding:72px 32px 56px;border-top:1px solid rgba(255,255,255,.06);border-right:0}.auth-context h1{max-width:720px}.case-glimpse{margin-top:46px}}
@media(max-width:560px){.auth-page{min-height:calc(100vh - 60px)}.auth-context{padding:52px 18px 44px}.auth-context h1{margin-top:21px;font-size:43px}.auth-context__copy>p{font-size:14px}.case-glimpse{margin-top:37px;border-radius:14px}.case-glimpse__chart{height:132px}.case-glimpse footer{flex-wrap:wrap;gap:10px 14px}.case-glimpse footer span:first-child{width:100%;margin:0}.auth-entry{padding:56px 18px 70px}.auth-heading{margin:36px 0 27px}.auth-heading h2{font-size:31px}}
@media(prefers-reduced-motion:reduce){.case-glimpse{transform:none}.auth-spinner{animation-duration:1.4s}}
</style>
