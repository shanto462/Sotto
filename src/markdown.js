// Markdown → HTML for answers shown in the overlay.
//
// Claude's answer is derived from a screenshot of whatever page the user is
// on, so treat it as untrusted: a hostile page can try to make Claude echo raw
// HTML (prompt injection). Raw HTML in the markdown is therefore escaped and
// shown as text, and images are reduced to their alt text. Markdown syntax
// (code, lists, links, tables…) still renders.

import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const md = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
  {
    renderer: {
      // Covers both block-level and inline raw HTML tokens.
      html({ text }) {
        return escapeHtml(text);
      },
      // Show images as their alt text. Answers never need them, and loading
      // one could leak a request (for example to a file:// network share).
      image({ text }) {
        return escapeHtml(text);
      },
    },
  },
);

/**
 * @param {string} text  Markdown from the model.
 * @returns {string} HTML safe to assign to innerHTML in the overlay.
 */
export function renderMarkdown(text) {
  return md.parse(String(text ?? ""), { async: false });
}
