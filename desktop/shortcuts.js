import { globalShortcut } from "electron";

let active = [];

/**
 * Register a set of named global shortcuts.
 *
 * @param {Record<string, { accelerator: string, fn: () => void }>} bindings
 * @returns {{ registered: string[], failures: Array<{ name: string, accelerator: string }> }}
 */
export function registerShortcuts(bindings) {
  unregisterAll();
  const failures = [];
  for (const [name, b] of Object.entries(bindings)) {
    if (!b?.accelerator || typeof b?.fn !== "function") continue;
    const ok = globalShortcut.register(b.accelerator, b.fn);
    if (ok) active.push(b.accelerator);
    else failures.push({ name, accelerator: b.accelerator });
  }
  return { registered: [...active], failures };
}

export function unregisterAll() {
  globalShortcut.unregisterAll();
  active = [];
}
