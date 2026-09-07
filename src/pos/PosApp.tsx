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
//   - this screen's own "Nouvelle commande" panel, for walk-ins, phone
//     orders and (until the real API integration exists) Glovo orders
//     staff key in by hand, tagged with `source`.
// Older docs from before this screen existed simply lack `source`,
// `orderType` and `paid` — every read below treats those as optional and
// falls back sensibly, so nothing already written breaks.
//
// No payment processing happens here on purpose (per the brief: "geen
// bankverbinding nodig, gewoon een verzamelpunt"). "Marquer payé" only
// flips a boolean for the team's own bookkeeping.
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

type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
type OrderSource = 'site' | 'manual' | 'glovo';
type OrderKind = 'dine_in' | 'takeaway' | 'delivery' | 'glovo';

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
  customerName?: string;
  address?: string;
  glovoRef?: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Nouveau',
  preparing: 'En préparation',
  ready: 'Prêt',
  served: 'Servi',
  cancelled: 'Annulé',
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

function minutesSince(ts?: Timestamp): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 60000));
}

function elapsedStyle(mins: number): string {
  if (mins >= 15) return 'text-red-400';
  if (mins >= 6) return 'text-amber-400';
  return 'text-[#8FBF8A]';
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-brand-dark-card border border-[#F3ECDD]/10 rounded-2xl p-8 text-center">
        <h1 className="font-display font-black text-2xl text-[#F3ECDD] mb-1">DOM'S CAFÉ</h1>
        <p className="text-[#9A9490] text-sm mb-6">Écran commandes — code personnel</p>
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
          className="w-full text-center tracking-[0.5em] text-2xl bg-black/30 border border-[#F3ECDD]/20 rounded-xl py-3 text-[#F3ECDD] focus:outline-none focus:border-brand-orange mb-3"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-xs mb-3">Code incorrect.</p>}
        <button
          onClick={submit}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] font-display font-black py-3 rounded-xl transition-all"
        >
          Déverrouiller
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
    <div className="bg-brand-dark-card border border-[#F3ECDD]/10 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display font-bold text-[#F3ECDD] text-lg leading-tight">{kindLabel(order)}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${SOURCE_STYLE[source].className}`}>
              {SOURCE_STYLE[source].label}
            </span>
            <span className={`text-xs font-bold ${elapsedStyle(mins)}`}>{mins === 0 ? "à l'instant" : `il y a ${mins} min`}</span>
          </div>
        </div>
        <button
          onClick={() => onCancel(order)}
          title="Annuler la commande"
          className="text-[#7A736C] hover:text-red-400 text-xs shrink-0 px-1"
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

      <div className="flex items-center justify-between border-t border-[#F3ECDD]/10 pt-2">
        <span className="font-display font-black text-brand-orange">{formatMAD(order.total)}</span>
        <button
          onClick={() => onTogglePaid(order)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
            order.paid
              ? 'bg-[#8FBF8A]/15 text-[#8FBF8A] border-[#8FBF8A]/40'
              : 'bg-transparent text-[#9A9490] border-[#F3ECDD]/20 hover:border-[#F3ECDD]/40'
          }`}
        >
          {order.paid ? '✓ Payé' : 'Marquer payé'}
        </button>
      </div>

      {nextLabel && (
        <button
          onClick={() => onAdvance(order)}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover text-[#1A1208] font-display font-black py-2.5 rounded-lg transition-all"
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

function NewOrderPanel({ onClose, onSubmit }: { onClose: () => void; onSubmit: (payload: any) => Promise<void> }) {
  const [kind, setKind] = useState<OrderKind>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [glovoRef, setGlovoRef] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(
    () => initialCategories.filter((c) => c.id !== 'all'),
    []
  );

  const items = useMemo(() => {
    const available = staticMenuItems.filter((it) => it.available !== false);
    const bySearch = search.trim()
      ? available.filter((it) => (it.name.fr + ' ' + it.name.en).toLowerCase().includes(search.toLowerCase()))
      : available;
    return activeCategory === 'all' ? bySearch : bySearch.filter((it) => it.category === activeCategory);
  }, [search, activeCategory]);

  const total = draft.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

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

  const canSubmit =
    draft.length > 0 &&
    (kind !== 'dine_in' || tableNumber.trim()) &&
    (kind !== 'delivery' || (customerName.trim() && address.trim())) &&
    (kind !== 'glovo' || glovoRef.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const orderItems: OrderItem[] = draft.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.quantity,
      station: l.station,
    }));
    await onSubmit({
      restaurantId: 'doms-cafe',
      tableNumber: kind === 'dine_in' ? tableNumber.trim() : '?',
      items: orderItems,
      total,
      status: 'new' as OrderStatus,
      source: (kind === 'glovo' ? 'glovo' : 'manual') as OrderSource,
      orderType: kind,
      paid: false,
      customerName: customerName.trim() || undefined,
      address: kind === 'delivery' ? address.trim() : undefined,
      glovoRef: kind === 'glovo' ? glovoRef.trim() : undefined,
      createdAt: serverTimestamp(),
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-stretch justify-end">
      <div className="w-full max-w-2xl bg-brand-dark border-l border-[#F3ECDD]/10 flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3ECDD]/10 shrink-0">
          <h2 className="font-display font-black text-xl text-[#F3ECDD]">Nouvelle commande</h2>
          <button onClick={onClose} className="text-[#9A9490] hover:text-[#F3ECDD] text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-[#F3ECDD]/10 shrink-0">
          <div className="flex gap-2 flex-wrap">
            {(['dine_in', 'takeaway', 'delivery', 'glovo'] as OrderKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                  kind === k
                    ? 'bg-brand-orange text-[#1A1208] border-brand-orange'
                    : 'bg-transparent text-[#9A9490] border-[#F3ECDD]/20 hover:border-[#F3ECDD]/40'
                }`}
              >
                {k === 'dine_in' ? 'Sur place' : k === 'takeaway' ? 'À emporter' : k === 'delivery' ? 'Livraison' : 'Glovo'}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            {kind === 'dine_in' && (
              <input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="N° de table"
                className="flex-1 min-w-[140px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
            {(kind === 'takeaway' || kind === 'delivery') && (
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom du client"
                className="flex-1 min-w-[140px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
            {kind === 'delivery' && (
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Adresse de livraison"
                className="flex-[2] min-w-[200px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
            {kind === 'glovo' && (
              <input
                value={glovoRef}
                onChange={(e) => setGlovoRef(e.target.value)}
                placeholder="Référence Glovo / nom client"
                className="flex-1 min-w-[140px] bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
              />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex">
          <div className="flex-1 p-5 overflow-y-auto">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un article…"
              className="w-full bg-black/30 border border-[#F3ECDD]/20 rounded-lg px-3 py-2 mb-3 text-[#F3ECDD] placeholder:text-[#7A736C] focus:outline-none focus:border-brand-orange"
            />
            <div className="flex gap-2 flex-wrap mb-4">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  activeCategory === 'all' ? 'bg-brand-orange text-[#1A1208] border-brand-orange' : 'text-[#9A9490] border-[#F3ECDD]/20'
                }`}
              >
                Tout
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    activeCategory === c.id ? 'bg-brand-orange text-[#1A1208] border-brand-orange' : 'text-[#9A9490] border-[#F3ECDD]/20'
                  }`}
                >
                  {c.emoji} {c.name.fr}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => addItem(it.name.fr, it.price, it.station)}
                  className="text-start bg-brand-dark-card border border-[#F3ECDD]/10 hover:border-brand-orange/50 rounded-lg p-2.5 transition-all"
                >
                  <p className="text-sm font-bold text-[#F3ECDD] leading-tight">{it.name.fr}</p>
                  <p className="text-xs text-brand-orange font-black">{formatMAD(it.price)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="w-72 border-s border-[#F3ECDD]/10 p-5 flex flex-col shrink-0">
            <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-2">Panier</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {draft.length === 0 && <p className="text-[#7A736C] text-sm">Aucun article.</p>}
              {draft.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between bg-brand-dark-card rounded-lg px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-sm text-[#F3ECDD] truncate">{l.name}</p>
                    <p className="text-xs text-[#9A9490]">{formatMAD(l.unitPrice * l.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => changeQty(idx, -1)} className="w-6 h-6 rounded bg-black/30 text-[#F3ECDD]">
                      −
                    </button>
                    <span className="text-sm text-[#F3ECDD] w-4 text-center">{l.quantity}</span>
                    <button onClick={() => changeQty(idx, 1)} className="w-6 h-6 rounded bg-black/30 text-[#F3ECDD]">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#F3ECDD]/10 pt-3 mt-3">
              <div className="flex justify-between mb-3">
                <span className="text-[#9A9490] text-sm">Total</span>
                <span className="text-brand-orange font-display font-black text-lg">{formatMAD(total)}</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed text-[#1A1208] font-display font-black py-3 rounded-xl transition-all"
              >
                {submitting ? 'Envoi…' : 'Envoyer la commande'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = 'live' | 'tables' | 'history';

export default function PosApp() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(PIN_SESSION_KEY) === '1');
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [tab, setTab] = useState<Tab>('live');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState(Date.now());
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
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
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const advance = async (order: OrderDoc) => {
    const next: Record<OrderStatus, OrderStatus> = { new: 'preparing', preparing: 'ready', ready: 'served', served: 'served', cancelled: 'cancelled' };
    await updateDoc(doc(db, 'orders', order.id), { status: next[order.status || 'new'] });
  };
  const togglePaid = async (order: OrderDoc) => {
    await updateDoc(doc(db, 'orders', order.id), { paid: !order.paid });
  };
  const cancel = async (order: OrderDoc) => {
    if (!window.confirm(`Annuler la commande (${kindLabel(order)}) ?`)) return;
    await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
  };
  const submitNewOrder = async (payload: any) => {
    await addDoc(collection(db, 'orders'), payload);
  };

  const activeOrders = useMemo(
    () => orders.filter((o) => (o.status || 'new') !== 'served' && o.status !== 'cancelled'),
    [orders]
  );
  const liveOrders = useMemo(
    () => [...activeOrders].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)),
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
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [activeOrders]);
  const historyOrders = useMemo(() => {
    const today = startOfToday();
    return orders
      .filter((o) => (o.status === 'served' || o.status === 'cancelled') && (o.createdAt?.toMillis() || 0) >= today)
      .slice(0, 60);
  }, [orders]);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-brand-dark text-[#F3ECDD]">
      {flash && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-brand-orange text-[#1A1208] text-center py-2 font-display font-black animate-pulse">
          Nouvelle commande !
        </div>
      )}

      <header className="sticky top-0 z-40 bg-brand-dark/95 backdrop-blur border-b border-[#F3ECDD]/10 px-5 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-black text-xl leading-tight">DOM'S CAFÉ</h1>
          <p className="text-[#9A9490] text-xs">
            Écran commandes ·{' '}
            {new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['live', 'tables', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === t ? 'bg-brand-orange text-[#1A1208]' : 'bg-brand-dark-card text-[#9A9490] hover:text-[#F3ECDD]'
              }`}
            >
              {t === 'live' ? `Commandes (${liveOrders.length})` : t === 'tables' ? `Tables (${tablesMap.length})` : 'Historique'}
            </button>
          ))}
          <button
            onClick={() => setShowNewOrder(true)}
            className="px-4 py-2 rounded-lg text-sm font-black bg-[#F3ECDD]/10 hover:bg-[#F3ECDD]/20 text-[#F3ECDD] transition-all"
          >
            + Nouvelle commande
          </button>
        </div>
      </header>

      <main className="p-5">
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

        {tab === 'tables' && (
          tablesMap.length === 0 ? (
            <p className="text-[#7A736C] text-center py-20">Aucune table active.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tablesMap.map(([table, tableOrders]) => {
                const tableTotal = tableOrders.reduce((s, o) => s + o.total, 0);
                const allPaid = tableOrders.every((o) => o.paid);
                return (
                  <div key={table} className="bg-brand-dark-card border border-[#F3ECDD]/10 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="font-display font-black text-lg">Table {table}</p>
                      <span className="text-xs text-[#9A9490]">{tableOrders.length} commande{tableOrders.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2 border-t border-[#F3ECDD]/10 pt-2">
                      {tableOrders.map((o) => (
                        <div key={o.id} className="text-sm">
                          <div className="flex justify-between text-[#9A9490]">
                            <span>{STATUS_LABEL[o.status || 'new']}</span>
                            <span>{formatMAD(o.total)}</span>
                          </div>
                          {o.items.map((it, i) => (
                            <p key={i} className="text-[#E3DCCB] text-xs ps-2">
                              {it.quantity}× {it.name}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#F3ECDD]/10 pt-2">
                      <span className="font-display font-black text-brand-orange">{formatMAD(tableTotal)}</span>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Encaisser et clôturer la table ${table} ?`)) return;
                          await Promise.all(
                            tableOrders.map((o) => updateDoc(doc(db, 'orders', o.id), { paid: true, status: 'served' }))
                          );
                        }}
                        className="text-xs font-black px-3 py-1.5 rounded-lg bg-brand-orange text-[#1A1208]"
                      >
                        {allPaid ? 'Clôturer' : 'Encaisser'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === 'history' && (
          historyOrders.length === 0 ? (
            <p className="text-[#7A736C] text-center py-20">Rien aujourd'hui pour l'instant.</p>
          ) : (
            <div className="max-w-2xl mx-auto space-y-2">
              {historyOrders.map((o) => (
                <div key={o.id} className="bg-brand-dark-card border border-[#F3ECDD]/10 rounded-lg px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#F3ECDD]">{kindLabel(o)}</p>
                    <p className="text-xs text-[#9A9490]">
                      {o.createdAt?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {o.status === 'cancelled' ? 'Annulé' : o.paid ? 'Payé' : 'Non payé'}
                    </p>
                  </div>
                  <span className="text-brand-orange font-black">{formatMAD(o.total)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {showNewOrder && <NewOrderPanel onClose={() => setShowNewOrder(false)} onSubmit={submitNewOrder} />}
    </div>
  );
}
