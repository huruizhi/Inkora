const key = 'inkora.code.line-numbers.v1';
type Preferences = { readonly lineNumbers: boolean; toggle(): void; subscribe(listener: () => void): () => void };
const preferences = new WeakMap<Window, Preferences>();

/** Display state only. Storage failure leaves a fully usable in-memory preference. */
export function codeViewPreferences(owner: Window): Preferences {
  const existing = preferences.get(owner);
  if (existing) return existing;
  let lineNumbers = false;
  try { lineNumbers = owner.localStorage.getItem(key) === 'true'; } catch { /* opaque origins may have no storage */ }
  const listeners = new Set<() => void>();
  const value: Preferences = {
    get lineNumbers() { return lineNumbers; },
    toggle() {
      lineNumbers = !lineNumbers;
      try { owner.localStorage.setItem(key, String(lineNumbers)); } catch { /* keep this window's choice */ }
      for (const listener of listeners) listener();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  preferences.set(owner, value);
  return value;
}
