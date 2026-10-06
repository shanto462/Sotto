// Deep merge used for settings patches. Plain objects merge recursively;
// everything else (arrays, primitives, null) replaces the target value.
// Keys that could reach Object.prototype are ignored, so a crafted
// settings.json or IPC patch cannot pollute every object in the process.

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(target, source) {
  if (!isPlainObject(source)) return target;
  for (const k of Object.keys(source)) {
    if (BLOCKED_KEYS.has(k)) continue;
    const sv = source[k];
    if (isPlainObject(sv)) {
      target[k] = deepMerge(isPlainObject(target[k]) ? target[k] : {}, sv);
    } else {
      target[k] = sv;
    }
  }
  return target;
}
