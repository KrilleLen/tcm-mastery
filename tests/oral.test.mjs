import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"];

function loadOral(saved = {}) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://example.test/tcm-mastery/#master",
  });
  const { window } = dom;
  window.scrollTo = () => {};
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, value);

  for (const file of scripts) {
    const element = window.document.createElement("script");
    element.textContent = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    window.document.body.append(element);
  }
  return window;
}

test("muntliga svar och självskattning sparas separat för varje fråga", () => {
  const first = loadOral();
  const draft = first.document.querySelector("#masterText");
  const picker = first.document.querySelector("#masterSelect");
  draft.value = "Första utkastet";
  draft.dispatchEvent(new first.Event("input", { bubbles: true }));
  first.document.querySelector("[data-master-criterion]").click();

  picker.value = "3";
  picker.dispatchEvent(new first.Event("change", { bubbles: true }));
  assert.equal(draft.value, "");
  assert.match(first.document.querySelector("#masterQ").textContent, /överge/);
  first.nextMaster(-1);
  assert.equal(first.document.activeElement.id, "masterQ");
  first.selectMaster(0);
  assert.equal(draft.value, "Första utkastet");
  assert.equal(first.document.querySelector("#masterCriteriaProgress").value, 1);
  assert.match(picker.options[0].textContent, /sparat arbete/);

  const saved = Object.fromEntries(["mastery-v2", "mastery-oral-v1"].map((key) => [
    key, first.localStorage.getItem(key),
  ]));
  first.close();

  const reloaded = loadOral(saved);
  assert.equal(reloaded.document.querySelector("#masterText").value, "Första utkastet");
  assert.equal(reloaded.document.querySelector("[data-master-criterion]").checked, true);
  reloaded.close();
});

test("muntlig timer kan pausas, fortsättas och startas om när frågan byts", () => {
  const window = loadOral();
  let now = 1_000;
  window.Date.now = () => now;
  const clock = window.document.querySelector("#masterClock");
  const toggle = window.document.querySelector("#masterTimerToggle");
  const duration = window.document.querySelector("#masterDuration");
  duration.value = "120";
  duration.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(clock.textContent, "02:00");

  toggle.click();
  now += 25_000;
  toggle.click();
  assert.equal(clock.textContent, "01:35");
  assert.equal(toggle.textContent, "Fortsätt");
  now += 10_000;
  window.drawMasterClock();
  assert.equal(clock.textContent, "01:35");

  toggle.click();
  now += 95_000;
  window.drawMasterClock();
  assert.equal(clock.textContent, "00:00");
  assert.equal(toggle.textContent, "Öva igen");
  assert.match(window.document.querySelector("#masterTimerStatus").textContent, /Tiden är ute/);

  toggle.click();
  window.nextMaster();
  assert.equal(toggle.textContent, "Starta timer");
  assert.equal(clock.textContent, "02:00");
  window.close();
});
