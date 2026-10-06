import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMarkdown } from "../src/markdown.js";

describe("renderMarkdown", () => {
  it("renders normal markdown", () => {
    const html = renderMarkdown("# Title\n\n**bold** and [a link](https://example.com)");
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<a href="https:\/\/example.com">a link<\/a>/);
  });

  it("escapes block-level raw HTML", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;img/);
  });

  it("escapes inline raw HTML", () => {
    const html = renderMarkdown('Click <a href="https://evil.example" onclick="x()">here</a> now');
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /&lt;a href=/);
  });

  it("escapes HTML that tries to navigate the window", () => {
    const html = renderMarkdown('<meta http-equiv="refresh" content="0;url=https://evil.example">');
    assert.doesNotMatch(html, /<meta/);
  });

  it("shows images as alt text and never loads them", () => {
    const html = renderMarkdown("![diagram](file://fileserver/share/x.png) ![x](https://tracker.example/p.gif)");
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /diagram/);
  });

  it("highlights fenced code and escapes its contents", () => {
    const html = renderMarkdown('```js\nconst a = "<b>";\n```');
    assert.match(html, /class="hljs language-js"/);
    assert.doesNotMatch(html, /<b>/);
  });

  it("handles empty input", () => {
    assert.equal(renderMarkdown(""), "");
    assert.equal(renderMarkdown(undefined), "");
  });
});
