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
    casesCompleted: finiteNumber(stored.casesCompleted),
    cards:
      stored.cards && typeof stored.cards === "object" && !Array.isArray(stored.cards)
        ? stored.cards
        : {},
    caseSession:
      stored.caseSession && typeof stored.caseSession === "object"
        ? stored.caseSession
        : null,
    masterIndex: Number.isInteger(stored.masterIndex) ? stored.masterIndex : 0,
  };
}

const state = loadState();

function save() {
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
    .trim();
}

function containsSearch(query, ...parts) {
  if (!query) return true;
  return normalizeSearch(parts.flat().join(" ")).includes(query);
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
  if (id === "conditions") renderConditions();
  if (id === "points") renderPoints();
  if (id === "herbs") renderHerbs();
  if (id === "formulas") renderFormulas();
  if (id === "study") currentCard ? updateStudyMeta() : newStudy();
  if (id === "case") renderCase();
  if (id === "master") renderMaster();
}

function go(id, updateHistory = true) {
  const target = document.getElementById(id) ? id : "home";

  $$(".view").forEach((view) => view.classList.toggle("active", view.id === target));
  $$("nav button").forEach((button) => {
    const active = button.dataset.v === target;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (updateHistory && location.hash !== `#${target}`) {
    history.pushState({ view: target }, "", `#${target}`);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  renderView(target);
}

window.addEventListener("popstate", () => go(location.hash.slice(1) || "home", false));

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = $("#installButton");
  if (button) button.textContent = "Installera";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = $("#installButton");
  if (button) button.textContent = "Installerad";
  showToast("Appen är installerad och kan öppnas från hemskärmen.");
});

async function installHelp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === "accepted") showToast("Installationen har startat.");
    deferredInstallPrompt = null;
    return;
  }

  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
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
let currentCard = null;
let studyFirst = true;
let studyHintUsed = false;
let studyStartedAt = 0;

function chooseStudyCard() {
  const now = Date.now();
  const due = CARDS.filter((card) => finiteNumber(state.cards[card.id]?.due) <= now);
  let pool = due.length
    ? due
    : [...CARDS]
        .sort(
          (a, b) =>
            finiteNumber(state.cards[a.id]?.due, Infinity) -
            finiteNumber(state.cards[b.id]?.due, Infinity),
        )
        .slice(0, 20);

  if (pool.length > 1 && currentCard) {
    pool = pool.filter((card) => card.id !== currentCard.id);
  }

  return pool[Math.floor(Math.random() * pool.length)] || CARDS[0] || null;
}

function updateStudyMeta() {
  const meta = $("#studyMeta");
  if (!meta) return;

  const now = Date.now();
  const started = Object.keys(state.cards).filter((id) => state.cards[id]?.reviews).length;
  const due = CARDS.filter(
    (card) => state.cards[card.id]?.reviews && finiteNumber(state.cards[card.id]?.due) <= now,
  ).length;
  meta.textContent = `${started} av ${CARDS.length} kort påbörjade · ${due} repetition${due === 1 ? "" : "er"} redo · ${state.casesCompleted} fall slutförda`;
}

function newStudy() {
  currentCard = chooseStudyCard();
  if (!currentCard) return;

  studyFirst = true;
  studyHintUsed = false;
  studyStartedAt = Date.now();
  $("#studyBadge").textContent = currentCard.type;
  $("#studyQ").textContent = currentCard.q;
  $("#studyA").textContent = currentCard.a;
  $("#studyA").classList.add("hidden");
  $("#studyText").value = "";
  updateStudyMeta();
}

function showStudyAnswer() {
  if (!currentCard) return;
  studyFirst = false;
  studyHintUsed = true;
  $("#studyA").classList.remove("hidden");
}

function formatInterval(days) {
  if (days < 0.05) return "10 minuter";
  if (days < 1.5) return "1 dag";
  return `${Math.round(days)} dagar`;
}

function grade(gradeValue) {
  if (!currentCard) return;

  const previous = state.cards[currentCard.id] || {
    reviews: 0,
    intervalDays: 0,
    lapses: 0,
  };
  const oldInterval = finiteNumber(previous.intervalDays);
  let intervalDays;

  if (gradeValue === 0) intervalDays = 10 / (24 * 60);
  else if (gradeValue === 1) intervalDays = oldInterval ? Math.max(1, oldInterval * 1.25) : 1;
  else if (studyHintUsed) intervalDays = oldInterval ? Math.max(1, oldInterval * 1.6) : 1;
  else intervalDays = oldInterval ? Math.max(3, oldInterval * 2.3) : 3;

  state.attempts += 1;
  state.reviews += 1;
  if (gradeValue === 2 && studyFirst) state.correct += 1;
  state.cards[currentCard.id] = {
    reviews: finiteNumber(previous.reviews) + 1,
    intervalDays,
    due: Date.now() + intervalDays * 24 * 60 * 60 * 1000,
    lastGrade: gradeValue,
    lastResponseSeconds: Math.max(1, Math.round((Date.now() - studyStartedAt) / 1000)),
    usedHint: studyHintUsed,
    lapses: finiteNumber(previous.lapses) + (gradeValue === 0 ? 1 : 0),
  };
  save();
  showToast(`Nästa repetition om ${formatInterval(intervalDays)}.`);
  newStudy();
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

function randomCaseIndex(exclude = -1) {
  let index = Math.floor(Math.random() * cases.length);
  if (cases.length > 1 && index === exclude) index = (index + 1) % cases.length;
  return index;
}

function createCaseSession(caseIndex = randomCaseIndex()) {
  return {
    caseIndex,
    step: 0,
    questions: [],
    patterns: [],
    drafts: {},
  };
}

function normalizeCaseSession(session) {
  if (!session || !Number.isInteger(session.caseIndex) || !cases[session.caseIndex]) {
    return createCaseSession();
  }

  return {
    caseIndex: session.caseIndex,
    step: Math.min(6, Math.max(0, Number(session.step) || 0)),
    questions: Array.isArray(session.questions)
      ? session.questions.filter((value) => Number.isInteger(value) && caseQuestions[value])
      : [],
    patterns: Array.isArray(session.patterns)
      ? session.patterns.filter(
          (value) => Number.isInteger(value) && cases[session.caseIndex].patterns[value],
        )
      : [],
    drafts: session.drafts && typeof session.drafts === "object" ? session.drafts : {},
  };
}

state.caseSession = normalizeCaseSession(state.caseSession);

function saveCaseDraft(step, value) {
  state.caseSession.drafts[String(step)] = value;
  save();
}

function toggleCaseOption(kind, index, button) {
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

  state.caseSession.step = Math.min(6, state.caseSession.step + 1);
  save();
  renderCase();
}

function renderCase() {
  const session = state.caseSession;
  const caseItem = cases[session.caseIndex];
  const step = session.step;
  const title = $("#caseTitle");
  const steps = $("#caseSteps");
  const content = $("#caseContent");
  if (!title || !steps || !content) return;

  title.textContent = caseItem.title;
  steps.innerHTML = ["Säkerhet", "Frågor", "Mönster", "Mekanism", "Princip", "Val", "Uppföljning"]
    .map(
      (label, index) =>
        `<div class="step ${index <= step ? "on" : ""}" aria-label="${label}" title="${label}">${index + 1}</div>`,
    )
    .join("");

  if (step === 0) {
    content.innerHTML = `<span class="eyebrow">Säkerhet före teori</span><h2>${caseItem.intro}</h2><p>Beskriv vilka rödflaggor, läkemedel, graviditetsfrågor eller biomedicinska differentialer som måste kontrolleras.</p><textarea id="caseText" aria-label="Säkerhetsresonemang" oninput="saveCaseDraft(0,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext($('#caseText').value.trim().length>50,'Skriv minst ett par meningar om säkerhet och relevanta rödflaggor.')">Fortsätt</button>`;
  }

  if (step === 1) {
    content.innerHTML = `<h2>Välj frågor med hög informationsvinst</h2>${caseQuestions.map((question, index) => `<button type="button" class="option ${session.questions.includes(index) ? "sel" : ""}" aria-pressed="${session.questions.includes(index)}" onclick="toggleCaseOption('questions',${index},this)">${question}</button>`).join("")}<p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext(state.caseSession.questions.length>=4,'Välj minst fyra frågor innan du går vidare.')">Visa fynd</button>`;
  }

  if (step === 2) {
    content.innerHTML = `<h2>Differentiera mönster</h2><p class="answer">${caseItem.intro}</p>${caseItem.patterns.map((pattern, index) => `<button type="button" class="option ${session.patterns.includes(index) ? "sel" : ""}" aria-pressed="${session.patterns.includes(index)}" onclick="toggleCaseOption('patterns',${index},this)">${pattern}</button>`).join("")}<textarea id="caseText" aria-label="Differentialdiagnostiskt resonemang" placeholder="Ange fynd för, fynd emot och saknad information…" oninput="saveCaseDraft(2,this.value)"></textarea><p id="caseError" class="inline-error" role="alert"></p><button type="button" class="primary" onclick="caseNext(state.caseSession.patterns.length>0 && $('#caseText').value.trim().length>100,'Välj minst ett mönster och utveckla fynd för, fynd emot och saknad information.')">Fortsätt</button>`;
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
    content.innerHTML = `<h2>Stäng loopen</h2><div class="facts"><div class="fact"><small>Effekt</small>Vilka symtom och funktioner ska förändras?</div><div class="fact"><small>Säkerhet</small>Vilka biverkningar och interaktioner följs?</div><div class="fact"><small>Hypotes</small>Vad skulle falsifiera ditt mönster?</div><div class="fact"><small>Beslut</small>När avslutas, ändras eller hänvisas?</div></div><button type="button" class="primary" onclick="finishCase()">Slutför och skapa nytt fall</button>`;
  }

  const textarea = $("#caseText");
  if (textarea) textarea.value = session.drafts[String(step)] || "";
}

function finishCase() {
  const previousIndex = state.caseSession.caseIndex;
  state.casesCompleted += 1;
  state.caseSession = createCaseSession(randomCaseIndex(previousIndex));
  save();
  showToast("Fallet är slutfört och sparat.");
  renderCase();
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

let masterIndex = Math.min(
  masterQuestions.length - 1,
  Math.max(0, Number(state.masterIndex) || 0),
);

function renderMaster() {
  const question = $("#masterQ");
  const hint = $("#masterHint");
  if (!question || !hint) return;

  question.textContent = masterQuestions[masterIndex];
  hint.innerHTML =
    "<b>Ett nivå-7-svar ska innehålla:</b> påstående, fynd för, fynd emot, alternativ hypotes, säkerhet och vad som skulle ändra beslutet.";
}

function nextMaster() {
  masterIndex = (masterIndex + 1) % masterQuestions.length;
  state.masterIndex = masterIndex;
  save();
  $("#masterText").value = "";
  renderMaster();
}

function speakMaster() {
  speakText($("#masterQ")?.textContent || "");
}

initChannels();
const initialView = location.hash.slice(1) || "home";
go(initialView, false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
