import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptFiles = ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"];

function input(window, element, value) {
  element.value = value;
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function loadApp({ storedState = null, random = 0.5, hash = "" } = {}) {
  const html = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/<script\s+src="[^"]+"><\/script>/g, "");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: `https://example.test/tcm-mastery/${hash}`,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Math.random = () => random;
  if (storedState !== null) window.localStorage.setItem("mastery-v2", storedState);

  for (const filename of scriptFiles) {
    const script = window.document.createElement("script");
    script.textContent = fs.readFileSync(path.join(root, filename), "utf8");
    window.document.body.append(script);
  }

  return dom;
}

test("appen startar även med skadad lokal data", () => {
  const dom = loadApp({ storedState: "{inte giltig json" });
  assert.ok(dom.window.document.querySelector("#home.view.active"));
  assert.equal(dom.window.document.querySelectorAll("#channelFilters button").length, 15);
  dom.window.close();
});

test("sökning väljer rätt detalj och visar tydligt tomt resultat", () => {
  const dom = loadApp();
  const { window } = dom;
  window.go("conditions");
  const search = window.document.querySelector("#conditionSearch");

  input(window, search, "astma");
  assert.equal(window.document.querySelectorAll("#conditionList .item").length, 1);
  assert.match(window.document.querySelector("#conditionDetail").textContent, /Astma/);

  input(window, search, "finns-inte");
  assert.equal(window.document.querySelectorAll("#conditionList .item").length, 0);
  assert.match(window.document.querySelector("#conditionDetail").textContent, /Ingen träff/);
  dom.window.close();
});

test("punktfilter och diakritikfri sökning håller lista och detalj synkroniserade", () => {
  const dom = loadApp();
  const { window } = dom;
  window.go("points");
  window.setChannel("Tjocktarm");

  const active = window.document.querySelector("#channelFilters button.active");
  assert.equal(active.textContent, "Tjocktarm");
  assert.equal(active.getAttribute("aria-pressed"), "true");

  const search = window.document.querySelector("#pointSearch");
  input(window, search, "LI4");
  assert.match(window.document.querySelector("#pointDetail").textContent, /LI4.*Hegu/s);
  assert.ok(window.document.querySelector("#pointList .item.selected"));

  window.setChannel("Alla");
  input(window, search, "mjalte");
  assert.ok(window.document.querySelectorAll("#pointList .item").length > 0);
  assert.match(window.document.querySelector("#pointDetail").textContent, /Mjälte/);
  dom.window.close();
});

test("ört- och formelsökning öppnar den första relevanta träffen", () => {
  const dom = loadApp();
  const { window } = dom;

  window.go("herbs");
  input(window, window.document.querySelector("#herbSearch"), "Ren Shen");
  assert.match(window.document.querySelector("#herbDetail").textContent, /Ren Shen/);

  window.go("formulas");
  input(window, window.document.querySelector("#formulaSearch"), "Zuo Jin Wan");
  assert.equal(window.document.querySelectorAll("#formulaList .item").length, 1);
  assert.match(window.document.querySelector("#formulaDetail").textContent, /Zuo Jin Wan/);
  dom.window.close();
});

test("studiepasset omfattar punktregistret och sparar repetition", () => {
  const dom = loadApp({ random: 0.1 });
  const { window } = dom;
  window.go("study");

  assert.equal(window.document.querySelector("#studyBadge").textContent, "Punkt");
  assert.match(window.document.querySelector("#studyMeta").textContent, /569 kort/);
  window.grade(2);

  const stored = JSON.parse(window.localStorage.getItem("mastery-v2"));
  assert.equal(stored.reviews, 1);
  assert.equal(Object.keys(stored.cards).length, 1);
  assert.ok(Object.values(stored.cards)[0].due > Date.now());
  dom.window.close();
});

test("patientfallet kräver fyra fortfarande valda frågor", () => {
  const dom = loadApp();
  const { window } = dom;
  window.go("case");

  const safety = window.document.querySelector("#caseText");
  input(window, safety, "Rödflaggor, läkemedel, graviditet och relevanta differentialer måste kontrolleras först.");
  window.document.querySelector("#caseContent .primary").click();
  assert.match(window.document.querySelector("#caseContent h2").textContent, /Välj frågor/);

  let options = [...window.document.querySelectorAll("#caseContent .option")];
  options.slice(0, 4).forEach((button) => button.click());
  options[0].click();
  window.document.querySelector("#caseContent .primary").click();
  assert.match(window.document.querySelector("#caseContent h2").textContent, /Välj frågor/);
  assert.ok(window.document.querySelector("#caseError.show"));

  options = [...window.document.querySelectorAll("#caseContent .option")];
  options[0].click();
  window.document.querySelector("#caseContent .primary").click();
  assert.match(window.document.querySelector("#caseContent h2").textContent, /Differentiera mönster/);
  dom.window.close();
});

test("pågående patientfall återställs med samma svar och utkast", () => {
  const first = loadApp({ random: 0.2 });
  const { window } = first;
  window.go("case");
  input(
    window,
    window.document.querySelector("#caseText"),
    "Rödflaggor, läkemedel, graviditet och relevanta differentialer måste kontrolleras först.",
  );
  window.document.querySelector("#caseContent .primary").click();
  [...window.document.querySelectorAll("#caseContent .option")]
    .slice(0, 4)
    .forEach((button) => button.click());
  window.document.querySelector("#caseContent .primary").click();
  window.document.querySelector("#caseContent .option").click();
  const draft = "Fynd för och emot måste vägas systematiskt. Saknad information om tidsförlopp, tunga, puls och läkemedel kan ändra hypotesen helt.";
  input(window, window.document.querySelector("#caseText"), draft);
  const title = window.document.querySelector("#caseTitle").textContent;
  const stored = window.localStorage.getItem("mastery-v2");
  first.window.close();

  const restored = loadApp({ storedState: stored, hash: "#case" });
  assert.equal(restored.window.document.querySelector("#caseTitle").textContent, title);
  assert.equal(restored.window.document.querySelector("#caseText").value, draft);
  assert.equal(restored.window.document.querySelectorAll("#caseContent .option.sel").length, 1);
  restored.window.close();
});

test("mästarvyn börjar med den första frågan och byter först på begäran", () => {
  const dom = loadApp();
  const { window } = dom;
  window.go("master");
  assert.match(window.document.querySelector("#masterQ").textContent, /skillnaden mellan att känna igen/);
  window.nextMaster();
  assert.match(window.document.querySelector("#masterQ").textContent, /Qi-tonika/);
  dom.window.close();
});
