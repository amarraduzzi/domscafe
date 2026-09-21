// Types + logique métier partagées entre l'écran caisse (src/pos/PosApp.tsx)
// et l'écran propriétaire (src/owner/OwnerApp.tsx). Extrait de PosApp.tsx le
// 13/09/2026 pour que l'écran propriétaire (chiffres, historique, prix) lise
// et calcule EXACTEMENT comme la caisse -- même définition d'un "kind" de
// commande, même formule de chiffre d'affaires, même fusion menu+overrides
// -- au lieu de dupliquer cette logique et risquer que les deux écrans
// finissent par ne plus être d'accord entre eux.
import { Timestamp } from 'firebase/firestore';
import { menuItems as staticMenuItems, type MenuItem } from '../data';

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type OrderSource = 'site' | 'manual' | 'glovo';
export type OrderKind = 'dine_in' | 'takeaway' | 'delivery' | 'glovo';
export type PaymentMethod = 'cash' | 'card' | 'mixed';

export interface OrderItem {
  name: string;
  quantity: number;
  note?: string;
  unitPrice: number;
  lineTotal: number;
  station?: string;
}

export interface OrderDoc {
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
  // Historique : plus écrit depuis le 13/09/2026 (voir PosApp.tsx), gardé
  // uniquement pour ne pas casser la lecture d'anciennes commandes.
  receiptPrinted?: boolean;
  // Qui a annulé cette commande et quand -- demandé le 16/09/2026 pour que
  // le rapport X et l'historique montrent toujours "qui" en plus du fait
  // qu'une commande a été annulée. `cancelledByEmployee` est l'employé
  // connecté au moment de l'annulation (le code manager n'identifie qu'une
  // autorisation, pas une personne), voir cancel() dans PosApp.tsx.
  cancelledByEmployee?: string;
  cancelledAt?: Timestamp;
}

// Un override par article, clé = l'id de l'article dans data.ts pour un
// article existant, ou un id Firestore auto-généré pour un article créé
// entièrement depuis l'écran "Menu" (isCustom: true). Volontairement
// minimal (prix/nom/catégorie/station/actif) -- les fiches complètes
// (3 langues, description, photo, variantes) restent gérées dans data.ts,
// voir la note dans l'onglet Menu.
export interface MenuOverride {
  name?: string;
  price?: number;
  category?: string;
  station?: string;
  active?: boolean;
  isCustom?: boolean;
}

// Un doc par jour civil clôturé (Rapport Z), clé = dateStr() ("YYYY-MM-DD").
// Écrit une seule fois par jour via closeToday() ; sa seule présence signale
// "journée clôturée" et fige les chiffres au moment de la clôture.
export interface DailyClosure {
  date: string;
  revenue: number;
  cash: number;
  card: number;
  glovo: number;
  unspecified: number;
  orderCount: number;
  closedAt: number;
  closedByEmployee: string;
  // Total des sorties de caisse (voir CashPayout ci-dessous) sur la journée,
  // figé au moment de la clôture -- absent sur les clôtures faites avant le
  // 13/09/2026, traité comme 0 partout où c'est lu.
  payoutsTotal?: number;
  // Fond de caisse du jour (voir CashFloat ci-dessous), figé au moment de la
  // clôture -- absent sur les clôtures faites avant le 16/09/2026, traité
  // comme 0 partout où c'est lu.
  cashFloatAmount?: number;
}

// Une sortie d'argent liquide de la caisse pour autre chose qu'une commande
// -- typiquement payer un fournisseur sur place, en cash, comme c'est
// l'usage courant au Maroc ("er worden gewoon leveranciers uit de kassa
// betaald"). Collection Firestore séparée ("cashPayouts") plutôt qu'un champ
// sur les commandes : ce n'est pas une commande, ça ne doit jamais apparaître
// dans le chiffre d'affaires, seulement venir en déduction du cash physique
// disponible en tiroir. `reason` est obligatoire (voir CashPayoutModal) --
// c'est le point du brief : on doit toujours savoir pour quoi et combien.
export interface CashPayout {
  id: string;
  amount: number;
  reason: string;
  // Nom du fournisseur (ou bénéficiaire) payé -- champ obligatoire distinct
  // du motif depuis le 16/09/2026, pour toujours savoir "à qui" en plus de
  // "pourquoi".
  supplierName: string;
  employeeName?: string;
  createdAt?: Timestamp;
}

// Fond de caisse -- montant en cash déposé dans le tiroir au début de la
// journée (avant toute vente), pour que "cash en tiroir" dans les rapports
// X/Z reflète l'argent physiquement présent et pas seulement l'encaissé du
// jour. Un doc par jour civil (clé = dateStr()), comme dailyClosures.
export interface CashFloat {
  date: string;
  amount: number;
  setByEmployee: string;
  setAt: number;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Nouveau',
  preparing: 'En préparation',
  ready: 'Prêt',
  served: 'Servi',
  cancelled: 'Annulé',
};

export function kindOf(order: OrderDoc): OrderKind {
  if (order.orderType) return order.orderType;
  if (order.source === 'glovo') return 'glovo';
  if (order.tableNumber && order.tableNumber !== '?') return 'dine_in';
  if (order.address) return 'delivery';
  return 'takeaway';
}

export function kindLabel(order: OrderDoc): string {
  const kind = kindOf(order);
  if (kind === 'dine_in') return `Table ${order.tableNumber}`;
  if (kind === 'delivery') return order.customerName ? `Livraison — ${order.customerName}` : 'Livraison';
  if (kind === 'glovo') return order.glovoRef ? `Glovo — ${order.glovoRef}` : 'Glovo';
  return order.customerName ? `À emporter — ${order.customerName}` : 'À emporter';
}

// Fusionne le menu de base (data.ts, complet : 3 langues, description,
// photo, variantes -- toujours la source pour le site client) avec les
// overrides Firestore (menuOverrides) que l'onglet Menu (caisse) ET l'écran
// propriétaire écrivent tous les deux : prix, nom (une seule langue),
// catégorie, station et actif/épuisé. Un article "isCustom" n'existe que
// dans Firestore (ajouté depuis l'un des deux écrans) et est ajouté à la
// fin. Le nom overridé remplace les 3 langues à l'identique --
// volontairement : ça ne touche que ce que le personnel/le propriétaire
// voit ici, jamais le site client.
export function buildMenu(overrides: Map<string, MenuOverride>): MenuItem[] {
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
// période sélectionnée dans l'onglet Rapports) et pour l'écran propriétaire.
// Les commandes Glovo vont dans leur propre colonne quel que soit leur
// `paymentMethod` (Glovo paie le resto par facture, pas en cash/carte au
// comptoir) ; un paiement partagé (mixed) répartit son montant entre cash
// et carte via `paymentSplit`.
export function computeStats(rangeOrders: OrderDoc[]) {
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
  const allItemsSorted = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
  const topItems = allItemsSorted.slice(0, 10);

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
    // Liste complète (pas juste le top 10) -- sert à chercher un plat précis
    // dans l'onglet Rapports, y compris ceux qui ne sont pas dans le top des
    // ventes. Les variantes d'un même plat de base (" (Menu)", " (Emporter)",
    // " (Gratis - fidélité)") restent des entrées séparées ici -- c'est
    // l'écran qui les regroupe pour l'affichage par plat.
    allItems: allItemsSorted,
    byEmployee,
    hourly,
  };
}

// Total des sorties de caisse d'un lot de CashPayout -- utilisé partout où
// le rapport doit déduire les sorties du cash encaissé (X, Z, onglet
// Rapports, écran propriétaire) pour donner "ce qu'il doit rester dans le
// tiroir" plutôt que juste "ce qui a été encaissé en cash".
export function computePayoutsTotal(payouts: CashPayout[]): number {
  return payouts.reduce((s, p) => s + p.amount, 0);
}

export function minutesSince(ts?: Timestamp): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 60000));
}

export function elapsedStyle(mins: number): string {
  if (mins >= 15) return 'text-red-400';
  if (mins >= 6) return 'text-amber-400';
  return 'text-[#8FBF8A]';
}

export function elapsedLabel(mins: number): string {
  return mins === 0 ? "à l'instant" : `il y a ${mins} min`;
}

export function formatMAD(n: number): string {
  return `${n.toFixed(0)} MAD`;
}

// dateStr() partagé -- clé "YYYY-MM-DD" utilisée pour les docs dailyClosures
// et pour filtrer "aujourd'hui" côté propriétaire, identique au calcul déjà
// utilisé côté caisse pour closeToday()/XReportModal.
export function dateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
