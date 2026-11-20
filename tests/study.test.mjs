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
  document.querySelector("#studySetup button").click();
  assert.equal(document.querySelector("#studyBadge").textContent, "Ört");
  window.grade(1);
  assert.equal(document.querySelector("#studyBadge").textContent, "Ört");
});

test("ett femkortspass avslutas med en sammanfattning och ett nytt pass kan startas", (t) => {
  const window = loadStudy(t);
  const { document } = window;
  const questions = new Set();
  for (const [index, score] of [2, 2, 1, 0, 2].entries()) {
    assert.equal(document.querySelector("#studyPosition").textContent, `Kort ${index + 1} av 5`);
    questions.add(document.querySelector("#studyQ").textContent);
    window.grade(score);
  }
  assert.equal(questions.size, 5);
  assert.ok(document.querySelector("#studyCard").classList.contains("hidden"));
  assert.match(document.querySelector("#studySummaryStats").textContent, /5 bedömda kort. 3 kan du förklara, 1 är du osäker på och 1 behöver/);
  document.querySelector("#studyAgain").click();
  assert.equal(document.querySelector("#studyPosition").textContent, "Kort 1 av 5");
});

test("den valda passlängden bestämmer hur många frågor som visas", (t) => {
  const { document } = loadStudy(t);
  document.querySelector("#studyLength").value = "10";
  document.querySelector("#studySetup button").click();
  assert.equal(document.querySelector("#studyProgress").max, 10);
  assert.equal(document.querySelector("#studyPosition").textContent, "Kort 1 av 10");
});

test("en omladdning bevarar exakt aktuellt kort, bedömningar, utkast och visad vägledning", (t) => {
  const first = loadStudy(t);
  const { document } = first;
  document.querySelector("#studyTopic").value = "formula";
  document.querySelector("#studySetup button").click();
  first.grade(2);
  const question = document.querySelector("#studyQ").textContent;
  const draft = document.querySelector("#studyText");
  draft.value = "Mitt sparade resonemang";
  draft.dispatchEvent(new first.Event("input"));
  first.showStudyAnswer();

  const state = JSON.parse(first.localStorage.getItem("mastery-v2"));
  const restored = loadStudy(t, state, { random: 0.24 });
  assert.equal(restored.document.querySelector("#studyQ").textContent, question);
  assert.equal(restored.document.querySelector("#studyText").value, draft.value);
  assert.equal(restored.document.querySelector("#studyPosition").textContent, "Kort 2 av 5");
  assert.ok(!restored.document.querySelector("#studyA").classList.contains("hidden"));
  assert.equal(restored.studyOverview().inProgress, true);
  restored.grade(2);
  assert.equal(restored.document.querySelector("#studyPosition").textContent, "Kort 3 av 5");
  assert.equal(JSON.parse(restored.localStorage.getItem("mastery-v2")).correct, 1);
});

test("ett skadat sparat studiepass startar om utan att förlora tidigare repetitioner", (t) => {
  const window = loadStudy(t, {
    cards: { "point:LI4": { reviews: 1, due: Date.now() - 60000 } },
    studySession: { topic: "herb", length: 5, queue: ["point:LI4"], grades: [] },
  });
  assert.match(window.document.querySelector("#studyQ").textContent, /LI4/);
  assert.equal(window.studyOverview().started, 1);
});

test("vägledning och självbedömning visas efter eget svar och ger synlig återkoppling", (t) => {
  const window = loadStudy(t);
  const { document } = window;
  assert.ok(document.querySelector("#studyAssessment").classList.contains("hidden"));
  document.querySelector("#studyCheck").click();
  assert.ok(!document.querySelector("#studyAssessment").classList.contains("hidden"));
  assert.equal(document.activeElement.id, "studyGuidanceTitle");
  document.querySelector(".study-grades .primary").click();
  assert.ok(document.querySelector("#studyAssessment").classList.contains("hidden"));
  assert.match(document.querySelector("#studyFeedback").textContent, /Nästa repetition om 3 dagar/);
  assert.equal(document.activeElement.id, "studyQ");
  assert.equal(JSON.parse(window.localStorage.getItem("mastery-v2")).correct, 1);
});

test("vägledning före eget svar påverkar nästa intervall", (t) => {
  const window = loadStudy(t);
  window.showStudyAnswer();
  window.document.querySelector(".study-grades .primary").click();
  assert.match(window.document.querySelector("#studyFeedback").textContent, /Nästa repetition om 1 dag/);
  assert.equal(JSON.parse(window.localStorage.getItem("mastery-v2")).correct, 0);
});

test("ett pass med svåra kort använder de senaste bedömningarna och respekterar ämnet", (t) => {
  const window = loadStudy(t, {
    cards: {
      "point:LI4": { reviews: 2, lastGrade: 0, due: Date.now() + 60000 },
      "point:LI5": { reviews: 1, lastGrade: 2 },
      "point:LI6": { reviews: 1, lastGrade: null },
      "herb:Ren Shen": { reviews: 1, lastGrade: 0 },
    },
  });
  const { document } = window;
  assert.equal(window.studyOverview().weak, 2);
  document.querySelector("#studyTopic").value = "point";
  const mode = document.querySelector("#studyMode");
  mode.value = "weak";
  mode.dispatchEvent(new window.Event("change"));
  document.querySelector("#studySetup button").click();
  assert.match(document.querySelector("#studyQ").textContent, /LI4/);
  assert.equal(document.querySelector("#studyPosition").textContent, "Kort 1 av 1");
  window.grade(2);
  assert.equal(document.querySelector("#studyAgain").hidden, true);
  assert.equal(window.studyOverview().weak, 1);
});

test("frågetypen för svåra kort visar en förklaring om inga bedömningar finns", (t) => {
  const window = loadStudy(t);
  const { document } = window;
  const mode = document.querySelector("#studyMode");
  mode.value = "weak";
  mode.dispatchEvent(new window.Event("change"));
  assert.equal(document.querySelector("#studySetup button").disabled, true);
  assert.match(document.querySelector("#studyQueueInfo").textContent, /Ännu inga/);
});
