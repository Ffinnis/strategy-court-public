import { nextTick, onBeforeUnmount, ref, toRaw, watch, type Ref } from "vue";
import { authClient } from "@/services/auth";
import type { CaseInput } from "@/types";

export function useIntakeDraft(form: CaseInput, step: Ref<1 | 2 | 3>) {
  const session = authClient.useSession();
  const status = ref("Draft stays private in this browser");
  const defaults = structuredClone(toRaw(form));
  let key = "";
  let ready = false;
  let complete = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function save() {
    if (!key || !ready || complete || !dirty) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          form: { ...form, symbols: [...form.symbols] },
          step: step.value,
        }),
      );
      status.value = "Draft saved in this browser";
    } catch {
      status.value = "Browser storage unavailable. Keep this page open.";
    }
  }
  watch(
    () => session.value.data?.user?.id,
    async (id) => {
      clearTimeout(timer);
      ready = false;
      dirty = false;
      complete = false;
      Object.assign(form, structuredClone(defaults));
      step.value = 1;
      status.value = "Draft stays private in this browser";
      key = id ? `strategy-court:intake:v1:${id}` : "";
      if (!key) return;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          if (
            data.version === 1 &&
            data.form &&
            typeof data.form === "object"
          ) {
            for (const field of Object.keys(defaults) as Array<
              keyof CaseInput
            >) {
              const value = data.form[field];
              if (field === "symbols") {
                if (
                  Array.isArray(value) &&
                  value.length <= 5 &&
                  value.every((item) => typeof item === "string")
                )
                  form.symbols = value;
              } else if (typeof value === typeof defaults[field])
                Object.assign(form, { [field]: value });
            }
            step.value = [1, 2, 3].includes(data.step) ? data.step : 1;
            status.value = "Private draft restored from this browser";
          }
        }
      } catch {
        status.value = "The saved draft could not be restored.";
      }
      await nextTick();
      ready = true;
    },
    { immediate: true },
  );
  watch(
    [() => form, step],
    () => {
      if (!ready || complete) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(save, 450);
    },
    { deep: true },
  );
  function clear(finished = false) {
    clearTimeout(timer);
    complete = finished;
    dirty = false;
    try {
      if (key) localStorage.removeItem(key);
    } catch {
      /* Storage is optional. */
    }
    if (!finished) {
      ready = false;
      Object.assign(form, structuredClone(defaults));
      step.value = 1;
      status.value = "Draft cleared";
      void nextTick(() => {
        ready = Boolean(key);
      });
    }
  }
  onBeforeUnmount(() => {
    clearTimeout(timer);
    save();
  });
  return { draftStatus: status, clearDraft: clear };
}
