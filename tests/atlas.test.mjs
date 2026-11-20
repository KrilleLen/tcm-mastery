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

test("sökverktygen visar hela registret, föredrar exakt punktkod och erbjuder återhämtning", () => {
  const window = openApp("#points");
  const q = (selector) => window.document.querySelector(selector);
  const search = q("#pointSearch");
  assert.equal(window.document.querySelectorAll("#pointList .item").length, 361);
  assert.equal(q("#pointCount").textContent, "361 av 361 poster");
  search.value = "LI 1";
  search.dispatchEvent(new window.Event("input"));
  assert.equal(q("#pointList .item").dataset.atlasId, "LI1");
  search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.match(q("#pointDetail h2").textContent, /LI1\b/);
  q("#points .atlas-back").click();
  search.value = "ingen-träff";
  search.dispatchEvent(new window.Event("input"));
  assert.equal(q("#pointCount").textContent, "0 av 361 poster");
  q(".atlas-reset").click();
  assert.equal(search.value, "");
  assert.equal(q("#pointCount").textContent, "361 av 361 poster");
  window.close();
});

test("bokmärkta kort kan filtreras och finns kvar vid omladdning", () => {
  const first = openApp("#points");
  const a = first.document;
  a.querySelector('[data-atlas-id="LI4"]').click();
  a.querySelector("#points .atlas-save").click();
  assert.equal(a.querySelector("#points .atlas-save").getAttribute("aria-pressed"), "true");
  const key = "tcm-atlas-bookmarks-v1";
  const saved = first.localStorage.getItem(key);
  first.close();

  const second = openApp("#points", { [key]: saved });
  const b = second.document;
  b.querySelector('#points [data-atlas-saved="true"]').click();
  assert.equal(b.querySelectorAll("#pointList .item").length, 1);
  assert.equal(b.querySelector("#pointList .item").dataset.atlasId, "LI4");
  b.querySelector("#pointList .item").click();
  b.querySelector("#points .atlas-save").click();
  assert.match(b.querySelector("#pointList").textContent, /Inga sparade kort ännu/);
  second.close();
});
