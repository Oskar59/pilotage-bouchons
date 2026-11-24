// Pilotage Bouchons — suivi trésorerie / stock / stratégie
// Tout est stocké dans le navigateur (localStorage). Partage via export JSON ou lien.

const STORE_KEY = "pilotage-bouchons-v1";
const KEY_KEY = "pilotage-bouchons-apikey";
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const TRANSPORTS = {
  Train: { score: 1, label: "Peu polluant", cls: "good" },
  Camion: { score: 2, label: "Plutôt polluant", cls: "warn" },
  Bateau: { score: 3, label: "Polluant", cls: "warn" },
  Avion: { score: 4, label: "Très polluant", cls: "crit" },
};

const DEFAULT_RULES = `Distributeur de bouchons de liège.
- Capital de départ : 500 000 €
- Salaires mensuels : 40 000 €
- Frais de structure mensuels : 20 000 €
- Stock de départ : 12 000 lots de bouchons agglomérés à 25 €/lot, à payer fin janvier
- Frais de stockage : 0,33 % du stock final (valeur)
- Prix d'achat moyen constaté auprès des industriels : environ 21 €/lot
- Impact RSE du transport : Avion très polluant, Bateau polluant, Camion plutôt polluant, Train peu polluant
- Fournisseur historique allemand : STECKER (offres reçues automatiquement en négociation)
- Chaque mois : une phase de planification puis une phase de négociation.
- Objectif : être la meilleure entreprise sans jamais avoir une trésorerie négative.`;

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState() {
  return {
    version: 1,
    team: "Notre entreprise",
    currentMonth: 0,
    params: { capital: 500000, salaires: 40000, structure: 20000, stockageRate: 0.33, prixMarche: 21, seuilTreso: 50000 },
    stockInitial: { lots: 12000, prix: 25, moisPaiement: 0, produit: "Bouchons agglomérés" },
    months: MOIS.map((nom) => ({ nom, achats: [], ventes: [], depenses: [], planif: "", nego: "" })),
    rules: DEFAULT_RULES,
    chat: [],
  };
}

let state = load();
let ui = { tab: "dashboard", editMonth: state.currentMonth, simu: { type: "achat", lots: 5000, prix: 21, delai: 1, transport: "Train", coutTransport: 0, mois: state.currentMonth }, busy: false };

function load() {
  try {
    const fromHash = readHash();
    if (fromHash) return fromHash;
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return defaultState();
}
function migrate(s) {
  const d = defaultState();
  return { ...d, ...s, params: { ...d.params, ...(s.params || {}) }, stockInitial: { ...d.stockInitial, ...(s.stockInitial || {}) } };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
}
function readHash() {
  if (!location.hash.startsWith("#data=")) return null;
  try {
    const json = decodeURIComponent(escape(atob(location.hash.slice(6))));
    const s = migrate(JSON.parse(json));
    history.replaceState(null, "", location.pathname);
    setTimeout(() => toast("Données chargées depuis le lien partagé"), 300);
    return s;
  } catch (e) { return null; }
}

// ---------- calculs ----------
const n0 = (v) => (Number.isFinite(+v) ? +v : 0);

function compute(s) {
  const p = s.params;
  const n = s.months.length;
  const H = n + 24;
  const enc = Array(H).fill(0);
  const decAch = Array(H).fill(0);
  const si = s.stockInitial;
  decAch[n0(si.moisPaiement)] += n0(si.lots) * n0(si.prix);

  let lots = n0(si.lots);
  let val = n0(si.lots) * n0(si.prix);
  let treso = n0(p.capital);
  let cumRes = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = s.months[i];
    let achLots = 0, achVal = 0, transport = 0;
    const rse = {};
    for (const a of m.achats) {
      const l = n0(a.lots), pr = n0(a.prix);
      achLots += l; achVal += l * pr; transport += n0(a.coutTransport);
      decAch[i + n0(a.delai)] += l * pr;
      rse[a.transport] = (rse[a.transport] || 0) + l;
    }
    const lotsDispo = lots + achLots;
    const valDispo = val + achVal;
    const cmup = lotsDispo > 0 ? valDispo / lotsDispo : 0;
    let venLots = 0, ca = 0;
    for (const v of m.ventes) {
      const l = n0(v.lots), pr = n0(v.prix);
      venLots += l; ca += l * pr;
      enc[i + n0(v.delai)] += l * pr;
      transport += n0(v.coutTransport);
      if (v.transport) rse[v.transport] = (rse[v.transport] || 0) + l;
    }
    const lotsFin = lotsDispo - venLots;
    const valFin = Math.max(0, lotsFin) * cmup;
    const stockage = valFin * n0(p.stockageRate) / 100;
    const divers = m.depenses.reduce((t, d) => t + n0(d.montant), 0);
    const fixes = n0(p.salaires) + n0(p.structure);
    const decaiss = fixes + stockage + transport + divers + decAch[i];
    const tresoDebut = treso;
    const tresoFin = treso + enc[i] - decaiss;
    const coutVentes = venLots * cmup;
    const resultat = ca - coutVentes - fixes - stockage - transport - divers;
    cumRes += resultat;
    rows.push({
      i, nom: m.nom, tresoDebut, encaissements: enc[i], paiementsAchats: decAch[i], fixes, stockage, transport, divers,
      decaissements: decaiss, tresoFin, achLots, achVal, venLots, ca, cmup, coutVentes, lotsDebut: lots, lotsFin, valFin,
      resultat, cumRes, marge: ca - coutVentes, rse, stockNeg: lotsFin < 0,
    });
    treso = tresoFin; lots = lotsFin; val = valFin;
  }
  const creances = enc.slice(n).reduce((a, b) => a + b, 0);
  const dettes = decAch.slice(n).reduce((a, b) => a + b, 0);
  // reste à encaisser / payer à partir du mois courant
  const cur = s.currentMonth;
  const aEncaisser = enc.slice(cur + 1).reduce((a, b) => a + b, 0);
  const aPayer = decAch.slice(cur + 1).reduce((a, b) => a + b, 0);
  let minT = Infinity, minI = -1;
  rows.forEach((r) => { if (r.tresoFin < minT) { minT = r.tresoFin; minI = r.i; } });
  return { rows, creances, dettes, aEncaisser, aPayer, minTreso: minT, minTresoMonth: minI };
}

function rseSummary(s) {
  const tot = {};
  s.months.forEach((m) => {
    m.achats.forEach((a) => { tot[a.transport] = (tot[a.transport] || 0) + n0(a.lots); });
    m.ventes.forEach((v) => { if (v.transport) tot[v.transport] = (tot[v.transport] || 0) + n0(v.lots); });
  });
  let lots = 0, w = 0;
  for (const [k, l] of Object.entries(tot)) { if (TRANSPORTS[k]) { lots += l; w += l * TRANSPORTS[k].score; } }
  const score = lots ? w / lots : 0;
  let label = "Aucun transport saisi", cls = "info";
  if (lots) {
    if (score <= 1.5) { label = "Très bon (majorité train)"; cls = "good"; }
    else if (score <= 2.3) { label = "Correct"; cls = "warn"; }
    else { label = "Mauvais — trop d'avion/bateau"; cls = "crit"; }
  }
  return { tot, lots, score, label, cls };
}

// ---------- format ----------
const fmtE = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("fr-FR") + " €" : "—");
const fmtN = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("fr-FR") : "—");
const fmtP = (v) => (Number.isFinite(v) ? v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—");
const fmtK = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M€";
  if (a >= 1e3) return Math.round(v / 1e3).toLocaleString("fr-FR") + " k€";
  return Math.round(v) + " €";
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cls = (v) => (v < 0 ? "neg" : "");

// ---------- rendu ----------
function render() {
  const c = compute(state);
  renderMonthSelect();
  renderDashboard(c);
  renderMois(c);
  renderStock(c);
  renderSimu(c);
  renderIA(c);
  renderParams();
}

function renderMonthSelect() {
  const sel = document.getElementById("currentMonth");
  sel.innerHTML = state.months.map((m, i) => `<option value="${i}" ${i === state.currentMonth ? "selected" : ""}>${esc(m.nom)}</option>`).join("");
}

function alertsFor(c) {
  const out = [];
  const p = state.params;
  c.rows.forEach((r) => {
    if (r.tresoFin < 0) out.push({ cls: "crit", t: `<b>${r.nom}</b> : trésorerie négative prévue (${fmtE(r.tresoFin)}).` });
    else if (r.tresoFin < n0(p.seuilTreso)) out.push({ cls: "warn", t: `<b>${r.nom}</b> : trésorerie sous le seuil de sécurité (${fmtE(r.tresoFin)} < ${fmtE(n0(p.seuilTreso))}).` });
    if (r.stockNeg) out.push({ cls: "crit", t: `<b>${r.nom}</b> : vous vendez plus que le stock disponible (${fmtN(r.lotsFin)} lots).` });
  });
  return out;
}

function renderDashboard(c) {
  const cur = c.rows[state.currentMonth] || c.rows[0];
  const rse = rseSummary(state);
  const alerts = alertsFor(c);
  const el = document.getElementById("tab-dashboard");
  el.innerHTML = `
    <div class="grid k4">
      <div class="card kpi"><div class="label">Trésorerie fin ${esc(cur.nom)}</div><div class="value ${cls(cur.tresoFin)}">${fmtE(cur.tresoFin)}</div><div class="hint">début de mois : ${fmtE(cur.tresoDebut)}</div></div>
      <div class="card kpi"><div class="label">Stock fin ${esc(cur.nom)}</div><div class="value">${fmtN(cur.lotsFin)} lots</div><div class="hint">CMUP ${fmtP(cur.cmup)} · valeur ${fmtE(cur.valFin)}</div></div>
      <div class="card kpi"><div class="label">Résultat cumulé à fin ${esc(cur.nom)}</div><div class="value ${cls(cur.cumRes)}">${fmtE(cur.cumRes)}</div><div class="hint">mois : ${fmtE(cur.resultat)}</div></div>
      <div class="card kpi"><div class="label">Trésorerie minimale prévue</div><div class="value ${cls(c.minTreso)}">${fmtE(c.minTreso)}</div><div class="hint">en ${esc(c.rows[c.minTresoMonth]?.nom || "—")}</div></div>
    </div>

    <div class="card section-gap">
      <div class="row between"><h2>Trésorerie fin de mois</h2><span class="muted small">Barres pâles = mois futurs (prévision). Survolez une barre pour le détail.</span></div>
      <div class="chart" id="tresoChart"></div>
    </div>

    <div class="grid c2">
      <div class="card">
        <h2>Alertes</h2>
        ${alerts.length ? alerts.slice(0, 8).map((a) => `<div class="alert ${a.cls}"><span class="ico">${a.cls === "crit" ? "⚠" : "!"}</span><span>${a.t}</span></div>`).join("") : `<div class="alert good"><span class="ico">✓</span><span>Aucune alerte : trésorerie positive et stock suffisant sur tout l'horizon.</span></div>`}
        ${alerts.length > 8 ? `<p class="muted small">+ ${alerts.length - 8} autres alertes</p>` : ""}
      </div>
      <div class="card">
        <h2>À venir</h2>
        <table><tbody>
          <tr><td>Encaissements clients attendus (après ${esc(cur.nom)})</td><td class="r">${fmtE(c.aEncaisser)}</td></tr>
          <tr><td>Paiements fournisseurs à venir (après ${esc(cur.nom)})</td><td class="r">${fmtE(c.aPayer)}</td></tr>
          <tr><td>Charges fixes mensuelles</td><td class="r">${fmtE(n0(state.params.salaires) + n0(state.params.structure))}</td></tr>
          <tr><td>Impact RSE transports</td><td class="r"><span class="badge ${rse.cls === "info" ? "warn" : rse.cls}">${esc(rse.label)}</span></td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="card section-gap">
      <h2>Récapitulatif mensuel</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th class="r">Tréso début</th><th class="r">Encaiss.</th><th class="r">Paiem. achats</th><th class="r">Charges fixes</th><th class="r">Stockage</th><th class="r">Transport + divers</th><th class="r">Tréso fin</th><th class="r">Achats (lots)</th><th class="r">Ventes (lots)</th><th class="r">Stock fin</th><th class="r">Résultat</th></tr></thead>
        <tbody>${c.rows.map((r) => `<tr class="${r.i === state.currentMonth ? "current" : ""}">
          <td>${esc(r.nom)}</td><td class="r">${fmtE(r.tresoDebut)}</td><td class="r">${fmtE(r.encaissements)}</td><td class="r">${fmtE(r.paiementsAchats)}</td>
          <td class="r">${fmtE(r.fixes)}</td><td class="r">${fmtE(r.stockage)}</td><td class="r">${fmtE(r.transport + r.divers)}</td>
          <td class="r ${cls(r.tresoFin)}"><b>${fmtE(r.tresoFin)}</b></td><td class="r">${fmtN(r.achLots)}</td><td class="r">${fmtN(r.venLots)}</td>
          <td class="r ${cls(r.lotsFin)}">${fmtN(r.lotsFin)}</td><td class="r ${cls(r.resultat)}">${fmtE(r.resultat)}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>`;
  drawTresoChart(document.getElementById("tresoChart"), c.rows);
}

function drawTresoChart(host, rows) {
  const W = 1000, H = 280, padL = 64, padR = 12, padT = 16, padB = 28;
  const vals = rows.map((r) => r.tresoFin);
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) max = min + 1;
  const span = max - min;
  const step = niceStep(span / 4);
  max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
  const y = (v) => padT + (max - v) / (max - min) * (H - padT - padB);
  const bw = (W - padL - padR) / rows.length;
  const barW = Math.min(44, bw - 6);
  let g = "";
  for (let v = min; v <= max + 1e-6; v += step) {
    g += `<line class="${v === 0 ? "zero" : "gridline"}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
  }
  let bars = "";
  rows.forEach((r, i) => {
    const x = padL + i * bw + (bw - barW) / 2;
    const v = r.tresoFin;
    const y0 = y(0), y1 = y(v);
    const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const future = i > state.currentMonth;
    const rr = Math.min(4, h / 2);
    // coins arrondis uniquement côté valeur
    const path = v >= 0
      ? `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + barW - rr} Q${x + barW},${top} ${x + barW},${top + rr} V${y0} Z`
      : `M${x},${y0} V${top + h - rr} Q${x},${top + h} ${x + rr},${top + h} H${x + barW - rr} Q${x + barW},${top + h} ${x + barW},${top + h - rr} V${y0} Z`;
    bars += `<path class="bar ${v < 0 ? "neg" : ""} ${future ? "future" : ""}" data-i="${i}" d="${path}"/>`;
    bars += `<text class="axis-x" x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${esc(r.nom.slice(0, 3))}</text>`;
    if (i === state.currentMonth || v < 0 || i === rows.length - 1) {
      const ly = v >= 0 ? top - 5 : top + h + 13;
      bars += `<text class="lbl" x="${x + barW / 2}" y="${ly}" text-anchor="middle">${fmtK(v)}</text>`;
    }
    bars += `<rect class="hit" data-i="${i}" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}"/>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trésorerie fin de mois"><g class="axis">${g}</g><g class="axis">${bars}</g></svg>`;
  const tt = document.getElementById("tooltip");
  host.querySelectorAll(".hit").forEach((h) => {
    h.addEventListener("mousemove", (e) => {
      const r = rows[+h.dataset.i];
      host.querySelectorAll(".bar").forEach((b) => b.classList.toggle("hover", b.dataset.i === h.dataset.i));
      tt.innerHTML = `<div class="tt-title">${esc(r.nom)}${r.i > state.currentMonth ? " (prévision)" : ""}</div>
        <div class="tt-row"><span>Tréso début</span><span>${fmtE(r.tresoDebut)}</span></div>
        <div class="tt-row"><span>+ Encaissements</span><span>${fmtE(r.encaissements)}</span></div>
        <div class="tt-row"><span>− Décaissements</span><span>${fmtE(r.decaissements)}</span></div>
        <div class="tt-row"><b>Tréso fin</b><b class="${cls(r.tresoFin)}">${fmtE(r.tresoFin)}</b></div>
        <div class="tt-row"><span>Stock fin</span><span>${fmtN(r.lotsFin)} lots</span></div>`;
      tt.hidden = false;
      const x = Math.min(e.clientX + 14, window.innerWidth - 270);
      tt.style.left = x + "px"; tt.style.top = (e.clientY + 14) + "px";
    });
    h.addEventListener("mouseleave", () => { tt.hidden = true; host.querySelectorAll(".bar").forEach((b) => b.classList.remove("hover")); });
  });
}
function niceStep(x) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function transportSelect(attrs, value, allowEmpty) {
  return `<select ${attrs}>${allowEmpty ? `<option value="" ${!value ? "selected" : ""}>—</option>` : ""}${Object.keys(TRANSPORTS).map((t) => `<option ${t === value ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}

function renderMois(c) {
  const i = Math.min(ui.editMonth, state.months.length - 1);
  const m = state.months[i];
  const r = c.rows[i];
  const el = document.getElementById("tab-mois");
  const inp = (list, j, k, v, type = "number", extra = "") => `<input type="${type}" ${extra} data-m="${i}" data-list="${list}" data-j="${j}" data-k="${k}" value="${esc(v)}">`;
  const delaiOpts = (list, j, v) => `<select data-m="${i}" data-list="${list}" data-j="${j}" data-k="delai">${[0, 1, 2, 3].map((d) => `<option value="${d}" ${n0(v) === d ? "selected" : ""}>${d === 0 ? "Mois même" : "M+" + d}</option>`).join("")}</select>`;
  el.innerHTML = `
    <div class="month-pills">${state.months.map((mm, k) => `<button class="pill ${k === i ? "active" : ""} ${c.rows[k].tresoFin < 0 ? "neg-dot" : ""}" data-editmonth="${k}">${esc(mm.nom)}</button>`).join("")}</div>

    <div class="grid k4">
      <div class="card kpi"><div class="label">Tréso début</div><div class="value ${cls(r.tresoDebut)}">${fmtE(r.tresoDebut)}</div></div>
      <div class="card kpi"><div class="label">Tréso fin</div><div class="value ${cls(r.tresoFin)}">${fmtE(r.tresoFin)}</div><div class="hint">+${fmtE(r.encaissements)} / −${fmtE(r.decaissements)}</div></div>
      <div class="card kpi"><div class="label">Stock début → fin</div><div class="value ${cls(r.lotsFin)}">${fmtN(r.lotsDebut)} → ${fmtN(r.lotsFin)}</div><div class="hint">lots</div></div>
      <div class="card kpi"><div class="label">Résultat du mois</div><div class="value ${cls(r.resultat)}">${fmtE(r.resultat)}</div><div class="hint">marge brute ${fmtE(r.marge)}</div></div>
    </div>

    <div class="card section-gap">
      <div class="row between"><h2>Achats (négociation fournisseurs)</h2><button class="btn" data-add="achats">+ Ajouter un achat</button></div>
      <p class="muted small">Les lots sont considérés reçus dans le mois. Le paiement est décaissé selon le délai choisi. Prix marché de référence : ${fmtP(n0(state.params.prixMarche))}/lot.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Fournisseur</th><th>Produit</th><th class="r">Lots</th><th class="r">Prix/lot</th><th>Transport</th><th class="r">Coût transport (€)</th><th>Paiement</th><th class="r">Total</th><th></th></tr></thead>
        <tbody>${m.achats.length ? m.achats.map((a, j) => `<tr>
          <td>${inp("achats", j, "fournisseur", a.fournisseur, "text")}</td>
          <td>${inp("achats", j, "produit", a.produit, "text")}</td>
          <td class="r">${inp("achats", j, "lots", a.lots)}</td>
          <td class="r">${inp("achats", j, "prix", a.prix, "number", 'step="0.01" class="sm"')} ${n0(a.prix) > n0(state.params.prixMarche) ? `<span class="badge warn" title="Au-dessus du prix marché">↑ marché</span>` : ""}</td>
          <td>${transportSelect(`data-m="${i}" data-list="achats" data-j="${j}" data-k="transport"`, a.transport)}</td>
          <td class="r">${inp("achats", j, "coutTransport", a.coutTransport)}</td>
          <td>${delaiOpts("achats", j, a.delai)}</td>
          <td class="r">${fmtE(n0(a.lots) * n0(a.prix))}</td>
          <td><button class="btn danger" data-del="achats" data-j="${j}" title="Supprimer">✕</button></td></tr>`).join("") : `<tr><td colspan="9" class="muted">Aucun achat ce mois-ci.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="row between"><h2>Ventes (négociation clients)</h2><button class="btn" data-add="ventes">+ Ajouter une vente</button></div>
      <p class="muted small">Le stock disponible ce mois-ci : <b>${fmtN(r.lotsDebut + r.achLots)}</b> lots à un coût moyen de <b>${fmtP(r.cmup)}</b>/lot.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Client</th><th class="r">Lots</th><th class="r">Prix/lot</th><th>Transport</th><th class="r">Coût transport (€)</th><th>Encaissement</th><th class="r">CA</th><th class="r">Marge</th><th></th></tr></thead>
        <tbody>${m.ventes.length ? m.ventes.map((v, j) => `<tr>
          <td>${inp("ventes", j, "client", v.client, "text")}</td>
          <td class="r">${inp("ventes", j, "lots", v.lots)}</td>
          <td class="r">${inp("ventes", j, "prix", v.prix, "number", 'step="0.01" class="sm"')}</td>
          <td>${transportSelect(`data-m="${i}" data-list="ventes" data-j="${j}" data-k="transport"`, v.transport, true)}</td>
          <td class="r">${inp("ventes", j, "coutTransport", v.coutTransport)}</td>
          <td>${delaiOpts("ventes", j, v.delai)}</td>
          <td class="r">${fmtE(n0(v.lots) * n0(v.prix))}</td>
          <td class="r ${cls(n0(v.lots) * (n0(v.prix) - r.cmup))}">${fmtE(n0(v.lots) * (n0(v.prix) - r.cmup))}</td>
          <td><button class="btn danger" data-del="ventes" data-j="${j}" title="Supprimer">✕</button></td></tr>`).join("") : `<tr><td colspan="9" class="muted">Aucune vente ce mois-ci.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="grid c2">
      <div class="card">
        <div class="row between"><h2>Autres dépenses / recettes</h2><button class="btn ghost" data-add="depenses">+ Ajouter</button></div>
        <p class="muted small">Pub, pénalités, prêts… Montant positif = dépense, négatif = recette.</p>
        <table><tbody>${m.depenses.length ? m.depenses.map((d, j) => `<tr>
          <td>${inp("depenses", j, "libelle", d.libelle, "text")}</td>
          <td class="r">${inp("depenses", j, "montant", d.montant)}</td>
          <td><button class="btn danger" data-del="depenses" data-j="${j}">✕</button></td></tr>`).join("") : `<tr><td class="muted">Aucune.</td></tr>`}</tbody></table>
        <h3 class="section-gap">Charges automatiques du mois</h3>
        <table><tbody>
          <tr><td>Salaires</td><td class="r">${fmtE(n0(state.params.salaires))}</td></tr>
          <tr><td>Frais de structure</td><td class="r">${fmtE(n0(state.params.structure))}</td></tr>
          <tr><td>Stockage (${state.params.stockageRate} % de ${fmtE(r.valFin)})</td><td class="r">${fmtE(r.stockage)}</td></tr>
          <tr><td>Paiements fournisseurs exigibles</td><td class="r">${fmtE(r.paiementsAchats)}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h2>Notes de l'équipe</h2>
        <label class="field">Phase de planification
          <textarea data-note="planif" data-m="${i}" placeholder="Objectifs, prévisions de demande, décisions…">${esc(m.planif)}</textarea></label>
        <label class="field" style="margin-top:10px">Phase de négociation
          <textarea data-note="nego" data-m="${i}" placeholder="Offres reçues (STECKER…), contre-propositions, résultats…">${esc(m.nego)}</textarea></label>
      </div>
    </div>`;
}

function renderStock(c) {
  const el = document.getElementById("tab-stock");
  const rse = rseSummary(state);
  const maxLots = Math.max(1, ...c.rows.map((r) => r.lotsDebut + r.achLots));
  const cur = c.rows[state.currentMonth];
  const avgVentes = (() => {
    const done = c.rows.filter((r) => r.venLots > 0);
    return done.length ? done.reduce((t, r) => t + r.venLots, 0) / done.length : 0;
  })();
  const couverture = avgVentes ? cur.lotsFin / avgVentes : Infinity;
  el.innerHTML = `
    <div class="grid k4">
      <div class="card kpi"><div class="label">Stock fin ${esc(cur.nom)}</div><div class="value">${fmtN(cur.lotsFin)} lots</div></div>
      <div class="card kpi"><div class="label">Coût moyen (CMUP)</div><div class="value">${fmtP(cur.cmup)}</div><div class="hint">marché ≈ ${fmtP(n0(state.params.prixMarche))}</div></div>
      <div class="card kpi"><div class="label">Couverture</div><div class="value">${Number.isFinite(couverture) ? couverture.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " mois" : "—"}</div><div class="hint">au rythme moyen de ${fmtN(avgVentes)} lots/mois vendus</div></div>
      <div class="card kpi"><div class="label">Coût de stockage du mois</div><div class="value">${fmtE(cur.stockage)}</div><div class="hint">${state.params.stockageRate} % de la valeur du stock</div></div>
    </div>
    <div class="card section-gap">
      <h2>Mouvements de stock (lots)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th class="r">Stock début</th><th class="r">+ Entrées</th><th class="r">Coût entrées</th><th class="r">− Sorties</th><th class="r">Stock fin</th><th class="r">CMUP</th><th class="r">Valeur fin</th><th style="width:22%">Niveau</th></tr></thead>
        <tbody>${c.rows.map((r) => `<tr class="${r.i === state.currentMonth ? "current" : ""}"><td>${esc(r.nom)}</td><td class="r">${fmtN(r.lotsDebut)}</td><td class="r">${fmtN(r.achLots)}</td><td class="r">${r.achLots ? fmtP(r.achVal / r.achLots) : "—"}</td><td class="r">${fmtN(r.venLots)}</td><td class="r ${cls(r.lotsFin)}"><b>${fmtN(r.lotsFin)}</b></td><td class="r">${fmtP(r.cmup)}</td><td class="r">${fmtE(r.valFin)}</td>
          <td><div class="meter" title="${fmtN(r.lotsFin)} lots"><span style="width:${Math.max(0, r.lotsFin) / maxLots * 100}%"></span></div></td></tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>Bilan RSE des transports</h2>
      <p>Note globale : <span class="badge ${rse.cls === "info" ? "warn" : rse.cls}">${esc(rse.label)}</span> ${rse.lots ? `<span class="muted small">(score ${rse.score.toFixed(2)} / 4, 1 = tout en train)</span>` : ""}</p>
      <table><thead><tr><th>Transport</th><th>Impact</th><th class="r">Lots transportés</th><th class="r">Part</th></tr></thead><tbody>
        ${Object.entries(TRANSPORTS).map(([k, t]) => `<tr><td>${k}</td><td><span class="badge ${t.cls}">${t.label}</span></td><td class="r">${fmtN(rse.tot[k] || 0)}</td><td class="r">${rse.lots ? Math.round((rse.tot[k] || 0) / rse.lots * 100) + " %" : "—"}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

function renderSimu(c) {
  const s = ui.simu;
  const sim = structuredClone(state);
  const mi = Math.min(s.mois, sim.months.length - 1);
  const line = { id: "sim", lots: n0(s.lots), prix: n0(s.prix), delai: n0(s.delai), transport: s.transport, coutTransport: n0(s.coutTransport) };
  if (s.type === "achat") sim.months[mi].achats.push({ ...line, fournisseur: "Offre simulée" });
  else sim.months[mi].ventes.push({ ...line, client: "Offre simulée" });
  const c2 = compute(sim);
  const total = n0(s.lots) * n0(s.prix);
  const r1 = c.rows[mi], r2 = c2.rows[mi];
  const ok = c2.minTreso >= 0 && !c2.rows.some((r) => r.stockNeg);
  const ecart = n0(s.prix) - n0(state.params.prixMarche);
  let verdict = "";
  if (s.type === "achat") {
    verdict = ecart > 0 ? `Prix ${fmtP(ecart)} au-dessus du prix marché (${fmtP(n0(state.params.prixMarche))}) : surcoût de ${fmtE(ecart * n0(s.lots))}. Négociez à la baisse ou demandez un délai de paiement.`
      : ecart === 0 ? `Prix égal au prix marché (${fmtP(n0(state.params.prixMarche))}) : correct, mais tentez de négocier un délai de paiement ou un transport plus propre.`
      : `Prix inférieur au marché : bonne affaire (${fmtE(-ecart * n0(s.lots))} d'économie vs marché).`;
  } else {
    const m = n0(s.prix) - r2.cmup;
    verdict = m > 0 ? `Marge unitaire de ${fmtP(m)} sur un coût moyen de ${fmtP(r2.cmup)} → marge totale ${fmtE(m * n0(s.lots))}.` : `Attention : vous vendez sous votre coût moyen (${fmtP(r2.cmup)}).`;
  }
  const el = document.getElementById("tab-simu");
  const focus = document.activeElement?.dataset?.simu;
  el.innerHTML = `
    <div class="card">
      <h2>Tester une offre avant de signer</h2>
      <p class="muted small">Saisissez l'offre reçue (ex. STECKER) ou la proposition à un client : on calcule l'impact sur toute la trésorerie et le stock, sans rien enregistrer.</p>
      <div class="form-grid">
        <label class="field">Type<select data-simu="type"><option value="achat" ${s.type === "achat" ? "selected" : ""}>Achat fournisseur</option><option value="vente" ${s.type === "vente" ? "selected" : ""}>Vente client</option></select></label>
        <label class="field">Mois<select data-simu="mois">${state.months.map((m, k) => `<option value="${k}" ${k === mi ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></label>
        <label class="field">Lots<input type="number" data-simu="lots" value="${s.lots}"></label>
        <label class="field">Prix par lot (€)<input type="number" step="0.01" data-simu="prix" value="${s.prix}"></label>
        <label class="field">${s.type === "achat" ? "Paiement" : "Encaissement"}<select data-simu="delai">${[0, 1, 2, 3].map((d) => `<option value="${d}" ${n0(s.delai) === d ? "selected" : ""}>${d === 0 ? "Mois même" : "M+" + d}</option>`).join("")}</select></label>
        <label class="field">Transport${transportSelect('data-simu="transport"', s.transport)}</label>
        <label class="field">Coût transport (€)<input type="number" data-simu="coutTransport" value="${s.coutTransport}"></label>
      </div>
      <div class="row section-gap"><button class="btn" id="simuApply">Enregistrer cette offre dans ${esc(state.months[mi].nom)}</button><span class="muted small">Montant : ${fmtE(total)}</span></div>
    </div>
    <div class="grid c2">
      <div class="card">
        <h2>Impact</h2>
        <div class="alert ${ok ? "good" : "crit"}"><span class="ico">${ok ? "✓" : "⚠"}</span><span>${ok ? "La trésorerie reste positive sur tout l'horizon." : c2.rows.some((r) => r.stockNeg) ? "Stock insuffisant pour cette vente." : `Trésorerie négative en ${esc(c2.rows[c2.minTresoMonth].nom)} (${fmtE(c2.minTreso)}).`}</span></div>
        <div class="alert info"><span class="ico">i</span><span>${verdict}</span></div>
        <table><thead><tr><th></th><th class="r">Sans l'offre</th><th class="r">Avec l'offre</th></tr></thead><tbody>
          <tr><td>Tréso fin ${esc(r1.nom)}</td><td class="r ${cls(r1.tresoFin)}">${fmtE(r1.tresoFin)}</td><td class="r ${cls(r2.tresoFin)}">${fmtE(r2.tresoFin)}</td></tr>
          <tr><td>Trésorerie minimale</td><td class="r ${cls(c.minTreso)}">${fmtE(c.minTreso)}</td><td class="r ${cls(c2.minTreso)}">${fmtE(c2.minTreso)}</td></tr>
          <tr><td>Stock fin ${esc(r1.nom)}</td><td class="r">${fmtN(r1.lotsFin)}</td><td class="r ${cls(r2.lotsFin)}">${fmtN(r2.lotsFin)}</td></tr>
          <tr><td>CMUP ${esc(r1.nom)}</td><td class="r">${fmtP(r1.cmup)}</td><td class="r">${fmtP(r2.cmup)}</td></tr>
          <tr><td>Résultat cumulé fin d'horizon</td><td class="r">${fmtE(c.rows.at(-1).cumRes)}</td><td class="r">${fmtE(c2.rows.at(-1).cumRes)}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h2>Trésorerie avec l'offre</h2>
        <div class="chart" id="simuChart"></div>
      </div>
    </div>`;
  drawTresoChart(document.getElementById("simuChart"), c2.rows);
  if (focus) { const f = el.querySelector(`[data-simu="${focus}"]`); if (f) { f.focus(); if (f.setSelectionRange && f.type === "text") f.setSelectionRange(99, 99); } }
}

// ---------- conseiller ----------
function adviceRules(c) {
  const p = state.params;
  const out = [];
  const cur = c.rows[state.currentMonth];
  const fixes = n0(p.salaires) + n0(p.structure);
  if (c.minTreso < 0) out.push({ cls: "crit", t: `Trésorerie négative prévue en <b>${esc(c.rows[c.minTresoMonth].nom)}</b> (${fmtE(c.minTreso)}). Leviers : négocier des paiements fournisseurs à M+1/M+2, demander des encaissements clients plus rapides, réduire les volumes achetés ou vendre du stock.` });
  else out.push({ cls: "good", t: `Trésorerie positive sur tout l'horizon (minimum ${fmtE(c.minTreso)} en ${esc(c.rows[c.minTresoMonth].nom)}).` });
  out.push({ cls: "info", t: `Charges fixes : <b>${fmtE(fixes)}/mois</b>, soit ${fmtE(fixes * 12)} sur l'année. Avec un coût moyen de ${fmtP(cur.cmup || n0(p.prixMarche))}, il faut une marge unitaire × volume ≥ ${fmtE(fixes)} chaque mois. Exemple : à 5 €/lot de marge → ${fmtN(fixes / 5)} lots/mois ; à 8 €/lot → ${fmtN(fixes / 8)} lots/mois.` });
  const si = state.stockInitial;
  if (n0(si.prix) > n0(p.prixMarche)) out.push({ cls: "warn", t: `Le stock de départ a coûté ${fmtP(n0(si.prix))}/lot contre ~${fmtP(n0(p.prixMarche))} sur le marché : ${fmtE((n0(si.prix) - n0(p.prixMarche)) * n0(si.lots))} de surcoût. Prochains achats : visez ≤ ${fmtP(n0(p.prixMarche))} pour faire baisser le CMUP, et mettez STECKER en concurrence.` });
  if (n0(si.moisPaiement) === 0 && state.currentMonth === 0) out.push({ cls: "warn", t: `Fin janvier, le stock de départ (${fmtE(n0(si.lots) * n0(si.prix))}) + ${fmtE(fixes)} de charges sortent de la trésorerie. Prévoyez des ventes encaissées dès janvier si possible.` });
  const dearBuys = [];
  state.months.forEach((m) => m.achats.forEach((a) => { if (n0(a.prix) > n0(p.prixMarche)) dearBuys.push(`${m.nom} (${a.fournisseur || "?"} à ${fmtP(n0(a.prix))})`); }));
  if (dearBuys.length) out.push({ cls: "warn", t: `Achats au-dessus du prix marché : ${esc(dearBuys.join(", "))}.` });
  const avgV = c.rows.filter((r) => r.venLots > 0);
  const moy = avgV.length ? avgV.reduce((t, r) => t + r.venLots, 0) / avgV.length : 0;
  if (moy && cur.lotsFin / moy > 3) out.push({ cls: "warn", t: `Stock élevé : ${(cur.lotsFin / moy).toFixed(1)} mois de ventes. Chaque mois il coûte ${fmtE(cur.stockage)} de stockage et immobilise ${fmtE(cur.valFin)} de trésorerie.` });
  if (moy && cur.lotsFin / moy < 1) out.push({ cls: "warn", t: `Stock faible : moins d'un mois de ventes. Anticipez les achats pour ne pas rater des ventes.` });
  const rse = rseSummary(state);
  if (rse.lots && rse.score > 1.6) out.push({ cls: "warn", t: `RSE : ${esc(rse.label)}. Privilégiez le train (peu polluant) quand le délai le permet, l'avion seulement en urgence.` });
  if (!rse.lots) out.push({ cls: "info", t: `RSE : pensez au transport lors des négociations — train &gt; camion &gt; bateau &gt; avion.` });
  const negRes = c.rows.filter((r) => r.i <= state.currentMonth && r.resultat < 0).length;
  if (negRes) out.push({ cls: "info", t: `${negRes} mois avec un résultat négatif jusqu'ici : vérifiez le prix de vente minimal = CMUP + charges fixes / volume vendu.` });
  return out;
}

function contextForAI(c) {
  const rows = c.rows.map((r) => ({
    mois: r.nom, tresoDebut: Math.round(r.tresoDebut), encaissements: Math.round(r.encaissements), paiementsFournisseurs: Math.round(r.paiementsAchats),
    chargesFixes: r.fixes, stockage: Math.round(r.stockage), transportEtDivers: Math.round(r.transport + r.divers), tresoFin: Math.round(r.tresoFin),
    lotsAchetes: r.achLots, lotsVendus: r.venLots, stockFin: r.lotsFin, cmup: +r.cmup.toFixed(2), CA: Math.round(r.ca), resultat: Math.round(r.resultat),
  }));
  const details = state.months.map((m) => ({
    mois: m.nom,
    achats: m.achats.map((a) => ({ fournisseur: a.fournisseur, produit: a.produit, lots: n0(a.lots), prix: n0(a.prix), transport: a.transport, coutTransport: n0(a.coutTransport), paiement: n0(a.delai) ? "M+" + a.delai : "mois même" })),
    ventes: m.ventes.map((v) => ({ client: v.client, lots: n0(v.lots), prix: n0(v.prix), transport: v.transport || null, encaissement: n0(v.delai) ? "M+" + v.delai : "mois même" })),
    autres: m.depenses.map((d) => ({ libelle: d.libelle, montant: n0(d.montant) })),
    notesPlanification: m.planif || undefined, notesNegociation: m.nego || undefined,
  })).filter((m) => m.achats.length || m.ventes.length || m.autres.length || m.notesPlanification || m.notesNegociation);
  return `<etat_entreprise mois_en_cours="${state.months[state.currentMonth].nom}">
Paramètres : ${JSON.stringify(state.params)}
Stock initial : ${JSON.stringify(state.stockInitial)}
Projection mensuelle (calculée par l'outil, mois futurs = prévision selon les saisies) :
${JSON.stringify(rows)}
Opérations saisies et notes :
${JSON.stringify(details)}
Trésorerie minimale prévue : ${Math.round(c.minTreso)} € en ${c.rows[c.minTresoMonth]?.nom}
RSE : ${JSON.stringify(rseSummary(state))}
</etat_entreprise>`;
}

const SYSTEM_PROMPT = (rules) => `Tu es le conseiller stratégique d'une équipe d'étudiants dans un jeu d'entreprise (business game). Ils dirigent un distributeur de bouchons de liège : ils achètent des lots à des fournisseurs (dont STECKER, fournisseur allemand historique) et les revendent à des clients. Chaque "mois" du jeu comporte une phase de planification puis une phase de négociation.

Objectif de l'équipe : être la meilleure entreprise (résultat, part de marché, RSE) sans jamais avoir une trésorerie négative.

Règles et informations du jeu connues :
${rules}

Comment répondre :
- Réponds en français, de façon concrète et chiffrée, à partir des données de l'état de l'entreprise fourni dans chaque message. Fais les calculs (trésorerie, marge, CMUP, point mort) plutôt que de rester général.
- Pour une offre de négociation : dis s'il faut accepter, refuser ou contre-proposer, avec un prix/volume/délai/transport cible et l'argument à utiliser.
- Signale toujours un risque de trésorerie négative et la marge de sécurité restante.
- Tiens compte de l'impact RSE des transports (train < camion < bateau < avion en pollution) et des frais de stockage (0,33 % de la valeur du stock final).
- S'il te manque une information pour bien conseiller (demande clients, prix de vente pratiqués, délais, concurrents…), dis précisément laquelle demander au jeu.
- Sois synthétique : des puces courtes, la recommandation en premier.`;

function mdToHtml(t) {
  let h = esc(t);
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/^#{1,4} (.+)$/gm, "<b>$1</b>");
  const lines = h.split("\n");
  let out = "", inList = false;
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${m[1]}</li>`; }
    else { if (inList) { out += "</ul>"; inList = false; } out += l.trim() ? l + "<br>" : "<br>"; }
  }
  if (inList) out += "</ul>";
  return out.replace(/(<br>){3,}/g, "<br><br>");
}

function getKey() { try { return localStorage.getItem(KEY_KEY) || ""; } catch { return ""; } }

function renderIA(c) {
  const el = document.getElementById("tab-ia");
  const key = getKey();
  const advice = adviceRules(c);
  const prevScroll = el.querySelector(".chat")?.scrollTop;
  el.innerHTML = `
    <div class="grid c2">
      <div class="card">
        <h2>Diagnostic automatique</h2>
        <p class="muted small">Calculé à partir de vos saisies, sans IA. Se met à jour en direct.</p>
        ${advice.map((a) => `<div class="alert ${a.cls}"><span>${a.t}</span></div>`).join("")}
      </div>
      <div class="card">
        <h2>Discuter avec Claude</h2>
        ${key ? `<p class="muted small">Clé API enregistrée dans ce navigateur uniquement. <button class="btn ghost" id="forgetKey" style="padding:2px 8px">Oublier la clé</button></p>`
        : `<p class="small">Pour activer l'IA, collez une clé API Anthropic (console.anthropic.com → API Keys). Elle reste <b>uniquement dans votre navigateur</b> et n'est jamais incluse dans l'export ni dans le lien partagé.</p>
           <div class="row"><input type="password" id="apiKey" placeholder="sk-ant-…" style="flex:1"><button class="btn" id="saveKey">Enregistrer</button></div>`}
        <div class="suggestions">
          ${["Quelle stratégie pour ce mois ?", "STECKER nous propose une offre, que faire ?", "Quel prix de vente minimum ?", "Comment éviter une trésorerie négative ?", "Quelles infos demander au jeu ?"].map((q) => `<button class="pill" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
        </div>
        <div class="chat" id="chat">${state.chat.length ? state.chat.map((m) => `<div class="msg ${m.role}${m.err ? " err" : ""}">${m.role === "assistant" ? mdToHtml(m.text) : esc(m.text).replace(/\n/g, "<br>")}</div>`).join("") : `<p class="muted small">Posez une question : l'IA reçoit automatiquement l'état complet de votre entreprise (trésorerie, stock, offres, notes).</p>`}</div>
        <div class="chat-input">
          <textarea id="chatInput" placeholder="Ex : STECKER propose 10 000 lots à 22,50 € payables M+1 par camion, on accepte ?" ${ui.busy ? "disabled" : ""}></textarea>
          <div style="display:flex;flex-direction:column;gap:6px"><button class="btn" id="sendChat" ${ui.busy || !key ? "disabled" : ""}>${ui.busy ? "…" : "Envoyer"}</button><button class="btn ghost" id="clearChat" title="Effacer la conversation">Effacer</button></div>
        </div>
      </div>
    </div>`;
  const chat = el.querySelector(".chat");
  if (chat) chat.scrollTop = prevScroll ?? chat.scrollHeight;
}

let Anthropic = null;
async function askClaude(question) {
  const key = getKey();
  if (!key || !question.trim()) return;
  state.chat.push({ role: "user", text: question.trim() });
  const reply = { role: "assistant", text: "" };
  state.chat.push(reply);
  ui.busy = true; save(); render(); scrollChat();
  try {
    if (!Anthropic) Anthropic = (await import("https://esm.sh/@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const c = compute(state);
    const history = state.chat.slice(0, -1).filter((m) => !m.err && m.text).slice(-20);
    const messages = history.map((m, idx) => ({
      role: m.role,
      content: idx === history.length - 1 ? `${contextForAI(c)}\n\nQuestion de l'équipe : ${m.text}` : m.text,
    }));
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT(state.rules),
      messages,
    });
    stream.on("text", (t) => { reply.text += t; updateLastMsg(reply.text); });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") { reply.text += "\n\n(La requête a été refusée par le modèle. Reformulez la question.)"; }
    if (final.stop_reason === "max_tokens") { reply.text += "\n\n(Réponse tronquée.)"; }
    if (!reply.text) reply.text = "(Pas de réponse.)";
  } catch (e) {
    reply.err = true;
    const status = e?.status;
    reply.text = status === 401 ? "Clé API invalide (401). Vérifiez la clé dans l'onglet Conseiller IA."
      : status === 429 ? "Trop de requêtes ou crédit épuisé (429). Réessayez dans un instant."
      : `Erreur : ${e?.message || e}`;
  } finally {
    ui.busy = false; save(); render(); scrollChat();
  }
}
function updateLastMsg(text) {
  const msgs = document.querySelectorAll("#chat .msg.assistant");
  const last = msgs[msgs.length - 1];
  if (last) { last.innerHTML = mdToHtml(text); scrollChat(); }
}
function scrollChat() { const ch = document.getElementById("chat"); if (ch) ch.scrollTop = ch.scrollHeight; }

// ---------- paramètres ----------
function renderParams() {
  const el = document.getElementById("tab-params");
  const p = state.params, si = state.stockInitial;
  const f = (path, label, v, step = "1") => `<label class="field">${label}<input type="number" step="${step}" data-param="${path}" value="${esc(v)}"></label>`;
  el.innerHTML = `
    <div class="card">
      <h2>Paramètres du jeu</h2>
      <div class="form-grid">
        <label class="field">Nom de l'équipe<input type="text" data-param="team" value="${esc(state.team)}"></label>
        ${f("params.capital", "Capital de départ (€)", p.capital)}
        ${f("params.salaires", "Salaires mensuels (€)", p.salaires)}
        ${f("params.structure", "Frais de structure mensuels (€)", p.structure)}
        ${f("params.stockageRate", "Frais de stockage (% du stock final)", p.stockageRate, "0.01")}
        ${f("params.prixMarche", "Prix d'achat marché (€/lot)", p.prixMarche, "0.01")}
        ${f("params.seuilTreso", "Seuil d'alerte trésorerie (€)", p.seuilTreso)}
      </div>
      <h3 class="section-gap">Stock de départ</h3>
      <div class="form-grid">
        ${f("stockInitial.lots", "Lots", si.lots)}
        ${f("stockInitial.prix", "Coût d'achat (€/lot)", si.prix, "0.01")}
        <label class="field">Payé en<select data-param="stockInitial.moisPaiement">${state.months.map((m, k) => `<option value="${k}" ${k === n0(si.moisPaiement) ? "selected" : ""}>fin ${esc(m.nom)}</option>`).join("")}</select></label>
      </div>
      <h3 class="section-gap">Mois du jeu</h3>
      <div class="row"><span class="muted small">${state.months.length} mois.</span><button class="btn ghost" id="addMonth">+ Ajouter un mois</button><button class="btn ghost" id="delMonth" ${state.months.length <= 1 ? "disabled" : ""}>− Retirer le dernier mois</button></div>
    </div>
    <div class="card">
      <h2>Règles et infos du jeu (lues par l'IA)</h2>
      <p class="muted small">Ajoutez ici toute nouvelle info donnée par le jeu : demande des clients, prix de vente, nouveaux fournisseurs, événements… L'IA s'en sert pour ses conseils.</p>
      <textarea id="rules" style="min-height:220px">${esc(state.rules)}</textarea>
    </div>
    <div class="card">
      <h2>Partager avec le groupe</h2>
      <p class="small">Les données sont enregistrées dans <b>votre navigateur</b>. Pour que tout le groupe voie la même chose, partagez le lien ou le fichier après chaque mise à jour.</p>
      <div class="row">
        <button class="btn" id="shareLink">Copier un lien de partage</button>
        <button class="btn ghost" id="exportJson">Exporter (.json)</button>
        <label class="btn ghost" style="display:inline-block">Importer (.json)<input type="file" id="importJson" accept="application/json,.json" hidden></label>
        <button class="btn danger" id="resetAll" style="padding:7px 14px">Tout réinitialiser</button>
      </div>
      <p class="muted small">La clé API n'est jamais incluse dans le lien ni dans l'export.</p>
    </div>`;
}

// ---------- événements ----------
function setPath(obj, path, val) {
  const ks = path.split(".");
  let o = obj;
  while (ks.length > 1) o = o[ks.shift()];
  o[ks[0]] = val;
}
const NUM_KEYS = new Set(["lots", "prix", "coutTransport", "montant", "delai"]);

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-tab]");
  if (!t) return;
  if (t.dataset.tab) {
    ui.tab = t.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === t));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + ui.tab));
    try { localStorage.setItem(STORE_KEY + "-tab", ui.tab); } catch {}
    return;
  }
  if (t.dataset.editmonth !== undefined) { ui.editMonth = +t.dataset.editmonth; render(); return; }
  if (t.dataset.add) {
    const m = state.months[ui.editMonth];
    const pm = n0(state.params.prixMarche);
    if (t.dataset.add === "achats") m.achats.push({ id: uid(), fournisseur: "STECKER", produit: "Bouchons agglomérés", lots: 5000, prix: pm, transport: "Train", coutTransport: 0, delai: 0 });
    if (t.dataset.add === "ventes") m.ventes.push({ id: uid(), client: "", lots: 1000, prix: 30, transport: "", coutTransport: 0, delai: 0 });
    if (t.dataset.add === "depenses") m.depenses.push({ id: uid(), libelle: "", montant: 0 });
    save(); render(); return;
  }
  if (t.dataset.del) { state.months[ui.editMonth][t.dataset.del].splice(+t.dataset.j, 1); save(); render(); return; }
  if (t.dataset.q) { const ci = document.getElementById("chatInput"); if (ci) { ci.value = t.dataset.q; ci.focus(); } return; }
  switch (t.id) {
    case "themeBtn": {
      const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem(STORE_KEY + "-theme", document.documentElement.dataset.theme); } catch {}
      break;
    }
    case "saveKey": {
      const v = document.getElementById("apiKey").value.trim();
      if (v) { try { localStorage.setItem(KEY_KEY, v); } catch {} render(); toast("Clé enregistrée dans ce navigateur"); }
      break;
    }
    case "forgetKey": try { localStorage.removeItem(KEY_KEY); } catch {} render(); break;
    case "sendChat": { const v = document.getElementById("chatInput").value; askClaude(v); break; }
    case "clearChat": state.chat = []; save(); render(); break;
    case "simuApply": {
      const s = ui.simu; const m = state.months[s.mois];
      const line = { id: uid(), lots: n0(s.lots), prix: n0(s.prix), delai: n0(s.delai), transport: s.transport, coutTransport: n0(s.coutTransport) };
      if (s.type === "achat") m.achats.push({ ...line, fournisseur: "STECKER", produit: "Bouchons agglomérés" }); else m.ventes.push({ ...line, client: "" });
      save(); render(); toast(`Offre enregistrée dans ${m.nom}`); break;
    }
    case "addMonth": state.months.push({ nom: `Mois ${state.months.length + 1}`, achats: [], ventes: [], depenses: [], planif: "", nego: "" }); save(); render(); break;
    case "delMonth": {
      const last = state.months.at(-1);
      if ((last.achats.length || last.ventes.length || last.depenses.length) && !confirm(`Supprimer ${last.nom} et ses opérations ?`)) break;
      state.months.pop(); state.currentMonth = Math.min(state.currentMonth, state.months.length - 1); ui.editMonth = Math.min(ui.editMonth, state.months.length - 1); save(); render(); break;
    }
    case "shareLink": {
      const data = { ...state, chat: [] };
      const url = location.origin + location.pathname + "#data=" + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      navigator.clipboard?.writeText(url).then(() => toast("Lien copié : envoyez-le au groupe"), () => prompt("Copiez ce lien :", url));
      break;
    }
    case "exportJson": {
      const blob = new Blob([JSON.stringify({ ...state }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pilotage-bouchons-${state.months[state.currentMonth].nom.toLowerCase()}.json`;
      a.click(); URL.revokeObjectURL(a.href); break;
    }
    case "resetAll": if (confirm("Effacer toutes les données et repartir des valeurs de départ ?")) { state = defaultState(); ui.editMonth = 0; save(); render(); } break;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "currentMonth") { state.currentMonth = +t.value; ui.editMonth = state.currentMonth; ui.simu.mois = state.currentMonth; save(); render(); return; }
  if (t.dataset.list) {
    const item = state.months[+t.dataset.m][t.dataset.list][+t.dataset.j];
    item[t.dataset.k] = NUM_KEYS.has(t.dataset.k) ? n0(t.value) : t.value;
    save(); render(); return;
  }
  if (t.dataset.param) {
    const path = t.dataset.param;
    setPath(state, path, path === "team" ? t.value : n0(t.value));
    save(); render(); return;
  }
  if (t.id === "importJson" && t.files[0]) {
    t.files[0].text().then((txt) => {
      try { state = migrate(JSON.parse(txt)); ui.editMonth = state.currentMonth; save(); render(); toast("Données importées"); }
      catch { toast("Fichier invalide"); }
    });
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.note) { state.months[+t.dataset.m][t.dataset.note] = t.value; save(); return; }
  if (t.id === "rules") { state.rules = t.value; save(); return; }
  if (t.dataset.simu) {
    const k = t.dataset.simu;
    ui.simu[k] = ["type", "transport"].includes(k) ? t.value : n0(t.value);
    renderSimu(compute(state));
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.id === "chatInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askClaude(e.target.value); }
});

let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// init
try {
  const th = localStorage.getItem(STORE_KEY + "-theme"); if (th) document.documentElement.dataset.theme = th;
  const tab = localStorage.getItem(STORE_KEY + "-tab"); if (tab) ui.tab = tab;
} catch {}
document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + ui.tab));
save();
render();
