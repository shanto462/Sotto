// In-memory rolling history of Q&As. Optionally persisted to userData/history.json
// when the persistHistory setting is on. Always capped at MAX_ENTRIES.

import { app } from "electron";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_ENTRIES = 100;

let entries = [];
let persistEnabled = false;
const subscribers = new Set();

function path() {
  return join(app.getPath("userData"), "history.json");
}

/**
 * Initialise the store. Loads from disk only if persist is true.
 */
export function initHistory({ persist }) {
  persistEnabled = !!persist;
  if (!persistEnabled) {
    entries = [];
    return;
  }
  if (!existsSync(path())) return;
  try {
    const raw = JSON.parse(readFileSync(path(), "utf8"));
    if (Array.isArray(raw)) entries = raw.slice(-MAX_ENTRIES);
  } catch {
    /* ignore corrupt file */
  }
}

/**
 * Change the persist flag. Writes current state to disk if turning on,
 * deletes the file if turning off.
 */
export function setHistoryPersist(value) {
  persistEnabled = !!value;
  if (persistEnabled) {
    flush();
  } else {
    try {
      if (existsSync(path())) unlinkSync(path());
    } catch {
      /* ignore */
    }
  }
}

function flush() {
  if (!persistEnabled) return;
  try {
    writeFileSync(path(), JSON.stringify(entries, null, 2));
  } catch {
    /* ignore */
  }
}

function notify() {
  const snap = listHistory();
  for (const fn of subscribers) {
    try {
      fn(snap);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

/**
 * @param {{
 *   source: "text" | "voice",
 *   question: string,
 *   text: string,
 *   html: string,
 *   meta?: object,
 * }} entry
 */
export function addHistoryEntry(entry) {
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const full = {
    id,
    timestamp: Date.now(),
    source: entry.source,
    question: (entry.question || "").slice(0, 200),
    text: entry.text,
    html: entry.html,
    meta: entry.meta || null,
  };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }
  flush();
  notify();
  return full;
}

export function listHistory() {
  return entries
    .slice()
    .reverse()
    .map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      source: e.source,
      question: e.question,
      // expose text length but not full body in the index payload
      meta: e.meta,
    }));
}

export function getHistoryEntry(id) {
  return entries.find((e) => e.id === id) || null;
}

export function clearHistory() {
  entries = [];
  flush();
  notify();
}

export function subscribeHistory(fn) {
  subscribers.add(fn);
  fn(listHistory()); // initial snapshot
  return () => subscribers.delete(fn);
}
