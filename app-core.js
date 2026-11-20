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

function isStandaloneApp() {
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return displayModeStandalone || navigator.standalone === true;
}

function syncInstallButton() {
  const button = $("#installButton");
  if (button) button.hidden = isStandaloneApp();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = $("#installButton");
  if (button) button.textContent = "Installera";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = $("#installButton");
  if (button) button.hidden = true;
  showToast("Appen är installerad och kan öppnas från hemskärmen.");
});

async function installHelp() {
  if (isStandaloneApp()) {
    showToast("Appen är redan installerad och körs från hemskärmen.");
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === "accepted") showToast("Installationen har startat.");
    deferredInstallPrompt = null;
    return;
  }

  const isiOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isiOS) {
    showToast("På iPhone eller iPad: tryck Dela i Safari och välj Lägg till på hemskärmen.");
  } else {
    showToast("Öppna webbläsarens meny och välj Installera app eller Lägg till på startskärmen.");
  }
}

let selectedCondition = 0;

function filteredConditions() {
  const query = normalizeSearch($("#conditionSearch")?.value);
  return DATA.conditions.filter((item) =>
    containsSearch(query, item.title, item.english, item.patterns),
  );
}

function renderConditions() {
  const list = $("#conditionList");
  const detail = $("#conditionDetail");
  if (!list || !detail) return;

  const matches = filteredConditions();
  if (!matches.length) {
    list.innerHTML = emptyState("Inga kapitel hittades", "Prova ett annat ord eller mönsternamn.");
    detail.innerHTML = emptyState("Ingen träff att visa", "Ändra sökningen för att öppna ett kapitel.");
    return;
  }

  if (!matches.some((item) => item.chapter - 1 === selectedCondition)) {
    selectedCondition = matches[0].chapter - 1;
  }

  list.innerHTML = matches
    .map(
      (item) =>
        `<button type="button" class="item ${item.chapter - 1 === selectedCondition ? "selected" : ""}" onclick="selectCondition(${item.chapter - 1})"><b>Kapitel ${item.chapter} · ${item.title}</b><small>${item.english} · ${item.patterns.slice(0, 2).join(" / ")}</small></button>`,
    )
    .join("");
  renderConditionDetail();
}

function selectCondition(index) {
  selectedCondition = index;
  renderConditions();
}

function renderConditionDetail() {
  const detail = $("#conditionDetail");
  const item = DATA.conditions[selectedCondition];
  if (!detail || !item) return;

  detail.innerHTML = `<span class="badge">Kapitel ${item.chapter}</span><h2>${item.title}</h2><p class="muted">${item.english}</p><h3>Mönster att differentiera</h3><div class="chips">${item.patterns.map((pattern) => `<span class="chip">${pattern}</span>`).join("")}</div><div class="facts"><div class="fact"><small>Frågor med hög informationsvinst</small>• Debut och tidsförlopp<br>• Förvärrande och lindrande faktorer<br>• Energi, sömn och aptit<br>• Avföring, urin och törst<br>• Smärtans plats och karaktär<br>• Läkemedel, graviditet och rödflaggor</div><div class="fact"><small>Obligatorisk arbetsgång</small>1. Säkerhet och biomedicinsk differential<br>2. Samla huvud- och följdsymtom<br>3. Bedöm tunga och puls i sitt sammanhang<br>4. Väg fynd för och emot varje mönster<br>5. Formulera mekanism<br>6. Formulera behandlingsprincip<br>7. Välj verktyg och följ upp</div><div class="fact"><small>Tunga och puls</small>Dokumentera observationen först. Tolka först därefter och ange vad som talar emot din hypotes.</div><div class="fact"><small>Uppföljning</small>Förändring, tolerans, nya rödflaggor, om hypotesen håller och när behandlingen ska avslutas eller omvärderas.</div></div><div class="safety">Säkerhet före TCM: uteslut akuta eller allvarliga orsaker, kontrollera läkemedel, graviditet, ålder, dehydrering, blödning och andra relevanta rödflaggor.</div><p class="source">Maciocia, The Practice of Chinese Medicine, kapitel ${item.chapter} · Pedagogisk syntes, inte ordagrann boktext.</p>`;
}

let channel = "Alla";
let selectedPointId = DATA.points[0]?.id || null;

function initChannels() {
  renderChannelFilters();
}

function renderChannelFilters() {
  const filters = $("#channelFilters");
  if (!filters) return;

  const channels = ["Alla", ...new Set(DATA.points.map((item) => item.channel))];
  filters.innerHTML = channels
    .map(
      (item) =>
        `<button type="button" class="${item === channel ? "active" : ""}" aria-pressed="${item === channel}" data-channel="${item}">${item}</button>`,
    )
    .join("");
  filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setChannel(button.dataset.channel));
  });
}

function setChannel(value) {
  channel = value;
  renderChannelFilters();
  renderPoints();
}

function filteredPoints() {
  const query = normalizeSearch($("#pointSearch")?.value);
  return DATA.points.filter(
    (item) =>
      (channel === "Alla" || item.channel === channel) &&
      containsSearch(query, item.id, item.name, item.channel),
  );
}

function renderPoints() {
  const list = $("#pointList");
  const detail = $("#pointDetail");
  if (!list || !detail) return;

  const matches = filteredPoints();
  if (!matches.length) {
    list.innerHTML = emptyState("Inga punkter hittades", "Kontrollera punktkod, namn eller meridian.");
    detail.innerHTML = emptyState("Ingen träff att visa", "Ändra sökningen eller välj en annan meridian.");
    return;
  }

  if (!matches.some((item) => item.id === selectedPointId)) {
    selectedPointId = matches[0].id;
  }

  const visible = matches.slice(0, 120);
  list.innerHTML =
    visible
      .map(
        (item) =>
          `<button type="button" class="item ${item.id === selectedPointId ? "selected" : ""}" onclick="selectPoint('${item.id}')"><b>${item.id}${item.name ? ` · ${item.name}` : ""}</b><small>${item.channel}</small></button>`,
      )
      .join("") +
    (matches.length > visible.length
      ? `<p class="muted">Visar ${visible.length} av ${matches.length}. Sök mer specifikt.</p>`
      : "");
  renderPointDetail();
}

function selectPoint(id) {
  selectedPointId = id;
  renderPoints();
}

function renderPointDetail() {
  const detail = $("#pointDetail");
  const item = DATA.points.find((point) => point.id === selectedPointId);
  if (!detail || !item) return;

  detail.innerHTML = `<span class="badge">Seirin: ${item.channel}-meridianen</span><h2>${item.id}${item.name ? ` · ${item.name}` : ""}</h2><p class="muted">${item.channel}</p><div class="facts"><div class="fact"><small>Studieuppgift</small>Lär punktens namn, anatomiska region, palpationslandmärke, traditionella funktioner, närliggande riskstrukturer och vanliga förväxlingspunkter.</div><div class="fact"><small>Självtest</small>Kan du ange region, landmärke, närliggande punkt och en viktig säkerhetsrisk utan att titta?</div><div class="fact"><small>Jämför</small>Identifiera föregående och nästa punkt på meridianen samt en punkt från annan meridian i samma anatomiska region.</div><div class="fact"><small>Kapitelhänvisning</small>Seirin: ${item.channel}-meridianen</div></div><div class="safety">Nålriktning och djup ska verifieras i atlas och med handledare; appen ger inte invasiva instruktioner.</div><p class="source">Punktkodsystem: WHO:s standardnomenklatur för 361 klassiska punkter. Anatomisk detalj: verifiera i Seirins punktatlas.</p>`;
}

let selectedHerb = 0;

function filteredHerbs() {
  const query = normalizeSearch($("#herbSearch")?.value);
  return DATA.herbs
    .map((item, index) => ({ ...item, index }))
    .filter((item) =>
      containsSearch(query, item.pinyin, item.category, item.pattern, item.functions),
    );
}

function renderHerbs() {
  const list = $("#herbList");
  const detail = $("#herbDetail");
  if (!list || !detail) return;

  const matches = filteredHerbs();
  if (!matches.length) {
    list.innerHTML = emptyState("Inga örter hittades", "Prova namn, kategori, funktion eller mönster.");
    detail.innerHTML = emptyState("Ingen träff att visa", "Ändra sökningen för att öppna ett örtkort.");
    return;
  }

  if (!matches.some((item) => item.index === selectedHerb)) {
    selectedHerb = matches[0].index;
  }

  list.innerHTML = matches
    .map(
      (item) =>
        `<button type="button" class="item ${item.index === selectedHerb ? "selected" : ""}" onclick="selectHerb(${item.index})"><b>${item.pinyin}</b><small>${item.category} · ${item.pattern}</small></button>`,
    )
    .join("");
  renderHerbDetail();
}

function selectHerb(index) {
  selectedHerb = index;
  renderHerbs();
}

function renderHerbDetail() {
  const detail = $("#herbDetail");
  const item = DATA.herbs[selectedHerb];
  if (!detail || !item) return;

  const categoryRoot = item.category.split(",")[0];
  const similar = DATA.herbs
    .filter(
      (herb) => herb.category.split(",")[0] === categoryRoot && herb.pinyin !== item.pinyin,
    )
    .slice(0, 4);

  detail.innerHTML = `<span class="badge gold">${item.category}</span><h2>${item.pinyin}</h2><div class="facts"><div class="fact"><small>Mönsterlogik</small>${item.pattern}</div><div class="fact"><small>Funktionsområden</small>${item.functions}</div><div class="fact"><small>Jämför med</small>${similar.map((herb) => herb.pinyin).join(", ") || "Sök inom samma kategori"}</div><div class="fact"><small>Dosering</small>Verifiera i fysisk bok; visas inte utan källkontroll</div></div><h3>Mästarfrågor</h3><div class="chips"><span class="chip">När väljs den?</span><span class="chip">När väljs den inte?</span><span class="chip">Vilken liknande ört är alternativ?</span><span class="chip">Hur påverkar beredningen?</span></div><div class="safety"><b>Säkerhet:</b> ${item.safety}. Kontrollera alltid läkemedel, graviditet, lever/njurfunktion, allergi, produktkvalitet och artidentitet.</div><p class="source">Materia Medica: kapitel enligt kategori · Pedagogisk översikt.</p>`;
}

let selectedFormula = 0;

function filteredFormulas() {
  const query = normalizeSearch($("#formulaSearch")?.value);
  return DATA.formulas
    .map((item, index) => ({ ...item, index }))
    .filter((item) =>
      containsSearch(query, item.name, item.category, item.pattern, item.ingredients),
    );
}

function renderFormulas() {
  const list = $("#formulaList");
  const detail = $("#formulaDetail");
  if (!list || !detail) return;

  const matches = filteredFormulas();
  if (!matches.length) {
    list.innerHTML = emptyState("Inga formler hittades", "Prova formelnamn, kategori, mönster eller ört.");
    detail.innerHTML = emptyState("Ingen träff att visa", "Ändra sökningen för att öppna en formel.");
    return;
  }

  if (!matches.some((item) => item.index === selectedFormula)) {
    selectedFormula = matches[0].index;
  }

  list.innerHTML = matches
    .map(
      (item) =>
        `<button type="button" class="item ${item.index === selectedFormula ? "selected" : ""}" onclick="selectFormula(${item.index})"><b>${item.name}</b><small>${item.category} · ${item.pattern}</small></button>`,
    )
    .join("");
  renderFormulaDetail();
}

function selectFormula(index) {
  selectedFormula = index;
  renderFormulas();
}

function renderFormulaDetail() {
  const detail = $("#formulaDetail");
  const item = DATA.formulas[selectedFormula];
  if (!detail || !item) return;

  detail.innerHTML = `<span class="badge gold">${item.category}</span><h2>${item.name}</h2><p>${item.pattern}</p><h3>Ingrediensstruktur</h3><div class="chips">${item.ingredients.map((herb, index) => `<span class="chip">${index === 0 ? "Kejsarkandidat: " : ""}${herb}</span>`).join("")}</div><div class="facts"><div class="fact"><small>Analysera roller</small>Identifiera kejsare, minister, assistent och budbärare utifrån formelns behandlingsprincip.</div><div class="fact"><small>Ta bort en ört</small>Förklara vilken del av riktning, balans, säkerhet eller symptomprofil som försvagas.</div><div class="fact"><small>Jämför</small>Hitta en närliggande formel i samma kategori och förklara det avgörande skiljetecknet.</div><div class="fact"><small>Omvärdera</small>Ange fynd som skulle göra att formeln inte längre passar.</div></div><div class="safety">Utbildningspost. Dosförhållanden, substitutioner och klinisk användning måste verifieras i boken och av kvalificerad handledare.</div><p class="source">Chinese Herbal Formulas and Applications: kapitel enligt formelkategori · Ingrediensnamnen är studieöversikt; proportioner verifieras i boken.</p>`;
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

function speakMaster() {
  speakText($("#masterQ")?.textContent || "");
}

initChannels();
syncInstallButton();
routeFromHash();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
