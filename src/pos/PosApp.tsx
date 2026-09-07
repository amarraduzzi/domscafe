import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { menuItems as staticMenuItems } from '../data';
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
// Access: this URL has no real login, only a 4-digit PIN gate (like the
// billiards cancel-PIN elsewhere on this site) so it isn't wide open to
// anyone who finds the link. It is a UI deterrent, not security — Firestore
// itself is reachable by anyone with the public web API key, same as the
// rest of this project. Change POS_PIN below whenever staff turnover makes
// sense.
// ---------------------------------------------------------------------------

const POS_PIN = '4271';
const PIN_SESSION_KEY = 'domscafe_pos_unlocked';
const TABLE_COUNT = 25;
const TABLE_NUMBERS = Array.from({ length: TABLE_COUNT }, (_, i) => String(i + 1));

type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
type OrderSource = 'site' | 'manual' | 'glovo';
type OrderKind = 'dine_in' | 'takeaway' | 'delivery' | 'glovo';
type PaymentMethod = 'cash' | 'card';

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
  customerName?: string;
  address?: string;
  glovoRef?: string;
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
const CATEGORY_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Petit-déj', ids: ['breakfasts', 'omelettes', 'toasts', 'viennoiserie', 'crepes_sucrees', 'crepes_salees'] },
  { label: 'Plats', ids: ['pizzas', 'sandwiches', 'tacos', 'pasticcie', 'burgers', 'salades', 'pates'] },
  { label: 'Boissons', ids: ['boissons_chaudes', 'boissons_fraiches', 'jus_cocktails'] },
  { label: 'Desserts', ids: ['desserts'] },
];

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

// ---------------------------------------------------------------------------

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === POS_PIN) {
      sessionStorage.setItem(PIN_SESSION_KEY, '1');
      onUnlock();
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark bg-grid-pattern flex items-center justify-center px-6">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-8 text-center animate-pop">
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
    </div>
  );
}

// ---------------------------------------------------------------------------

function PaymentMethodModal({
  label,
  onChoose,
  onCancel,
}: {
  label: string;
  onChoose: (m: PaymentMethod) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm pos-surface-raised border border-[#F3ECDD]/10 rounded-2xl p-6 text-center animate-pop">
        <h3 className="font-display font-black text-lg text-[#F3ECDD] mb-1">{label}</h3>
        <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-5">Mode de paiement ?</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => onChoose('cash')}
            className="py-5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.96] text-[#1A1208] font-display font-black text-lg shadow-lg shadow-brand-orange/20 transition-all"
          >
            💵 Cash
          </button>
          <button
            onClick={() => onChoose('card')}
            className="py-5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.96] text-[#1A1208] font-display font-black text-lg shadow-lg shadow-brand-orange/20 transition-all"
          >
            💳 Carte
          </button>
        </div>
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
}: {
  order: OrderDoc;
  onAdvance: (order: OrderDoc) => void | Promise<void>;
  onTogglePaid: (order: OrderDoc) => void | Promise<void>;
  onCancel: (order: OrderDoc) => void | Promise<void>;
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
        <button
          onClick={() => onCancel(order)}
          title="Annuler la commande"
          className="text-[#7A736C] hover:text-red-400 hover:bg-red-400/10 text-xs shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="border-t border-[#F3ECDD]/10 pt-2 space-y-1">
        {order.items.map((it, idx) => (
          <div key={idx} className="flex justify-between text-sm text-[#E3DCCB]">
            <span>
              <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
              {it.note && <span className="block text-[11px] text-[#9A9490] italic">{it.note}</span>}
            </span>
            <span className="text-[#9A9490] shrink-0 ps-2">{formatMAD(it.lineTotal)}</span>
          </div>
        ))}
      </div>

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
          {order.paid ? `✓ Payé${order.paymentMethod ? ` (${order.paymentMethod === 'cash' ? 'cash' : 'carte'})` : ''}` : 'Marquer payé'}
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
  draft,
  onAdd,
  onChangeQty,
}: {
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

  const items = useMemo(() => {
    const available = staticMenuItems.filter((it) => it.available !== false);
    const bySearch = search.trim()
      ? available.filter((it) => (it.name.fr + ' ' + it.name.en).toLowerCase().includes(search.toLowerCase()))
      : available;
    return activeCategory === 'all' ? bySearch : bySearch.filter((it) => it.category === activeCategory);
  }, [search, activeCategory]);

  const total = draft.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  const handleAdd = (id: string, name: string, unitPrice: number, station?: string) => {
    onAdd(name, unitPrice, station);
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 320);
  };

  return (
    <div className="flex-1 overflow-y-auto flex">
      <div className="flex-1 p-5 overflow-y-auto">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un article…"
          className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2.5 mb-4 text-base text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange focus:shadow-[0_0_0_3px_rgba(201,161,90,0.2)] transition-shadow"
        />

        <div className="mb-5 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition-all ${
                activeCategory === 'all'
                  ? 'bg-brand-orange text-[#1A1208] border-brand-orange shadow-md shadow-brand-orange/20'
                  : 'text-[#9A9490] border-[#F3ECDD]/15 hover:border-[#F3ECDD]/35 hover:text-[#F3ECDD]'
              }`}
            >
              🍽️ Tout
            </button>
          </div>
          {groupedRows.map((row) => (
            <div key={row.label} className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-[#7A736C] font-bold w-[76px] shrink-0">
                {row.label}
              </span>
              <div className="flex gap-2 flex-wrap">
                {row.cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCategory(c.id)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition-all ${
                      activeCategory === c.id
                        ? 'bg-brand-orange text-[#1A1208] border-brand-orange shadow-md shadow-brand-orange/20'
                        : 'text-[#9A9490] border-[#F3ECDD]/15 hover:border-[#F3ECDD]/35 hover:text-[#F3ECDD]'
                    }`}
                  >
                    {c.emoji} {c.name.fr}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => handleAdd(it.id, it.name.fr, it.price, it.station)}
              className={`text-start pos-surface border rounded-xl p-3.5 transition-all active:scale-[0.96] ${
                justAdded === it.id
                  ? 'border-brand-orange ring-2 ring-brand-orange/60 animate-pop'
                  : 'border-[#F3ECDD]/10 hover:border-brand-orange/50 hover:-translate-y-0.5'
              }`}
            >
              <p className="text-base font-bold text-[#F3ECDD] leading-tight">{it.name.fr}</p>
              <p className="text-base text-brand-orange font-display font-black mt-1">{formatMAD(it.price)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="w-72 border-s border-[#F3ECDD]/10 p-5 flex flex-col shrink-0 bg-black/10">
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

function NewOrderPanel({ onClose, onSubmit }: { onClose: () => void; onSubmit: (payload: any) => Promise<void> }) {
  const [kind, setKind] = useState<Exclude<OrderKind, 'dine_in'>>('takeaway');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [glovoRef, setGlovoRef] = useState('');
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
    await onSubmit(payload);
    setSubmitting(false);
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch justify-end animate-fade-in">
      <div className="w-full max-w-2xl bg-brand-dark border-l border-[#F3ECDD]/10 shadow-2xl shadow-black/60 flex flex-col h-full animate-slide-in">
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
        </div>

        <MenuGrid draft={draft} onAdd={addItem} onChangeQty={changeQty} />

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
  table,
  orders,
  onClose,
  onAddItems,
  onCheckout,
  onAdvanceOrder,
  onCancelOrder,
}: {
  table: string;
  orders: OrderDoc[];
  onClose: () => void;
  onAddItems: (items: OrderItem[], total: number) => Promise<void>;
  onCheckout: () => void;
  onAdvanceOrder: (order: OrderDoc) => void | Promise<void>;
  onCancelOrder: (order: OrderDoc) => void | Promise<void>;
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
      <div className="w-full max-w-2xl bg-brand-dark border-l border-[#F3ECDD]/10 shadow-2xl shadow-black/60 flex flex-col h-full animate-slide-in">
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
                    </div>
                  </div>
                  {o.items.map((it, i) => (
                    <div key={i} className="flex justify-between text-sm text-[#E3DCCB]">
                      <span>
                        <span className="font-bold text-brand-orange">{it.quantity}×</span> {it.name}
                      </span>
                      <span className="text-[#9A9490]">{formatMAD(it.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t border-[#F3ECDD]/10">
              <span className="font-display font-black text-brand-orange text-2xl">{formatMAD(billTotal)}</span>
              <button
                onClick={onCheckout}
                className="text-sm font-black px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.97] text-[#1A1208] shadow-lg shadow-brand-orange/20 transition-all"
              >
                {allPaid ? 'Clôturer la table' : 'Encaisser'}
              </button>
            </div>
          </div>
        )}

        <div className="px-5 pt-4 shrink-0">
          <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold">Ajouter des articles</p>
        </div>

        <MenuGrid draft={draft} onAdd={addItem} onChangeQty={changeQty} />

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

type Tab = 'tables' | 'live' | 'kitchen' | 'history' | 'reports';
type PayTarget = { kind: 'table'; table: string; orders: OrderDoc[] } | { kind: 'order'; order: OrderDoc };
type ReportRange = 'today' | 'yesterday' | 'week' | 'month' | 'all';

const RANGE_LABEL: Record<ReportRange, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  week: '7 jours',
  month: '30 jours',
  all: 'Tout',
};

function rangeStart(range: ReportRange): number {
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
  // month
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rangeEnd(range: ReportRange): number {
  if (range !== 'yesterday') return Date.now();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
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

export default function PosApp() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(PIN_SESSION_KEY) === '1');
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [tab, setTab] = useState<Tab>('tables');
  const [reportRange, setReportRange] = useState<ReportRange>('today');
  const [historySearch, setHistorySearch] = useState('');
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
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setConnected(true);
        setConnectionError(null);
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
  const cancel = async (order: OrderDoc) => {
    if (!window.confirm(`Annuler la commande (${kindLabel(order)}) ?`)) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
    } catch (err) {
      reportWriteError(err);
    }
  };
  const submitNewOrder = async (payload: any) => {
    try {
      await addDoc(collection(db, 'orders'), payload);
    } catch (err) {
      reportWriteError(err);
    }
  };

  const choosePayment = (method: PaymentMethod) => {
    if (!payingTarget) return;
    // Close the modal immediately instead of waiting on the network round
    // trip -- Firestore's local cache already applies the change optimistically
    // for every listener (that's how the rest of this screen behaves too:
    // advance/togglePaid/cancel never block the UI on a server round trip).
    // Blocking here instead would leave the modal stuck open on a slow or
    // flaky connection, which is exactly the kind of thing a "perfect
    // werkend" POS can't do.
    const target = payingTarget;
    setPayingTarget(null);
    const write =
      target.kind === 'table'
        ? Promise.all(
            target.orders.map((o) =>
              updateDoc(doc(db, 'orders', o.id), { paid: true, status: 'served', paymentMethod: method })
            )
          )
        : updateDoc(doc(db, 'orders', target.order.id), { paid: true, paymentMethod: method });
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
    const start = rangeStart(reportRange);
    const end = rangeEnd(reportRange);
    return orders.filter((o) => {
      const t = o.createdAt?.toMillis() || 0;
      return t >= start && t <= end;
    });
  }, [orders, reportRange]);

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
  const reportStats = useMemo(() => {
    const valid = rangeOrders.filter((o) => o.status !== 'cancelled');
    const paid = valid.filter((o) => o.paid);
    const revenue = paid.reduce((s, o) => s + o.total, 0);
    const cash = paid.filter((o) => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    const card = paid.filter((o) => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0);
    const unspecified = revenue - cash - card;
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

    return {
      revenue,
      cash,
      card,
      unspecified,
      orderCount: valid.length,
      avg: paid.length ? revenue / paid.length : 0,
      unpaidCount,
      cancelledCount,
      byType,
      topItems,
    };
  }, [rangeOrders]);

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
        });
      }
    } catch (err) {
      reportWriteError(err);
    }
  };

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

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
          <div>
            <h1 className="font-display font-black text-xl leading-tight tracking-wide">DOM'S CAFÉ</h1>
            <p className="text-[#9A9490] text-xs flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#8FBF8A] animate-pulse-dot' : 'bg-[#7A736C]'}`} />
              Écran commandes ·{' '}
              {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['tables', 'live', 'kitchen', 'history', 'reports'] as Tab[]).map((t) => {
            const needsAttention = t === 'kitchen' && kitchenOrderCount > 0;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-3.5 py-2 rounded-full text-sm font-bold transition-all ${
                  tab === t
                    ? 'bg-brand-orange text-[#1A1208] shadow-md shadow-brand-orange/25'
                    : 'bg-brand-dark-card text-[#9A9490] hover:text-[#F3ECDD] hover:bg-[#F3ECDD]/5'
                }`}
              >
                {needsAttention && tab !== t && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-orange animate-pulse-dot" />
                )}
                {t === 'tables'
                  ? `Tables (${occupiedTableCount}/${TABLE_COUNT})`
                  : t === 'live'
                  ? `Commandes (${liveOrders.length})`
                  : t === 'kitchen'
                  ? `Cuisine (${kitchenOrderCount})`
                  : t === 'history'
                  ? 'Historique'
                  : 'Rapports'}
              </button>
            );
          })}
          <button
            onClick={() => setShowNewOrder(true)}
            className="px-4 py-2 rounded-full text-sm font-black bg-[#F3ECDD]/10 hover:bg-[#F3ECDD]/20 active:scale-[0.97] text-[#F3ECDD] transition-all"
          >
            + Emporter / Livraison / Glovo
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
                <OrderCard key={o.id} order={o} onAdvance={advance} onTogglePaid={togglePaid} onCancel={cancel} />
              ))}
            </div>
          )
        )}

        {tab === 'kitchen' && (
          kitchenByStation.length === 0 ? (
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
          )
        )}

        {tab === 'history' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 flex-wrap mb-3">
              {(['today', 'yesterday', 'week', 'month', 'all'] as ReportRange[]).map((r) => (
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
                        {o.status === 'cancelled' ? 'Annulé' : o.paid ? `Payé (${o.paymentMethod === 'cash' ? 'cash' : o.paymentMethod === 'card' ? 'carte' : '—'})` : 'Non payé'}
                      </p>
                    </div>
                    <span className="text-brand-orange font-black shrink-0">{formatMAD(o.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div className="flex gap-2 flex-wrap">
                {(['today', 'yesterday', 'week', 'month', 'all'] as ReportRange[]).map((r) => (
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
              </div>
              <button
                onClick={() =>
                  downloadCSV(`domscafe-rapport-${reportRange}.csv`, [
                    ['Date', 'Type', 'Statut', 'Payé', 'Mode', 'Total (MAD)', 'Articles'],
                    ...rangeOrders.map((o) => [
                      o.createdAt?.toDate().toLocaleString('fr-FR') || '',
                      kindLabel(o),
                      o.status || 'new',
                      o.paid ? 'oui' : 'non',
                      o.paymentMethod || '',
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
          </div>
        )}
      </main>

      {showNewOrder && <NewOrderPanel onClose={() => setShowNewOrder(false)} onSubmit={submitNewOrder} />}

      {selectedTable && (
        <TablePanel
          table={selectedTable}
          orders={tablesMap.get(selectedTable) || []}
          onClose={() => setSelectedTable(null)}
          onAddItems={(items, total) => addItemsToTable(selectedTable, items, total)}
          onCheckout={() =>
            setPayingTarget({ kind: 'table', table: selectedTable, orders: tablesMap.get(selectedTable) || [] })
          }
          onAdvanceOrder={advance}
          onCancelOrder={cancel}
        />
      )}

      {payingTarget && (
        <PaymentMethodModal
          label={payingTarget.kind === 'table' ? `Table ${payingTarget.table}` : kindLabel(payingTarget.order)}
          onChoose={choosePayment}
          onCancel={() => setPayingTarget(null)}
        />
      )}
    </div>
  );
}
