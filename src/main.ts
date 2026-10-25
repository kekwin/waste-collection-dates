import type { SavedAddress, VestforAddress, WasteDateWithIcon } from "../shared/types.ts";
import { wasteType } from "../shared/waste-types.ts";

// ── Danish locale data ────────────────────────────────────────────────────────
const DAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
const MONTHS_FULL = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse "2025-04-22T00:00:00" (or "2025-04-22") without timezone drift. */
const parseLocalDate = (dateStr: string): Date => {
  const [datePart = ""] = dateStr.split("T");
  const [y = 0, m = 1, d = 1] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Returns { key, label } for grouping by month. */
const getMonthKey = (dateStr: string) => {
  const d = parseLocalDate(dateStr);
  return {
    key: `${d.getFullYear()}-${d.getMonth()}`,
    label: `${MONTHS_FULL[d.getMonth()] ?? ""} ${d.getFullYear()}`,
  };
};

/**
 * Returns { label, cls } for an urgency pill if the event is within 3 days.
 * Returns null otherwise.
 */
const getUrgency = (dateStr: string): { label: string; cls: string } | null => {
  const event = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((event.getTime() - today.getTime()) / 864e5);
  if (diff === 0) return { label: "I dag", cls: "today" };
  if (diff === 1) return { label: "I morgen", cls: "tomorrow" };
  if (diff === 2) return { label: "Om 2 dage", cls: "soon" };
  if (diff === 3) return { label: "Om 3 dage", cls: "soon" };
  return null;
};

// ── Security ──────────────────────────────────────────────────────────────────
const escapeHtml = (str: unknown): string =>
  String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elementet #${id} mangler på siden`);
  return el as T;
};

const searchInput = $<HTMLInputElement>("search-input");
const autocompleteEl = $("autocomplete");
const headerSubtitle = $("current-address");
const searchSection = $("search-section");
const loadingEl = $("loading");
const errorCard = $("error-msg");
const errorText = $("error-text");
const retryBtn = $("retry-btn");
const datesSection = $("dates-section");
const datesList = $("dates-list");
const actionBar = $("action-bar");
const refreshBtn = $("refresh-btn");
const changeAddressBtn = $("change-address-btn");
const homeBanner = $("home-banner");
const homeBtn = $("home-btn");
const homeName = $("home-name");
const icsLink = $<HTMLAnchorElement>("ics-link");
const printLink = $<HTMLAnchorElement>("print-link");
const subscribeBtn = $("subscribe-btn");
const subscribeCard = $("subscribe-card");
const subscribeUrl = $<HTMLInputElement>("subscribe-url");
const webcalLink = $<HTMLAnchorElement>("webcal-link");
const copyBtn = $("copy-btn");
const publicNote = $("public-note");
const publicLinkNote = $("public-link-note");

// ── App state ─────────────────────────────────────────────────────────────────
let currentAddress: SavedAddress | null = null;
let homeAddress: SavedAddress | null = null; // HOME_ADDRESS fra hub'ens .env (null, hvis den ikke er sat)
let searchTimer: ReturnType<typeof setTimeout> | undefined;
// Den offentlige instans gemmer ingenting på serveren: adressen bor i browseren og følger med i hvert kald.
let stateless = false;
const STORAGE_KEY = "skraldehentning.adresse";

const loadStoredAddress = (): SavedAddress | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedAddress | null;
    return stored && typeof stored.id === "string" && stored.id ? stored : null;
  } catch {
    return null;
  }
};

const storeAddress = (address: SavedAddress) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
  } catch {
    // Privat tilstand eller blokeret lager: adressen huskes bare ikke til næste gang.
  }
};

/** Adresse-id'et som query, når serveren ikke husker adressen selv. */
const idQuery = (address: SavedAddress) => `?id=${encodeURIComponent(address.id)}`;

/** Kalenderfilen, abonnementet og udskriftssiden peger på den viste adresse. */
const updateLinks = () => {
  if (!stateless || !currentAddress) return;
  const q = idQuery(currentAddress);
  icsLink.href = `/api/calendar.ics${q}`;
  printLink.href = `/print.html${q}&navn=${encodeURIComponent(currentAddress.navn ?? "")}&postnr=${encodeURIComponent(currentAddress.postnr ?? "")}`;
  const url = new URL(`/api/calendar.ics${q}`, location.href);
  subscribeUrl.value = url.href;
  webcalLink.href = url.href.replace(/^https?:/, "webcal:");
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── View helpers ──────────────────────────────────────────────────────────────
const showSearchView = () => {
  searchSection.classList.remove("hidden");
  datesSection.classList.add("hidden");
  homeBanner.classList.add("hidden");
  actionBar.classList.add("hidden");
  errorCard.classList.add("hidden");
  headerSubtitle.textContent = "Søg din adresse for at se tømmedatoer";
  searchInput.focus();
};

const showDatesView = () => {
  if (currentAddress) {
    updateLinks();
    const postnr = currentAddress.postnr ? `, ${currentAddress.postnr}` : "";
    const atHome = !!homeAddress && currentAddress.id === homeAddress.id;
    const pin = document.createElement("i");
    pin.className = `ico fad fa-${atHome ? "home" : "map-marker-alt"}`;
    pin.setAttribute("aria-hidden", "true");
    headerSubtitle.replaceChildren(pin, ` ${currentAddress.navn || ""}${postnr}${atHome ? " (hjemme)" : ""}`);
    homeBanner.classList.toggle("hidden", !homeAddress || atHome);
    if (homeAddress) homeName.textContent = (homeAddress.navn ?? "").replace(/, \d{4} .*$/, "");
  }
  searchSection.classList.add("hidden");
  datesSection.classList.remove("hidden");
  actionBar.classList.remove("hidden");
};

const showError = (msg: string) => {
  errorText.textContent = msg;
  errorCard.classList.remove("hidden");
  loadingEl.classList.add("hidden");
};

// ── Data loading ──────────────────────────────────────────────────────────────
const loadDates = async () => {
  loadingEl.classList.remove("hidden");
  errorCard.classList.add("hidden");
  datesList.innerHTML = "";

  try {
    const r = await fetch(stateless && currentAddress ? `/api/dates${idQuery(currentAddress)}` : "/api/dates");
    if (!r.ok) {
      const err = (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as { error?: string };
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    renderDates((await r.json()) as WasteDateWithIcon[]);
  } catch (e) {
    showError(messageOf(e));
  } finally {
    loadingEl.classList.add("hidden");
  }
};

// ── Rendering ─────────────────────────────────────────────────────────────────
const renderDates = (dates: WasteDateWithIcon[]) => {
  if (!dates.length) {
    datesList.innerHTML = '<p class="empty-msg">Ingen tømninger fundet i det næste år.</p>';
    return;
  }

  // Group by month
  const groups = new Map<string, { label: string; events: WasteDateWithIcon[] }>();
  for (const ev of dates) {
    const { key, label } = getMonthKey(ev.start);
    const group = groups.get(key) ?? { label, events: [] };
    group.events.push(ev);
    groups.set(key, group);
  }

  let html = "";
  for (const { label, events } of groups.values()) {
    html += `<div class="month-group">
      <h2 class="month-header">${escapeHtml(label)}</h2>
      <div class="events-card">`;

    for (const ev of events) {
      const { fa, cls } = wasteType(ev.title);
      const d = parseLocalDate(ev.start);
      const dayShort = DAYS_SHORT[d.getDay()] ?? "";
      const dayNum = d.getDate();
      const urgency = getUrgency(ev.start);
      const urgHtml = urgency ? `<span class="urgent ${urgency.cls}">${urgency.label}</span>` : "";

      html += `<div class="event-row ${cls}">
        <div class="event-date">
          <span class="event-day">${dayShort}</span>
          <span class="event-daynum">${dayNum}.</span>
        </div>
        <div class="event-badge">
          <i class="event-icon ico fad fa-${fa}" aria-hidden="true"></i>
          <span class="event-title">${escapeHtml(ev.title)}</span>
        </div>
        ${urgHtml}
      </div>`;
    }

    html += `</div></div>`;
  }

  datesList.innerHTML = html;

  // Staggered fade-in animation
  datesList.querySelectorAll<HTMLElement>(".event-row").forEach((el, i) => {
    el.style.animationDelay = `${i * 22}ms`;
  });
};

// ── Address selection ─────────────────────────────────────────────────────────
const selectAddress = async ({ id, navn, postnr }: SavedAddress) => {
  autocompleteEl.classList.add("hidden");
  searchInput.value = "";
  loadingEl.classList.remove("hidden");
  errorCard.classList.add("hidden");

  try {
    if (stateless) {
      storeAddress({ id, navn, postnr });
    } else {
      const r = await fetch("/api/set-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, navn, postnr }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Kunne ikke sætte adresse");
      }
    }
    currentAddress = { id, navn, postnr };
    showDatesView();
    await loadDates();
  } catch (e) {
    loadingEl.classList.add("hidden");
    showError(messageOf(e));
  }
};

// ── Autocomplete search ───────────────────────────────────────────────────────
const renderAutocomplete = (results: VestforAddress[]) => {
  if (!results.length) {
    autocompleteEl.classList.add("hidden");
    return;
  }

  autocompleteEl.innerHTML = results
    .slice(0, 10)
    .map(
      (r) => `
    <div class="autocomplete-item" role="option" tabindex="0"
         data-id="${escapeHtml(r.Id)}"
         data-navn="${escapeHtml(r.FuldtVejnavn)}"
         data-postnr="${escapeHtml(r.Postnr || "")}">
      <i class="ac-icon ico fad fa-map-marker-alt" aria-hidden="true"></i>
      <span class="ac-name">${escapeHtml(r.FuldtVejnavn)}</span>
      ${r.Postnr ? `<span class="ac-postnr">${escapeHtml(r.Postnr)}</span>` : ""}
    </div>
  `,
    )
    .join("");

  autocompleteEl.querySelectorAll<HTMLElement>(".autocomplete-item").forEach((item) => {
    const pick = () => void selectAddress({ id: item.dataset.id ?? "", navn: item.dataset.navn ?? "", postnr: item.dataset.postnr ?? "" });
    item.addEventListener("click", pick);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pick();
    });
  });

  autocompleteEl.classList.remove("hidden");
};

const doSearch = async (term: string) => {
  try {
    const r = await fetch(`/api/search?term=${encodeURIComponent(term)}`);
    if (!r.ok) {
      autocompleteEl.classList.add("hidden");
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      showError(err.error || `HTTP ${r.status}`);
      return;
    }
    errorCard.classList.add("hidden");
    renderAutocomplete((await r.json()) as VestforAddress[]);
  } catch {
    autocompleteEl.classList.add("hidden");
  }
};

searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim();
  clearTimeout(searchTimer);
  if (term.length < 2) {
    autocompleteEl.classList.add("hidden");
    return;
  }
  searchTimer = setTimeout(() => void doSearch(term), 300);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") autocompleteEl.classList.add("hidden");
});

document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".search-wrapper")) autocompleteEl.classList.add("hidden");
});

// ── Button handlers ───────────────────────────────────────────────────────────
refreshBtn.addEventListener("click", () => void loadDates());
changeAddressBtn.addEventListener("click", showSearchView);
homeBtn.addEventListener("click", () => {
  if (homeAddress) void selectAddress(homeAddress);
});

subscribeBtn.addEventListener("click", () => {
  const open = subscribeCard.classList.toggle("hidden") === false;
  subscribeBtn.setAttribute("aria-expanded", String(open));
});
copyBtn.addEventListener("click", () => {
  subscribeUrl.select();
  void navigator.clipboard?.writeText(subscribeUrl.value).catch(() => document.execCommand("copy"));
});

retryBtn.addEventListener("click", () => {
  errorCard.classList.add("hidden");
  if (currentAddress) {
    showDatesView();
    void loadDates();
  } else {
    showSearchView();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
const init = async () => {
  stateless = await fetch("/api/mode")
    .then((r) => (r.ok ? (r.json() as Promise<{ public?: boolean }>) : null))
    .then((m) => m?.public === true)
    .catch(() => false);
  if (stateless) {
    subscribeBtn.classList.remove("hidden");
    publicNote.classList.remove("hidden");
    const stored = loadStoredAddress();
    if (stored) {
      currentAddress = stored;
      showDatesView();
      void loadDates();
    } else {
      showSearchView();
    }
    return;
  }
  publicLinkNote.classList.remove("hidden");
  homeAddress = await fetch("/api/home")
    .then((r) => (r.ok ? (r.json() as Promise<SavedAddress | null>) : null))
    .catch(() => null);
  try {
    const r = await fetch("/api/saved-address");
    const saved = (await r.json()) as SavedAddress | null;
    if (saved?.id) {
      currentAddress = saved;
      showDatesView();
      void loadDates(); // auto-retry in server handles stale/missing cookie
    } else {
      showSearchView();
    }
  } catch {
    showSearchView();
  }
};

void init();
