import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const scriptFiles = ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"];

function loadStudy(testContext, storedState = {}, { random = 0.5 } = {}) {
  const dom = new JSDOM(read("index.html").replace(/<script\s+src="[^"]+"><\/script>/g, ""), {
    runScripts: "dangerously",
    url: "https://example.test/tcm-mastery/#study",
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Math.random = () => random;
  window.localStorage.setItem("mastery-v2", JSON.stringify(storedState));
  for (const filename of scriptFiles) {
    const script = window.document.createElement("script");
    script.textContent = read(filename);
    window.document.body.append(script);
  }
  testContext.after(() => window.close());
  return window;
}

test("tidigare studerade kort som ska repeteras kommer före nya kort", (t) => {
  const { document } = loadStudy(t, {
    cards: { "point:LI4": { reviews: 1, due: Date.now() - 60000 } },
  });
  assert.match(document.querySelector("#studyQ").textContent, /LI4/);
  assert.match(document.querySelector("#studyQueueInfo").textContent, /De kommer först/);
});

test("ämnesval begränsar studiepassets frågor", (t) => {
  const window = loadStudy(t);
  const { document } = window;
  const topic = document.querySelector("#studyTopic");
  topic.value = "herb";
  topic.dispatchEvent(new window.Event("change"));
  assert.equal(document.querySelector("#studyBadge").textContent, "Ört");
  window.grade(1);
  assert.equal(document.querySelector("#studyBadge").textContent, "Ört");
});
