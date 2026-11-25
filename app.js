// Pilotage Bouchons — suivi trésorerie / stock / stratégie
// Tout est stocké dans le navigateur (localStorage). Partage via export JSON ou lien.

// Numéro de version affiché dans l'en-tête : à augmenter à chaque mise à jour du site
const APP_VERSION = "2.4";
const APP_DATE = "25/11/2026";
const STORE_KEY = "pilotage-bouchons-v1";
const KEY_KEY = "pilotage-bouchons-apikey";          // clé Claude (navigateur uniquement)
const GEM_KEY = "pilotage-bouchons-geminikey";       // clé Gemini (navigateur uniquement)
const GEM_MODEL_KEY = "pilotage-bouchons-geminimodel";
const IA_KEY = "pilotage-bouchons-ia";               // "gemini" | "claude"
const BACKUP_KEY = STORE_KEY + "-sauvegardes"; // copies datées, séparées des données
const BACKUP_MAX = 40;
const CLOUD_KEY = STORE_KEY + "-cloud";       // { url, key, code, name } : jamais exporté ni dans le lien de partage
const CLOUD_VER_KEY = STORE_KEY + "-cloudver"; // version du groupe sur laquelle ces données locales sont basées
let cloudInvited = false;
// Projet Supabase du groupe (URL + clé publishable : publiques par conception, l'accès aux données exige le code d'équipe)
const CLOUD_DEFAULT = { url: "https://dlfdvvikcbymfnixdoeh.supabase.co", key: "sb_publishable_eJU54Kv2QJo9t__5WgajFw_FOh5RT-r" };
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const PRODUITS = ["Agglomérés", "Q1", "Q2", "Q3", "Q4"];
// Matières premières (bouchons naturels) transformées par les trieuses en semi-finis Q1–Q4
const MATIERES = ["Espagne A", "Espagne B", "Espagne C", "Portugal A", "Portugal B", "Portugal C", "Maroc A", "Maroc B", "Maroc C"].map((x) => "Bouchons " + x);
const TOUS = [...PRODUITS, ...MATIERES];
const QS = ["Q1", "Q2", "Q3", "Q4"];
const PRIX_MATIERES = { "Bouchons Espagne A": 55, "Bouchons Espagne B": 60, "Bouchons Espagne C": 65 };
const DEFAULT_PRODUCTION = {
  frais: 2,
  capacite: 0, // capacité de tri (lots/mois), 0 = non renseignée
  prixMarche: { ...PRIX_MATIERES },
  rendements: {
    "Bouchons Espagne A": [15, 30, 30, 25], "Bouchons Espagne B": [20, 30, 30, 20], "Bouchons Espagne C": [25, 30, 25, 20],
    "Bouchons Portugal A": [10, 25, 35, 30], "Bouchons Portugal B": [15, 30, 30, 25], "Bouchons Portugal C": [20, 35, 25, 20],
    "Bouchons Maroc A": [5, 20, 35, 40], "Bouchons Maroc B": [10, 15, 30, 45], "Bouchons Maroc C": [15, 25, 35, 25],
  },
};
// Ciblage marketing par segment (à partir du mois 3) : niveau → coût HT
const CIBLAGES = [["Aucune", 0], ["Flyers (10 000 €)", 10000], ["E-mailing (20 000 €)", 20000], ["Visite de l'usine (50 000 €)", 50000]];
const coutCiblage = (m) => SEGMENTS.reduce((t, sg) => t + (CIBLAGES[n0(m.marketing?.[sg]?.ciblage)]?.[1] || 0), 0);
// Besoins clients annoncés (guide « Nouvelles activités ») : segment → produit → { index du mois : lots }
const BESOINS_GUIDE = {
  Vignerons: { Q1: [130, 160, 200, 130], Q2: [260, 320, 400, 260], Q3: [390, 480, 600, 390], Q4: [520, 640, 800, 520], "Agglomérés": [200, 200, 200, 200] },
  Caves: { Q1: [200, 200, 200, 200], Q2: [200, 200, 200, 200], Q3: [200, 200, 200, 200], Q4: [600, 600, 600, 600], "Agglomérés": [1200, 1200, 1200, 1200] },
  "Négociants": { Q1: [0, 0, 0, 0], Q2: [300, 300, 300, 300], Q3: [600, 600, 600, 600], Q4: [900, 900, 900, 900], "Agglomérés": [6000, 6000, 6000, 6000] },
};
const DEFAULT_BESOINS = () => Object.fromEntries(SEGMENTS.map((sg) => [sg, Object.fromEntries(Object.entries(BESOINS_GUIDE[sg]).map(([pr, v]) => [pr, Object.fromEntries(v.map((x, k) => [k + 2, x]))]))]));
const RULES_GUIDE = `
Guide « Nouvelles activités » (distributeur) :
- Les distributeurs achètent des lots de bouchons naturels tubés (Espagne A, B, C) aux industriels ou à d'autres distributeurs. Livrés au mois M+1, facturés à la commande.
- Tri : 4 qualités Q1 (moins de défauts) à Q4 (plus de défauts) ; la qualité dépend du type de planche (Espagne A/B/C). Frais de tri 2 € par lot en entrée. Capacité de tri indiquée dans le simulateur ; marquage illimité.
- Après tri : marquer et vendre aux clients (vignerons, caves, négociants/grands comptes), revendre sans marquage à d'autres distributeurs, ou stocker.
- Clients : pour chaque type, positionnement sur le produit, le prix, le délai de paiement, la publicité et l'axe publicitaire. Pas obligé de servir tous les clients.
- Besoins clients annoncés Mars–Juin (lots/mois) : Vignerons Q1 130/160/200/130, Q2 260/320/400/260, Q3 390/480/600/390, Q4 520/640/800/520, Agglomérés 200 ; Caves Q1 200, Q2 200, Q3 200, Q4 600, Agglomérés 1200 ; Grands comptes Q1 0, Q2 300, Q3 600, Q4 900, Agglomérés 6000.
- Prix clients (min–max €) : Vignerons Q1 160–200, Q2 140–180, Q3 120–160, Q4 100–140, Agglo 40–80 ; Caves Q1 145–170, Q2 125–150, Q3 105–130, Q4 85–110, Agglo 25–50 ; Grands comptes Q1 130–150, Q2 110–130, Q3 90–110, Q4 70–90, Agglo 10–30.`;
const besoin = (sg, pr, i) => n0(state.besoins?.[sg]?.[pr]?.[i]);
const besoinTotal = (pr, i) => SEGMENTS.reduce((t, sg) => t + besoin(sg, pr, i), 0);
const PARAM_CHANGEABLES = [["Salaires mensuels (€)", "salaires"], ["Frais de structure mensuels (€)", "structure"], ["Frais de stockage (%)", "stockageRate"]];
const RULES_MARS = `
Annonce du mois de mars (mois 3) :
- STECKER (fournisseur historique allemand) est en liquidation judiciaire : plus aucune offre de sa part. Il faut intensifier les démarches avec les fournisseurs français.
- Rachat de ses machines de production (trieuses) pour 30 000 € (paiement comptant, amorti sur 5 ans) : nouveau domaine d'activité, le bouchon naturel.
- Rachat de son stock de bouchons naturels pour 285 000 €, payé au mois de mars.
- Salaires mensuels portés à 150 000 € dès maintenant (équipe pour le tri et la distribution). Les autres paramètres restent inchangés.
- Trieuses : chaque lot de matière (Bouchons Espagne/Portugal/Maroc A/B/C) donne des bouchons semi-finis Q1 à Q4 selon des pourcentages ; frais de fabrication 2 € par unité en entrée.
- Ciblage marketing : à partir du mois 3, une action marketing ciblée par typologie de client final (viticulteurs, négociants, caves), au choix parmi trois niveaux : Flyers (10 000 € HT), E-mailing (20 000 € HT), Visite de l'usine (50 000 € HT). Ce type de communication a un impact positif.
- Prix d'achat moyen auprès des industriels : 55 €/lot Bouchons Espagne A, 60 €/lot Espagne B, 65 €/lot Espagne C.`;
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
const emptyMarketing = () => ({ Vignerons: { prix: 0, delai: 0, ciblage: 0 }, Caves: { prix: 0, delai: 0, ciblage: 0 }, "Négociants": { prix: 0, delai: 0, ciblage: 0 }, pub: 0 });
const emptyLivraisons = () => Object.fromEntries(SEGMENTS.map((s) => [s, { demande: 0, livre: 0 }]));
const emptyMonth = (nom) => ({ nom, marketing: emptyMarketing(), livraisons: emptyLivraisons(), achats: [], ventes: [], depenses: [], production: [], livraisonsQ: {}, planif: "", nego: "" });

function defaultState() {
  return {
    version: 2,
    team: "Notre entreprise",
    currentMonth: 0,
    params: { capital: 500000, salaires: 40000, structure: 20000, stockageRate: 0.33, prixMarche: 21, seuilTreso: 50000 },
    stockInitial: { lots: 12000, prix: 25, moisPaiement: 0, produit: "Agglomérés" },
    prixClients: structuredClone(DEFAULT_PRIX_CLIENTS),
    months: MOIS.map(emptyMonth),
    paramChanges: [],      // [{ id, mois, cle, valeur }] : un paramètre change à partir d'un mois
    investissements: [],   // [{ id, libelle, montant, mois, duree (années) }] : payé comptant, amorti
    production: structuredClone(DEFAULT_PRODUCTION),
    besoins: DEFAULT_BESOINS(),
    rules: DEFAULT_RULES,
    chat: [],
  };
}

let state = load();
let ui = {
  tab: "dashboard", editMonth: state.currentMonth, busy: false,
  rev: { mois: null, cle: "ca", marge: 20 },
  cloudForm: { url: CLOUD_DEFAULT.url, key: CLOUD_DEFAULT.key, code: "", name: "" }, cloudHist: null,
  simu: { type: "achat", produit: "Agglomérés", segment: "Vignerons", lots: 5000, prix: 21, delai: 1, livraison: 1, transport: "Train", coutTransport: 0, mois: state.currentMonth },
};

// ---------- sauvegardes ----------
function listBackups() { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]"); } catch { return []; } }
// raw : chaîne JSON des données à sauvegarder (par défaut l'état enregistré actuellement)
function snapshot(label, raw) {
  try {
    raw = raw ?? localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw); o.chat = [];
    const data = JSON.stringify(o);
    const list = listBackups();
    if (list[0] && list[0].data === data && !/manuelle/i.test(label)) return true; // rien n'a changé
    list.unshift({ date: new Date().toISOString(), label, data });
    while (list.length > BACKUP_MAX) list.pop();
    for (;;) {
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list)); return true; }
      catch { if (list.length <= 1) return false; list.pop(); }
    }
  } catch { return false; }
}
function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => { const d = new Date(), z = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}h${z(d.getMinutes())}`; };
const fmtDate = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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
  if (TOUS.includes(p)) return p;
  const mt = String(p).match(/(espagne|portugal|maroc)\s*([abc])\b/i);
  if (mt) return `Bouchons ${mt[1][0].toUpperCase()}${mt[1].slice(1).toLowerCase()} ${mt[2].toUpperCase()}`;
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
  out.months.forEach((m) => { m.production = (m.production || []).map((x) => ({ ...x, matiere: normProduit(x.matiere) })); });
  out.paramChanges = Array.isArray(s.paramChanges) ? s.paramChanges : [];
  out.investissements = Array.isArray(s.investissements) ? s.investissements : [];
  out.production = { frais: s.production?.frais ?? DEFAULT_PRODUCTION.frais, prixMarche: { ...DEFAULT_PRODUCTION.prixMarche, ...(s.production?.prixMarche || {}) }, rendements: { ...structuredClone(DEFAULT_PRODUCTION.rendements), ...(s.production?.rendements || {}) } };
  if (out.rules && !out.rules.includes("liquidation judiciaire")) out.rules += "\n" + RULES_MARS;
  if (out.rules && !out.rules.includes("Nouvelles activités")) out.rules += "\n" + RULES_GUIDE;
  if (!s.besoins) out.besoins = DEFAULT_BESOINS();
  out.months.forEach((m) => { m.livraisonsQ = m.livraisonsQ || {}; });
  // Caves Q4 : le simulateur (Informations Clients) affiche 85–110 €, c'est lui qui fait foi.
  // La v2.2 l'avait passé à 100 € d'après le guide PDF : on remet 110 € une seule fois.
  if (!s.fixCavesQ4) {
    const cq4 = out.prixClients?.Caves?.Q4;
    if (cq4 && cq4[0] === 85 && cq4[1] === 100) out.prixClients.Caves.Q4 = [85, 110];
    out.fixCavesQ4 = true;
  }
  if (out.rules) out.rules = out.rules.replace("Q4 85–100, Agglo 25–50", "Q4 85–110 (simulateur), Agglo 25–50");
  out.production.capacite = n0(s.production?.capacite);
  if (out.rules && !out.rules.includes("Positionnement Marketing")) out.rules += "\n" + RULES_PLANIF;
  if (out.rules && !out.rules.includes("rôle de distributeur")) out.rules += "\n" + RULES_DISTRIB;
  out.rules = out.rules.replace("(« À la commande » ou plus)", "(comptant, 30 jours ou 60 jours)");
  out.version = 2;
  return out;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  if (typeof cloudSchedule === "function") cloudSchedule();
}
function readHash() {
  if (location.hash.startsWith("#cloud=")) {
    try {
      const inv = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7)))));
      let old = {}; try { old = JSON.parse(localStorage.getItem(CLOUD_KEY) || "{}"); } catch {}
      if (inv.url && inv.key && inv.code) {
        localStorage.setItem(CLOUD_KEY, JSON.stringify({ url: inv.url, key: inv.key, code: inv.code, name: old.name || "" }));
        if (old.code !== inv.code) localStorage.removeItem(CLOUD_VER_KEY);
        cloudInvited = true;
      }
    } catch (e) { console.warn(e); }
    history.replaceState(null, "", location.pathname);
    return null;
  }
  if (!location.hash.startsWith("#data=")) return null;
  try {
    const json = decodeURIComponent(escape(atob(location.hash.slice(6))));
    const s = migrate(JSON.parse(json));
    snapshot("Automatique · avant ouverture d'un lien de partage");
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
  const segQ = SEGMENTS.flatMap((sg) => QS.map((q) => ({
    segment: sg, client: SEG_LABEL[sg], produit: q, lots: n0(m.livraisonsQ?.[sg]?.[q]?.livre),
    prix: clampPrix(sg, q, m.marketing[sg]?.["prix" + q]), delai: n0(m.marketing[sg]?.delai), transport: "", coutTransport: 0, auto: true,
  }))).filter((v) => v.lots > 0);
  return [...seg, ...segQ, ...m.ventes];
}
// Valeur d'un paramètre au mois i (en tenant compte des changements en cours de jeu)
function paramAt(s, i, k) {
  let v = n0(s.params[k]);
  (s.paramChanges || []).filter((c) => c.cle === k && n0(c.mois) <= i).sort((a, b) => n0(a.mois) - n0(b.mois)).forEach((c) => { v = n0(c.valeur); });
  return v;
}
// Prix moyen marché d'achat d'un produit (agglomérés : paramètre ; matières : annonce du jeu)
const prixMarcheDe = (prod) => (prod === "Agglomérés" ? n0(state.params.prixMarche) : n0(state.production?.prixMarche?.[prod]));
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

  const stock = Object.fromEntries(TOUS.map((pr) => [pr, { lots: 0, val: 0 }]));
  stock[si.produit] = { lots: n0(si.lots), val: n0(si.lots) * n0(si.prix) };
  let treso = n0(p.capital);
  let cumRes = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = s.months[i];
    const lotsDebut = TOUS.reduce((t, pr) => t + stock[pr].lots, 0);
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
    // production (trieuses) : matière → semi-finis Q1–Q4, coût = coût moyen de la matière + frais de fabrication
    let prodLots = 0, fabrication = 0, prodNeg = false;
    const prodOut = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const pp = s.production || DEFAULT_PRODUCTION;
    for (const pl of m.production || []) {
      const mat = normProduit(pl.matiere);
      if (!MATIERES.includes(mat)) continue;
      const l = Math.max(0, n0(pl.lots));
      if (!l) continue;
      const st = stock[mat];
      if (l > st.lots + 1e-6) prodNeg = true;
      const take = Math.min(l, st.lots);
      const cu = st.lots > 0 ? st.val / st.lots : 0;
      st.val -= take * cu; st.lots -= take;
      const fr = n0(pp.frais);
      fabrication += take * fr; prodLots += take;
      const rd = pp.rendements?.[mat] || [25, 25, 25, 25];
      const tot = rd.reduce((a, b) => a + n0(b), 0) || 100;
      QS.forEach((q, k) => { const o = take * n0(rd[k]) / tot; stock[q].lots += o; stock[q].val += o * (cu + fr); prodOut[q] += o; });
    }
    const cmupP = {};
    const dispoP = {};
    for (const pr of TOUS) { dispoP[pr] = stock[pr].lots; cmupP[pr] = stock[pr].lots > 0 ? stock[pr].val / stock[pr].lots : 0; }
    let venLots = 0, ca = 0, coutVentes = 0, transportVentes = 0;
    const venteP = {};
    for (const v of ventesDuMois(m)) {
      const l = n0(v.lots), pr = n0(v.prix), prod = normProduit(v.produit);
      venLots += l; ca += l * pr; coutVentes += l * cmupP[prod];
      venteP[prod] = (venteP[prod] || 0) + l;
      enc[i + n0(v.delai)] += l * pr;
      transport += n0(v.coutTransport); transportVentes += n0(v.coutTransport);
      if (v.transport) rse[v.transport] = (rse[v.transport] || 0) + l;
    }
    let lotsFin = 0, valFin = 0;
    const finP = {};
    let stockNeg = false;
    for (const pr of TOUS) {
      const lf = stock[pr].lots - (venteP[pr] || 0);
      if (lf < 0) stockNeg = true;
      // Un stock négatif (sur-vente) n'est pas reporté : le jeu ne permet pas de livrer plus que le stock
      stock[pr] = { lots: Math.max(0, lf), val: Math.max(0, lf) * cmupP[pr] };
      finP[pr] = lf; lotsFin += lf; valFin += stock[pr].val;
    }
    const demande = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons?.[sg]?.demande), 0);
    const perdue = SEGMENTS.reduce((t, sg) => t + Math.max(0, n0(m.livraisons?.[sg]?.demande) - n0(m.livraisons?.[sg]?.livre)), 0);
    const perdueQ = SEGMENTS.reduce((t, sg) => t + QS.reduce((u, q) => u + Math.max(0, n0(m.livraisonsQ?.[sg]?.[q]?.demande) - n0(m.livraisonsQ?.[sg]?.[q]?.livre)), 0), 0);
    const demandeQ = SEGMENTS.reduce((t, sg) => t + QS.reduce((u, q) => u + n0(m.livraisonsQ?.[sg]?.[q]?.demande), 0), 0);
    const capTri = n0((s.production || {}).capacite);
    const triDepasse = capTri > 0 && prodLots > capTri;
    let transit = 0;
    for (let k = i + 1; k < H; k++) for (const a of Object.values(arrivals[k])) transit += a.lots;
    const stockageRate = paramAt(s, i, "stockageRate");
    const stockage = valFin * stockageRate / 100;
    const ciblage = coutCiblage(m);
    const pub = n0(m.marketing?.pub) + n0(m.marketing?.pubNat) + ciblage; // publicité agglomérés + bouchons naturels + niveaux de publicité ciblés
    const divers = m.depenses.reduce((t, d) => t + n0(d.montant), 0) + pub;
    const salaires = paramAt(s, i, "salaires"), structure = paramAt(s, i, "structure");
    const fixes = salaires + structure;
    // investissements : payés comptant au mois d'achat, amortis (charge sans sortie d'argent) sur la durée
    let investDec = 0, dotations = 0;
    for (const inv of s.investissements || []) {
      const mo = n0(inv.mois), mt = n0(inv.montant), dur = Math.max(1, Math.round(n0(inv.duree) * 12) || 60);
      if (mo === i) investDec += mt;
      if (i >= mo && i < mo + dur) dotations += mt / dur;
    }
    const decaiss = fixes + stockage + transport + divers + decAch[i] + fabrication + investDec;
    const tresoDebut = treso;
    const tresoFin = treso + enc[i] - decaiss;
    const resultat = ca - coutVentes - fixes - stockage - transport - divers - dotations;
    cumRes += resultat;
    rows.push({
      i, nom: m.nom, tresoDebut, encaissements: enc[i], paiementsAchats: decAch[i], fixes, stockage, transport, divers, pub,
      decaissements: decaiss, tresoFin, cmdLots, cmdVal, recLots, recVal, venLots, ca, coutVentes, lotsDebut, lotsFin, valFin, transit,
      salaires, structure, stockageRate, dotations, ciblage, perdueQ, demandeQ, triDepasse, capTri, investDec, fabrication, prodLots, prodOut, prodNeg,
      demande, perdue, transportVentes, cmup: cmupP["Agglomérés"], cmupP, dispoP, finP, venteP, resultat, cumRes, marge: ca - coutVentes, rse, stockNeg,
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
  const charges = r.fixes + r.stockage + r.transport + r.divers + r.dotations; // divers inclut pub et autres dépenses
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

// ---------- aides à la décision ----------
// Observations passées d'un segment (mois < upto) : prix effectif, délai, pub, demande saisie
function histoSegment(seg, upto) {
  const out = [];
  for (let k = 0; k < Math.min(upto, state.months.length); k++) {
    const m = state.months[k], d = n0(m.livraisons?.[seg]?.demande);
    if (d > 0) out.push({ k, nom: m.nom, prix: clampPrix(seg, "Agglomérés", m.marketing[seg].prix), delai: n0(m.marketing[seg].delai), pub: n0(m.marketing.pub), demande: d });
  }
  return out;
}
// Demande = a + b × prix (moindres carrés) si au moins 2 prix différents ; sinon dernière demande observée
function modeleDemande(obs) {
  if (!obs.length) return null;
  const n = obs.length, mx = obs.reduce((t, o) => t + o.prix, 0) / n, my = obs.reduce((t, o) => t + o.demande, 0) / n;
  let sxx = 0, sxy = 0;
  obs.forEach((o) => { sxx += (o.prix - mx) ** 2; sxy += (o.prix - mx) * (o.demande - my); });
  if (n >= 2 && sxx > 1e-9 && sxy < 0) { const b = sxy / sxx; return { type: "droite", at: (p) => Math.max(0, my + b * (p - mx)), b }; }
  const last = obs.at(-1).demande;
  return { type: n >= 2 && sxx > 1e-9 ? "plat" : "dernier", at: () => (n >= 2 ? my : last) };
}
// Demande totale attendue : moyenne des 3 derniers mois (≤ i) où une demande a été saisie
function demandeAttendue(i) {
  const annonce = besoinTotal("Agglomérés", i + 1) || besoinTotal("Agglomérés", i);
  if (annonce) return annonce;
  const v = [];
  for (let k = Math.min(i, state.months.length - 1); k >= 0 && v.length < 3; k--) {
    const d = SEGMENTS.reduce((t, sg) => t + n0(state.months[k].livraisons?.[sg]?.demande), 0);
    if (d > 0) v.push(d);
  }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
// Faut-il commander ce mois-ci (livraison industriel 30 jours) ?
function alerteCommande(c, i) {
  const next = c.rows[i + 1];
  if (!next) return null;
  const D = demandeAttendue(i);
  if (!D) return null;
  const dispoNext = next.dispoP["Agglomérés"];
  const manque = Math.round(D * 1.1 - dispoNext);
  if (manque <= 0) return null;
  return { manque, D, dispoNext, nom: c.rows[i].nom, next: next.nom };
}
const alerteCommandeTexte = (a) => `<b>Commande à passer en ${esc(a.nom)}</b> : pour ${esc(a.next)} vous aurez ${fmtN(a.dispoNext)} lots d'agglomérés (stock restant + commandes validées) pour une demande attendue d'environ ${fmtN(a.D)} lots. Il manque ≈ <b>${fmtN(a.manque)} lots</b> (avec 10 % de marge) : négociez-les dès ce mois-ci chez un industriel (livraison 30 jours), sinon seul un distributeur pourra vous dépanner.`;

// Estimation du mois i avec les prix planifiés (sert à « Figer la prévision »)
function estimMois(c, i) {
  const m = state.months[i], r = c.rows[i];
  const cm = r.cmupP["Agglomérés"] || n0(state.stockInitial.prix);
  let dem = 0, caPot = 0, inconnu = [];
  SEGMENTS.forEach((sg) => {
    const mod = modeleDemande(histoSegment(sg, i));
    const pe = clampPrix(sg, "Agglomérés", m.marketing[sg].prix);
    if (!mod) { inconnu.push(SEG_LABEL[sg]); return; }
    const d = mod.at(pe); dem += d; caPot += d * pe;
  });
  const dispo = r.dispoP["Agglomérés"];
  const lots = Math.min(dem, dispo), ca = dem ? caPot * lots / dem : 0;
  const charges = r.fixes + r.stockage + r.transport + r.divers + r.dotations;
  return { demande: Math.round(dem), lots: Math.round(lots), ca: Math.round(ca), resultat: Math.round(ca - lots * cm - charges), inconnu };
}

function productionHtml(c, i) {
  const m = state.months[i], r = c.rows[i];
  const pp = state.production;
  const dispoMat = MATIERES.filter((x) => (c.rows[i].dispoP[x] || 0) > 0 || (m.production || []).some((p) => p.matiere === x));
  if (!dispoMat.length && !(m.production || []).length && i < 2) return "";
  // stock de matière avant production ce mois (stock dispo + ce qui est trié)
  const avant = {};
  MATIERES.forEach((x) => { avant[x] = (r.dispoP[x] || 0) + (m.production || []).filter((p) => p.matiere === x).reduce((t, p) => t + n0(p.lots), 0); });
  const inp = (j, k, v, extra = "") => `<input type="number" ${extra} data-m="${i}" data-list="production" data-j="${j}" data-k="${k}" value="${esc(v)}">`;
  return `<div class="card">
    <div class="row between"><h2>Production · trieuses (bouchons naturels)</h2><button class="btn ghost" data-add="production">+ Trier un lot de matière</button></div>
    <p class="muted small">Chaque lot de matière trié donne des semi-finis Q1 à Q4 selon les pourcentages du jeu (Paramètres). Coût d'un lot produit = coût moyen de la matière + ${fmtP(n0(pp.frais))} de frais de fabrication (payés ce mois-ci). Hypothèse : les semi-finis sont vendables le mois même.</p>
    <p class="small">Matières en stock ce mois : ${MATIERES.filter((x) => avant[x] > 0).map((x) => `<b>${fmtN(avant[x])}</b> ${esc(x.replace("Bouchons ", ""))}`).join(" · ") || `<span class="muted">aucune — saisissez le stock racheté (285 000 €) comme achat de matières à l'étape B de Mars</span>`}</p>
    ${(m.production || []).length ? `<div class="table-wrap"><table>
      <thead><tr><th>Matière</th><th class="r">Lots triés</th>${QS.map((q) => `<th class="r">→ ${q}</th>`).join("")}<th class="r">Frais</th><th></th></tr></thead>
      <tbody>${m.production.map((p, j) => { const rd = pp.rendements[p.matiere] || [25, 25, 25, 25]; const tot = rd.reduce((a, b) => a + n0(b), 0) || 100; const l = n0(p.lots);
        return `<tr><td><select data-m="${i}" data-list="production" data-j="${j}" data-k="matiere">${opts(MATIERES.map((x) => [x, x]), p.matiere)}</select></td>
        <td class="r">${inp(j, "lots", p.lots)}${l > avant[p.matiere] + 1e-6 ? ` <span class="badge crit">&gt; stock</span>` : ""}</td>
        ${QS.map((q, k) => `<td class="r">${fmtN(l * n0(rd[k]) / tot)} <span class="muted small">${n0(rd[k])} %</span></td>`).join("")}
        <td class="r">${fmtE(l * n0(pp.frais))}</td><td><button class="btn danger" data-del="production" data-j="${j}">✕</button></td></tr>`; }).join("")}</tbody>
    </table></div>
    <p class="small">Produit ce mois : ${QS.map((q) => `<b>${fmtN(r.prodOut[q])}</b> ${q}${r.prodOut[q] ? ` (coût ${fmtP(r.cmupP[q])})` : ""}`).join(" · ")}. Vendez-les dans « Autres ventes » (produit Q1 à Q4, fourchettes de prix dans Paramètres).</p>` : ""}
  </div>`;
}

// Étape A pour les bouchons naturels Q1–Q4
function stepAQHtml(c, i) {
  const m = state.months[i], r = c.rows[i];
  const rows = SEGMENTS.flatMap((sg) => QS.map((q) => ({ sg, q, lv: m.livraisonsQ?.[sg]?.[q] || { demande: 0, livre: 0 }, bes: besoin(sg, q, i), prix: n0(m.marketing[sg]?.["prix" + q]) })))
    .filter((x) => x.bes || n0(x.lv.demande) || x.prix);
  if (!rows.length) return i >= 2 ? `<p class="muted small section-gap">Bouchons naturels Q1–Q4 : aucun besoin annoncé ni prix planifié ce mois-ci.</p>` : "";
  const dispo = QS.map((q) => `<b>${fmtN(r.dispoP[q])}</b> ${q}`).join(" · ");
  const penurie = QS.filter((q) => SEGMENTS.reduce((t, sg) => t + n0(m.livraisonsQ?.[sg]?.[q]?.demande), 0) > r.dispoP[q] + 1e-6);
  return `<h3 class="section-gap">Bouchons naturels Q1–Q4</h3>
    <p class="muted small">Stock vendable ce mois (après tri) : ${dispo}. Prix = prix Q planifiés du segment (ramenés dans la fourchette). « Besoin annoncé » = tableau du guide (Paramètres).</p>
    ${penurie.length ? `<div class="alert crit"><span class="ico">⚠</span><span><b>Pénurie</b> de ${penurie.join(", ")} : la demande dépasse le stock trié. Utilisez « Répartir automatiquement » ou triez plus de matière.</span></div>` : ""}
    <div class="table-wrap"><table>
      <thead><tr><th>Segment</th><th>Produit</th><th class="r">Prix effectif</th><th class="r">Besoin annoncé</th><th class="r">Demande</th><th class="r">Livré</th><th class="r">Perdu</th><th class="r">CA</th><th class="r">Marge</th></tr></thead>
      <tbody>${rows.map((x) => {
        const pe = clampPrix(x.sg, x.q, x.prix), perdu = Math.max(0, n0(x.lv.demande) - n0(x.lv.livre)), mg = n0(x.lv.livre) * (pe - (r.cmupP[x.q] || 0));
        return `<tr><td>${SEG_LABEL[x.sg]}</td><td>${x.q}</td><td class="r">${x.prix ? fmtP(pe) : `<span class="muted" title="Prix non planifié : plancher de la fourchette">${fmtP(pe)}</span>`}</td><td class="r muted">${fmtN(x.bes)}</td>
          <td class="r"><input type="number" min="0" data-livq="${x.sg}|${x.q}" data-livk="demande" data-m="${i}" value="${esc(x.lv.demande)}"></td>
          <td class="r"><input type="number" min="0" data-livq="${x.sg}|${x.q}" data-livk="livre" data-m="${i}" value="${esc(x.lv.livre)}">${n0(x.lv.livre) > n0(x.lv.demande) ? ` <span class="badge crit">&gt; demande</span>` : ""}</td>
          <td class="r ${perdu ? "neg" : ""}">${fmtN(perdu)}</td><td class="r">${fmtE(n0(x.lv.livre) * pe)}</td><td class="r ${cls(mg)}">${fmtE(mg)}</td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
}

// Besoins annoncés du mois prochain vs stock prévu → quoi acheter (livraison M+1)
function besoinsHtml(c, i) {
  const nx = i + 1;
  if (nx >= state.months.length) return "";
  const prods = ["Agglomérés", ...QS];
  const need = Object.fromEntries(prods.map((p) => [p, besoinTotal(p, nx)]));
  if (!prods.some((p) => need[p])) return "";
  const rn = c.rows[nx];
  // matière déjà en stock ou attendue le mois prochain, convertible en Q
  const matDispo = MATIERES.filter((x) => rn.dispoP[x] > 0);
  const pp = state.production;
  const potentielQ = Object.fromEntries(QS.map((q, k) => [q, rn.dispoP[q] + matDispo.reduce((t, x) => { const rd = pp.rendements[x] || [0, 0, 0, 0]; const tot = rd.reduce((a, b) => a + n0(b), 0) || 100; return t + rn.dispoP[x] * n0(rd[k]) / tot; }, 0)]));
  const manque = Object.fromEntries(prods.map((p) => [p, Math.max(0, need[p] - (p === "Agglomérés" ? rn.dispoP[p] : potentielQ[p]))]));
  const manqueQ = QS.map((q) => manque[q]);
  // lots de matière Espagne A/B/C à acheter pour couvrir tous les Q manquants (la qualité la plus contraignante décide)
  const options = MATIERES.filter((x) => pp.prixMarche[x] || /Espagne/.test(x)).map((x) => {
    const rd = pp.rendements[x] || [25, 25, 25, 25]; const tot = rd.reduce((a, b) => a + n0(b), 0) || 100;
    let lots = 0; QS.forEach((q, k) => { const y = n0(rd[k]) / tot; if (manqueQ[k] > 0) lots = Math.max(lots, y > 0 ? manqueQ[k] / y : Infinity); });
    lots = Math.ceil(lots);
    const cout = Number.isFinite(lots) && pp.prixMarche[x] ? lots * (n0(pp.prixMarche[x]) + n0(pp.frais)) : null;
    const surplus = Number.isFinite(lots) ? QS.map((q, k) => Math.max(0, lots * n0(rd[k]) / tot - manqueQ[k])).reduce((a, b) => a + b, 0) : null;
    return { x, lots, cout, surplus };
  });
  const anyQ = manqueQ.some((v) => v > 0);
  const best = anyQ ? options.filter((o) => o.cout !== null).sort((a, b) => a.cout - b.cout)[0] : null;
  return `<div class="card">
    <h2>Besoins annoncés de ${esc(rn.nom)} → quoi acheter maintenant</h2>
    <p class="muted small">Un achat chez un industriel ce mois-ci arrive en ${esc(rn.nom)}. Besoins = tableau du guide (tous segments). Stock prévu = stock restant + achats validés qui arrivent ; pour Q1–Q4, on compte aussi la matière disponible une fois triée.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Produit</th><th class="r">Besoin ${esc(rn.nom)}</th><th class="r">Stock prévu</th><th class="r">Manque</th></tr></thead>
      <tbody>${prods.map((p) => `<tr><td>${p}</td><td class="r">${fmtN(need[p])}</td><td class="r">${fmtN(p === "Agglomérés" ? rn.dispoP[p] : potentielQ[p])}</td><td class="r ${manque[p] ? "neg" : ""}"><b>${fmtN(manque[p])}</b></td></tr>`).join("")}</tbody>
    </table></div>
    ${manque["Agglomérés"] ? `<div class="alert warn"><span class="ico">!</span><span>Agglomérés : négocier ≈ <b>${fmtN(Math.ceil(manque["Agglomérés"] * 1.1))} lots</b> (manque + 10 %).</span></div>` : ""}
    ${anyQ ? `<p class="small section-gap"><b>Pour couvrir les Q1–Q4 manquants</b>, il faudrait trier (une seule matière) :</p>
      <table><thead><tr><th>Matière</th><th class="r">Lots à acheter</th><th class="r">Coût estimé (achat + tri)</th><th class="r">Lots en trop</th></tr></thead><tbody>
      ${options.map((o) => `<tr class="${o === best ? "current" : ""}"><td>${esc(o.x)}${o === best ? ` <span class="badge good">le moins cher</span>` : ""}</td><td class="r">${Number.isFinite(o.lots) ? fmtN(o.lots) : "—"}</td><td class="r">${o.cout !== null ? fmtE(o.cout) : "—"}</td><td class="r muted">${o.surplus !== null ? fmtN(o.surplus) : "—"}</td></tr>`).join("")}
      </tbody></table>
      <p class="muted small">La qualité la plus difficile à obtenir fixe la quantité ; les autres qualités sont produites en trop (stockables ou revendables à d'autres distributeurs). Coût estimé au prix moyen annoncé (55 / 60 / 65 €) + ${fmtP(n0(pp.frais))} de tri par lot. Vous n'êtes pas obligés de servir tous les besoins : comparez avec la marge de chaque produit.</p>` : `<div class="alert good"><span class="ico">✓</span><span>Q1–Q4 : le stock prévu couvre les besoins annoncés.</span></div>`}
  </div>`;
}

function planifAideHtml(c, i) {
  const r = c.rows[i], m = state.months[i];
  const cm = r.cmupP["Agglomérés"] || n0(state.stockInitial.prix);
  const dispo = r.dispoP["Agglomérés"];
  let anyObs = false, totBest = 0;
  const lignes = SEGMENTS.map((sg) => {
    const rg = range(sg, "Agglomérés"); const obs = histoSegment(sg, i); const mod = modeleDemande(obs);
    if (obs.length) anyObs = true;
    const sc = [rg[0], (rg[0] + rg[1]) / 2, rg[1]].map((p) => { const d = mod ? mod.at(p) : null; return { p, d, mg: d === null ? null : d * (p - cm) }; });
    // Conseil seulement si l'effet du prix a pu être mesuré (au moins 2 prix différents observés)
    let best = null;
    if (mod && mod.type !== "dernier") sc.forEach((x) => { if (x.mg !== null && (!best || x.mg > best.mg + 0.5)) best = x; });
    if (best?.d) totBest += best.d;
    const hist = obs.slice(-3).map((o) => `${esc(o.nom)} : ${fmtP(o.prix)} → ${fmtN(o.demande)} lots`).join("<br>") || `<span class="muted">aucune donnée</span>`;
    const modTxt = !mod ? "" : mod.type === "droite" ? `<span class="muted small">−${fmtN(-mod.b)} lots par € de hausse</span>` : mod.type === "plat" ? `<span class="muted small">pas d'effet prix visible</span>` : `<span class="muted small">un seul prix testé : demande supposée identique, pas de conseil (essayez un autre prix pour mesurer l'effet)</span>`;
    return { sg, rg, sc, best, hist, modTxt, cur: clampPrix(sg, "Agglomérés", m.marketing[sg].prix) };
  });
  const cell = (x, best) => `<td class="r ${best === x ? "best" : ""}">${fmtP(x.p)}${x.d !== null ? `<br><span class="small">~${fmtN(x.d)} lots</span><br><span class="small ${cls(x.mg)}">marge ${fmtE(x.mg)}</span>` : `<br><span class="small ${cls(x.p - cm)}">${fmtP(x.p - cm)}/lot</span>`}${best === x ? `<br><span class="badge good">conseillé</span>` : ""}</td>`;
  const pen = anyObs && totBest > dispo;
  return `<div class="card aide">
    <div class="row between"><h2>Aide au choix des prix</h2>${lignes.some((l) => l.best) ? `<button class="btn ghost" id="applyPrix" data-m="${i}">Appliquer les prix conseillés</button>` : ""}</div>
    <p class="muted small">Pour chaque segment : prix bas / milieu / haut de la fourchette, demande estimée d'après vos mois passés, et marge sur coût d'achat (${fmtP(cm)}/lot). Les charges fixes ne dépendent pas du prix : on garde le prix qui maximise cette marge.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Segment</th><th>Mois passés (prix → demande)</th><th class="r">Prix bas</th><th class="r">Prix milieu</th><th class="r">Prix haut</th></tr></thead>
      <tbody>${lignes.map((l) => `<tr><td>${SEG_LABEL[l.sg]}<br>${l.modTxt}</td><td class="small">${l.hist}</td>${l.sc.map((x) => cell(x, l.best)).join("")}</tr>`).join("")}</tbody>
    </table></div>
    ${!anyObs ? `<div class="alert info"><span class="ico">i</span><span>Pas encore de demande saisie les mois précédents : seule la marge par lot est affichée. Les estimations apparaîtront dès qu'un mois aura sa demande (étape A).</span></div>` : ""}
    ${pen ? `<div class="alert warn"><span class="ico">!</span><span>Aux prix conseillés, la demande estimée (~${fmtN(totBest)} lots) dépasse votre stock vendable (${fmtN(dispo)} lots) : inutile de baisser les prix ou de faire de la publicité. Montez plutôt les prix des segments les moins rentables.</span></div>` : ""}
    <p class="muted small">Estimation simple (droite prix → demande sur vos mois passés) : elle ne tient compte ni de la publicité ni des concurrents. Délai de paiement : comptant protège la trésorerie, 30/60 jours peut attirer plus de demande.</p>
  </div>`;
}

function prevuHtml(c, i) {
  const m = state.months[i], r = c.rows[i], p = m.prevu;
  if (!p) return `<div class="card"><div class="row between"><h2>Prévu / réalisé</h2><button class="btn ghost" id="figerPrevu" data-m="${i}">Figer la prévision de ${esc(m.nom)}</button></div>
    <p class="muted small">À la fin de la planification, figez la prévision : le site garde une photo des chiffres attendus (demande, lots vendus, CA, résultat) pour les comparer ensuite au réel.</p></div>`;
  const dem = SEGMENTS.reduce((t, sg) => t + n0(m.livraisons[sg].demande), 0);
  const lignes = [["Demande clients (lots)", "demande", dem, fmtN], ["Lots vendus", "lots", r.venLots, fmtN], ["Chiffre d'affaires", "ca", r.ca, fmtE], ["Résultat du mois", "resultat", r.resultat, fmtE]];
  const real = dem > 0 || r.venLots > 0;
  return `<div class="card"><div class="row between"><h2>Prévu / réalisé · ${esc(m.nom)}</h2><button class="btn ghost" id="figerPrevu" data-m="${i}">Refaire la photo</button></div>
    <div class="table-wrap"><table><thead><tr><th></th><th class="r">Prévu</th><th class="r">Réalisé</th><th class="r">Écart</th></tr></thead><tbody>
      ${lignes.map(([lab, k, v, f]) => { const e = v - n0(p[k]); return `<tr><td>${lab}</td><td class="r"><input type="number" class="sm" data-prevu="${k}" data-m="${i}" value="${n0(p[k])}"></td><td class="r">${real ? f(v) : "—"}</td><td class="r ${real ? cls(e) : ""}">${real ? (e > 0 ? "+" : "") + f(e) : "—"}</td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="muted small">Prévision figée le ${fmtDate(p.date)}. Les valeurs prévues sont modifiables. Le réalisé se remplit avec la demande (étape A) et les ventes. Notez vos conclusions dans les notes du mois : l'IA les lit.</p></div>`;
}

// Fiche de négociation (achat) : prix maximum, volume maximum, comparaison des délais
function negoHtml(c, s, mi) {
  const tm = Math.min(95, Math.max(0, n0(ui.rev.marge)));
  const cur = c.rows[mi];
  const mLiv = Math.min(mi + n0(s.livraison), state.months.length - 1);
  const mk = state.months[mLiv].marketing, mk0 = state.months[mi].marketing;
  // Prix de vente de référence : prix planifiés (sinon milieu de fourchette), pondérés par la dernière demande observée
  let num = 0, den = 0;
  SEGMENTS.forEach((sg) => {
    const rg = range(sg, s.produit); if (!rg) return;
    const pr = n0(mk[sg]?.prix) || n0(mk0[sg]?.prix);
    const p = s.produit === "Agglomérés" && pr ? clampPrix(sg, s.produit, pr) : (rg[0] + rg[1]) / 2;
    const obs = histoSegment(sg, state.months.length); const w = obs.length ? obs.at(-1).demande : 1;
    num += p * w; den += w;
  });
  const P = den ? num / den : n0(state.params.prixMarche) * 1.5;
  const vol = demandeAttendue(state.currentMonth) || n0(s.lots) || 1;
  const charges = cur.fixes + cur.stockage + cur.divers + cur.dotations;
  const H = charges / vol;
  const pMaxMarge = P * (1 - tm / 100) - H, pMaxEq = P - H;
  const simMin = (lots, delai) => {
    const sim = structuredClone({ ...state, chat: [] });
    sim.months[mi].achats.push({ id: "sim", produit: s.produit, lots, prix: n0(s.prix), delai, livraison: n0(s.livraison), transport: s.transport, coutTransport: n0(s.coutTransport), fournisseur: "sim", statut: "validee" });
    return compute(sim);
  };
  // Fenêtre : du mois de l'offre jusqu'à 3 mois après (les mois lointains sans ventes saisies sont toujours négatifs)
  const wEnd = Math.min(state.months.length - 1, mi + 3);
  const minW = (cc) => { let v = Infinity, nom = ""; for (let k = mi; k <= wEnd; k++) if (cc.rows[k].tresoFin < v) { v = cc.rows[k].tresoFin; nom = cc.rows[k].nom; } return { v, nom }; };
  const baseMin = minW(c);
  let lo = 0, hi = 200000;
  if (n0(s.prix) > 0 && baseMin.v >= 0) {
    if (minW(simMin(hi, n0(s.delai))).v >= 0) lo = hi;
    else { while (hi - lo > 50) { const mid = Math.floor((lo + hi) / 2); if (minW(simMin(mid, n0(s.delai))).v >= 0) lo = mid; else hi = mid; } }
  }
  const cols = [mi, mi + 1, mi + 2].filter((k) => k < state.months.length);
  const delais = DELAIS.map((d, k) => { const cc = simMin(n0(s.lots), k); return { d, k, fins: cols.map((j) => cc.rows[j].tresoFin) }; });
  const prix = n0(s.prix);
  const verdict = !prix ? "" : prix <= pMaxMarge ? `<span class="badge good">OK : marge ≥ ${tm} %</span>` : prix <= pMaxEq ? `<span class="badge warn">rentable mais marge < ${tm} %</span>` : `<span class="badge crit">trop cher : vente à perte</span>`;
  const couverture = demandeAttendue(state.currentMonth) ? n0(s.lots) / demandeAttendue(state.currentMonth) : null;
  return `<div class="card">
    <h2>Jusqu'où négocier ? <span class="muted small">(offre de ${fmtN(n0(s.lots))} lots de ${esc(s.produit)} à ${fmtP(prix)})</span></h2>
    <div class="grid k4">
      <div class="kpi"><div class="label">Prix max pour ${tm} % de marge</div><div class="value">${fmtP(pMaxMarge)}</div><div class="hint">${verdict}</div></div>
      <div class="kpi"><div class="label">Prix max à l'équilibre</div><div class="value">${fmtP(pMaxEq)}</div><div class="hint">au-delà : perte</div></div>
      <div class="kpi"><div class="label">Lots max sans tréso négative</div><div class="value">${!prix ? "—" : baseMin.v < 0 ? "0" : lo >= 200000 ? "> 200 000" : fmtN(lo)}</div><div class="hint">${baseMin.v < 0 ? `tréso déjà négative en ${esc(baseMin.nom)} sans l'offre` : `à ${fmtP(prix)}, paiement ${DELAIS[n0(s.delai)].toLowerCase()}, jusqu'en ${esc(c.rows[wEnd].nom)}`}</div></div>
      <div class="kpi"><div class="label">Objectif d'ouverture</div><div class="value">${fmtP(Math.min(n0(state.params.prixMarche), pMaxMarge))}</div><div class="hint">prix marché ${fmtP(n0(state.params.prixMarche))}</div></div>
    </div>
    <p class="muted small section-gap">Calcul : prix de vente moyen attendu ${fmtP(P)} (vos prix planifiés, sinon milieu de fourchette, pondérés par la dernière demande) × (1 − ${tm} %) − charges par lot ${fmtP(H)} (salaires, structure, stockage, pub et autres du mois : ${fmtE(charges)} ÷ ${fmtN(vol)} lots ${demandeAttendue(state.currentMonth) ? "de demande attendue" : "de l'offre"}). Marge visée réglable dans l'onglet Coût de revient.${couverture ? ` Cette offre couvre ≈ ${couverture.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois de demande.` : ""}</p>
    <table><thead><tr><th>Délai de paiement</th>${cols.map((j) => `<th class="r">Tréso fin ${esc(c.rows[j].nom)}</th>`).join("")}</tr></thead><tbody>
      ${delais.map((x) => `<tr class="${x.k === n0(s.delai) ? "current" : ""}"><td>${x.d}</td>${x.fins.map((v) => `<td class="r ${cls(v)}">${fmtE(v)}</td>`).join("")}</tr>`).join("")}
    </tbody></table>
    <p class="muted small">Argument : un paiement à 30 ou 60 jours vaut de l'argent pour vous. Si le fournisseur refuse de baisser le prix, demandez un délai ou un transport en train (RSE).</p>
  </div>`;
}
function fournisseursHtml() {
  const map = new Map();
  state.months.forEach((m) => m.achats.forEach((a) => {
    const f = (a.fournisseur || "").trim() || "(sans nom)";
    const x = map.get(f) || { f, offres: 0, valLots: 0, valMontant: 0, best: Infinity, refus: 0, last: null };
    const st = a.statut || "validee";
    x.offres++; if (st === "refusee") x.refus++;
    if (st === "validee") { x.valLots += n0(a.lots); x.valMontant += n0(a.lots) * n0(a.prix); }
    if (n0(a.prix) > 0) x.best = Math.min(x.best, n0(a.prix));
    x.last = { nom: m.nom, prix: n0(a.prix), delai: DELAIS[n0(a.delai)], st: STATUTS.find((z) => z[1] === st)?.[0] || st, produit: a.produit };
    map.set(f, x);
  }));
  const list = [...map.values()];
  return `<div class="card"><h2>Historique des fournisseurs</h2>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Fournisseur</th><th class="r">Offres</th><th class="r">Lots validés</th><th class="r">Prix moyen validé</th><th class="r">Meilleur prix vu</th><th>Dernière offre</th></tr></thead><tbody>
      ${list.map((x) => `<tr><td>${esc(x.f)}</td><td class="r">${x.offres}${x.refus ? ` <span class="muted small">(${x.refus} refusée${x.refus > 1 ? "s" : ""})</span>` : ""}</td><td class="r">${fmtN(x.valLots)}</td><td class="r">${x.valLots ? fmtP(x.valMontant / x.valLots) : "—"}</td><td class="r">${Number.isFinite(x.best) ? fmtP(x.best) : "—"}</td><td class="small">${esc(x.last.nom)} · ${esc(x.last.produit)} ${fmtP(x.last.prix)} · ${esc(x.last.delai)} · ${esc(x.last.st)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted small">Construit à partir des achats saisis (étape B), y compris les offres refusées ou en négociation. Le « meilleur prix vu » est un bon argument face aux autres fournisseurs.</p>`
    : `<p class="muted">Aucun achat saisi pour l'instant (étape B de la saisie du mois).</p>`}</div>`;
}

// Rapport imprimable (PDF via l'impression du navigateur)
function printReport() {
  const c = compute(state);
  const cur = c.rows[state.currentMonth];
  const clone = (el) => (el ? el.cloneNode(true) : null);
  const dash = document.getElementById("tab-dashboard");
  const rev = clone(document.getElementById("tab-revient"));
  rev?.querySelectorAll(".form-grid").forEach((x) => x.remove());
  const stockCards = document.querySelectorAll("#tab-stock > .card");
  const notes = state.months.filter((m) => m.planif || m.nego).map((m) => `<h3>${esc(m.nom)}</h3>${m.planif ? `<p><b>Planification :</b> ${esc(m.planif).replace(/\n/g, "<br>")}</p>` : ""}${m.nego ? `<p><b>Négociation :</b> ${esc(m.nego).replace(/\n/g, "<br>")}</p>` : ""}`).join("");
  const rep = document.getElementById("report");
  rep.innerHTML = `
    <h1>Rapport de contrôle de gestion · ${esc(state.team || "Notre entreprise")}</h1>
    <p class="muted">Distributeur de bouchons de liège · situation à fin ${esc(cur.nom)} · édité le ${new Date().toLocaleDateString("fr-FR")}</p>
    <h2>1. Synthèse</h2>
    ${clone(dash.querySelector(".grid.k4"))?.outerHTML || ""}
    ${clone(document.getElementById("tresoChart")?.closest(".card"))?.outerHTML || ""}
    <h2>2. Récapitulatif mensuel</h2>
    ${clone(dash.querySelector(":scope > .card:last-child"))?.outerHTML || ""}
    <h2>3. Coût de revient (méthode des coûts complets)</h2>
    ${rev ? rev.innerHTML : ""}
    <h2>4. Stock et RSE</h2>
    ${[...stockCards].map((x) => x.outerHTML).join("")}
    <h2>5. Diagnostic</h2>
    <div class="card"><ul>${adviceRules(c).map((a) => `<li>${a.t}</li>`).join("")}</ul></div>
    ${notes ? `<h2>6. Décisions et notes</h2><div class="card">${notes}</div>` : ""}`;
  const html = document.documentElement, prevTheme = html.dataset.theme;
  html.dataset.theme = "light";
  const done = () => { if (prevTheme) html.dataset.theme = prevTheme; else delete html.dataset.theme; rep.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}

// ---------- dossier IA du mois (PDF) + prompt ----------
function promptIA() {
  const i = state.currentMonth, cur = state.months[i], nx = state.months[i + 1];
  const nomNx = nx ? nx.nom : "le mois suivant";
  return `Tu es le conseiller stratégique de notre équipe dans le jeu d'entreprise Vinego (simulateur de négociation commerciale). Nous sommes un DISTRIBUTEUR de bouchons de liège. Le PDF joint (« Dossier IA · ${cur.nom} ») contient toutes nos données : règles du jeu, situation à fin ${cur.nom}, décisions prises ce mois-ci, prévisions pour ${nomNx}, besoins clients annoncés, stock, trésorerie et coûts.

Ce qui a changé depuis le début du jeu (à bien prendre en compte) :
- Au départ nous ne vendions que des bouchons AGGLOMÉRÉS (achetés aux industriels, revendus aux Vignerons, Caves et Négociants / Grands comptes).
- Depuis Mars : notre fournisseur historique allemand STECKER est en liquidation judiciaire, il ne fait plus d'offres. Il faut négocier avec les fournisseurs français et les autres distributeurs.
- Nous avons racheté ses trieuses (30 000 € comptant, amorties sur 5 ans) et son stock de bouchons naturels (285 000 € payés en Mars). Nouvelle activité : acheter des bouchons naturels tubés (Espagne A, B, C), les TRIER (2 € par lot ; chaque matière donne des qualités Q1 à Q4 selon des pourcentages fixes), puis les vendre aux clients ou à d'autres distributeurs.
- Les salaires sont passés de 40 000 € à 150 000 € par mois à partir de Mars : nos charges fixes sont beaucoup plus lourdes.
- En planification, chaque segment a maintenant des prix pour Q1, Q2, Q3, Q4 et Agglomérés, un délai de paiement, et un « niveau de publicité » ciblé (Aucune, Flyers 10 000 €, E-mailing 20 000 €, Visite de l'usine 50 000 €). Il y a deux budgets pub : bouchons naturels et agglomérés.
- Les besoins clients et les fourchettes de prix par produit sont annoncés dans le PDF. Nous ne sommes pas obligés de servir tous les clients.

Règles importantes : un achat chez un industriel arrive le mois suivant (M+1) mais il est facturé à la commande ; un achat à un distributeur est instantané ; un prix hors fourchette est ramené au minimum ou au maximum ; la demande non servie part chez les concurrents ; stockage = 0,33 % de la valeur du stock de fin de mois ; la trésorerie ne doit JAMAIS être négative.

Ce que nous te demandons :
1. PLANIFICATION de ${nomNx} : pour chaque segment (Vignerons, Caves, Négociants / Grands comptes), le prix de chaque produit (Agglomérés, Q1, Q2, Q3, Q4) dans la fourchette, le délai de paiement, le niveau de publicité, et les deux budgets de publicité. Dis quels segments / produits viser ou abandonner et pourquoi (marge, volume, trésorerie).
2. NÉGOCIATIONS : quoi acheter (produit, quantité, prix maximum à accepter, prix d'ouverture, délai de paiement à demander, transport), combien de matière trier et laquelle (Espagne A, B ou C), et les arguments à utiliser face aux fournisseurs.
3. TRÉSORERIE : vérifie qu'elle reste positive avec ces décisions ; sinon, propose quoi ajuster.
4. Les 3 plus gros risques et ce qu'il faut surveiller.

Réponds en français, de façon chiffrée et concrète. Commence par un tableau récapitulatif prêt à saisir dans Vinego (planification puis achats), puis explique en quelques puces. Si une information te manque, dis précisément laquelle.`;
}
async function copyPromptIA() {
  const ok = await copyText(promptIA());
  toast(ok ? "Prompt copié : collez-le dans l'IA avec le PDF en pièce jointe" : "Copie impossible dans ce navigateur");
}
function printDossierIA() {
  const c = compute(state);
  const i = state.currentMonth, m = state.months[i], r = c.rows[i];
  const nx = c.rows[i + 1], mNx = state.months[i + 1];
  const P = ["Agglomérés", ...QS];
  const tbl = (head, rows) => `<table><thead><tr>${head.map((h, k) => `<th${k ? ' class="r"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((rw) => `<tr>${rw.map((x, k) => `<td${k ? ' class="r"' : ""}>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const prixSeg = (mm, sg, pr) => (pr === "Agglomérés" ? n0(mm.marketing[sg]?.prix) : n0(mm.marketing[sg]?.["prix" + pr]));
  const fr = (sg, pr) => { const rg = range(sg, pr); return rg ? `${rg[0]}–${rg[1]} €` : "—"; };
  const stockProds = TOUS.filter((x) => r.finP[x] || r.dispoP[x] || (nx && nx.dispoP[x]));
  const achats = m.achats.map((a) => [esc(STATUTS.find((z) => z[1] === (a.statut || "validee"))?.[0] || ""), esc(a.fournisseur || "—"), esc(a.produit), fmtN(n0(a.lots)), fmtP(n0(a.prix)), esc(LIVRAISONS.find((l) => l[1] === n0(a.livraison))?.[0] || ""), DELAIS[n0(a.delai)], esc(a.transport || "—"), fmtE(n0(a.lots) * n0(a.prix))]);
  const ventesA = SEGMENTS.map((sg) => [SEG_LABEL[sg], "Agglomérés", fmtP(clampPrix(sg, "Agglomérés", m.marketing[sg].prix)), fmtN(besoin(sg, "Agglomérés", i)), fmtN(n0(m.livraisons[sg].demande)), fmtN(n0(m.livraisons[sg].livre))]);
  const ventesQ = SEGMENTS.flatMap((sg) => QS.map((q) => ({ sg, q, lv: m.livraisonsQ?.[sg]?.[q] }))).filter((x) => x.lv && (n0(x.lv.demande) || n0(x.lv.livre))).map((x) => [SEG_LABEL[x.sg], x.q, fmtP(clampPrix(x.sg, x.q, m.marketing[x.sg]?.["prix" + x.q])), fmtN(besoin(x.sg, x.q, i)), fmtN(n0(x.lv.demande)), fmtN(n0(x.lv.livre))]);
  const rev = revientMois(c, i, "ca");
  const cuG = rev.global.lots ? rev.global.cout / rev.global.lots : NaN;
  const futur = c.rows.slice(i, Math.min(c.rows.length, i + 4));
  const besoinsCard = besoinsHtml(c, i);
  const nego = (() => { const sv = { ...ui.simu, type: "achat", mois: i, produit: "Agglomérés", lots: Math.max(1000, Math.round(demandeAttendue(i))), prix: n0(state.params.prixMarche), delai: 0, livraison: 1 }; try { return negoHtml(c, sv, i); } catch { return ""; } })();
  const rep = document.getElementById("report");
  rep.innerHTML = `
    <h1>Dossier IA · ${esc(m.nom)} → préparer ${esc(nx?.nom || "la suite")}</h1>
    <p class="muted">${esc(state.team || "Notre entreprise")} · distributeur de bouchons de liège (jeu Vinego) · édité le ${new Date().toLocaleDateString("fr-FR")} · version du site ${APP_VERSION}</p>

    <h2>0. Prompt à donner à l'IA</h2>
    <div class="card"><p class="small" style="white-space:pre-wrap">${esc(promptIA())}</p></div>

    <h2>1. Situation à fin ${esc(m.nom)}</h2>
    <div class="card">${tbl(["Indicateur", "Valeur"], [
      ["Trésorerie début / fin du mois", `${fmtE(r.tresoDebut)} / <b>${fmtE(r.tresoFin)}</b>`],
      ["Trésorerie minimale prévue (avec les saisies actuelles)", `${fmtE(c.minTreso)} en ${esc(c.rows[c.minTresoMonth]?.nom || "—")}`],
      ["Chiffre d'affaires / résultat du mois", `${fmtE(r.ca)} / ${fmtE(r.resultat)}`],
      ["Résultat cumulé", fmtE(r.cumRes)],
      ["Charges du mois", `salaires ${fmtE(r.salaires)} · structure ${fmtE(r.structure)} · stockage ${fmtE(r.stockage)} · pub ${fmtE(r.pub)} · fabrication ${fmtE(r.fabrication)} · amortissements ${fmtE(r.dotations)} · autres ${fmtE(r.divers - r.pub)}`],
      ["Coût de revient moyen par lot vendu", fmtP(cuG)],
      ["Encaissements clients à venir / paiements fournisseurs à venir", `${fmtE(c.aEncaisser)} / ${fmtE(c.aPayer)}`],
    ])}</div>

    <h2>2. Stock</h2>
    <div class="card">${tbl(["Produit", `Fin ${esc(m.nom)} (lots)`, "Coût moyen", "Valeur", nx ? `Disponible début ${esc(nx.nom)}` : "—"], stockProds.map((x) => [x, fmtN(r.finP[x]), r.finP[x] ? fmtP(r.cmupP[x]) : "—", fmtE(Math.max(0, r.finP[x]) * r.cmupP[x]), nx ? fmtN(nx.dispoP[x]) : "—"]))}</div>

    <h2>3. Décisions de ${esc(m.nom)}</h2>
    <div class="card">
      <h3>Planification</h3>
      ${tbl(["Segment", ...P.map((pr) => `Prix ${pr === "Agglomérés" ? "Agglo" : pr}`), "Délai", "Niveau de pub"], SEGMENTS.map((sg) => [SEG_LABEL[sg], ...P.map((pr) => prixSeg(m, sg, pr) ? fmtP(clampPrix(sg, pr, prixSeg(m, sg, pr))) : "—"), DELAIS[n0(m.marketing[sg].delai)], CIBLAGES[n0(m.marketing[sg].ciblage)][0]]))}
      <p class="small">Publicité agglomérés ${fmtE(n0(m.marketing.pub))} · publicité bouchons naturels ${fmtE(n0(m.marketing.pubNat))} · niveaux de pub ciblés ${fmtE(r.ciblage)}</p>
      <h3>Ventes (étape A)</h3>
      ${tbl(["Segment", "Produit", "Prix effectif", "Besoin annoncé", "Demande reçue", "Livré"], [...ventesA, ...ventesQ])}
      ${m.ventes.length ? `<h3>Autres ventes</h3>${tbl(["Segment", "Produit", "Lots", "Prix", "Encaissement"], m.ventes.map((v) => [esc(SEG_LABEL[v.segment] || v.segment), esc(v.produit), fmtN(n0(v.lots)), fmtP(n0(v.prix)), DELAIS[n0(v.delai)]]))}` : ""}
      <h3>Achats / négociations (étape B)</h3>
      ${achats.length ? tbl(["Statut", "Fournisseur", "Produit", "Lots", "Prix", "Livraison", "Paiement", "Transport", "Total"], achats) : "<p class='small'>Aucun achat saisi.</p>"}
      ${(m.production || []).length ? `<h3>Production (tri)</h3>${tbl(["Matière", "Lots triés"], m.production.map((x) => [esc(x.matiere), fmtN(n0(x.lots))]))}<p class="small">Produit : ${QS.map((q) => `${q} ${fmtN(r.prodOut[q])}`).join(" · ")}</p>` : ""}
      ${m.depenses.length ? `<h3>Autres dépenses / recettes</h3>${tbl(["Libellé", "Montant"], m.depenses.map((d) => [esc(d.libelle || "—"), fmtE(n0(d.montant))]))}` : ""}
      ${m.planif || m.nego ? `<h3>Notes de l'équipe</h3>${m.planif ? `<p class="small"><b>Planification :</b> ${esc(m.planif).replace(/\n/g, "<br>")}</p>` : ""}${m.nego ? `<p class="small"><b>Négociation :</b> ${esc(m.nego).replace(/\n/g, "<br>")}</p>` : ""}` : ""}
    </div>

    <h2>4. Préparer ${esc(nx?.nom || "le mois suivant")}</h2>
    ${mNx ? `<div class="card"><h3>Besoins clients annoncés et fourchettes de prix</h3>
      ${tbl(["Segment", ...P.map((pr) => (pr === "Agglomérés" ? "Agglo" : pr))], SEGMENTS.map((sg) => [SEG_LABEL[sg], ...P.map((pr) => `${fmtN(besoin(sg, pr, i + 1))} lots<br><span class="muted small">${fr(sg, pr)}</span>`)]))}</div>` : ""}
    ${besoinsCard}
    ${nego}
    <div class="card"><h3>Trésorerie prévue (avec les saisies actuelles)</h3>
      ${tbl(["Mois", "Encaissements", "Décaissements", "Trésorerie fin"], futur.map((x) => [esc(x.nom), fmtE(x.encaissements), fmtE(x.decaissements), fmtE(x.tresoFin)]))}
      <p class="small muted">Les mois futurs n'ont pas encore de ventes saisies : leur trésorerie est pessimiste (charges sans recettes).</p></div>

    <h2>5. Paramètres utiles</h2>
    <div class="card">
      ${tbl(["Matière", "Q1", "Q2", "Q3", "Q4", "Prix d'achat moyen"], MATIERES.filter((x) => state.production.prixMarche[x] || r.finP[x]).map((x) => [x, ...(state.production.rendements[x] || []).map((v) => v + " %"), state.production.prixMarche[x] ? fmtP(state.production.prixMarche[x]) : "—"]))}
      <p class="small">Frais de tri ${fmtP(n0(state.production.frais))} par lot en entrée${n0(state.production.capacite) ? ` · capacité de tri ${fmtN(state.production.capacite)} lots/mois` : ""} · prix marché agglomérés ${fmtP(n0(state.params.prixMarche))} · stockage ${r.stockageRate} %</p>
    </div>

    <h2>6. Diagnostic automatique du site</h2>
    <div class="card"><ul>${adviceRules(c).map((a) => `<li>${a.t}</li>`).join("")}</ul></div>

    <h2>7. Règles et informations du jeu</h2>
    <div class="card"><p class="small" style="white-space:pre-wrap">${esc(state.rules)}</p></div>`;
  rep.querySelectorAll("button, input, select").forEach((x) => x.remove());
  const html = document.documentElement, prevTheme = html.dataset.theme;
  html.dataset.theme = "light";
  const prevTitle = document.title;
  document.title = `Dossier IA - ${m.nom}`; // nom proposé pour le fichier PDF
  const done = () => { if (prevTheme) html.dataset.theme = prevTheme; else delete html.dataset.theme; document.title = prevTitle; rep.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}

// ---------- coût de revient (méthode des coûts complets) ----------
// Coûts de production = lots vendus × CMUP ; transport d'une vente = charge directe de la ligne ;
// charges indirectes (salaires, structure, stockage, pub, transport achats, autres) réparties par clé (CA ou lots).
function revientMois(c, i, cle = "ca") {
  const r = c.rows[i], m = state.months[i];
  const lignes = ventesDuMois(m).map((v) => {
    const lots = n0(v.lots), prod = normProduit(v.produit);
    return { produit: prod, segment: SEGMENTS.includes(v.segment) ? v.segment : "Autre", lots, ca: lots * n0(v.prix), prod: lots * (r.cmupP[prod] || 0), direct: n0(v.coutTransport) };
  }).filter((l) => l.lots > 0);
  const ind = {
    "Salaires": r.salaires, "Frais de structure": r.structure, "Frais de stockage": r.stockage, "Dotations aux amortissements": r.dotations,
    "Publicité / marketing": r.pub, "Transport des achats": r.transport - r.transportVentes, "Autres dépenses": r.divers - r.pub,
  };
  const totInd = Object.values(ind).reduce((a, b) => a + b, 0);
  const totCA = lignes.reduce((t, l) => t + l.ca, 0), totLots = lignes.reduce((t, l) => t + l.lots, 0);
  const useCA = cle === "ca" && totCA > 0;
  lignes.forEach((l) => { l.part = useCA ? l.ca / totCA : (totLots ? l.lots / totLots : 0); l.indirect = totInd * l.part; });
  const agg = (keyFn) => {
    const map = new Map();
    lignes.forEach((l) => {
      const k = keyFn(l); const a = map.get(k) || { key: k, lots: 0, ca: 0, prod: 0, direct: 0, indirect: 0, part: 0 };
      a.lots += l.lots; a.ca += l.ca; a.prod += l.prod; a.direct += l.direct; a.indirect += l.indirect; a.part += l.part; map.set(k, a);
    });
    return [...map.values()].map((a) => ({ ...a, cout: a.prod + a.direct + a.indirect, horsProd: a.direct + a.indirect }));
  };
  const global = agg(() => "Total")[0] || { key: "Total", lots: 0, ca: 0, prod: 0, direct: 0, indirect: 0, part: 0, cout: totInd, horsProd: totInd };
  if (!lignes.length) global.indirect = totInd;
  return {
    r, ind, totInd, useCA, global, nbLignes: lignes.length,
    parProduit: agg((l) => l.produit),
    parSegment: agg((l) => l.segment),
    parCroise: agg((l) => `${l.produit}|${l.segment}`),
  };
}

function renderRevient(c) {
  const el = document.getElementById("tab-revient");
  if (!el) return;
  const nM = state.months.length;
  let i = ui.rev.mois;
  if (i === null || i >= nM) {
    // par défaut : le dernier mois ≤ mois en cours qui a des ventes (le support parle du cycle précédent)
    i = state.currentMonth;
    for (let k = state.currentMonth; k >= 0; k--) if (c.rows[k].venLots > 0) { i = k; break; }
  }
  const cle = ui.rev.cle, tm = Math.min(95, Math.max(0, n0(ui.rev.marge)));
  const R = revientMois(c, i, cle);
  const g = R.global;
  const u = (v, l) => (l > 0 ? v / l : NaN);
  const pct = (v) => (Number.isFinite(v) ? (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %" : "—");
  const prixCible = (cu) => (Number.isFinite(cu) ? cu / (1 - tm / 100) : NaN);
  const segName = (s) => SEG_LABEL[s] || s;
  const rowHtml = (a, label, seg, prod) => {
    const cu = u(a.cout, a.lots), pm = u(a.ca, a.lots), res = a.ca - a.cout, pc = prixCible(cu);
    let badge = "";
    if (seg && prod && Number.isFinite(pc)) {
      const rg = range(seg, prod);
      if (rg) badge = pc > rg[1] ? ` <span class="badge crit" title="Fourchette ${rg[0]}–${rg[1]} €">> max ${rg[1]} €</span>` : pc < rg[0] ? ` <span class="badge good" title="Fourchette ${rg[0]}–${rg[1]} €">mini ${rg[0]} €</span>` : "";
    }
    return `<tr><td>${label}</td><td class="r">${fmtN(a.lots)}</td><td class="r">${fmtE(a.ca)}</td><td class="r">${pct(a.part)}</td><td class="r">${fmtE(a.prod)}</td><td class="r">${fmtE(a.horsProd)}</td><td class="r"><b>${fmtE(a.cout)}</b></td>
      <td class="r"><b>${fmtP(cu)}</b></td><td class="r">${fmtP(pm)}</td><td class="r ${cls(pm - cu)}">${fmtP(pm - cu)}</td><td class="r ${cls(res)}">${fmtE(res)}</td><td class="r ${cls(res)}">${a.ca ? pct(res / a.ca) : "—"}</td><td class="r">${fmtP(pc)}${badge}</td></tr>`;
  };
  const head = (first) => `<thead><tr><th>${first}</th><th class="r">Lots vendus</th><th class="r">CA</th><th class="r">Part clé</th><th class="r">Coût production</th><th class="r">Hors production</th><th class="r">Coût de revient</th><th class="r">Coût / lot</th><th class="r">Prix moyen</th><th class="r">Marge / lot</th><th class="r">Résultat</th><th class="r">Marge %</th><th class="r">Prix pour ${tm} %</th></tr></thead>`;
  const table = (first, list, labelFn, segFn, prodFn) => list.length
    ? `<div class="table-wrap"><table>${head(first)}<tbody>${list.map((a) => rowHtml(a, labelFn(a), segFn?.(a), prodFn?.(a))).join("")}${list.length > 1 ? rowHtml(g, "<b>Total</b>") : ""}</tbody></table></div>`
    : `<p class="muted">Aucune vente saisie pour ${esc(R.r.nom)}.</p>`;
  const cuG = u(g.cout, g.lots), pmG = u(g.ca, g.lots), resG = g.ca - g.cout;
  const evo = c.rows.map((row) => { const x = revientMois(c, row.i, cle).global; return { row, x, cu: u(x.cout, x.lots), pm: u(x.ca, x.lots) }; });

  el.innerHTML = `
    <div class="card">
      <h2>Coût de revient</h2>
      <p class="muted small">Méthode des coûts complets du support de contrôle de gestion : <b>coût de revient = (coûts de production + coûts hors production) ÷ quantité vendue</b>. Les charges indirectes sont réparties entre produits et marchés avec une clé de répartition.</p>
      <div class="form-grid">
        <label class="field">Mois analysé <select data-rev="mois">${state.months.map((mm, k) => `<option value="${k}" ${k === i ? "selected" : ""}>${esc(mm.nom)}${c.rows[k].venLots ? "" : " (pas de ventes)"}</option>`).join("")}</select></label>
        <label class="field">Clé de répartition des charges indirectes <select data-rev="cle"><option value="ca" ${cle === "ca" ? "selected" : ""}>Chiffre d'affaires (comme le support)</option><option value="lots" ${cle === "lots" ? "selected" : ""}>Nombre de lots vendus</option></select></label>
        <label class="field">Marge visée (% du prix de vente) <input type="number" min="0" max="95" step="1" data-rev="marge" value="${tm}"></label>
      </div>
    </div>

    <div class="grid k4">
      <div class="card kpi"><div class="label">Coût de revient ${esc(R.r.nom)}</div><div class="value">${fmtE(g.cout)}</div><div class="hint">production ${fmtE(g.prod)} + hors production ${fmtE(g.horsProd)}</div></div>
      <div class="card kpi"><div class="label">Coût de revient par lot</div><div class="value">${fmtP(cuG)}</div><div class="hint">${fmtN(g.lots)} lots vendus</div></div>
      <div class="card kpi"><div class="label">Prix moyen de vente</div><div class="value">${fmtP(pmG)}</div><div class="hint">marge ${fmtP(pmG - cuG)} / lot</div></div>
      <div class="card kpi"><div class="label">Prix pour ${tm} % de marge</div><div class="value">${fmtP(prixCible(cuG))}</div><div class="hint">= coût / lot ÷ (1 − ${tm} %)</div></div>
    </div>

    <div class="grid c2 section-gap">
      <div class="card">
        <h2>1 · Coûts de production (sorties de stock)</h2>
        <table><thead><tr><th>Produit</th><th class="r">Lots vendus</th><th class="r">CMUP</th><th class="r">Sortie de stock</th></tr></thead><tbody>
          ${R.parProduit.map((a) => `<tr><td>${esc(a.key)}</td><td class="r">${fmtN(a.lots)}</td><td class="r">${fmtP(R.r.cmupP[a.key])}</td><td class="r">${fmtE(a.prod)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Aucune vente</td></tr>`}
          <tr><td><b>Total</b></td><td class="r"><b>${fmtN(g.lots)}</b></td><td></td><td class="r"><b>${fmtE(g.prod)}</b></td></tr>
        </tbody></table>
        <p class="muted small">Sortie de stock = lots vendus × coût unitaire moyen pondéré (CMUP) du mois.</p>
      </div>
      <div class="card">
        <h2>2 · Coûts hors production</h2>
        <table><thead><tr><th>Charge</th><th>Type</th><th class="r">Montant</th></tr></thead><tbody>
          ${Object.entries(R.ind).map(([k, v]) => `<tr><td>${k}</td><td><span class="badge warn">indirecte</span></td><td class="r">${fmtE(v)}</td></tr>`).join("")}
          <tr><td>Transport des ventes</td><td><span class="badge good">directe</span></td><td class="r">${fmtE(g.direct)}</td></tr>
          <tr><td><b>Total</b></td><td></td><td class="r"><b>${fmtE(R.totInd + g.direct)}</b></td></tr>
        </tbody></table>
        <p class="muted small">Indirectes : réparties au prorata ${R.useCA ? "du chiffre d'affaires" : "des lots vendus"} de chaque produit / marché. Directes : affectées à la vente concernée.</p>
      </div>
    </div>

    <div class="card"><h2>Par produit</h2>${table("Produit", R.parProduit, (a) => esc(a.key))}</div>
    <div class="card"><h2>Par marché (segment)</h2>${table("Marché", R.parSegment, (a) => esc(segName(a.key)))}</div>
    <div class="card"><h2>Par produit et par marché</h2>${table("Produit · marché", R.parCroise, (a) => { const [p, s2] = a.key.split("|"); return `${esc(p)} · ${esc(segName(s2))}`; }, (a) => a.key.split("|")[1], (a) => a.key.split("|")[0])}
      <p class="muted small">« Prix pour ${tm} % » : prix de vente par lot qui donne ${tm} % de marge sur le coût de revient complet. Badge rouge : ce prix dépasse le maximum de la fourchette client (impossible à facturer) ; vert : le minimum de la fourchette suffit déjà.</p>
    </div>

    <div class="card">
      <h2>Évolution par mois</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th class="r">Lots vendus</th><th class="r">CA</th><th class="r">Coût production</th><th class="r">Hors production</th><th class="r">Coût de revient</th><th class="r">Coût / lot</th><th class="r">Prix moyen</th><th class="r">Marge / lot</th><th class="r">Résultat</th></tr></thead>
        <tbody>${evo.map(({ row, x, cu, pm }) => `<tr class="${row.i === i ? "current" : ""}"><td>${esc(row.nom)}</td><td class="r">${fmtN(x.lots)}</td><td class="r">${fmtE(x.ca)}</td><td class="r">${fmtE(x.prod)}</td><td class="r">${fmtE(x.horsProd)}</td><td class="r"><b>${fmtE(x.cout)}</b></td><td class="r">${fmtP(cu)}</td><td class="r">${fmtP(pm)}</td><td class="r ${cls(pm - cu)}">${fmtP(pm - cu)}</td><td class="r ${cls(x.ca - x.cout)}">${fmtE(x.ca - x.cout)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="muted small">Le résultat ici est identique au « résultat du mois » du tableau de bord : CA − coût de revient complet.</p>
    </div>`;
}

// ---------- synchronisation en ligne (Supabase) ----------
let cloud = (() => { try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || "null"); } catch { return null; } })();
let cloudVer = (() => { try { const v = localStorage.getItem(CLOUD_VER_KEY); return v === null ? null : +v; } catch { return null; } })();
let cloudLastSent = null, cloudTimer = null, cloudBusy = false, cloudReady = false, cloudWaiting = false;
const cloudOn = () => !!(cloud && cloud.url && cloud.key && cloud.code);
const cloudData = () => ({ ...state, chat: [] });
const cloudJson = () => JSON.stringify(cloudData());
function normUrl(u) {
  u = String(u || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  if (u && !/^https?:\/\//.test(u)) u = "https://" + u;
  return u;
}
function setCloudVer(v) { cloudVer = v; try { localStorage.setItem(CLOUD_VER_KEY, String(v)); } catch {} }
function cloudStatus(text, kind = "") {
  const el = document.getElementById("cloudStatus");
  if (!el) return;
  el.hidden = !cloudOn() && !text;
  el.textContent = text;
  el.className = "version cloud " + kind;
}
async function rpc(fn, body, cfg = cloud) {
  const headers = { apikey: cfg.key, "Content-Type": "application/json" };
  if (cfg.key.startsWith("eyJ")) headers.Authorization = "Bearer " + cfg.key; // ancienne clé « anon » (JWT)
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) {
    let msg = txt; try { const j = JSON.parse(txt); msg = j.message || j.msg || j.error || txt; } catch {}
    throw new Error(`${res.status} ${msg}`);
  }
  return txt ? JSON.parse(txt) : null;
}
const hhmm = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const isEditing = () => { const a = document.activeElement; return !!a && a.closest?.("main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };

// Remplace les données locales par celles du groupe (le chat IA reste local)
function applyRemote(data, version) {
  const chat = state.chat;
  state = migrate(data);
  state.chat = chat || [];
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  cloudLastSent = cloudJson();
  setCloudVer(version);
  ui.editMonth = Math.min(ui.editMonth, state.months.length - 1);
  ui.simu.mois = Math.min(ui.simu.mois, state.months.length - 1);
  render();
}

function cloudSchedule() {
  if (!cloudOn() || !cloudReady) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPush, 1200);
}
async function cloudPush() {
  cloudTimer = null;
  if (!cloudOn() || !cloudReady) return;
  if (cloudBusy) { cloudSchedule(); return; }
  const json = cloudJson();
  if (json === cloudLastSent) return;
  cloudBusy = true; cloudStatus("Enregistrement…", "busy");
  try {
    const r = await rpc("put_state", { p_code: cloud.code, p_data: JSON.parse(json), p_version: cloudVer, p_by: cloud.name || null });
    if (r.ok) {
      cloudLastSent = json; setCloudVer(r.version);
      cloudStatus(`En ligne ✓ ${hhmm()}`, "ok");
    } else {
      // Quelqu'un a enregistré entre-temps : on garde ses données, les nôtres vont dans Sauvegardes
      snapshot("Automatique · vos modifs non envoyées (conflit avec le groupe)", JSON.stringify(state));
      applyRemote(r.data, r.version);
      cloudStatus(`En ligne ✓ ${hhmm()}`, "ok");
      toast(`${r.updated_by || "Un membre"} a modifié en même temps : données du groupe chargées. Vos dernières modifs sont dans Sauvegardes.`);
    }
  } catch (e) {
    console.warn(e); cloudStatus("Hors ligne · non envoyé", "err");
    setTimeout(cloudSchedule, 15000);
  } finally { cloudBusy = false; }
}
async function cloudPoll() {
  if (!cloudOn() || !cloudReady || cloudBusy || cloudTimer || document.hidden) return;
  try {
    const v = await rpc("get_version", { p_code: cloud.code });
    if (!v || v.version === cloudVer) { if (!cloudWaiting) cloudStatus(`En ligne ✓`, "ok"); return; }
    if (isEditing()) { cloudWaiting = true; cloudStatus("Mise à jour du groupe en attente…", "busy"); return; }
    cloudWaiting = false;
    const st = await rpc("get_state", { p_code: cloud.code });
    if (!st || cloudTimer || cloudBusy) return;
    applyRemote(st.data, st.version);
    cloudStatus(`En ligne ✓ ${hhmm()}`, "ok");
    toast(`Données mises à jour par ${st.updated_by || "un membre du groupe"}`);
  } catch (e) { cloudStatus("Hors ligne", "err"); }
}
// Au démarrage ou à la connexion : aligne les données locales sur celles du groupe
async function cloudStart(askBeforeReplace) {
  if (!cloudOn()) { cloudStatus(""); return; }
  cloudReady = false; cloudStatus("Connexion…", "busy");
  try {
    const st = await rpc("get_state", { p_code: cloud.code });
    const local = cloudJson();
    if (!st) {
      cloudVer = null; cloudReady = true; cloudLastSent = null;
      await cloudPush();
      toast("Vos valeurs actuelles sont maintenant en ligne pour le groupe");
      return true;
    }
    const remote = JSON.stringify({ ...migrate(st.data), chat: [] });
    if (remote === local) { cloudLastSent = local; setCloudVer(st.version); }
    else if (st.version === cloudVer) { cloudLastSent = remote; } // modifs faites hors ligne : elles seront envoyées
    else {
      if (askBeforeReplace && !confirm(`Des données existent déjà en ligne pour ce code (dernière modif${st.updated_by ? " par " + st.updated_by : ""} le ${fmtDate(st.updated_at)}).\nLes charger à la place de vos valeurs actuelles ? (vos valeurs actuelles sont d'abord sauvegardées)`)) {
        cloudStatus("Non connecté", "err"); return false;
      }
      snapshot("Automatique · avant chargement des données du groupe", JSON.stringify(state));
      applyRemote(st.data, st.version);
      if (!askBeforeReplace) toast("Données du groupe chargées");
    }
    cloudReady = true;
    cloudStatus(`En ligne ✓ ${hhmm()}`, "ok");
    cloudSchedule();
    return true;
  } catch (e) {
    console.warn(e);
    cloudStatus("Hors ligne", "err");
    if (askBeforeReplace) alert("Connexion impossible : " + e.message + "\n\nVérifiez l'URL, la clé, et que le script supabase.sql a bien été exécuté.");
    else setTimeout(() => cloudStart(false), 20000);
    return false;
  }
}
function newCode() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789", b = new Uint32Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => a[x % a.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
}
function inviteLink() {
  return location.origin + location.pathname + "#cloud=" + btoa(unescape(encodeURIComponent(JSON.stringify({ url: cloud.url, key: cloud.key, code: cloud.code }))));
}
function cloudCardHtml() {
  const f = ui.cloudForm;
  if (cloudOn()) return `
    <div class="card" id="cloudCard">
      <h2>Synchronisation en ligne (Supabase) <span class="badge good">activée</span></h2>
      <p class="small">Toutes les modifications sont enregistrées en ligne automatiquement et apparaissent chez les autres membres en une dizaine de secondes. Code d'équipe : <code>${esc(cloud.code)}</code>${cloud.name ? ` · vous êtes <b>${esc(cloud.name)}</b>` : ""}.</p>
      <div class="row">
        <button class="btn" id="cloudInvite">Copier le lien d'invitation</button>
        <button class="btn ghost" id="cloudHist">Historique en ligne</button>
        <button class="btn ghost" id="cloudSyncNow">Synchroniser maintenant</button>
        <button class="btn danger" id="cloudOff" style="padding:7px 14px">Déconnecter cet appareil</button>
      </div>
      <label class="field section-gap" style="max-width:280px">Votre prénom (affiché aux autres)<input type="text" data-cloudname value="${esc(cloud.name || "")}"></label>
      <p class="muted small">Le lien d'invitation donne accès aux données de l'équipe : ne l'envoyez qu'au groupe. ${ui.cloudHist ? "" : "L'historique en ligne garde une copie au plus toutes les 10 minutes (300 copies)."}</p>
      ${ui.cloudHist ? (ui.cloudHist.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Par</th><th class="r">Version</th><th></th></tr></thead><tbody>
        ${ui.cloudHist.map((h) => `<tr><td>${fmtDate(h.saved_at)}</td><td>${esc(h.saved_by || "—")}</td><td class="r">${h.version}</td><td class="r"><button class="btn ghost" data-cloudrestore="${h.id}">Restaurer</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Historique vide pour l'instant.</p>`) : ""}
    </div>`;
  return `
    <div class="card" id="cloudCard">
      <h2>Synchronisation en ligne (Supabase)</h2>
      <p class="small">Pour que tout le groupe travaille sur les mêmes données en direct. Si un membre vous a envoyé un <b>lien d'invitation</b>, ouvrez-le simplement : rien à remplir ici. Sinon (première configuration), suivez la section « Synchronisation en ligne » du Guide.</p>
      <div class="form-grid">
        <label class="field">URL du projet Supabase<input type="text" data-cloudf="url" placeholder="https://xxxx.supabase.co" value="${esc(f.url)}"></label>
        <label class="field">Clé publique (anon / publishable)<input type="text" data-cloudf="key" placeholder="eyJ… ou sb_publishable_…" value="${esc(f.key)}"></label>
        <label class="field">Code d'équipe (secret)<input type="text" data-cloudf="code" value="${esc(f.code)}"></label>
        <label class="field">Votre prénom<input type="text" data-cloudf="name" value="${esc(f.name)}"></label>
      </div>
      <div class="row section-gap">
        <button class="btn ghost" id="cloudGen">Générer un code d'équipe</button>
        <button class="btn" id="cloudConnect">Connecter</button>
      </div>
      <p class="muted small">Si aucune donnée n'existe encore pour ce code, vos valeurs actuelles sont envoyées en ligne. Si des données existent, le site vous demande avant de les charger (vos valeurs sont d'abord sauvegardées).</p>
    </div>`;
}
async function cloudClick(id, t) {
  switch (id) {
    case "cloudGen": ui.cloudForm.code = newCode(); renderParams(); return true;
    case "cloudConnect": {
      const f = ui.cloudForm;
      const cfg = { url: normUrl(f.url), key: String(f.key || "").trim(), code: String(f.code || "").trim(), name: String(f.name || "").trim() };
      if (!cfg.url || !cfg.key) { alert("Renseignez l'URL du projet et la clé publique."); return true; }
      if (cfg.code.length < 8) { alert("Le code d'équipe doit faire au moins 8 caractères (utilisez « Générer un code d'équipe »)."); return true; }
      cloud = cfg; try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); } catch {}
      cloudVer = null; try { localStorage.removeItem(CLOUD_VER_KEY); } catch {}
      const ok = await cloudStart(true);
      if (!ok) { cloud = null; try { localStorage.removeItem(CLOUD_KEY); } catch {} cloudStatus(""); }
      renderParams();
      return true;
    }
    case "cloudInvite": {
      const url = inviteLink();
      navigator.clipboard?.writeText(url).then(() => toast("Lien d'invitation copié : envoyez-le au groupe"), () => prompt("Copiez ce lien :", url));
      return true;
    }
    case "cloudSyncNow": await cloudPush(); await cloudPoll(); return true;
    case "cloudHist": {
      try { ui.cloudHist = await rpc("get_history", { p_code: cloud.code }); } catch (e) { toast("Historique indisponible : " + e.message); }
      renderParams(); return true;
    }
    case "cloudOff": {
      if (!confirm("Déconnecter cet appareil de la synchronisation ? Les données restent dans ce navigateur et en ligne.")) return true;
      cloud = null; cloudReady = false; ui.cloudHist = null;
      try { localStorage.removeItem(CLOUD_KEY); localStorage.removeItem(CLOUD_VER_KEY); } catch {}
      cloudStatus(""); renderParams(); return true;
    }
  }
  if (t.dataset.cloudrestore !== undefined) {
    try {
      const h = await rpc("get_history_item", { p_code: cloud.code, p_id: +t.dataset.cloudrestore });
      if (h && confirm(`Remettre les données du ${fmtDate(h.saved_at)} pour tout le groupe ?\n(Les valeurs actuelles restent dans l'historique et dans Sauvegardes.)`)) {
        snapshot("Automatique · avant restauration de l'historique en ligne", JSON.stringify(state));
        const chat = state.chat; state = migrate(h.data); state.chat = chat || [];
        ui.editMonth = state.currentMonth; save(); render(); toast("Version restaurée pour le groupe");
      }
    } catch (e) { toast("Restauration impossible : " + e.message); }
    return true;
  }
  return false;
}

// ---------- rendu ----------
function render() {
  const c = compute(state);
  renderMonthSelect();
  renderDashboard(c);
  renderMois(c);
  renderStock(c);
  renderSimu(c);
  renderRevient(c);
  renderIA(c);
  renderParams();
}

function renderMonthSelect() {
  const sel = document.getElementById("currentMonth");
  sel.innerHTML = state.months.map((m, i) => `<option value="${i}" ${i === state.currentMonth ? "selected" : ""}>${esc(m.nom)}</option>`).join("");
}

function alertsFor(c) {
  const out = [];
  const ac = alerteCommande(c, state.currentMonth);
  if (ac) out.push({ cls: "warn", t: alerteCommandeTexte(ac) });
  const p = state.params;
  c.rows.forEach((r) => {
    if (r.tresoFin < 0) out.push({ cls: "crit", t: `<b>${r.nom}</b> : trésorerie négative prévue (${fmtE(r.tresoFin)}).` });
    else if (r.tresoFin < n0(p.seuilTreso)) out.push({ cls: "warn", t: `<b>${r.nom}</b> : trésorerie sous le seuil de sécurité (${fmtE(r.tresoFin)} < ${fmtE(n0(p.seuilTreso))}).` });
    if (r.triDepasse) out.push({ cls: "warn", t: `<b>${r.nom}</b> : ${fmtN(r.prodLots)} lots à trier pour une capacité de tri de ${fmtN(r.capTri)} lots/mois.` });
    if (r.prodNeg) out.push({ cls: "crit", t: `<b>${r.nom}</b> : production supérieure au stock de matière disponible (seule la quantité en stock est triée).` });
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
    <div class="row between dash-top"><span class="muted small">Mois en cours : <b>${esc(cur.nom)}</b></span><div class="row"><button class="btn" id="dossierIA" title="PDF du mois en cours + prévisions du mois suivant, à donner à une IA">PDF du mois pour l'IA</button><button class="btn ghost" id="promptIA">Copier le prompt</button><button class="btn ghost" id="reportBtn" title="Ouvre l'impression : choisissez « Enregistrer en PDF »">Rapport imprimable (PDF)</button></div></div>
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
          <tr><td>Charges fixes mensuelles</td><td class="r">${fmtE(cur.fixes)}</td></tr>
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
            ${["Agglomérés", ...QS].some((pr) => besoin(s, pr, i)) ? `<p class="muted small" style="margin:-4px 0 8px">Besoins annoncés : ${["Agglomérés", ...QS].filter((pr) => besoin(s, pr, i)).map((pr) => `${pr === "Agglomérés" ? "Agglo" : pr} ${fmtN(besoin(s, pr, i))}`).join(" · ")}</p>` : ""}
            <label class="field">Prix Agglomérés (€/lot)<input type="number" step="0.5" data-mk="${s}" data-mkk="prix" data-m="${i}" value="${esc(mk.prix)}"></label>
            <div class="small" style="margin:4px 0 8px">${n0(mk.prix) ? priceBadge(s, "Agglomérés", n0(mk.prix)) : `<span class="muted">Fourchette ${rg[0]}–${rg[1]} €</span>`}
              ${marge !== null ? ` · marge <b class="${cls(marge)}">${fmtP(marge)}</b>/lot` : ""}
              ${n0(mk.prix) && Number.isFinite(seuilRentable(r).prix) ? (clampPrix(s, "Agglomérés", mk.prix) >= seuilRentable(r).prix ? ` · <span class="badge good">rentable</span>` : ` · <span class="badge warn">sous le seuil (${fmtP(seuilRentable(r).prix)})</span>`) : ""}</div>
            <label class="field">Délai de paiement<select data-mk="${s}" data-mkk="delai" data-m="${i}">${opts(delaiList, mk.delai)}</select></label>
            <details class="qprix" ${QS.some((q) => n0(mk["prix" + q])) ? "open" : ""}><summary class="small">Prix bouchons naturels Q1–Q4${QS.some((q) => n0(mk["prix" + q])) ? "" : " (non saisis)"}</summary>
              <div class="q-grid">${QS.map((q) => { const rq = range(s, q); return `<label class="field">${q} <span class="muted small">${rq ? `${rq[0]}–${rq[1]}` : ""}</span><input type="number" step="0.5" class="sm" data-mk="${s}" data-mkk="prix${q}" data-m="${i}" value="${esc(mk["prix" + q] || 0)}"></label>`; }).join("")}</div>
            </details>
            <label class="field" style="margin-top:8px">Niveau de publicité (ciblage)${i < 2 ? ` <span class="muted small">(à partir de Mars)</span>` : ""}<select data-mk="${s}" data-mkk="ciblage" data-m="${i}">${opts(CIBLAGES.map(([l], k) => [l, k]), n0(mk.ciblage))}</select></label>
          </div>`;
        }).join("")}
        <div class="seg">
          <h3>Publicité produits</h3>
          <label class="field">Publicité Bouchons Naturels (€)<input type="number" step="100" data-mk="pubNat" data-m="${i}" value="${esc(m.marketing.pubNat || 0)}"></label>
          <label class="field" style="margin-top:8px">Publicité Agglomérés (€)<input type="number" step="100" data-mk="pub" data-m="${i}" value="${esc(m.marketing.pub)}"></label>
          <p class="muted small">Stimule la demande <b>de ce mois uniquement</b>. Décaissée ce mois-ci. Inutile si le stock est faible.</p>
          ${r.ciblage ? `<p class="small">Niveaux de publicité ciblés ce mois-ci : <b>${fmtE(r.ciblage)}</b> (comptés avec la publicité).</p>` : ""}
        </div>
      </div>
      <p class="muted small">Coût moyen des agglomérés ce mois-ci : <b>${fmtP(cmA)}</b>/lot${c.rows[i + 1] && Math.abs(c.rows[i + 1].cmupP["Agglomérés"] - cmA) > 0.005 && c.rows[i + 1].dispoP["Agglomérés"] > 0 ? ` → <b>${fmtP(c.rows[i + 1].cmupP["Agglomérés"])}</b> en ${esc(c.rows[i + 1].nom)} après réception des achats` : ""}. Les prix et délais fixés ici servent de valeurs par défaut pour les ventes du mois.</p>
      <div class="alert info"><span class="ico">€</span><span>${seuilHtml(r, true)}. Vendre en dessous de ce prix moyen fait perdre de l'argent ce mois-ci (coût d'achat + salaires + structure + stockage + pub + transport + autres dépenses).</span></div>
    </div>
    ${planifAideHtml(c, i)}
    ${prevuHtml(c, i)}

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
          return `<tr><td>${SEG_LABEL[sg]}${besoin(sg, "Agglomérés", i) ? `<br><span class="muted small">besoin annoncé ${fmtN(besoin(sg, "Agglomérés", i))}</span>` : ""}</td><td class="r">${fmtP(pe)}</td><td>${DELAIS[n0(m.marketing[sg].delai)]}</td>
            <td class="r"><input type="number" min="0" data-liv="${sg}" data-livk="demande" data-m="${i}" value="${esc(lv.demande)}"></td>
            <td class="r"><input type="number" min="0" data-liv="${sg}" data-livk="livre" data-m="${i}" value="${esc(lv.livre)}"> ${n0(lv.livre) > n0(lv.demande) ? `<span class="badge crit">&gt; demande</span>` : ""}</td>
            <td class="r ${perdu ? "neg" : ""}">${fmtN(perdu)}</td><td class="r">${fmtE(n0(lv.livre) * pe)}</td><td class="r ${cls(mg)}">${fmtE(mg)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      ${stepAQHtml(c, i)}
    </div>

    <div class="card">
      <div class="row between"><h2>Étape B · Négociations (stock du mois prochain)</h2><button class="btn" data-add="achats">+ Ajouter un achat</button></div>
      ${(() => { const ac = alerteCommande(c, i); return ac ? `<div class="alert warn"><span class="ico">!</span><span>${alerteCommandeTexte(ac)}</span></div>` : ""; })()}
      ${besoinsHtml(c, i).replace(/^<div class="card">/, '<div class="inner-card">')}
      <p class="muted small">Livraison industriel → distributeur : <b>30 jours</b> (le stock arrive le mois suivant). Distributeur → distributeur : instantané. Prix marché de référence agglomérés : ${fmtP(n0(state.params.prixMarche))}/lot.${c.rows[i + 1] && r.cmdLots ? ` Coût moyen des agglomérés en ${esc(c.rows[i + 1].nom)} après réception : <b>${fmtP(c.rows[i + 1].cmupP["Agglomérés"])}</b> (aujourd'hui ${fmtP(r.cmupP["Agglomérés"])}).` : ""} Dans le jeu, les agglomérés sont sous « Bouchons triés ». Seules les offres <b>validées</b> comptent dans les calculs ; une offre acceptée des deux côtés est irréversible.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Statut</th><th>Fournisseur</th><th>Produit</th><th class="r">Lots</th><th class="r">Prix/lot</th><th>Livraison</th><th>Paiement</th><th>Transport</th><th class="r">Coût transp. (€)</th><th class="r">Total</th><th></th></tr></thead>
        <tbody>${m.achats.length ? m.achats.map((a, j) => `<tr class="${(a.statut || "validee") === "validee" ? "" : "inactive"}">
          <td>${sel("achats", j, "statut", STATUTS, a.statut || "validee")}</td>
          <td>${inp("achats", j, "fournisseur", a.fournisseur, "text")}</td>
          <td>${sel("achats", j, "produit", TOUS.map((x) => [x, x]), a.produit)}</td>
          <td class="r">${inp("achats", j, "lots", a.lots)}</td>
          <td class="r">${inp("achats", j, "prix", a.prix, "number", 'step="0.01" class="sm"')} ${(() => { const pm = prixMarcheDe(a.produit); return pm && n0(a.prix) > pm ? `<span class="badge warn" title="Au-dessus du prix moyen marché (${fmtP(pm)})">↑ marché</span>` : ""; })()}</td>
          <td>${sel("achats", j, "livraison", LIVRAISONS, a.livraison)}</td>
          <td>${sel("achats", j, "delai", delaiList, a.delai)}</td>
          <td>${transportSelect(`data-m="${i}" data-list="achats" data-j="${j}" data-k="transport"`, a.transport)}</td>
          <td class="r">${inp("achats", j, "coutTransport", a.coutTransport, "number", 'class="sm"')}</td>
          <td class="r">${fmtE(n0(a.lots) * n0(a.prix))}</td>
          <td><button class="btn danger" data-del="achats" data-j="${j}" title="Supprimer">✕</button></td></tr>`).join("") : `<tr><td colspan="11" class="muted">Aucun achat ce mois-ci.</td></tr>`}</tbody>
      </table></div>
    </div>

    ${productionHtml(c, i)}

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
          <tr><td>Salaires</td><td class="r">${fmtE(r.salaires)}</td></tr>
          <tr><td>Frais de structure</td><td class="r">${fmtE(r.structure)}</td></tr>
          <tr><td>Publicité + ciblage marketing</td><td class="r">${fmtE(r.pub)}</td></tr>
          <tr><td>Stockage (${r.stockageRate} % de ${fmtE(r.valFin)})</td><td class="r">${fmtE(r.stockage)}</td></tr>
          <tr><td>Paiements fournisseurs exigibles</td><td class="r">${fmtE(r.paiementsAchats)}</td></tr>
          ${r.fabrication ? `<tr><td>Frais de fabrication (trieuses)</td><td class="r">${fmtE(r.fabrication)}</td></tr>` : ""}
          ${r.investDec ? `<tr><td>Investissements payés</td><td class="r">${fmtE(r.investDec)}</td></tr>` : ""}
          ${r.dotations ? `<tr><td>Dotations aux amortissements <span class="muted small">(charge sans sortie d'argent)</span></td><td class="r">${fmtE(r.dotations)}</td></tr>` : ""}
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
      <div class="card kpi"><div class="label">Coût de stockage du mois</div><div class="value">${fmtE(cur.stockage)}</div><div class="hint">${cur.stockageRate} % de la valeur du stock</div></div>
    </div>
    <div class="card section-gap">
      <h2>Prix de vente minimum rentable · ${esc(cur.nom)}</h2>
      <p class="seuil">${seuilHtml(cur, false)}</p>
      <p class="muted small">C'est le prix moyen de vente par lot (agglomérés) en dessous duquel le mois est en perte : il couvre le coût d'achat des lots + salaires (${fmtE(cur.salaires)}) + structure (${fmtE(cur.structure)}) + amortissements (${fmtE(cur.dotations)}) + stockage (${fmtE(cur.stockage)}) + publicité (${fmtE(cur.pub)}) + transport et autres (${fmtE(cur.transport + cur.divers - cur.pub)}). Plus vous vendez de lots, plus ce prix baisse.</p>
    </div>
    <div class="card">
      <h2>Stock par produit · fin ${esc(cur.nom)}</h2>
      <table><thead><tr><th>Produit</th><th class="r">Lots</th><th class="r">Coût moyen</th><th class="r">Valeur</th><th>Prix de vente possibles (Vignerons / Caves / Négociants)</th></tr></thead><tbody>
        ${[...PRODUITS, ...MATIERES.filter((x) => c.rows.some((rw) => rw.dispoP[x] > 0))].map((p) => `<tr><td>${p}</td><td class="r ${cls(cur.finP[p])}">${fmtN(cur.finP[p])}</td><td class="r">${cur.finP[p] ? fmtP(cur.cmupP[p]) : "—"}</td><td class="r">${fmtE(Math.max(0, cur.finP[p]) * cur.cmupP[p])}</td>
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
        <label class="field">Produit<select data-simu="produit">${opts((s.type === "achat" ? TOUS : PRODUITS).map((p) => [p, p]), s.produit)}</select></label>
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
    </div>
    ${s.type === "achat" ? negoHtml(c, s, mi) : ""}
    ${fournisseursHtml()}`;
  drawTresoChart(document.getElementById("simuChart"), c2.rows);
  if (focus) { const f = el.querySelector(`[data-simu="${focus}"]`); if (f) f.focus(); }
}

// ---------- conseiller ----------
function adviceRules(c) {
  const p = state.params;
  const out = [];
  const cur = c.rows[state.currentMonth];
  const m = state.months[state.currentMonth];
  const fixes = cur.fixes;
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
  const ac = alerteCommande(c, state.currentMonth);
  if (ac) out.push({ cls: "warn", t: alerteCommandeTexte(ac) });
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
    enTransit: r.transit, coutMoyenAgglo: +r.cmup.toFixed(2), salaires: r.salaires, dotationsAmortissements: Math.round(r.dotations), investissementsPayes: r.investDec, fraisFabrication: Math.round(r.fabrication), lotsTries: r.prodLots, produitQ: Object.fromEntries(QS.filter((q) => r.prodOut[q]).map((q) => [q, Math.round(r.prodOut[q])])), CA: Math.round(r.ca), resultat: Math.round(r.resultat),
    coutRevientParLot: r.venLots ? +((r.ca - r.resultat) / r.venLots).toFixed(2) : null,
  }));
  const details = state.months.map((m) => ({
    mois: m.nom,
    livraisonsQ: SEGMENTS.some((sg) => QS.some((q) => n0(m.livraisonsQ?.[sg]?.[q]?.demande))) ? Object.fromEntries(SEGMENTS.map((sg) => [sg, Object.fromEntries(QS.filter((q) => n0(m.livraisonsQ?.[sg]?.[q]?.demande)).map((q) => [q, { demande: n0(m.livraisonsQ[sg][q].demande), livre: n0(m.livraisonsQ[sg][q].livre), prixEffectif: clampPrix(sg, q, m.marketing[sg]?.["prix" + q]) }]))])) : undefined,
    production: (m.production || []).length ? m.production.map((x) => ({ matiere: x.matiere, lots: n0(x.lots) })) : undefined,
    planification: SEGMENTS.some((s) => n0(m.marketing[s].prix) || n0(m.marketing[s].ciblage)) || n0(m.marketing.pub) || n0(m.marketing.pubNat) ? {
      ...Object.fromEntries(SEGMENTS.map((s) => [s, { prixAgglo: n0(m.marketing[s].prix), ...Object.fromEntries(QS.filter((q) => n0(m.marketing[s]["prix" + q])).map((q) => ["prix" + q, n0(m.marketing[s]["prix" + q])])), delaiPaiement: DELAIS[n0(m.marketing[s].delai)], niveauPublicite: CIBLAGES[n0(m.marketing[s].ciblage)][0] }])), publiciteAgglomeres: n0(m.marketing.pub), publiciteBouchonsNaturels: n0(m.marketing.pubNat),
    } : undefined,
    livraisonsParSegment: SEGMENTS.some((sg) => n0(m.livraisons[sg].demande)) ? Object.fromEntries(SEGMENTS.map((sg) => [sg, { demande: n0(m.livraisons[sg].demande), livre: n0(m.livraisons[sg].livre), prixEffectif: clampPrix(sg, "Agglomérés", m.marketing[sg].prix) }])) : undefined,
    achats: m.achats.map((a) => ({ statut: STATUTS.find((x) => x[1] === (a.statut || "validee"))[0], fournisseur: a.fournisseur, produit: a.produit, lots: n0(a.lots), prix: n0(a.prix), livraison: LIVRAISONS.find((l) => l[1] === n0(a.livraison))?.[0], paiement: DELAIS[n0(a.delai)], transport: a.transport, coutTransport: n0(a.coutTransport) })),
    ventes: m.ventes.map((v) => ({ segment: v.segment, client: v.client, produit: v.produit, lots: n0(v.lots), prix: n0(v.prix), encaissement: DELAIS[n0(v.delai)], transport: v.transport || null })),
    autres: m.depenses.map((d) => ({ libelle: d.libelle, montant: n0(d.montant) })),
    notesPlanification: m.planif || undefined, notesNegociation: m.nego || undefined,
  })).filter((m) => m.livraisonsQ || m.production || m.planification || m.livraisonsParSegment || m.achats.length || m.ventes.length || m.autres.length || m.notesPlanification || m.notesNegociation);
  return `<etat_entreprise mois_en_cours="${state.months[state.currentMonth].nom}">
Paramètres : ${JSON.stringify(state.params)}
Stock initial : ${JSON.stringify(state.stockInitial)}
Changements de paramètres en cours de jeu (mois = index, 0 = Janvier) : ${JSON.stringify(state.paramChanges)}
Besoins clients annoncés (segment → produit → {index mois: lots}) : ${JSON.stringify(state.besoins)}
Investissements (payés comptant, amortis) : ${JSON.stringify(state.investissements)}
Production (trieuses) : frais ${state.production.frais} €/lot en entrée ; rendements matière → [Q1,Q2,Q3,Q4] % : ${JSON.stringify(state.production.rendements)} ; prix moyen d'achat des matières : ${JSON.stringify(state.production.prixMarche)}
Fourchettes de prix clients [min, max] €/lot : ${JSON.stringify(state.prixClients)}
Projection mensuelle (calculée par l'outil ; mois futurs = prévision selon les saisies ; achats industriels reçus 30 jours après) :
${JSON.stringify(rows)}
Décisions saisies et notes :
${JSON.stringify(details)}
Trésorerie minimale prévue : ${Math.round(c.minTreso)} € en ${c.rows[c.minTresoMonth]?.nom}
RSE : ${JSON.stringify(rseSummary(state))}
</etat_entreprise>`;
}

const SYSTEM_PROMPT = (rules) => `Tu es le conseiller stratégique d'une équipe d'étudiants dans un jeu d'entreprise (business game, plateforme Vinego). Ils dirigent un distributeur de bouchons de liège : ils achètent des lots à des industriels (STECKER, fournisseur allemand historique, est en liquidation depuis mars : plus d'offres de sa part) ou à d'autres distributeurs, et les revendent à trois segments de clients : Vignerons, Caves, Négociants / Grands comptes. Chaque "mois" du jeu comporte une phase de planification (positionnement marketing : prix et délai de paiement par segment, budget publicité) puis une phase de négociation (négociations fournisseurs, ventes).

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

const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
function iaProvider() { const p = lsGet(IA_KEY); if (p) return p; return lsGet(KEY_KEY) && !lsGet(GEM_KEY) ? "claude" : "gemini"; }
const keyFor = (prov) => lsGet(prov === "claude" ? KEY_KEY : GEM_KEY);
function getKey() { return keyFor(iaProvider()); }

const QUICK_QUESTIONS = [
  "Quels prix, délais et budget pub fixer en planification ce mois-ci ?",
  "On a une offre fournisseur en négociation : faut-il l'accepter ?",
  "Combien de lots acheter et à quel prix maximum ?",
  "Quel est notre plus gros risque en ce moment ?",
  "Comment éviter une trésorerie négative ?",
  "Quel segment privilégier et pourquoi ?",
];
function promptForCopy(question) {
  const c = compute(state);
  return `${SYSTEM_PROMPT(state.rules)}\n\n${contextForAI(c)}\n\nQuestion de l'équipe : ${question || "Fais le point sur notre situation et dis-nous quoi décider ce mois-ci (planification et négociations)."}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove(); return ok;
}
async function copyForAI(question) {
  const ok = await copyText(promptForCopy(question));
  toast(ok ? "Copié ! Collez-le dans Claude.ai, Gemini ou ChatGPT (Cmd/Ctrl + V)" : "Copie impossible dans ce navigateur");
}

function renderIA(c) {
  const el = document.getElementById("tab-ia");
  const prov = iaProvider();
  const key = keyFor(prov);
  const advice = adviceRules(c);
  const prevScroll = el.querySelector(".chat")?.scrollTop;
  const draft = document.getElementById("chatInput")?.value || "";
  const keyHelp = prov === "gemini"
    ? `Clé <b>gratuite</b> : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (compte Google, sans carte bancaire) → « Create API key ». Offre gratuite limitée en nombre de questions par minute et par jour ; Google peut utiliser les questions pour améliorer ses modèles.`
    : `Clé payante à l'usage : console.anthropic.com → API Keys.`;
  el.innerHTML = `
    <div class="grid c2">
      <div class="card">
        <h2>Diagnostic automatique</h2>
        <p class="muted small">Calculé à partir de vos saisies, sans IA. Gratuit, se met à jour en direct.</p>
        ${advice.map((a) => `<div class="alert ${a.cls}"><span>${a.t}</span></div>`).join("")}
      </div>
      <div class="card">
        <h2>Discuter avec l'IA</h2>
        <div class="row">
          <label class="field" style="flex:1">IA utilisée<select id="iaProvider">${opts([["Gemini (gratuit)", "gemini"], ["Claude (payant)", "claude"]], prov)}</select></label>
        </div>
        ${key ? `<p class="muted small">Clé ${prov === "gemini" ? "Gemini" : "Claude"} enregistrée dans ce navigateur uniquement. <button class="btn ghost" id="forgetKey" style="padding:2px 8px">Oublier la clé</button></p>`
        : `<p class="small">${keyHelp} La clé reste <b>uniquement dans votre navigateur</b> (jamais dans l'export, le lien ou la synchronisation).</p>
           <div class="row"><input type="password" id="apiKey" placeholder="${prov === "gemini" ? "AIza…" : "sk-ant-…"}" style="flex:1"><button class="btn" id="saveKey">Enregistrer</button></div>`}
        <div class="alert info"><span class="ico">⎙</span><span><b>Avec un PDF :</b> <button class="btn ghost" id="dossierIA" style="padding:2px 8px">PDF du mois pour l'IA</button> puis <button class="btn ghost" id="promptIA" style="padding:2px 8px">Copier le prompt</button>. Joignez le PDF dans Claude.ai, Gemini ou ChatGPT et collez le prompt : il explique le jeu, les changements depuis mars et ce qu'on attend (planification et négociations du mois suivant).</span></div>
        <div class="alert info"><span class="ico">⧉</span><span><b>Sans clé :</b> <button class="btn ghost" id="copyAI" style="padding:2px 8px">Copier pour l'IA</button> copie vos données + les règles + la question écrite en bas. Collez ensuite dans Claude.ai, Gemini ou ChatGPT (gratuits).</span></div>
        <p class="muted small" style="margin:8px 0 0">Questions rapides (un clic : ${key ? "envoyée à l'IA" : "copiée pour l'IA"}) :</p>
        <div class="suggestions">
          ${QUICK_QUESTIONS.map((q) => `<button class="pill" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
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
async function streamClaude(key, system, messages, onText) {
  if (!Anthropic) Anthropic = (await import("https://esm.sh/@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
  });
  stream.on("text", onText);
  const final = await stream.finalMessage();
  return final.stop_reason === "refusal" ? "refus" : final.stop_reason === "max_tokens" ? "tronque" : "";
}
async function pickGeminiModel(key) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const j = await r.json();
    const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /flash/.test(m.name) && !/(image|tts|live|audio|embedding|exp)/.test(m.name));
    ok.sort((a, b) => (/preview/.test(a.name) ? 1 : 0) - (/preview/.test(b.name) ? 1 : 0) || (/lite/.test(a.name) ? 1 : 0) - (/lite/.test(b.name) ? 1 : 0));
    return ok[0]?.name.replace(/^models\//, "") || null;
  } catch { return null; }
}
async function streamGemini(key, system, messages, onText) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
  });
  const call = (mdl) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:streamGenerateContent?alt=sse`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body,
  });
  let model = lsGet(GEM_MODEL_KEY) || "gemini-flash-latest";
  let res = await call(model);
  if (res.status === 404) { const m2 = await pickGeminiModel(key); if (m2 && m2 !== model) { model = m2; lsSet(GEM_MODEL_KEY, m2); res = await call(model); } }
  if (res.status === 429 && !/lite/.test(model)) res = await call("gemini-flash-lite-latest"); // quota du modèle principal atteint
  if (!res.ok) {
    const t = await res.text(); let msg = t;
    try { msg = JSON.parse(t).error?.message || t; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", finish = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5));
        const cand = j.candidates?.[0];
        (cand?.content?.parts || []).forEach((pt) => { if (pt.text && !pt.thought) onText(pt.text); });
        if (cand?.finishReason === "MAX_TOKENS") finish = "tronque";
        if (cand?.finishReason === "SAFETY" || j.promptFeedback?.blockReason) finish = "refus";
      } catch {}
    }
  }
  return finish;
}
async function askAI(question) {
  const prov = iaProvider();
  const key = keyFor(prov);
  if (!question.trim() || ui.busy) return;
  if (!key) { copyForAI(question); return; }
  document.getElementById("chatInput").value = "";
  state.chat.push({ role: "user", text: question.trim() });
  const reply = { role: "assistant", text: "" };
  state.chat.push(reply);
  ui.busy = true; save(); render(); scrollChat();
  try {
    const c = compute(state);
    const history = state.chat.slice(0, -1).filter((m) => !m.err && m.text).slice(-20);
    while (history.length && history[0].role !== "user") history.shift();
    const messages = history.map((m, idx) => ({
      role: m.role,
      content: idx === history.length - 1 ? `${contextForAI(c)}\n\nQuestion de l'équipe : ${m.text}` : m.text,
    }));
    const onText = (t) => { reply.text += t; updateLastMsg(reply.text); };
    const end = prov === "claude" ? await streamClaude(key, SYSTEM_PROMPT(state.rules), messages, onText) : await streamGemini(key, SYSTEM_PROMPT(state.rules), messages, onText);
    if (end === "refus") reply.text += "\n\n(La requête a été refusée par le modèle. Reformulez la question.)";
    if (end === "tronque") reply.text += "\n\n(Réponse tronquée.)";
    if (!reply.text) reply.text = "(Pas de réponse.)";
  } catch (e) {
    reply.err = true;
    const st = e?.status, msg = String(e?.message || e);
    reply.text = prov === "gemini"
      ? (/API key not valid|API_KEY_INVALID/i.test(msg) || st === 401 ? "Clé Gemini invalide. Vérifiez-la (aistudio.google.com/apikey) puis enregistrez-la à nouveau."
        : st === 429 ? "Limite gratuite de Gemini atteinte (trop de questions par minute ou par jour). Réessayez dans une minute, ou utilisez « Copier pour l'IA »."
        : st === 403 ? "Accès refusé par Google (403) : la clé n'a peut-être pas accès à l'API Gemini. Créez-la depuis aistudio.google.com/apikey."
        : `Erreur Gemini : ${msg}`)
      : (st === 401 ? "Clé API Claude invalide (401)."
        : st === 429 ? "Trop de requêtes ou crédit épuisé (429). Réessayez dans un instant."
        : `Erreur : ${msg}`);
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
  el.innerHTML = cloudCardHtml() + `
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
      <h2>Changements en cours de jeu</h2>
      <p class="muted small">Quand le jeu annonce un nouveau paramètre (ex. salaires à 150 000 € en mars), ajoutez-le ici : il s'applique <b>à partir du mois choisi</b>, les mois précédents gardent l'ancienne valeur.</p>
      <div class="table-wrap"><table><thead><tr><th>À partir de</th><th>Paramètre</th><th class="r">Nouvelle valeur</th><th></th></tr></thead><tbody>
        ${state.paramChanges.length ? state.paramChanges.map((x, j) => `<tr><td><select data-pchg="${j}|mois">${opts(state.months.map((m, k) => [m.nom, k]), x.mois)}</select></td><td><select data-pchg="${j}|cle">${opts(PARAM_CHANGEABLES, x.cle)}</select></td><td class="r"><input type="number" step="0.01" data-pchg="${j}|valeur" value="${esc(x.valeur)}"></td><td><button class="btn danger" data-delpchg="${j}">✕</button></td></tr>`).join("") : `<tr><td colspan="4" class="muted">Aucun changement.</td></tr>`}
      </tbody></table></div>
      <button class="btn ghost" id="addPchg">+ Ajouter un changement</button>

      <h3 class="section-gap">Investissements (machines…)</h3>
      <p class="muted small">Payés comptant au mois choisi (sortie de trésorerie), puis amortis : chaque mois, montant ÷ (durée × 12) est compté en charge (dotation aux amortissements) dans le résultat et le coût de revient, sans sortie d'argent.</p>
      <div class="table-wrap"><table><thead><tr><th>Libellé</th><th class="r">Montant (€)</th><th>Payé en</th><th class="r">Durée (ans)</th><th class="r">Dotation / mois</th><th></th></tr></thead><tbody>
        ${state.investissements.length ? state.investissements.map((x, j) => `<tr><td><input type="text" data-inv="${j}|libelle" value="${esc(x.libelle)}"></td><td class="r"><input type="number" data-inv="${j}|montant" value="${esc(x.montant)}"></td><td><select data-inv="${j}|mois">${opts(state.months.map((m, k) => [m.nom, k]), x.mois)}</select></td><td class="r"><input type="number" class="sm" step="0.5" data-inv="${j}|duree" value="${esc(x.duree)}"></td><td class="r">${fmtE(n0(x.montant) / Math.max(1, n0(x.duree) * 12))}</td><td><button class="btn danger" data-delinv="${j}">✕</button></td></tr>`).join("") : `<tr><td colspan="6" class="muted">Aucun investissement.</td></tr>`}
      </tbody></table></div>
      <button class="btn ghost" id="addInv">+ Ajouter un investissement</button>
    </div>
    <div class="card">
      <h2>Production · trieuses</h2>
      <div class="form-grid">${f("production.frais", "Frais de fabrication (€ par lot en entrée)", state.production.frais, "0.01")}${f("production.capacite", "Capacité de tri (lots/mois, 0 = inconnue)", state.production.capacite || 0)}</div>
      <p class="muted small section-gap">Rendements (tableau « Trieuses » du jeu) : part de chaque lot de matière qui devient Q1, Q2, Q3, Q4. Prix moyen d'achat : annonce du jeu (laisser vide si inconnu).</p>
      <div class="table-wrap"><table><thead><tr><th>Matière</th>${QS.map((q) => `<th class="r">${q} (%)</th>`).join("")}<th class="r">Prix d'achat moyen (€/lot)</th></tr></thead><tbody>
        ${MATIERES.map((mt) => `<tr><td>${esc(mt)}</td>${QS.map((q, k) => `<td class="r"><input type="number" class="sm" data-rend="${mt}|${k}" value="${state.production.rendements[mt]?.[k] ?? 0}"></td>`).join("")}<td class="r"><input type="number" class="sm" step="0.01" data-pmat="${mt}" value="${state.production.prixMarche[mt] ?? ""}"></td></tr>`).join("")}
      </tbody></table></div>
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
      <h2>Besoins clients annoncés (lots par mois)</h2>
      <p class="muted small">Tableau « Les clients » du guide Nouvelles activités. Sert aux besoins affichés en planification, à l'étape A et à la carte « quoi acheter maintenant ». Modifiez-le si le jeu annonce d'autres chiffres.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Segment</th><th>Produit</th>${state.months.map((m, k) => (k >= 2 ? `<th class="r">${esc(m.nom.slice(0, 4))}</th>` : "")).join("")}</tr></thead>
        <tbody>${SEGMENTS.flatMap((sg) => ["Agglomérés", ...QS].map((pr) => `<tr><td>${SEG_LABEL[sg]}</td><td>${pr}</td>${state.months.map((m, k) => (k >= 2 ? `<td class="r"><input type="number" class="sm" data-bes="${sg}|${pr}|${k}" value="${state.besoins?.[sg]?.[pr]?.[k] ?? ""}"></td>` : "")).join("")}</tr>`)).join("")}</tbody>
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
    </div>
    <div class="card" id="backups">
      <h2>Sauvegardes</h2>
      <p class="small">Le bouton <b>Sauvegarder</b> (en haut) enregistre une copie ici <b>et</b> télécharge un fichier dans vos Téléchargements. Une copie automatique est faite chaque jour à l'ouverture et avant tout import, lien de partage, restauration ou réinitialisation.</p>
      ${(() => { const list = listBackups(); return list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th>Contenu</th><th></th></tr></thead>
        <tbody>${list.map((b, k) => { let info = ""; try { const o = JSON.parse(b.data); const nb = o.months.filter((m) => (m.achats || []).length || (m.ventes || []).length || Object.values(m.livraisons || {}).some((l) => +l.demande)).length; info = `${esc(o.team || "")} · mois en cours ${esc(o.months[o.currentMonth]?.nom || "")} · ${nb} mois saisis`; } catch {} return `<tr><td>${fmtDate(b.date)}</td><td class="small">${esc(b.label)}</td><td class="small muted">${info}</td><td class="r" style="white-space:nowrap"><button class="btn ghost" data-restore="${k}">Restaurer</button> <button class="btn ghost" data-dlbackup="${k}">Télécharger</button></td></tr>`; }).join("")}</tbody>
      </table></div>` : `<p class="muted">Aucune sauvegarde pour l'instant.</p>`; })()}
      <p class="muted small">Les ${BACKUP_MAX} copies les plus récentes sont gardées dans ce navigateur. Si le navigateur est vidé, elles disparaissent aussi : gardez les fichiers téléchargés (ou importez-les avec « Importer (.json) »).</p>
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
    if (t.dataset.add === "achats") m.achats.push({ id: uid(), fournisseur: "", produit: "Agglomérés", lots: 5000, prix: n0(state.params.prixMarche), livraison: 1, delai: 0, transport: "Train", coutTransport: 0 });
    if (t.dataset.add === "ventes") {
      const seg = "Vignerons", rg = range(seg, "Agglomérés");
      const pr = n0(m.marketing[seg].prix) || (rg ? (rg[0] + rg[1]) / 2 : 0);
      m.ventes.push({ id: uid(), segment: seg, client: "", produit: "Agglomérés", lots: 1000, prix: pr, delai: n0(m.marketing[seg].delai), transport: "", coutTransport: 0 });
    }
    if (t.dataset.add === "depenses") m.depenses.push({ id: uid(), libelle: "", montant: 0 });
    if (t.dataset.add === "production") { m.production = m.production || []; const r0 = compute(state).rows[ui.editMonth]; const mat = MATIERES.find((x) => r0.dispoP[x] > 0) || MATIERES[0]; m.production.push({ id: uid(), matiere: mat, lots: Math.round(r0.dispoP[mat] || 0) }); }
    save(); render(); return;
  }
  if (t.dataset.del) { state.months[ui.editMonth][t.dataset.del].splice(+t.dataset.j, 1); save(); render(); return; }
  if (t.dataset.q) { if (getKey() && !ui.busy) askAI(t.dataset.q); else copyForAI(t.dataset.q); return; }
  if (/^cloud/.test(t.id) || t.dataset.cloudrestore !== undefined) { cloudClick(t.id, t); return; }
  if (t.dataset.delpchg !== undefined) { state.paramChanges.splice(+t.dataset.delpchg, 1); save(); render(); return; }
  if (t.dataset.delinv !== undefined) { state.investissements.splice(+t.dataset.delinv, 1); save(); render(); return; }
  if (t.dataset.restore !== undefined) {
    const b = listBackups()[+t.dataset.restore];
    if (b && confirm(`Remplacer les valeurs actuelles par la sauvegarde du ${fmtDate(b.date)} ?\n(Les valeurs actuelles sont d'abord sauvegardées.)`)) {
      snapshot("Automatique · avant restauration");
      const chat = state.chat;
      state = migrate(JSON.parse(b.data)); state.chat = chat || [];
      ui.editMonth = state.currentMonth; save(); render(); toast("Sauvegarde restaurée");
    }
    return;
  }
  if (t.dataset.dlbackup !== undefined) {
    const b = listBackups()[+t.dataset.dlbackup];
    if (b) downloadJson(JSON.parse(b.data), `pilotage-bouchons-sauvegarde-${b.date.slice(0, 16).replace("T", "_").replace(":", "h")}.json`);
    return;
  }
  switch (t.id) {
    case "themeBtn": {
      const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem(STORE_KEY + "-theme", document.documentElement.dataset.theme); } catch {}
      break;
    }
    case "saveKey": {
      const v = document.getElementById("apiKey").value.trim();
      if (v) { lsSet(iaProvider() === "claude" ? KEY_KEY : GEM_KEY, v); lsSet(IA_KEY, iaProvider()); render(); toast("Clé enregistrée dans ce navigateur"); }
      break;
    }
    case "forgetKey": lsSet(iaProvider() === "claude" ? KEY_KEY : GEM_KEY, ""); render(); break;
    case "sendChat": askAI(document.getElementById("chatInput").value); break;
    case "addPchg": state.paramChanges.push({ id: uid(), mois: state.currentMonth, cle: "salaires", valeur: n0(state.params.salaires) }); save(); render(); break;
    case "addInv": state.investissements.push({ id: uid(), libelle: "", montant: 0, mois: state.currentMonth, duree: 5 }); save(); render(); break;
    case "figerPrevu": {
      const i = +t.dataset.m, e = estimMois(compute(state), i);
      state.months[i].prevu = { date: new Date().toISOString(), demande: e.demande, lots: e.lots, ca: e.ca, resultat: e.resultat };
      save(); render(); toast(e.inconnu.length ? `Prévision figée (demande inconnue pour : ${e.inconnu.join(", ")} — corrigez les valeurs si besoin)` : "Prévision figée"); break;
    }
    case "applyPrix": {
      if (!confirm("Remplacer les prix de la planification par les prix conseillés ?")) break;
      const i = +t.dataset.m, c0 = compute(state), cm = c0.rows[i].cmupP["Agglomérés"] || n0(state.stockInitial.prix);
      SEGMENTS.forEach((sg) => {
        const rg = range(sg, "Agglomérés"), mod = modeleDemande(histoSegment(sg, i));
        const cand = [rg[0], (rg[0] + rg[1]) / 2, rg[1]];
        let best = null, bv = -Infinity;
        if (!mod || mod.type === "dernier") return;
        cand.forEach((p) => { const v = mod.at(p) * (p - cm); if (v > bv + 0.5) { bv = v; best = p; } });
        if (best !== null && bv > 0) state.months[i].marketing[sg].prix = best;
      });
      save(); render(); toast("Prix conseillés appliqués"); break;
    }
    case "copyAI": copyForAI(document.getElementById("chatInput")?.value || ""); break;
    case "reportBtn": printReport(); break;
    case "dossierIA": printDossierIA(); break;
    case "promptIA": copyPromptIA(); break;
    case "autoAlloc": {
      const i = ui.editMonth, m = state.months[i];
      SEGMENTS.forEach((sg) => { m.livraisons[sg].livre = 0; });
      let dispo = compute(state).rows[i].dispoP["Agglomérés"] - m.ventes.filter((v) => v.produit === "Agglomérés").reduce((t, v) => t + n0(v.lots), 0);
      const order = [...SEGMENTS].sort((a, b) => (clampPrix(b, "Agglomérés", m.marketing[b].prix) - n0(m.marketing[b].delai) * 0.5) - (clampPrix(a, "Agglomérés", m.marketing[a].prix) - n0(m.marketing[a].delai) * 0.5));
      for (const sg of order) { const q = Math.min(n0(m.livraisons[sg].demande), Math.max(0, dispo)); m.livraisons[sg].livre = q; dispo -= q; }
      // bouchons naturels Q1–Q4 : même règle, produit par produit
      const rows0 = compute(state).rows[i];
      QS.forEach((qq) => {
        SEGMENTS.forEach((sg) => { if (m.livraisonsQ?.[sg]?.[qq]) m.livraisonsQ[sg][qq].livre = 0; });
        let d = rows0.dispoP[qq] - m.ventes.filter((v) => v.produit === qq).reduce((t, v) => t + n0(v.lots), 0);
        const ord = [...SEGMENTS].sort((a, b) => (clampPrix(b, qq, m.marketing[b]?.["prix" + qq]) - n0(m.marketing[b].delai) * 0.5) - (clampPrix(a, qq, m.marketing[a]?.["prix" + qq]) - n0(m.marketing[a].delai) * 0.5));
        for (const sg of ord) { const lv = m.livraisonsQ?.[sg]?.[qq]; if (!lv) continue; const x = Math.min(n0(lv.demande), Math.max(0, Math.floor(d))); lv.livre = x; d -= x; }
      });
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
    case "backupBtn": {
      save();
      const ok = snapshot("Manuelle (bouton Sauvegarder)");
      downloadJson(state, `pilotage-bouchons-sauvegarde-${stamp()}.json`);
      toast(ok ? "Sauvegardé ✓ (copie dans le navigateur + fichier téléchargé)" : "Fichier téléchargé (copie navigateur impossible : stockage plein)");
      if (ui.tab === "params") renderParams();
      break;
    }
    case "exportJson": {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pilotage-bouchons-${state.months[state.currentMonth].nom.toLowerCase()}.json`;
      a.click(); URL.revokeObjectURL(a.href); break;
    }
    case "resetAll": if (confirm("Effacer toutes les données et repartir des valeurs de départ ?\n(Une sauvegarde est faite avant.)")) { snapshot("Automatique · avant réinitialisation"); state = defaultState(); ui.editMonth = 0; save(); render(); } break;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.bes) {
    const [sg, pr, k] = t.dataset.bes.split("|");
    state.besoins = state.besoins || {}; state.besoins[sg] = state.besoins[sg] || {}; state.besoins[sg][pr] = state.besoins[sg][pr] || {};
    if (t.value === "") delete state.besoins[sg][pr][k]; else state.besoins[sg][pr][k] = n0(t.value);
    save(); render(); return;
  }
  if (t.dataset.pchg) { const [j, k] = t.dataset.pchg.split("|"); state.paramChanges[+j][k] = k === "cle" ? t.value : n0(t.value); save(); render(); return; }
  if (t.dataset.inv) { const [j, k] = t.dataset.inv.split("|"); state.investissements[+j][k] = k === "libelle" ? t.value : n0(t.value); save(); render(); return; }
  if (t.dataset.rend) { const [mt, k] = t.dataset.rend.split("|"); state.production.rendements[mt] = state.production.rendements[mt] || [0, 0, 0, 0]; state.production.rendements[mt][+k] = n0(t.value); save(); render(); return; }
  if (t.dataset.pmat) { if (t.value === "") delete state.production.prixMarche[t.dataset.pmat]; else state.production.prixMarche[t.dataset.pmat] = n0(t.value); save(); render(); return; }
  if (t.id === "iaProvider") { lsSet(IA_KEY, t.value); renderIA(compute(state)); return; }
  if (t.dataset.prevu) {
    const m = state.months[+t.dataset.m];
    if (m.prevu) { m.prevu[t.dataset.prevu] = n0(t.value); save(); render(); }
    return;
  }
  if (t.id === "currentMonth") { state.currentMonth = +t.value; ui.editMonth = state.currentMonth; ui.simu.mois = state.currentMonth; save(); render(); return; }
  if (t.dataset.list) {
    const item = state.months[+t.dataset.m][t.dataset.list][+t.dataset.j];
    const k = t.dataset.k;
    item[k] = NUM_KEYS.has(k) ? n0(t.value) : t.value;
    if (t.dataset.list === "ventes" && (k === "segment" || k === "produit")) {
      const mk = state.months[+t.dataset.m].marketing[item.segment];
      const planned = item.produit === "Agglomérés" ? n0(mk?.prix) : n0(mk?.["prix" + item.produit]);
      if (mk && planned) { item.prix = clampPrix(item.segment, item.produit, planned); item.delai = n0(mk.delai); }
    }
    save(); render(); return;
  }
  if (t.dataset.mk) {
    const mk = state.months[+t.dataset.m].marketing;
    if (t.dataset.mk === "pub" || t.dataset.mk === "pubNat") mk[t.dataset.mk] = n0(t.value);
    else if (t.dataset.mkk === "prix" && n0(t.value)) {
      const c2 = clampPrix(t.dataset.mk, "Agglomérés", t.value);
      if (c2 !== n0(t.value)) toast(`Prix ramené à ${c2} € (fourchette du jeu)`);
      mk[t.dataset.mk].prix = c2;
    } else mk[t.dataset.mk][t.dataset.mkk] = n0(t.value);
    save(); render(); return;
  }
  if (t.dataset.livq) {
    const [sg, q] = t.dataset.livq.split("|");
    const m = state.months[+t.dataset.m];
    m.livraisonsQ = m.livraisonsQ || {};
    m.livraisonsQ[sg] = m.livraisonsQ[sg] || {};
    const lv = m.livraisonsQ[sg][q] = m.livraisonsQ[sg][q] || { demande: 0, livre: 0 };
    lv[t.dataset.livk] = Math.max(0, n0(t.value));
    if (t.dataset.livk === "demande") {
      const c = compute(state);
      const dem = SEGMENTS.reduce((a, g) => a + n0(m.livraisonsQ?.[g]?.[q]?.demande), 0);
      const autres = m.ventes.filter((v) => v.produit === q).reduce((a, v) => a + n0(v.lots), 0);
      if (dem + autres <= c.rows[+t.dataset.m].dispoP[q] + 1e-6) SEGMENTS.forEach((g) => { if (m.livraisonsQ[g]?.[q]) m.livraisonsQ[g][q].livre = n0(m.livraisonsQ[g][q].demande); });
    }
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
      try { const ns = migrate(JSON.parse(txt)); snapshot("Automatique · avant import d'un fichier"); state = ns; ui.editMonth = state.currentMonth; save(); render(); toast("Données importées"); }
      catch { toast("Fichier invalide"); }
    });
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.cloudf) { ui.cloudForm[t.dataset.cloudf] = t.value; return; }
  if (t.dataset.cloudname !== undefined && cloud) { cloud.name = t.value.trim(); try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); } catch {} return; }
  if (t.dataset.note) { state.months[+t.dataset.m][t.dataset.note] = t.value; save(); return; }
  if (t.id === "rules") { state.rules = t.value; save(); return; }
  if (t.dataset.rev) {
    const k = t.dataset.rev;
    ui.rev[k] = k === "cle" ? t.value : n0(t.value);
    renderRevient(compute(state));
    return;
  }
  if (t.dataset.simu) {
    const k = t.dataset.simu;
    ui.simu[k] = ["type", "transport", "produit", "segment"].includes(k) ? t.value : n0(t.value);
    renderSimu(compute(state));
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.id === "chatInput" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (getKey()) askAI(e.target.value); }
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
{ const last = listBackups()[0]; if (!last || new Date(last.date).toDateString() !== new Date().toDateString()) snapshot("Automatique · ouverture du jour"); }
document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + ui.tab));
save();
render();
cloudStart(false).then(() => { if (cloudInvited && cloudOn()) { toast("Connecté aux données du groupe"); if (!cloud.name) setTimeout(() => { const n = prompt("Votre prénom (affiché aux autres membres quand vous modifiez) :"); if (n) { cloud.name = n.trim(); try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); } catch {} renderParams(); } }, 600); } });
setInterval(cloudPoll, 10000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) cloudPoll(); });
document.addEventListener("focusout", () => { if (cloudWaiting) setTimeout(cloudPoll, 300); });
