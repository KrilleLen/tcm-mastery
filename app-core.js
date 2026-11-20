const DATA = {
  conditions: Array.isArray(window.TCM_CONDITIONS) ? window.TCM_CONDITIONS : [],
  points: Array.isArray(window.TCM_POINTS) ? window.TCM_POINTS : [],
  herbs: Array.isArray(window.TCM_HERBS) ? window.TCM_HERBS : [],
  formulas: Array.isArray(window.TCM_FORMULAS) ? window.TCM_FORMULAS : [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = "mastery-v2";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function loadState() {
  let stored = {};

  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch (error) {
    stored = {};
  }

  return {
    reviews: finiteNumber(stored.reviews),
    correct: finiteNumber(stored.correct),
    attempts: finiteNumber(stored.attempts),
    dailyGoal: [3, 5, 10].includes(stored.dailyGoal) ? stored.dailyGoal : 5,
    studyActivity: Object.fromEntries(Object.entries(stored.studyActivity ?? {})
      .filter(([day, count]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isSafeInteger(count) && count > 0)),
    casesCompleted: finiteNumber(stored.casesCompleted),
    cards:
      stored.cards && typeof stored.cards === "object" && !Array.isArray(stored.cards)
        ? stored.cards
        : {},
    caseSession:
      stored.caseSession && typeof stored.caseSession === "object"
        ? stored.caseSession
        : null,
    studySession: stored.studySession,
    caseDrafts: stored.caseDrafts,
    caseHistory: stored.caseHistory,
    masterIndex: Number.isInteger(stored.masterIndex) ? stored.masterIndex : 0,
  };
}

const state = loadState();
let recordedReviews = state.reviews;

function dayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function save() {
  if (state.reviews > recordedReviews) {
    const today = dayKey();
    state.studyActivity[today] = (state.studyActivity[today] || 0) + state.reviews - recordedReviews;
    recordedReviews = state.reviews;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Appen ska fortsätta fungera även om webbläsaren blockerar lokal lagring.
  }
}

function normalizeSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("sv-SE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsSearch(query, ...parts) {
  const needle = normalizeSearch(query);
  if (!needle) return true;

  const haystack = normalizeSearch(parts.flat().join(" "));
  if (haystack.includes(needle)) return true;

  const compactNeedle = needle.replace(/\s/g, "");
  const compactHaystack = haystack.replace(/\s/g, "");
  if (compactHaystack.includes(compactNeedle)) return true;

  return needle.split(" ").every((token) => haystack.includes(token));
}

function emptyState(title, text) {
  return `<div class="empty-state"><b>${title}</b><p>${text}</p></div>`;
}

let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
}

function renderView(id) {
  if (id === "home") renderHome();
  if (id === "progress") renderProgress();
  if (id === "search") renderUniversalSearch();
  if (id === "conditions") renderConditions();
  if (id === "points") renderPoints();
  if (id === "herbs") renderHerbs();
  if (id === "formulas") renderFormulas();
  if (id === "study") currentCard ? updateStudyMeta() : newStudy();
  if (id === "case") renderCase();
  if (id === "master") renderMaster();
}

const ATLAS_VIEWS = ["conditions", "points", "herbs", "formulas"];
let appliedHash;

function go(id, updateHistory = true, recordId = null) {
  const requested = document.getElementById(id);
  const target = requested?.classList.contains("view") ? id : "home";
  const navTarget = ATLAS_VIEWS.includes(target) || target === "search"
    ? "atlas" : target === "progress" ? "home" : target;
  const activeView = document.getElementById(target);

  $$(".view").forEach((view) => view.classList.toggle("active", view === activeView));
  $$(".site-nav [data-v]").forEach((link) => {
    const active = link.dataset.v === navTarget;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const hash = recordId && ATLAS_VIEWS.includes(target)
    ? `#${target}/${encodeURIComponent(recordId)}`
    : `#${target}`;
  if (updateHistory && location.hash !== hash) {
    history.pushState({ view: target }, "", hash);
  }

  appliedHash = location.hash;
  window.scrollTo({ top: 0, behavior: "instant" });
  renderView(target);
  const heading = activeView.querySelector("h1");
  document.title = target === "home" || !heading
    ? "Mästaren · TCM-studier"
    : `${heading.textContent.trim()} · Mästaren`;
  if (updateHistory && heading) {
    heading.tabIndex = -1;
    (target === "search" ? $("#globalSearchInput") : heading).focus({ preventScroll: true });
  }
  if (ATLAS_VIEWS.includes(target) && typeof restoreAtlasRoute === "function") {
    restoreAtlasRoute(target, recordId);
  }
}

function routeFromHash() {
  if (appliedHash === location.hash) return;
  const [view, ...segments] = location.hash.slice(1).split("/");
  let recordId = null;
  if (segments.length) {
    try {
      recordId = decodeURIComponent(segments.join("/"));
    } catch {
      // A malformed link can still open the corresponding register.
    }
  }
  go(view || "home", false, recordId);
}

window.addEventListener("popstate", routeFromHash);
window.addEventListener("hashchange", routeFromHash);
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.dataset.record && typeof openAtlasRecord === "function") {
    event.preventDefault();
    openAtlasRecord(link.dataset.view, link.dataset.record);
    return;
  }
  const target = link.getAttribute("href").slice(1);
  if (!document.getElementById(target)?.classList.contains("view")) return;
  event.preventDefault();
  go(target);
});

function renderHome() {
  const overview = typeof studyOverview === "function" ? studyOverview() : {};
  const today = state.studyActivity[dayKey()] || 0;
  const title = $("#homeCheckpointTitle");
  const text = $("#homeCheckpointText");
  const studyLink = $("#homeStudyAction");
  const caseLink = $("#homeCaseAction");
  const resumeCase = typeof getCaseResume === "function" ? getCaseResume() : null;
  if (!title || !text || !studyLink || !caseLink) return;

  studyLink.textContent = overview.inProgress ? "Fortsätt studiepasset" : "Starta ett studiepass";
  title.textContent = overview.inProgress ? "Ditt pass väntar" : "Dagens studier";
  const dueText = overview.due === 1
    ? "1 kort är redo att repetera."
    : overview.due > 1 ? `${overview.due} kort är redo att repetera.` : "";
  text.textContent = overview.inProgress
    ? `${overview.completed} av ${overview.total} kort klara i ditt pågående pass.`
    : [`${today} av ${state.dailyGoal} kort bedömda i dag.`, dueText].filter(Boolean).join(" ");
  caseLink.textContent = resumeCase
    ? `Fortsätt patientfall · steg ${resumeCase.step} av ${resumeCase.total}`
    : "Öppna patientfall";
}

function renderProgress() {
  const today = new Date();
  const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "short" });
  const fullDate = new Intl.DateTimeFormat("sv-SE", { weekday: "long", month: "long", day: "numeric" });
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    return { date, count: state.studyActivity[dayKey(date)] || 0 };
  });
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const scale = Math.max(state.dailyGoal, ...days.map((day) => day.count));
  const done = days.at(-1).count;

  $("#progressGoal").value = String(state.dailyGoal);
  $("#progressWeekSummary").textContent = `${total} ${total === 1 ? "bedömning" : "bedömningar"} den här veckan.`;
  $("#progressToday").textContent = done >= state.dailyGoal
    ? `Dagens mål uppnått. Du har bedömt ${done} kort.`
    : `${done} av ${state.dailyGoal} kort bedömda i dag.`;
  $("#progressReviews").textContent = state.reviews;
  $("#progressDue").textContent = CARDS.filter((card) =>
    state.cards[card.id]?.reviews && finiteNumber(state.cards[card.id]?.due) <= Date.now()
  ).length;
  $("#progressCases").textContent = state.casesCompleted;
  $("#progressDays").replaceChildren(...days.map(({ date, count }, index) => {
    const item = document.createElement("li");
    item.setAttribute("aria-label", `${fullDate.format(date)}, ${count} ${count === 1 ? "bedömt kort" : "bedömda kort"}`);
    if (index === 6) item.setAttribute("aria-current", "date");
    item.innerHTML = `<b aria-hidden="true">${count}</b><span class="day-bar" aria-hidden="true"><i></i></span><span aria-hidden="true">${index === 6 ? "I dag" : weekday.format(date)}</span>`;
    item.querySelector("i").style.height = `${(count / scale) * 100}%`;
    return item;
  }));

  const topics = [
    ["Diagnostik", "Kliniska kapitel"], ["Punkt", "Akupunkturpunkter"],
    ["Ört", "Örtkort"], ["Formel", "Formler"],
  ];
  $("#progressTopics").replaceChildren(...topics.map(([type, label]) => {
    const cards = CARDS.filter((card) => card.type === type);
    const done = cards.filter((card) => Number(state.cards[card.id]?.reviews) > 0).length;
    const topic = document.createElement("div");
    topic.className = "progress-topic";
    topic.innerHTML = `<div><b>${label}</b><span>${done} av ${cards.length}</span></div><progress value="${done}" max="${cards.length || 1}" aria-label="Påbörjade kort inom ${label}"></progress>`;
    return topic;
  }));
}

$("#progressGoal")?.addEventListener("change", (event) => {
  const goal = Number(event.target.value);
  if (![3, 5, 10].includes(goal)) return;
  state.dailyGoal = goal;
  save();
  renderProgress();
});

const SEARCH_GROUPS = [
  {
    view: "conditions", label: "Kliniska kapitel",
    entry: (item) => [String(item.chapter), item.title, item.english, item.patterns],
  },
  {
    view: "points", label: "Akupunkturpunkter",
    entry: (item) => [item.id, [item.id, item.name].filter(Boolean).join(" · "), item.channel, item.name],
  },
  {
    view: "herbs", label: "Örtkort",
    entry: (item) => [item.pinyin, item.pinyin, item.category, [item.latin, item.pattern]],
  },
  {
    view: "formulas", label: "Formler",
    entry: (item) => [item.name, item.name, item.category, [item.pattern, item.ingredients]],
  },
];

let searchKind = "all";
let searchLimit = 30;

function renderUniversalSearch() {
  const input = $("#globalSearchInput");
  const results = $("#globalSearchResults");
  const status = $("#globalSearchStatus");
  if (!input || !results || !status) return;

  results.replaceChildren();
  $("#globalSearchClear").hidden = !input.value;
  const query = normalizeSearch(input.value);
  if (!query) {
    status.textContent = input.value.trim()
      ? "Skriv ett namn, ett ord eller en punktkod."
      : "Skriv ett ord eller välj ett av exemplen.";
    for (const example of ["LI4", "Astma", "Ren Shen"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost search-example";
      button.textContent = example;
      button.addEventListener("click", () => {
        input.value = example;
        searchLimit = 30;
        renderUniversalSearch();
        input.focus();
      });
      results.append(button);
    }
    return;
  }

  const compact = (value) => normalizeSearch(value).replace(/\s/g, "");
  const key = compact(query);
  let total = 0;
  for (const group of SEARCH_GROUPS) {
    if (searchKind !== "all" && searchKind !== group.view) continue;
    const hits = DATA[group.view].map(group.entry)
      .filter(([id, title, subtitle, tags]) => containsSearch(query, id, title, subtitle, tags))
      .map((entry) => {
        const [id, title] = entry;
        const rank = compact(id) === key || compact(title) === key ? 0
          : compact(title).startsWith(key) ? 1 : 2;
        return { entry, rank };
      })
      .sort((a, b) => a.rank - b.rank);
    total += hits.length;
    if (!hits.length) continue;

    const section = document.createElement("section");
    section.className = "search-group";
    const heading = document.createElement("h2");
    heading.textContent = `${group.label} (${hits.length})`;
    section.append(heading);
    const list = document.createElement("div");
    list.className = "search-hits";
    const limit = searchKind === "all" ? 5 : searchLimit;
    for (const { entry: [id, title, subtitle] } of hits.slice(0, limit)) {
      const link = document.createElement("a");
      link.className = "item search-hit";
      link.href = `#${group.view}/${encodeURIComponent(id)}`;
      link.dataset.view = group.view;
      link.dataset.record = id;
      const name = document.createElement("b");
      name.textContent = title;
      link.append(name);
      if (subtitle) {
        const description = document.createElement("small");
        description.textContent = subtitle;
        link.append(description);
      }
      list.append(link);
    }
    section.append(list);
    if (hits.length > limit) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "ghost";
      more.textContent = searchKind === "all" ? `Visa alla i ${group.label.toLowerCase()}` : "Visa fler träffar";
      more.addEventListener("click", () => {
        if (searchKind === "all") setSearchKind(group.view);
        else {
          searchLimit += 30;
          renderUniversalSearch();
        }
        $("#globalSearchResults .search-hit")?.focus();
      });
      section.append(more);
    }
    results.append(section);
  }

  const restrict = searchKind !== "all";
  status.textContent = total
    ? `${total} ${total === 1 ? "träff" : "träffar"}`
    : restrict ? "Inga träffar i det valda registret. Prova Alla eller ett annat sökord."
      : "Inga träffar. Prova en kortare stavning, punktkod eller ett annat ord.";
}

function setSearchKind(kind) {
  searchKind = kind;
  searchLimit = 30;
  $$("#globalSearchFilters button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.kind === kind));
  });
  renderUniversalSearch();
}

$("#globalSearchInput")?.addEventListener("input", () => {
  searchLimit = 30;
  renderUniversalSearch();
});
$("#globalSearchClear")?.addEventListener("click", () => {
  const input = $("#globalSearchInput");
  input.value = "";
  setSearchKind("all");
  input.focus();
});
$("#globalSearchFilters")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind]");
  if (button) setSearchKind(button.dataset.kind);
});
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
  event.preventDefault();
  go("search");
});

let deferredInstallPrompt = null;
let offlineRegistration = null;
let offlineSetupFailed = false;
let appUpdateReady = false;
let updateRequested = false;
let updateTimer;
let lastUpdateCheck = 0;

function isStandaloneApp() {
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return displayModeStandalone || navigator.standalone === true;
}

function syncInstallButton() {
  const button = $("#installButton");
  if (!button) return;
  button.hidden = isStandaloneApp();
  button.textContent = "Installera";
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  syncInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = $("#installButton");
  if (button) button.hidden = true;
  showToast("Appen är installerad och kan öppnas från hemskärmen.");
});

function showInstallInstructions() {
  const isiOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instructions = isiOS
    ? "Öppna sidan i Safari. Tryck på Dela och välj Lägg till på hemskärmen."
    : "Öppna webbläsarens meny och välj Installera app eller Lägg till på startskärmen.";
  const dialog = $("#appInstallDialog");
  const description = $("#appInstallDescription");
  if (!dialog || !description) return;

  description.textContent = instructions;
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else {
    dialog.setAttribute("open", "");
    $("#closeInstallDialog")?.focus();
  }
}

async function installHelp() {
  if (isStandaloneApp()) {
    showToast("Appen är redan installerad och körs från hemskärmen.");
    return;
  }

  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await prompt.prompt();
    } catch (error) {
      showInstallInstructions();
    }
    return;
  }

  showInstallInstructions();
}

function closeInstallInstructions() {
  const dialog = $("#appInstallDialog");
  if (typeof dialog?.close === "function") dialog.close();
  else dialog?.removeAttribute("open");
  $("#installButton")?.focus();
}

function renderOfflineStatus(message = "") {
  const strip = $("#offlineStatus");
  if (!strip) return;

  const update = appUpdateReady || Boolean(offlineRegistration?.waiting);
  const ready = Boolean(offlineRegistration?.active || navigator.serviceWorker?.controller);
  const online = navigator.onLine;
  const label = $("#offlineLabel");
  const detail = $("#offlineMessage");
  const button = $("#updateAppButton");

  strip.hidden = false;
  strip.dataset.kind = update ? "update" : "offline";
  if (updateRequested) label.textContent = "Uppdaterar appen …";
  else if (update) label.textContent = "En ny version av Mästaren är redo.";
  else if (ready) label.textContent = online ? "Tillgänglig offline" : "Offline · Appen är tillgänglig";
  else if (!online) label.textContent = "Offline · Appen kunde inte förberedas";
  else if (offlineSetupFailed) label.textContent = "Offlineläge är inte tillgängligt här";
  else label.textContent = "Förbereder offlineläge …";

  detail.hidden = !message;
  detail.textContent = message;
  button.hidden = !update;
  button.disabled = updateRequested;
}

function hasUnsavedUpdateDraft() {
  if ($("#studyText")?.value.trim() || $("#masterText")?.value.trim()) return true;

  const session = state.caseSession;
  const hasCaseWork = session && (
    session.step > 0 ||
    Object.values(session.drafts || {}).some((draft) => typeof draft === "string" && draft.trim()) ||
    session.questions?.length ||
    session.patterns?.length
  );
  if (!hasCaseWork) return false;

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return JSON.stringify(stored?.caseSession) !== JSON.stringify(session);
  } catch (error) {
    return true;
  }
}

function reloadForUpdate() {
  if (hasUnsavedUpdateDraft()) {
    renderOfflineStatus("Slutför ditt pågående svar före uppdateringen så att texten finns kvar.");
    return;
  }

  location.reload();
}

function applyAppUpdate() {
  if (updateRequested) return;
  if (appUpdateReady) {
    reloadForUpdate();
    return;
  }

  const worker = offlineRegistration?.waiting;
  if (!worker) return;
  if (hasUnsavedUpdateDraft()) {
    renderOfflineStatus("Slutför ditt pågående svar före uppdateringen så att texten finns kvar.");
    return;
  }

  updateRequested = true;
  renderOfflineStatus();
  updateTimer = setTimeout(() => {
    updateRequested = false;
    renderOfflineStatus("Uppdateringen tog längre tid än väntat. Försök igen.");
  }, 12000);
  try {
    worker.postMessage({ type: "ACTIVATE_UPDATE" });
  } catch (error) {
    clearTimeout(updateTimer);
    updateRequested = false;
    renderOfflineStatus("Uppdateringen kunde inte startas. Försök igen.");
  }
}

function checkForAppUpdate() {
  if (!offlineRegistration || !navigator.onLine || Date.now() - lastUpdateCheck < 300000) return;
  lastUpdateCheck = Date.now();
  offlineRegistration.update().catch(() => {});
}

function setupOfflineApp() {
  $("#closeInstallDialog")?.addEventListener("click", closeInstallInstructions);
  $("#updateAppButton")?.addEventListener("click", applyAppUpdate);
  window.addEventListener("offline", () => renderOfflineStatus());
  window.addEventListener("online", () => {
    renderOfflineStatus();
    checkForAppUpdate();
  });
  window.addEventListener("focus", checkForAppUpdate);

  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker) {
    offlineSetupFailed = true;
    renderOfflineStatus();
    return;
  }

  let previousController = serviceWorker.controller;
  serviceWorker.addEventListener("controllerchange", () => {
    const controller = serviceWorker.controller;
    if (controller && previousController && controller !== previousController) appUpdateReady = true;
    previousController = controller;

    if (controller && updateRequested) {
      clearTimeout(updateTimer);
      updateRequested = false;
      appUpdateReady = true;
      renderOfflineStatus();
      reloadForUpdate();
    } else {
      renderOfflineStatus();
    }
  });

  renderOfflineStatus();
  serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((registration) => {
    offlineRegistration = registration;
    function trackInstallation() {
      registration.installing?.addEventListener("statechange", () => renderOfflineStatus());
    }
    registration.addEventListener("updatefound", trackInstallation);
    trackInstallation();
    renderOfflineStatus();
  }).catch(() => {
    offlineSetupFailed = true;
    renderOfflineStatus();
  });
}

const ATLAS = {
  conditions: {
    prefix: "condition",
    id: (item) => String(item.chapter),
    title: (item) => `Kapitel ${item.chapter} · ${item.title}`,
    subtitle: (item) => `${item.english} · ${item.patterns.slice(0, 2).join(" / ")}`,
    search: (item) => [item.title, item.english, item.patterns, `kapitel ${item.chapter}`],
    group: (item) => item.patterns[0],
    compare: (item) => [
      ["Engelskt namn", item.english],
      ["Mönster", item.patterns.join(", ")],
      ["Bokkapitel", String(item.chapter)],
    ],
    detail: conditionAtlasDetail,
    noResults: ["Inga kapitel hittades", "Prova ett annat ord eller mönsternamn."],
  },
  points: {
    prefix: "point",
    id: (item) => item.id,
    title: (item) => item.id + (item.name ? ` · ${item.name}` : ""),
    subtitle: (item) => item.channel,
    search: (item) => [item.id, item.name, item.channel],
    group: (item) => item.channel,
    compare: (item) => [
      ["Punktkod", item.id],
      ["Namn", item.name || "Ej angivet"],
      ["Meridian", item.channel],
    ],
    detail: pointAtlasDetail,
    noResults: ["Inga punkter hittades", "Kontrollera punktkod, namn eller meridian."],
  },
  herbs: {
    prefix: "herb",
    id: (item) => item.pinyin,
    title: (item) => item.pinyin,
    subtitle: (item) => `${item.category} · ${item.pattern}`,
    search: (item) => [item.pinyin, item.category, item.pattern, item.functions],
    group: (item) => item.category.split(",")[0],
    compare: (item) => [
      ["Kategori", item.category],
      ["Mönsterlogik", item.pattern],
      ["Funktionsområden", item.functions],
    ],
    detail: herbAtlasDetail,
    noResults: ["Inga örter hittades", "Prova namn, kategori, funktion eller mönster."],
  },
  formulas: {
    prefix: "formula",
    id: (item) => item.name,
    title: (item) => item.name,
    subtitle: (item) => `${item.category} · ${item.pattern}`,
    search: (item) => [item.name, item.category, item.pattern, item.ingredients],
    group: (item) => item.category.split(",")[0],
    compare: (item) => [
      ["Kategori", item.category],
      ["Mönster", item.pattern],
      ["Ingrediensstruktur", item.ingredients.join(", ")],
    ],
    detail: formulaAtlasDetail,
    noResults: ["Inga formler hittades", "Prova formelnamn, kategori, mönster eller ört."],
  },
};

const atlasSelected = {};
const atlasQueries = {};
const atlasSavedOnly = new Set();
const atlasComparisons = {};
const ATLAS_BOOKMARK_KEY = "tcm-atlas-bookmarks-v1";
let atlasBookmarks = loadAtlasBookmarks() || {};
let channel = "Alla";

function atlasEntry(view, recordId) {
  if (!Object.hasOwn(ATLAS, view) || recordId == null) return null;
  return DATA[view].find((item) => ATLAS[view].id(item) === String(recordId));
}

function loadAtlasBookmarks() {
  let raw;
  try {
    raw = localStorage.getItem(ATLAS_BOOKMARK_KEY);
  } catch (error) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch (error) {
    return {};
  }
  return Object.fromEntries(Object.keys(ATLAS).map((view) => [
    view,
    new Set((Array.isArray(parsed?.[view]) ? parsed[view] : [])
      .filter((id) => typeof id === "string" && atlasEntry(view, id))),
  ]));
}

function atlasBookmarkCount(view) {
  if (view) return atlasBookmarks[view]?.size || 0;
  return Object.keys(ATLAS).reduce((total, type) => total + atlasBookmarkCount(type), 0);
}

function saveAtlasBookmark(view) {
  const recordId = atlasSelected[view];
  if (!atlasEntry(view, recordId)) return;

  atlasBookmarks = loadAtlasBookmarks() || atlasBookmarks;
  const bookmarks = atlasBookmarks[view] || (atlasBookmarks[view] = new Set());
  const wasSaved = bookmarks.has(recordId);
  if (wasSaved) bookmarks.delete(recordId);
  else bookmarks.add(recordId);

  try {
    const serialized = Object.fromEntries(Object.keys(ATLAS).map((type) => [
      type, [...(atlasBookmarks[type] || [])],
    ]));
    localStorage.setItem(ATLAS_BOOKMARK_KEY, JSON.stringify(serialized));
    showToast(wasSaved ? "Kortet togs bort från sparade." : "Kortet finns nu under Sparade.");
  } catch (error) {
    showToast("Ändringen sparas under den här fliken.");
  }
  if (wasSaved && atlasSavedOnly.has(view)) {
    go(view);
    $(`#${view} [data-atlas-saved="true"]`).focus();
    return;
  }
  renderAtlas(view);
}

function renderConditions() { renderAtlas("conditions"); }
function renderPoints() { renderAtlas("points"); }
function renderHerbs() { renderAtlas("herbs"); }
function renderFormulas() { renderAtlas("formulas"); }

function initChannels() {
  const filters = $("#channelFilters");
  const channels = ["Alla", ...new Set(DATA.points.map((item) => item.channel))];
  for (const name of channels) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.channel = name;
    button.addEventListener("click", () => setChannel(name));
    filters.append(button);
  }
  updateChannelFilters();
  window.addEventListener("storage", (event) => {
    if (event.key !== ATLAS_BOOKMARK_KEY) return;
    atlasBookmarks = loadAtlasBookmarks() || atlasBookmarks;
    const active = document.querySelector(".atlas.active");
    if (active) renderAtlas(active.id);
  });

  for (const [view, config] of Object.entries(ATLAS)) {
    const list = $(`#${config.prefix}List`);
    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-atlas-id]");
      if (button) openAtlasRecord(view, button.dataset.atlasId);
    });
    const section = $(`#${view}`);
    const input = $(`#${config.prefix}Search`);
    section.querySelector(".atlas-back").addEventListener("click", () => closeAtlasReader(view));
    section.querySelector(".atlas-save").addEventListener("click", () => saveAtlasBookmark(view));
    section.querySelector(".atlas-copy").addEventListener("click", () => copyAtlasRecord(view));
    section.querySelector(".atlas-compare-toggle").addEventListener("click", () => toggleAtlasComparison(view));
    const comparison = section.querySelector(".atlas-comparison");
    const compareSearch = comparison.querySelector(".atlas-compare-search");
    compareSearch.addEventListener("input", () => renderAtlasComparison(view));
    compareSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const first = comparison.querySelector("button[data-atlas-compare]");
      if (first) selectAtlasComparison(view, first.dataset.atlasCompare);
    });
    comparison.querySelector(".atlas-compare-options").addEventListener("click", (event) => {
      const option = event.target.closest("button[data-atlas-compare]");
      if (option) selectAtlasComparison(view, option.dataset.atlasCompare);
    });
    section.querySelector(".atlas-modes").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-atlas-saved]");
      if (!button) return;
      if (button.dataset.atlasSaved === "true") atlasSavedOnly.add(view);
      else atlasSavedOnly.delete(view);
      list.scrollTop = 0;
      renderAtlas(view);
    });
    section.querySelector(".atlas-clear").addEventListener("click", () => setAtlasSearch(view, ""));
    section.querySelector(".atlas-suggestions").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-atlas-search]");
      if (button) setAtlasSearch(view, button.dataset.atlasSearch);
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        event.stopPropagation();
        setAtlasSearch(view, "");
      }
      if (event.key === "Enter") {
        const first = list.querySelector(".item");
        if (first) {
          event.preventDefault();
          openAtlasRecord(view, first.dataset.atlasId);
        }
      }
    });
  }
}

function updateChannelFilters() {
  $$("#channelFilters button").forEach((button) => {
    const selected = button.dataset.channel === channel;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setChannel(value) {
  channel = value;
  updateChannelFilters();
  $("#pointList").scrollTop = 0;
  renderPoints();
}

function setAtlasSearch(view, query) {
  const input = $(`#${ATLAS[view].prefix}Search`);
  input.value = query;
  input.focus();
  renderAtlas(view);
}

function atlasMatches(view, item, query) {
  const config = ATLAS[view];
  return (!atlasSavedOnly.has(view) || atlasBookmarks[view]?.has(config.id(item))) &&
    (view !== "points" || channel === "Alla" || item.channel === channel) &&
    containsSearch(query, config.search(item));
}

function renderAtlas(view) {
  const config = ATLAS[view];
  const list = $(`#${config.prefix}List`);
  const detail = $(`#${config.prefix}Detail`);
  const section = $(`#${view}`);
  const input = $(`#${config.prefix}Search`);
  const query = normalizeSearch(input.value);
  const queryChanged = atlasQueries[view] !== query;
  atlasQueries[view] = query;
  if (queryChanged) list.scrollTop = 0;
  const bookmarks = atlasBookmarks[view];
  const savedOnly = atlasSavedOnly.has(view);
  const matches = DATA[view].filter((item) => atlasMatches(view, item, query));

  const compactQuery = query.replaceAll(" ", "");
  const exact = query
    ? matches.findIndex((item) => config.search(item).some(
      (field) => typeof field === "string" && normalizeSearch(field).replaceAll(" ", "") === compactQuery,
    ))
    : -1;
  if (exact > 0) matches.unshift(...matches.splice(exact, 1));

  section.querySelector(".atlas-clear").hidden = !input.value;
  section.querySelector(".atlas-suggestions").hidden = Boolean(input.value);
  const count = $(`#${config.prefix}Count`);
  const saveButton = section.querySelector(".atlas-save");
  const allMode = section.querySelector('[data-atlas-saved="false"]');
  const savedMode = section.querySelector('[data-atlas-saved="true"]');
  const savedCount = atlasBookmarkCount(view);
  allMode.setAttribute("aria-pressed", String(!savedOnly));
  savedMode.setAttribute("aria-pressed", String(savedOnly));
  savedMode.textContent = `Sparade (${savedCount})`;
  count.textContent = savedOnly
    ? `${matches.length} av ${savedCount} sparade poster`
    : `${matches.length} av ${DATA[view].length} poster`;

  if (!matches.length) {
    atlasSelected[view] = null;
    $(`#${view}`).classList.remove("atlas-reading");
    list.innerHTML = savedOnly && !savedCount
      ? emptyState("Inga sparade kort ännu", "Öppna en post och välj Spara kort för att samla dina favoriter.")
      : emptyState(...config.noResults);
    saveButton.hidden = true;
    if (savedOnly || query || (view === "points" && channel !== "Alla")) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "ghost atlas-reset";
      reset.textContent = "Visa alla poster";
      reset.addEventListener("click", () => {
        atlasSavedOnly.delete(view);
        if (view === "points") {
          channel = "Alla";
          updateChannelFilters();
        }
        setAtlasSearch(view, "");
      });
      list.append(reset);
    }
    detail.innerHTML = emptyState("Ingen träff att visa", "Ändra sökningen för att öppna en träff.");
    delete atlasComparisons[view];
    renderAtlasComparison(view);
    return;
  }

  const selected = (queryChanged && exact >= 0 ? matches[0] : null) ||
    matches.find((item) => config.id(item) === atlasSelected[view]) || matches[0];
  atlasSelected[view] = config.id(selected);
  const isBookmarked = Boolean(bookmarks?.has(atlasSelected[view]));
  saveButton.hidden = false;
  saveButton.setAttribute("aria-pressed", String(isBookmarked));
  saveButton.textContent = isBookmarked ? "★ Sparat kort" : "☆ Spara kort";

  const rows = matches.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item";
    button.dataset.atlasId = config.id(item);
    button.setAttribute("aria-controls", detail.id);
    if (item === selected) {
      button.classList.add("selected");
      button.setAttribute("aria-current", "true");
    }

    const title = document.createElement("b");
    title.textContent = config.title(item);
    if (bookmarks?.has(config.id(item))) {
      const mark = document.createElement("span");
      mark.className = "atlas-saved-mark";
      mark.setAttribute("aria-label", "Sparad");
      mark.textContent = "★";
      title.append(" ", mark);
    }
    const subtitle = document.createElement("small");
    subtitle.textContent = config.subtitle(item);
    button.append(title, subtitle);
    return button;
  });
  list.replaceChildren(...rows);
  detail.innerHTML = config.detail(selected);
  appendAtlasRelated(view, selected, detail);
  renderAtlasComparison(view);
}

function atlasComparisonResults(view, primary, query) {
  const config = ATLAS[view];
  const otherCards = DATA[view].filter((item) => item !== primary);
  if (query) return otherCards.filter((item) => containsSearch(query, config.search(item)));
  return otherCards.filter((item) => config.group(item) === config.group(primary));
}

function renderAtlasComparison(view) {
  const config = ATLAS[view];
  const section = $(`#${view}`);
  const primary = atlasEntry(view, atlasSelected[view]);
  const compareButton = section.querySelector(".atlas-compare-toggle");
  const comparison = section.querySelector(".atlas-comparison");
  const state = atlasComparisons[view];
  const isOpen = Boolean(state && primary);
  compareButton.hidden = !primary || DATA[view].length < 2;
  compareButton.setAttribute("aria-expanded", String(isOpen));
  compareButton.textContent = isOpen ? "Stäng jämförelsen" : "Jämför kort";
  comparison.hidden = !isOpen;
  section.querySelector(".atlas-copy").hidden = isOpen || !primary;
  section.querySelector(".atlas-copy-fallback").hidden = true;
  section.classList.toggle("atlas-comparing", isOpen);
  section.querySelector(".atlas-detail").hidden = isOpen;
  if (!isOpen) return;

  const search = comparison.querySelector(".atlas-compare-search");
  const query = normalizeSearch(search.value);
  let candidates = atlasComparisonResults(view, primary, query);
  if (!query && !candidates.length) candidates = DATA[view].filter((item) => item !== primary);

  comparison.querySelector(".atlas-compare-primary").textContent = `Första kortet är ${config.title(primary)}.`;
  const visible = candidates.slice(0, 8);
  comparison.querySelector(".atlas-compare-count").textContent = query
    ? (candidates.length > visible.length
      ? `Visar ${visible.length} av ${candidates.length} träffar. Sök vidare för att begränsa listan.`
      : `${visible.length} träffar`)
    : "Förslag från registret";

  const options = visible.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.dataset.atlasCompare = config.id(item);
    button.setAttribute("aria-pressed", String(button.dataset.atlasCompare === state.recordId));
    button.textContent = config.title(item);
    return button;
  });
  comparison.querySelector(".atlas-compare-options").replaceChildren(...options);

  const second = atlasEntry(view, state.recordId);
  const tableContainer = comparison.querySelector(".atlas-compare-table");
  tableContainer.hidden = !second || primary === second;
  if (!tableContainer.hidden) tableContainer.replaceChildren(buildAtlasComparisonTable(config, primary, second));
  else tableContainer.replaceChildren();
}

function buildAtlasComparisonTable(config, primary, second) {
  const table = document.createElement("table");
  const caption = table.createCaption();
  caption.tabIndex = -1;
  caption.textContent = "Uppgifterna sida vid sida";

  const head = table.createTHead().insertRow();
  const title = document.createElement("th");
  title.scope = "col";
  title.textContent = "Studieområde";
  head.append(title);
  for (const item of [primary, second]) {
    const field = document.createElement("th");
    field.scope = "col";
    field.textContent = config.title(item);
    head.append(field);
  }

  const values = [primary, second].map((item) => {
    const template = document.createElement("template");
    template.innerHTML = config.detail(item);
    return [
      ...config.compare(item),
      ["Säkerhet", template.content.querySelector(".safety").textContent],
      ["Källa", template.content.querySelector(".source").textContent],
    ];
  });
  const body = table.createTBody();
  for (const [rowIndex, [label, firstValue]] of values[0].entries()) {
    const row = body.insertRow();
    const labelCell = document.createElement("th");
    labelCell.scope = "row";
    labelCell.textContent = label;
    row.append(labelCell);
    row.insertCell().textContent = firstValue;
    row.insertCell().textContent = values[1][rowIndex][1];
  }
  return table;
}

function toggleAtlasComparison(view) {
  const section = $(`#${view}`);
  if (atlasComparisons[view]) {
    delete atlasComparisons[view];
    renderAtlasComparison(view);
    section.querySelector(".atlas-compare-toggle").focus();
    return;
  }

  atlasComparisons[view] = { recordId: null };
  section.classList.add("atlas-reading");
  section.querySelector(".atlas-compare-search").value = "";
  renderAtlasComparison(view);
  section.querySelector(".atlas-comparison h2").focus();
}

function selectAtlasComparison(view, targetId) {
  const compared = atlasComparisons[view];
  if (!compared || !atlasEntry(view, targetId) || targetId === atlasSelected[view]) return;
  compared.recordId = targetId;
  renderAtlasComparison(view);
  $(`#${view} .atlas-compare-table caption`)?.focus();
}

function atlasRecordHash(view, recordId) {
  return `#${view}/${encodeURIComponent(recordId)}`;
}

function restoreAtlasRoute(view, recordId) {
  if (!Object.hasOwn(ATLAS, view)) return false;
  const config = ATLAS[view];
  const section = $(`#${view}`);
  const item = recordId == null ? null : atlasEntry(view, recordId);
  section.classList.toggle("atlas-reading", Boolean(item));
  delete atlasComparisons[view];

  if (item) {
    const input = $(`#${config.prefix}Search`);
    const query = normalizeSearch(input.value);
    if (!atlasMatches(view, item, query)) {
      input.value = "";
      atlasSavedOnly.delete(view);
      if (view === "points") {
        channel = "Alla";
        updateChannelFilters();
      }
    }
    atlasQueries[view] = normalizeSearch(input.value);
    atlasSelected[view] = config.id(item);
  }
  renderAtlas(view);
  return Boolean(item) || recordId == null;
}

function openAtlasRecord(view, recordId) {
  const item = atlasEntry(view, recordId);
  if (!item) return false;
  go(view, true, ATLAS[view].id(item));
  const heading = $(`#${view} .atlas-detail h2`);
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      $(`#${view} .atlas-reader`).scrollIntoView({ block: "start", behavior: "instant" });
    }
  }
  return true;
}

function closeAtlasReader(view) {
  go(view);
  const section = $(`#${view}`);
  const selected = section.querySelector(".atlas-results .selected");
  (selected || $(`#${ATLAS[view].prefix}Search`)).focus();
}

async function copyAtlasRecord(view) {
  const recordId = atlasSelected[view];
  if (!atlasEntry(view, recordId)) return;
  const url = new URL(atlasRecordHash(view, recordId), location.href).href;

  try {
    await navigator.clipboard.writeText(url);
    showToast("Kortlänken är kopierad.");
  } catch (error) {
    const fallback = $(`#${view} .atlas-copy-fallback`);
    const input = fallback.querySelector("input");
    input.value = url;
    fallback.hidden = false;
    input.select();
    input.focus();
  }
}

function appendAtlasRelated(view, item, target) {
  let label;
  let relatedType = view;
  let items;

  if (view === "points") {
    const channelSequence = DATA.points.filter((point) => point.channel === item.channel);
    const index = channelSequence.indexOf(item);
    items = [channelSequence[index - 1], channelSequence[index + 1]].filter(Boolean);
    label = "Intilliggande punkter i registret";
  } else if (view === "formulas") {
    relatedType = "herbs";
    items = item.ingredients.map((name) => atlasEntry(relatedType, name)).filter(Boolean);
    label = "Ingredienser med örtkort";
  } else {
    return;
  }
  if (!items.length) return;

  const related = document.createElement("div");
  related.className = "atlas-related";
  const heading = document.createElement("h3");
  heading.textContent = label;
  related.append(heading);

  const links = document.createElement("div");
  links.className = "chips";
  const config = ATLAS[relatedType];
  for (const entry of items) {
    const link = document.createElement("a");
    link.className = "chip";
    link.href = atlasRecordHash(relatedType, config.id(entry));
    link.textContent = config.title(entry);
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      openAtlasRecord(relatedType, config.id(entry));
    });
    links.append(link);
  }
  related.append(links);
  target.append(related);
}

function conditionAtlasDetail(item) {
  return `<span class="badge">Kapitel ${item.chapter}</span><h2>${item.title}</h2><p class="muted">${item.english}</p><h3>Mönster att differentiera</h3><div class="chips">${item.patterns.map((pattern) => `<span class="chip">${pattern}</span>`).join("")}</div><div class="facts"><div class="fact"><small>Frågor med hög informationsvinst</small>• Debut och tidsförlopp<br>• Förvärrande och lindrande faktorer<br>• Energi, sömn och aptit<br>• Avföring, urin och törst<br>• Smärtans plats och karaktär<br>• Läkemedel, graviditet och rödflaggor</div><div class="fact"><small>Obligatorisk arbetsgång</small>1. Säkerhet och biomedicinsk differential<br>2. Samla huvud- och följdsymtom<br>3. Bedöm tunga och puls i sitt sammanhang<br>4. Väg fynd för och emot varje mönster<br>5. Formulera mekanism<br>6. Formulera behandlingsprincip<br>7. Välj verktyg och följ upp</div><div class="fact"><small>Tunga och puls</small>Dokumentera observationen först. Tolka först därefter och ange vad som talar emot din hypotes.</div><div class="fact"><small>Uppföljning</small>Förändring, tolerans, nya rödflaggor, om hypotesen håller och när behandlingen ska avslutas eller omvärderas.</div></div><div class="safety">Säkerhet före TCM: uteslut akuta eller allvarliga orsaker, kontrollera läkemedel, graviditet, ålder, dehydrering, blödning och andra relevanta rödflaggor.</div><p class="source">Maciocia, The Practice of Chinese Medicine, kapitel ${item.chapter} · Pedagogisk syntes, inte ordagrann boktext.</p>`;
}

function pointAtlasDetail(item) {
  return `<span class="badge">Seirin: ${item.channel}-meridianen</span><h2>${item.id}${item.name ? ` · ${item.name}` : ""}</h2><p class="muted">${item.channel}</p><div class="facts"><div class="fact"><small>Studieuppgift</small>Lär punktens namn, anatomiska region, palpationslandmärke, traditionella funktioner, närliggande riskstrukturer och vanliga förväxlingspunkter.</div><div class="fact"><small>Självtest</small>Kan du ange region, landmärke, närliggande punkt och en viktig säkerhetsrisk utan att titta?</div><div class="fact"><small>Jämför</small>Identifiera föregående och nästa punkt på meridianen samt en punkt från annan meridian i samma anatomiska region.</div><div class="fact"><small>Kapitelhänvisning</small>Seirin: ${item.channel}-meridianen</div></div><div class="safety">Nålriktning och djup ska verifieras i atlas och med handledare; appen ger inte invasiva instruktioner.</div><p class="source">Punktkodsystem: WHO:s standardnomenklatur för 361 klassiska punkter. Anatomisk detalj: verifiera i Seirins punktatlas.</p>`;
}

function herbAtlasDetail(item) {
  const categoryRoot = item.category.split(",")[0];
  const similar = DATA.herbs
    .filter(
      (herb) => herb.category.split(",")[0] === categoryRoot && herb.pinyin !== item.pinyin,
    )
    .slice(0, 4);

  return `<span class="badge gold">${item.category}</span><h2>${item.pinyin}</h2><div class="facts"><div class="fact"><small>Mönsterlogik</small>${item.pattern}</div><div class="fact"><small>Funktionsområden</small>${item.functions}</div><div class="fact"><small>Jämför med</small>${similar.map((herb) => herb.pinyin).join(", ") || "Sök inom samma kategori"}</div><div class="fact"><small>Dosering</small>Verifiera i fysisk bok; visas inte utan källkontroll</div></div><h3>Mästarfrågor</h3><div class="chips"><span class="chip">När väljs den?</span><span class="chip">När väljs den inte?</span><span class="chip">Vilken liknande ört är alternativ?</span><span class="chip">Hur påverkar beredningen?</span></div><div class="safety"><b>Säkerhet:</b> ${item.safety}. Kontrollera alltid läkemedel, graviditet, lever/njurfunktion, allergi, produktkvalitet och artidentitet.</div><p class="source">Materia Medica: kapitel enligt kategori · Pedagogisk översikt.</p>`;
}

function formulaAtlasDetail(item) {
  return `<span class="badge gold">${item.category}</span><h2>${item.name}</h2><p>${item.pattern}</p><h3>Ingrediensstruktur</h3><div class="chips">${item.ingredients.map((herb, index) => `<span class="chip">${index === 0 ? "Kejsarkandidat: " : ""}${herb}</span>`).join("")}</div><div class="facts"><div class="fact"><small>Analysera roller</small>Identifiera kejsare, minister, assistent och budbärare utifrån formelns behandlingsprincip.</div><div class="fact"><small>Ta bort en ört</small>Förklara vilken del av riktning, balans, säkerhet eller symptomprofil som försvagas.</div><div class="fact"><small>Jämför</small>Hitta en närliggande formel i samma kategori och förklara det avgörande skiljetecknet.</div><div class="fact"><small>Omvärdera</small>Ange fynd som skulle göra att formeln inte längre passar.</div></div><div class="safety">Utbildningspost. Dosförhållanden, substitutioner och klinisk användning måste verifieras i boken och av kvalificerad handledare.</div><p class="source">Chinese Herbal Formulas and Applications: kapitel enligt formelkategori · Ingrediensnamnen är studieöversikt; proportioner verifieras i boken.</p>`;
}

function allCards() {
  const cards = [];

  DATA.conditions.forEach((item) =>
    cards.push({
      id: `condition:${item.chapter}`,
      type: "Diagnostik",
      q: `Vilka fyra mönster ska differentieras i kapitel ${item.chapter} om ${item.title}?`,
      a: item.patterns.join(", "),
    }),
  );
  DATA.points.forEach((item) =>
    cards.push({
      id: `point:${item.id}`,
      type: "Punkt",
      q: `Vilken meridian tillhör ${item.id}${item.name ? ` (${item.name})` : ""}, och vilken säkerhetskontroll krävs före nålning?`,
      a: `${item.id}${item.name ? ` (${item.name})` : ""} tillhör ${item.channel}-meridianen. Region, landmärke, riskstrukturer, nålriktning och djup ska verifieras i atlas och med handledare.`,
    }),
  );
  DATA.herbs.forEach((item) =>
    cards.push({
      id: `herb:${item.pinyin}`,
      type: "Ört",
      q: `Förklara när ${item.pinyin} kan övervägas traditionellt och nämn en säkerhetsfråga.`,
      a: `Kategori: ${item.category}. Mönster: ${item.pattern}. Säkerhet: ${item.safety}.`,
    }),
  );
  DATA.formulas.forEach((item) =>
    cards.push({
      id: `formula:${item.name}`,
      type: "Formel",
      q: `Vilket mönster och vilken princip ligger bakom ${item.name}?`,
      a: `Mönster: ${item.pattern}. Kategori/princip: ${item.category}.`,
    }),
  );

  return cards;
}

const CARDS = allCards();
const STUDY_CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const STUDY_TOPICS = ["all", "condition", "point", "herb", "formula"];
const STUDY_LENGTHS = [5, 10, 15];
let currentCard = null;
let studySession = restoreStudySession(state.studySession);

function restoreStudySession(session) {
  if (!session || !STUDY_TOPICS.includes(session.topic) || !STUDY_LENGTHS.includes(session.length)) {
    return null;
  }

  const { topic, length, queue, grades } = session;
  if (!Array.isArray(queue) || queue.length > length || new Set(queue).size !== queue.length ||
      queue.some((id) => !STUDY_CARD_BY_ID.has(id) || (topic !== "all" && !id.startsWith(topic + ":"))) ||
      !Array.isArray(grades) || grades.length > queue.length ||
      grades.some((gradeValue) => ![0, 1, 2].includes(gradeValue))) {
    return null;
  }

  return {
    topic, length, queue, grades,
    mode: session.mode === "weak" ? "weak" : "regular",
    draft: typeof session.draft === "string" ? session.draft : "",
    hintUsed: session.hintUsed === true,
    readyToGrade: session.readyToGrade === true || session.hintUsed === true,
    feedback: typeof session.feedback === "string" ? session.feedback : "",
    startedAt: finiteNumber(session.startedAt) || Date.now(),
  };
}

function studyCardsFor(topic) {
  return topic === "all" ? CARDS : CARDS.filter((card) => card.id.startsWith(topic + ":"));
}

function studyQueues(cards) {
  const now = Date.now();
  const fresh = [];
  const due = [];
  const later = [];

  for (const card of cards) {
    const review = state.cards[card.id];
    if (!finiteNumber(review?.reviews)) fresh.push(card);
    else if (finiteNumber(review.due) <= now) due.push(card);
    else later.push(card);
  }

  const byDue = (left, right) =>
    finiteNumber(state.cards[left.id]?.due) - finiteNumber(state.cards[right.id]?.due);
  return { fresh, due: due.sort(byDue), later: later.sort(byDue) };
}

function weakStudyCards(cards) {
  const lastGrade = (card) => state.cards[card.id]?.lastGrade;
  const lapses = (card) => finiteNumber(state.cards[card.id]?.lapses);
  return cards
    .filter((card) => finiteNumber(state.cards[card.id]?.reviews) && [0, 1].includes(lastGrade(card)))
    .sort((left, right) => lastGrade(left) - lastGrade(right) || lapses(right) - lapses(left));
}

function studyQueue(topic, length, mode) {
  const cards = studyCardsFor(topic);
  if (mode === "weak") return weakStudyCards(cards).slice(0, length).map((card) => card.id);
  const { due, fresh } = studyQueues(cards);
  const selected = due.slice(0, length);
  while (selected.length < length && fresh.length) {
    const index = Math.floor(Math.random() * fresh.length);
    selected.push(fresh.splice(index, 1)[0]);
  }
  return selected.map((card) => card.id);
}

function studyOverview() {
  const { due, fresh } = studyQueues(CARDS);
  const completed = studySession?.grades.length ?? 0;
  const total = studySession?.queue.length ?? 0;
  return {
    started: CARDS.length - fresh.length,
    due: due.length,
    weak: weakStudyCards(CARDS).length,
    inProgress: completed < total &&
      (completed > 0 || Boolean(studySession.draft.trim()) || studySession.readyToGrade),
    completed,
    total,
  };
}

function updateStudySetup() {
  const cards = studyCardsFor($("#studyTopic").value);
  const weak = $("#studyMode").value === "weak";
  const weakCount = weak ? weakStudyCards(cards).length : 0;
  $("#studySetup button").disabled = weak && !weakCount;
  if (weak) {
    $("#studyQueueInfo").textContent = weakCount
      ? `${weakCount} kort som du bedömde som delvis rätt eller behöver träna mer på.`
      : "Ännu inga sådana kort i ämnet. Välj repetitioner och nya kort för att göra en första bedömning.";
    return;
  }
  const selected = studyQueues(cards);
  $("#studyQueueInfo").textContent = selected.due.length
    ? `${selected.due.length} kort redo att repetera. De kommer först.`
    : `${selected.fresh.length} nya kort i ämnet.`;
}

function updateStudyMeta() {
  const { started, due } = studyOverview();
  $("#studyMeta").textContent =
    `Påbörjat ${started} av ${CARDS.length} kort · ${due} att repetera i dag`;
  updateStudySetup();
}

function startStudy(topic = "all", length = 5, mode = "regular") {
  if (!STUDY_TOPICS.includes(topic)) topic = "all";
  studySession = {
    topic, length, mode, queue: studyQueue(topic, length, mode), grades: [],
    draft: "", hintUsed: false, readyToGrade: false, feedback: "", startedAt: Date.now(),
  };
  saveStudySession();
  newStudy(true);
}

function saveStudySession() {
  state.studySession = studySession;
  save();
}

function renderStudySummary() {
  const { grades, topic, mode } = studySession;
  const cards = studyCardsFor(topic);
  const { due, fresh, later } = studyQueues(cards);
  const weakCount = weakStudyCards(cards).length;
  const trainingCount = grades.filter((value) => value === 0).length;
  const unsureCount = grades.filter((value) => value === 1).length;
  const confidentCount = grades.filter((value) => value === 2).length;
  $("#studySummaryTitle").textContent = grades.length ? "Passet är klart" : "Du är i fas";
  if (grades.length) {
    $("#studySummaryStats").textContent =
      `${grades.length} bedömda kort. ${confidentCount} kan du förklara, ${unsureCount} är du osäker på och ${trainingCount} behöver du träna mer på.`;
  } else {
    const date = later[0] && new Date(Number(state.cards[later[0].id].due));
    $("#studySummaryStats").textContent = date && Number.isFinite(date.getTime())
      ? `Nästa repetition blir tillgänglig ${date.toLocaleString("sv-SE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`
      : "Det finns inga kort redo i det här ämnet. Välj ett annat ämne för att fortsätta.";
  }
  $("#studyAgain").hidden = mode === "weak" ? !weakCount : !due.length && !fresh.length;
  $("#studyWeak").hidden = mode === "weak" || !weakCount;
  $("#studyWeak").textContent = `Träna svåra kort (${weakCount})`;
  $("#studySummary").classList.remove("hidden");
  $("#studyCard").classList.add("hidden");
  $("#studySummary").focus();
}

function newStudy(focusQuestion = false) {
  if (!studySession) {
    startStudy();
    return;
  }

  const { queue, grades } = studySession;
  currentCard = STUDY_CARD_BY_ID.get(queue[grades.length]) ?? null;
  $("#studyTopic").value = studySession.topic;
  $("#studyLength").value = String(studySession.length);
  $("#studyMode").value = studySession.mode;
  updateStudyMeta();
  const feedback = $("#studyFeedback");
  feedback.textContent = studySession.feedback;
  feedback.hidden = !studySession.feedback;
  if (!currentCard) {
    renderStudySummary();
    return;
  }

  $("#studySummary").classList.add("hidden");
  $("#studyCard").classList.remove("hidden");
  $("#studyBadge").textContent = currentCard.type;
  $("#studyQ").textContent = currentCard.q;
  $("#studyA").textContent = currentCard.a;
  renderStudyStage();
  $("#studyText").value = studySession.draft;
  $("#studyPosition").textContent = `Kort ${grades.length + 1} av ${queue.length}`;
  $("#studyProgress").max = queue.length;
  $("#studyProgress").value = grades.length;
  if (focusQuestion) $("#studyQ").focus();
}

function renderStudyStage() {
  const ready = studySession.readyToGrade;
  $("#studyRecallActions").classList.toggle("hidden", ready);
  $("#studyAssessment").classList.toggle("hidden", !ready);
  $("#studyA").classList.toggle("hidden", !ready);
}

function revealStudyAnswer(hintUsed) {
  if (!currentCard || studySession.readyToGrade) return;
  studySession.hintUsed = hintUsed;
  studySession.readyToGrade = true;
  saveStudySession();
  renderStudyStage();
  $("#studyGuidanceTitle").focus();
}

$("#studyCheck").addEventListener("click", () => revealStudyAnswer(false));
$("#studyText").addEventListener("input", (event) => {
  if (!currentCard) return;
  studySession.draft = event.target.value;
  saveStudySession();
});

$("#studyTopic").addEventListener("change", updateStudySetup);
$("#studyMode").addEventListener("change", updateStudySetup);
$("#studySetup").addEventListener("submit", (event) => {
  event.preventDefault();
  const length = Number($("#studyLength").value);
  if ($("#studySetup button").disabled) return;
  startStudy($("#studyTopic").value, STUDY_LENGTHS.includes(length) ? length : 5, $("#studyMode").value);
  $("#studySettings").open = false;
});

$("#studyAgain").addEventListener("click", () => {
  const { topic, length, mode } = studySession;
  startStudy(topic, length, mode);
});
$("#studyWeak").addEventListener("click", () => startStudy(studySession.topic, studySession.length, "weak"));
$("#studyChange").addEventListener("click", () => {
  $("#studySettings").open = true;
  $("#studyTopic").focus();
});

function showStudyAnswer() {
  revealStudyAnswer(true);
}

function formatInterval(days) {
  if (days < 0.05) return "10 minuter";
  if (days < 1.5) return "1 dag";
  return `${Math.round(days)} dagar`;
}

function grade(gradeValue) {
  if (!currentCard || ![0, 1, 2].includes(gradeValue)) return;

  const previous = state.cards[currentCard.id] || {
    reviews: 0,
    intervalDays: 0,
    lapses: 0,
  };
  const oldInterval = finiteNumber(previous.intervalDays);
  const { hintUsed, startedAt } = studySession;
  let intervalDays;

  if (gradeValue === 0) intervalDays = 10 / (24 * 60);
  else if (gradeValue === 1) intervalDays = oldInterval ? Math.max(1, oldInterval * 1.25) : 1;
  else if (hintUsed) intervalDays = oldInterval ? Math.max(1, oldInterval * 1.6) : 1;
  else intervalDays = oldInterval ? Math.max(3, oldInterval * 2.3) : 3;

  state.attempts += 1;
  state.reviews += 1;
  if (gradeValue === 2 && !hintUsed) state.correct += 1;
  state.cards[currentCard.id] = {
    reviews: finiteNumber(previous.reviews) + 1,
    intervalDays,
    due: Date.now() + intervalDays * 24 * 60 * 60 * 1000,
    lastGrade: gradeValue,
    lastResponseSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    usedHint: hintUsed,
    lapses: finiteNumber(previous.lapses) + (gradeValue === 0 ? 1 : 0),
  };
  studySession.grades.push(gradeValue);
  studySession.draft = "";
  studySession.hintUsed = false;
  studySession.readyToGrade = false;
  studySession.startedAt = Date.now();
  studySession.feedback = `Senaste kortet är bedömt. Nästa repetition om ${formatInterval(intervalDays)}.`;
  saveStudySession();
  newStudy(true);
}

function speakText(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    showToast("Taluppläsning stöds inte av den här webbläsaren.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "sv-SE";
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function speakQuestion() {
  speakText($("#studyQ")?.textContent || "");
}

const cases = [
  {
    title: "Trötthet med matsmältningsbesvär",
    intro: "Trötthet efter mat, låg aptit och lösa avföringar.",
    patterns: ["Mjälte-Qi-brist", "Fukt som hindrar mitten", "Lever-Qi invaderar Mjälten"],
  },
  {
    title: "Återkommande huvudvärk",
    intro: "Huvudvärk med varierande plats och tydliga triggers.",
    patterns: ["Lever-Yang stiger", "Blod-brist", "Blodstas", "Slem-Fukt"],
  },
  {
    title: "Sömnbesvär och oro",
    intro: "Svårt att somna, många tankar och hjärtklappningskänsla.",
    patterns: ["Hjärta-Blod-brist", "Hjärta-Yin-brist", "Slem-Hetta", "Hjärta–Njure disharmoni"],
  },
  {
    title: "Hosta med slem",
    intro: "Hosta där färg, mängd och konsistens på slemmet varierar.",
    patterns: ["Vind-Kyla", "Vind-Hetta", "Fukt-Slem", "Slem-Hetta", "Lung-Yin-brist"],
  },
  {
    title: "Ländryggssmärta",
    intro: "Smärta som påverkas av rörelse, kyla och trötthet.",
    patterns: ["Kyla-Fukt", "Blodstas", "Njure-Yang-brist", "Njure-Yin-brist"],
  },
];

const caseQuestions = [
  "Debut och förlopp",
  "Förvärrande/lindrande faktorer",
  "Tunga och puls",
  "Aptit, avföring, urin och törst",
  "Sömn, stress och läkemedel",
];

const caseStepLabels = ["Säkerhet", "Frågor", "Mönster", "Mekanism", "Princip", "Val", "Uppföljning"];

function randomCaseIndex(exclude = -1) {
  let index = Math.floor(Math.random() * cases.length);
  if (cases.length > 1 && index === exclude) index = (index + 1) % cases.length;
  return index;
}

function createCaseSession(caseIndex = randomCaseIndex()) {
  return {
    caseIndex,
    step: 0,
    unlocked: 0,
    questions: [],
    patterns: [],
    drafts: {},
  };
}

function normalizeCaseSession(session) {
  if (!session || !Number.isInteger(session.caseIndex) || !cases[session.caseIndex]) {
    return createCaseSession();
  }

  const questions = Array.isArray(session.questions)
    ? [
        ...new Set(
          session.questions.filter(
            (value) => Number.isInteger(value) && caseQuestions[value],
          ),
        ),
      ]
    : [];
  const patterns = Array.isArray(session.patterns)
    ? [
        ...new Set(
          session.patterns.filter(
            (value) => Number.isInteger(value) && cases[session.caseIndex].patterns[value],
          ),
        ),
      ]
    : [];
  const storedDrafts =
    session.drafts && typeof session.drafts === "object" && !Array.isArray(session.drafts)
      ? session.drafts
      : {};
  const drafts = {};

  for (let step = 0; step <= 6; step += 1) {
    if (typeof storedDrafts[String(step)] === "string") {
      drafts[String(step)] = storedDrafts[String(step)];
    }
  }

  const lastStep = caseStepLabels.length - 1;
  const step = Math.min(lastStep, Math.max(0, Math.trunc(Number(session.step) || 0)));
  const unlocked = Math.min(lastStep, Math.max(step, Math.trunc(Number(session.unlocked) || 0)));

  return {
    caseIndex: session.caseIndex,
    step,
    unlocked,
    questions,
    patterns,
    drafts,
  };
}

state.caseSession = normalizeCaseSession(state.caseSession);
const savedCaseDrafts = state.caseDrafts;
state.caseDrafts = {};

for (const [index, draft] of Object.entries(savedCaseDrafts || {})) {
  if (draft?.caseIndex === Number(index) && cases[draft.caseIndex]) {
    state.caseDrafts[index] = normalizeCaseSession(draft);
  }
}

state.caseHistory = Array.isArray(state.caseHistory)
  ? state.caseHistory
      .filter((record) => Number.isInteger(record?.caseIndex) && cases[record.caseIndex])
      .map((record) => ({
        ...normalizeCaseSession(record),
        completedAt: finiteNumber(record.completedAt),
      }))
  : [];

const caseDate = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
let caseRecapTrigger = null;

function formatCaseDate(timestamp) {
  const date = new Date(timestamp);
  return timestamp && Number.isFinite(date.getTime()) ? caseDate.format(date) : "";
}

function renderCaseHistory() {
  const historyPanel = $("#caseHistory");
  const historyList = $("#caseHistoryList");
  if (!historyPanel || !historyList) return;

  historyPanel.hidden = state.caseHistory.length === 0;
  $("#caseHistoryCount").textContent = String(state.caseHistory.length);
  historyList.replaceChildren();
  const latestFirst = [...state.caseHistory].reverse();
  latestFirst.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "case-choice";
    const title = document.createElement("b");
    title.textContent = cases[record.caseIndex].title;
    const caption = document.createElement("span");
    const date = formatCaseDate(record.completedAt);
    caption.textContent = date ? `Visa svar · ${date}` : "Visa svar";
    button.append(title, caption);
    button.addEventListener("click", () => openCaseRecap(record, button));
    historyList.append(button);
  });
}

function openCaseRecap(record, trigger = null) {
  const dialog = $("#caseRecap");
  if (!dialog) return;

  caseRecapTrigger = trigger;
  const item = cases[record.caseIndex];
  $("#caseRecapTitle").textContent = item.title;
  const date = formatCaseDate(record.completedAt);
  $("#caseRecapDate").textContent = date ? `Slutfört ${date}` : "Slutfört fall";
  const list = $("#caseRecapSteps");
  list.replaceChildren();

  caseStepLabels.forEach((label, step) => {
    const selected = step === 1
      ? record.questions.map((index) => caseQuestions[index])
      : step === 2
        ? record.patterns.map((index) => item.patterns[index])
        : [];
    const draft = record.drafts[step]?.trim();
    if (!selected.length && !draft) return;

    const group = document.createElement("details");
    group.open = true;
    const heading = document.createElement("summary");
    heading.textContent = label;
    group.append(heading);
    if (selected.length) {
      const choices = document.createElement("ul");
      selected.forEach((choice) => {
        const listItem = document.createElement("li");
        listItem.textContent = choice;
        choices.append(listItem);
      });
      group.append(choices);
    }
    if (draft) {
      const response = document.createElement("p");
      response.textContent = draft;
      group.append(response);
    }
    list.append(group);
  });

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function restoreCaseRecapFocus() {
  if (caseRecapTrigger?.isConnected) caseRecapTrigger.focus();
  else focusCaseStep();
  caseRecapTrigger = null;
}

$("#caseRecapClose")?.addEventListener("click", () => {
  const dialog = $("#caseRecap");
  if (typeof dialog.close === "function") dialog.close();
  else {
    dialog.removeAttribute("open");
    restoreCaseRecapFocus();
  }
});

$("#caseRecap")?.addEventListener("close", restoreCaseRecapFocus);

function caseIsStarted(session) {
  return Boolean(
    session && (session.step > 0 || Object.values(session.drafts).some((draft) => draft.trim())),
  );
}

function getCaseResume() {
  const active = state.caseSession;
  if (!caseIsStarted(active)) return null;
  return { title: cases[active.caseIndex].title, step: active.step + 1, total: caseStepLabels.length };
}

function renderCaseChooser() {
  const choices = $("#caseChoices");
  if (!choices) return;

  const active = state.caseSession;
  const drafts = cases.map((_, index) =>
    index === active.caseIndex ? active : state.caseDrafts[index],
  );
  const draftCount = drafts.filter(caseIsStarted).length;
  $("#caseDraftCount").textContent = draftCount ? `${draftCount} pågående` : "";
  choices.innerHTML = cases
    .map((item, index) => {
      const selected = index === active.caseIndex;
      const draft = drafts[index];
      const progress = caseIsStarted(draft) ? `Steg ${draft.step + 1} av ${caseStepLabels.length}` : "Starta fall";
      return `<button type="button" class="case-choice" data-case-index="${index}" aria-pressed="${selected}"><b>${item.title}</b><span>${selected ? "Valt fall" : progress}</span></button>`;
    })
    .join("");
  choices.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectCase(Number(button.dataset.caseIndex)));
  });
}

function selectCase(index) {
  if (!cases[index]) return;

  const previous = state.caseSession;
  if (previous.caseIndex !== index) {
    if (caseIsStarted(previous)) state.caseDrafts[previous.caseIndex] = previous;
    state.caseSession = state.caseDrafts[index] || createCaseSession(index);
    delete state.caseDrafts[index];
    save();
  }

  const picker = $(".case-picker");
  if (picker) picker.open = false;
  renderCase();
  focusCaseStep();
}

function focusCaseStep() {
  const heading = $("#caseContent h2");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus();
}

function renderCaseProgress() {
  const session = state.caseSession;
  const label = $("#caseStepLabel");
  const progress = $("#caseProgress");
  const steps = $("#caseSteps");
  if (!steps || !label || !progress) return;

  label.textContent = `Steg ${session.step + 1} av ${caseStepLabels.length} · ${caseStepLabels[session.step]}`;
  progress.max = caseStepLabels.length;
  progress.value = session.unlocked;
  steps.innerHTML = caseStepLabels
    .map((name, index) => {
      const current = index === session.step;
      const locked = index > session.unlocked;
      const completed = index < session.unlocked;
      const status = completed ? ", avklarat" : locked ? ", låst" : "";
      return `<button type="button" class="case-step" data-step="${index}" ${current ? 'aria-current="step"' : ""} ${locked ? "disabled" : ""} aria-label="Steg ${index + 1}: ${name}${status}"><span aria-hidden="true">${completed && !current ? "✓" : index + 1}</span><b>${name}</b></button>`;
    })
    .join("");
  steps.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => openCaseStep(Number(button.dataset.step)));
  });
}

function invalidateLaterCaseSteps() {
  const session = state.caseSession;
  if (session.unlocked <= session.step) return;
  session.unlocked = session.step;
  renderCaseProgress();
}

function saveCaseDraft(step, value) {
  invalidateLaterCaseSteps();
  state.caseSession.drafts[String(step)] = value;
  save();
}

function toggleCaseOption(kind, index, button) {
  invalidateLaterCaseSteps();
  const selected = new Set(state.caseSession[kind]);
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  state.caseSession[kind] = [...selected].sort((a, b) => a - b);
  button.classList.toggle("sel", selected.has(index));
  button.setAttribute("aria-pressed", String(selected.has(index)));
  save();
}

function caseError(message) {
  const element = $("#caseError");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
}

function caseNext(ok, message) {
  if (!ok) {
    caseError(message || "Utveckla resonemanget mer innan du går vidare.");
    return;
  }

  const session = state.caseSession;
  const next = Math.min(caseStepLabels.length - 1, session.step + 1);
  session.unlocked = Math.max(next, session.unlocked);
  openCaseStep(next);
}

function openCaseStep(step) {
  if (!Number.isInteger(step) || step < 0 || step > state.caseSession.unlocked) return;
  state.caseSession.step = step;
  save();
  renderCase();
  focusCaseStep();
}

function casePrevious() {
  openCaseStep(Math.max(0, state.caseSession.step - 1));
}

function renderCase() {
  const session = state.caseSession;
  const caseItem = cases[session.caseIndex];
  const step = session.step;
  const title = $("#caseTitle");
  const content = $("#caseContent");
  if (!title || !content) return;

  title.textContent = caseItem.title;
  renderCaseChooser();
  renderCaseProgress();
  renderCaseHistory();

  if (step === 0) {
    content.innerHTML = `<span class="eyebrow">Säkerhet före teori</span><h2>${caseItem.intro}</h2><p>Beskriv vilka rödflaggor, läkemedel, graviditetsfrågor eller biomedicinska differentialer som måste kontrolleras.</p><textarea id="caseText" aria-label="Säkerhetsresonemang" oninput="saveCaseDraft(0,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext($('#caseText').value.trim().length>50,'Skriv minst ett par meningar om säkerhet och relevanta rödflaggor.')">Fortsätt</button>`;
  }

  if (step === 1) {
    content.innerHTML = `<h2>Välj frågor med hög informationsvinst</h2>${caseQuestions.map((question, index) => `<button type="button" class="option ${session.questions.includes(index) ? "sel" : ""}" aria-pressed="${session.questions.includes(index)}" onclick="toggleCaseOption('questions',${index},this)">${question}</button>`).join("")}<p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext(state.caseSession.questions.length>=4,'Välj minst fyra frågor innan du går vidare.')">Fortsätt till mönster</button>`;
  }

  if (step === 2) {
    content.innerHTML = `<h2>Differentiera mönster</h2><p class="answer">${caseItem.intro}</p><h3>Valda bedömningsområden</h3><div class="chips">${session.questions.map((index) => `<span class="chip">${caseQuestions[index]}</span>`).join("")}</div>${caseItem.patterns.map((pattern, index) => `<button type="button" class="option ${session.patterns.includes(index) ? "sel" : ""}" aria-pressed="${session.patterns.includes(index)}" onclick="toggleCaseOption('patterns',${index},this)">${pattern}</button>`).join("")}<textarea id="caseText" aria-label="Differentialdiagnostiskt resonemang" placeholder="Ange fynd för, fynd emot och saknad information…" oninput="saveCaseDraft(2,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext(state.caseSession.patterns.length>0 && $('#caseText').value.trim().length>100,'Välj minst ett mönster och utveckla fynd för, fynd emot och saknad information.')">Fortsätt</button>`;
  }

  if (step === 3) {
    content.innerHTML = `<h2>Bygg sjukdomsmekanismen</h2><textarea id="caseText" aria-label="Sjukdomsmekanism" placeholder="Orsak → funktionsstörning → följd → symtom. Minst fyra länkar." oninput="saveCaseDraft(3,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext($('#caseText').value.trim().length>120,'Beskriv minst fyra tydliga länkar i mekanismen.')">Fortsätt</button>`;
  }

  if (step === 4) {
    content.innerHTML = `<h2>Formulera behandlingsprincip</h2><p>Skriv vad som ska åstadkommas utan att nämna punkter, örter eller formler.</p><textarea id="caseText" aria-label="Behandlingsprincip" oninput="saveCaseDraft(4,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext($('#caseText').value.trim().length>70,'Utveckla principen utan att hoppa direkt till behandlingsverktyg.')">Lås upp val</button>`;
  }

  if (step === 5) {
    content.innerHTML = `<h2>Välj verktyg och försvara</h2><p>Använd punkt-, ört- och formelbiblioteken. Ange varför varje val följer principen och vilken säkerhetskontroll som krävs.</p><textarea id="caseText" aria-label="Val av behandlingsverktyg" oninput="saveCaseDraft(5,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext($('#caseText').value.trim().length>120,'Motivera varje val och ange minst en relevant säkerhetskontroll.')">Uppföljning</button>`;
  }

  if (step === 6) {
    content.innerHTML = `<h2>Stäng loopen</h2><div class="facts"><div class="fact"><small>Effekt</small>Vilka symtom och funktioner ska förändras?</div><div class="fact"><small>Säkerhet</small>Vilka biverkningar och interaktioner följs?</div><div class="fact"><small>Hypotes</small>Vad skulle falsifiera ditt mönster?</div><div class="fact"><small>Beslut</small>När avslutas, ändras eller hänvisas?</div></div><textarea id="caseText" aria-label="Plan för uppföljning" placeholder="Beskriv effektmått, säkerhet, omvärdering och beslut…" oninput="saveCaseDraft(6,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="finishCase()">Slutför och visa dina svar</button>`;
  }

  const textarea = $("#caseText");
  if (textarea) textarea.value = session.drafts[String(step)] || "";

  if (step > 0) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "ghost case-back";
    backButton.textContent = "Föregående steg";
    backButton.addEventListener("click", casePrevious);
    content.append(backButton);
  }
}

function finishCase() {
  const followUp = $("#caseText")?.value.trim() || "";
  if (followUp.length <= 80) {
    caseError("Beskriv hur effekt, säkerhet och hypotes ska följas upp innan fallet slutförs.");
    return;
  }

  const completed = {
    ...state.caseSession,
    drafts: { ...state.caseSession.drafts, 6: followUp },
    completedAt: Date.now(),
  };
  const previousIndex = completed.caseIndex;
  state.casesCompleted += 1;
  state.caseHistory.push(completed);
  const next = randomCaseIndex(previousIndex);
  state.caseSession = state.caseDrafts[next] || createCaseSession(next);
  delete state.caseDrafts[next];
  save();
  renderCase();
  openCaseRecap(completed);
}

const masterQuestions = [
  "Förklara skillnaden mellan att känna igen ett mönsternamn och att faktiskt ha differentierat mönstret.",
  "Välj två närliggande Qi-tonika. Vilket fynd gör att du väljer den ena framför den andra?",
  "Välj en formel och förklara kejsare, minister, assistent och budbärare utan att bara rabbla ingredienser.",
  "Vilka fynd skulle få dig att överge din första TCM-hypotes i ett patientfall?",
  "Hur skiljer du traditionell indikation, innehåll i kursbok, modern evidens och klinisk säkerhet?",
  "Beskriv hur ett enda symtom kan uppstå ur minst tre olika sjukdomsmekanismer.",
  "Välj tre punkter i samma anatomiska region och förklara hur du undviker sammanblandning och säkerhetsrisk.",
];

const masterTopics = [
  "Att differentiera mönster", "Två Qi-tonika", "Roller i en formel",
  "När hypotesen behöver omprövas", "Källor och evidens",
  "Ett symtom, flera mekanismer", "Punkter i samma region",
];

const masterCriteria = [
  "Tydligt påstående", "Fynd som talar för", "Fynd som talar emot",
  "Alternativ hypotes", "Säkerhetsaspekter", "Vad som skulle ändra beslutet",
];

const MASTER_STORAGE_KEY = "mastery-oral-v1";
let masterIndex = Math.min(
  masterQuestions.length - 1,
  Math.max(0, Number(state.masterIndex) || 0),
);
const masterResponses = loadMasterResponses();
let masterStorageAvailable = true;

function loadMasterResponses() {
  try {
    const stored = JSON.parse(localStorage.getItem(MASTER_STORAGE_KEY) || "{}");
    return masterQuestions.map((_, index) => {
      const response = stored?.[index];
      return {
        text: typeof response?.text === "string" ? response.text : "",
        criteria: masterCriteria.map((_, criterion) => response?.criteria?.[criterion] === true),
      };
    });
  } catch (error) {
    return masterQuestions.map(() => ({ text: "", criteria: masterCriteria.map(() => false) }));
  }
}

function renderMasterQuestionChoices() {
  $("#masterSelect").replaceChildren(
    ...masterTopics.map((topic, index) => {
      const response = masterResponses[index];
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = response.text.trim() || response.criteria.some(Boolean)
        ? `${topic} · sparat arbete`
        : topic;
      return option;
    }),
  );
  $("#masterSelect").value = String(masterIndex);
}

function renderMasterProgress() {
  const response = masterResponses[masterIndex];
  const count = response.criteria.filter(Boolean).length;
  const hasResponse = response.text.trim() || count;
  $("#masterCriteriaProgress").value = count;
  $("#masterCriteriaCount").textContent = `${count} av ${masterCriteria.length} delar avprickade`;
  $("#masterStatus").textContent = hasResponse
    ? masterStorageAvailable ? "Sparat på den här enheten" : "Sparat för den här fliken"
    : "";
  const select = $("#masterSelect");
  const topic = masterTopics[masterIndex];
  select.options[masterIndex].textContent = hasResponse ? `${topic} · sparat arbete` : topic;
}

function renderMaster() {
  const question = $("#masterQ");
  if (!question) return;

  const response = masterResponses[masterIndex];
  renderMasterQuestionChoices();
  $("#masterPosition").textContent = `Fråga ${masterIndex + 1} av ${masterQuestions.length}`;
  question.textContent = masterQuestions[masterIndex];
  $("#masterText").value = response.text;
  $("#masterHint").innerHTML = masterCriteria.map((criterion, index) => `
    <li>
      <label>
        <input type="checkbox" data-master-criterion="${index}" ${response.criteria[index] ? "checked" : ""} onchange="saveMasterResponse()">
        <span>${criterion}</span>
      </label>
    </li>`).join("");
  renderMasterProgress();
}

function saveMasterResponse() {
  masterResponses[masterIndex] = {
    text: $("#masterText").value,
    criteria: $$("[data-master-criterion]").map((input) => input.checked),
  };
  try {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(masterResponses));
    masterStorageAvailable = true;
  } catch (error) {
    masterStorageAvailable = false;
  }
  renderMasterProgress();
}

function selectMaster(value, focusQuestion = false) {
  const index = Number(value);
  if (!Number.isInteger(index) || !masterQuestions[index]) return;
  if (masterIndex !== index) resetMasterTimer();
  masterIndex = index;
  state.masterIndex = index;
  save();
  renderMaster();
  if (focusQuestion) $("#masterQ").focus();
}

function nextMaster(direction = 1) {
  const index = (masterIndex + direction + masterQuestions.length) % masterQuestions.length;
  selectMaster(index, true);
}

const masterTimerLengths = [60, 120];
let masterTimerDuration = masterTimerLengths[0];
let masterTimerRemaining = masterTimerDuration * 1000;
let masterTimerDeadline = null;
let masterTimerInterval;
let masterTimerPhase = "ready";

function drawMasterClock() {
  const clock = $("#masterClock");
  if (!clock) return;

  const remaining = masterTimerDeadline === null
    ? masterTimerRemaining
    : Math.max(0, masterTimerDeadline - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const value = `${minutes}:${seconds}`;
  if (clock.textContent !== value) clock.textContent = value;

  if (remaining === 0 && masterTimerPhase === "running") {
    completeMasterTimer();
  }
}

function renderMasterTimer(message = "") {
  const button = $("#masterTimerToggle");
  if (!button) return;
  const labels = {
    ready: "Starta timer",
    running: "Pausa",
    paused: "Fortsätt",
    finished: "Öva igen",
  };

  button.textContent = labels[masterTimerPhase];
  $("#masterTimerReset").disabled = masterTimerPhase === "ready";
  $("#masterDuration").disabled = ["running", "paused"].includes(masterTimerPhase);
  $("#masterTimerStatus").textContent = message;
  drawMasterClock();
}

function stopMasterTimerClock() {
  clearInterval(masterTimerInterval);
  masterTimerDeadline = null;
}

function resetMasterTimer() {
  stopMasterTimerClock();
  masterTimerRemaining = masterTimerDuration * 1000;
  masterTimerPhase = "ready";
  renderMasterTimer();
}

function completeMasterTimer() {
  stopMasterTimerClock();
  masterTimerRemaining = 0;
  masterTimerPhase = "finished";
  renderMasterTimer("Tiden är ute. Bocka av det du tog upp i ditt svar.");
}

function pauseMasterTimer() {
  if (masterTimerPhase !== "running") return;
  masterTimerRemaining = Math.max(0, masterTimerDeadline - Date.now());
  if (masterTimerRemaining === 0) {
    completeMasterTimer();
    return;
  }

  stopMasterTimerClock();
  masterTimerPhase = "paused";
  renderMasterTimer("Timern är pausad.");
}

function toggleMasterTimer() {
  if (masterTimerPhase === "running") {
    pauseMasterTimer();
    return;
  }

  if (masterTimerPhase === "finished") resetMasterTimer();
  masterTimerDeadline = Date.now() + masterTimerRemaining;
  masterTimerPhase = "running";
  masterTimerInterval = setInterval(drawMasterClock, 250);
  renderMasterTimer("Timern är igång.");
}

function setMasterDuration(value) {
  const duration = Number(value);
  if (!masterTimerLengths.includes(duration)) return;
  masterTimerDuration = duration;
  resetMasterTimer();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseMasterTimer();
});

function speakMaster() {
  speakText($("#masterQ")?.textContent || "");
}

initChannels();
syncInstallButton();
routeFromHash();

setupOfflineApp();
