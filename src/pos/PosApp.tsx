import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  NotebookPen,
  Lock,
  Trash2,
  Banknote,
  CreditCard,
  Tag,
  BarChart3,
  Bike,
  AlertTriangle,
  Tv,
  Pencil,
  Sparkles,
  Flame,
  Bell,
  Hourglass,
  Camera,
  UtensilsCrossed,
  Plus,
  Armchair,
  Receipt,
  History,
  ClipboardList,
  Archive,
  Clock,
  ArrowRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  Calculator,
  QrCode,
  ShoppingBag,
} from 'lucide-react';
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
import { pingPrinterBridge, printEscPosViaBridge } from '../printerBridge';
import { buildTicketEscPosBase64, bytesToBase64, type TicketLine } from '../escpos';
// Types + logique métier partagés avec l'écran propriétaire (OwnerApp.tsx) --
// voir src/shared/posData.ts pour pourquoi c'est extrait plutôt que dupliqué.
import {
  type OrderStatus,
  type OrderSource,
  type OrderKind,
  type PaymentMethod,
  type OrderItem,
  type OrderDoc,
  type MenuOverride,
  type DailyClosure,
  type CashPayout,
  type CashFloat,
  STATUS_LABEL,
  kindOf,
  kindLabel,
  buildMenu,
  computeStats,
  computePayoutsTotal,
  minutesSince,
  elapsedStyle,
  elapsedLabel,
  formatMAD,
  dateStr,
  MOROCCO_TZ,
  moroccoDateTimeToMs,
  BUSINESS_DAY_CUTOFF_HOUR,
} from '../shared/posData';

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
  { name: 'Ahmed', pin: '2710' },
  { name: 'Abdo', pin: '1111' },
  { name: 'Benoissa', pin: '1985' },
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
const TABLE_COUNT = 30;
const TABLE_NUMBERS = Array.from({ length: TABLE_COUNT }, (_, i) => String(i + 1));

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

const STATUS_ICON: Record<OrderStatus, typeof Sparkles> = {
  new: Sparkles,
  preparing: Flame,
  ready: Bell,
  served: Check,
  cancelled: X,
};

// Category groups for the item picker -- purely a display grouping so the
// "Petit-déjeuner / Plats / Boissons / Desserts" sections stay legible
// instead of ~18 category chips wrapping in a random-looking block. The
// underlying category ids/order in firebase.ts's initialCategories are
// untouched; this only decides how they're clustered on screen.
// "Boissons" listed first -- client feedback: les boissons chaudes sont les
// commandes les plus fréquentes, elles doivent être en haut de la liste.
// (Boissons Chaudes is already first within this group, see firebase.ts.)
// Supplément "+ Boisson" proposé pour tout sandwich/tacos à l'unité -- les
// frites sont déjà incluses de base dans chaque sandwich/tacos (confirmé le
// 14/09/2026), donc ce supplément couvre uniquement le soda ajouté, pas un
// "menu" complet. Voir le bouton dédié dans MenuGrid plus bas.
const MENU_SURCHARGE = 8;

// "Emporter" pour les boissons chaudes -- bouton supplémentaire sur la même
// carte (même mécanique que "+ MENU" ci-dessus), -1 DH par rapport au prix
// servi sur place. Demandé le 14/09/2026.
const TAKEAWAY_DISCOUNT = 1;

// Bouton "Extra" -- montant fixe de 6 DH ajouté en un clic, sans passer par
// le menu catégorisé (comme "Montant libre" mais sans les deux prompts,
// puisque le prix et le libellé sont toujours les mêmes). Demandé le
// 14/09/2026.
const EXTRA_PRICE = 6;

const CATEGORY_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Boissons', ids: ['boissons_chaudes', 'jus_cocktails', 'soda'] },
  { label: 'Petit-déj', ids: ['breakfasts', 'omelettes', 'toasts', 'viennoiserie', 'crepes_sucrees', 'crepes_salees'] },
  { label: 'Plats', ids: ['pizzas', 'sandwiches', 'tacos', 'salades'] },
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

// Un seul AudioContext partagé pour tout l'écran, créé au moment du PIN
// (un vrai clic utilisateur) -- corrige le bug "pas de son" : avant, chaque
// appel de playChime() créait un TOUT NOUVEAU AudioContext, et un contexte
// fraîchement créé démarre "suspended" par la politique autoplay du
// navigateur tant qu'il n'a jamais été explicitement repris (resume()) --
// il ne jouait donc jamais réellement, silencieusement, même si aucune
// erreur n'apparaissait. Un seul contexte créé une fois pendant un clic
// réel, puis simplement "resume()" à chaque son, reste "running" pour toute
// la session.
let sharedAudioCtx: AudioContext | null = null;
function unlockChimeAudio() {
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
  } catch {
    // Web Audio unsupported -- playChime() below falls back to a fresh context.
  }
}

// Short two-tone beep via the Web Audio API — no asset file to ship. Reuses
// sharedAudioCtx (see unlockChimeAudio, called on PIN unlock) so it actually
// plays instead of silently sitting in a suspended, never-started context;
// falls back to a fresh one-off context if that shared one somehow isn't
// available yet.
function playChime() {
  try {
    const ctx = sharedAudioCtx && sharedAudioCtx.state !== 'closed'
      ? sharedAudioCtx
      : new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
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
  // Une commande Glovo "carte" veut dire payée dans l'appli Glovo (pas de
  // terminal carte au café) -- "carte" tout court prêterait à confusion.
  if (order.paymentMethod === 'card') return kindOf(order) === 'glovo' ? 'déjà réglé Glovo' : 'carte';
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
  // false une fois la commande réellement payée -- le reçu imprimé à ce
  // moment-là EST le document officiel, plus un brouillon. Par défaut
  // (undefined) = provisoire, pour tout appelant qui ne le précise pas
  // encore. Voir la note du 13/09/2026 plus bas (printReceiptSmart).
  provisional?: boolean;
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
  ${opts.provisional === false ? '' : '<div class="doctype">Document provisoire</div>'}
  <div class="cols"><span>Qté Article</span><span>Prix total</span></div>
  ${itemRows}
  ${opts.note ? `<div class="note">${escapeHtml(opts.note)}</div>` : ''}
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
// kick" : ESC p 0 25 250.
//
// Ancienne version : ce commando partait via WebUSB, directement depuis le
// navigateur -- mais WebUSB ne peut pas prendre le contrôle d'une interface
// que Windows a déjà accaparée avec son propre pilote d'imprimante (exactement
// le même problème que pour les tickets, voir plus bas). D'où l'erreur
// "Access denied" rencontrée en pratique. Fix identique : on passe par
// printhost (voir printhost/README.md et src/printerBridge.ts), qui envoie
// la commande directement à l'imprimante "TICKET" via la file d'impression
// Windows -- aucune boîte de dialogue, aucun conflit de pilote.
const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa]; // ESC p 0 25 250

async function openCashDrawer(): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await printEscPosViaBridge(PRINTER_NAMES.ticket, 'Ouvrir tiroir', bytesToBase64(DRAWER_KICK));
  if (res.ok === false) return { ok: false, message: res.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tickets Ticket/Bar/Cuisine -- 3 imprimantes, toutes déjà installées comme
// imprimantes Windows normales sur le pc du comptoir (confirmé avec Amar :
// une seule machine, "TICKET"/"BAR"/"CUISINE" apparaissent déjà dans la
// liste "Destination" du dialogue d'impression Chrome). Ancienne approche
// WebUSB abandonnée : Windows a déjà accaparé ces imprimantes avec son
// propre pilote (comportement normal, documenté plus haut pour le tiroir),
// donc `navigator.usb.requestDevice()` n'y voit jamais rien à choisir.
//
// Impression automatique et silencieuse (sans AUCUNE boîte de dialogue) via
// le "pont d'impression" -- un petit programme (printhost.exe) installé une
// seule fois sur ce pc (voir printhost/README.md et src/printerBridge.ts)
// qui écoute sur 127.0.0.1 et écrit directement dans la file d'impression
// Windows demandée, en RAW. Sans ce programme (pas encore lancé...), tout
// retombe automatiquement sur l'ancien
// comportement : le bouton "🖨️ Imprimer" manuel du reçu caisse continue de
// fonctionner via window.print(), et les tickets bar/cuisine ne s'impriment
// simplement pas tant que le pont n'est pas détecté (voir printerBridgeReady
// plus bas) -- pas de dialogue intempestif sur cet écran partagé.
const PRINTER_NAMES = { ticket: 'TICKET', bar: 'BAR', cuisine: 'CUISINE' } as const;

function stationPrinterName(station: string): string {
  return station === 'Bar' ? PRINTER_NAMES.bar : PRINTER_NAMES.cuisine;
}

function stationLabel(station: string): string {
  return station === 'Bar' ? 'Bar' : 'Cuisine';
}

function buildKitchenTicketLines(opts: {
  station: string;
  label: string;
  time: string;
  items: { quantity: number; name: string }[];
  note?: string;
}): TicketLine[] {
  const lines: TicketLine[] = [];
  lines.push({ text: opts.station === 'Bar' ? 'BAR' : 'CUISINE', bold: true, size: 'large', align: 'center' });
  lines.push({ text: '================================', align: 'center' });
  lines.push({ text: opts.label, bold: true });
  lines.push({ text: opts.time });
  lines.push({ text: '--------------------------------' });
  opts.items.forEach((it) => lines.push({ text: `${it.quantity}x ${it.name}`, size: 'large' }));
  if (opts.note) {
    lines.push({ text: '--------------------------------' });
    lines.push({ text: `NOTE: ${opts.note}`, bold: true });
  }
  lines.push({ text: '================================' });
  return lines;
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
    ? order.createdAt.toDate().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
  for (const [station, its] of byStation) {
    const lines = buildKitchenTicketLines({ station, label: kindLabel(order), time, items: its, note: order.note });
    const dataBase64 = buildTicketEscPosBase64(lines);
    const res = await printEscPosViaBridge(stationPrinterName(station), `Ticket ${stationLabel(station)}`, dataBase64);
    if (res.ok === false) throw new Error(res.message);
  }
}

function receiptDateLine(ms?: number): string {
  const d = ms ? new Date(ms) : new Date();
  return d.toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Version "lignes" du même reçu, pour le pont d'impression (PDF silencieux)
// -- voir buildReceiptHTML ci-dessus pour l'équivalent HTML utilisé par le
// repli window.print(). Les deux doivent rester équivalents en contenu.
function buildReceiptTicketLines(opts: {
  label: string;
  employeeName?: string;
  dateLine: string;
  items: ReceiptLine[];
  total: number;
  paidLine?: string;
  note?: string;
  // Voir la note à côté de buildReceiptHTML : false = document officiel,
  // le "Document provisoire" ne s'imprime plus dessus.
  provisional?: boolean;
}): TicketLine[] {
  // Tout en gras (bold: true partout) -- demandé le 13/09/2026, le ticket
  // était jugé difficilement lisible imprimé en maigre.
  const lines: TicketLine[] = [];
  lines.push({ text: RECEIPT_BUSINESS.name, bold: true, size: 'large', align: 'center' });
  RECEIPT_BUSINESS.addressLines.forEach((l) => lines.push({ text: l, bold: true, align: 'center', size: 'small' }));
  lines.push({ text: `TEL ${RECEIPT_BUSINESS.phone}`, bold: true, align: 'center', size: 'small' });
  lines.push({ text: `ICE:${RECEIPT_BUSINESS.ice}`, bold: true, align: 'center', size: 'small' });
  lines.push({ text: '--------------------------------' });
  lines.push({ text: opts.label, bold: true });
  if (opts.employeeName) lines.push({ text: `Servi par: ${opts.employeeName.toUpperCase()}`, bold: true, size: 'small' });
  lines.push({ text: '--------------------------------' });
  if (opts.provisional !== false) {
    lines.push({ text: 'Document provisoire', bold: true, align: 'center', size: 'small' });
  }
  opts.items.forEach((it) =>
    lines.push({ text: `${it.quantity} ${it.name.toUpperCase()}  ${formatReceiptPrice(it.lineTotal)}`, bold: true })
  );
  if (opts.note) lines.push({ text: `NOTE: ${opts.note}`, bold: true });
  lines.push({ text: '--------------------------------' });
  lines.push({ text: `TOTAL  ${formatReceiptPrice(opts.total)}`, bold: true, size: 'large' });
  if (opts.paidLine) lines.push({ text: `Statut: ${opts.paidLine}`, bold: true });
  lines.push({ text: '--------------------------------' });
  lines.push({ text: opts.dateLine, bold: true, align: 'center', size: 'small' });
  lines.push({ text: 'Merci de votre visite, a bientot...', bold: true, align: 'center', size: 'small' });
  return lines;
}

// Essaie d'abord le pont d'impression silencieux (imprimante "TICKET",
// aucun dialogue) ; retombe automatiquement sur l'ancien window.print() si
// le pont n'est pas installé/disponible sur ce pc -- jamais d'échec sec.
async function printReceiptSmart(opts: {
  label: string;
  employeeName?: string;
  dateLine: string;
  items: ReceiptLine[];
  total: number;
  paidLine?: string;
  note?: string;
  provisional?: boolean;
}): Promise<void> {
  const dataBase64 = buildTicketEscPosBase64(buildReceiptTicketLines(opts));
  const res = await printEscPosViaBridge(PRINTER_NAMES.ticket, 'Reçu caisse', dataBase64);
  if (res.ok === false) {
    printReceipt(buildReceiptHTML(opts));
  }
}

async function printOrderReceipt(order: OrderDoc): Promise<void> {
  await printReceiptSmart({
    label: kindLabel(order),
    employeeName: order.employeeName,
    dateLine: receiptDateLine(order.createdAt?.toMillis()),
    items: order.items,
    total: order.total,
    paidLine: order.paid ? `Payé${order.paymentMethod ? ` (${paymentMethodLabel(order)})` : ''}` : 'Non payé',
    note: order.note,
    // Officiel dès que c'est payé -- plus de "Document provisoire" sur un
    // reçu qui reflète déjà l'encaissement réel.
    provisional: !order.paid,
  });
}

async function printTableReceipt(table: string, orders: OrderDoc[]): Promise<void> {
  const items = orders.flatMap((o) => o.items);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const allPaid = orders.length > 0 && orders.every((o) => o.paid);
  const notes = orders.map((o) => o.note).filter((n): n is string => !!n);
  // Une table peut accumuler plusieurs commandes (ajouts successifs) avec
  // des employés différents -- affiche le dernier employé à y avoir touché
  // plutôt qu'un mélange, faute de mieux sans notion de "serveur de table".
  const employeeName = orders.length > 0 ? orders[orders.length - 1].employeeName : undefined;
  await printReceiptSmart({
    label: `Table ${table}`,
    employeeName,
    dateLine: receiptDateLine(),
    items,
    total,
    paidLine: allPaid ? 'Payé' : 'Non payé',
    note: notes.length > 0 ? notes.join(' / ') : undefined,
    provisional: !allPaid,
  });
}

// Renvoie TOUS les articles d'une table vers les imprimantes bar/cuisine, à
// la demande -- indépendamment de kitchenPrintedCount et du statut payé.
// Demandé le 16/09/2026 : possibilité de réimprimer/renvoyer le bon vers
// bar/cuisine autant de fois que nécessaire tant que la table n'est pas
// encaissée (par ex. l'imprimante s'est bloquée, ou un serveur a besoin
// d'un second exemplaire). N'affecte pas kitchenPrintedCount : l'impression
// automatique des NOUVEAUX articles continue de fonctionner normalement
// à côté.
async function resendKitchenBon(orders: OrderDoc[]): Promise<void> {
  for (const o of orders) {
    if (o.items.length === 0) continue;
    await printKitchenTicketForOrder(o, o.items);
  }
}

// ---------------------------------------------------------------------------

function EmployeeLoginGate({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    const match = EMPLOYEES.find((e) => e.pin === value);
    if (match) {
      unlockChimeAudio();
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
        <p className="mb-2 flex justify-center"><Lock className="w-9 h-9" /></p>
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
        <p className="mb-1 flex justify-center"><Lock className="w-6 h-6" /></p>
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
  body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: bold; color: #000; width: 74mm; margin: 0 auto; padding: 4px 0; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; letter-spacing: 0.5px; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 8px; line-height: 1.5; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 10px; padding: 1.5px 0; }
  .foot { text-align: center; margin-top: 12px; font-size: 11px; }
</style>
</head>
<body>
  <h1>DOM'S CAFÉ</h1>
  <div class="meta">${escapeHtml(opts.title)}<br/>${escapeHtml(new Date().toLocaleString('fr-FR', { timeZone: 'UTC' }))}</div>
  <div class="rule"></div>
  ${rows}
  ${opts.footer ? `<div class="rule"></div><div class="foot">${escapeHtml(opts.footer)}</div>` : ''}
</body>
</html>`;
}

// Version ESC/POS (imprimante thermique "TICKET", tout en gras -- voir
// printReportReceiptSmart ci-dessous) du même rapport. `bold: true` sur
// toutes les lignes : demandé le 13/09/2026 suite à un ticket jugé
// difficilement lisible une fois imprimé.
function buildReportTicketLines(opts: { title: string; lines: [string, string][]; footer?: string }): TicketLine[] {
  const out: TicketLine[] = [];
  out.push({ text: RECEIPT_BUSINESS.name, bold: true, size: 'large', align: 'center' });
  out.push({ text: opts.title, bold: true, align: 'center' });
  out.push({ text: new Date().toLocaleString('fr-FR', { timeZone: 'UTC' }), bold: true, align: 'center', size: 'small' });
  out.push({ text: '--------------------------------' });
  opts.lines.forEach(([label, value]) => {
    out.push({ text: `${label}  ${value}`, bold: true });
  });
  if (opts.footer) {
    out.push({ text: '--------------------------------' });
    out.push({ text: opts.footer, bold: true, align: 'center', size: 'small' });
  }
  return out;
}

// Rapports X/Z -- même logique "pont silencieux d'abord, HTML/dialogue en
// secours" que printReceiptSmart, mais routé explicitement sur
// PRINTER_NAMES.ticket (l'imprimante principale/reçus, "TICKET"). Avant ce
// changement (13/09/2026), les rapports partaient uniquement via
// printReceipt/window.print(), qui imprime sur l'imprimante par défaut de
// Windows -- laquelle se trouvait être la BAR sur ce pc, d'où le rapport X
// qui sortait au bar au lieu du comptoir principal.
async function printReportReceiptSmart(opts: { title: string; lines: [string, string][]; footer?: string }): Promise<void> {
  const dataBase64 = buildTicketEscPosBase64(buildReportTicketLines(opts));
  const res = await printEscPosViaBridge(PRINTER_NAMES.ticket, opts.title, dataBase64);
  if (res.ok === false) {
    printReceipt(buildReportReceiptHTML(opts));
  }
}

function XReportModal({
  stats,
  payouts,
  orders,
  cashFloat,
  onClose,
}: {
  stats: ReturnType<typeof computeStats>;
  payouts: CashPayout[];
  orders: OrderDoc[];
  cashFloat: CashFloat | null;
  onClose: () => void;
}) {
  const payoutsTotal = computePayoutsTotal(payouts);
  const floatAmount = cashFloat?.amount || 0;
  const cashInDrawer = stats.cash - payoutsTotal + floatAmount;
  // Annulations du jour -- triées du plus récent au plus ancien, avec
  // heure + employé quand connus (commandes annulées avant le 16/09/2026
  // n'ont pas ces deux champs).
  const cancelledToday = orders
    .filter((o) => o.status === 'cancelled')
    .sort((a, b) => (b.cancelledAt?.toMillis() || 0) - (a.cancelledAt?.toMillis() || 0));

  const print = () =>
    printReportReceiptSmart({
      title: 'RAPPORT X (en cours)',
      lines: [
        ...(floatAmount > 0 ? ([['Fond de caisse', formatMAD(floatAmount)]] as [string, string][]) : []),
        ['Chiffre d’affaires', formatMAD(stats.revenue)],
        ['Cash encaissé', formatMAD(stats.cash)],
        ['Carte', formatMAD(stats.card)],
        ['Glovo', formatMAD(stats.glovo)],
        ...(stats.unspecified > 0 ? ([['Non précisé', formatMAD(stats.unspecified)]] as [string, string][]) : []),
        ...(payoutsTotal > 0 || floatAmount > 0
          ? ([
              ...(payoutsTotal > 0
                ? ([
                    ['Sorties de caisse', `- ${formatMAD(payoutsTotal)}`],
                    ...payouts.map((p) => [`  · ${p.reason} (${p.supplierName})`, `- ${formatMAD(p.amount)}`] as [string, string]),
                  ] as [string, string][])
                : []),
              ['Cash en tiroir', formatMAD(cashInDrawer)],
            ] as [string, string][])
          : []),
        ['Commandes', String(stats.orderCount)],
        ['Panier moyen', formatMAD(stats.avg)],
        ...(cancelledToday.length > 0
          ? ([
              ['Annulations', String(cancelledToday.length)],
              ...cancelledToday.map(
                (o) =>
                  [
                    `  · ${o.cancelledAt ? o.cancelledAt.toDate().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '--:--'} ${o.cancelledByEmployee || 'Inconnu'}`,
                    formatMAD(o.total),
                  ] as [string, string]
              ),
            ] as [string, string][])
          : []),
      ],
      footer: 'Aperçu -- ne clôture rien.',
    });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop max-h-[90vh] overflow-y-auto">
        <p className="mb-1 flex justify-center"><BarChart3 className="w-6 h-6" /></p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Rapport X</h3>
        <p className="text-[#9A9490] text-xs mb-5 text-center">
          Aperçu de la journée en cours depuis 00h00 -- consultable à tout moment, ne réinitialise rien.
        </p>
        <div className="space-y-1.5 text-sm mb-5">
          {floatAmount > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">Fond de caisse</span><span className="font-bold text-[#F3ECDD]">{formatMAD(floatAmount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-[#9A9490]">Chiffre d'affaires</span><span className="font-bold text-brand-orange">{formatMAD(stats.revenue)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Banknote className="inline-block w-3.5 h-3.5" /> Cash encaissé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.cash)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><CreditCard className="inline-block w-3.5 h-3.5" /> Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.card)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Bike className="inline-block w-3.5 h-3.5" /> Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.glovo)}</span></div>
          {stats.unspecified > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(stats.unspecified)}</span></div>
          )}
          {(payoutsTotal > 0 || floatAmount > 0) && (
            <>
              <div className="pt-1.5 border-t border-[#F3ECDD]/10" />
              {payoutsTotal > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><ArrowDown className="inline-block w-3.5 h-3.5" /> Sorties de caisse</span><span className="font-bold text-red-400">- {formatMAD(payoutsTotal)}</span></div>
                  {payouts.map((p) => (
                    <div key={p.id} className="flex justify-between pl-4 text-xs"><span className="text-[#7A736C]">{p.reason} · {p.supplierName}</span><span className="text-[#9A9490]">- {formatMAD(p.amount)}</span></div>
                  ))}
                </>
              )}
              <div className="flex justify-between"><span className="text-[#9A9490]">Cash en tiroir</span><span className="font-bold text-[#F3ECDD]">{formatMAD(cashInDrawer)}</span></div>
            </>
          )}
          <div className="flex justify-between pt-1.5 border-t border-[#F3ECDD]/10"><span className="text-[#9A9490]">Commandes</span><span className="font-bold text-[#F3ECDD]">{stats.orderCount}</span></div>
          {cancelledToday.length > 0 && (
            <>
              <div className="pt-1.5 border-t border-[#F3ECDD]/10" />
              <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><X className="inline-block w-3.5 h-3.5" /> Annulations</span><span className="font-bold text-red-400">{cancelledToday.length}</span></div>
              {cancelledToday.map((o) => (
                <div key={o.id} className="flex justify-between pl-4 text-xs">
                  <span className="text-[#7A736C]">
                    {o.cancelledAt ? o.cancelledAt.toDate().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '--:--'} · {o.cancelledByEmployee || 'Inconnu'}
                  </span>
                  <span className="text-[#9A9490]">{formatMAD(o.total)}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <button
          onClick={print}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-[#1A1208] font-display font-black py-3 rounded-xl shadow-lg shadow-brand-orange/20 transition-all mb-2 flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" /> Imprimer
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
  payouts,
  closure,
  cashFloat,
  onClose,
  onConfirmClose,
}: {
  stats: ReturnType<typeof computeStats>;
  payouts: CashPayout[];
  closure: DailyClosure | null;
  cashFloat: CashFloat | null;
  onClose: () => void;
  onConfirmClose: () => void;
}) {
  const display = closure
    ? { revenue: closure.revenue, cash: closure.cash, card: closure.card, glovo: closure.glovo, unspecified: closure.unspecified, orderCount: closure.orderCount }
    : stats;
  // Une fois clôturée, la journée affiche le total des sorties tel que figé
  // dans le doc de clôture (`payoutsTotal`, 0 pour une clôture d'avant le
  // 13/09/2026) ; tant que non clôturée, la liste live `payouts` -- avec le
  // détail motif par motif, absent du doc de clôture qui ne garde que le
  // total. Même principe pour le fond de caisse (`cashFloatAmount`, 0 pour
  // une clôture d'avant le 16/09/2026).
  const payoutsTotal = closure ? closure.payoutsTotal || 0 : computePayoutsTotal(payouts);
  const floatAmount = closure ? closure.cashFloatAmount || 0 : cashFloat?.amount || 0;
  const cashInDrawer = display.cash - payoutsTotal + floatAmount;

  const print = () =>
    printReportReceiptSmart({
      title: closure ? 'RAPPORT Z (clôturé)' : 'RAPPORT Z',
      lines: [
        ...(floatAmount > 0 ? ([['Fond de caisse', formatMAD(floatAmount)]] as [string, string][]) : []),
        ['Chiffre d’affaires', formatMAD(display.revenue)],
        ['Cash encaissé', formatMAD(display.cash)],
        ['Carte', formatMAD(display.card)],
        ['Glovo', formatMAD(display.glovo)],
        ...(display.unspecified > 0 ? ([['Non précisé', formatMAD(display.unspecified)]] as [string, string][]) : []),
        ...(payoutsTotal > 0 || floatAmount > 0
          ? ([
              ...(payoutsTotal > 0
                ? ([
                    ['Sorties de caisse', `- ${formatMAD(payoutsTotal)}`],
                    ...(!closure ? payouts.map((p) => [`  · ${p.reason} (${p.supplierName})`, `- ${formatMAD(p.amount)}`] as [string, string]) : []),
                  ] as [string, string][])
                : []),
              ['Cash en tiroir', formatMAD(cashInDrawer)],
            ] as [string, string][])
          : []),
        ['Commandes', String(display.orderCount)],
      ],
      footer: closure
        ? `Clôturé le ${new Date(closure.closedAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} par ${closure.closedByEmployee}`
        : undefined,
    });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <p className="mb-1 flex justify-center"><Lock className="w-6 h-6" /></p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Rapport Z -- clôture du jour</h3>
        {closure ? (
          <p className="text-[#8FBF8A] text-xs mb-5 text-center font-bold">
            Journée déjà clôturée le {new Date(closure.closedAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} par {closure.closedByEmployee}.
          </p>
        ) : (
          <p className="text-[#9A9490] text-xs mb-5 text-center">
            Clôture la journée en cours et fige les chiffres ci-dessous. Nécessite le code manager. Cette action ne peut pas être annulée.
          </p>
        )}
        <div className="space-y-1.5 text-sm mb-5">
          <div className="flex justify-between"><span className="text-[#9A9490]">Chiffre d'affaires</span><span className="font-bold text-brand-orange">{formatMAD(display.revenue)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Banknote className="inline-block w-3.5 h-3.5" /> Cash encaissé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.cash)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><CreditCard className="inline-block w-3.5 h-3.5" /> Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.card)}</span></div>
          <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Bike className="inline-block w-3.5 h-3.5" /> Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.glovo)}</span></div>
          {display.unspecified > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(display.unspecified)}</span></div>
          )}
          {floatAmount > 0 && (
            <div className="flex justify-between"><span className="text-[#9A9490]">Fond de caisse</span><span className="font-bold text-[#F3ECDD]">{formatMAD(floatAmount)}</span></div>
          )}
          {(payoutsTotal > 0 || floatAmount > 0) && (
            <>
              <div className="pt-1.5 border-t border-[#F3ECDD]/10" />
              {payoutsTotal > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><ArrowDown className="inline-block w-3.5 h-3.5" /> Sorties de caisse</span><span className="font-bold text-red-400">- {formatMAD(payoutsTotal)}</span></div>
                  {!closure &&
                    payouts.map((p) => (
                      <div key={p.id} className="flex justify-between pl-4 text-xs"><span className="text-[#7A736C]">{p.reason} · {p.supplierName}</span><span className="text-[#9A9490]">- {formatMAD(p.amount)}</span></div>
                    ))}
                </>
              )}
              <div className="flex justify-between"><span className="text-[#9A9490]">Cash en tiroir</span><span className="font-bold text-[#F3ECDD]">{formatMAD(cashInDrawer)}</span></div>
            </>
          )}
          <div className="flex justify-between pt-1.5 border-t border-[#F3ECDD]/10"><span className="text-[#9A9490]">Commandes</span><span className="font-bold text-[#F3ECDD]">{display.orderCount}</span></div>
        </div>
        <button
          onClick={print}
          className="w-full bg-[#3a332b] hover:bg-[#463e34] active:scale-[0.98] text-[#F3ECDD] font-display font-black py-3 rounded-xl transition-all mb-2 flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" /> Imprimer
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
            } flex items-center justify-center gap-1.5`}
          >
            {active ? (
              <><Check className="w-4 h-4" /> Actif</>
            ) : (
              <><X className="w-4 h-4" /> Épuisé / masqué</>
            )}
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
          <button onClick={onDelete} className="w-full text-red-400/80 hover:text-red-400 text-sm font-bold py-2 mb-1 transition-colors flex items-center justify-center gap-1.5">
            {isCustom ? (
              <><Trash2 className="w-4 h-4" /> Supprimer</>
            ) : (
              <><RotateCcw className="w-4 h-4" /> Réinitialiser (valeurs du code)</>
            )}
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
                  <X className="w-4 h-4" />
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
                <span className="text-xl">{uploading ? <Hourglass className="w-5 h-5" /> : <Camera className="w-5 h-5" />}</span>
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
            } flex items-center justify-center gap-1.5`}
          >
            {active ? (
              <><Check className="w-4 h-4" /> En rotation sur la TV</>
            ) : (
              <><X className="w-4 h-4" /> En pause (masqué)</>
            )}
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
          <button onClick={onDelete} className="w-full text-red-400/80 hover:text-red-400 text-sm font-bold py-2 mb-1 transition-colors flex items-center justify-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Supprimer
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

// Sortie de caisse -- payer un fournisseur (ou toute autre dépense) en cash
// directement depuis le tiroir. Motif + montant sont tous les deux
// obligatoires : c'est tout le point de ce modal ("waarvoor er betaald is en
// wat voor bedrag" doit toujours être su). Protégé par le code manager côté
// appelant (voir handleConfirmCashPayout), comme les autres actions qui
// touchent à l'argent (remise, annulation).
function CashPayoutModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string, amount: number, supplierName: string) => void;
  onCancel: () => void;
}) {
  const [supplierName, setSupplierName] = useState('');
  const [reason, setReason] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const amount = parseFloat(amountRaw.replace(',', '.'));
  const valid = supplierName.trim().length > 0 && reason.trim().length > 0 && isFinite(amount) && amount > 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <p className="mb-1 flex justify-center"><Banknote className="w-6 h-6 text-brand-orange" /></p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Sortie de caisse</h3>
        <p className="text-[#9A9490] text-xs mb-5 text-center">
          Argent qui sort du tiroir pour autre chose qu'une commande -- payer un fournisseur, une course, etc. Le fournisseur, le motif et le montant restent dans les rapports.
        </p>
        <div className="text-start mb-3">
          <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Fournisseur (obligatoire)</label>
          <input
            type="text"
            autoFocus
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="ex. Marjane, boucherie du coin..."
            className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-base text-[#F3ECDD] focus:outline-none focus:border-brand-orange transition-shadow"
          />
        </div>
        <div className="text-start mb-3">
          <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Motif (obligatoire)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex. Fournisseur légumes"
            className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-base text-[#F3ECDD] focus:outline-none focus:border-brand-orange transition-shadow"
          />
        </div>
        <div className="text-start mb-5">
          <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Montant (MAD)</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-base text-[#F3ECDD] focus:outline-none focus:border-brand-orange transition-shadow"
          />
        </div>
        <button
          onClick={() => valid && onConfirm(reason.trim(), Math.round(amount * 100) / 100, supplierName.trim())}
          disabled={!valid}
          className="w-full py-3.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          Confirmer la sortie
        </button>
        <button onClick={onCancel} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Fond de caisse -- montant en cash déposé dans le tiroir au début de la
// journée, avant toute vente. Un seul champ, pas de code manager requis
// (c'est une simple déclaration, pas une action qui touche à l'argent
// déjà encaissé). Modifiable à tout moment dans la journée si besoin.
function CashFloatModal({
  current,
  onConfirm,
  onCancel,
}: {
  current: CashFloat | null;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [amountRaw, setAmountRaw] = useState(current ? String(current.amount) : '');
  const amount = parseFloat(amountRaw.replace(',', '.'));
  const valid = isFinite(amount) && amount >= 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 animate-pop">
        <p className="mb-1 flex justify-center"><Banknote className="w-6 h-6 text-brand-orange" /></p>
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1 text-center">Fond de caisse</h3>
        <p className="text-[#9A9490] text-xs mb-5 text-center">
          Montant en cash déjà dans le tiroir ce matin, avant toute vente. Utilisé pour calculer le « cash en tiroir » attendu dans les rapports X/Z.
          {current && (
            <>
              <br />
              <span className="text-[#7A736C]">Déjà défini aujourd'hui à {formatMAD(current.amount)} par {current.setByEmployee}.</span>
            </>
          )}
        </p>
        <div className="text-start mb-5">
          <label className="block text-[10px] font-bold text-[#7A736C] mb-1 uppercase tracking-wider">Montant (MAD)</label>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            min={0}
            step="0.01"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 text-base text-[#F3ECDD] focus:outline-none focus:border-brand-orange transition-shadow"
          />
        </div>
        <button
          onClick={() => valid && onConfirm(Math.round(amount * 100) / 100)}
          disabled={!valid}
          className="w-full py-3.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black shadow-lg shadow-brand-orange/20 transition-all mb-2"
        >
          Enregistrer
        </button>
        <button onClick={onCancel} className="w-full text-[#9A9490] text-sm font-bold hover:text-[#F3ECDD] transition-colors">
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
  onTogglePaid: (order: OrderDoc, method?: PaymentMethod) => void | Promise<void>;
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
            <NotebookPen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onApplyDiscount(order)}
            title="Appliquer une remise (code manager)"
            className={`text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              order.discount ? 'text-brand-orange hover:text-brand-orange-hover hover:bg-brand-orange/10' : 'text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => printOrderReceipt(order)}
            title="Imprimer le reçu"
            className="text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5 text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onCancel(order)}
            title="Annuler la commande"
            className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-xs w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(order)}
            title="Supprimer définitivement (serveur inclus)"
            className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-sm w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {order.note && (
        <div className="bg-brand-orange/10 border border-brand-orange/25 rounded-lg px-3 py-2 flex items-start gap-2">
          <span className="text-sm shrink-0"><NotebookPen className="w-3.5 h-3.5" /></span>
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
          <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" /> Remise appliquée</span>
          <span>-{formatMAD(order.discount)}</span>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[#F3ECDD]/10 pt-2.5 gap-2">
        <span className="font-display font-black text-brand-orange text-xl shrink-0">{formatMAD(order.total)}</span>
        {order.paid ? (
          <button
            onClick={() => onTogglePaid(order)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors bg-[#8FBF8A]/15 text-[#8FBF8A] border-[#8FBF8A]/40"
          >
            <span className="inline-flex items-center gap-1">
              <Check className="w-3 h-3" /> Payé{order.paymentMethod ? ` (${paymentMethodLabel(order)})` : ''}
            </span>
          </button>
        ) : kindOf(order) === 'glovo' ? (
          // Glovo, depuis qu'on y livre (24/09/2026) : le client a pu payer
          // cash au livreur (COD) OU déjà tout régler dans l'appli Glovo --
          // contrairement aux autres commandes du café (toujours cash), il
          // faut donc pouvoir dire lequel des deux au moment d'encaisser.
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onTogglePaid(order, 'cash')}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-[#F3ECDD]/20 text-[#9A9490] hover:border-[#F3ECDD]/40 transition-colors"
            >
              Cash (COD)
            </button>
            <button
              onClick={() => onTogglePaid(order, 'card')}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-teal-500/40 text-teal-300 hover:bg-teal-500/10 transition-colors"
            >
              Déjà payé (Glovo)
            </button>
          </div>
        ) : (
          <button
            onClick={() => onTogglePaid(order)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-transparent text-[#9A9490] border-[#F3ECDD]/20 hover:border-[#F3ECDD]/40 transition-colors"
          >
            Marquer payé
          </button>
        )}
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
          <UtensilsCrossed className="inline-block w-4 h-4" /> Tout
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
            onClick={() => handleAdd(`extra-${Date.now()}`, 'Extra', EXTRA_PRICE)}
            title={`Ajouter "Extra" (${EXTRA_PRICE} DH), sans passer par le menu`}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Extra ({EXTRA_PRICE} DH)
          </button>
          <button
            onClick={handleAddCustomAmount}
            title="Ajouter un article avec un montant et une description libres"
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Montant libre
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {items.map((it) => {
            const color = GROUP_COLOR[groupLabelByCategoryId.get(it.category) || ''] || '#C9A15A';
            // "+ MENU" -- demandé le 14/09/2026 : pour un sandwich/tacos à
            // l'unité, un bouton séparé ajoute le même article +8 DH avec
            // "(Menu)" dans le nom (visible sur le ticket cuisine et le
            // reçu). Les deux anciens articles fixes "Formule menu"
            // (s-formule/tc-formule) ont été retirés le 14/09/2026.
            const menuEligible = it.category === 'sandwiches' || it.category === 'tacos';
            const menuAddId = `${it.id}::menu`;
            const takeawayEligible = it.category === 'boissons_chaudes';
            const takeawayAddId = `${it.id}::emporter`;
            // "Gratis" -- carte de fidélité boissons chaudes (10 achetées,
            // la 11e offerte). Ajoute la boisson à 0 DH, avec "(Gratis -
            // fidélité)" dans le nom pour que ça reste traçable sur le
            // ticket cuisine et le reçu, et visible dans les rapports comme
            // une vente à 0 DH plutôt que de disparaître. Demandé le
            // 16/09/2026.
            const freeEligible = it.category === 'boissons_chaudes';
            const freeAddId = `${it.id}::gratis`;
            return (
              <div
                key={it.id}
                className={`relative overflow-hidden pos-surface border rounded-xl p-3.5 pt-4 transition-all ${
                  justAdded === it.id || justAdded === menuAddId || justAdded === takeawayAddId || justAdded === freeAddId
                    ? 'border-brand-orange ring-2 ring-brand-orange/60 animate-pop'
                    : 'border-[#F3ECDD]/10 hover:border-brand-orange/50'
                }`}
              >
                <span className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />
                <button
                  onClick={() => handleAdd(it.id, it.name.fr, it.price, it.station)}
                  className="w-full text-start active:scale-[0.96]"
                >
                  <p className="text-base font-bold text-[#F3ECDD] leading-tight">{it.name.fr}</p>
                  <p className="text-base text-brand-orange font-display font-black mt-1">{formatMAD(it.price)}</p>
                </button>
                {menuEligible && (
                  <button
                    onClick={() => handleAdd(menuAddId, `${it.name.fr} (Menu)`, it.price + MENU_SURCHARGE, it.station)}
                    title={`Menu : +${MENU_SURCHARGE} DH`}
                    className="mt-2 w-full text-xs font-bold py-1.5 rounded-lg border border-brand-orange/40 text-brand-orange bg-brand-orange/10 hover:bg-brand-orange/20 active:scale-[0.96] transition-all"
                  >
                    + MENU (+{MENU_SURCHARGE} DH)
                  </button>
                )}
                {takeawayEligible && (
                  <button
                    onClick={() => handleAdd(takeawayAddId, `${it.name.fr} (Emporter)`, it.price - TAKEAWAY_DISCOUNT, it.station)}
                    title={`Emporter : -${TAKEAWAY_DISCOUNT} DH`}
                    className="mt-2 w-full text-xs font-bold py-1.5 rounded-lg border border-brand-orange/40 text-brand-orange bg-brand-orange/10 hover:bg-brand-orange/20 active:scale-[0.96] transition-all"
                  >
                    Emporter (-{TAKEAWAY_DISCOUNT} DH)
                  </button>
                )}
                {freeEligible && (
                  <button
                    onClick={() => handleAdd(freeAddId, `${it.name.fr} (Gratis - fidélité)`, 0, it.station)}
                    title="Boisson offerte -- carte de fidélité (10 achetées, la 11e offerte)"
                    className="mt-1.5 w-full text-xs font-bold py-1.5 rounded-lg border border-[#8FBF8A]/40 text-[#8FBF8A] bg-[#8FBF8A]/10 hover:bg-[#8FBF8A]/20 active:scale-[0.96] transition-all"
                  >
                    Gratis (fidélité)
                  </button>
                )}
              </div>
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
            placeholder="Remarque (allergie, sans oignon...)"
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
  onSplitPay,
  onMoveTable,
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
  onSplitPay: (table: string, orders: OrderDoc[], selection: { orderId: string; itemIndex: number; qty: number }[]) => Promise<void>;
  onMoveTable: (toTable: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [resentBon, setResentBon] = useState(false);
  const [moving, setMoving] = useState(false);
  const { draft, addItem, changeQty, total, asOrderItems, reset } = useDraft();

  const billTotal = orders.reduce((s, o) => s + o.total, 0);
  const allPaid = orders.length > 0 && orders.every((o) => o.paid);

  // Départ anticipé -- un client de la table veut partir et payer sa part
  // tout de suite, avant les autres (voir capture de l'ancien logiciel
  // PointeX envoyée par Amar : deux "tickets" côte à côte, un article qu'on
  // détache dans l'un ou l'autre). Volontairement plus simple que l'ancien
  // système (pas de partage 50/50 d'un même article) : on sélectionne
  // combien d'unités de chaque ligne partent avec cette personne, cette
  // part est encaissée cash immédiatement et son propre petit ticket
  // s'imprime, le reste de l'addition continue normalement pour la table.
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelection, setSplitSelection] = useState<Record<string, number>>({});
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  const splitKey = (orderId: string, itemIndex: number) => `${orderId}:${itemIndex}`;
  const setSplitQty = (orderId: string, itemIndex: number, max: number, qty: number) => {
    const clamped = Math.max(0, Math.min(max, qty));
    setSplitSelection((prev) => {
      const next = { ...prev };
      const key = splitKey(orderId, itemIndex);
      if (clamped === 0) delete next[key];
      else next[key] = clamped;
      return next;
    });
  };
  const splitTotal = orders.reduce(
    (sum, o) =>
      sum +
      o.items.reduce((s, it, i) => s + it.unitPrice * (splitSelection[splitKey(o.id, i)] || 0), 0),
    0
  );
  const splitCount = Object.values(splitSelection).reduce((s, q) => s + q, 0);
  const exitSplitMode = () => {
    setSplitMode(false);
    setSplitSelection({});
  };
  const confirmSplitPay = async () => {
    if (splitCount === 0 || splitSubmitting) return;
    setSplitSubmitting(true);
    const selection = Object.entries(splitSelection).map(([key, qty]) => {
      const [orderId, itemIndex] = key.split(':');
      return { orderId, itemIndex: Number(itemIndex), qty };
    });
    await onSplitPay(table, orders, selection);
    setSplitSubmitting(false);
    exitSplitMode();
  };

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
                    <span className="text-xs font-bold text-[#9A9490] inline-flex items-center gap-1">
                      {(() => {
                        const StatusIcon = STATUS_ICON[status];
                        return <StatusIcon className="inline-block w-3 h-3" />;
                      })()}
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
                        <NotebookPen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onApplyDiscount(o)}
                        title="Appliquer une remise (code manager)"
                        className={`text-[11px] font-bold transition-colors ${o.discount ? 'text-brand-orange hover:text-brand-orange-hover' : 'text-[#7A736C] hover:text-[#F3ECDD]'}`}
                      >
                        <Tag className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDeleteOrder(o)} title="Supprimer définitivement (serveur inclus)" className="text-[11px] font-bold text-[#7A736C] hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {o.note && (
                    <div className="bg-brand-orange/10 border border-brand-orange/25 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
                      <span className="text-xs shrink-0"><NotebookPen className="w-3.5 h-3.5" /></span>
                      <p className="text-xs text-brand-orange font-medium leading-snug">{o.note}</p>
                    </div>
                  )}
                  {o.items.map((it, i) => {
                    const selQty = splitSelection[splitKey(o.id, i)] || 0;
                    return (
                      <div key={i} className="flex justify-between items-center gap-1.5 text-sm text-[#E3DCCB]">
                        <span>
                          <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
                        </span>
                        {splitMode ? (
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center gap-1.5 pos-surface rounded-full px-1 py-0.5">
                              <button
                                onClick={() => setSplitQty(o.id, i, it.quantity, selQty - 1)}
                                disabled={selQty === 0}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[#F3ECDD] disabled:opacity-30 hover:bg-white/10 transition-colors"
                              >
                                −
                              </button>
                              <span className={`w-4 text-center text-xs font-black ${selQty > 0 ? 'text-brand-orange' : 'text-[#7A736C]'}`}>{selQty}</span>
                              <button
                                onClick={() => setSplitQty(o.id, i, it.quantity, selQty + 1)}
                                disabled={selQty >= it.quantity}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[#F3ECDD] disabled:opacity-30 hover:bg-white/10 transition-colors"
                              >
                                +
                              </button>
                            </span>
                          </span>
                        ) : (
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
                        )}
                      </div>
                    );
                  })}
                  {!!o.discount && (
                    <div className="flex justify-between text-xs text-brand-orange font-bold mt-1">
                      <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" /> Remise</span>
                      <span>-{formatMAD(o.discount)}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {splitMode ? (
              <div className="flex items-center justify-between pt-2 border-t border-[#F3ECDD]/10">
                <div>
                  <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold">Départ anticipé -- part sélectionnée</p>
                  <span className="font-display font-black text-brand-orange text-2xl">{formatMAD(splitTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exitSplitMode} className="text-sm font-bold px-3.5 py-2.5 rounded-lg text-[#9A9490] hover:text-[#F3ECDD] transition-all">
                    Annuler
                  </button>
                  <button
                    onClick={confirmSplitPay}
                    disabled={splitCount === 0 || splitSubmitting}
                    className="text-sm font-black px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] shadow-lg shadow-brand-orange/20 transition-all"
                  >
                    {splitSubmitting ? 'Encaissement…' : `Encaisser cette part — ${formatMAD(splitTotal)}`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-[#F3ECDD]/10">
                <span className="font-display font-black text-brand-orange text-2xl">{formatMAD(billTotal)}</span>
                <div className="flex items-center gap-2">
                  {!allPaid && (
                    <button
                      onClick={() => setSplitMode(true)}
                      title="Un client part plus tôt et paie sa part en cash tout de suite"
                      className="text-sm font-bold px-3.5 py-2.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-4 h-4" /> Départ anticipé
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (moving) return;
                      const raw = window.prompt(`Déplacer la table ${table} vers quel numéro de table ?`, '');
                      if (raw === null) return;
                      const target = raw.trim();
                      if (!target) return;
                      setMoving(true);
                      await onMoveTable(target);
                      setMoving(false);
                    }}
                    disabled={moving}
                    title="Déplacer cette table (client qui change de place) vers un autre numéro"
                    className="text-sm font-bold px-3.5 py-2.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-40 transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeftRight className="w-4 h-4" /> {moving ? 'Déplacement…' : 'Déplacer'}
                  </button>
                  <button
                    onClick={() => printTableReceipt(table, orders)}
                    title="Imprimer le reçu -- utilisable autant de fois que nécessaire, même si la table n'est pas encore payée"
                    className="text-sm font-bold px-3.5 py-2.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" /> Imprimer
                  </button>
                  <button
                    onClick={() => {
                      resendKitchenBon(orders).catch((err) => console.warn('Renvoi bar/cuisine : échec', err));
                      setResentBon(true);
                      window.setTimeout(() => setResentBon(false), 2500);
                    }}
                    title="Renvoyer tous les articles de cette table vers les imprimantes bar/cuisine, autant de fois que nécessaire"
                    className="text-sm font-bold px-3.5 py-2.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all flex items-center gap-1.5"
                  >
                    <UtensilsCrossed className="w-4 h-4" /> {resentBon ? 'Envoyé !' : 'Bar/Cuisine'}
                  </button>
                  <button
                    onClick={onCheckout}
                    className="text-sm font-black px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.97] text-[#1A1208] shadow-lg shadow-brand-orange/20 transition-all"
                  >
                    {allPaid ? 'Clôturer la table' : 'Encaisser'}
                  </button>
                </div>
              </div>
            )}
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

type Tab = 'tables' | 'live' | 'history' | 'reports' | 'menu' | 'tv';
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

// dateStr() est maintenant importée de ../shared/posData (calcul explicite
// sur le fuseau horaire du Maroc -- voir posData.ts pour le pourquoi).

// Bornes de plage ("aujourd'hui", "hier", "7 derniers jours"...) calculées
// sur le jour civil au Maroc (voir dateStr/moroccoDateTimeToMs dans
// ../shared/posData) -- et non plus sur le fuseau horaire réglé sur
// l'appareil qui exécute le site, qui pouvait ne pas être celui du Maroc.
// Chaque borne "début de journée" se situe à BUSINESS_DAY_CUTOFF_HOUR (01:00)
// et non à minuit -- voir le commentaire sur BUSINESS_DAY_CUTOFF_HOUR dans
// posData.ts. dateStr() donne déjà l'étiquette du bon jour commercial pour
// n'importe quel instant (y compris 00:xx, qui compte encore pour la
// veille) ; il suffit donc de placer la frontière elle-même à 01:00 ce
// jour-là au lieu de 00:00.
function rangeStart(range: ReportRange, customStart?: string): number {
  if (range === 'all') return 0;
  const [ty, tm, td] = dateStr().split('-').map(Number);
  const todayStartMs = moroccoDateTimeToMs(ty, tm, td, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  if (range === 'today') return todayStartMs;
  if (range === 'yesterday') {
    const [y, m, day] = dateStr(new Date(todayStartMs - 86400000)).split('-').map(Number);
    return moroccoDateTimeToMs(y, m, day, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  }
  if (range === 'week') {
    const [y, m, day] = dateStr(new Date(todayStartMs - 6 * 86400000)).split('-').map(Number);
    return moroccoDateTimeToMs(y, m, day, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  }
  if (range === 'custom') {
    if (!customStart) return 0;
    const [y, m, day] = customStart.split('-').map(Number);
    return moroccoDateTimeToMs(y, m || 1, day || 1, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
  }
  // month
  const [y, m, day] = dateStr(new Date(todayStartMs - 29 * 86400000)).split('-').map(Number);
  return moroccoDateTimeToMs(y, m, day, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
}

function rangeEnd(range: ReportRange, customEnd?: string): number {
  // Fin de journée commerciale = juste avant 01:00 le lendemain, donc
  // heure = 24 + (CUTOFF_HOUR - 1) : Date.UTC() déborde proprement sur le
  // jour suivant, pas besoin de recalculer le jour à la main.
  const endHour = 24 + (BUSINESS_DAY_CUTOFF_HOUR - 1);
  if (range === 'yesterday') {
    const [ty, tm, td] = dateStr().split('-').map(Number);
    const todayStartMs = moroccoDateTimeToMs(ty, tm, td, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0);
    const [y, m, day] = dateStr(new Date(todayStartMs - 86400000)).split('-').map(Number);
    return moroccoDateTimeToMs(y, m, day, endHour, 59, 59, 999);
  }
  if (range === 'custom') {
    if (!customEnd) return Date.now();
    const [y, m, day] = customEnd.split('-').map(Number);
    return moroccoDateTimeToMs(y, m || 1, day || 1, endHour, 59, 59, 999);
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
  // Recherche d'un ou plusieurs plats dans l'onglet Rapports -- combien de
  // fois vendus (cumulés) sur la période choisie plus haut.
  const [selectedDishes, setSelectedDishes] = useState<Set<string>>(new Set());
  const [historySearch, setHistorySearch] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('all');
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [creatingMenuItem, setCreatingMenuItem] = useState(false);
  const [editingTvSlide, setEditingTvSlide] = useState<TvSlide | null>(null);
  const [creatingTvSlide, setCreatingTvSlide] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
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

  // Fond de caisse -- montant déposé dans le tiroir au début de la
  // journée (avant toute vente), un doc par jour civil comme
  // dailyClosures. Demandé le 16/09/2026 pour que "cash en tiroir" dans
  // les rapports reflète vraiment ce qu'il devrait y avoir dans le tiroir.
  const [todayCashFloat, setTodayCashFloat] = useState<CashFloat | null>(null);
  const [showCashFloat, setShowCashFloat] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(doc(db, 'cashFloats', dateStr()), (snap) => {
      setTodayCashFloat(snap.exists() ? (snap.data() as CashFloat) : null);
    });
    return () => unsub();
  }, [unlocked]);
  const setCashFloat = async (amount: number) => {
    try {
      const payload: CashFloat = { date: dateStr(), amount, setByEmployee: currentEmployee?.name || 'Inconnu', setAt: Date.now() };
      await setDoc(doc(db, 'cashFloats', payload.date), payload);
      setShowCashFloat(false);
    } catch (err) {
      reportWriteError(err);
    }
  };

  // Sorties de caisse (paiement fournisseur en cash, etc.) -- même principe
  // que le listener "orders" ci-dessous : toute la collection, filtrée par
  // période plus loin (todayPayouts / rangePayouts) exactement comme pour
  // les commandes, pour que "aujourd'hui" et "la période Rapports" restent
  // cohérents entre commandes et sorties.
  const [cashPayouts, setCashPayouts] = useState<CashPayout[]>([]);
  const [showCashPayout, setShowCashPayout] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const q = query(collection(db, 'cashPayouts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCashPayouts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
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
      payoutsTotal: computePayoutsTotal(todayPayouts),
      cashFloatAmount: todayCashFloat?.amount || 0,
    };
    try {
      await setDoc(doc(db, 'dailyClosures', payload.date), payload);
    } catch (err) {
      reportWriteError(err);
    }
  };

  // Enregistre une sortie de caisse -- protégé par le code manager comme les
  // autres actions qui touchent à l'argent (remise, annulation). Ouvre aussi
  // le tiroir automatiquement puisque c'est justement pour en sortir de
  // l'argent liquide.
  const addCashPayout = async (reason: string, amount: number, supplierName: string) => {
    const ok = await requestManagerAuth();
    if (!ok) return;
    try {
      await addDoc(collection(db, 'cashPayouts'), {
        reason,
        amount,
        supplierName,
        employeeName: currentEmployee?.name || 'Inconnu',
        createdAt: serverTimestamp(),
      });
      setShowCashPayout(false);
      openCashDrawer().then((res) => {
        if (res.ok === false) console.warn('Ouverture auto du tiroir (sortie caisse) : ', res.message);
      });
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

  // Pont d'impression -- voir la note au-dessus de PRINTER_NAMES et
  // src/printerBridge.ts. Un simple ping suffit à savoir s'il est installé
  // et actif sur ce pc, pas de "connexion"/permission à faire comme avec
  // l'ancienne approche WebUSB : re-testé toutes les 10s tant que l'écran
  // est déverrouillé, pour détecter automatiquement une extension tout
  // juste installée/activée sans devoir recharger la page.
  const [printerBridgeReady, setPrinterBridgeReady] = useState(false);
  const [printerMsg, setPrinterMsg] = useState<string | null>(null);
  const kitchenPrintInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const check = () => pingPrinterBridge().then((ok) => !cancelled && setPrinterBridgeReady(ok));
    check();
    const id = window.setInterval(check, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [unlocked]);

  const handleTestPrinter = async (printerName: string, label: string) => {
    const dataBase64 = buildTicketEscPosBase64([
      { text: label.toUpperCase(), bold: true, size: 'large', align: 'center' },
      { text: '================================', align: 'center' },
      { text: `Ticket de test ${label}` },
      { text: new Date().toLocaleString('fr-FR', { timeZone: 'UTC' }) },
    ]);
    const res = await printEscPosViaBridge(printerName, `Test ${label}`, dataBase64);
    setPrinterMsg(res.ok === false ? res.message : `Test envoyé à l'imprimante ${label}.`);
    window.setTimeout(() => setPrinterMsg(null), 4000);
  };

  // Auto-print bar/cuisine -- se déclenche à chaque changement de `orders`
  // (donc à chaque snapshot Firestore), mais ne réimprime que les items pas
  // encore couverts par kitchenPrintedCount, et kitchenPrintInFlight évite
  // qu'un second snapshot arrivant pendant qu'un ticket est encore en train
  // de s'imprimer ne déclenche une impression en double du même lot.
  useEffect(() => {
    if (!unlocked || !printerBridgeReady) return;
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
  }, [orders, printerBridgeReady, unlocked]);

  // Reçu caisse auto A LA COMMANDE -- retiré le 13/09/2026 sur demande
  // explicite d'Amar : imprimer le reçu client dès l'arrivée de la commande
  // n'a de sens que pour un encaissement immédiat, alors qu'ici le client
  // peut encore ajouter des articles, partir plus tôt (Départ anticipé) ou
  // payer en plusieurs fois -- imprimer trop tôt forçait le "Document
  // provisoire" sur un ticket qui n'était pas encore la note finale. Les
  // tickets bar/cuisine (juste au-dessus) restent, eux, imprimés
  // immédiatement : la préparation ne doit jamais attendre l'encaissement.
  // Le reçu caisse officiel s'imprime maintenant automatiquement au moment
  // de l'encaissement (voir choosePayment plus bas) et via splitPayTable
  // pour un Départ anticipé -- plus besoin du drapeau receiptPrinted ici
  // (resté dans le schéma OrderDoc pour compat, mais plus écrit).

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
          // Le chime immédiat ici + la répétition toutes les 8s tant que
          // pendingSiteOrderCount > 0 (effet plus bas) + le bandeau permanent
          // (voir le rendu du bandeau plus bas) : le chime seul se manque
          // trop facilement dans un café bruyant, et sur l'écran caisse (sans
          // haut-parleurs, voir le commentaire du bandeau) c'est le bandeau
          // qui fait tout le travail.
          if (isNewArrival) {
            playChime();
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
  // Turning payment ON marks it paid (cash by default -- see markPaid below
  // for the Glovo "déjà payé" case, passé explicitement en `method` depuis
  // OrderCard) ; turning it OFF is an instant correction, no confirmation
  // needed.
  const togglePaid = async (order: OrderDoc, method: PaymentMethod = 'cash') => {
    if (!order.paid) {
      markPaid({ kind: 'order', order }, method);
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
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'cancelled',
        cancelledByEmployee: currentEmployee?.name || 'Inconnu',
        cancelledAt: serverTimestamp(),
      });
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
  // Départ anticipé -- voir le commentaire au-dessus de splitMode dans
  // TablePanel pour le pourquoi. `selection` dit combien d'unités de quelle
  // ligne (par commande + index) partent avec cette personne : on les
  // retire des commandes actives de la table (au prorata, en réduisant la
  // quantité plutôt qu'en supprimant la ligne si tout n'est pas pris), et on
  // crée une commande séparée déjà payée cash + servie pour cette part --
  // elle apparaît dans l'Historique/Rapports comme n'importe quelle vente,
  // simplement horodatée à part. Pas de code manager ici : c'est un
  // encaissement normal, pas une correction/suppression.
  const splitPayTable = async (
    table: string,
    tableOrders: OrderDoc[],
    selection: { orderId: string; itemIndex: number; qty: number }[]
  ) => {
    if (selection.length === 0) return;
    const splitItems: OrderItem[] = [];
    const orderUpdates: { id: string; items: OrderItem[]; total: number }[] = [];
    for (const o of tableOrders) {
      const forThisOrder = selection.filter((s) => s.orderId === o.id);
      if (forThisOrder.length === 0) continue;
      const items: (OrderItem | null)[] = [...o.items];
      let total = o.total;
      for (const s of forThisOrder) {
        const it = items[s.itemIndex];
        if (!it) continue;
        const takeQty = Math.min(s.qty, it.quantity);
        if (takeQty <= 0) continue;
        const takeAmount = Math.round(it.unitPrice * takeQty * 100) / 100;
        splitItems.push({ name: it.name, quantity: takeQty, unitPrice: it.unitPrice, lineTotal: takeAmount, station: it.station });
        total = Math.max(0, Math.round((total - takeAmount) * 100) / 100);
        items[s.itemIndex] =
          takeQty >= it.quantity
            ? null
            : { ...it, quantity: it.quantity - takeQty, lineTotal: Math.round(it.unitPrice * (it.quantity - takeQty) * 100) / 100 };
      }
      orderUpdates.push({ id: o.id, items: items.filter((it): it is OrderItem => it !== null), total });
    }
    if (splitItems.length === 0) return;
    const splitTotal = Math.round(splitItems.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100;
    try {
      await Promise.all(orderUpdates.map((u) => updateDoc(doc(db, 'orders', u.id), { items: u.items, total: u.total })));
      await addDoc(collection(db, 'orders'), {
        tableNumber: table,
        orderType: 'dine_in',
        source: 'manual',
        items: splitItems,
        total: splitTotal,
        status: 'served',
        paid: true,
        paymentMethod: 'cash',
        note: 'Départ anticipé',
        ...(currentEmployee ? { employeeName: currentEmployee.name } : {}),
        createdAt: serverTimestamp(),
      });
      openCashDrawer().then((res) => {
        if (res.ok === false) console.warn('Ouverture auto du tiroir (départ anticipé) : ', res.message);
      });
      await printReceiptSmart({
        label: `Table ${table} — Départ anticipé`,
        employeeName: currentEmployee?.name,
        dateLine: receiptDateLine(),
        items: splitItems,
        total: splitTotal,
        paidLine: 'Payé (cash)',
        provisional: false,
      });
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

  // Tout se paie en cash au comptoir ("bank betalen" retiré le 13/09/2026 --
  // voir le brief), SAUF Glovo depuis qu'on a commencé à y livrer (demande
  // client, 24/09/2026) : le client paie déjà dans l'appli Glovo (carte/
  // banque), aucun cash ne change de main à la remise au livreur. `method`
  // (par défaut 'cash') vient d'OrderCard, qui n'offre le choix que pour les
  // commandes Glovo -- les tables et Emporter/Livraison directs n'ont
  // toujours qu'un seul bouton "Marquer payé" (cash), rien ne change pour
  // eux.
  const markPaid = (target: PayTarget, method: PaymentMethod = 'cash') => {
    // Tiroir-caisse : n'a de sens que pour du cash physique -- inutile (et
    // trompeur) de l'ouvrir pour une commande Glovo déjà réglée dans l'appli.
    if (method === 'cash') {
      openCashDrawer().then((res) => {
        if (res.ok === false) console.warn('Ouverture auto du tiroir : ', res.message);
      });
    }
    // Firestore's local cache already applies the change optimistically for
    // every listener (that's how the rest of this screen behaves too:
    // advance/togglePaid/cancel never block the UI on a server round trip).
    const paymentFields = (): Partial<OrderDoc> => ({ paymentMethod: method });
    const write =
      target.kind === 'table'
        ? Promise.all(
            target.orders.map((o) =>
              updateDoc(doc(db, 'orders', o.id), { paid: true, status: 'served', ...paymentFields() })
            )
          )
        : updateDoc(doc(db, 'orders', target.order.id), { paid: true, ...paymentFields() });
    write.catch((err) => reportWriteError(err));
    // Reçu caisse officiel -- imprimé ICI, au moment réel de l'encaissement,
    // plutôt qu'à la création de la commande (voir la note plus haut,
    // 13/09/2026) : c'est LE document définitif, jamais un "Document
    // provisoire" puisque le paiement vient d'avoir lieu. Fire-and-forget,
    // comme l'ouverture du tiroir ci-dessus : un souci d'imprimante ne doit
    // jamais bloquer l'encaissement lui-même (le bouton "Imprimer" manuel
    // reste disponible pour réimprimer si besoin).
    const paidLine = method === 'cash' ? 'Payé (cash)' : 'Payé (déjà réglé via Glovo)';
    if (target.kind === 'table') {
      const items = target.orders.flatMap((o) => o.items);
      const total = target.orders.reduce((s, o) => s + o.total, 0);
      const employeeName = target.orders.length > 0 ? target.orders[target.orders.length - 1].employeeName : undefined;
      const notes = target.orders.map((o) => o.note).filter((n): n is string => !!n);
      printReceiptSmart({
        label: `Table ${target.table}`,
        employeeName,
        dateLine: receiptDateLine(),
        items,
        total,
        paidLine,
        note: notes.length > 0 ? notes.join(' / ') : undefined,
        provisional: false,
      }).catch((err) => console.warn('Reçu encaissement : échec impression', err));
    } else {
      printReceiptSmart({
        label: kindLabel(target.order),
        employeeName: target.order.employeeName,
        dateLine: receiptDateLine(target.order.createdAt?.toMillis()),
        items: target.order.items,
        total: target.order.total,
        paidLine,
        note: target.order.note,
        provisional: false,
      }).catch((err) => console.warn('Reçu encaissement : échec impression', err));
    }
    if (target.kind === 'table' && selectedTable === target.table) {
      setSelectedTable(null);
    }
  };

  const activeOrders = useMemo(
    () => orders.filter((o) => (o.status || 'new') !== 'served' && o.status !== 'cancelled'),
    [orders]
  );
  // Commandes passées par le client lui-même via le site (QR/table ou
  // livraison/emporter en ligne) et pas encore "acceptées" par le personnel
  // -- c'est-à-dire toujours au statut 'new', avant qu'on appuie sur
  // "Démarrer". Utilisé pour faire clignoter la tuile de table concernée ET
  // répéter le bip tant que personne n'a réagi (voir l'effet juste en
  // dessous), plutôt qu'un unique bip qu'on peut louper.
  const pendingSiteOrders = useMemo(
    () => activeOrders.filter((o) => (o.status || 'new') === 'new' && o.source !== 'manual' && o.source !== 'glovo'),
    [activeOrders]
  );
  const pendingSiteOrderCount = pendingSiteOrders.length;
  // Étiquettes ("Table 4", "À emporter — Amar", ...) pour le bandeau
  // permanent ci-dessous -- kindLabel() est déjà la même fonction qui sert
  // partout ailleurs sur cet écran pour nommer une commande.
  const pendingSiteOrderLabels = useMemo(() => pendingSiteOrders.map((o) => kindLabel(o)), [pendingSiteOrders]);

  // Répète le bip toutes les 8s tant qu'au moins une commande site n'a pas
  // été acceptée (voir pendingSiteOrderCount ci-dessus) -- le bip unique de
  // l'arrivée (dans le onSnapshot plus haut) était trop facile à louper dans
  // un café bruyant ; celui-ci continue jusqu'à ce qu'on appuie sur
  // "Démarrer", pas seulement jusqu'à ce qu'on regarde la tuile.
  useEffect(() => {
    if (pendingSiteOrderCount === 0) return;
    const id = setInterval(() => playChime(), 8000);
    return () => clearInterval(id);
  }, [pendingSiteOrderCount]);
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

  // Ouvrir une table = "prise en charge" par le personnel (demande client,
  // 23/09/2026) -- PAS le paiement. Avant ce correctif, la bannière/le
  // clignotement (voir pendingSiteOrderCount plus bas) ne s'éteignaient
  // qu'à l'encaissement (markPaid passe directement 'new' -> 'served', sans
  // jamais passer par 'preparing'), parce qu'en pratique le personnel
  // n'utilise pas le petit bouton "Démarrer" pour une table -- il sert
  // directement puis encaisse. Résultat : l'alerte restait active pendant
  // tout le service, ce qui la rendait inutile. Ouvrir la table (un geste
  // que le personnel fait de toute façon pour voir la commande) fait donc
  // maintenant passer toute commande site 'new' de cette table à
  // 'preparing', ce qui éteint immédiatement son alerte -- sans exiger un
  // second geste que personne ne fait.
  const acceptTable = (n: string) => {
    const tOrders = tablesMap.get(n) || [];
    tOrders
      .filter((o) => (o.status || 'new') === 'new' && o.source !== 'manual' && o.source !== 'glovo')
      .forEach((o) => {
        updateDoc(doc(db, 'orders', o.id), { status: 'preparing' as OrderStatus }).catch(reportWriteError);
      });
    setSelectedTable(n);
  };

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
  // Plats "de base" pour la recherche multi-sélection, groupés par catégorie
  // (mêmes catégories/ordre que le menu de commande) -- dédupliqués, un même
  // nom de plat n'apparaissant qu'une fois même s'il existe dans deux
  // catégories (rare, mais ça arrive avec les extras).
  const dishesByCategory = useMemo(() => {
    const byCat = new Map<string, Set<string>>();
    menuItems.forEach((it) => {
      const set = byCat.get(it.category) || new Set<string>();
      set.add(it.name.fr);
      byCat.set(it.category, set);
    });
    return initialCategories
      .filter((c) => c.id !== 'all' && byCat.has(c.id))
      .map((c) => ({ id: c.id, label: c.name.fr, names: Array.from(byCat.get(c.id)!).sort((a, b) => a.localeCompare(b)) }));
  }, [menuItems]);
  const toggleDish = (name: string) => {
    setSelectedDishes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const selectWholeCategory = (names: string[]) => {
    setSelectedDishes((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      return next;
    });
  };
  // Une vente "Pizza Margherita (Emporter)" ou "... (Menu)" doit compter
  // pour "Pizza Margherita" dans cette recherche -- ce sont les mêmes
  // suffixes ajoutés par handleAdd() dans MenuGrid, jamais des préfixes.
  const dishLookupResult = useMemo(() => {
    if (selectedDishes.size === 0) return null;
    let qty = 0;
    let revenue = 0;
    reportStats.allItems.forEach((it) => {
      const base = Array.from(selectedDishes).find((d) => it.name === d || it.name.startsWith(d + ' ('));
      if (base) {
        qty += it.qty;
        revenue += it.revenue;
      }
    });
    return { qty, revenue };
  }, [selectedDishes, reportStats.allItems]);

  // Sorties de caisse pour la même période que rangeOrders/reportStats --
  // même logique de filtrage par date, pour que l'onglet Rapports montre
  // toujours "cash encaissé" et "sorties de caisse" pour exactement la même
  // fenêtre de temps.
  const rangePayouts = useMemo(() => {
    const start = rangeStart(reportRange, customStart);
    const end = rangeEnd(reportRange, customEnd);
    return cashPayouts.filter((p) => {
      const t = p.createdAt?.toMillis() || 0;
      return t >= start && t <= end;
    });
  }, [cashPayouts, reportRange, customStart, customEnd]);

  const rangePayoutsTotal = useMemo(() => computePayoutsTotal(rangePayouts), [rangePayouts]);

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
  const todayPayouts = useMemo(() => {
    const start = rangeStart('today');
    const end = rangeEnd('today');
    return cashPayouts.filter((p) => {
      const t = p.createdAt?.toMillis() || 0;
      return t >= start && t <= end;
    });
  }, [cashPayouts]);

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

  // Déplacer une table -- un client change de place (ou on regroupe une
  // table mal indiquée) : toutes les commandes actives de `fromTable`
  // passent sous le numéro `toTable`, sans rien changer à leur contenu, leur
  // statut ou leur historique. Bloqué si la destination est déjà occupée --
  // pas de fusion automatique de deux additions différentes, il faut
  // d'abord vider/encaisser la table de destination. Pas de code manager
  // ici : c'est un service normal, pas une correction de commande.
  const moveTable = async (fromTable: string, toTable: string) => {
    const target = toTable.trim();
    if (!target || target === fromTable) return;
    if (tablesMap.has(target)) {
      window.alert(`La table ${target} est déjà occupée. Videz-la ou encaissez-la d'abord.`);
      return;
    }
    const tableOrders = tablesMap.get(fromTable) || [];
    if (tableOrders.length === 0) return;
    try {
      await Promise.all(tableOrders.map((o) => updateDoc(doc(db, 'orders', o.id), { tableNumber: target })));
      setSelectedTable(target);
    } catch (err) {
      reportWriteError(err);
    }
  };

  if (!unlocked) return <EmployeeLoginGate onLogin={(e) => setCurrentEmployee(e)} />;

  return (
    <div className="min-h-screen bg-brand-dark text-[#F3ECDD]">
      {/* Bandeau PERMANENT (pas un flash de 1.8s qu'on peut louper) tant
          qu'au moins une commande site/QR n'a pas été acceptée -- visible
          sur TOUS les onglets (Tafels/Bestellingen/Menu/...) puisqu'il est
          rendu avant tout le contenu des onglets, pas seulement sur celui
          des tables. Demandé explicitement (23/09/2026) : l'écran caisse
          n'a pas de haut-parleurs (limitation matérielle, pas le bug logiciel
          du chime qu'on a corrigé ailleurs dans ce fichier), donc l'alerte
          doit être 100% visuelle et impossible à manquer. `sticky top-0`
          (pas `fixed`) pour qu'elle reste dans le flux normal et pousse le
          header en dessous d'elle au lieu de le recouvrir -- voir le
          `top-11`/`top-0` conditionnel sur le <header> juste après. Couleurs
          planes qui alternent (voir --animate-banner-blink dans index.css) :
          pas de dégradé ni d'opacité arbitraire, cet écran tourne sur
          Chrome 109 / Windows 7 (voir le commentaire juste plus bas sur
          bg-gradient-to-b). */}
      {pendingSiteOrderCount > 0 && (
        <div className="sticky top-0 z-50 h-11 flex items-center justify-center gap-2 px-4 font-display font-black text-sm sm:text-base text-white animate-banner-blink overflow-hidden whitespace-nowrap text-ellipsis">
          <Bell className="w-4 h-4 shrink-0 animate-pulse-dot" />
          {pendingSiteOrderCount === 1 ? 'NOUVELLE COMMANDE' : `${pendingSiteOrderCount} NOUVELLES COMMANDES`}
          {' — '}
          {pendingSiteOrderLabels.join(' · ')}
        </div>
      )}

      {connectionError && (
        <div className="bg-red-500/15 border-b border-red-500/40 text-red-300 text-sm px-5 py-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> {connectionError}</span>
          <button onClick={() => window.location.reload()} className="shrink-0 text-xs font-bold underline">
            Recharger
          </button>
        </div>
      )}
      {!connectionError && !connected && (
        <div className="bg-[#F3ECDD]/10 text-[#9A9490] text-sm px-5 py-2 text-center">Connexion à Firestore…</div>
      )}

      {/* to-[#1f160c] sans opacité (13/09/2026) -- une couleur arbitraire
          "/98" dans un gradient compile en oklab(...), non supporté sur le
          pc caisse (Chrome 109, coincé sur Windows 7). #1f160c uni est visuellement
          indiscernable du 98% d'opacité d'origine sur ce fond déjà sombre. */}
      <header className={`sticky z-40 bg-gradient-to-b from-brand-dark to-[#1f160c] backdrop-blur border-b border-[#F3ECDD]/10 shadow-lg shadow-black/30 px-5 py-3 flex items-center justify-between flex-wrap gap-3 ${pendingSiteOrderCount > 0 ? 'top-11' : 'top-0'}`}>
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="Dom's Café" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="font-display font-black text-xl leading-tight tracking-wide">DOM'S CAFÉ</h1>
            <p className="text-[#9A9490] text-xs flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#8FBF8A] animate-pulse-dot' : 'bg-[#7A736C]'}`} />
              {currentEmployee ? `${currentEmployee.name} ·` : 'Écran commandes ·'}{' '}
              {new Date(now).toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })}
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
            {(['tables', 'live', 'history', 'reports', 'menu', 'tv'] as Tab[]).map((t) => {
              const TabIcon =
                t === 'tables'
                  ? Armchair
                  : t === 'live'
                  ? Receipt
                  : t === 'history'
                  ? History
                  : t === 'reports'
                  ? BarChart3
                  : t === 'tv'
                  ? Tv
                  : ClipboardList;
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
                  <TabIcon aria-hidden="true" className="w-4 h-4" />
                  {t === 'tables'
                    ? `Tables (${occupiedTableCount}/${TABLE_COUNT})`
                    : t === 'live'
                    ? `Commandes (${liveOrders.length})`
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
            <Archive className="w-4 h-4" /> Ouvrir le tiroir
          </button>
          <button
            onClick={() => setShowCashPayout(true)}
            title="Sortie de caisse -- payer un fournisseur ou une dépense en cash depuis le tiroir"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-400/50 transition-all"
          >
            <ArrowDown className="w-4 h-4" /> Sortie de caisse
          </button>
          <button
            onClick={() => setShowCashFloat(true)}
            title="Déclarer le montant en cash déjà dans le tiroir ce matin, avant toute vente"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
          >
            <Banknote className="w-4 h-4" /> Fond de caisse{todayCashFloat ? ` (${formatMAD(todayCashFloat.amount)})` : ''}
          </button>
          <a
            href="/foodcost.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir l'outil foodcost (coût des recettes, marges) dans un nouvel onglet"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
          >
            <Calculator className="w-4 h-4" /> Foodcost
          </a>
          <span
            title={
              printerBridgeReady
                ? 'Pont d\'impression détecté : Ticket/Bar/Cuisine impriment automatiquement, sans aucun clic.'
                : "Pont d'impression non détecté sur ce pc -- voir printhost/README.md pour l'installer (une seule fois). En attendant, le reçu caisse reste imprimable via le bouton \"Imprimer\"."
            }
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold border ${
              printerBridgeReady
                ? 'border-[#8FBF8A]/50 text-[#8FBF8A] bg-[#8FBF8A]/10'
                : 'border-red-500/40 text-red-400 bg-red-500/10'
            }`}
          >
            <Printer className="w-4 h-4" /> Impression auto {printerBridgeReady ? 'active' : 'inactive'}
          </span>
          {printerMsg && <span className="text-xs text-[#9A9490]">{printerMsg}</span>}
          {([
            { key: 'ticket', name: PRINTER_NAMES.ticket, label: 'Ticket' },
            { key: 'bar', name: PRINTER_NAMES.bar, label: 'Bar' },
            { key: 'cuisine', name: PRINTER_NAMES.cuisine, label: 'Cuisine' },
          ] as const).map((p) => (
            <button
              key={p.key}
              onClick={() => handleTestPrinter(p.name, p.label)}
              disabled={!printerBridgeReady}
              title={
                printerBridgeReady
                  ? `Imprimer un ticket de test sur l'imprimante ${p.label} (${p.name})`
                  : "Le pont d'impression doit être installé avant de pouvoir tester une imprimante."
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Printer className="w-3.5 h-3.5" /> Test {p.label}
            </button>
          ))}
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
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"><QrCode className="w-2.5 h-2.5 text-white" /></span> Commande via QR (client)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-md border-2 border-red-500" /> Pas encore acceptée (clignote + bip)</span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3 max-w-3xl">
              {TABLE_NUMBERS.map((n) => {
                const tOrders = tablesMap.get(n) || [];
                const occupied = tOrders.length > 0;
                const total = tOrders.reduce((s, o) => s + o.total, 0);
                const allPaid = occupied && tOrders.every((o) => o.paid);
                // Un client qui commande lui-même via le QR code de la table,
                // pas le personnel au comptoir -- même convention que le
                // chime "Nouvelle commande !" plus haut (source ni 'manual'
                // ni 'glovo').
                const hasSiteOrder = tOrders.some((o) => o.source !== 'manual' && o.source !== 'glovo');
                // Clignote jusqu'à ce que le personnel OUVRE la table (voir
                // acceptTable ci-dessus) -- pas jusqu'au paiement. Revenu sur
                // le choix du 13/09 ("pas seulement jusqu'à ce qu'on
                // regarde la tuile") : dans la pratique le personnel ne
                // clique jamais sur le petit bouton "Démarrer", donc exiger
                // ce geste faisait clignoter la table pendant tout le
                // service jusqu'à l'encaissement -- inutile. Ouvrir la table
                // est déjà un geste que le personnel fait pour voir la
                // commande, donc c'est ce geste-là qui compte maintenant
                // comme "pris en charge".
                const pendingSiteOrder = tOrders.some(
                  (o) => (o.status || 'new') === 'new' && o.source !== 'manual' && o.source !== 'glovo'
                );
                return (
                  <button
                    key={n}
                    onClick={() => acceptTable(n)}
                    className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all hover:-translate-y-0.5 ${
                      // #536048/#414333 uni (13/09/2026) -- équivalent visuel de
                      // #8FBF8A a 35%/15% d'opacite sur le fond sombre de la
                      // tuile, mais sans opacite : une couleur arbitraire "/nn"
                      // dans un gradient compile en oklab(...), non supporte sur
                      // le pc caisse (Chrome 109, coince sur Windows 7) -- la
                      // tuile "Payee" y apparaissait sans fond du tout (noire).
                      allPaid
                        ? 'bg-gradient-to-b from-[#536048] to-[#414333] border-[#8FBF8A]/60 text-[#F3ECDD] shadow-md shadow-[#8FBF8A]/10'
                        : occupied
                        ? 'bg-gradient-to-b from-brand-orange to-brand-orange-hover border-brand-orange text-[#1A1208] shadow-lg shadow-brand-orange/25'
                        : 'pos-surface border-[#F3ECDD]/10 text-[#F3ECDD] hover:border-brand-orange/50'
                    } ${pendingSiteOrder ? 'animate-pulse animate-blink-border' : ''}`}
                  >
                    {hasSiteOrder && (
                      <span
                        title="Commande passée par le client lui-même via le QR code -- pas saisie au comptoir"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-500 border-2 border-brand-dark flex items-center justify-center shadow-md"
                      >
                        <QrCode className="w-3 h-3 text-white" />
                      </span>
                    )}
                    <span className="text-xs leading-none opacity-80 flex justify-center">{allPaid ? <Check className="w-3 h-3" /> : occupied ? <Clock className="w-3 h-3" /> : ''}</span>
                    <span className="font-display font-black text-xl leading-none">{n}</span>
                    {occupied && <span className="text-[10px] font-bold">{formatMAD(total)}</span>}
                  </button>
                );
              })}
              {/* Tuile "Emporter" à côté des tables -- pour le client qui vient
                  chercher sa commande sans s'asseoir. Avant, le personnel le
                  mettait souvent sur une table libre par réflexe (plus rapide
                  que de chercher le petit bouton "+ Emporter / Livraison /
                  Glovo" tout en haut), ce qui gonflait artificiellement le
                  nombre de tables occupées. Ouvre le même formulaire que ce
                  bouton -- kind par défaut déjà "takeaway" -- donc aucune
                  nouvelle logique de commande, juste un raccourci visuel au
                  même endroit que les tables. */}
              <button
                onClick={() => setShowNewOrder(true)}
                className="aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 border-dashed border-brand-orange/50 text-brand-orange hover:bg-brand-orange/10 transition-all"
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="font-display font-black text-xs leading-none text-center">Emporter</span>
              </button>
            </div>

            {/* A table number outside 1-30 can still happen -- a customer
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
                          onClick={() => acceptTable(n)}
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
                    <span className="text-[#7A736C] text-xs"><ArrowRight className="inline-block w-3 h-3" /></span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-2 py-1.5 text-sm text-[#F3ECDD] focus:outline-none focus:border-brand-orange"
                    />
                  </span>
                )}
              </div>
            </div>
            {occupiedTableCount > 0 && (
              <p className="text-[#7A736C] text-xs mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Seules les commandes payées/encaissées apparaissent ici — {occupiedTableCount} table{occupiedTableCount > 1 ? 's' : ''} encore ouverte{occupiedTableCount > 1 ? 's' : ''} (voir l'onglet Tables).
              </p>
            )}
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
                        {o.createdAt?.toDate().toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                        {o.status === 'cancelled'
                          ? `Annulé${o.cancelledByEmployee ? ` par ${o.cancelledByEmployee}` : ''}${
                              o.cancelledAt ? ` à ${o.cancelledAt.toDate().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })}` : ''
                            }`
                          : o.paid
                          ? `Payé (${paymentMethodLabel(o)})`
                          : 'Non payé'}
                      </p>
                      {o.note && <p className="text-xs text-brand-orange font-medium mt-0.5 flex items-center gap-1"><NotebookPen className="w-3.5 h-3.5 shrink-0" /> {o.note}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-brand-orange font-black">{formatMAD(o.total)}</span>
                      <button
                        onClick={() => printOrderReceipt(o)}
                        title="Réimprimer le reçu"
                        className="text-[#7A736C] hover:text-[#F3ECDD] hover:bg-white/5 text-sm w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteOrder(o)}
                        title="Supprimer définitivement (serveur inclus)"
                        className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-sm w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
                    <span className="text-[#7A736C] text-xs"><ArrowRight className="inline-block w-3 h-3" /></span>
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
                      o.createdAt?.toDate().toLocaleString('fr-FR', { timeZone: 'UTC' }) || '',
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
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 flex items-center gap-1.5"
              >
                <ArrowDown className="w-4 h-4" /> Exporter en CSV
              </button>
            </div>

            <div className="flex gap-2 flex-wrap mb-5">
              <button
                onClick={() => setShowXReport(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#F3ECDD] hover:border-brand-orange/60 transition-all flex items-center gap-1.5"
              >
                <BarChart3 className="w-4 h-4" /> Rapport X
              </button>
              <button
                onClick={() => setShowZReport(true)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all flex items-center gap-1.5 ${
                  todayClosure ? 'border-[#8FBF8A]/40 text-[#8FBF8A]' : 'border-[#F3ECDD]/20 text-[#F3ECDD] hover:border-brand-orange/60'
                }`}
              >
                <Lock className="w-4 h-4" /> Rapport Z{todayClosure ? ' (clôturé)' : ''}
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
                  <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Banknote className="inline-block w-3.5 h-3.5" /> Cash</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.cash)}</span></div>
                  <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><CreditCard className="inline-block w-3.5 h-3.5" /> Carte</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.card)}</span></div>
                  <div className="flex justify-between"><span className="text-[#9A9490] inline-flex items-center gap-1"><Bike className="inline-block w-3.5 h-3.5" /> Glovo</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.glovo)}</span></div>
                  {reportStats.unspecified > 0 && (
                    <div className="flex justify-between"><span className="text-[#9A9490]">— Non précisé</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.unspecified)}</span></div>
                  )}
                  {rangePayoutsTotal > 0 && (
                    <>
                      <div className="flex justify-between pt-1 border-t border-[#F3ECDD]/10"><span className="text-[#9A9490] inline-flex items-center gap-1"><ArrowDown className="inline-block w-3.5 h-3.5" /> Sorties de caisse</span><span className="font-bold text-red-400">- {formatMAD(rangePayoutsTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-[#9A9490] font-bold">Cash net (tiroir)</span><span className="font-bold text-[#F3ECDD]">{formatMAD(reportStats.cash - rangePayoutsTotal)}</span></div>
                    </>
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

              <div className="pos-surface border border-[#F3ECDD]/10 rounded-xl p-4">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-1">Rechercher des plats</h3>
                <p className="text-[#7A736C] text-xs mb-3">Cochez un ou plusieurs plats, ou ajoutez toute une catégorie d'un coup (ex. toutes les pizzas).</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {dishesByCategory.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => selectWholeCategory(cat.names)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-full border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-brand-orange/50 transition-all"
                    >
                      + {cat.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-3 mb-3 pe-1">
                  {dishesByCategory.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#7A736C] mb-1">{cat.label}</p>
                      <div className="space-y-1">
                        {cat.names.map((name) => (
                          <label key={name} className="flex items-center gap-2 text-sm text-[#E3DCCB] cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={selectedDishes.has(name)}
                              onChange={() => toggleDish(name)}
                              className="w-4 h-4 accent-brand-orange shrink-0"
                            />
                            <span className="truncate">{name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedDishes.size > 0 && (
                  <>
                    <div className="flex justify-between items-center pos-surface border border-[#F3ECDD]/10 rounded-lg px-3 py-3 mb-2">
                      <span className="text-[#E3DCCB] truncate pe-2">{selectedDishes.size} plat{selectedDishes.size > 1 ? 's' : ''} sélectionné{selectedDishes.size > 1 ? 's' : ''}</span>
                      <span className="text-[#9A9490] shrink-0 text-right">
                        <span className="font-display font-black text-xl text-brand-orange">{dishLookupResult?.qty ?? 0}×</span>
                        <br />
                        <span className="text-xs">{formatMAD(dishLookupResult?.revenue ?? 0)}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedDishes(new Set())}
                      className="text-xs font-bold text-[#9A9490] hover:text-[#F3ECDD] underline"
                    >
                      Tout désélectionner
                    </button>
                  </>
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

            {rangePayouts.length > 0 && (
              <div className="pos-surface border border-red-500/20 rounded-xl p-4 mt-5">
                <h3 className="font-display font-black text-base text-[#F3ECDD] mb-3 inline-flex items-center gap-1.5">
                  <ArrowDown className="w-4 h-4 text-red-400" /> Sorties de caisse ({formatMAD(rangePayoutsTotal)})
                </h3>
                <div className="space-y-2 text-sm">
                  {rangePayouts.map((p) => (
                    <div key={p.id} className="flex justify-between items-center gap-3">
                      <span className="text-[#E3DCCB] truncate">
                        {p.reason}
                        {p.employeeName && <span className="text-[#7A736C]"> · {p.employeeName}</span>}
                        {p.createdAt && (
                          <span className="text-[#7A736C]"> · {p.createdAt.toDate().toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </span>
                      <span className="font-bold text-red-400 shrink-0">- {formatMAD(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'menu' && (
          <div className="max-w-4xl mx-auto">
            {!menuUnlocked ? (
              <div className="text-center py-24">
                <p className="mb-2 flex justify-center"><Lock className="w-6 h-6" /></p>
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
                <div className="pos-surface border border-brand-orange/25 rounded-xl p-3 mb-4 text-xs text-[#9A9490] leading-relaxed flex gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Les changements ici (prix, nom, catégorie, station, actif) ne s'appliquent qu'à cet écran caisse.
                  Le site de commande client garde les fiches complètes (3 langues, description, photo) du code tant
                  qu'il n'est pas mis à jour séparément.</span>
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
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all flex items-center gap-1"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Modifier
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
                <p className="mb-2 flex justify-center"><Lock className="w-6 h-6" /></p>
                <p className="text-[#9A9490] mb-4">Le code manager est nécessaire pour ouvrir l'écran TV.</p>
                <button onClick={unlockTv} className="px-5 py-2.5 rounded-xl bg-brand-orange text-[#1A1208] font-display font-black">
                  Déverrouiller
                </button>
              </div>
            ) : (
              <>
                <div className="pos-surface border border-brand-orange/25 rounded-xl p-3 mb-4 text-xs text-[#9A9490] leading-relaxed flex gap-1.5">
                  <Tv className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Ces slides tournent en boucle sur <span className="font-bold text-[#F3ECDD]">/tv.html</span>, à ouvrir en plein
                  écran dans le navigateur de la Smart TV. Les changements ici apparaissent automatiquement sur l'écran, pas besoin
                  de le rafraîchir manuellement. Ajoute une photo à un slide pour qu'elle s'affiche plein cadre sur l'écran.</span>
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
                            className="text-xs font-bold w-7 h-7 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-30 transition-all flex items-center justify-center"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveTvSlide(s.id, 1)}
                            disabled={i === tvSlides.length - 1}
                            className="text-xs font-bold w-7 h-7 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 disabled:opacity-30 transition-all flex items-center justify-center"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingTvSlide(s)}
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Modifier
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
            markPaid({ kind: 'table', table: selectedTable, orders: tablesMap.get(selectedTable) || [] })
          }
          onAdvanceOrder={advance}
          onCancelOrder={cancel}
          onDeleteOrder={deleteOrder}
          onEditNote={editNote}
          onRemoveItem={removeItemFromOrder}
          onApplyDiscount={applyDiscount}
          onSplitPay={splitPayTable}
          onMoveTable={(toTable) => moveTable(selectedTable, toTable)}
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

      {showXReport && (
        <XReportModal stats={todayStats} payouts={todayPayouts} orders={todayOrders} cashFloat={todayCashFloat} onClose={() => setShowXReport(false)} />
      )}

      {showZReport && (
        <ZReportModal
          stats={todayStats}
          closure={todayClosure}
          payouts={todayPayouts}
          cashFloat={todayCashFloat}
          onClose={() => setShowZReport(false)}
          onConfirmClose={closeToday}
        />
      )}

      {showCashPayout && (
        <CashPayoutModal onConfirm={addCashPayout} onCancel={() => setShowCashPayout(false)} />
      )}
      {showCashFloat && (
        <CashFloatModal current={todayCashFloat} onConfirm={setCashFloat} onCancel={() => setShowCashFloat(false)} />
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
