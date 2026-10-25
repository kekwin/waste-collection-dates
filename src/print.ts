// Udskriftssiden (print.html): henter datoerne, tegner dem grupperet efter måned og åbner udskriftsdialogen.
import type { SavedAddress, WasteDateWithIcon } from "../shared/types.ts";
import { wasteType } from "../shared/waste-types.ts";

const DAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
const MONTHS_DA = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const MONTHS_CAP = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elementet #${id} mangler på siden`);
  return el;
};

/* Safely set text content to avoid XSS */
const txt = (el: HTMLElement, s: unknown) => {
  el.textContent = String(s);
};

const parseLocalDate = (dateStr: string): Date => {
  const [y = 0, m = 1, d = 1] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

const dateLabel = (d: Date) => `${d.getDate()}. ${MONTHS_DA[d.getMonth()] ?? ""} ${d.getFullYear()}`;

const el = (tag: string, className: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  return e;
};

const render = async () => {
  try {
    // Den offentlige instans husker ingen adresse: siden åbnes med ?id=…&navn=…&postnr=… fra hovedsiden.
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const [datesRes, addrRes] = id
      ? [await fetch(`/api/dates?id=${encodeURIComponent(id)}`), null]
      : await Promise.all([fetch("/api/dates"), fetch("/api/saved-address")]);

    const dates = (await datesRes.json()) as WasteDateWithIcon[] | { error?: string };
    const address = addrRes ? ((await addrRes.json()) as SavedAddress | null) : { id: id ?? "", navn: params.get("navn") ?? "", postnr: params.get("postnr") ?? "" };

    if (!Array.isArray(dates)) {
      throw new Error(dates.error || "Uventet svar fra serveren");
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    const addrLabel = address ? (address.navn || "") + (address.postnr ? ", " + address.postnr : "") : "";

    // Matches the range the server actually fetches (see fetchTommeDates in
    // backend/vestfor.ts: next 12 months), so the printed header doesn't
    // undersell how far out the listed dates go.
    const now = new Date();
    const future = new Date(now);
    future.setFullYear(future.getFullYear() + 1);

    txt($("header-addr"), addrLabel);

    $("header-meta").innerHTML =
      "Udskrevet: " + dateLabel(now) + "<br>" + "Periode: " + dateLabel(now) + " – " + dateLabel(future) + "<br>" + "Kilde: vestfor.dk";

    txt($("print-footer"), "Skraldetømningsapp · Data fra vestfor.dk · Genereret " + dateLabel(now));

    /* ── Group events by month ───────────────────────────────────────────── */
    const groups = new Map<string, { label: string; events: WasteDateWithIcon[] }>();
    for (const ev of dates) {
      const d = parseLocalDate(ev.start);
      const key = d.getFullYear() + "-" + d.getMonth();
      const group = groups.get(key) ?? { label: (MONTHS_CAP[d.getMonth()] ?? "") + " " + d.getFullYear(), events: [] };
      group.events.push(ev);
      groups.set(key, group);
    }

    /* ── Render rows ─────────────────────────────────────────────────────── */
    const container = $("events-container");

    for (const { label, events } of groups.values()) {
      const mg = el("div", "month-group");

      const mh = el("h2", "month-header");
      txt(mh, label);
      mg.appendChild(mh);

      for (const ev of events) {
        const wt = wasteType(ev.title);
        const d = parseLocalDate(ev.start);

        const row = el("div", "event-row");
        row.style.borderLeftColor = wt.color;

        /* Date column */
        const dateCol = el("div", "event-date");

        const daySpan = el("span", "event-day");
        txt(daySpan, DAYS_SHORT[d.getDay()] ?? "");

        const numSpan = el("span", "event-daynum");
        txt(numSpan, d.getDate() + ".");

        dateCol.appendChild(daySpan);
        dateCol.appendChild(numSpan);

        /* Badge */
        const badge = el("span", "event-badge");
        badge.style.background = wt.bg;
        badge.style.color = wt.fg;

        const iconSpan = document.createElement("i");
        iconSpan.className = `fas fa-${wt.fa}`;
        iconSpan.setAttribute("aria-hidden", "true");

        const titleSpan = document.createElement("span");
        txt(titleSpan, ev.title);

        badge.appendChild(iconSpan);
        badge.appendChild(titleSpan);

        row.appendChild(dateCol);
        row.appendChild(badge);
        mg.appendChild(row);
      }

      container.appendChild(mg);
    }

    /* ── Show + auto-print ───────────────────────────────────────────────── */
    $("loading-msg").classList.add("hidden");
    $("content").classList.remove("hidden");
    setTimeout(() => window.print(), 500);
  } catch (err) {
    txt($("loading-msg"), "Fejl: " + (err instanceof Error ? err.message : String(err)));
  }
};

$("print-btn").addEventListener("click", () => window.print());

void render();
