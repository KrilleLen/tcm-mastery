import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const documentText = read("index.html").replace(/<script\s+src="[^"]+"><\/script>/g, "");
const scripts = ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"].map(read);
const safetyDraft = "Jag börjar med att kontrollera relevanta rödflaggor, läkemedel och alternativa förklaringar.";
const followUp = "Följ upp effekt och tolerans över tid. Om hypotesen inte håller ska bedömningen omprövas. <b>Min kontroll</b>";

function openApp(stored) {
  const dom = new JSDOM(documentText, {
    runScripts: "dangerously",
    url: "https://example.test/tcm-mastery/#case",
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Math.random = () => 0;
  if (stored) window.localStorage.setItem("mastery-v2", stored);
  for (const source of scripts) {
    const script = window.document.createElement("script");
    script.textContent = source;
    window.document.body.append(script);
  }

  return {
    close: () => window.close(),
    find: (selector) => window.document.querySelector(selector),
    stored: () => window.localStorage.getItem("mastery-v2"),
    fill(value) {
      const input = window.document.querySelector("#caseText");
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    },
  };
}

test("several case drafts survive switching and reloading", () => {
  const app = openApp();
  try {
    app.fill(safetyDraft);
    app.find("#caseContent .primary").click();
    app.find("#caseChoices [data-case-index='1']").click();
    app.fill("Eget utkast i det andra fallet.");

    const restored = openApp(app.stored());
    try {
      assert.equal(restored.find("#caseText").value, "Eget utkast i det andra fallet.");
      assert.equal(restored.find("#caseDraftCount").textContent, "2 pågående");
      restored.find("#caseChoices [data-case-index='0']").click();
      assert.match(restored.find("#caseStepLabel").textContent, /Steg 2 av 7/);
      restored.find("#caseSteps [data-step='0']").click();
      assert.equal(restored.find("#caseText").value, safetyDraft);
    } finally {
      restored.close();
    }
  } finally {
    app.close();
  }
});

test("changing a completed step locks every later step until revalidated", () => {
  const app = openApp();
  try {
    assert.equal(app.find("#caseSteps [data-step='1']").disabled, true);
    app.fill(safetyDraft);
    app.find("#caseContent .primary").click();
    assert.equal(app.find("#caseProgress").value, 1);
    assert.equal(app.find("#caseSteps [aria-current='step']").dataset.step, "1");

    app.find("#caseSteps [data-step='0']").click();
    assert.equal(app.find("#caseSteps [data-step='1']").disabled, false);
    app.fill("För kort svar");
    assert.equal(app.find("#caseSteps [data-step='1']").disabled, true);
    app.find("#caseContent .primary").click();
    assert.equal(app.find("#caseSteps [aria-current='step']").dataset.step, "0");
    assert.ok(app.find("#caseError.show"));
  } finally {
    app.close();
  }
});

test("completed case recap retains earlier text and choices after a reload", () => {
  const app = openApp(JSON.stringify({
    caseSession: {
      caseIndex: 0,
      step: 6,
      questions: [0, 1, 2, 3],
      patterns: [0],
      drafts: { 0: safetyDraft },
    },
  }));
  try {
    app.fill(followUp);
    app.find("#caseContent .primary").click();
    assert.ok(app.find("#caseRecap").open);
    assert.ok(app.find("#caseRecapSteps").textContent.includes(followUp));
    assert.ok(app.find("#caseRecapSteps").textContent.includes(safetyDraft));
    assert.match(app.find("#caseRecapSteps").textContent, /Mjälte-Qi-brist/);
    assert.equal(app.find("#caseRecapSteps p b"), null);

    const restored = openApp(app.stored());
    try {
      restored.find("#caseHistoryList .case-choice").click();
      assert.ok(restored.find("#caseRecap").open);
      assert.match(restored.find("#caseRecapTitle").textContent, /Trötthet/);
      assert.ok(restored.find("#caseRecapSteps").textContent.includes(followUp));
    } finally {
      restored.close();
    }
  } finally {
    app.close();
  }
});
