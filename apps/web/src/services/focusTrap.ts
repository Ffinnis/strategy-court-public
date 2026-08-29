export function trappedFocusTarget<T>(active: T | null, container: T, focusable: readonly T[], backwards: boolean): T | null {
  if (focusable.length === 0) return container;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (active === container) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
