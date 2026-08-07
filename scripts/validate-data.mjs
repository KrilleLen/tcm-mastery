import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = vm.createContext({ window: {} });

for (const filename of ["conditions.js", "points.js", "herbs.js", "formulas.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context, {
    filename,
  });
}

const datasets = {
  conditions: context.window.TCM_CONDITIONS,
  points: context.window.TCM_POINTS,
  herbs: context.window.TCM_HERBS,
  formulas: context.window.TCM_FORMULAS,
};

assert.equal(datasets.conditions.length, 48, "Appen ska ha 48 kliniska kapitel");
assert.equal(datasets.points.length, 361, "Appen ska ha 361 klassiska punktkoder");
assert.equal(datasets.herbs.length, 102, "Appen ska ha 102 örtkort");
assert.equal(datasets.formulas.length, 58, "Appen ska ha 58 formelkort");

assert.equal(
  Array.from(datasets.conditions, (item) => item.chapter).join(","),
  Array.from({ length: 48 }, (_, index) => index + 1).join(","),
  "Kapitelnumren ska vara kompletta och sorterade",
);

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} får inte innehålla dubletter`);
}

assertUnique(
  datasets.conditions.map((item) => item.chapter),
  "Kapitelregistret",
);
assertUnique(
  datasets.points.map((item) => item.id),
  "Punktregistret",
);
assertUnique(
  datasets.herbs.map((item) => item.pinyin),
  "Örtregistret",
);
assertUnique(
  datasets.formulas.map((item) => item.name),
  "Formelregistret",
);

for (const item of datasets.conditions) {
  assert.ok(item.title && item.english, `Kapitel ${item.chapter} saknar titel`);
  assert.ok(Array.isArray(item.patterns) && item.patterns.length, `Kapitel ${item.chapter} saknar mönster`);
}

for (const item of datasets.points) {
  assert.ok(item.id && item.channel, "En punkt saknar kod eller meridian");
  assert.equal(typeof item.name, "string", `${item.id} har ogiltigt namnformat`);
}

for (const item of datasets.herbs) {
  for (const field of ["pinyin", "category", "pattern", "functions", "safety"]) {
    assert.ok(item[field], `${item.pinyin || "Okänd ört"} saknar ${field}`);
  }
}

for (const item of datasets.formulas) {
  assert.ok(item.name && item.category && item.pattern, "En formel saknar grunddata");
  assert.ok(Array.isArray(item.ingredients) && item.ingredients.length, `${item.name} saknar ingredienser`);
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const asset of [
  "app.css",
  "conditions.js",
  "points.js",
  "herbs.js",
  "formulas.js",
  "app-core.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `${asset} saknas`);
  assert.ok(
    html.includes(asset) || asset === "icon.svg" || ["icon-192.png", "icon-512.png"].includes(asset),
    `${asset} är inte kopplad från startsidan eller manifestet`,
  );
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.lang, "sv-SE");
assert.ok(manifest.icons?.some((icon) => icon.sizes === "192x192"), "Manifestet saknar 192 px-appikon");
assert.ok(manifest.icons?.some((icon) => icon.sizes === "512x512"), "Manifestet saknar 512 px-appikon");

console.log("Datakontroll godkänd: 48 kapitel, 361 punkter, 102 örter och 58 unika formler.");
