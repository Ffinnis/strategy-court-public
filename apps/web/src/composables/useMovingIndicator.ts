import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Ref,
} from "vue";

export function useMovingIndicator(
  container: Ref<HTMLElement | null>,
  selected: () => string,
) {
  const left = ref(0);
  const width = ref(0);
  let observer: ResizeObserver | undefined;
  const measure = () => {
    const root = container.value;
    const active = root?.querySelector<HTMLElement>(
      '[aria-selected="true"], [aria-checked="true"]',
    );
    if (!root || !active) return;
    left.value = active.offsetLeft;
    width.value = active.offsetWidth;
  };
  watch([container, selected], async () => {
    await nextTick();
    observer?.disconnect();
    const root = container.value;
    if (!root) return;
    observer ??= new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>('[role="tab"], [role="radio"]').forEach(item => observer!.observe(item));
    measure();
  }, { immediate: true, flush: "post" });
  onBeforeUnmount(() => observer?.disconnect());
  return computed(() => ({
    width: `${width.value}px`,
    transform: `translateX(${left.value}px)`,
    opacity: width.value ? 1 : 0,
  }));
}
