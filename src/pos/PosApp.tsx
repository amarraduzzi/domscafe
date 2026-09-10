import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  writeBatch,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, uploadTvSlideImage } from '../firebase';
import { menuItems as staticMenuItems, type MenuItem } from '../data';
import { initialCategories } from '../firebase';

// ---------------------------------------------------------------------------
// Dom's Café — order hub / POS screen (domscafe.pages.dev/pos.html)
//
// Everything that can currently reach the restaurant lands in the same
// Firestore "orders" collection this file reads:
//   - the customer ordering site (App.tsx -> createFirestoreOrder), already
//     live, writes {restaurantId, tableNumber, items, total, createdAt,
//     status: "new"} with no `source`/`orderType`/`paid` field yet.
//   - this screen's own "+ Emporter / Livraison / Glovo" panel, for walk-ins,
//     phone orders and (until the real API integration exists) Glovo orders
//     staff key in by hand, tagged with `source`.
//   - table orders, created and added-to exclusively through the Tables tab
//     below (tap a numbered table -> add items -> one running bill per
//     table, merged into a single order doc instead of a new one each time).
// Older docs from before this screen existed simply lack `source`,
// `orderType` and `paid` — every read below treats those as optional and
// falls back sensibly, so nothing already written breaks.
//
// No payment processing happens here on purpose (per the brief: "geen
// bankverbinding nodig, gewoon een verzamelpunt"). "Encaisser" / "Marquer
// payé" only record cash-vs-carte for the team's own bookkeeping.
//
// Access: this URL has no real login, only a PIN gate (like the billiards
// cancel-PIN elsewhere on this site) so it isn't wide open to anyone who
// finds the link. It is a UI deterrent, not security — Firestore itself is
// reachable by anyone with the public web API key, same as the rest of this
// project.
//
// Chaque employé a son propre code (EMPLOYEES ci-dessous) au lieu d'un seul
// code partagé : qui se connecte devient l'identité attachée aux commandes
// comptoir qu'il crée et au déverrouillage après le verrouillage automatique
// d'inactivité (voir IDLE_LOCK_MS plus bas) -- ce qui alimente le "omzet per
// medewerker" du rapport Ventes. Ajoute/retire des employés ou change leur
// code ici quand le personnel change.
// ---------------------------------------------------------------------------

interface Employee {
  name: string;
  pin: string;
}
const EMPLOYEES: Employee[] = [
  { name: 'Amar', pin: '4271' },
  { name: 'Ahmed', pin: '1234' },
];
const EMPLOYEE_SESSION_KEY = 'domscafe_pos_employee';
// Manager-PIN -- séparé des codes employé ci-dessus : ceux-là ouvrent l'écran
// et identifient qui travaille, celui-ci protège des actions sensibles une
// fois dedans (annuler une commande déjà envoyée en cuisine, retirer un
// article d'une commande en cours, appliquer une remise, clôturer le rapport
// Z). Change-le indépendamment des codes employé quand le turnover du
// personnel le justifie.
const MANAGER_PIN = '7734';
// Verrouillage automatique après ce délai d'inactivité -- "sessie-timeout" :
// le code d'un employé (n'importe lequel de la liste, pas forcément celui
// qui était connecté) redéverrouille l'écran sans perdre l'état de la page
// (commandes, onglet ouvert...).
const IDLE_LOCK_MS = 5 * 60 * 1000;
const TABLE_COUNT = 25;
const TABLE_NUMBERS = Array.from({ length: TABLE_COUNT }, (_, i) => String(i + 1));

type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
type OrderSource = 'site' | 'manual' | 'glovo';
type OrderKind = 'dine_in' | 'takeaway' | 'delivery' | 'glovo';
type PaymentMethod = 'cash' | 'card' | 'mixed';

interface OrderItem {
  name: string;
  quantity: number;
  note?: string;
  unitPrice: number;
  lineTotal: number;
  station?: string;
}

interface OrderDoc {
  id: string;
  restaurantId?: string;
  tableNumber?: string;
  items: OrderItem[];
  total: number;
  createdAt?: Timestamp;
  status?: OrderStatus;
  source?: OrderSource;
  orderType?: OrderKind;
  paid?: boolean;
  paymentMethod?: PaymentMethod;
  // Rempli uniquement pour un paiement partagé (paymentMethod === 'mixed') --
  // les deux montants doivent totaliser `total` au moment du paiement.
  paymentSplit?: { cash: number; card: number };
  // Employé qui a créé la commande depuis ce comptoir (Tables /
  // Emporter-Livraison-Glovo) -- absent pour les commandes "source: site"
  // puisque c'est le client qui les passe lui-même. Alimente le rapport
  // "omzet per medewerker".
  employeeName?: string;
  customerName?: string;
  address?: string;
  glovoRef?: string;
  // Order-level "special request" -- from the customer's cart note, or
  // typed in directly by the cashier here. Kept visible everywhere an order
  // is displayed, including the kitchen view: this screen may end up
  // physically in the kitchen later, so a note has to survive that move.
  note?: string;
  // Cumulative amount (MAD) deducted from `total` via applyDiscount() below.
  // `total` itself already reflects the discount (reports/payment just read
  // `total`) -- this field only exists so the receipt and order card can
  // show that a discount was applied, and how much.
  discount?: number;
  // Combien d'éléments de `items` (en partant du début) ont déjà été
  // envoyés à l'imprimante cuisine -- permet de n'imprimer que les articles
  // ajoutés depuis le dernier ticket au lieu de réimprimer toute
  // l'addition à chaque ajout sur une table déjà en cours.
  kitchenPrintedCount?: number;
}

// Un override par article, clé = l'id de l'article dans data.ts pour un
// article existant, ou un id Firestore auto-généré pour un article créé
// entièrement depuis l'écran "Menu" (isCustom: true). Volontairement
// minimal (prix/nom/catégorie/station/actif) -- les fiches complètes
// (3 langues, description, photo, variantes) restent gérées dans data.ts,
// voir la note dans l'onglet Menu.
interface MenuOverride {
  name?: string;
  price?: number;
  category?: string;
  station?: string;
  active?: boolean;
  isCustom?: boolean;
}

// Un slide de l'écran TV (collection Firestore "tvSlides"), géré depuis
// l'onglet "TV" ci-dessous et affiché en boucle sur tv.html -- écran promo
// séparé, à ouvrir en plein écran sur la Smart TV de la salle (pas besoin de
// boîtier supplémentaire, juste le navigateur déjà intégré à la TV).
// `imageUrl` (Firebase Storage, voir uploadTvSlideImage dans firebase.ts) est
// le mode d'affichage principal désormais -- quand il est présent, tv.html
// affiche la photo plein cadre au lieu du gros titre texte (voir TvApp.tsx).
// `title` reste obligatoire même pour un slide-photo : sert de nom interne
// dans la liste ci-dessous et d'attribut alt de l'image, jamais affiché en
// grand sur l'écran TV s'il y a une photo. `order` détermine l'ordre
// d'affichage (plus petit = plus tôt) ; `active` permet de préparer un slide
// sans encore le mettre en rotation.
interface TvSlide {
  id: string;
  title: string;
  subtitle?: string;
  price?: number;
  imageUrl?: string;
  order: number;
  active: boolean;
}

// Un doc par jour civil clôturé (Rapport Z), clé = dateStr() ("YYYY-MM-DD").
// Écrit une seule fois par jour via closeToday() ; sa seule présence signale
// "journée clôturée" et fige les chiffres au moment de la clôture.
interface DailyClosure {
  date: string;
  revenue: number;
  cash: number;
  card: number;
  glovo: number;
  unspecified: number;
  orderCount: number;
  closedAt: number;
  closedByEmployee: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: '🆕 Nouveau',
  preparing: '🔥 En préparation',
  ready: '🔔 Prêt',
  served: '✓ Servi',
  cancelled: '✕ Annulé',
};

// Category groups for the item picker -- purely a display grouping so the
// "Petit-déjeuner / Plats / Boissons / Desserts" sections stay legible
// instead of ~18 category chips wrapping in a random-looking block. The
// underlying category ids/order in firebase.ts's initialCategories are
// untouched; this only decides how they're clustered on screen.
// "Boissons" listed first -- client feedback: les boissons chaudes sont les
// commandes les plus fréquentes, elles doivent être en haut de la liste.
// (Boissons Chaudes is already first within this group, see firebase.ts.)
const CATEGORY_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Boissons', ids: ['boissons_chaudes', 'boissons_fraiches', 'jus_cocktails'] },
  { label: 'Petit-déj', ids: ['breakfasts', 'omelettes', 'toasts', 'viennoiserie', 'crepes_sucrees', 'crepes_salees'] },
  { label: 'Plats', ids: ['pizzas', 'sandwiches', 'tacos', 'pasticcie', 'burgers', 'salades', 'pates'] },
  { label: 'Desserts', ids: ['desserts'] },
];

// One muted accent per group -- used for the active-category rail marker and
// the thin color strip on each item card, so a card is visually traceable
// back to its group at a glance instead of everything being the same
// brand-orange regardless of category.
const GROUP_COLOR: Record<string, string> = {
  'Petit-déj': '#D9A45C',
  Plats: '#C9A15A',
  Boissons: '#7FB3B0',
  Desserts: '#C98A9E',
  Autres: '#9A9490',
};

const SOURCE_STYLE: Record<OrderSource, { label: string; className: string }> = {
  site: { label: 'Site', className: 'bg-brand-orange/15 text-brand-orange border-brand-orange/40' },
  manual: { label: 'Comptoir', className: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  glovo: { label: 'Glovo', className: 'bg-teal-500/15 text-teal-300 border-teal-500/40' },
};

function kindOf(order: OrderDoc): OrderKind {
  if (order.orderType) return order.orderType;
  if (order.source === 'glovo') return 'glovo';
  if (order.tableNumber && order.tableNumber !== '?') return 'dine_in';
  if (order.address) return 'delivery';
  return 'takeaway';
}

function kindLabel(order: OrderDoc): string {
  const kind = kindOf(order);
  if (kind === 'dine_in') return `Table ${order.tableNumber}`;
  if (kind === 'delivery') return order.customerName ? `Livraison — ${order.customerName}` : 'Livraison';
  if (kind === 'glovo') return order.glovoRef ? `Glovo — ${order.glovoRef}` : 'Glovo';
  return order.customerName ? `À emporter — ${order.customerName}` : 'À emporter';
}

// Fusionne le menu de base (data.ts, complet : 3 langues, description,
// photo, variantes -- toujours la source pour le site client) avec les
// overrides Firestore (menuOverrides) que l'onglet Menu écrit : prix, nom
// (une seule langue, uniquement pour l'écran caisse), catégorie, station et
// actif/épuisé. Un article "isCustom" n'existe que dans Firestore (ajouté
// depuis l'écran Menu) et est ajouté à la fin. Le nom overridé remplace les
// 3 langues à l'identique -- volontairement : ça ne touche que ce que le
// personnel voit ici, jamais le site client (voir la note dans l'onglet
// Menu).
function buildMenu(overrides: Map<string, MenuOverride>): MenuItem[] {
  const merged = staticMenuItems.map((it) => {
    const o = overrides.get(it.id);
    if (!o) return it;
    return {
      ...it,
      name: o.name ? { fr: o.name, en: o.name, ar: o.name } : it.name,
      price: o.price ?? it.price,
      category: o.category ?? it.category,
      station: o.station ?? it.station,
      available: o.active === false ? false : it.available,
    };
  });
  const customs: MenuItem[] = [];
  overrides.forEach((o, id) => {
    if (!o.isCustom) return;
    const name = o.name || '(sans nom)';
    customs.push({
      id,
      name: { fr: name, en: name, ar: name },
      category: o.category || 'Autres',
      price: o.price || 0,
      station: o.station || 'Kitchen',
      available: o.active !== false,
      description: { fr: '', en: '', ar: '' },
      image: '',
    });
  });
  return [...merged, ...customs];
}

// Chiffre d'affaires, ventilé cash / carte / Glovo, pour un lot de commandes
// donné -- utilisé aussi bien pour le Rapport (période choisie) que pour les
// Rapports X/Z (toujours la journée civile en cours, quelle que soit la
// période sélectionnée dans l'onglet Rapports). Les commandes Glovo vont
// dans leur propre colonne quel que soit leur `paymentMethod` (Glovo paie le
// resto par facture, pas en cash/carte au comptoir) ; un paiement partagé
// (mixed) répartit son montant entre cash et carte via `paymentSplit`.
function computeStats(rangeOrders: OrderDoc[]) {
  const valid = rangeOrders.filter((o) => o.status !== 'cancelled');
  const paid = valid.filter((o) => o.paid);
  const revenue = paid.reduce((s, o) => s + o.total, 0);

  let cash = 0;
  let card = 0;
  let glovo = 0;
  let unspecified = 0;
  paid.forEach((o) => {
    if (kindOf(o) === 'glovo') {
      glovo += o.total;
    } else if (o.paymentMethod === 'cash') {
      cash += o.total;
    } else if (o.paymentMethod === 'card') {
      card += o.total;
    } else if (o.paymentMethod === 'mixed' && o.paymentSplit) {
      cash += o.paymentSplit.cash;
      card += o.paymentSplit.card;
    } else {
      unspecified += o.total;
    }
  });

  const cancelledCount = rangeOrders.length - valid.length;
  const unpaidCount = valid.filter((o) => !o.paid).length;

  const byType: Record<OrderKind, { count: number; revenue: number }> = {
    dine_in: { count: 0, revenue: 0 },
    takeaway: { count: 0, revenue: 0 },
    delivery: { count: 0, revenue: 0 },
    glovo: { count: 0, revenue: 0 },
  };
  valid.forEach((o) => {
    const k = kindOf(o);
    byType[k].count++;
    byType[k].revenue += o.total;
  });

  const itemMap = new Map<string, { qty: number; revenue: number }>();
  valid.forEach((o) =>
    o.items.forEach((it) => {
      const cur = itemMap.get(it.name) || { qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.lineTotal;
      itemMap.set(it.name, cur);
    })
  );
  const topItems = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Omzet per medewerker -- "Site" regroupe les commandes du site client
  // (jamais de caissier associé), "Inconnu" les vieilles commandes d'avant
  // l'ajout du login par employé.
  const employeeMap = new Map<string, { count: number; revenue: number }>();
  paid.forEach((o) => {
    const key = o.employeeName || (o.source === 'site' ? 'Site (en ligne)' : 'Inconnu');
    const cur = employeeMap.get(key) || { count: 0, revenue: 0 };
    cur.count++;
    cur.revenue += o.total;
    employeeMap.set(key, cur);
  });
  const byEmployee = Array.from(employeeMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // Omzet per uur van de dag (0-23), toutes dates confondues dans la
  // période -- sert à repérer les heures de pointe.
  const hourly = Array.from({ length: 24 }, () => 0);
  paid.forEach((o) => {
    const t = o.createdAt?.toMillis();
    if (!t) return;
    hourly[new Date(t).getHours()] += o.total;
  });

  return {
    revenue,
    cash,
    card,
    glovo,
    unspecified,
    orderCount: valid.length,
    avg: paid.length ? revenue / paid.length : 0,
    unpaidCount,
    cancelledCount,
    byType,
    topItems,
    byEmployee,
    hourly,
  };
}

function minutesSince(ts?: Timestamp): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 60000));
}

function elapsedStyle(mins: number): string {
  if (mins >= 15) return 'text-red-400';
  if (mins >= 6) return 'text-amber-400';
  return 'text-[#8FBF8A]';
}

function elapsedLabel(mins: number): string {
  return mins === 0 ? "à l'instant" : `il y a ${mins} min`;
}

// Short two-tone beep via the Web Audio API — no asset file to ship, no
// autoplay-policy issue since it only ever fires after the PIN unlock click.
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.32);
    });
  } catch {
    // Web Audio unsupported/blocked — silently skip, the visual flash still fires.
  }
}

function formatMAD(n: number): string {
  return `${n.toFixed(0)} MAD`;
}

// Format spécifique au reçu papier (virgule décimale + "DH", ex. "16,00 DH")
// -- reproduit le format de l'ancienne caisse de Dom's, pour que le nouveau
// reçu ait la même lecture pour l'équipe. Le reste de l'écran garde
// formatMAD ("16 MAD") partout ailleurs.
function formatReceiptPrice(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} DH`;
}

// Libellé du mode de paiement -- gère aussi "mixed" (paiement partagé
// cash+carte), utilisé partout où le mode de paiement d'une commande est
// affiché (carte commande, historique, reçu).
function paymentMethodLabel(order: OrderDoc): string {
  if (order.paymentMethod === 'cash') return 'cash';
  if (order.paymentMethod === 'card') return 'carte';
  if (order.paymentMethod === 'mixed' && order.paymentSplit) {
    return `cash ${formatMAD(order.paymentSplit.cash)} / carte ${formatMAD(order.paymentSplit.card)}`;
  }
  return '—';
}

// ---------------------------------------------------------------------------
// Bon printen -- dit scherm draait gewoon in een browser op een Windows pc,
// dus geen aparte printer-SDK: het bouwt een klein reçu als eigen HTML-
// document in een onzichtbare iframe en roept daarop print() aan. Dat opent
// het gewone Windows printdialoogvenster, waar de kassamedewerker de
// bonprinter kiest (of gewoon op "Afdrukken" drukt als die al standaard
// staat) -- exact zoals elk ander "afdrukken vanuit de browser" moment.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface ReceiptLine {
  name: string;
  quantity: number;
  lineTotal: number;
}

// Coordonnées fixes de l'établissement, imprimées sur chaque reçu --
// notamment l'ICE (identifiant fiscal marocain), qui doit être exact.
// Change ici si l'adresse/numéro/ICE changent un jour.
const RECEIPT_BUSINESS = {
  name: "DOM'S",
  addressLines: ['RUE JABAL AYACHI NR 26', '10090 RABAT'],
  phone: '0537680631',
  ice: '002504644000005',
};

function buildReceiptHTML(opts: {
  label: string;
  employeeName?: string;
  dateLine: string;
  items: ReceiptLine[];
  total: number;
  paidLine?: string;
  note?: string;
}): string {
  const itemRows = opts.items
    .map(
      (it) =>
        `<div class="row"><span>${it.quantity} ${escapeHtml(it.name.toUpperCase())}</span><span>${formatReceiptPrice(it.lineTotal)}</span></div>`
    )
    .join('');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Reçu</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: bold; color: #000; width: 74mm; margin: 0 auto; padding: 4px 0; }
  h1 { font-size: 24px; text-align: center; margin: 0 0 4px; letter-spacing: 1px; }
  .addr { text-align: center; font-size: 12px; margin-bottom: 6px; line-height: 1.6; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .label { font-size: 15px; }
  .server { font-size: 12px; margin-top: 2px; }
  .doctype { text-align: center; font-size: 12px; text-transform: uppercase; margin: 6px 0; }
  .cols { display: flex; justify-content: space-between; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 3px; }
  .row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; font-size: 13px; }
  .total-row { display: flex; justify-content: space-between; font-size: 18px; margin-top: 2px; }
  .note { border: 1px dashed #000; padding: 4px 6px; margin: 6px 0; }
  .date { text-align: center; font-size: 12px; margin-top: 8px; }
  .foot { text-align: center; margin-top: 8px; font-size: 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(RECEIPT_BUSINESS.name)}</h1>
  <div class="addr">
    ${RECEIPT_BUSINESS.addressLines.map(escapeHtml).join('<br/>')}<br/>
    TEL ${escapeHtml(RECEIPT_BUSINESS.phone)}<br/>
    ICE:${escapeHtml(RECEIPT_BUSINESS.ice)}
  </div>
  <div class="rule"></div>
  <div class="label">${escapeHtml(opts.label)}</div>
  ${opts.employeeName ? `<div class="server">Servi par: ${escapeHtml(opts.employeeName.toUpperCase())}</div>` : ''}
  <div class="rule"></div>
  <div class="doctype">Document provisoire</div>
  <div class="cols"><span>Qté Article</span><span>Prix total</span></div>
  ${itemRows}
  ${opts.note ? `<div class="note">📝 ${escapeHtml(opts.note)}</div>` : ''}
  <div class="rule"></div>
  <div class="total-row"><span>TOTAL</span><span>${formatReceiptPrice(opts.total)}</span></div>
  ${opts.paidLine ? `<div class="row"><span>Statut</span><span>${escapeHtml(opts.paidLine)}</span></div>` : ''}
  <div class="rule"></div>
  <div class="date">${escapeHtml(opts.dateLine)}</div>
  <div class="foot">Merci de votre visite, à bientôt...</div>
</body>
</html>`;
}

function printReceipt(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  // A short delay lets the iframe actually render the written document
  // before print() grabs its content -- calling print() immediately after
  // doc.close() sometimes fires on a still-blank document.
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 200);
}

// ---------------------------------------------------------------------------
// Ouvrir le tiroir-caisse -- le tiroir est câblé sur la caisse enregistreuse
// via le port RJ11/RJ12 de l'imprimante à reçus (pas un tiroir USB à part),
// et s'ouvre en envoyant à l'imprimante la commande ESC/POS "cash drawer
// kick" : ESC p 0 25 250. Confirmé avec Amar : l'imprimante est branchée en
// USB sur le PC caisse, donc ce commando part via WebUSB, directement depuis
// le navigateur.
//
// Deux limites réelles à connaître (WebUSB, pas spécifique à ce code) :
//  1. Chrome et Edge uniquement -- Firefox et Safari n'implémentent pas
//     WebUSB. Sur un PC Windows dédié à la caisse (comme ici), ce n'est
//     normalement pas un problème.
//  2. Windows attribue en général un pilote "USB Printing Support" à une
//     imprimante à reçus USB -- c'est ce pilote que le bouton "🖨️ Imprimer"
//     utilise déjà (impression via la boîte de dialogue du navigateur).
//     WebUSB ne peut prendre le contrôle d'une interface que Windows n'a pas
//     déjà accaparée : selon le modèle d'imprimante, ce bouton peut donc
//     échouer avec un message "Accès refusé" tant que ce pilote est actif.
//     La solution dans ce cas n'est pas de remplacer le pilote (ça casserait
//     l'impression normale des reçus) mais un petit programme-pont local
//     tournant sur ce PC -- à construire séparément si ce bouton échoue en
//     pratique. Teste-le d'abord : beaucoup d'imprimantes à reçus exposent
//     une interface USB générique que WebUSB peut utiliser sans conflit.
const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250

async function openCashDrawer(): Promise<{ ok: true } | { ok: false; message: string }> {
  const usb: any = (navigator as any).usb;
  if (!usb) {
    return { ok: false, message: "WebUSB non supporté par ce navigateur (Chrome ou Edge requis)." };
  }
  try {
    // Réutilise l'appareil déjà autorisé (un seul choix à faire au premier
    // clic) ; sinon ouvre le sélecteur USB du navigateur.
    let device = (await usb.getDevices())[0];
    if (!device) {
      device = await usb.requestDevice({ filters: [] });
    }
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    // Cherche la première interface avec un endpoint bulk OUT -- fonctionne
    // sans connaître à l'avance la marque/le modèle exact de l'imprimante.
    let ifaceNumber: number | null = null;
    let epOut: number | null = null;
    outer: for (const conf of device.configurations) {
      for (const iface of conf.interfaces) {
        for (const alt of iface.alternates) {
          const out = alt.endpoints.find((e: any) => e.direction === 'out');
          if (out) {
            ifaceNumber = iface.interfaceNumber;
            epOut = out.endpointNumber;
            break outer;
          }
        }
      }
    }
    if (ifaceNumber === null || epOut === null) {
      return { ok: false, message: 'Interface USB compatible introuvable sur cet appareil.' };
    }
    await device.claimInterface(ifaceNumber);
    await device.transferOut(epOut, DRAWER_KICK);
    await device.close();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Échec de l'ouverture du tiroir." };
  }
}

// ---------------------------------------------------------------------------
// Tickets Bar/Cuisine -- deux imprimantes distinctes, physiquement à la bar
// et en cuisine, mais toutes les deux en USB sur LE MÊME pc (confirmé avec
// Amar : 3 imprimantes en tout, une par poste -- comptoir/bar/cuisine --
// toutes en USB, bar+cuisine sur un seul pc entre les deux stations). Même
// approche WebUSB que le tiroir-caisse, mais avec DEUX permissions
// distinctes sur ce même navigateur au lieu d'une seule : "Connecter" pour
// Bar et pour Cuisine sont deux boutons séparés, chacun mémorisant à quel
// appareil USB il correspond (STATION_PRINTER_KEY) pour le retrouver au
// prochain chargement de la page sans redemander la permission.
//
// Limite réelle à connaître : si les deux imprimantes sont exactement le
// même modèle ET qu'il n'expose pas de numéro de série via USB (fréquent
// sur les imprimantes à reçus bon marché), le navigateur ne peut pas les
// distinguer de façon fiable après un rechargement de page -- elles
// resteront bien connectées à DEUX appareils différents (jamais les deux
// tickets sur une seule imprimante), mais laquelle est "Bar" et laquelle
// est "Cuisine" peut s'inverser après un redémarrage du navigateur. D'où le
// bouton "Test" à côté de chaque imprimante une fois connectée : à utiliser
// après chaque redémarrage du pc/navigateur pour vérifier que le bon ticket
// part au bon endroit, et reconnecter si besoin.
//
// Encodage volontairement simplifié : accents retirés (stripAccents) avant
// envoi. Une imprimante ESC/POS a besoin qu'on lui dise quelle page de code
// utiliser pour afficher les caractères accentués correctement, et ça varie
// selon le modèle -- plutôt que de deviner et risquer des caractères
// bizarres sur le ticket, le texte part en ASCII simple, toujours lisible
// quel que soit le modèle exact.
const STATION_PRINTERS = ['Bar', 'Kitchen'] as const;
type StationPrinter = (typeof STATION_PRINTERS)[number];

function stationPrinterKey(station: string): string {
  return `domscafe_station_printer_${station}`;
}

function stationPrinterLabel(station: string): string {
  return station === 'Bar' ? 'Bar' : 'Cuisine';
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function textToBytes(s: string): number[] {
  return Array.from(stripAccents(s)).map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 256 ? code : 0x3f; // '?' de secours pour le reste (emojis, arabe, ...)
  });
}

function buildKitchenTicketBytes(opts: {
  station: string;
  label: string;
  time: string;
  items: { quantity: number; name: string }[];
  note?: string;
}): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const bytes: number[] = [];
  const raw = (arr: number[]) => bytes.push(...arr);
  const line = (s: string = '') => {
    raw(textToBytes(s));
    bytes.push(0x0a);
  };
  raw([ESC, 0x40]); // init
  raw([ESC, 0x61, 0x01]); // centré
  raw([GS, 0x21, 0x11]); // double hauteur/largeur
  line(opts.station === 'Bar' ? 'BAR' : 'CUISINE');
  raw([GS, 0x21, 0x00]); // taille normale
  line('================================');
  raw([ESC, 0x61, 0x00]); // aligné à gauche
  raw([ESC, 0x45, 0x01]); // gras on
  line(opts.label);
  raw([ESC, 0x45, 0x00]); // gras off
  line(opts.time);
  line('--------------------------------');
  raw([GS, 0x21, 0x11]);
  opts.items.forEach((it) => line(`${it.quantity}x ${it.name}`));
  raw([GS, 0x21, 0x00]);
  if (opts.note) {
    line('--------------------------------');
    raw([ESC, 0x45, 0x01]);
    line(`NOTE: ${opts.note}`);
    raw([ESC, 0x45, 0x00]);
  }
  line('================================');
  line();
  line();
  raw([GS, 0x56, 0x00]); // coupe complète
  return new Uint8Array(bytes);
}

// Retrouve, parmi les appareils USB déjà autorisés sur ce navigateur, lequel
// correspond à quelle station -- via l'empreinte (vendorId/productId/
// serialNumber) mémorisée au moment du "Connecter". `claimed` empêche que
// deux stations sans numéro de série et du même modèle ne pointent par
// erreur vers le MÊME appareil physique : chaque device ne peut être
// attribué qu'une fois par résolution, même si l'ordre exact peut varier
// après un redémarrage (voir la note au-dessus).
async function resolveStationPrinters(): Promise<Map<string, any>> {
  const usb: any = (navigator as any).usb;
  const result = new Map<string, any>();
  if (!usb) return result;
  const devices: any[] = await usb.getDevices();
  const claimed = new Set<any>();
  for (const station of STATION_PRINTERS) {
    const raw = localStorage.getItem(stationPrinterKey(station));
    if (!raw) continue;
    let fp: { vendorId: number; productId: number; serialNumber: string | null };
    try {
      fp = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = devices.filter((d) => d.vendorId === fp.vendorId && d.productId === fp.productId && !claimed.has(d));
    const match = (fp.serialNumber ? candidates.find((d) => d.serialNumber === fp.serialNumber) : undefined) || candidates[0];
    if (match) {
      result.set(station, match);
      claimed.add(match);
    }
  }
  return result;
}

async function sendToStationPrinter(station: string, bytes: Uint8Array): Promise<{ ok: true } | { ok: false; message: string }> {
  const usb: any = (navigator as any).usb;
  if (!usb) return { ok: false, message: 'WebUSB non supporté par ce navigateur (Chrome ou Edge requis).' };
  try {
    const printers = await resolveStationPrinters();
    const device = printers.get(station);
    if (!device) return { ok: false, message: `Aucune imprimante ${stationPrinterLabel(station)} connectée sur cet appareil.` };
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    let ifaceNumber: number | null = null;
    let epOut: number | null = null;
    outer: for (const conf of device.configurations) {
      for (const iface of conf.interfaces) {
        for (const alt of iface.alternates) {
          const out = alt.endpoints.find((e: any) => e.direction === 'out');
          if (out) {
            ifaceNumber = iface.interfaceNumber;
            epOut = out.endpointNumber;
            break outer;
          }
        }
      }
    }
    if (ifaceNumber === null || epOut === null) {
      return { ok: false, message: 'Interface USB compatible introuvable sur cet appareil.' };
    }
    await device.claimInterface(ifaceNumber);
    await device.transferOut(epOut, bytes);
    await device.close();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || `Échec de l'impression sur l'imprimante ${stationPrinterLabel(station)}.` };
  }
}

async function connectStationPrinter(station: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const usb: any = (navigator as any).usb;
  if (!usb) return { ok: false, message: 'WebUSB non supporté par ce navigateur (Chrome ou Edge requis).' };
  try {
    const device = await usb.requestDevice({ filters: [] });
    localStorage.setItem(
      stationPrinterKey(station),
      JSON.stringify({ vendorId: device.vendorId, productId: device.productId, serialNumber: device.serialNumber || null })
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Connexion annulée.' };
  }
}

// N'imprime que les items passés (l'appelant se charge de ne passer que
// ceux pas encore envoyés), un ticket séparé par station envoyé à
// l'imprimante de CETTE station -- si une commande a 2 cafés (Bar) et une
// pizza (Kitchen), le ticket bar part sur l'imprimante bar et le ticket
// cuisine sur l'imprimante cuisine.
async function printKitchenTicketForOrder(order: OrderDoc, newItems: OrderItem[]): Promise<void> {
  const byStation = new Map<string, OrderItem[]>();
  newItems.forEach((it) => {
    const st = it.station || 'Kitchen';
    if (!byStation.has(st)) byStation.set(st, []);
    byStation.get(st)!.push(it);
  });
  const time = order.createdAt
    ? order.createdAt.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  for (const [station, its] of byStation) {
    const bytes = buildKitchenTicketBytes({ station, label: kindLabel(order), time, items: its, note: order.note });
    const res = await sendToStationPrinter(station, bytes);
    if (res.ok === false) throw new Error(res.message);
  }
}

function receiptDateLine(ms?: number): string {
  const d = ms ? new Date(ms) : new Date();
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function printOrderReceipt(order: OrderDoc) {
  printReceipt(
    buildReceiptHTML({
      label: kindLabel(order),
      employeeName: order.employeeName,
      dateLine: receiptDateLine(order.createdAt?.toMillis()),
      items: order.items,
      total: order.total,
      paidLine: order.paid ? `Payé${order.paymentMethod ? ` (${paymentMethodLabel(order)})` : ''}` : 'Non payé',
      note: order.note,
    })
  );
}

function printTableReceipt(table: string, orders: OrderDoc[]) {
  const items = orders.flatMap((o) => o.items);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const allPaid = orders.length > 0 && orders.every((o) => o.paid);
  const notes = orders.map((o) => o.note).filter((n): n is string => !!n);
  // Une table peut accumuler plusieurs commandes (ajouts successifs) avec
  // des employés différents -- affiche le dernier employé à y avoir touché
  // plutôt qu'un mélange, faute de mieux sans notion de "serveur de table".
  const employeeName = orders.length > 0 ? orders[orders.length - 1].employeeName : undefined;
  printReceipt(
    buildReceiptHTML({
      label: `Table ${table}`,
      employeeName,
      dateLine: receiptDateLine(),
      items,
      total,
      paidLine: allPaid ? 'Payé' : 'Non payé',
      note: notes.length > 0 ? notes.join(' / ') : undefined,
    })
  );
}

// ---------------------------------------------------------------------------

function EmployeeLoginGate({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    const match = EMPLOYEES.find((e) => e.pin === value);
    if (match) {
      sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(match));
      onLogin(match);
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark bg-grid-pattern flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-8 text-center animate-pop">
        <img src="/logo.webp" alt="Dom's Café" className="h-16 w-auto mx-auto mb-3 object-contain" />
        <h1 className="font-display font-black text-3xl text-[#F3ECDD] mb-1 tracking-wide">DOM'S CAFÉ</h1>
        <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-6">Écran commandes — code personnel</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setError(false);
            setValue(e.target.value.replace(/\D/g, ''));
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full text-center tracking-[0.5em] text-2xl bg-black/30 border border-[#F3ECDD]/20 rounded-xl py-3 text-[#F3ECDD] focus:outline-none focus:border-brand-orange focus:shadow-[0_0_0_3px_rgba(201,161,90,0.25)] transition-all mb-3"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-xs mb-3 animate-pop">Code incorrect.</p>}
        <button
          onClick={submit}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all"
        >
          Déverrouiller
        </button>
      </div>
      <p className="text-[#5a5148] text-[10px] mt-6 tracking-wide">Développé par Amplify Growth Studio</p>
    </div>
  );
}

// Écran de verrouillage après inactivité (IDLE_LOCK_MS) -- overlay par-dessus
// l'écran actuel (contrairement à EmployeeLoginGate qui remplace tout au
// premier login) : l'état de la page (onglet ouvert, commandes...) reste
// intact pendant le verrouillage, seul l'écran est masqué derrière.
function IdleLockOverlay({ currentEmployee, onUnlock }: { currentEmployee: Employee | null; onUnlock: (employee: Employee) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    const match = EMPLOYEES.find((e) => e.pin === value);
    if (match) {
      sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(match));
      onUnlock(match);
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[90] flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-8 text-center animate-pop">
        <p className="text-4xl mb-2">🔒</p>
        <h1 className="font-display font-black text-2xl text-[#F3ECDD] mb-1 tracking-wide">Écran verrouillé</h1>
        <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-6">
          {currentEmployee ? `Inactivité — code de ${currentEmployee.name} ou d'un collègue` : 'Code personnel pour continuer'}
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setError(false);
            setValue(e.target.value.replace(/\D/g, ''));
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full text-center tracking-[0.5em] text-2xl bg-black/30 border border-[#F3ECDD]/20 rounded-xl py-3 text-[#F3ECDD] focus:outline-none focus:border-brand-orange focus:shadow-[0_0_0_3px_rgba(201,161,90,0.25)] transition-all mb-3"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-xs mb-3 animate-pop">Code incorrect.</p>}
        <button
          onClick={submit}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all"
        >
          Déverrouiller
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Manager-PIN invoerscherm -- kort schermpje dat vóór een gevoelige actie
// verschijnt (order annuleren nadat hij al in de keuken staat, een artikel
// uit een lopende order verwijderen, een korting toepassen). Zelfde
// opmaak als PinGate hierboven, maar als overlay-modal in plaats van een
// volledig scherm, en met een "Annuler" knop om de actie af te breken.
function ManagerPinModal({ onResult }: { onResult: (ok: boolean) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === MANAGER_PIN) {
      onResult(true);
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-xs pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 text-center animate-pop">
        <p className="text-2xl mb-1">🔒</p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1">Code manager requis</h3>
        <p className="text-[#9A9490] text-xs mb-5">Cette action nécessite une autorisation.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setError(false);
            setValue(e.target.value.replace(/\D/g, ''));
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full text-center tracking-[0.5em] text-2xl bg-black/30 border border-[#F3ECDD]/20 rounded-xl py-3 text-[#F3ECDD] focus:outline-none focus:border-brand-orange focus:shadow-[0_0_0_3px_rgba(201,161,90,0.25)] transition-all mb-3"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-xs mb-3 animate-pop">Code incorrect.</p>}
        <button
          onClick={submit}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          Confirmer
        </button>
        <button onClick={() => onResult(false)} className="text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rapports X et Z -- toujours basés sur la journée civile en cours (00h00 ->
// maintenant), pas sur une session de caisse ouverte/fermée : le "kassa
// tellen" (comptage du tiroir à l'ouverture/fermeture) reste hors scope pour
// l'instant. Le rapport X est un instantané qui ne modifie rien et peut être
// consulté à tout moment ; le rapport Z clôture la journée dans
// dailyClosures/{date} après confirmation (code manager) et fige les
// chiffres à cet instant.

function buildReportReceiptHTML(opts: { title: string; lines: [string, string][]; footer?: string }): string {
  const rows = opts.lines
    .map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`)
    .join('');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; width: 74mm; margin: 0 auto; padding: 4px 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; letter-spacing: 0.5px; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 8px; line-height: 1.5; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 10px; padding: 1.5px 0; }
  .foot { text-align: center; margin-top: 12px; font-size: 11px; }
</style>
</head>
<body>
  <h1>DOM'S CAFÉ</h1>
  <div class="meta">${escapeHtml(opts.title)}<br/>${escapeHtml(new Date().toLocaleString('fr-FR'))}</div>
  <div class="rule"></div>
  ${rows}
  ${opts.footer ? `<div class="rule"></div><div class="foot">${escapeHtml(opts.footer)}</div>` : ''}
</body>
</html>`;
}

function XReportModal({ stats, onClose }: { stats: ReturnType<typeof computeStats>; onClose: () => void }) {
  const print = () =>
    printReceipt(
      buildReportReceiptHTML({
        title: 'RAPPORT X (en cours)',
        lines: [
          ['Chiffre d’affaires', formatMAD(stats.revenue)],
          ['Cash', formatMAD(stats.cash)],
          ['Carte', formatMAD(stats.card)],
          ['Glovo', formatMAD(stats.glovo)],
          ...(stats.unspecified > 0 ? ([['Non précisé', formatMAD(stats.unspecified)]] as [string, string][]) : []),
          ['Commandes', String(stats.orderCount)],
          ['Panier moyen', formatMAD(stats.avg)],
        ],
        footer: 'Aperçu -- ne clôture rien.',
      })
    );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <p className="text-2xl mb-1 text-center">📊</p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Rapport X</h3>
        <p className="text-[#9A9490] text-xs mb-5 text-center">
          Aperçu de la journée en cours depuis 00h00 -- consultable à tout moment, ne réinitialise rien.
        </p>
        <div className="space-y-1.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-[#9A9490]">Chiffre d'affaires</span><span className="font-bold text-brand-orange">{formatMAD(stats.revenue)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">💵 Cash</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.cash)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">💳 Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.card)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">🛵 Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.glovo)}</span></div>
          {stats.unspecified > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.unspecified)}</span></div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-[#F3ECDD]/10"><span className="text-[#9A9490]">Commandes</span><span className="font-bold text-[#F3ECDD]">{stats.orderCount}</span></div>
        </div>
        <button
          onClick={print}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          🖨️ Imprimer
        </button>
        <button onClick={onClose} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Fermer
        </button>
      </div>
    </div>
  );
}

function ZReportModal({
  stats,
  closure,
  onClose,
  onConfirmClose,
}: {
  stats: ReturnType<typeof computeStats>;
  closure: DailyClosure | null;
  onClose: () => void;
  onConfirmClose: () => void;
}) {
  const display = closure
    ? { revenue: closure.revenue, cash: closure.cash, card: closure.card, glovo: closure.glovo, unspecified: closure.unspecified, orderCount: closure.orderCount }
    : stats;

  const print = () =>
    printReceipt(
      buildReportReceiptHTML({
        title: closure ? 'RAPPORT Z (clôturé)' : 'RAPPORT Z',
        lines: [
          ['Chiffre d’affaires', formatMAD(display.revenue)],
          ['Cash', formatMAD(display.cash)],
          ['Carte', formatMAD(display.card)],
          ['Glovo', formatMAD(display.glovo)],
          ...(display.unspecified > 0 ? ([['Non précisé', formatMAD(display.unspecified)]] as [string, string][]) : []),
          ['Commandes', String(display.orderCount)],
        ],
        footer: closure
          ? `Clôturé le ${new Date(closure.closedAt).toLocaleString('fr-FR')} par ${closure.closedByEmployee}`
          : undefined,
      })
    );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <p className="text-2xl mb-1 text-center">🔒</p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Rapport Z -- clôture du jour</h3>
        {closure ? (
          <p className="text-[#8FBF8A] text-xs mb-5 text-center font-bold">
            Journée déjà clôturée le {new Date(closure.closedAt).toLocaleString('fr-FR')} par {closure.closedByEmployee}.
          </p>
        ) : (
          <p className="text-[#9A9490] text-xs mb-5 text-center">
            Clôture la journée en cours et fige les chiffres ci-dessous. Nécessite le code manager. Cette action ne peut pas être annulée.
          </p>
        )}
        <div className="space-y-1.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-[#9A9490]">Chiffre d'affaires</span><span className="font-bold text-brand-orange">{formatMAD(display.revenue)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">💵 Cash</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.cash)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">💳 Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.card)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490]">🛵 Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.glovo)}</span></div>
          {display.unspecified > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.unspecified)}</span></div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-[#F3ECDD]/10"><span className="text-[#9A9490]">Commandes</span><span className="font-bold text-[#F3ECDD]">{display.orderCount}</span></div>
        </div>
        <button
          onClick={print}
          className="w-full bg-[#3a332b] hover:bg-[#463e34] active:scale-[0.98] text-[#F3ECDD] font-display font-black py-3 rounded-xl transition-all mb-2"
        >
          🖨️ Imprimer
        </button>
        {!closure && (
          <button
            onClick={onConfirmClose}
            className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2"
          >
            Confirmer la clôture
          </button>
        )}
        <button onClick={onClose} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Fermer
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu -- édition/ajout limité au prix, nom (une langue), catégorie, station
// et actif/épuisé (voir buildMenu() plus haut pour ce que ça touche
// vraiment). `item` null = création d'un nouvel article ; `onDelete` absent
// = pas de bouton (rien à réinitialiser/supprimer pour cet article).

const MENU_INPUT_CLASS =
  'w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange';

function MenuItemEditModal({
  item,
  isCustom,
  onSave,
  onDelete,
  onClose,
}: {
  item: MenuItem | null;
  isCustom: boolean;
  onSave: (patch: { name: string; price: number; category: string; station: string; active: boolean }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const categories = useMemo(() => initialCategories.filter((c) => c.id !== 'all'), []);
  const [name, setName] = useState(item?.name.fr || '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [category, setCategory] = useState(item?.category || categories[0]?.id || '');
  const [station, setStation] = useState(item?.station || 'Kitchen');
  const [active, setActive] = useState(item?.available !== false);

  const priceNum = parseFloat(price.replace(',', '.'));
  const valid = name.trim().length > 0 && isFinite(priceNum) && priceNum >= 0 && !!category;

  const submit = () => {
    if (!valid) return;
    onSave({ name: name.trim(), price: priceNum, category, station, active });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-4 text-center">
          {item ? "Modifier l'article" : 'Nouvel article'}
        </h3>
        <div className="space-y-3 mb-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className={MENU_INPUT_CLASS} autoFocus />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Prix (MAD)"
            className={MENU_INPUT_CLASS}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={MENU_INPUT_CLASS}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.fr}
              </option>
            ))}
          </select>
          <select value={station} onChange={(e) => setStation(e.target.value)} className={MENU_INPUT_CLASS}>
            <option value="Kitchen">Cuisine</option>
            <option value="Bar">Bar</option>
          </select>
          <button
            onClick={() => setActive((a) => !a)}
            className={`w-full px-3 py-2.5 rounded-lg text-sm font-bold border transition-all ${
              active ? 'border-[#8FBF8A]/40 text-[#8FBF8A]' : 'border-red-500/40 text-red-400'
            }`}
          >
            {active ? '✓ Actif' : '✗ Épuisé / masqué'}
          </button>
        </div>
        <button
          onClick={submit}
          disabled={!valid}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          Enregistrer
        </button>
        {onDelete && (
          <button onClick={onDelete} className="w-full text-red-400/80 hover:text-red-400 text-sm font-bold py-2 mb-1 transition-colors">
            {isCustom ? '🗑️ Supprimer' : '↺ Réinitialiser (valeurs du code)'}
          </button>
        )}
        <button onClick={onClose} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

function TvSlideEditModal({
  slide,
  onSave,
  onDelete,
  onClose,
}: {
  slide: TvSlide | null;
  onSave: (patch: { title: string; subtitle?: string; price?: number; imageUrl?: string; active: boolean }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(slide?.title || '');
  const [subtitle, setSubtitle] = useState(slide?.subtitle || '');
  const [price, setPrice] = useState(slide?.price !== undefined ? String(slide.price) : '');
  const [active, setActive] = useState(slide?.active !== false);
  const [imageUrl, setImageUrl] = useState(slide?.imageUrl || '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const priceTrim = price.trim();
  const priceNum = priceTrim ? parseFloat(priceTrim.replace(',', '.')) : undefined;
  const valid = title.trim().length > 0 && (priceNum === undefined || isFinite(priceNum)) && !uploading;

  const submit = () => {
    if (!valid) return;
    onSave({
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      price: priceNum,
      imageUrl: imageUrl || undefined,
      active,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier une deuxième fois
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadTvSlideImage(file);
      setImageUrl(url);
    } catch (err) {
      console.error('TV slide image upload failed:', err);
      setUploadError("Échec de l'envoi de la photo -- vérifie ta connexion et réessaie.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-4 text-center">
          {slide ? 'Modifier le slide' : 'Nouveau slide'}
        </h3>
        <div className="space-y-3 mb-5">
          {/* Photo -- mode d'affichage principal : si présente, tv.html
              affiche l'image plein cadre au lieu du texte (voir TvApp.tsx). */}
          <div>
            {imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-[#F3ECDD]/15 mb-2">
                <img src={imageUrl} alt="" className="w-full h-36 object-cover" />
                <button
                  onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-[#F3ECDD] text-sm font-bold flex items-center justify-center hover:bg-black/90 transition-all"
                  title="Retirer la photo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                className={`flex flex-col items-center justify-center gap-1.5 w-full h-24 rounded-lg border border-dashed cursor-pointer transition-all ${
                  uploading
                    ? 'border-[#F3ECDD]/20 text-[#7A736C]'
                    : 'border-[#F3ECDD]/25 text-[#9A9490] hover:border-brand-orange/50 hover:text-brand-orange'
                }`}
              >
                <span className="text-xl">{uploading ? '⏳' : '📷'}</span>
                <span className="text-xs font-bold">{uploading ? 'Envoi en cours…' : 'Ajouter une photo'}</span>
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFileChange} />
              </label>
            )}
            {uploadError && <p className="text-xs text-red-400 mt-1.5">{uploadError}</p>}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (nom interne, pas affiché si photo)"
            className={MENU_INPUT_CLASS}
            autoFocus={!slide}
          />
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Sous-titre affiché en légende (optionnel)"
            className={MENU_INPUT_CLASS}
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Prix affiché (optionnel, MAD)"
            className={MENU_INPUT_CLASS}
          />
          <button
            onClick={() => setActive((a) => !a)}
            className={`w-full px-3 py-2.5 rounded-lg text-sm font-bold border transition-all ${
              active ? 'border-[#8FBF8A]/40 text-[#8FBF8A]' : 'border-red-500/40 text-red-400'
            }`}
          >
            {active ? '✓ En rotation sur la TV' : '✗ En pause (masqué)'}
          </button>
        </div>
        <button
          onClick={submit}
          disabled={!valid}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          {uploading ? 'Envoi de la photo…' : 'Enregistrer'}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="w-full text-red-400/80 hover:text-red-400 text-sm font-bold py-2 mb-1 transition-colors">
            🗑️ Supprimer
          </button>
        )}
        <button onClick={onClose} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type PaymentChoice = { method: 'cash' | 'card' } | { method: 'mixed'; cash: number; card: number };

function PaymentMethodModal({
  label,
  total,
  onChoose,
  onCancel,
}: {
  label: string;
  total: number;
  onChoose: (payment: PaymentChoice) => void;
  onCancel: () => void;
}) {
  // "Paiement partagé" -- masqué par défaut derrière un lien, pour ne pas
  // alourdir le cas courant (un seul mode, un seul tap). Une fois ouvert,
  // le champ carte se déduit automatiquement du champ cash (et vice versa)
  // pour toujours totaliser `total` sans calcul mental côté caissier.
  const [splitting, setSplitting] = useState(false);
  const [cashPart, setCashPart] = useState(total);

  const cardPart = Math.max(0, Math.round((total - cashPart) * 100) / 100);
  const splitValid = cashPart >= 0 && cashPart <= total;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 text-center animate-pop">
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1">{label}</h3>
        <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Mode de paiement ?</p>
        <p className="font-display font-black text-2xl text-brand-orange mb-5">{formatMAD(total)}</p>

        {!splitting ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                onClick={() => onChoose({ method: 'cash' })}
                className="py-5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.96] text-[#1A1208] font-display font-black text-lg shadow-lg shadow-brand-orange/20 transition-all"
              >
                💵 Cash
              </button>
              <button
                onClick={() => onChoose({ method: 'card' })}
                className="py-5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.96] text-[#1A1208] font-display font-black text-lg shadow-lg shadow-brand-orange/20 transition-all"
              >
                💳 Carte
              </button>
            </div>
            <button
              onClick={() => setSplitting(true)}
              className="text-[#9A9490] text-xs font-bold hover:text-[#F3ECDD] underline underline-offset-2 transition-colors mb-4"
            >
              Paiement partagé (cash + carte)
            </button>
          </>
        ) : (
          <div className="mb-4 text-start">
            <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Cash (MAD)</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={total}
              step="0.01"
              value={cashPart}
              onChange={(e) => setCashPart(Math.max(0, Math.min(total, parseFloat(e.target.value) || 0)))}
              className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 mb-3 text-base text-[#F3ECDD] focus:outline-none focus:border-brand-orange transition-shadow"
            />
            <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Carte (MAD) — calculé automatiquement</label>
            <div className="w-full bg-black/20 border border-[#F3ECDD]/10 rounded-lg px-3 py-2.5 mb-4 text-base text-[#9A9490]">
              {formatMAD(cardPart)}
            </div>
            <button
              onClick={() => splitValid && onChoose({ method: 'mixed', cash: cashPart, card: cardPart })}
              disabled={!splitValid}
              className="w-full py-3.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black shadow-lg shadow-brand-orange/20 transition-all mb-2"
            >
              Confirmer le paiement partagé
            </button>
            <button onClick={() => setSplitting(false)} className="text-[#9A9490] text-xs font-bold hover:text-[#F3ECDD] underline underline-offset-2 transition-colors mb-2">
              Retour
            </button>
          </div>
        )}

        <button onClick={onCancel} className="text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OrderCard({
  order,
  onAdvance,
  onTogglePaid,
  onCancel,
  onDelete,
  onEditNote,
  onRemoveItem,
  onApplyDiscount,
}: {
  order: OrderDoc;
  onAdvance: (order: OrderDoc) => void | Promise<void>;
  onTogglePaid: (order: OrderDoc) => void | Promise<void>;
  onCancel: (order: OrderDoc) => void | Promise<void>;
  onDelete: (order: OrderDoc) => void | Promise<void>;
  onEditNote: (order: OrderDoc) => void | Promise<void>;
  onRemoveItem: (order: OrderDoc, index: number) => void | Promise<void>;
  onApplyDiscount: (order: OrderDoc) => void | Promise<void>;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const mins = minutesSince(order.createdAt);
  const status = order.status || 'new';
  const source = order.source || 'site';
  const nextLabel = status === 'new' ? 'Démarrer' : status === 'preparing' ? 'Prêt' : status === 'ready' ? 'Servi' : null;

  return (
    <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4 flex flex-col gap-3 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display font-bold text-[#F3ECDD] text-lg leading-tight">{kindLabel(order)}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${SOURCE_STYLE[source].className}`}>
              {SOURCE_STYLE[source].label}
            </span>
            <span className={`text-xs font-bold ${elapsedStyle(mins)}`}>{elapsedLabel(mins)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEditNote(order)}
            title={order.note ? 'Modifier la remarque' : 'Ajouter une remarque'}
            className={`text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              order.note ? 'text-brand-orange hover:text-brand-orange-hover hover:bg-brand-orange/10' : 'text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5'
            }`}
          >
            📝
          </button>
          <button
            onClick={() => onApplyDiscount(order)}
            title="Appliquer une remise (code manager)"
            className={`text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              order.discount ? 'text-brand-orange hover:text-brand-orange-hover hover:bg-brand-orange/10' : 'text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5'
            }`}
          >
            🏷️
          </button>
          <button
            onClick={() => printOrderReceipt(order)}
            title="Imprimer le reçu"
            className="text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5 text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            🖨️
          </button>
          <button
            onClick={() => onCancel(order)}
            title="Annuler la commande"
            className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-xs w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            ✕
          </button>
          <button
            onClick={() => onDelete(order)}
            title="Supprimer définitivement (serveur inclus)"
            className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            🗑️
          </button>
        </div>
      </div>

      {order.note && (
        <div className="bg-brand-orange/10 border border-brand-orange/25 rounded-lg px-3 py-2 flex items-start gap-2">
          <span className="text-sm shrink-0">📝</span>
          <p className="text-sm text-brand-orange font-medium leading-snug">{order.note}</p>
        </div>
      )}

      <div className="border-t border-[#F3ECDD]/10 pt-2 space-y-1">
        {order.items.map((it, idx) => (
          <div key={idx} className="flex justify-between items-start gap-1.5 text-sm text-[#E3DCCB] group">
            <span>
              <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
              {it.note && <span className="block text-[11px] text-[#9A9490] italic">{it.note}</span>}
            </span>
            <span className="flex items-center gap-1.5 shrink-0 ps-2">
              <span className="text-[#9A9490]">{formatMAD(it.lineTotal)}</span>
              <button
                onClick={() => onRemoveItem(order, idx)}
                title="Retirer cet article (code manager)"
                className="text-[#5a5148] hover:text-red-400 text-xs w-4 h-4 rounded-full flex items-center justify-center transition-colors"
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>

      {!!order.discount && (
        <div className="flex justify-between text-xs text-brand-orange font-bold -mt-1">
          <span>🏷️ Remise appliquée</span>
          <span>-{formatMAD(order.discount)}</span>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[#F3ECDD]/10 pt-2.5">
        <span className="font-display font-black text-brand-orange text-xl">{formatMAD(order.total)}</span>
        <button
          onClick={() => onTogglePaid(order)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
            order.paid
              ? 'bg-[#8FBF8A]/15 text-[#8FBF8A] border-[#8FBF8A]/40'
              : 'bg-transparent text-[#9A9490] border-[#F3ECDD]/20 hover:border-[#F3ECDD]/40'
          }`}
        >
          {order.paid ? `✓ Payé${order.paymentMethod ? ` (${paymentMethodLabel(order)})` : ''}` : 'Marquer payé'}
        </button>
      </div>

      {nextLabel && (
        <button
          onClick={() => onAdvance(order)}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-2.5 rounded-lg shadow-md shadow-brand-orange/10 transition-all"
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DraftLine {
  name: string;
  unitPrice: number;
  quantity: number;
  station?: string;
}

// Shared menu grid + cart, reused by the "+ Emporter / Livraison / Glovo"
// panel and by the per-table "Ajouter des articles" panel. Bigger tap
// targets throughout (point 3 of the requested improvements) — this runs on
// a tablet behind the counter, not a mouse-driven desktop.
function MenuGrid({
  menuItems,
  draft,
  onAdd,
  onChangeQty,
}: {
  menuItems: MenuItem[];
  draft: DraftLine[];
  onAdd: (name: string, unitPrice: number, station?: string) => void;
  onChangeQty: (idx: number, delta: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const categories = useMemo(() => initialCategories.filter((c) => c.id !== 'all'), []);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // Group the flat category list into labeled rows (point requested
  // separately: "categorien niet mooi gerangschikt") -- any category id not
  // covered by CATEGORY_GROUPS still renders, in a trailing "Autres" row, so
  // a future menu addition never silently disappears from the picker.
  const groupedRows = useMemo(() => {
    const used = new Set<string>();
    const rows = CATEGORY_GROUPS.map((g) => {
      const cats = g.ids.map((id) => categoryById.get(id)).filter((c): c is typeof categories[number] => !!c);
      cats.forEach((c) => used.add(c.id));
      return { label: g.label, cats };
    }).filter((r) => r.cats.length > 0);
    const rest = categories.filter((c) => !used.has(c.id));
    if (rest.length > 0) rows.push({ label: 'Autres', cats: rest });
    return rows;
  }, [categories, categoryById]);

  // Which group a category belongs to, for the item card's color strip --
  // built off groupedRows so it always matches what the rail actually shows.
  const groupLabelByCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    groupedRows.forEach((row) => row.cats.forEach((c) => map.set(c.id, row.label)));
    return map;
  }, [groupedRows]);

  const availableItems = useMemo(() => menuItems.filter((it) => it.available !== false), [menuItems]);
  // Item counts per category, off the full menu (not the current search) --
  // a stable reference number next to each category in the rail, not one
  // that jumps around as staff type into the search box.
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    availableItems.forEach((it) => map.set(it.category, (map.get(it.category) || 0) + 1));
    return map;
  }, [availableItems]);

  const items = useMemo(() => {
    const bySearch = search.trim()
      ? availableItems.filter((it) => (it.name.fr + ' ' + it.name.en).toLowerCase().includes(search.toLowerCase()))
      : availableItems;
    return activeCategory === 'all' ? bySearch : bySearch.filter((it) => it.category === activeCategory);
  }, [availableItems, search, activeCategory]);

  const total = draft.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  const handleAdd = (id: string, name: string, unitPrice: number, station?: string) => {
    onAdd(name, unitPrice, station);
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 320);
  };

  // "Montant libre" -- pour le rare cas qui n'a pas d'article dédié (un
  // service ponctuel, un dépannage, un arrangement spécial). Deux prompts au
  // lieu d'un mini-formulaire dédié : cohérent avec le reste de l'écran
  // (editNote fait pareil) et largement suffisant pour un cas qui, par
  // définition, "ne se présentera pas souvent".
  const handleAddCustomAmount = () => {
    const label = window.prompt('Description de cet article :', '');
    if (label === null || !label.trim()) return;
    const raw = window.prompt(`Montant pour « ${label.trim()} » (MAD) :`, '');
    if (raw === null) return;
    const price = parseFloat(raw.replace(',', '.'));
    if (!isFinite(price) || price <= 0) return;
    handleAdd(`custom-${Date.now()}`, label.trim(), price);
  };

  return (
    <div className="flex-1 overflow-y-auto flex min-h-0">
      {/* Category rail -- vertical, grouped, one line each. Replaces the old
          horizontal wrapping chip rows, which knocked into an awkward
          multi-line block on the narrower table/new-order panels (a real
          tablet in portrait is exactly this width). A fixed-width column
          never wraps, scrolls on its own when the list runs long, and reads
          as a proper POS category rail (Toast/Square/Lightspeed all do
          this) instead of a chip cloud. */}
      <div className="w-52 shrink-0 border-e border-[#F3ECDD]/10 bg-black/20 overflow-y-auto py-4 px-2 space-y-4">
        <button
          onClick={() => setActiveCategory('all')}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold border-l-4 border-transparent transition-all ${
            activeCategory === 'all'
              ? 'bg-brand-orange/15 text-brand-orange'
              : 'text-[#9A9490] hover:text-[#F3ECDD] hover:bg-white/5'
          }`}
          style={activeCategory === 'all' ? { borderColor: '#C9A15A' } : undefined}
        >
          <span>🍽️</span> Tout
        </button>
        {groupedRows.map((row) => {
          const color = GROUP_COLOR[row.label] || '#C9A15A';
          return (
            <div key={row.label}>
              <p className="text-[10px] uppercase tracking-wider text-[#7A736C] font-bold px-3 mb-1">{row.label}</p>
              <div className="space-y-0.5">
                {row.cats.map((c) => {
                  const active = activeCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      style={active ? { borderColor: color, color, backgroundColor: `${color}22` } : undefined}
                      className="w-full flex items-start justify-between gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold leading-snug border-l-4 border-transparent text-[#9A9490] hover:text-[#F3ECDD] hover:bg-white/5 transition-all"
                    >
                      <span className="flex items-start gap-1.5 min-w-0">
                        <span className="shrink-0">{c.emoji}</span> <span>{c.name.fr}</span>
                      </span>
                      <span className="text-[10px] text-[#7A736C] font-bold shrink-0 mt-0.5">{countByCategory.get(c.id) || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1 p-5 overflow-y-auto min-w-0">
        <div className="flex items-center gap-2.5 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article…"
            className="flex-1 bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-base text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange focus:shadow-[0_0_0_3px_rgba(201,161,90,0.2)] transition-shadow"
          />
          <button
            onClick={handleAddCustomAmount}
            title="Ajouter un article avec un montant et une description libres"
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all whitespace-nowrap"
          >
            ➕ Montant libre
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {items.map((it) => {
            const color = GROUP_COLOR[groupLabelByCategoryId.get(it.category) || ''] || '#C9A15A';
            return (
              <button
                key={it.id}
                onClick={() => handleAdd(it.id, it.name.fr, it.price, it.station)}
                className={`relative overflow-hidden text-start pos-surface border rounded-xl p-3.5 pt-4 transition-all active:scale-[0.96] ${
                  justAdded === it.id
                    ? 'border-brand-orange ring-2 ring-brand-orange/60 animate-pop'
                    : 'border-[#F3ECDD]/10 hover:border-brand-orange/50 hover:-translate-y-0.5'
                }`}
              >
                <span className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />
                <p className="text-base font-bold text-[#F3ECDD] leading-tight">{it.name.fr}</p>
                <p className="text-base text-brand-orange font-display font-black mt-1">{formatMAD(it.price)}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-64 border-s border-[#F3ECDD]/10 p-5 flex flex-col shrink-0 pos-surface-raised">
        <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-3">Panier</p>
        <div className="flex-1 overflow-y-auto space-y-2">
          {draft.length === 0 && <p className="text-[#7A736C] text-sm">Aucun article.</p>}
          {draft.map((l, idx) => (
            <div key={idx} className="flex items-center justify-between pos-surface rounded-lg px-2.5 py-2 animate-pop">
              <div className="min-w-0">
                <p className="text-sm text-[#F3ECDD] truncate font-medium">{l.name}</p>
                <p className="text-xs text-brand-orange font-bold">{formatMAD(l.unitPrice * l.quantity)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => onChangeQty(idx, -1)} className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-[#F3ECDD] text-lg leading-none transition-colors">
                  −
                </button>
                <span className="text-sm text-[#F3ECDD] w-4 text-center font-bold">{l.quantity}</span>
                <button onClick={() => onChangeQty(idx, 1)} className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-[#F3ECDD] text-lg leading-none transition-colors">
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[#F3ECDD]/10 pt-3 mt-3">
          <div className="flex justify-between items-baseline">
            <span className="text-[#9A9490] text-sm font-bold uppercase tracking-wide">Total</span>
            <span className="text-brand-orange font-display font-black text-2xl">{formatMAD(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function useDraft() {
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const addItem = (name: string, unitPrice: number, station?: string) => {
    setDraft((prev) => {
      const existing = prev.find((l) => l.name === name && l.unitPrice === unitPrice);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { name, unitPrice, quantity: 1, station }];
    });
  };
  const changeQty = (idx: number, delta: number) => {
    setDraft((prev) =>
      prev
        .map((l, i) => (i === idx ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };
  const total = draft.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const asOrderItems = (): OrderItem[] =>
    draft.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.quantity,
      // Most items in data.ts don't declare a `station` -- default it
      // instead of passing `undefined` through, which Firestore rejects
      // even nested inside an array item (this was the actual cause of the
      // invalid-argument error: it fired for almost every item, pizzas
      // included).
      station: l.station || 'Kitchen',
    }));
  return { draft, addItem, changeQty, total, asOrderItems, reset: () => setDraft([]) };
}

// ---------------------------------------------------------------------------
// "+ Emporter / Livraison / Glovo" -- table orders are created and grown
// exclusively through the Tables tab (TablePanel below), so this panel only
// ever handles the three order kinds that don't have a table number.

function NewOrderPanel({
  menuItems,
  onClose,
  onSubmit,
}: {
  menuItems: MenuItem[];
  onClose: () => void;
  onSubmit: (payload: any) => Promise<void>;
}) {
  const [kind, setKind] = useState<Exclude<OrderKind, 'dine_in'>>('takeaway');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [glovoRef, setGlovoRef] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { draft, addItem, changeQty, total, asOrderItems, reset } = useDraft();

  const canSubmit =
    draft.length > 0 &&
    (kind !== 'delivery' || (customerName.trim() && address.trim())) &&
    (kind !== 'glovo' || glovoRef.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    // Firestore's addDoc() throws "invalid-argument" if any field is a
    // literal `undefined` -- build the payload with only the fields that
    // actually apply, instead of assigning `undefined` to skip one.
    const payload: Record<string, unknown> = {
      restaurantId: 'doms-cafe',
      tableNumber: '?',
      items: asOrderItems(),
      total,
      status: 'new' as OrderStatus,
      source: (kind === 'glovo' ? 'glovo' : 'manual') as OrderSource,
      orderType: kind,
      paid: false,
      createdAt: serverTimestamp(),
    };
    if (customerName.trim()) payload.customerName = customerName.trim();
    if (kind === 'delivery' && address.trim()) payload.address = address.trim();
    if (kind === 'glovo' && glovoRef.trim()) payload.glovoRef = glovoRef.trim();
    if (note.trim()) payload.note = note.trim();
    await onSubmit(payload);
    setSubmitting(false);
    reset();
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch justify-end animate-fade-in">
      <div className="w-full max-w-4xl bg-brand-dark border-l border-[#F3ECDD]/10 shadow-2xl shadow-black/60 flex flex-col h-full animate-slide-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3ECDD]/10 shrink-0 pos-surface">
          <h2 className="font-display font-black text-xl text-[#F3ECDD]">Nouvelle commande</h2>
          <button onClick={onClose} className="text-[#9A9490] hover:text-[#F3ECDD] w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-2xl leading-none transition-colors">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-[#F3ECDD]/10 shrink-0">
          <div className="flex gap-2 flex-wrap">
            {(['takeaway', 'delivery', 'glovo'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                  kind === k
                    ? 'bg-brand-orange text-[#1A1208] border-brand-orange shadow-md shadow-brand-orange/20'
                    : 'bg-transparent text-[#9A9490] border-[#F3ECDD]/20 hover:border-[#F3ECDD]/40'
                }`}
              >
                {k === 'takeaway' ? 'À emporter' : k === 'delivery' ? 'Livraison' : 'Glovo'}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            {(kind === 'takeaway' || kind === 'delivery') && (
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom du client"
                className="flex-1 min-w-[140px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
            {kind === 'delivery' && (
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Adresse de livraison"
                className="flex-[2] min-w-[200px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
            {kind === 'glovo' && (
              <input
                value={glovoRef}
                onChange={(e) => setGlovoRef(e.target.value)}
                placeholder="Référence Glovo / nom client"
                className="flex-1 min-w-[140px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="📝 Remarque (allergie, sans oignon...)"
            className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
          />
        </div>

        <MenuGrid menuItems={menuItems} draft={draft} onAdd={addItem} onChangeQty={changeQty} />

        <div className="p-5 border-t border-[#F3ECDD]/10 shrink-0 pos-surface">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black py-3.5 rounded-xl shadow-lg shadow-brand-orange/20 transition-all text-lg"
          >
            {submitting ? 'Envoi…' : `Envoyer la commande — ${formatMAD(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table panel: the whole "real POS" table flow lives here -- tap a table in
// the grid to open this, see the running bill (one order per table, grown
// in place instead of piling up separate orders), add more items, and check
// out. This is the only way a dine-in order is created or grown.

function TablePanel({
  menuItems,
  table,
  orders,
  onClose,
  onAddItems,
  onCheckout,
  onAdvanceOrder,
  onCancelOrder,
  onDeleteOrder,
  onEditNote,
  onRemoveItem,
  onApplyDiscount,
}: {
  menuItems: MenuItem[];
  table: string;
  orders: OrderDoc[];
  onClose: () => void;
  onAddItems: (items: OrderItem[], total: number) => Promise<void>;
  onCheckout: () => void;
  onAdvanceOrder: (order: OrderDoc) => void | Promise<void>;
  onCancelOrder: (order: OrderDoc) => void | Promise<void>;
  onDeleteOrder: (order: OrderDoc) => void | Promise<void>;
  onEditNote: (order: OrderDoc) => void | Promise<void>;
  onRemoveItem: (order: OrderDoc, index: number) => void | Promise<void>;
  onApplyDiscount: (order: OrderDoc) => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const { draft, addItem, changeQty, total, asOrderItems, reset } = useDraft();

  const billTotal = orders.reduce((s, o) => s + o.total, 0);
  const allPaid = orders.length > 0 && orders.every((o) => o.paid);

  const submitAdd = async () => {
    if (draft.length === 0 || submitting) return;
    setSubmitting(true);
    await onAddItems(asOrderItems(), total);
    reset();
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch justify-end animate-fade-in">
      <div className="w-full max-w-4xl bg-brand-dark border-l border-[#F3ECDD]/10 shadow-2xl shadow-black/60 flex flex-col h-full animate-slide-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3ECDD]/10 shrink-0 pos-surface">
          <h2 className="font-display font-black text-xl text-[#F3ECDD]">Table {table}</h2>
          <button onClick={onClose} className="text-[#9A9490] hover:text-[#F3ECDD] w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-2xl leading-none transition-colors">
            ×
          </button>
        </div>

        {orders.length > 0 && (
          <div className="p-5 border-b border-[#F3ECDD]/10 shrink-0 space-y-3 max-h-[40vh] overflow-y-auto">
            <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold">Addition en cours</p>
            {orders.map((o) => {
              const mins = minutesSince(o.createdAt);
              const status = o.status || 'new';
              return (
                <div key={o.id} className="pos-surface rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#9A9490]">
                      {STATUS_LABEL[status]} · <span className={elapsedStyle(mins)}>{elapsedLabel(mins)}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      {status !== 'served' && status !== 'cancelled' && status !== 'ready' && (
                        <button onClick={() => onAdvanceOrder(o)} className="text-[11px] font-black text-brand-orange hover:text-brand-orange-hover underline underline-offset-2 transition-colors">
                          {status === 'preparing' ? 'Marquer prêt' : 'Démarrer'}
                        </button>
                      )}
                      <button onClick={() => onCancelOrder(o)} className="text-[11px] font-bold text-[#7A736C] hover:text-red-400 underline underline-offset-2 transition-colors">
                        Annuler
                      </button>
                      <button
                        onClick={() => onEditNote(o)}
                        title={o.note ? 'Modifier la remarque' : 'Ajouter une remarque'}
                        className={`text-[11px] font-bold transition-colors ${o.note ? 'text-brand-orange hover:text-brand-orange-hover' : 'text-[#7A736C] hover:text-[#F3ECDD]'}`}
                      >
                        📝
                      </button>
                      <button
                        onClick={() => onApplyDiscount(o)}
                        title="Appliquer une remise (code manager)"
                        className={`text-[11px] font-bold transition-colors ${o.discount ? 'text-brand-orange hover:text-brand-orange-hover' : 'text-[#7A736C] hover:text-[#F3ECDD]'}`}
                      >
                        🏷️
                      </button>
                      <button onClick={() => onDeleteOrder(o)} title="Supprimer définitivement (serveur inclus)" className="text-[11px] font-bold text-[#7A736C] hover:text-red-400 transition-colors">
                        🗑️
                      </button>
                    </div>
                  </div>
                  {o.note && (
                    <div className="bg-brand-orange/10 border border-brand-orange/25 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
                      <span className="text-xs shrink-0">📝</span>
                      <p className="text-xs text-brand-orange font-medium leading-snug">{o.note}</p>
                    </div>
                  )}
                  {o.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center gap-1.5 text-sm text-[#E3DCCB]">
                      <span>
                        <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[#9A9490]">{formatMAD(it.lineTotal)}</span>
                        <button
                          onClick={() => onRemoveItem(o, i)}
                          title="Retirer cet article (code manager)"
                          className="text-[#5a5148] hover:text-red-400 text-xs w-4 h-4 rounded-full flex items-center justify-center transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                  {!!o.discount && (
                    <div className="flex justify-between text-xs text-brand-orange font-bold mt-1">
                      <span>🏷️ Remise</span>
                      <span>-{formatMAD(o.discount)}</span>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t border-[#F3ECDD]/10">
              <span className="font-display font-black text-brand-orange text-2xl">{formatMAD(billTotal)}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printTableReceipt(table, orders)}
                  title="Imprimer le reçu"
                  className="text-sm font-bold px-3.5 py-2.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                >
                  🖨️ Imprimer
                </button>
                <button
                  onClick={onCheckout}
                  className="text-sm font-black px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.97] text-[#1A1208] shadow-lg shadow-brand-orange/20 transition-all"
                >
                  {allPaid ? 'Clôturer la table' : 'Encaisser'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pt-4 shrink-0">
          <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold">Ajouter des articles</p>
        </div>

        <MenuGrid menuItems={menuItems} draft={draft} onAdd={addItem} onChangeQty={changeQty} />

        <div className="p-5 border-t border-[#F3ECDD]/10 shrink-0 pos-surface">
          <button
            onClick={submitAdd}
            disabled={draft.length === 0 || submitting}
            className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black py-3.5 rounded-xl shadow-lg shadow-brand-orange/20 transition-all text-lg"
          >
            {submitting ? 'Ajout…' : draft.length === 0 ? 'Ajouter à la table' : `Ajouter à la table — ${formatMAD(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = 'tables' | 'live' | 'kitchen' | 'history' | 'reports' | 'menu' | 'tv';
type PayTarget = { kind: 'table'; table: string; orders: OrderDoc[] } | { kind: 'order'; order: OrderDoc };
type ReportRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

const RANGE_LABEL: Record<ReportRange, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  week: '7 jours',
  month: '30 jours',
  custom: 'Personnalisé',
  all: 'Tout',
};

// "YYYY-MM-DD" en heure locale -- ce que rend <input type="date"> et ce dont
// dailyClosures se sert comme clé de document (une clôture par jour civil).
function dateStr(d: Date | number = Date.now()): string {
  const dt = typeof d === 'number' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeStart(range: ReportRange, customStart?: string): number {
  const d = new Date();
  if (range === 'all') return 0;
  if (range === 'today') {
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'yesterday') {
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'week') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'custom') {
    if (!customStart) return 0;
    const [y, m, day] = customStart.split('-').map(Number);
    return new Date(y, (m || 1) - 1, day || 1, 0, 0, 0, 0).getTime();
  }
  // month
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rangeEnd(range: ReportRange, customEnd?: string): number {
  if (range === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (range === 'custom') {
    if (!customEnd) return Date.now();
    const [y, m, day] = customEnd.split('-').map(Number);
    return new Date(y, (m || 1) - 1, day || 1, 23, 59, 59, 999).getTime();
  }
  return Date.now();
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readStoredEmployee(): Employee | null {
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_SESSION_KEY);
    return raw ? (JSON.parse(raw) as Employee) : null;
  } catch {
    return null;
  }
}

export default function PosApp() {
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(() => readStoredEmployee());
  const unlocked = currentEmployee !== null;
  // Verrouillage d'inactivité -- séparé de `unlocked` : verrouiller ne
  // déconnecte pas l'employé ni ne réinitialise la page, ça masque juste
  // l'écran derrière IdleLockOverlay jusqu'à ce qu'un code valide soit tapé.
  const [locked, setLocked] = useState(false);
  const idleTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!unlocked) return;
    const resetIdleTimer = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setLocked(true), IDLE_LOCK_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [unlocked]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [tab, setTab] = useState<Tab>('tables');
  const [reportRange, setReportRange] = useState<ReportRange>('today');
  const [customStart, setCustomStart] = useState(dateStr());
  const [customEnd, setCustomEnd] = useState(dateStr());
  const [historySearch, setHistorySearch] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('all');
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [creatingMenuItem, setCreatingMenuItem] = useState(false);
  const [editingTvSlide, setEditingTvSlide] = useState<TvSlide | null>(null);
  const [creatingTvSlide, setCreatingTvSlide] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [payingTarget, setPayingTarget] = useState<PayTarget | null>(null);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(Date.now());
  // null = still connecting, string = a listener/write error to show instead
  // of silently rendering an empty "no orders" screen (that silence is what
  // made a genuine Firestore permission problem look like "nothing came
  // in" instead of a visible, diagnosable error).
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Offline-indicator state -- fromServer is false while the latest snapshot
  // came only from the local IndexedDB cache (no live server round trip
  // right now, i.e. "hors ligne" from Firestore's point of view even if
  // navigator.onLine is technically true on a flaky connection).
  // hasPendingWrites is true while this device has local changes (a new
  // order, a status update...) that haven't been acknowledged by the server
  // yet -- exactly the "wijzigingen die nog wachten op synchronisatie" the
  // indicator needs to show.
  const [fromServer, setFromServer] = useState(true);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  // Manager-PIN gate -- a single pending-request slot is enough since only
  // one sensitive action can be mid-confirmation at a time. resolve() is
  // called with true/false by ManagerPinModal and awaited by
  // requestManagerAuth() below.
  const [managerAuthRequest, setManagerAuthRequest] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const requestManagerAuth = (): Promise<boolean> => new Promise((resolve) => setManagerAuthRequest({ resolve }));
  const knownIds = useRef<Set<string> | null>(null);

  // Rapports X/Z -- pas de session de caisse (kassa tellen reste hors
  // scope pour l'instant) : le Rapport Z clôture la journée civile en
  // cours dans dailyClosures/{YYYY-MM-DD}, un doc par jour. Ce listener
  // suit le doc du jour courant pour savoir si la journée est déjà
  // clôturée (et afficher les chiffres figés au lieu de les recalculer).
  const [todayClosure, setTodayClosure] = useState<DailyClosure | null>(null);
  const [showXReport, setShowXReport] = useState(false);
  const [showZReport, setShowZReport] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(doc(db, 'dailyClosures', dateStr()), (snap) => {
      setTodayClosure(snap.exists() ? (snap.data() as DailyClosure) : null);
    });
    return () => unsub();
  }, [unlocked]);

  const closeToday = async () => {
    const ok = await requestManagerAuth();
    if (!ok) return;
    const stats = todayStats;
    const payload: DailyClosure = {
      date: dateStr(),
      revenue: stats.revenue,
      cash: stats.cash,
      card: stats.card,
      glovo: stats.glovo,
      unspecified: stats.unspecified,
      orderCount: stats.orderCount,
      closedAt: Date.now(),
      closedByEmployee: currentEmployee?.name || 'Inconnu',
    };
    try {
      await setDoc(doc(db, 'dailyClosures', payload.date), payload);
    } catch (err) {
      reportWriteError(err);
    }
  };

  // Menu -- data.ts reste la source complète (3 langues, description,
  // photo, variantes) pour le site client ; menuOverrides ne contient que
  // ce que l'onglet Menu modifie ici (prix/nom/catégorie/station/actif),
  // fusionné par buildMenu() ci-dessus. Modifier un prix ici ne touche donc
  // PAS le site de commande client -- voir la note affichée dans l'onglet.
  const [menuOverrides, setMenuOverrides] = useState<Map<string, MenuOverride>>(new Map());
  const [menuUnlocked, setMenuUnlocked] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'menuOverrides'), (snap) => {
      const map = new Map<string, MenuOverride>();
      snap.docs.forEach((d) => map.set(d.id, d.data() as MenuOverride));
      setMenuOverrides(map);
    });
    return () => unsub();
  }, [unlocked]);
  const menuItems = useMemo(() => buildMenu(menuOverrides), [menuOverrides]);

  const unlockMenu = async () => {
    const ok = await requestManagerAuth();
    if (ok) setMenuUnlocked(true);
  };
  const saveMenuOverride = async (id: string, patch: Partial<MenuOverride>) => {
    try {
      await setDoc(doc(db, 'menuOverrides', id), patch, { merge: true });
    } catch (err) {
      reportWriteError(err);
    }
  };
  const createMenuItem = async (data: { name: string; price: number; category: string; station: string; active: boolean }) => {
    try {
      await addDoc(collection(db, 'menuOverrides'), { ...data, isCustom: true });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Pour un article de base (data.ts) ça supprime juste l'override et
  // restaure les valeurs du code ("Réinitialiser") ; pour un article
  // isCustom (n'existe qu'ici) ça le fait disparaître pour de bon
  // ("Supprimer") -- même opération Firestore, l'écran choisit le libellé.
  const deleteMenuOverride = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'menuOverrides', id));
    } catch (err) {
      reportWriteError(err);
    }
  };

  // TV -- écran promo (tv.html), voir la note sur l'interface TvSlide.
  // Même schéma d'accès que le Menu (code manager, "déverrouillé" une fois
  // par session tant que l'écran reste ouvert).
  const [tvSlides, setTvSlides] = useState<TvSlide[]>([]);
  const [tvUnlocked, setTvUnlocked] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'tvSlides'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TvSlide, 'id'>) }));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTvSlides(list);
    });
    return () => unsub();
  }, [unlocked]);

  const unlockTv = async () => {
    const ok = await requestManagerAuth();
    if (ok) setTvUnlocked(true);
  };
  const createTvSlide = async (data: { title: string; subtitle?: string; price?: number; imageUrl?: string; active: boolean }) => {
    try {
      const maxOrder = tvSlides.reduce((m, s) => Math.max(m, s.order ?? 0), 0);
      await addDoc(collection(db, 'tvSlides'), { ...data, order: maxOrder + 1 });
    } catch (err) {
      reportWriteError(err);
    }
  };
  const saveTvSlide = async (id: string, patch: Partial<Omit<TvSlide, 'id'>>) => {
    try {
      await setDoc(doc(db, 'tvSlides', id), patch, { merge: true });
    } catch (err) {
      reportWriteError(err);
    }
  };
  const deleteTvSlide = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tvSlides', id));
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Échange l'`order` avec le voisin -- suffisant pour réordonner une liste
  // courte de slides sans avoir besoin de drag-and-drop.
  const moveTvSlide = async (id: string, direction: -1 | 1) => {
    const idx = tvSlides.findIndex((s) => s.id === id);
    const neighborIdx = idx + direction;
    if (idx === -1 || neighborIdx < 0 || neighborIdx >= tvSlides.length) return;
    const a = tvSlides[idx];
    const b = tvSlides[neighborIdx];
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tvSlides', a.id), { order: b.order }, { merge: true });
      batch.set(doc(db, 'tvSlides', b.id), { order: a.order }, { merge: true });
      await batch.commit();
    } catch (err) {
      reportWriteError(err);
    }
  };

  // Imprimantes bar/cuisine -- voir la note au-dessus de printKitchenTicketForOrder.
  // "Prête" seulement si CET appareil a lui-même déjà connecté cette station
  // (fingerprint en localStorage), pas juste parce qu'il a une permission
  // WebUSB pour un autre appareil (le tiroir-caisse, sur le pc du comptoir).
  const [stationPrintersReady, setStationPrintersReady] = useState<Record<string, boolean>>({});
  const [stationPrinterMsg, setStationPrinterMsg] = useState<string | null>(null);
  const kitchenPrintInFlight = useRef<Set<string>>(new Set());

  const refreshStationPrintersReady = async () => {
    const usb: any = (navigator as any).usb;
    if (!usb) return;
    const printers = await resolveStationPrinters();
    const next: Record<string, boolean> = {};
    STATION_PRINTERS.forEach((st) => {
      next[st] = printers.has(st);
    });
    setStationPrintersReady(next);
  };

  useEffect(() => {
    if (!unlocked) return;
    refreshStationPrintersReady();
  }, [unlocked]);

  const handleConnectStationPrinter = async (station: string) => {
    const res = await connectStationPrinter(station);
    if (res.ok === false) {
      setStationPrinterMsg(res.message);
    } else {
      setStationPrinterMsg(`Imprimante ${stationPrinterLabel(station)} connectée.`);
    }
    await refreshStationPrintersReady();
    window.setTimeout(() => setStationPrinterMsg(null), 4000);
  };

  const handleTestStationPrinter = async (station: string) => {
    const bytes = buildKitchenTicketBytes({
      station,
      label: 'TEST',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      items: [{ name: `Ticket de test ${stationPrinterLabel(station)}`, quantity: 1 }],
    });
    const res = await sendToStationPrinter(station, bytes);
    setStationPrinterMsg(res.ok === false ? res.message : `Test envoyé à l'imprimante ${stationPrinterLabel(station)}.`);
    window.setTimeout(() => setStationPrinterMsg(null), 4000);
  };

  // Auto-print -- se déclenche à chaque changement de `orders` (donc à
  // chaque snapshot Firestore), mais ne réimprime que les items pas encore
  // couverts par kitchenPrintedCount, et kitchenPrintInFlight évite qu'un
  // second snapshot arrivant pendant qu'un ticket est encore en train de
  // s'imprimer ne déclenche une impression en double du même lot.
  const anyStationPrinterReady = Object.values(stationPrintersReady).some(Boolean);
  useEffect(() => {
    if (!unlocked || !anyStationPrinterReady) return;
    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const printedCount = o.kitchenPrintedCount || 0;
      if (o.items.length <= printedCount) return;
      if (kitchenPrintInFlight.current.has(o.id)) return;
      kitchenPrintInFlight.current.add(o.id);
      const newItems = o.items.slice(printedCount);
      printKitchenTicketForOrder(o, newItems)
        .then(() => updateDoc(doc(db, 'orders', o.id), { kitchenPrintedCount: o.items.length }))
        .catch((err) => console.warn('Ticket cuisine : échec impression', err))
        .finally(() => {
          kitchenPrintInFlight.current.delete(o.id);
        });
    });
  }, [orders, anyStationPrinterReady, unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      // includeMetadataChanges -- so the online/offline + "sync en attente"
      // indicator updates the instant Firestore's own sync state changes,
      // not just when the order data itself changes.
      { includeMetadataChanges: true },
      (snap) => {
        setConnected(true);
        setConnectionError(null);
        setFromServer(!snap.metadata.fromCache);
        setHasPendingWrites(snap.metadata.hasPendingWrites);
        const list: OrderDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        // First snapshot after mount just seeds the "seen" set — no chime for
        // orders that already existed before this screen was opened.
        if (knownIds.current === null) {
          knownIds.current = new Set(list.map((o) => o.id));
        } else {
          const isNewArrival = list.some(
            (o) => !knownIds.current!.has(o.id) && (o.status || 'new') === 'new' && o.source !== 'manual' && o.source !== 'glovo'
          );
          knownIds.current = new Set(list.map((o) => o.id));
          if (isNewArrival) {
            playChime();
            setFlash(true);
            setTimeout(() => setFlash(false), 1800);
          }
        }
        setOrders(list);
      },
      (err) => {
        // Firestore surfaces a permission-denied error here (never a silent
        // empty snapshot) when the "orders" collection's security rules
        // don't allow reads for this client — see the on-screen message for
        // exactly what to check in the Firebase console.
        console.error('Orders listener failed:', err);
        setConnected(false);
        setConnectionError(
          err?.code === 'permission-denied'
            ? "Accès refusé par les règles Firestore sur la collection « orders » (lecture non autorisée pour ce client). Autorise la lecture (read/list) sur « orders » dans les règles Firestore du projet, comme c'est déjà le cas pour l'écriture."
            : `Connexion à Firestore impossible (${err?.code || err?.message || 'erreur inconnue'}). Réessaie ou vérifie la connexion internet de cet écran.`
        );
      }
    );
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const reportWriteError = (err: unknown) => {
    console.error('Orders write failed:', err);
    const code = (err as any)?.code;
    setConnectionError(
      code === 'permission-denied'
        ? "Accès refusé par les règles Firestore sur la collection « orders » (écriture non autorisée pour ce client)."
        : `Action impossible (${code || 'erreur inconnue'}). Réessaie.`
    );
  };

  const advance = async (order: OrderDoc) => {
    const next: Record<OrderStatus, OrderStatus> = { new: 'preparing', preparing: 'ready', ready: 'served', served: 'served', cancelled: 'cancelled' };
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: next[order.status || 'new'] });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Turning payment ON opens the cash/carte choice (handled by
  // payingTarget + choosePayment below); turning it OFF is an instant
  // correction, no method prompt needed.
  const togglePaid = async (order: OrderDoc) => {
    if (!order.paid) {
      setPayingTarget({ kind: 'order', order });
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), { paid: false });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Manager-PIN required -- une commande existe forcément déjà en cuisine
  // dès qu'elle est créée (il n'y a pas d'étape séparée "envoyer en
  // cuisine"), donc annuler ici veut toujours dire annuler après envoi.
  const cancel = async (order: OrderDoc) => {
    if (!(await requestManagerAuth())) return;
    if (!window.confirm(`Annuler la commande (${kindLabel(order)}) ?`)) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Manager-PIN required -- retire un seul article d'une commande déjà
  // envoyée (pas le brouillon dans le panier avant envoi, qui reste libre).
  const removeItemFromOrder = async (order: OrderDoc, index: number) => {
    const removed = order.items[index];
    if (!removed) return;
    if (!(await requestManagerAuth())) return;
    if (!window.confirm(`Retirer « ${removed.name} » de cette commande ?`)) return;
    const items = order.items.filter((_, i) => i !== index);
    const newTotal = Math.max(0, order.total - removed.lineTotal);
    try {
      await updateDoc(doc(db, 'orders', order.id), { items, total: newTotal });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Manager-PIN required -- remise manuelle en MAD, déduite directement de
  // `total` (les rapports et l'encaissement ne lisent que ce champ) ;
  // `discount` garde la trace du montant cumulé pour l'affichage et le reçu.
  const applyDiscount = async (order: OrderDoc) => {
    if (!(await requestManagerAuth())) return;
    const raw = window.prompt(`Remise à appliquer sur cette commande (total actuel : ${formatMAD(order.total)}) — montant en MAD :`, '');
    if (raw === null) return;
    const amount = parseFloat(raw.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) return;
    const newTotal = Math.max(0, order.total - amount);
    try {
      await updateDoc(doc(db, 'orders', order.id), { total: newTotal, discount: (order.discount || 0) + amount });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Real, permanent removal -- unlike cancel() above (which only sets
  // status: "cancelled" and keeps the doc around for the history/reports
  // count), this deletes the Firestore document itself, immediately. This
  // is what "gewist ... ook uit de server meteen" actually asks for: not a
  // soft cancel, a real delete.
  const deleteOrder = async (order: OrderDoc) => {
    if (!window.confirm(`Supprimer définitivement cette commande (${kindLabel(order)}) ? Cette action est irréversible.`)) return;
    try {
      await deleteDoc(doc(db, 'orders', order.id));
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Add/edit the order-level note -- the cashier's side of "de kassier dat
  // kunnen bij een bestelling", for customer-site orders that arrived with
  // one, orders that need one added after the fact, or manual orders this
  // screen creates itself (see NewOrderPanel/TablePanel below).
  const editNote = async (order: OrderDoc) => {
    const value = window.prompt('Remarque pour cette commande :', order.note || '');
    if (value === null) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), { note: value.trim() });
    } catch (err) {
      reportWriteError(err);
    }
  };
  // Wipe every order ever recorded, permanently -- "de historie helemaal
  // kunnen wissen". `orders` already holds the entire collection (the
  // listener above has no date filter), so this clears everything, not just
  // the currently selected date range. Guarded by a type-to-confirm prompt
  // since there is no undo for a Firestore batch delete.
  const wipeAllHistory = async () => {
    if (orders.length === 0) return;
    const typed = window.prompt(
      `Ceci va supprimer DÉFINITIVEMENT les ${orders.length} commande(s) enregistrées (tout l'historique, pas seulement la période affichée). Cette action est irréversible.\n\nTape SUPPRIMER pour confirmer.`
    );
    if (typed !== 'SUPPRIMER') return;
    try {
      for (let i = 0; i < orders.length; i += 450) {
        const chunk = orders.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((o) => batch.delete(doc(db, 'orders', o.id)));
        await batch.commit();
      }
    } catch (err) {
      reportWriteError(err);
    }
  };
  const submitNewOrder = async (payload: any) => {
    try {
      await addDoc(collection(db, 'orders'), {
        ...payload,
        ...(currentEmployee ? { employeeName: currentEmployee.name } : {}),
      });
    } catch (err) {
      reportWriteError(err);
    }
  };

  // Bouton manuel -- affiche l'erreur si ça échoue (voir les deux limites
  // WebUSB documentées au-dessus d'openCashDrawer).
  const handleOpenDrawer = async () => {
    const res = await openCashDrawer();
    if (res.ok === false) {
      window.alert(`Impossible d'ouvrir le tiroir : ${res.message}`);
    }
  };

  const choosePayment = (payment: PaymentChoice) => {
    if (!payingTarget) return;
    // Ouverture automatique du tiroir si du cash entre en jeu (paiement cash
    // complet ou partagé) -- silencieuse en cas d'échec (pas d'alerte qui
    // interrompt l'encaissement) : le bouton manuel ci-dessus reste la façon
    // de diagnostiquer un souci matériel.
    if (payment.method === 'cash' || (payment.method === 'mixed' && payment.cash > 0)) {
      openCashDrawer().then((res) => {
        if (res.ok === false) console.warn('Ouverture auto du tiroir : ', res.message);
      });
    }
    // Close the modal immediately instead of waiting on the network round
    // trip -- Firestore's local cache already applies the change optimistically
    // for every listener (that's how the rest of this screen behaves too:
    // advance/togglePaid/cancel never block the UI on a server round trip).
    // Blocking here instead would leave the modal stuck open on a slow or
    // flaky connection, which is exactly the kind of thing a "perfect
    // werkend" POS can't do.
    const target = payingTarget;
    setPayingTarget(null);
    const paymentFields = (orderTotal: number): Partial<OrderDoc> => {
      if (payment.method !== 'mixed') return { paymentMethod: payment.method };
      // Table avec plusieurs commandes -- répartit le split proportionnellement
      // au poids de chaque commande dans l'addition totale, pour que le
      // rapport cash/carte reste exact même si l'addition vient de plusieurs
      // commandes fusionnées.
      const billTotal = target.kind === 'table' ? target.orders.reduce((s, o) => s + o.total, 0) : orderTotal;
      const cashShare = billTotal > 0 ? Math.round((payment.cash * orderTotal) / billTotal * 100) / 100 : 0;
      return { paymentMethod: 'mixed', paymentSplit: { cash: cashShare, card: Math.max(0, Math.round((orderTotal - cashShare) * 100) / 100) } };
    };
    const write =
      target.kind === 'table'
        ? Promise.all(
            target.orders.map((o) =>
              updateDoc(doc(db, 'orders', o.id), { paid: true, status: 'served', ...paymentFields(o.total) })
            )
          )
        : updateDoc(doc(db, 'orders', target.order.id), { paid: true, ...paymentFields(target.order.total) });
    write.catch((err) => reportWriteError(err));
    if (target.kind === 'table' && selectedTable === target.table) {
      setSelectedTable(null);
    }
  };

  const activeOrders = useMemo(
    () => orders.filter((o) => (o.status || 'new') !== 'served' && o.status !== 'cancelled'),
    [orders]
  );
  // Non-table orders only — table orders are managed entirely from the
  // Tables tab now, so they're excluded here to avoid two separate places
  // claiming to manage the same order (that duplication is exactly what a
  // real POS doesn't do).
  const liveOrders = useMemo(
    () => [...activeOrders].filter((o) => kindOf(o) !== 'dine_in').sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)),
    [activeOrders]
  );
  const tablesMap = useMemo(() => {
    const map = new Map<string, OrderDoc[]>();
    activeOrders
      .filter((o) => kindOf(o) === 'dine_in')
      .forEach((o) => {
        const key = o.tableNumber || '?';
        map.set(key, [...(map.get(key) || []), o]);
      });
    return map;
  }, [activeOrders]);
  const occupiedTableCount = tablesMap.size;
  // Everything in the selected range, whatever its status -- this is the
  // single source both the Historique tab and the Rapports tab read from,
  // so "look up an old order" and "what did we make that day" always agree
  // with each other instead of drifting apart with their own filters.
  const rangeOrders = useMemo(() => {
    const start = rangeStart(reportRange, customStart);
    const end = rangeEnd(reportRange, customEnd);
    return orders.filter((o) => {
      const t = o.createdAt?.toMillis() || 0;
      return t >= start && t <= end;
    });
  }, [orders, reportRange, customStart, customEnd]);

  const historyOrders = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return rangeOrders
      .filter((o) => (o.status === 'served' || o.status === 'cancelled'))
      .filter((o) => {
        if (!q) return true;
        return (
          kindLabel(o).toLowerCase().includes(q) ||
          (o.tableNumber || '').toLowerCase().includes(q) ||
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.glovoRef || '').toLowerCase().includes(q) ||
          o.items.some((it) => it.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  }, [rangeOrders, historySearch]);

  // Dagomzet & co: revenue, payment split, order-type split and best-sellers
  // for whichever range is selected -- this is what makes past days
  // retrievable instead of only ever seeing "today".
  const reportStats = useMemo(() => computeStats(rangeOrders), [rangeOrders]);

  // Toujours la journée civile en cours, indépendamment de la période
  // sélectionnée dans l'onglet Rapports -- c'est la base des Rapports X et Z
  // ("l'omzet sinds de laatste kassa-opening" devient, sans compteur de
  // caisse, "l'omzet depuis 00h00 aujourd'hui").
  const todayOrders = useMemo(() => {
    const start = rangeStart('today');
    const end = rangeEnd('today');
    return orders.filter((o) => {
      const t = o.createdAt?.toMillis() || 0;
      return t >= start && t <= end;
    });
  }, [orders]);
  const todayStats = useMemo(() => computeStats(todayOrders), [todayOrders]);

  // Kitchen view: everything still to prepare (new/preparing), grouped by
  // station instead of by table/order, so the kitchen sees a prep list
  // instead of having to mentally filter out payment status and table
  // numbers that don't matter to them.
  const kitchenByStation = useMemo(() => {
    const map = new Map<string, OrderDoc[]>();
    activeOrders
      .filter((o) => (o.status || 'new') === 'new' || o.status === 'preparing')
      .forEach((o) => {
        const stations = new Set(o.items.map((it) => it.station || 'Kitchen'));
        stations.forEach((st) => map.set(st, [...(map.get(st) || []), o]));
      });
    for (const list of map.values()) {
      list.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
    }
    return Array.from(map.entries());
  }, [activeOrders]);
  const kitchenOrderCount = useMemo(
    () => activeOrders.filter((o) => (o.status || 'new') === 'new' || o.status === 'preparing').length,
    [activeOrders]
  );

  const addItemsToTable = async (table: string, newItems: OrderItem[], newTotal: number) => {
    try {
      const existing = tablesMap.get(table)?.[0];
      if (existing) {
        await updateDoc(doc(db, 'orders', existing.id), {
          items: [...existing.items, ...newItems],
          total: existing.total + newTotal,
        });
      } else {
        await addDoc(collection(db, 'orders'), {
          restaurantId: 'doms-cafe',
          tableNumber: table,
          items: newItems,
          total: newTotal,
          status: 'new' as OrderStatus,
          source: 'manual' as OrderSource,
          orderType: 'dine_in' as OrderKind,
          paid: false,
          createdAt: serverTimestamp(),
          ...(currentEmployee ? { employeeName: currentEmployee.name } : {}),
        });
      }
    } catch (err) {
      reportWriteError(err);
    }
  };

  if (!unlocked) return <EmployeeLoginGate onLogin={(e) => setCurrentEmployee(e)} />;

  return (
    <div className="min-h-screen bg-brand-dark text-[#F3ECDD]">
      {flash && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-brand-orange text-[#1A1208] text-center py-2 font-display font-black animate-pulse">
          Nouvelle commande !
        </div>
      )}

      {connectionError && (
        <div className="bg-red-500/15 border-b border-red-500/40 text-red-300 text-sm px-5 py-3 flex items-center justify-between gap-3">
          <span>⚠ {connectionError}</span>
          <button onClick={() => window.location.reload()} className="shrink-0 text-xs font-bold underline">
            Recharger
          </button>
        </div>
      )}
      {!connectionError && !connected && (
        <div className="bg-[#F3ECDD]/10 text-[#9A9490] text-sm px-5 py-2 text-center">Connexion à Firestore…</div>
      )}

      <header className="sticky top-0 z-40 bg-gradient-to-b from-brand-dark to-[#1f160c]/98 backdrop-blur border-b border-[#F3ECDD]/10 shadow-lg shadow-black/30 px-5 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="Dom's Café" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="font-display font-black text-xl leading-tight tracking-wide">DOM'S CAFÉ</h1>
            <p className="text-[#9A9490] text-xs flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#8FBF8A] animate-pulse-dot' : 'bg-[#7A736C]'}`} />
              {currentEmployee ? `${currentEmployee.name} ·` : 'Écran commandes ·'}{' '}
              {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {/* Indicateur en ligne/hors ligne + synchronisation en attente --
              "het kassascherm blijft werken als het internet uitvalt" : les
              écritures continuent (cache local de Firestore, voir
              firebase.ts), ce badge dit juste où on en est. hasPendingWrites
              prime sur fromServer : même "en ligne", des changements locaux
              pas encore confirmés par le serveur méritent le badge orange. */}
          <span
            title={
              hasPendingWrites
                ? "Des modifications locales attendent d'être synchronisées avec le serveur."
                : fromServer
                ? 'Connecté à Firestore.'
                : "Hors ligne -- les actions faites ici restent enregistrées sur cet écran et se synchroniseront automatiquement au retour de la connexion."
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 ${
              hasPendingWrites
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : fromServer
                ? 'bg-[#8FBF8A]/15 text-[#8FBF8A] border-[#8FBF8A]/40'
                : 'bg-red-500/15 text-red-300 border-red-500/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasPendingWrites ? 'bg-amber-400 animate-pulse-dot' : fromServer ? 'bg-[#8FBF8A]' : 'bg-red-400'
              }`}
            />
            {hasPendingWrites ? 'Synchronisation…' : fromServer ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap p-1 rounded-full pos-surface border border-[#F3ECDD]/10">
            {(['tables', 'live', 'kitchen', 'history', 'reports', 'menu', 'tv'] as Tab[]).map((t) => {
              const needsAttention = t === 'kitchen' && kitchenOrderCount > 0;
              const icon =
                t === 'tables'
                  ? '🪑'
                  : t === 'live'
                  ? '🧾'
                  : t === 'kitchen'
                  ? '🍳'
                  : t === 'history'
                  ? '📜'
                  : t === 'reports'
                  ? '📊'
                  : t === 'tv'
                  ? '📺'
                  : '📋';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-all ${
                    tab === t
                      ? 'bg-brand-orange text-[#1A1208] shadow-md shadow-brand-orange/30'
                      : 'text-[#9A9490] hover:text-[#F3ECDD] hover:bg-white/5'
                  }`}
                >
                  {needsAttention && tab !== t && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-orange animate-pulse-dot" />
                  )}
                  <span aria-hidden="true">{icon}</span>
                  {t === 'tables'
                    ? `Tables (${occupiedTableCount}/${TABLE_COUNT})`
                    : t === 'live'
                    ? `Commandes (${liveOrders.length})`
                    : t === 'kitchen'
                    ? `Cuisine (${kitchenOrderCount})`
                    : t === 'history'
                    ? 'Historique'
                    : t === 'reports'
                    ? 'Rapports'
                    : t === 'tv'
                    ? 'TV'
                    : 'Menu'}
                </button>
              );
            })}
          </div>
          <div className="w-px self-stretch bg-[#F3ECDD]/15 mx-0.5" />
          <button
            onClick={handleOpenDrawer}
            title="Ouvrir le tiroir-caisse (commande envoyée à l'imprimante à reçus)"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
          >
            🗄️ Ouvrir le tiroir
          </button>
          <button
            onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-black border border-brand-orange/40 bg-brand-orange/10 hover:bg-brand-orange/20 active:scale-[0.97] text-brand-orange transition-all shadow-sm shadow-black/20"
          >
            <span aria-hidden="true">+</span> Emporter / Livraison / Glovo
          </button>
        </div>
      </header>

      <main key={tab} className="p-5 animate-fade-in">
        {tab === 'tables' && (
          <div>
            <div className="flex items-center gap-4 text-xs font-bold text-[#9A9490] mb-4">
              <span>Touchez une table pour voir ou démarrer son addition.</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-md pos-surface border border-[#F3ECDD]/15" /> Libre</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-md bg-brand-orange" /> En cours</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-md bg-[#8FBF8A]/60" /> Payée</span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3 max-w-3xl">
              {TABLE_NUMBERS.map((n) => {
                const tOrders = tablesMap.get(n) || [];
                const occupied = tOrders.length > 0;
                const total = tOrders.reduce((s, o) => s + o.total, 0);
                const allPaid = occupied && tOrders.every((o) => o.paid);
                return (
                  <button
                    key={n}
                    onClick={() => setSelectedTable(n)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all hover:-translate-y-0.5 ${
                      allPaid
                        ? 'bg-gradient-to-b from-[#8FBF8A]/35 to-[#8FBF8A]/15 border-[#8FBF8A]/60 text-[#F3ECDD] shadow-md shadow-[#8FBF8A]/10'
                        : occupied
                        ? 'bg-gradient-to-b from-brand-orange to-brand-orange-hover border-brand-orange text-[#1A1208] shadow-lg shadow-brand-orange/25'
                        : 'pos-surface border-[#F3ECDD]/10 text-[#F3ECDD] hover:border-brand-orange/50'
                    }`}
                  >
                    <span className="text-xs leading-none opacity-80">{allPaid ? '✓' : occupied ? '🕐' : ''}</span>
                    <span className="font-display font-black text-xl leading-none">{n}</span>
                    {occupied && <span className="text-[10px] font-bold">{formatMAD(total)}</span>}
                  </button>
                );
              })}
            </div>

            {/* A table number outside 1-25 can still happen -- a customer
                typing something odd into the site's free-text table field,
                an old QR code, a typo. Without this, such an order would be
                counted in the "Tables" badge but literally unreachable from
                the grid above, stuck active forever. */}
            {Array.from(tablesMap.keys()).filter((n) => !TABLE_NUMBERS.includes(n)).length > 0 && (
              <div className="mt-6 max-w-3xl">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-2">Autres tables</p>
                <div className="flex flex-wrap gap-3">
                  {Array.from(tablesMap.keys())
                    .filter((n) => !TABLE_NUMBERS.includes(n))
                    .map((n) => {
                      const tOrders = tablesMap.get(n) || [];
                      const total = tOrders.reduce((s, o) => s + o.total, 0);
                      const allPaid = tOrders.every((o) => o.paid);
                      return (
                        <button
                          key={n}
                          onClick={() => setSelectedTable(n)}
                          className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${
                            allPaid
                              ? 'bg-[#8FBF8A]/25 border-[#8FBF8A]/60 text-[#F3ECDD]'
                              : 'bg-brand-orange border-brand-orange text-[#1A1208]'
                          }`}
                        >
                          <span className="font-display font-black text-lg leading-none">Table {n}</span>
                          <span className="text-[10px] font-bold">{formatMAD(total)}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'live' && (
          liveOrders.length === 0 ? (
            <p className="text-[#7A736C] text-center py-20">Aucune commande en cours.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {liveOrders.map((o) => (
                <OrderCard key={o.id} order={o} onAdvance={advance} onTogglePaid={togglePaid} onCancel={cancel} onDelete={deleteOrder} onEditNote={editNote} onRemoveItem={removeItemFromOrder} onApplyDiscount={applyDiscount} />
              ))}
            </div>
          )
        )}

        {tab === 'kitchen' && (
          <div>
            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              {stationPrinterMsg && <span className="text-xs text-[#9A9490]">{stationPrinterMsg}</span>}
              {STATION_PRINTERS.map((station) => (
                <div key={station} className="flex items-center gap-1">
                  <button
                    onClick={() => handleConnectStationPrinter(station)}
                    title={`À cliquer une seule fois, sur l'appareil branché à l'imprimante ${stationPrinterLabel(station)}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      stationPrintersReady[station]
                        ? 'border-[#8FBF8A]/40 text-[#8FBF8A]'
                        : 'border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40'
                    }`}
                  >
                    🖨️ {stationPrintersReady[station] ? `Imprimante ${stationPrinterLabel(station)} connectée` : `Connecter l'imprimante ${stationPrinterLabel(station)}`}
                  </button>
                  {stationPrintersReady[station] && (
                    <button
                      onClick={() => handleTestStationPrinter(station)}
                      title={`Imprimer un ticket de test sur l'imprimante ${stationPrinterLabel(station)}`}
                      className="px-2 py-1.5 rounded-lg text-xs font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                    >
                      Test
                    </button>
                  )}
                </div>
              ))}
            </div>
            {kitchenByStation.length === 0 ? (
              <p className="text-[#7A736C] text-center py-20">Rien à préparer.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {kitchenByStation.map(([station, stOrders]) => (
                <div key={station} className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                  <h3 className="font-display font-black text-lg text-brand-orange mb-3">
                    {station === 'Bar' ? '🍹 Bar' : '🍳 Cuisine'}
                  </h3>
                  <div className="space-y-3">
                    {stOrders.map((o) => {
                      const mins = minutesSince(o.createdAt);
                      const status = o.status || 'new';
                      return (
                        <div key={o.id} className="border-t border-[#F3ECDD]/10 pt-2 first:border-0 first:pt-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-[#F3ECDD]">{kindLabel(o)}</span>
                            <span className={`text-xs font-bold ${elapsedStyle(mins)}`}>{elapsedLabel(mins)}</span>
                          </div>
                          {o.items
                            .filter((it) => (it.station || 'Kitchen') === station)
                            .map((it, i) => (
                              <p key={i} className="text-sm text-[#E3DCCB] ps-2">
                                <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
                              </p>
                            ))}
                          {o.note && (
                            <p className="text-xs text-brand-orange font-bold bg-brand-orange/10 border border-brand-orange/25 rounded-lg px-2 py-1 mt-1.5 ms-2">
                              📝 {o.note}
                            </p>
                          )}
                          <button
                            onClick={() => advance(o)}
                            className="mt-1.5 text-xs font-black px-2.5 py-1.5 rounded-lg bg-brand-orange text-[#1A1208]"
                          >
                            {status === 'preparing' ? 'Marquer prêt' : 'Démarrer'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex gap-2 flex-wrap items-center">
                {(['today', 'yesterday', 'week', 'month', 'custom', 'all'] as ReportRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setReportRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                      reportRange === r ? 'bg-brand-orange text-[#1A1208] border-brand-orange' : 'text-[#9A9490] border-[#F3ECDD]/20'
                    }`}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
                {reportRange === 'custom' && (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-2 py-1.5 text-sm text-[#F3ECDD] focus:outline-none focus:border-brand-orange"
                    />
                    <span className="text-[#7A736C] text-xs">→</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-2 py-1.5 text-sm text-[#F3ECDD] focus:outline-none focus:border-brand-orange"
                    />
                  </span>
                )}
              </div>
              <button
                onClick={wipeAllHistory}
                title="Supprimer définitivement tout l'historique (toutes périodes)"
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-red-500/30 text-red-400/80 hover:text-red-400 hover:border-red-500/60 hover:bg-red-500/10 transition-all"
              >
                🗑️ Vider tout l'historique
              </button>
            </div>
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Rechercher : table, client, Glovo, article…"
              className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 mb-4 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
            />
            {historyOrders.length === 0 ? (
              <p className="text-[#7A736C] text-center py-20">Aucune commande sur cette période.</p>
            ) : (
              <div className="space-y-2">
                {historyOrders.map((o) => (
                  <div key={o.id} className="pos-surface border border-[#F3ECDD]/10 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F3ECDD]">{kindLabel(o)}</p>
                      <p className="text-xs text-[#9A9490] truncate">
                        {o.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')}
                      </p>
                      <p className="text-xs text-[#9A9490]">
                        {o.createdAt?.toDate().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {o.status === 'cancelled' ? 'Annulé' : o.paid ? `Payé (${paymentMethodLabel(o)})` : 'Non payé'}
                      </p>
                      {o.note && <p className="text-xs text-brand-orange font-medium mt-0.5">📝 {o.note}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-brand-orange font-black">{formatMAD(o.total)}</span>
                      <button
                        onClick={() => printOrderReceipt(o)}
                        title="Réimprimer le reçu"
                        className="text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5 text-sm w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      >
                        🖨️
                      </button>
                      <button
                        onClick={() => deleteOrder(o)}
                        title="Supprimer définitivement (serveur inclus)"
                        className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-sm w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex gap-2 flex-wrap items-center">
                {(['today', 'yesterday', 'week', 'month', 'custom', 'all'] as ReportRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setReportRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                      reportRange === r ? 'bg-brand-orange text-[#1A1208] border-brand-orange' : 'text-[#9A9490] border-[#F3ECDD]/20'
                    }`}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
                {reportRange === 'custom' && (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-2 py-1.5 text-sm text-[#F3ECDD] focus:outline-none focus:border-brand-orange"
                    />
                    <span className="text-[#7A736C] text-xs">→</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-2 py-1.5 text-sm text-[#F3ECDD] focus:outline-none focus:border-brand-orange"
                    />
                  </span>
                )}
              </div>
              <button
                onClick={() =>
                  downloadCSV(`domscafe-rapport-${reportRange}.csv`, [
                    ['Date', 'Type', 'Statut', 'Payé', 'Mode', 'Employé', 'Total (MAD)', 'Articles'],
                    ...rangeOrders.map((o) => [
                      o.createdAt?.toDate().toLocaleString('fr-FR') || '',
                      kindLabel(o),
                      o.status || 'new',
                      o.paid ? 'oui' : 'non',
                      o.paid ? paymentMethodLabel(o) : '',
                      o.employeeName || '',
                      o.total,
                      o.items.map((it) => `${it.quantity}x ${it.name}`).join(' | '),
                    ]),
                  ])
                }
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40"
              >
                ⬇ Exporter en CSV
              </button>
            </div>

            <div className="flex gap-2 flex-wrap mb-5">
              <button
                onClick={() => setShowXReport(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#F3ECDD] hover:border-brand-orange/60 transition-all"
              >
                📊 Rapport X
              </button>
              <button
                onClick={() => setShowZReport(true)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                  todayClosure ? 'border-[#8FBF8A]/40 text-[#8FBF8A]' : 'border-[#F3ECDD]/20 text-[#F3ECDD] hover:border-brand-orange/60'
                }`}
              >
                🔒 Rapport Z{todayClosure ? ' (clôturé)' : ''}
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Chiffre d'affaires</p>
                <p className="font-display font-black text-2xl text-brand-orange">{formatMAD(reportStats.revenue)}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Commandes</p>
                <p className="font-display font-black text-2xl text-[#F3ECDD]">{reportStats.orderCount}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Panier moyen</p>
                <p className="font-display font-black text-2xl text-[#F3ECDD]">{formatMAD(reportStats.avg)}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Non payées / annulées</p>
                <p className="font-display font-black text-2xl text-[#F3ECDD]">
                  {reportStats.unpaidCount} <span className="text-[#7A736C] text-base">/ {reportStats.cancelledCount}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3">Mode de paiement</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#9A9490]">💵 Cash</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.cash)}</span></div>
                  <div className="flex justify-between"><span className="text-[#9A9490]">💳 Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.card)}</span></div>
                  <div className="flex justify-between"><span className="text-[#9A9490]">🛵 Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.glovo)}</span></div>
                  {reportStats.unspecified > 0 && (
                    <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.unspecified)}</span></div>
                  )}
                </div>
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3 mt-5">Par type de commande</h3>
                <div className="space-y-2 text-sm">
                  {(['dine_in', 'takeaway', 'delivery', 'glovo'] as OrderKind[]).map((k) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-[#9A9490]">
                        {k === 'dine_in' ? 'Sur place' : k === 'takeaway' ? 'À emporter' : k === 'delivery' ? 'Livraison' : 'Glovo'} ({reportStats.byType[k].count})
                      </span>
                      <span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.byType[k].revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3">Produits les plus vendus</h3>
                {reportStats.topItems.length === 0 ? (
                  <p className="text-[#7A736C] text-sm">Aucune vente sur cette période.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {reportStats.topItems.map((it, i) => (
                      <div key={it.name} className="flex justify-between items-center">
                        <span className="text-[#E3DCCB] truncate pe-2">
                          <span className="text-[#7A736C] font-bold me-1.5">{i + 1}.</span>
                          {it.name}
                        </span>
                        <span className="text-[#9A9490] shrink-0">
                          <span className="font-bold text-brand-orange">{it.qty}×</span> · {formatMAD(it.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3">Chiffre d'affaires par employé</h3>
                {reportStats.byEmployee.length === 0 ? (
                  <p className="text-[#7A736C] text-sm">Aucune vente sur cette période.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {reportStats.byEmployee.map((e) => (
                      <div key={e.name} className="flex justify-between items-center">
                        <span className="text-[#E3DCCB]">{e.name} <span className="text-[#7A736C]">({e.count})</span></span>
                        <span className="font-bold text-brand-orange">{formatMAD(e.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3">Chiffre d'affaires par heure</h3>
                {reportStats.revenue === 0 ? (
                  <p className="text-[#7A736C] text-sm">Aucune vente sur cette période.</p>
                ) : (
                  <div className="flex items-end gap-0.5 h-32">
                    {reportStats.hourly.map((v, h) => {
                      const max = Math.max(...reportStats.hourly, 1);
                      return (
                        <div key={h} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${h}h : ${formatMAD(v)}`}>
                          <div
                            className={`w-full rounded-sm ${v > 0 ? 'bg-brand-orange' : 'bg-[#F3ECDD]/5'}`}
                            style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 2}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-between text-[9px] text-[#7A736C] mt-1">
                  <span>0h</span>
                  <span>12h</span>
                  <span>23h</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'menu' && (
          <div className="max-w-4xl mx-auto">
            {!menuUnlocked ? (
              <div className="text-center py-24">
                <p className="text-2xl mb-2">🔒</p>
                <p className="text-[#9A9490] mb-4">Le code manager est nécessaire pour ouvrir le menu.</p>
                <button
                  onClick={unlockMenu}
                  className="px-5 py-2.5 rounded-xl bg-brand-orange text-[#1A1208] font-display font-black"
                >
                  Déverrouiller
                </button>
              </div>
            ) : (
              <>
                <div className="pos-surface border border-brand-orange/25 rounded-xl p-3 mb-4 text-xs text-[#9A9490] leading-relaxed">
                  ⚠️ Les changements ici (prix, nom, catégorie, station, actif) ne s'appliquent qu'à cet écran caisse.
                  Le site de commande client garde les fiches complètes (3 langues, description, photo) du code tant
                  qu'il n'est pas mis à jour séparément.
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <input
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Rechercher un article…"
                    className="flex-1 min-w-[180px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
                  />
                  <select
                    value={menuCategoryFilter}
                    onChange={(e) => setMenuCategoryFilter(e.target.value)}
                    className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD]"
                  >
                    <option value="all">Toutes catégories</option>
                    {initialCategories
                      .filter((c) => c.id !== 'all')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name.fr}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => setCreatingMenuItem(true)}
                    className="px-3.5 py-2 rounded-lg text-sm font-bold border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 transition-all"
                  >
                    + Nouvel article
                  </button>
                </div>
                <div className="space-y-1.5">
                  {menuItems
                    .filter((it) => menuCategoryFilter === 'all' || it.category === menuCategoryFilter)
                    .filter((it) => !menuSearch.trim() || it.name.fr.toLowerCase().includes(menuSearch.trim().toLowerCase()))
                    .map((it) => {
                      const override = menuOverrides.get(it.id);
                      const catLabel = initialCategories.find((c) => c.id === it.category)?.name.fr || it.category;
                      return (
                        <div
                          key={it.id}
                          className={`flex items-center justify-between gap-3 pos-surface border rounded-lg px-3.5 py-2.5 ${
                            it.available === false ? 'border-red-500/30 opacity-60' : 'border-[#F3ECDD]/10'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#F3ECDD] truncate">
                              {it.name.fr}
                              {it.available === false && (
                                <span className="ms-2 text-[10px] text-red-400 font-black uppercase align-middle">Épuisé</span>
                              )}
                            </p>
                            <p className="text-xs text-[#9A9490]">
                              {catLabel} · {it.station === 'Bar' ? 'Bar' : 'Cuisine'}
                              {override?.isCustom ? ' · ajouté ici' : override ? ' · modifié' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-brand-orange font-black">{formatMAD(it.price)}</span>
                            <button
                              onClick={() => setEditingMenuItem(it)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                            >
                              ✏️ Modifier
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'tv' && (
          <div className="max-w-2xl mx-auto">
            {!tvUnlocked ? (
              <div className="text-center py-24">
                <p className="text-2xl mb-2">🔒</p>
                <p className="text-[#9A9490] mb-4">Le code manager est nécessaire pour ouvrir l'écran TV.</p>
                <button onClick={unlockTv} className="px-5 py-2.5 rounded-xl bg-brand-orange text-[#1A1208] font-display font-black">
                  Déverrouiller
                </button>
              </div>
            ) : (
              <>
                <div className="pos-surface border border-brand-orange/25 rounded-xl p-3 mb-4 text-xs text-[#9A9490] leading-relaxed">
                  📺 Ces slides tournent en boucle sur <span className="font-bold text-[#F3ECDD]">/tv.html</span>, à ouvrir en plein
                  écran dans le navigateur de la Smart TV. Les changements ici apparaissent automatiquement sur l'écran, pas besoin
                  de le rafraîchir manuellement. Ajoute une photo à un slide pour qu'elle s'affiche plein cadre sur l'écran.
                </div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <p className="text-sm text-[#9A9490]">{tvSlides.length} slide{tvSlides.length !== 1 ? 's' : ''}</p>
                  <button
                    onClick={() => setCreatingTvSlide(true)}
                    className="px-3.5 py-2 rounded-lg text-sm font-bold border border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 transition-all"
                  >
                    + Nouveau slide
                  </button>
                </div>
                {tvSlides.length === 0 ? (
                  <p className="text-[#7A736C] text-center py-16">Aucun slide pour l'instant -- l'écran TV affiche le logo par défaut.</p>
                ) : (
                  <div className="space-y-1.5">
                    {tvSlides.map((s, i) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between gap-3 pos-surface border rounded-lg px-3.5 py-2.5 ${
                          s.active === false ? 'border-red-500/30 opacity-60' : 'border-[#F3ECDD]/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {s.imageUrl && (
                            <img src={s.imageUrl} alt="" className="w-11 h-11 rounded-md object-cover shrink-0 border border-[#F3ECDD]/10" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#F3ECDD] truncate">
                              {s.title}
                              {s.active === false && <span className="ms-2 text-[10px] text-red-400 font-black uppercase align-middle">Pause</span>}
                            </p>
                            {(s.subtitle || s.price !== undefined) && (
                              <p className="text-xs text-[#9A9490] truncate">
                                {s.subtitle}
                                {s.subtitle && s.price !== undefined ? ' · ' : ''}
                                {s.price !== undefined ? formatMAD(s.price) : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => moveTvSlide(s.id, -1)}
                            disabled={i === 0}
                            className="text-xs font-bold w-7 h-7 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-30 transition-all"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveTvSlide(s.id, 1)}
                            disabled={i === tvSlides.length - 1}
                            className="text-xs font-bold w-7 h-7 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-30 transition-all"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => setEditingTvSlide(s)}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                          >
                            ✏️ Modifier
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {showNewOrder && (
        <NewOrderPanel menuItems={menuItems} onClose={() => setShowNewOrder(false)} onSubmit={submitNewOrder} />
      )}

      {selectedTable && (
        <TablePanel
          menuItems={menuItems}
          table={selectedTable}
          orders={tablesMap.get(selectedTable) || []}
          onClose={() => setSelectedTable(null)}
          onAddItems={(items, total) => addItemsToTable(selectedTable, items, total)}
          onCheckout={() =>
            setPayingTarget({ kind: 'table', table: selectedTable, orders: tablesMap.get(selectedTable) || [] })
          }
          onAdvanceOrder={advance}
          onCancelOrder={cancel}
          onDeleteOrder={deleteOrder}
          onEditNote={editNote}
          onRemoveItem={removeItemFromOrder}
          onApplyDiscount={applyDiscount}
        />
      )}

      {payingTarget && (
        <PaymentMethodModal
          label={payingTarget.kind === 'table' ? `Table ${payingTarget.table}` : kindLabel(payingTarget.order)}
          total={payingTarget.kind === 'table' ? payingTarget.orders.reduce((s, o) => s + o.total, 0) : payingTarget.order.total}
          onChoose={choosePayment}
          onCancel={() => setPayingTarget(null)}
        />
      )}

      {managerAuthRequest && (
        <ManagerPinModal
          onResult={(ok) => {
            managerAuthRequest.resolve(ok);
            setManagerAuthRequest(null);
          }}
        />
      )}

      {locked && (
        <IdleLockOverlay
          currentEmployee={currentEmployee}
          onUnlock={(e) => {
            setCurrentEmployee(e);
            setLocked(false);
          }}
        />
      )}

      {showXReport && <XReportModal stats={todayStats} onClose={() => setShowXReport(false)} />}

      {showZReport && (
        <ZReportModal stats={todayStats} closure={todayClosure} onClose={() => setShowZReport(false)} onConfirmClose={closeToday} />
      )}

      {editingMenuItem && (
        <MenuItemEditModal
          item={editingMenuItem}
          isCustom={!!menuOverrides.get(editingMenuItem.id)?.isCustom}
          onSave={(patch) => {
            saveMenuOverride(editingMenuItem.id, patch);
            setEditingMenuItem(null);
          }}
          onDelete={
            menuOverrides.has(editingMenuItem.id)
              ? () => {
                  deleteMenuOverride(editingMenuItem.id);
                  setEditingMenuItem(null);
                }
              : undefined
          }
          onClose={() => setEditingMenuItem(null)}
        />
      )}

      {creatingMenuItem && (
        <MenuItemEditModal
          item={null}
          isCustom={true}
          onSave={(patch) => {
            createMenuItem(patch);
            setCreatingMenuItem(false);
          }}
          onClose={() => setCreatingMenuItem(false)}
        />
      )}

      {editingTvSlide && (
        <TvSlideEditModal
          slide={editingTvSlide}
          onSave={(patch) => {
            saveTvSlide(editingTvSlide.id, patch);
            setEditingTvSlide(null);
          }}
          onDelete={() => {
            deleteTvSlide(editingTvSlide.id);
            setEditingTvSlide(null);
          }}
          onClose={() => setEditingTvSlide(null)}
        />
      )}

      {creatingTvSlide && (
        <TvSlideEditModal
          slide={null}
          onSave={(patch) => {
            createTvSlide(patch);
            setCreatingTvSlide(false);
          }}
          onClose={() => setCreatingTvSlide(false)}
        />
      )}

      <p className="fixed bottom-1.5 right-3 text-[9px] text-[#4a423a] pointer-events-none select-none tracking-wide z-30">
        Développé par Amplify Growth Studio
      </p>
    </div>
  );
}
