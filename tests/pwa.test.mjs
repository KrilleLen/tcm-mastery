import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const scope = "https://example.test/tcm-mastery/";
const cacheKey = "tcm-mastery:/tcm-mastery/:3";
const releaseUrl = (file) => new URL(`${file}?tcm-release=3`, scope).href;

function loadWorker(initialKeys = []) {
  const handlers = new Map();
  const deleted = [];
  const requested = [];
  const cached = new Map();
  let claims = 0;
  let skips = 0;
  let network = 0;

  vm.runInNewContext(source("sw.js"), {
    URL,
    Request,
    Response,
    self: {
      registration: { scope },
      clients: { claim: async () => { claims += 1; } },
      skipWaiting: async () => { skips += 1; },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: {
      keys: async () => [...initialKeys],
      delete: async (key) => deleted.push(key),
      open: async (key) => {
        assert.equal(key, cacheKey);
        return {
          addAll: async (requests) => requested.push(...requests),
          match: async (url) => cached.get(url),
        };
      },
    },
    fetch: async () => {
      network += 1;
      throw new Error("offline");
    },
  });

  return {
    cached,
    deleted,
    requested,
    get claims() { return claims; },
    get skips() { return skips; },
    get network() { return network; },
    event(type, properties = {}) {
      let result;
      handlers.get(type)({
        ...properties,
        respondWith: (promise) => { result = promise; },
        waitUntil: (promise) => { result = promise; },
      });
      return result;
    },
  };
}

test("offlineläget hämtar hela versionen och väntar på godkänd uppdatering", async () => {
  const worker = loadWorker([cacheKey]);
  await worker.event("install");
  assert.equal(worker.skips, 0);
  assert.ok(worker.requested.every((request) => request.cache === "reload"));
  for (const file of ["index.html", "app-core.js", "app.css", "tcm-offline.css"]) {
    assert.ok(worker.requested.some((request) => request.url === releaseUrl(file)));
  }

  await worker.event("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(worker.skips, 1);
});

test("migreringen aktiverar väntande version och lämnar andra webbappars cache i fred", async () => {
  const worker = loadWorker([cacheKey, "tcm-mastery-v6", "tcm-mastery:/tcm-mastery/:2", "other-app"]);
  await worker.event("install");
  assert.equal(worker.skips, 1);

  await worker.event("activate");
  assert.deepEqual(worker.deleted, ["tcm-mastery-v6", "tcm-mastery:/tcm-mastery/:2"]);
  assert.equal(worker.claims, 1);
});

test("den aktiva appen använder sitt eget skal och sina resurser vid avbrott", async () => {
  const worker = loadWorker([cacheKey]);
  worker.cached.set(releaseUrl("index.html"), new Response("versionens skal"));
  worker.cached.set(releaseUrl("app-core.js"), new Response("versionens kod"));
  const request = (url, mode = "navigate") => ({ url, mode, method: "GET" });

  const shell = await worker.event("fetch", { request: request(`${scope}?source=shortcut`) });
  assert.equal(await shell.text(), "versionens skal");
  const script = await worker.event("fetch", { request: request(`${scope}app-core.js`, "cors") });
  assert.equal(await script.text(), "versionens kod");
  assert.equal(worker.network, 0);
  assert.equal(worker.event("fetch", { request: request("https://example.test/sibling/") }), undefined);

  worker.cached.clear();
  const empty = await worker.event("fetch", { request: request(scope) });
  assert.equal(empty.status, 503);
  assert.match(await empty.text(), /internetanslutning/);
});

test("uppdateringen väntar medan en elev skriver ett svar", async () => {
  const html = source("index.html").replace(/<script\s+src="[^"]+"><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: `${scope}#study` });
  const { window } = dom;
  window.scrollTo = () => {};
  const messages = [];
  const registration = new window.EventTarget();
  registration.active = {};
  registration.waiting = { postMessage: (message) => messages.push(message.type) };
  const serviceWorker = new window.EventTarget();
  serviceWorker.register = async () => registration;
  Object.defineProperty(window.navigator, "serviceWorker", { value: serviceWorker });

  for (const file of ["conditions.js", "points.js", "herbs.js", "formulas.js", "app-core.js"]) {
    window.eval(source(file));
  }
  await new Promise((resolve) => setImmediate(resolve));

  const doc = window.document;
  const update = doc.getElementById("updateAppButton");
  const answer = doc.getElementById("studyText");
  assert.equal(update.hidden, false);
  answer.value = "Mitt pågående svar";
  update.click();
  assert.equal(messages.length, 0);
  assert.match(doc.getElementById("offlineMessage").textContent, /Slutför/);
  assert.equal(answer.value, "Mitt pågående svar");

  answer.value = "";
  update.click();
  assert.deepEqual(messages, ["ACTIVATE_UPDATE"]);
  dom.window.close();
});
