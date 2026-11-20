import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const fromRoot = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function openApp(hash = "", saved = {}) {
  const html = fromRoot("index.html").replace(/<script\s+src="[^"]+"><\/script>/g, "");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: `https://example.test/tcm-mastery/${hash}`,
  });
  dom.window.scrollTo = () => {};
  for (const [key, value] of Object.entries(saved)) dom.window.localStorage.setItem(key, value);
  for (const name of ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"]) {
    const script = dom.window.document.createElement("script");
    script.textContent = fromRoot(name);
    dom.window.document.body.append(script);
  }
  return dom.window;
}

test("kortvyn öppnar rätt detalj och återställer fokus i träfflistan", () => {
  const window = openApp("#points");
  const q = (selector) => window.document.querySelector(selector);
  const item = '[data-atlas-id="LI4"]';
  q(item).click();
  assert.ok(q("#points.atlas-reading"));
  assert.equal(window.document.activeElement, q("#pointDetail h2"));
  assert.match(q("#pointDetail").textContent, /LI4 · Hegu/);
  q("#points .atlas-back").click();
  assert.equal(q("#points.atlas-reading"), null);
  assert.equal(window.document.activeElement, q(item));
  window.close();
});
