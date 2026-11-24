// Pilotage Bouchons — suivi trésorerie / stock / stratégie
// Tout est stocké dans le navigateur (localStorage). Partage via export JSON ou lien.

// Numéro de version affiché dans l'en-tête : à augmenter à chaque mise à jour du site
const APP_VERSION = "1.6";
const APP_DATE = "24/11/2026";
const STORE_KEY = "pilotage-bouchons-v1";
const KEY_KEY = "pilotage-bouchons-apikey";
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const PRODUITS = ["Agglomérés", "Q1", "Q2", "Q3", "Q4"];
const SEGMENTS = ["Vignerons", "Caves", "Négociants"];
const SEG_LABEL = { Vignerons: "Vignerons", Caves: "Caves", "Négociants": "Négociants / Grands comptes" };
const DELAIS = ["Comptant", "30 jours", "60 jours"];
const STATUTS = [["Validée (comptée)", "validee"], ["En négociation", "nego"], ["Refusée / annulée", "refusee"]];
const LIVRAISONS = [["Instantané (distributeur)", 0], ["30 jours (industriel)", 1], ["60 jours", 2]];
const TRANSPORTS = {
  Train: { score: 1, label: "Peu polluant", cls: "good" },
  Camion: { score: 2, label: "Plutôt polluant", cls: "warn" },
  Bateau: { score: 3, label: "Polluant", cls: "warn" },
  Avion: { score: 4, label: "Très polluant", cls: "crit" },
};
const DEFAULT_PRIX_CLIENTS = {
  Vignerons: { Q1: [160, 200], Q2: [140, 180], Q3: [120, 160], Q4: [100, 140], "Agglomérés": [40, 80] },
  Caves: { Q1: [145, 170], Q2: [125, 150], Q3: [105, 130], Q4: [85, 110], "Agglomérés": [25, 50] },
  "Négociants": { Q1: [130, 150], Q2: [110, 130], Q3: [90, 110], Q4: [70, 90], "Agglomérés": [10, 30] },
};

const RULES_PLANIF = `
Phase de planification (chaque mois) — « Positionnement Marketing » :
- Pour chaque segment client (Vignerons, Caves, Négociants / Grands comptes) on fixe un prix des Agglomérés (€/lot) et un délai de paiement (comptant, 30 jours ou 60 jours). Un prix hors fourchette est ramené automatiquement au plancher ou au plafond.
- On fixe aussi un budget « Publicité Produits » Agglomérés (€) : il stimule la demande uniquement sur le mois en cours.
Fourchettes de prix clients (€/lot, min–max) :
- Vignerons : Q1 160–200, Q2 140–180, Q3 120–160, Q4 100–140, Agglomérés 40–80
- Caves : Q1 145–170, Q2 125–150, Q3 105–130, Q4 85–110, Agglomérés 25–50
- Négociants / Grands comptes : Q1 130–150, Q2 110–130, Q3 90–110, Q4 70–90, Agglomérés 10–30
Délais de livraison : Industriel → Distributeur 30 jours ; Distributeur → Distributeur instantané ; Distributeur → Client final 30 jours.
Délais de paiement : à négocier à tous les niveaux (industriel, distributeur, client final).`;

const RULES_DISTRIB = `
Fonctionnement du rôle de distributeur :
- Phase 2 (négociation), étape A « Ventes » : le jeu affiche la quantité commandée par chaque segment suite aux réglages de la phase 1. Si le stock couvre la demande, tout est livré. En pénurie, on répartit soi-même les lots livrés (sans dépasser la demande de chaque client) ; toute demande non honorée est perdue et part chez les concurrents.
- Étape B « Négociations » : les achats faits ce mois-ci n'arrivent en stock qu'au début du mois suivant. On estime les besoins à partir des commandes observées à l'étape A.
- Proposition d'achat : fournisseur industriel, délai de paiement (comptant, 30 ou 60 jours), produit (les agglomérés sont sous « Bouchons triés »), quantité et prix unitaire ; plusieurs lignes possibles dans un devis (ex. volume principal + volume additionnel à prix réduit).
- Une offre acceptée par les deux parties est irréversible ; on peut annuler tant qu'elle n'est pas acceptée. Mieux vaut négocier avec l'industriel avant d'envoyer l'offre officielle.`;

const DEFAULT_RULES = `Distributeur de bouchons de liège.
- Capital de départ : 500 000 €
- Salaires mensuels : 40 000 €
- Frais de structure mensuels : 20 000 €
- Stock de départ : 12 000 lots de bouchons agglomérés à 25 €/lot, à payer fin janvier
- Frais de stockage : 0,33 % de la valeur du stock restant en fin de mois
- Prix d'achat moyen constaté auprès des industriels : environ 21 €/lot (agglomérés)
- Impact RSE du transport : Avion très polluant, Bateau polluant, Camion plutôt polluant, Train peu polluant
- Fournisseur historique allemand : STECKER (offres reçues automatiquement en négociation)
- Chaque mois : une phase de planification puis une phase de négociation (négociations + ventes).
- Objectif : être la meilleure entreprise sans jamais avoir une trésorerie négative.
${RULES_PLANIF}
${RULES_DISTRIB}`;

const uid = () => Math.random().toString(36).slice(2, 9);
const n0 = (v) => (Number.isFinite(+v) ? +v : 0);
const emptyMarketing = () => ({ Vignerons: { prix: 0, delai: 0 }, Caves: { prix: 0, delai: 0 }, "Négociants": { prix: 0, delai: 0 }, pub: 0 });
const emptyLivraisons = () => Object.fromEntries(SEGMENTS.map((s) => [s, { demande: 0, livre: 0 }]));
const emptyMonth = (nom) => ({ nom, marketing: emptyMarketing(), livraisons: emptyLivraisons(), achats: [], ventes: [], depenses: [], planif: "", nego: "" });

function defaultState() {
  return {
    version: 2,
    team: "Notre entreprise",
    currentMonth: 0,
    params: { capital: 500000, salaires: 40000, structure: 20000, stockageRate: 0.33, prixMarche: 21, seuilTreso: 50000 },
    stockInitial: { lots: 12000, prix: 25, moisPaiement: 0, produit: "Agglomérés" },
    prixClients: structuredClone(DEFAULT_PRIX_CLIENTS),
    months: MOIS.map(emptyMonth),
    rules: DEFAULT_RULES,
    chat: [],
  };
}

let state = load();
let ui = {
  tab: "dashboard", editMonth: state.currentMonth, busy: false,
  simu: { type: "achat", produit: "Agglomérés", segment: "Vignerons", lots: 5000, prix: 21, delai: 1, livraison: 1, transport: "Train", coutTransport: 0, mois: state.currentMonth },
};

function load() {
  try {
    const fromHash = readHash();
    if (fromHash) return fromHash;
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return defaultState();
}
function normProduit(p) {
  if (!p) return "Agglomérés";
  if (PRODUITS.includes(p)) return p;
  if (/aggl/i.test(p)) return "Agglomérés";
  const q = String(p).match(/Q[1-4]/i);
  return q ? q[0].toUpperCase() : "Agglomérés";
}
function migrate(s) {
  const d = defaultState();
  const out = {
    ...d, ...s,
    params: { ...d.params, ...(s.params || {}) },
    stockInitial: { ...d.stockInitial, ...(s.stockInitial || {}) },
    prixClients: { ...d.prixClients, ...(s.prixClients || {}) },
  };
  out.stockInitial.produit = normProduit(out.stockInitial.produit);
  out.months = (s.months || d.months).map((m) => ({
    ...emptyMonth(m.nom), ...m,
    marketing: { ...emptyMarketing(), ...(m.marketing || {}) },
    livraisons: { ...emptyLivraisons(), ...(m.livraisons || {}) },
    achats: (m.achats || []).map((a) => ({ livraison: 1, statut: "validee", ...a, produit: normProduit(a.produit), delai: Math.min(2, n0(a.delai)) })),
    ventes: (m.ventes || []).map((v) => ({ segment: SEGMENTS.includes(v.segment) ? v.segment : "Vignerons", ...v, produit: normProduit(v.produit), delai: Math.min(2, n0(v.delai)) })),
  }));
  out.months.forEach((m) => SEGMENTS.forEach((sg) => { m.marketing[sg].delai = Math.min(2, n0(m.marketing[sg].delai)); }));
  if (out.rules && !out.rules.includes("Positionnement Marketing")) out.rules += "\n" + RULES_PLANIF;
  if (out.rules && !out.rules.includes("rôle de distributeur")) out.rules += "\n" + RULES_DISTRIB;
  out.rules = out.rules.replace("(« À la commande » ou plus)", "(comptant, 30 jours ou 60 jours)");
  out.version = 2;
  return out;
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
const range = (seg, prod) => state.prixClients?.[seg]?.[prod] || null;
// Prix effectif comme dans le jeu : ramené dans la fourchette (0 = non saisi → plancher)
function clampPrix(seg, prod, prix) {
  const r = range(seg, prod);
  if (!r) return n0(prix);
  return Math.min(r[1], Math.max(r[0], n0(prix)));
}
// Lignes de vente effectives d'un mois : livraisons par segment (agglomérés) + autres ventes
function ventesDuMois(m) {
  const seg = SEGMENTS.map((sg) => ({
    segment: sg, client: SEG_LABEL[sg], produit: "Agglomérés", lots: n0(m.livraisons?.[sg]?.livre),
    prix: clampPrix(sg, "Agglomérés", m.marketing[sg].prix), delai: n0(m.marketing[sg].delai), transport: "", coutTransport: 0, auto: true,
  })).filter((v) => v.lots > 0);
  return [...seg, ...m.ventes];
}
const achatsValides = (m) => m.achats.filter((a) => (a.statut || "validee") === "validee");

function compute(s) {
  const p = s.params;
  const n = s.months.length;
  const H = n + 24;
  const enc = Array(H).fill(0);
  const decAch = Array(H).fill(0);
  const arrivals = Array.from({ length: H }, () => ({}));
  const si = s.stockInitial;
  decAch[n0(si.moisPaiement)] += n0(si.lots) * n0(si.prix);

  const stock = Object.fromEntries(PRODUITS.map((pr) => [pr, { lots: 0, val: 0 }]));
  stock[si.produit] = { lots: n0(si.lots), val: n0(si.lots) * n0(si.prix) };
  let treso = n0(p.capital);
  let cumRes = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = s.months[i];
    const lotsDebut = PRODUITS.reduce((t, pr) => t + stock[pr].lots, 0);
    let cmdLots = 0, cmdVal = 0, transport = 0;
    const rse = {};
    for (const a of achatsValides(m)) {
      const l = n0(a.lots), pr = n0(a.prix), prod = normProduit(a.produit);
      cmdLots += l; cmdVal += l * pr; transport += n0(a.coutTransport);
      decAch[i + n0(a.delai)] += l * pr;
      const arr = arrivals[i + n0(a.livraison)];
      arr[prod] = arr[prod] || { lots: 0, val: 0 };
      arr[prod].lots += l; arr[prod].val += l * pr;
      rse[a.transport] = (rse[a.transport] || 0) + l;
    }
    // réceptions du mois
    let recLots = 0, recVal = 0;
    for (const [prod, a] of Object.entries(arrivals[i])) {
      stock[prod].lots += a.lots; stock[prod].val += a.val; recLots += a.lots; recVal += a.val;
    }
    const cmupP = {};
    const dispoP = {};
    for (const pr of PRODUITS) { dispoP[pr] = stock[pr].lots; cmupP[pr] = stock[pr].lots > 0 ? stock[pr].val / stock[pr].lots : 0; }
    let venLots = 0, ca = 0, coutVentes = 0;
    const venteP = {};
    for (const v of ventesDuMois(m)) {
      const l = n0(v.lots), pr = n0(v.prix), prod = normProduit(v.produit);
      venLots += l; ca += l * pr; coutVentes += l * cmupP[prod];
      venteP[prod] = (venteP[prod] || 0) + l;
      enc[i + n0(v.delai)] += l * pr;
      transport += n0(v.coutTransport);
      if (v.transport) rse[v.transport] = (rse[v.transport] || 0) + l;
    }
    let lotsFin = 0, valFin = 0;
    const finP = {};
    let stockNeg = false;
    for (const pr of PRODUITS) {
      const lf = stock[pr].lots - (venteP[pr] || 0);
      if (lf < 0) stockNeg = true;
      // Un stock négatif (sur-vente) n'est pas reporté : le jeu ne permet pas de livrer plus que le stock
      stock[pr] = { lots: Math.max(0, lf), val: Math.max(0, lf) * cmupP[pr] };
      finP[pr] = lf; lotsFin += lf; valFin += stock[pr].val;
    }
    const demande = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons?.[sg]?.demande), 0);
    const perdue = SEGMENTS.reduce((t, sg) => t + Math.max(0, n0(m.livraisons?.[sg]?.demande) - n0(m.livraisons?.[sg]?.livre)), 0);
    let transit = 0;
    for (let k = i + 1; k < H; k++) for (const a of Object.values(arrivals[k])) transit += a.lots;
    const stockage = valFin * n0(p.stockageRate) / 100;
    const pub = n0(m.marketing?.pub);
    const divers = m.depenses.reduce((t, d) => t + n0(d.montant), 0) + pub;
    const fixes = n0(p.salaires) + n0(p.structure);
    const decaiss = fixes + stockage + transport + divers + decAch[i];
    const tresoDebut = treso;
    const tresoFin = treso + enc[i] - decaiss;
    const resultat = ca - coutVentes - fixes - stockage - transport - divers;
    cumRes += resultat;
    rows.push({
      i, nom: m.nom, tresoDebut, encaissements: enc[i], paiementsAchats: decAch[i], fixes, stockage, transport, divers, pub,
      decaissements: decaiss, tresoFin, cmdLots, cmdVal, recLots, recVal, venLots, ca, coutVentes, lotsDebut, lotsFin, valFin, transit,
      demande, perdue, cmup: cmupP["Agglomérés"], cmupP, dispoP, finP, venteP, resultat, cumRes, marge: ca - coutVentes, rse, stockNeg,
    });
    treso = tresoFin;
  }
  const cur = s.currentMonth;
  const aEncaisser = enc.slice(cur + 1).reduce((a, b) => a + b, 0);
  const aPayer = decAch.slice(cur + 1).reduce((a, b) => a + b, 0);
  let minT = Infinity, minI = -1;
  rows.forEach((r) => { if (r.tresoFin < minT) { minT = r.tresoFin; minI = r.i; } });
  return { rows, aEncaisser, aPayer, minTreso: minT, minTresoMonth: minI };
}

function rseSummary(s) {
  const tot = {};
  s.months.forEach((m) => {
    achatsValides(m).forEach((a) => { tot[a.transport] = (tot[a.transport] || 0) + n0(a.lots); });
    ventesDuMois(m).forEach((v) => { if (v.transport) tot[v.transport] = (tot[v.transport] || 0) + n0(v.lots); });
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

// Prix de vente minimum pour couvrir le coût d'achat + toutes les charges du mois
function seuilRentable(r) {
  const charges = r.fixes + r.stockage + r.transport + r.divers; // divers inclut pub et autres dépenses
  const cm = r.cmupP["Agglomérés"];
  let vol = r.venLots, base = "lots vendus ce mois";
  if (!vol) { vol = r.demande; base = "demande saisie"; }
  if (!vol) { vol = r.dispoP["Agglomérés"]; base = "si tout le stock disponible est vendu"; }
  const prix = (v) => (v > 0 ? cm + charges / v : Infinity);
  return { charges, cm, vol, base, prix: prix(vol), at: prix };
}
function seuilHtml(r, compact) {
  const s = seuilRentable(r);
  if (!Number.isFinite(s.prix)) return `<span class="muted">Prix rentable : pas de stock vendable ce mois.</span>`;
  const ex = [2000, 5000, 10000].filter((v) => v !== s.vol).map((v) => `${fmtN(v)} lots → ${fmtP(s.at(v))}`).join(" · ");
  return compact
    ? `Prix minimum rentable : <b>${fmtP(s.prix)}</b>/lot <span class="muted">(${fmtN(s.vol)} lots, ${esc(s.base)})</span>`
    : `<b>${fmtP(s.prix)}</b>/lot = coût d'achat ${fmtP(s.cm)} + charges ${fmtE(s.charges)} ÷ ${fmtN(s.vol)} lots <span class="muted">(${esc(s.base)})</span><br><span class="muted small">Autres volumes : ${ex}</span>`;
}

function priceBadge(seg, prod, prix) {
  const r = range(seg, prod);
  if (!r || !n0(prix)) return "";
  if (prix < r[0]) return `<span class="badge warn" title="Fourchette ${r[0]}–${r[1]} €">sous le min (${r[0]} €)</span>`;
  if (prix > r[1]) return `<span class="badge crit" title="Fourchette ${r[0]}–${r[1]} €">au-dessus du max (${r[1]} €)</span>`;
  return `<span class="badge good" title="Fourchette ${r[0]}–${r[1]} €">${r[0]}–${r[1]} €</span>`;
}

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
    if (r.stockNeg) {
      const pr = PRODUITS.filter((x) => r.finP[x] < 0).join(", ");
      out.push({ cls: "crit", t: `<b>${r.nom}</b> : ventes supérieures au stock disponible (${esc(pr)}). Rappel : un achat chez un industriel n'arrive que 30 jours plus tard.` });
    }
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
      <div class="card kpi"><div class="label">Stock fin ${esc(cur.nom)}</div><div class="value">${fmtN(cur.lotsFin)} lots</div><div class="hint">valeur ${fmtE(cur.valFin)} · en transit : ${fmtN(cur.transit)}</div></div>
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
          <tr><td>Lots commandés pas encore livrés</td><td class="r">${fmtN(cur.transit)}</td></tr>
          <tr><td>Charges fixes mensuelles</td><td class="r">${fmtE(n0(state.params.salaires) + n0(state.params.structure))}</td></tr>
          <tr><td>Impact RSE transports</td><td class="r"><span class="badge ${rse.cls === "info" ? "warn" : rse.cls}">${esc(rse.label)}</span></td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="card section-gap">
      <h2>Récapitulatif mensuel</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th class="r">Tréso début</th><th class="r">Encaiss.</th><th class="r">Paiem. achats</th><th class="r">Charges fixes</th><th class="r">Stockage</th><th class="r">Pub + transport + divers</th><th class="r">Tréso fin</th><th class="r">Reçus (lots)</th><th class="r">Vendus (lots)</th><th class="r">Stock fin</th><th class="r">Résultat</th></tr></thead>
        <tbody>${c.rows.map((r) => `<tr class="${r.i === state.currentMonth ? "current" : ""}">
          <td>${esc(r.nom)}</td><td class="r">${fmtE(r.tresoDebut)}</td><td class="r">${fmtE(r.encaissements)}</td><td class="r">${fmtE(r.paiementsAchats)}</td>
          <td class="r">${fmtE(r.fixes)}</td><td class="r">${fmtE(r.stockage)}</td><td class="r">${fmtE(r.transport + r.divers)}</td>
          <td class="r ${cls(r.tresoFin)}"><b>${fmtE(r.tresoFin)}</b></td><td class="r">${fmtN(r.recLots)}</td><td class="r">${fmtN(r.venLots)}</td>
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
  const step = niceStep((max - min) / 4);
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
    const path = v >= 0
      ? `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + barW - rr} Q${x + barW},${top} ${x + barW},${top + rr} V${y0} Z`
      : `M${x},${y0} V${top + h - rr} Q${x},${top + h} ${x + rr},${top + h} H${x + barW - rr} Q${x + barW},${top + h} ${x + barW},${top + h - rr} V${y0} Z`;
    bars += `<path class="bar ${v < 0 ? "neg" : ""} ${future ? "future" : ""}" data-i="${i}" d="${path}"/>`;
    bars += `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${esc(r.nom.slice(0, 3))}</text>`;
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
      tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 270) + "px"; tt.style.top = (e.clientY + 14) + "px";
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

const opts = (list, value) => list.map(([label, v]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("");
const delaiList = DELAIS.map((d, k) => [d, k]);
function transportSelect(attrs, value, allowEmpty) {
  return `<select ${attrs}>${allowEmpty ? `<option value="" ${!value ? "selected" : ""}>—</option>` : ""}${Object.keys(TRANSPORTS).map((t) => `<option ${t === value ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}

function renderMois(c) {
  const i = Math.min(ui.editMonth, state.months.length - 1);
  const m = state.months[i];
  const r = c.rows[i];
  const el = document.getElementById("tab-mois");
  const inp = (list, j, k, v, type = "number", extra = "") => `<input type="${type}" ${extra} data-m="${i}" data-list="${list}" data-j="${j}" data-k="${k}" value="${esc(v)}">`;
  const sel = (list, j, k, options, v) => `<select data-m="${i}" data-list="${list}" data-j="${j}" data-k="${k}">${opts(options, v)}</select>`;
  const prodList = PRODUITS.map((p) => [p, p]);
  const segList = SEGMENTS.map((s) => [SEG_LABEL[s], s]);
  const cmA = r.cmupP["Agglomérés"];
  el.innerHTML = `
    <div class="month-pills">${state.months.map((mm, k) => `<button class="pill ${k === i ? "active" : ""} ${c.rows[k].tresoFin < 0 ? "neg-dot" : ""}" data-editmonth="${k}">${esc(mm.nom)}</button>`).join("")}</div>

    <div class="grid k4">
      <div class="card kpi"><div class="label">Tréso début</div><div class="value ${cls(r.tresoDebut)}">${fmtE(r.tresoDebut)}</div></div>
      <div class="card kpi"><div class="label">Tréso fin</div><div class="value ${cls(r.tresoFin)}">${fmtE(r.tresoFin)}</div><div class="hint">+${fmtE(r.encaissements)} / −${fmtE(r.decaissements)}</div></div>
      <div class="card kpi"><div class="label">Stock vendable ce mois</div><div class="value">${fmtN(r.lotsDebut + r.recLots)} lots</div><div class="hint">début ${fmtN(r.lotsDebut)} + reçus ${fmtN(r.recLots)} → fin ${fmtN(r.lotsFin)}</div></div>
      <div class="card kpi"><div class="label">Résultat du mois</div><div class="value ${cls(r.resultat)}">${fmtE(r.resultat)}</div><div class="hint">marge brute ${fmtE(r.marge)}</div></div>
    </div>

    <h2 class="section-gap phase planif">Phase de planification · Positionnement marketing</h2>
    <div class="card">
      <div class="seg-grid">
        ${SEGMENTS.map((s) => {
          const mk = m.marketing[s]; const rg = range(s, "Agglomérés");
          const marge = n0(mk.prix) ? clampPrix(s, "Agglomérés", mk.prix) - cmA : null;
          return `<div class="seg">
            <h3>${SEG_LABEL[s]}</h3>
            <label class="field">Prix Agglomérés (€/lot)<input type="number" step="0.5" data-mk="${s}" data-mkk="prix" data-m="${i}" value="${esc(mk.prix)}"></label>
            <div class="small" style="margin:4px 0 8px">${n0(mk.prix) ? priceBadge(s, "Agglomérés", n0(mk.prix)) : `<span class="muted">Fourchette ${rg[0]}–${rg[1]} €</span>`}
              ${marge !== null ? ` · marge <b class="${cls(marge)}">${fmtP(marge)}</b>/lot` : ""}
              ${n0(mk.prix) && Number.isFinite(seuilRentable(r).prix) ? (clampPrix(s, "Agglomérés", mk.prix) >= seuilRentable(r).prix ? ` · <span class="badge good">rentable</span>` : ` · <span class="badge warn">sous le seuil (${fmtP(seuilRentable(r).prix)})</span>`) : ""}</div>
            <label class="field">Délai de paiement<select data-mk="${s}" data-mkk="delai" data-m="${i}">${opts(delaiList, mk.delai)}</select></label>
          </div>`;
        }).join("")}
        <div class="seg">
          <h3>Publicité produits</h3>
          <label class="field">Publicité Agglomérés (€)<input type="number" step="100" data-mk="pub" data-m="${i}" value="${esc(m.marketing.pub)}"></label>
          <p class="muted small">Stimule la demande <b>de ce mois uniquement</b>. Décaissée ce mois-ci. Inutile si le stock est faible.</p>
        </div>
      </div>
      <p class="muted small">Coût moyen des agglomérés ce mois-ci : <b>${fmtP(cmA)}</b>/lot${c.rows[i + 1] && Math.abs(c.rows[i + 1].cmupP["Agglomérés"] - cmA) > 0.005 && c.rows[i + 1].dispoP["Agglomérés"] > 0 ? ` → <b>${fmtP(c.rows[i + 1].cmupP["Agglomérés"])}</b> en ${esc(c.rows[i + 1].nom)} après réception des achats` : ""}. Les prix et délais fixés ici servent de valeurs par défaut pour les ventes du mois.</p>
      <div class="alert info"><span class="ico">€</span><span>${seuilHtml(r, true)}. Vendre en dessous de ce prix moyen fait perdre de l'argent ce mois-ci (coût d'achat + salaires + structure + stockage + pub + transport + autres dépenses).</span></div>
    </div>

    <h2 class="section-gap phase nego">Phase de négociation</h2>
    <div class="card">
      <div class="row between"><h2>Étape A · Répartir les livraisons (agglomérés)</h2><button class="btn ghost" id="autoAlloc">Répartir automatiquement</button></div>
      <p class="muted small">Recopiez le tableau « Quantité de produits commandés par les clients » du jeu. Stock vendable ce mois : <b>${fmtN(r.dispoP["Agglomérés"])}</b> lots d'agglomérés (coût ${fmtP(r.cmupP["Agglomérés"])}). Prix et délai = ceux de la planification (ramenés dans la fourchette).</p>
      ${(() => {
        const dem = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons[sg].demande), 0);
        const liv = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons[sg].livre), 0);
        const dispo = r.dispoP["Agglomérés"];
        const al = !dem ? "" : dem <= dispo ? `<div class="alert good"><span class="ico">✓</span><span>Stock suffisant : vous pouvez livrer toute la demande (${fmtN(dem)} lots).</span></div>`
          : `<div class="alert crit"><span class="ico">⚠</span><span><b>Pénurie</b> : demande ${fmtN(dem)} lots pour ${fmtN(dispo)} en stock. ${fmtN(dem - dispo)} lots seront perdus au profit des concurrents. Priorisez les segments les plus rentables (bouton « Répartir automatiquement »).</span></div>`;
        const over = liv > dispo ? `<div class="alert crit"><span class="ico">⚠</span><span>Vous livrez ${fmtN(liv)} lots mais n'en avez que ${fmtN(dispo)}.</span></div>` : "";
        return al + over;
      })()}
      <div class="table-wrap"><table>
        <thead><tr><th>Segment</th><th class="r">Prix effectif</th><th>Paiement</th><th class="r">Demande</th><th class="r">Livré</th><th class="r">Perdu</th><th class="r">CA</th><th class="r">Marge</th></tr></thead>
        <tbody>${SEGMENTS.map((sg) => {
          const lv = m.livraisons[sg], pe = clampPrix(sg, "Agglomérés", m.marketing[sg].prix);
          const perdu = Math.max(0, n0(lv.demande) - n0(lv.livre));
          const mg = n0(lv.livre) * (pe - r.cmupP["Agglomérés"]);
          return `<tr><td>${SEG_LABEL[sg]}</td><td class="r">${fmtP(pe)}</td><td>${DELAIS[n0(m.marketing[sg].delai)]}</td>
            <td class="r"><input type="number" min="0" data-liv="${sg}" data-livk="demande" data-m="${i}" value="${esc(lv.demande)}"></td>
            <td class="r"><input type="number" min="0" data-liv="${sg}" data-livk="livre" data-m="${i}" value="${esc(lv.livre)}"> ${n0(lv.livre) > n0(lv.demande) ? `<span class="badge crit">&gt; demande</span>` : ""}</td>
            <td class="r ${perdu ? "neg" : ""}">${fmtN(perdu)}</td><td class="r">${fmtE(n0(lv.livre) * pe)}</td><td class="r ${cls(mg)}">${fmtE(mg)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="row between"><h2>Étape B · Négociations (stock du mois prochain)</h2><button class="btn" data-add="achats">+ Ajouter un achat</button></div>
      <p class="muted small">Livraison industriel → distributeur : <b>30 jours</b> (le stock arrive le mois suivant). Distributeur → distributeur : instantané. Prix marché de référence agglomérés : ${fmtP(n0(state.params.prixMarche))}/lot.${c.rows[i + 1] && r.cmdLots ? ` Coût moyen des agglomérés en ${esc(c.rows[i + 1].nom)} après réception : <b>${fmtP(c.rows[i + 1].cmupP["Agglomérés"])}</b> (aujourd'hui ${fmtP(r.cmupP["Agglomérés"])}).` : ""} Dans le jeu, les agglomérés sont sous « Bouchons triés ». Seules les offres <b>validées</b> comptent dans les calculs ; une offre acceptée des deux côtés est irréversible.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Statut</th><th>Fournisseur</th><th>Produit</th><th class="r">Lots</th><th class="r">Prix/lot</th><th>Livraison</th><th>Paiement</th><th>Transport</th><th class="r">Coût transp. (€)</th><th class="r">Total</th><th></th></tr></thead>
        <tbody>${m.achats.length ? m.achats.map((a, j) => `<tr class="${(a.statut || "validee") === "validee" ? "" : "inactive"}">
          <td>${sel("achats", j, "statut", STATUTS, a.statut || "validee")}</td>
          <td>${inp("achats", j, "fournisseur", a.fournisseur, "text")}</td>
          <td>${sel("achats", j, "produit", prodList, a.produit)}</td>
          <td class="r">${inp("achats", j, "lots", a.lots)}</td>
          <td class="r">${inp("achats", j, "prix", a.prix, "number", 'step="0.01" class="sm"')} ${a.produit === "Agglomérés" && n0(a.prix) > n0(state.params.prixMarche) ? `<span class="badge warn" title="Au-dessus du prix marché">↑ marché</span>` : ""}</td>
          <td>${sel("achats", j, "livraison", LIVRAISONS, a.livraison)}</td>
          <td>${sel("achats", j, "delai", delaiList, a.delai)}</td>
          <td>${transportSelect(`data-m="${i}" data-list="achats" data-j="${j}" data-k="transport"`, a.transport)}</td>
          <td class="r">${inp("achats", j, "coutTransport", a.coutTransport, "number", 'class="sm"')}</td>
          <td class="r">${fmtE(n0(a.lots) * n0(a.prix))}</td>
          <td><button class="btn danger" data-del="achats" data-j="${j}" title="Supprimer">✕</button></td></tr>`).join("") : `<tr><td colspan="11" class="muted">Aucun achat ce mois-ci.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="row between"><h2>Autres ventes</h2><button class="btn ghost" data-add="ventes">+ Ajouter une vente</button></div>
      <p class="muted small">Disponible ce mois-ci : ${PRODUITS.filter((p) => r.dispoP[p] > 0).map((p) => `<b>${fmtN(r.dispoP[p])}</b> ${p} (coût ${fmtP(r.cmupP[p])})`).join(" · ") || "<b>aucun stock</b>"}. Pour les ventes hors tableau ci-dessus (autres produits, revente à un distributeur…).</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Segment</th><th>Client</th><th>Produit</th><th class="r">Lots</th><th class="r">Prix/lot</th><th>Encaissement</th><th>Transport</th><th class="r">Coût transp. (€)</th><th class="r">CA</th><th class="r">Marge</th><th></th></tr></thead>
        <tbody>${m.ventes.length ? m.ventes.map((v, j) => {
          const mg = n0(v.lots) * (n0(v.prix) - (r.cmupP[v.produit] || 0));
          return `<tr>
          <td>${sel("ventes", j, "segment", segList, v.segment)}</td>
          <td>${inp("ventes", j, "client", v.client, "text", 'class="sm" style="width:110px"')}</td>
          <td>${sel("ventes", j, "produit", prodList, v.produit)}</td>
          <td class="r">${inp("ventes", j, "lots", v.lots)}</td>
          <td class="r">${inp("ventes", j, "prix", v.prix, "number", 'step="0.01" class="sm"')} ${priceBadge(v.segment, v.produit, n0(v.prix))}</td>
          <td>${sel("ventes", j, "delai", delaiList, v.delai)}</td>
          <td>${transportSelect(`data-m="${i}" data-list="ventes" data-j="${j}" data-k="transport"`, v.transport, true)}</td>
          <td class="r">${inp("ventes", j, "coutTransport", v.coutTransport, "number", 'class="sm"')}</td>
          <td class="r">${fmtE(n0(v.lots) * n0(v.prix))}</td>
          <td class="r ${cls(mg)}">${fmtE(mg)}</td>
          <td><button class="btn danger" data-del="ventes" data-j="${j}" title="Supprimer">✕</button></td></tr>`;
        }).join("") : `<tr><td colspan="11" class="muted">Aucune autre vente.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="grid c2">
      <div class="card">
        <div class="row between"><h2>Autres dépenses / recettes</h2><button class="btn ghost" data-add="depenses">+ Ajouter</button></div>
        <p class="muted small">Pénalités, prêts… Montant positif = dépense, négatif = recette.</p>
        <table><tbody>${m.depenses.length ? m.depenses.map((d, j) => `<tr>
          <td>${inp("depenses", j, "libelle", d.libelle, "text")}</td>
          <td class="r">${inp("depenses", j, "montant", d.montant)}</td>
          <td><button class="btn danger" data-del="depenses" data-j="${j}">✕</button></td></tr>`).join("") : `<tr><td class="muted">Aucune.</td></tr>`}</tbody></table>
        <h3 class="section-gap">Charges automatiques du mois</h3>
        <table><tbody>
          <tr><td>Salaires</td><td class="r">${fmtE(n0(state.params.salaires))}</td></tr>
          <tr><td>Frais de structure</td><td class="r">${fmtE(n0(state.params.structure))}</td></tr>
          <tr><td>Publicité</td><td class="r">${fmtE(r.pub)}</td></tr>
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
  const maxLots = Math.max(1, ...c.rows.map((r) => r.lotsDebut + r.recLots));
  const cur = c.rows[state.currentMonth];
  const done = c.rows.filter((r) => r.venLots > 0);
  const avgVentes = done.length ? done.reduce((t, r) => t + r.venLots, 0) / done.length : 0;
  const couverture = avgVentes ? cur.lotsFin / avgVentes : Infinity;
  el.innerHTML = `
    <div class="grid k4">
      <div class="card kpi"><div class="label">Stock fin ${esc(cur.nom)}</div><div class="value">${fmtN(cur.lotsFin)} lots</div><div class="hint">+ ${fmtN(cur.transit)} en transit</div></div>
      <div class="card kpi"><div class="label">Coût moyen agglomérés</div><div class="value">${fmtP(cur.cmup)}</div><div class="hint">${(() => { const nx = c.rows[state.currentMonth + 1]; return nx && nx.dispoP["Agglomérés"] > 0 && Math.abs(nx.cmupP["Agglomérés"] - cur.cmup) > 0.005 ? `→ ${fmtP(nx.cmupP["Agglomérés"])} en ${esc(nx.nom)} après réception · ` : ""; })()}marché ≈ ${fmtP(n0(state.params.prixMarche))}<br>Vente rentable dès <b>${fmtP(seuilRentable(cur).prix)}</b>/lot</div></div>
      <div class="card kpi"><div class="label">Couverture</div><div class="value">${Number.isFinite(couverture) ? couverture.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " mois" : "—"}</div><div class="hint">au rythme moyen de ${fmtN(avgVentes)} lots/mois vendus</div></div>
      <div class="card kpi"><div class="label">Coût de stockage du mois</div><div class="value">${fmtE(cur.stockage)}</div><div class="hint">${state.params.stockageRate} % de la valeur du stock</div></div>
    </div>
    <div class="card section-gap">
      <h2>Prix de vente minimum rentable · ${esc(cur.nom)}</h2>
      <p class="seuil">${seuilHtml(cur, false)}</p>
      <p class="muted small">C'est le prix moyen de vente par lot (agglomérés) en dessous duquel le mois est en perte : il couvre le coût d'achat des lots + salaires (${fmtE(n0(state.params.salaires))}) + structure (${fmtE(n0(state.params.structure))}) + stockage (${fmtE(cur.stockage)}) + publicité (${fmtE(cur.pub)}) + transport et autres (${fmtE(cur.transport + cur.divers - cur.pub)}). Plus vous vendez de lots, plus ce prix baisse.</p>
    </div>
    <div class="card">
      <h2>Stock par produit · fin ${esc(cur.nom)}</h2>
      <table><thead><tr><th>Produit</th><th class="r">Lots</th><th class="r">Coût moyen</th><th class="r">Valeur</th><th>Prix de vente possibles (Vignerons / Caves / Négociants)</th></tr></thead><tbody>
        ${PRODUITS.map((p) => `<tr><td>${p}</td><td class="r ${cls(cur.finP[p])}">${fmtN(cur.finP[p])}</td><td class="r">${cur.finP[p] ? fmtP(cur.cmupP[p]) : "—"}</td><td class="r">${fmtE(Math.max(0, cur.finP[p]) * cur.cmupP[p])}</td>
          <td class="small">${SEGMENTS.map((s) => { const rg = range(s, p); return rg ? `${rg[0]}–${rg[1]} €` : "—"; }).join(" / ")}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="card">
      <h2>Mouvements de stock (tous produits, lots)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th class="r">Stock début</th><th class="r">Commandés</th><th class="r">+ Reçus</th><th class="r">− Vendus</th><th class="r">Stock fin</th><th class="r">En transit</th><th class="r">Valeur fin</th><th style="width:20%">Niveau</th></tr></thead>
        <tbody>${c.rows.map((r) => `<tr class="${r.i === state.currentMonth ? "current" : ""}"><td>${esc(r.nom)}</td><td class="r">${fmtN(r.lotsDebut)}</td><td class="r">${fmtN(r.cmdLots)}</td><td class="r">${fmtN(r.recLots)}</td><td class="r">${fmtN(r.venLots)}</td><td class="r ${cls(r.lotsFin)}"><b>${fmtN(r.lotsFin)}</b></td><td class="r">${fmtN(r.transit)}</td><td class="r">${fmtE(r.valFin)}</td>
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
  const line = { id: "sim", produit: s.produit, lots: n0(s.lots), prix: n0(s.prix), delai: n0(s.delai), transport: s.transport, coutTransport: n0(s.coutTransport) };
  if (s.type === "achat") sim.months[mi].achats.push({ ...line, livraison: n0(s.livraison), fournisseur: "Offre simulée" });
  else sim.months[mi].ventes.push({ ...line, segment: s.segment, client: "Offre simulée" });
  const c2 = compute(sim);
  const total = n0(s.lots) * n0(s.prix);
  const r1 = c.rows[mi], r2 = c2.rows[mi];
  const stockKo = c2.rows.some((r) => r.stockNeg) && !c.rows.some((r) => r.stockNeg);
  const ok = c2.minTreso >= 0 && !stockKo;
  let verdict = "";
  if (s.type === "achat") {
    const ecart = n0(s.prix) - n0(state.params.prixMarche);
    verdict = s.produit !== "Agglomérés" ? `Achat de ${esc(s.produit)} : vérifiez la marge avec les fourchettes de vente (${SEGMENTS.map((g) => { const rg = range(g, s.produit); return `${SEG_LABEL[g]} ${rg[0]}–${rg[1]} €`; }).join(", ")}).`
      : ecart > 0 ? `Prix ${fmtP(ecart)} au-dessus du prix marché (${fmtP(n0(state.params.prixMarche))}) : surcoût de ${fmtE(ecart * n0(s.lots))}. Négociez à la baisse ou demandez un délai de paiement.`
      : ecart === 0 ? `Prix égal au prix marché (${fmtP(n0(state.params.prixMarche))}) : correct, mais tentez de négocier un délai de paiement ou un transport plus propre.`
      : `Prix inférieur au marché : bonne affaire (${fmtE(-ecart * n0(s.lots))} d'économie vs marché).`;
    if (n0(s.livraison) > 0) verdict += ` Livraison en ${esc(c.rows[Math.min(mi + n0(s.livraison), c.rows.length - 1)].nom)} : ces lots ne sont pas vendables avant.`;
  } else {
    const cm = r2.cmupP[s.produit] || 0;
    const m = n0(s.prix) - cm;
    const rg = range(s.segment, s.produit);
    verdict = m > 0 ? `Marge unitaire de ${fmtP(m)} sur un coût moyen de ${fmtP(cm)} → marge totale ${fmtE(m * n0(s.lots))}.` : `Attention : vous vendez sous votre coût moyen (${fmtP(cm)}).`;
    if (rg) verdict += ` Fourchette ${SEG_LABEL[s.segment]} : ${rg[0]}–${rg[1]} €.`;
  }
  const el = document.getElementById("tab-simu");
  const focus = document.activeElement?.dataset?.simu;
  el.innerHTML = `
    <div class="card">
      <h2>Tester une offre avant de signer</h2>
      <p class="muted small">Saisissez l'offre reçue (ex. STECKER) ou la proposition à un client : on calcule l'impact sur toute la trésorerie et le stock, sans rien enregistrer.</p>
      <div class="form-grid">
        <label class="field">Type<select data-simu="type">${opts([["Achat fournisseur", "achat"], ["Vente client", "vente"]], s.type)}</select></label>
        <label class="field">Mois<select data-simu="mois">${opts(state.months.map((m, k) => [m.nom, k]), mi)}</select></label>
        <label class="field">Produit<select data-simu="produit">${opts(PRODUITS.map((p) => [p, p]), s.produit)}</select></label>
        ${s.type === "vente" ? `<label class="field">Segment<select data-simu="segment">${opts(SEGMENTS.map((g) => [SEG_LABEL[g], g]), s.segment)}</select></label>` : `<label class="field">Livraison<select data-simu="livraison">${opts(LIVRAISONS, s.livraison)}</select></label>`}
        <label class="field">Lots<input type="number" data-simu="lots" value="${s.lots}"></label>
        <label class="field">Prix par lot (€)<input type="number" step="0.01" data-simu="prix" value="${s.prix}"></label>
        <label class="field">${s.type === "achat" ? "Paiement" : "Encaissement"}<select data-simu="delai">${opts(delaiList, s.delai)}</select></label>
        <label class="field">Transport${transportSelect('data-simu="transport"', s.transport)}</label>
        <label class="field">Coût transport (€)<input type="number" data-simu="coutTransport" value="${s.coutTransport}"></label>
      </div>
      <div class="row section-gap"><button class="btn" id="simuApply">Enregistrer cette offre dans ${esc(state.months[mi].nom)}</button><span class="muted small">Montant : ${fmtE(total)}</span></div>
    </div>
    <div class="grid c2">
      <div class="card">
        <h2>Impact</h2>
        <div class="alert ${ok ? "good" : "crit"}"><span class="ico">${ok ? "✓" : "⚠"}</span><span>${ok ? "La trésorerie reste positive sur tout l'horizon." : stockKo ? "Stock insuffisant pour cette vente (les achats industriels arrivent 30 jours après la commande)." : `Trésorerie négative en ${esc(c2.rows[c2.minTresoMonth].nom)} (${fmtE(c2.minTreso)}).`}</span></div>
        <div class="alert info"><span class="ico">i</span><span>${verdict}</span></div>
        <table><thead><tr><th></th><th class="r">Sans l'offre</th><th class="r">Avec l'offre</th></tr></thead><tbody>
          <tr><td>Tréso fin ${esc(r1.nom)}</td><td class="r ${cls(r1.tresoFin)}">${fmtE(r1.tresoFin)}</td><td class="r ${cls(r2.tresoFin)}">${fmtE(r2.tresoFin)}</td></tr>
          <tr><td>Trésorerie minimale</td><td class="r ${cls(c.minTreso)}">${fmtE(c.minTreso)}</td><td class="r ${cls(c2.minTreso)}">${fmtE(c2.minTreso)}</td></tr>
          <tr><td>Stock fin ${esc(r1.nom)}</td><td class="r">${fmtN(r1.lotsFin)}</td><td class="r ${cls(r2.lotsFin)}">${fmtN(r2.lotsFin)}</td></tr>
          <tr><td>Résultat cumulé fin d'horizon</td><td class="r">${fmtE(c.rows.at(-1).cumRes)}</td><td class="r">${fmtE(c2.rows.at(-1).cumRes)}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h2>Trésorerie avec l'offre</h2>
        <div class="chart" id="simuChart"></div>
      </div>
    </div>`;
  drawTresoChart(document.getElementById("simuChart"), c2.rows);
  if (focus) { const f = el.querySelector(`[data-simu="${focus}"]`); if (f) f.focus(); }
}

// ---------- conseiller ----------
function adviceRules(c) {
  const p = state.params;
  const out = [];
  const cur = c.rows[state.currentMonth];
  const m = state.months[state.currentMonth];
  const fixes = n0(p.salaires) + n0(p.structure);
  const cmA = cur.cmupP["Agglomérés"] || n0(state.stockInitial.prix);
  if (c.minTreso < 0) out.push({ cls: "crit", t: `Trésorerie négative prévue en <b>${esc(c.rows[c.minTresoMonth].nom)}</b> (${fmtE(c.minTreso)}). Leviers : négocier des paiements fournisseurs à 30/60 jours, encaisser les clients comptant, réduire les achats ou vendre du stock.` });
  else out.push({ cls: "good", t: `Trésorerie positive sur tout l'horizon (minimum ${fmtE(c.minTreso)} en ${esc(c.rows[c.minTresoMonth].nom)}).` });

  const marges = SEGMENTS.map((s) => { const rg = range(s, "Agglomérés"); return { s, rg, min: rg[0] - cmA, max: rg[1] - cmA }; });
  out.push({ cls: "info", t: `Marge agglomérés par segment (coût moyen ${fmtP(cmA)}) : ${marges.map((x) => `<b>${SEG_LABEL[x.s]}</b> ${fmtP(x.min)} à ${fmtP(x.max)}`).join(" · ")}. Les Vignerons sont de loin les plus rentables ; les Négociants (max ${marges[2].rg[1]} €) sont ${marges[2].max <= 0 ? "<b>à perte</b>" : "très peu rentables"} avec ce coût.` });
  const mVign = marges[0].rg.reduce((a, b) => a + b) / 2 - cmA;
  out.push({ cls: "info", t: `Charges fixes : <b>${fmtE(fixes)}/mois</b>. À prix moyen Vignerons (${fmtP(marges[0].rg.reduce((a, b) => a + b) / 2)}), il faut vendre ≈ <b>${fmtN(fixes / mVign)} lots/mois</b> pour les couvrir ; à prix moyen Caves ≈ ${fmtN(fixes / Math.max(0.01, (marges[1].rg[0] + marges[1].rg[1]) / 2 - cmA))} lots/mois.` });

  const mk = m.marketing;
  SEGMENTS.forEach((s) => {
    const pr = n0(mk[s].prix); const rg = range(s, "Agglomérés");
    if (pr && (pr < rg[0] || pr > rg[1])) out.push({ cls: "warn", t: `Planification ${esc(m.nom)} : le prix ${SEG_LABEL[s]} (${fmtP(pr)}) est hors fourchette ${rg[0]}–${rg[1]} €.` });
    if (pr && pr <= cmA) out.push({ cls: "crit", t: `Planification ${esc(m.nom)} : prix ${SEG_LABEL[s]} (${fmtP(pr)}) inférieur au coût moyen (${fmtP(cmA)}) → vente à perte.` });
  });
  if (!SEGMENTS.some((s) => n0(mk[s].prix))) out.push({ cls: "warn", t: `Planification ${esc(m.nom)} : aucun prix fixé. Suggestion de départ : Vignerons ~${Math.round(marges[0].rg[0] + (marges[0].rg[1] - marges[0].rg[0]) * 0.6)} €, Caves ~${Math.round(marges[1].rg[0] + (marges[1].rg[1] - marges[1].rg[0]) * 0.6)} €, Négociants ${Math.round(marges[2].rg[1])} € (ou ne pas cibler), paiement comptant pour protéger la trésorerie.` });
  if (SEGMENTS.some((s) => n0(mk[s].delai) > 0)) out.push({ cls: "info", t: `Vous laissez un délai de paiement à certains clients : c'est plus attractif, mais l'argent rentre plus tard. Vérifiez la trésorerie minimale.` });

  const dispoA = cur.dispoP["Agglomérés"];
  const demM = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons[sg].demande), 0);
  if (cur.perdue > 0) out.push({ cls: "crit", t: `${esc(m.nom)} : <b>${fmtN(cur.perdue)} lots de demande perdus</b> (partis chez les concurrents). Il fallait plus de stock : augmentez vos achats pour le mois prochain.` });
  if (n0(m.marketing.pub) > 0 && demM > dispoA) out.push({ cls: "warn", t: `Publicité de ${fmtE(n0(m.marketing.pub))} alors que la demande dépasse déjà votre stock : cette pub génère surtout des ventes perdues.` });
  else if (n0(m.marketing.pub) > 0 && dispoA < 3000) out.push({ cls: "warn", t: `Publicité de ${fmtE(n0(m.marketing.pub))} avec seulement ${fmtN(dispoA)} lots en stock : réduisez-la, elle risque de créer de la demande que vous ne pourrez pas servir.` });
  if (demM) {
    const next = c.rows[state.currentMonth + 1];
    const dejaAttendu = next ? next.recLots : 0;
    const besoin = Math.max(0, Math.round(demM * 1.1 - Math.max(0, cur.lotsFin) - dejaAttendu));
    out.push({ cls: "info", t: `Achat conseillé pour ${esc(next?.nom || "le mois prochain")} : demande observée ${fmtN(demM)} lots (+10 % de marge) − stock restant ${fmtN(Math.max(0, cur.lotsFin))} − déjà commandé ${fmtN(dejaAttendu)} ≈ <b>${fmtN(besoin)} lots</b> à négocier. Ajustez selon votre budget pub et vos prix du mois prochain.` });
  }
  const enNego = m.achats.filter((a) => a.statut === "nego");
  if (enNego.length) out.push({ cls: "info", t: `${enNego.length} proposition(s) d'achat en négociation (non comptée(s)). Passez-les en « Validée » une fois acceptées par les deux parties.` });
  out.push({ cls: "info", t: `Livraison industriel → distributeur en 30 jours : ce que vous achetez en ${esc(m.nom)} n'arrive qu'au début de ${esc(state.months[Math.min(state.currentMonth + 1, state.months.length - 1)].nom)}. Utilisez les commandes observées à l'étape A pour estimer vos besoins.` });
  const si = state.stockInitial;
  if (n0(si.prix) > n0(p.prixMarche)) out.push({ cls: "warn", t: `Le stock de départ a coûté ${fmtP(n0(si.prix))}/lot contre ~${fmtP(n0(p.prixMarche))} sur le marché. Prochains achats : visez ≤ ${fmtP(n0(p.prixMarche))} et mettez STECKER en concurrence.` });
  if (n0(si.moisPaiement) === 0 && state.currentMonth === 0) out.push({ cls: "warn", t: `Fin janvier, le stock de départ (${fmtE(n0(si.lots) * n0(si.prix))}) + ${fmtE(fixes)} de charges sortent de la trésorerie. Des ventes encaissées comptant dès janvier aident beaucoup.` });
  const dearBuys = [];
  state.months.forEach((mm) => mm.achats.forEach((a) => { if (a.produit === "Agglomérés" && n0(a.prix) > n0(p.prixMarche)) dearBuys.push(`${mm.nom} (${a.fournisseur || "?"} à ${fmtP(n0(a.prix))})`); }));
  if (dearBuys.length) out.push({ cls: "warn", t: `Achats au-dessus du prix marché : ${esc(dearBuys.join(", "))}.` });
  const done = c.rows.filter((r) => r.venLots > 0);
  const moy = done.length ? done.reduce((t, r) => t + r.venLots, 0) / done.length : 0;
  if (moy && cur.lotsFin / moy > 3) out.push({ cls: "warn", t: `Stock élevé : ${(cur.lotsFin / moy).toFixed(1)} mois de ventes. Il coûte ${fmtE(cur.stockage)}/mois de stockage et immobilise ${fmtE(cur.valFin)}.` });
  if (moy && cur.lotsFin / moy < 1) out.push({ cls: "warn", t: `Stock faible : moins d'un mois de ventes. Commandez maintenant (30 jours de livraison).` });
  const rse = rseSummary(state);
  if (rse.lots && rse.score > 1.6) out.push({ cls: "warn", t: `RSE : ${esc(rse.label)}. Privilégiez le train quand le délai le permet, l'avion seulement en urgence.` });
  if (!rse.lots) out.push({ cls: "info", t: `RSE : pensez au transport lors des négociations — train &gt; camion &gt; bateau &gt; avion.` });
  return out;
}

function contextForAI(c) {
  const rows = c.rows.map((r) => ({
    mois: r.nom, tresoDebut: Math.round(r.tresoDebut), encaissements: Math.round(r.encaissements), paiementsFournisseurs: Math.round(r.paiementsAchats),
    chargesFixes: r.fixes, publicite: r.pub, stockage: Math.round(r.stockage), transportEtDivers: Math.round(r.transport + r.divers - r.pub), tresoFin: Math.round(r.tresoFin),
    demandeClients: r.demande, demandePerdue: r.perdue, lotsCommandes: r.cmdLots, lotsRecus: r.recLots, lotsVendus: r.venLots, stockFinParProduit: Object.fromEntries(PRODUITS.filter((p) => r.finP[p]).map((p) => [p, r.finP[p]])),
    enTransit: r.transit, coutMoyenAgglo: +r.cmup.toFixed(2), CA: Math.round(r.ca), resultat: Math.round(r.resultat),
  }));
  const details = state.months.map((m) => ({
    mois: m.nom,
    planification: SEGMENTS.some((s) => n0(m.marketing[s].prix)) || n0(m.marketing.pub) ? {
      ...Object.fromEntries(SEGMENTS.map((s) => [s, { prixAgglo: n0(m.marketing[s].prix), delaiPaiement: DELAIS[n0(m.marketing[s].delai)] }])), publicite: n0(m.marketing.pub),
    } : undefined,
    livraisonsParSegment: SEGMENTS.some((sg) => n0(m.livraisons[sg].demande)) ? Object.fromEntries(SEGMENTS.map((sg) => [sg, { demande: n0(m.livraisons[sg].demande), livre: n0(m.livraisons[sg].livre), prixEffectif: clampPrix(sg, "Agglomérés", m.marketing[sg].prix) }])) : undefined,
    achats: m.achats.map((a) => ({ statut: STATUTS.find((x) => x[1] === (a.statut || "validee"))[0], fournisseur: a.fournisseur, produit: a.produit, lots: n0(a.lots), prix: n0(a.prix), livraison: LIVRAISONS.find((l) => l[1] === n0(a.livraison))?.[0], paiement: DELAIS[n0(a.delai)], transport: a.transport, coutTransport: n0(a.coutTransport) })),
    ventes: m.ventes.map((v) => ({ segment: v.segment, client: v.client, produit: v.produit, lots: n0(v.lots), prix: n0(v.prix), encaissement: DELAIS[n0(v.delai)], transport: v.transport || null })),
    autres: m.depenses.map((d) => ({ libelle: d.libelle, montant: n0(d.montant) })),
    notesPlanification: m.planif || undefined, notesNegociation: m.nego || undefined,
  })).filter((m) => m.planification || m.livraisonsParSegment || m.achats.length || m.ventes.length || m.autres.length || m.notesPlanification || m.notesNegociation);
  return `<etat_entreprise mois_en_cours="${state.months[state.currentMonth].nom}">
Paramètres : ${JSON.stringify(state.params)}
Stock initial : ${JSON.stringify(state.stockInitial)}
Fourchettes de prix clients [min, max] €/lot : ${JSON.stringify(state.prixClients)}
Projection mensuelle (calculée par l'outil ; mois futurs = prévision selon les saisies ; achats industriels reçus 30 jours après) :
${JSON.stringify(rows)}
Décisions saisies et notes :
${JSON.stringify(details)}
Trésorerie minimale prévue : ${Math.round(c.minTreso)} € en ${c.rows[c.minTresoMonth]?.nom}
RSE : ${JSON.stringify(rseSummary(state))}
</etat_entreprise>`;
}

const SYSTEM_PROMPT = (rules) => `Tu es le conseiller stratégique d'une équipe d'étudiants dans un jeu d'entreprise (business game, plateforme Vinego). Ils dirigent un distributeur de bouchons de liège : ils achètent des lots à des industriels (dont STECKER, fournisseur allemand historique) ou à d'autres distributeurs, et les revendent à trois segments de clients : Vignerons, Caves, Négociants / Grands comptes. Chaque "mois" du jeu comporte une phase de planification (positionnement marketing : prix et délai de paiement par segment, budget publicité) puis une phase de négociation (négociations fournisseurs, ventes).

Objectif de l'équipe : être la meilleure entreprise (résultat, ventes, RSE) sans jamais avoir une trésorerie négative.

Règles et informations du jeu connues :
${rules}

Comment répondre :
- Réponds en français, de façon concrète et chiffrée, à partir des données de l'état de l'entreprise fourni dans chaque message. Fais les calculs (trésorerie, marge par segment, coût moyen, point mort) plutôt que de rester général.
- Pour la planification : propose un prix précis par segment (dans la fourchette), un délai de paiement et un budget publicité, en expliquant le compromis volume / marge / trésorerie.
- Pour une offre de négociation : dis s'il faut accepter, refuser ou contre-proposer, avec un prix/volume/délai/transport cible et l'argument à utiliser.
- Rappelle-toi que les achats chez un industriel arrivent au début du mois suivant : on ne peut vendre ce mois-ci que le stock déjà présent. En pénurie, la demande non servie est perdue au profit des concurrents : aide à prioriser les segments et à dimensionner les achats à partir de la demande observée.
- La publicité ne stimule la demande que sur le mois en cours : déconseille-la si le stock ne pourra pas suivre.
- Les délais de paiement possibles sont comptant, 30 jours ou 60 jours. Les prix hors fourchette sont ramenés au plancher/plafond par le jeu.
- Signale toujours un risque de trésorerie négative et la marge de sécurité restante.
- Tiens compte de l'impact RSE des transports (train < camion < bateau < avion en pollution) et des frais de stockage (0,33 % de la valeur du stock de fin de mois).
- S'il te manque une information pour bien conseiller (volumes demandés par segment, effet de la publicité, concurrents…), dis précisément laquelle chercher dans le jeu.
- Sois synthétique : la recommandation en premier, puis des puces courtes.`;

function mdToHtml(t) {
  let h = esc(t);
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/^#{1,4} (.+)$/gm, "<b>$1</b>");
  let out = "", inList = false;
  for (const l of h.split("\n")) {
    const mm = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (mm) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${mm[1]}</li>`; }
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
  const draft = document.getElementById("chatInput")?.value || "";
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
          ${["Quels prix et délais fixer en planification ce mois-ci ?", "STECKER nous propose une offre, que faire ?", "Combien acheter pour le mois prochain ?", "Comment éviter une trésorerie négative ?", "Combien mettre en publicité ?"].map((q) => `<button class="pill" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
        </div>
        <div class="chat" id="chat">${state.chat.length ? state.chat.map((m) => `<div class="msg ${m.role}${m.err ? " err" : ""}">${m.role === "assistant" ? mdToHtml(m.text) : esc(m.text).replace(/\n/g, "<br>")}</div>`).join("") : `<p class="muted small">Posez une question : l'IA reçoit automatiquement l'état complet de votre entreprise (trésorerie, stock, planification, offres, notes).</p>`}</div>
        <div class="chat-input">
          <textarea id="chatInput" placeholder="Ex : STECKER propose 10 000 lots à 22,50 € payables à 30 jours par camion, on accepte ?" ${ui.busy ? "disabled" : ""}>${esc(ui.busy ? "" : draft)}</textarea>
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
  if (!key || !question.trim() || ui.busy) return;
  document.getElementById("chatInput").value = "";
  state.chat.push({ role: "user", text: question.trim() });
  const reply = { role: "assistant", text: "" };
  state.chat.push(reply);
  ui.busy = true; save(); render(); scrollChat();
  try {
    if (!Anthropic) Anthropic = (await import("https://esm.sh/@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const c = compute(state);
    const history = state.chat.slice(0, -1).filter((m) => !m.err && m.text).slice(-20);
    while (history.length && history[0].role !== "user") history.shift();
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
    if (final.stop_reason === "refusal") reply.text += "\n\n(La requête a été refusée par le modèle. Reformulez la question.)";
    if (final.stop_reason === "max_tokens") reply.text += "\n\n(Réponse tronquée.)";
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
        ${f("params.prixMarche", "Prix d'achat marché agglomérés (€/lot)", p.prixMarche, "0.01")}
        ${f("params.seuilTreso", "Seuil d'alerte trésorerie (€)", p.seuilTreso)}
      </div>
      <h3 class="section-gap">Stock de départ</h3>
      <div class="form-grid">
        ${f("stockInitial.lots", "Lots (agglomérés)", si.lots)}
        ${f("stockInitial.prix", "Coût d'achat (€/lot)", si.prix, "0.01")}
        <label class="field">Payé en<select data-param="stockInitial.moisPaiement">${opts(state.months.map((m, k) => ["fin " + m.nom, k]), si.moisPaiement)}</select></label>
      </div>
      <h3 class="section-gap">Mois du jeu</h3>
      <div class="row"><span class="muted small">${state.months.length} mois.</span><button class="btn ghost" id="addMonth">+ Ajouter un mois</button><button class="btn ghost" id="delMonth" ${state.months.length <= 1 ? "disabled" : ""}>− Retirer le dernier mois</button></div>
    </div>
    <div class="card">
      <h2>Fourchettes de prix clients (€/lot)</h2>
      <p class="muted small">Issues de « Informations Clients ». Modifiez-les si le jeu les change.</p>
      <div class="table-wrap"><table>
        <thead><tr><th></th>${SEGMENTS.map((s) => `<th colspan="2">${SEG_LABEL[s]}</th>`).join("")}</tr>
        <tr><th>Produit</th>${SEGMENTS.map(() => `<th class="r">Min</th><th class="r">Max</th>`).join("")}</tr></thead>
        <tbody>${PRODUITS.map((pr) => `<tr><td>${pr}</td>${SEGMENTS.map((s) => [0, 1].map((k) => `<td class="r"><input type="number" class="sm" data-pc="${s}|${pr}|${k}" value="${state.prixClients[s]?.[pr]?.[k] ?? ""}"></td>`).join("")).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>Règles et infos du jeu (lues par l'IA)</h2>
      <p class="muted small">Ajoutez ici toute nouvelle info donnée par le jeu : volumes demandés, nouveaux fournisseurs, événements… L'IA s'en sert pour ses conseils.</p>
      <textarea id="rules" style="min-height:260px">${esc(state.rules)}</textarea>
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
const NUM_KEYS = new Set(["lots", "prix", "coutTransport", "montant", "delai", "livraison"]);

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
    if (t.dataset.add === "achats") m.achats.push({ id: uid(), fournisseur: "STECKER", produit: "Agglomérés", lots: 5000, prix: n0(state.params.prixMarche), livraison: 1, delai: 0, transport: "Train", coutTransport: 0 });
    if (t.dataset.add === "ventes") {
      const seg = "Vignerons", rg = range(seg, "Agglomérés");
      const pr = n0(m.marketing[seg].prix) || (rg ? (rg[0] + rg[1]) / 2 : 0);
      m.ventes.push({ id: uid(), segment: seg, client: "", produit: "Agglomérés", lots: 1000, prix: pr, delai: n0(m.marketing[seg].delai), transport: "", coutTransport: 0 });
    }
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
    case "sendChat": askClaude(document.getElementById("chatInput").value); break;
    case "autoAlloc": {
      const i = ui.editMonth, m = state.months[i];
      SEGMENTS.forEach((sg) => { m.livraisons[sg].livre = 0; });
      let dispo = compute(state).rows[i].dispoP["Agglomérés"] - m.ventes.filter((v) => v.produit === "Agglomérés").reduce((t, v) => t + n0(v.lots), 0);
      const order = [...SEGMENTS].sort((a, b) => (clampPrix(b, "Agglomérés", m.marketing[b].prix) - n0(m.marketing[b].delai) * 0.5) - (clampPrix(a, "Agglomérés", m.marketing[a].prix) - n0(m.marketing[a].delai) * 0.5));
      for (const sg of order) { const q = Math.min(n0(m.livraisons[sg].demande), Math.max(0, dispo)); m.livraisons[sg].livre = q; dispo -= q; }
      save(); render(); toast("Livraisons réparties : segments les mieux payés en priorité"); break;
    }
    case "clearChat": state.chat = []; save(); render(); break;
    case "simuApply": {
      const s = ui.simu; const m = state.months[s.mois];
      const line = { id: uid(), produit: s.produit, lots: n0(s.lots), prix: n0(s.prix), delai: n0(s.delai), transport: s.transport, coutTransport: n0(s.coutTransport) };
      if (s.type === "achat") m.achats.push({ ...line, livraison: n0(s.livraison), fournisseur: "STECKER" }); else m.ventes.push({ ...line, segment: s.segment, client: "" });
      save(); render(); toast(`Offre enregistrée dans ${m.nom}`); break;
    }
    case "addMonth": state.months.push(emptyMonth(`Mois ${state.months.length + 1}`)); save(); render(); break;
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
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
    const k = t.dataset.k;
    item[k] = NUM_KEYS.has(k) ? n0(t.value) : t.value;
    if (t.dataset.list === "ventes" && k === "segment") {
      const mk = state.months[+t.dataset.m].marketing[t.value];
      if (mk && n0(mk.prix) && item.produit === "Agglomérés") { item.prix = n0(mk.prix); item.delai = n0(mk.delai); }
    }
    save(); render(); return;
  }
  if (t.dataset.mk) {
    const mk = state.months[+t.dataset.m].marketing;
    if (t.dataset.mk === "pub") mk.pub = n0(t.value);
    else if (t.dataset.mkk === "prix" && n0(t.value)) {
      const c2 = clampPrix(t.dataset.mk, "Agglomérés", t.value);
      if (c2 !== n0(t.value)) toast(`Prix ramené à ${c2} € (fourchette du jeu)`);
      mk[t.dataset.mk].prix = c2;
    } else mk[t.dataset.mk][t.dataset.mkk] = n0(t.value);
    save(); render(); return;
  }
  if (t.dataset.liv) {
    const lv = state.months[+t.dataset.m].livraisons[t.dataset.liv];
    lv[t.dataset.livk] = Math.max(0, n0(t.value));
    if (t.dataset.livk === "demande") {
      const c = compute(state); const m = state.months[+t.dataset.m];
      const dem = SEGMENTS.reduce((s2, sg) => s2 + n0(m.livraisons[sg].demande), 0);
      if (dem <= c.rows[+t.dataset.m].dispoP["Agglomérés"]) SEGMENTS.forEach((sg) => { m.livraisons[sg].livre = n0(m.livraisons[sg].demande); });
    }
    save(); render(); return;
  }
  if (t.dataset.pc) {
    const [s, pr, k] = t.dataset.pc.split("|");
    state.prixClients[s] = state.prixClients[s] || {};
    state.prixClients[s][pr] = state.prixClients[s][pr] || [0, 0];
    state.prixClients[s][pr][+k] = n0(t.value);
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
    ui.simu[k] = ["type", "transport", "produit", "segment"].includes(k) ? t.value : n0(t.value);
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
const vEl = document.getElementById("appVersion");
if (vEl) { vEl.textContent = `version ${APP_VERSION} du ${APP_DATE}`; vEl.title = "Si ce numéro est plus ancien que prévu, rechargez la page (Cmd/Ctrl + Maj + R)"; }
try {
  const th = localStorage.getItem(STORE_KEY + "-theme"); if (th) document.documentElement.dataset.theme = th;
  const tab = localStorage.getItem(STORE_KEY + "-tab"); if (tab) ui.tab = tab;
} catch {}
document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + ui.tab));
save();
render();
