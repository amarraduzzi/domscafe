import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Lock, TrendingUp, Banknote, CreditCard, Bike, Wallet, Armchair, History, UtensilsCrossed, Search, Check, X, Pencil, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { db } from '../firebase';
import { initialCategories } from '../firebase';
import {
  type OrderDoc,
  type MenuOverride,
  type DailyClosure,
  type CashPayout,
  kindOf,
  buildMenu,
  computeStats,
  computePayoutsTotal,
  minutesSince,
  elapsedLabel,
  elapsedStyle,
  formatMAD,
  dateStr,
} from '../shared/posData';

// ---------------------------------------------------------------------------
// Dom's Café — écran propriétaire, mobile (domscafe.pages.dev/owner.html)
//
// Pensé UNIQUEMENT pour le téléphone du propriétaire : chiffres du jour en
// direct, historique (Rapports Z déjà clôturés côté caisse) et modification
// des articles du menu (prix/nom/catégorie/actif). Lit/écrit exactement les
// mêmes collections Firestore que l'écran caisse (src/pos/PosApp.tsx) --
// voir src/shared/posData.ts -- donc tout ce qui est vu ou changé ici est
// immédiatement cohérent avec la caisse, sans systeme séparé à maintenir.
//
// Accès : PIN unique (pas de vrai compte) -- même logique que le PIN
// manager de la caisse : un frein d'interface, pas une vraie sécurité (voir
// la note équivalente dans PosApp.tsx). Change OWNER_PIN ci-dessous si besoin.
// Le déverrouillage est mémorisé sur ce téléphone (localStorage) pour ne pas
// redemander le code à chaque ouverture.
// ---------------------------------------------------------------------------

const OWNER_PIN = '8080';
const OWNER_SESSION_KEY = 'domscafe_owner_unlocked';

function readStoredUnlock(): boolean {
  try {
    return window.localStorage.getItem(OWNER_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === OWNER_PIN) {
      try {
        window.localStorage.setItem(OWNER_SESSION_KEY, '1');
      } catch {
        // localStorage indisponible (navigation privée...) -- tant pis, il
        // redemandera le code la prochaine fois, rien de bloquant.
      }
      onUnlock();
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 text-[#F3ECDD]">
      <Lock className="w-10 h-10 text-brand-orange mb-4" />
      <h1 className="font-display text-2xl font-bold mb-1">Dom's Café</h1>
      <p className="text-sm text-[#9A9490] mb-6">Espace propriétaire</p>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={value}
        onChange={(e) => {
          setError(false);
          setValue(e.target.value.replace(/\D/g, '').slice(0, 8));
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Code PIN"
        className={`w-full max-w-xs text-center text-2xl tracking-[0.4em] bg-[#2b241c] border ${error ? 'border-red-500' : 'border-[#F3ECDD]/15'} rounded-xl py-3 px-4 text-[#F3ECDD] outline-none focus:border-brand-orange`}
      />
      {error && <p className="text-red-400 text-sm mt-2">Code incorrect</p>}
      <button
        onClick={submit}
        className="mt-5 w-full max-w-xs bg-brand-orange hover:bg-brand-orange-hover text-brand-dark font-bold py-3 rounded-xl transition"
      >
        Entrer
      </button>
    </div>
  );
}

type Tab = 'live' | 'history' | 'menu';

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof TrendingUp; label: string; value: string; sub?: string }) {
  return (
    <div className="pos-surface rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-brand-orange/15 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-brand-orange" />
      </div>
      <div className="min-w-0">
        <p className="text-[#9A9490] text-xs">{label}</p>
        <p className="text-[#F3ECDD] text-xl font-bold leading-tight truncate">{value}</p>
        {sub && <p className="text-[#9A9490] text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LiveTab({ orders, payouts }: { orders: OrderDoc[]; payouts: CashPayout[] }) {
  const today = dateStr();
  const todaysOrders = useMemo(
    () => orders.filter((o) => o.createdAt && dateStr(o.createdAt.toDate()) === today),
    [orders, today]
  );
  const todaysPayouts = useMemo(
    () => payouts.filter((p) => p.createdAt && dateStr(p.createdAt.toDate()) === today),
    [payouts, today]
  );
  const stats = useMemo(() => computeStats(todaysOrders), [todaysOrders]);
  const payoutsTotal = useMemo(() => computePayoutsTotal(todaysPayouts), [todaysPayouts]);

  const activeOrders = useMemo(
    () => orders.filter((o) => (o.status || 'new') !== 'served' && o.status !== 'cancelled'),
    [orders]
  );
  const occupiedTables = useMemo(() => {
    const map = new Map<string, OrderDoc[]>();
    activeOrders
      .filter((o) => kindOf(o) === 'dine_in' && o.tableNumber)
      .forEach((o) => {
        const key = o.tableNumber!;
        map.set(key, [...(map.get(key) || []), o]);
      });
    return Array.from(map.entries())
      .map(([table, os]) => ({
        table,
        total: os.reduce((s, o) => s + o.total, 0),
        oldest: os.reduce((min, o) => Math.min(min, o.createdAt?.toMillis() || Date.now()), Date.now()),
        allPaid: os.every((o) => o.paid),
      }))
      .sort((a, b) => a.oldest - b.oldest);
  }, [activeOrders]);
  const activeCounters = activeOrders.filter((o) => kindOf(o) !== 'dine_in');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[#F3ECDD] font-display text-lg font-bold mb-3">Aujourd'hui</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={TrendingUp} label="Chiffre d'affaires" value={formatMAD(stats.revenue)} sub={`${stats.orderCount} commande(s)`} />
          <StatCard icon={Banknote} label="Cash" value={formatMAD(stats.cash)} sub={payoutsTotal > 0 ? `- ${formatMAD(payoutsTotal)} sorties` : undefined} />
          <StatCard icon={CreditCard} label="Carte" value={formatMAD(stats.card)} />
          <StatCard icon={Bike} label="Glovo" value={formatMAD(stats.glovo)} />
        </div>
        {payoutsTotal > 0 && (
          <div className="pos-surface rounded-2xl p-4 mt-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <Wallet className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <p className="text-[#9A9490] text-xs">Sorties de caisse aujourd'hui</p>
              <p className="text-[#F3ECDD] text-lg font-bold">
                {formatMAD(payoutsTotal)} <span className="text-[#9A9490] text-xs font-normal">-&gt; cash net attendu {formatMAD(stats.cash - payoutsTotal)}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-[#F3ECDD] font-display text-lg font-bold mb-3 flex items-center gap-2">
          <Armchair className="w-4.5 h-4.5 text-brand-orange" /> Tables occupées ({occupiedTables.length})
        </h2>
        {occupiedTables.length === 0 ? (
          <p className="text-[#9A9490] text-sm pos-surface rounded-2xl p-4">Aucune table occupée en ce moment.</p>
        ) : (
          <div className="space-y-2">
            {occupiedTables.map((t) => {
              const mins = Math.floor((Date.now() - t.oldest) / 60000);
              return (
                <div key={t.table} className="pos-surface rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#F3ECDD] font-bold">Table {t.table}</p>
                    <p className={`text-xs ${elapsedStyle(mins)}`}>{elapsedLabel(mins)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#F3ECDD] font-bold">{formatMAD(t.total)}</p>
                    <p className="text-xs text-[#9A9490]">{t.allPaid ? 'Payé' : 'Non payé'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-[#F3ECDD] font-display text-lg font-bold mb-3">En cours (emporter / livraison / Glovo)</h2>
        {activeCounters.length === 0 ? (
          <p className="text-[#9A9490] text-sm pos-surface rounded-2xl p-4">Rien en cours.</p>
        ) : (
          <div className="space-y-2">
            {activeCounters.map((o) => {
              const mins = minutesSince(o.createdAt);
              return (
                <div key={o.id} className="pos-surface rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[#F3ECDD] font-bold">{o.customerName || o.glovoRef || (kindOf(o) === 'takeaway' ? 'À emporter' : 'Livraison')}</p>
                    <p className={`text-xs ${elapsedStyle(mins)}`}>{elapsedLabel(mins)}</p>
                  </div>
                  <p className="text-[#F3ECDD] font-bold">{formatMAD(o.total)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Décale une date "YYYY-MM-DD" de `delta` jours civils, en passant par midi
// UTC pour éviter tout glissement de fuseau horaire (même truc que le rendu
// de date de l'ancien HistoryTab juste en dessous). Uniquement de
// l'arithmétique de calendrier -- ne rouvre pas la logique de coupure de
// journée commerciale de dateStr() (BUSINESS_DAY_CUTOFF_HOUR), qui a déjà
// fait son travail au moment où selectedDate a été choisie.
function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(date: string): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Historique -- demandé le 25/09/2026 : le propriétaire veut pouvoir revoir
// n'importe quel jour passé (à commencer par "hier"), pas seulement les
// jours où quelqu'un a pensé à faire le Rapport Z à la caisse. Les chiffres
// d'un jour donné sont donc maintenant calculés en direct depuis `orders`
// (exactement comme LiveTab le fait pour "Aujourd'hui"), que ce jour ait été
// clôturé ou non. Quand une clôture existe pour la date choisie, ce sont ses
// chiffres figés qui s'affichent à la place (badge "Clôturé") -- après
// clôture, les chiffres ne doivent plus bouger même si une commande de ce
// jour-là est modifiée plus tard (annulation tardive, correction...). Sans
// clôture, badge "Non clôturé" et calcul en direct.
function HistoryTab({ orders, payouts, closures }: { orders: OrderDoc[]; payouts: CashPayout[]; closures: DailyClosure[] }) {
  const yesterday = useMemo(() => addDays(dateStr(), -1), []);
  const [selectedDate, setSelectedDate] = useState(yesterday);
  const isToday = selectedDate === dateStr();

  const closure = useMemo(() => closures.find((c) => c.date === selectedDate) || null, [closures, selectedDate]);

  const ordersForDate = useMemo(
    () => orders.filter((o) => o.createdAt && dateStr(o.createdAt.toDate()) === selectedDate),
    [orders, selectedDate]
  );
  const payoutsForDate = useMemo(
    () => payouts.filter((p) => p.createdAt && dateStr(p.createdAt.toDate()) === selectedDate),
    [payouts, selectedDate]
  );
  const liveStats = useMemo(() => computeStats(ordersForDate), [ordersForDate]);
  const livePayoutsTotal = useMemo(() => computePayoutsTotal(payoutsForDate), [payoutsForDate]);

  // Chiffres affichés : ceux, figés, de la clôture si elle existe, sinon le
  // calcul en direct ci-dessus. `payoutsTotal` absent sur une clôture
  // d'avant le 13/09/2026 -- traité comme 0, comme partout ailleurs.
  const shown = closure
    ? {
        revenue: closure.revenue,
        cash: closure.cash,
        card: closure.card,
        glovo: closure.glovo,
        orderCount: closure.orderCount,
        payoutsTotal: closure.payoutsTotal || 0,
      }
    : {
        revenue: liveStats.revenue,
        cash: liveStats.cash,
        card: liveStats.card,
        glovo: liveStats.glovo,
        orderCount: liveStats.orderCount,
        payoutsTotal: livePayoutsTotal,
      };

  const sortedClosures = useMemo(() => [...closures].sort((a, b) => (a.date < b.date ? 1 : -1)), [closures]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[#F3ECDD] font-display text-lg font-bold flex items-center gap-2 mb-3">
          <History className="w-4.5 h-4.5 text-brand-orange" /> Historique
        </h2>

        {/* Navigateur de date -- flèches jour précédent/suivant (suivant
            désactivé sur aujourd'hui, on ne "regarde pas dans le futur"),
            plus un vrai sélecteur de date pour sauter directement à un jour
            plus ancien, et un raccourci "Aujourd'hui" pour revenir vite. */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="w-9 h-9 shrink-0 rounded-full pos-surface flex items-center justify-center text-[#F3ECDD]"
            aria-label="Jour précédent"
          >
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>
          <div className="relative flex-1">
            <CalendarDays className="w-4 h-4 text-[#9A9490] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              max={dateStr()}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#2b241c] border border-[#F3ECDD]/15 rounded-xl text-[#F3ECDD] text-sm outline-none focus:border-brand-orange"
            />
          </div>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={isToday}
            className="w-9 h-9 shrink-0 rounded-full pos-surface flex items-center justify-center text-[#F3ECDD] disabled:opacity-30"
            aria-label="Jour suivant"
          >
            <ChevronRight className="w-4.5 h-4.5" />
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSelectedDate(yesterday)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              selectedDate === yesterday ? 'bg-brand-orange text-brand-dark border-brand-orange' : 'border-[#F3ECDD]/20 text-[#9A9490]'
            }`}
          >
            Hier
          </button>
          <button
            onClick={() => setSelectedDate(dateStr())}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              isToday ? 'bg-brand-orange text-brand-dark border-brand-orange' : 'border-[#F3ECDD]/20 text-[#9A9490]'
            }`}
          >
            Aujourd'hui
          </button>
        </div>

        <div className="pos-surface rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[#F3ECDD] font-bold capitalize">{formatDateLabel(selectedDate)}</p>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                closure
                  ? 'text-[#8FBF8A] bg-[#8FBF8A]/10 border-[#8FBF8A]/40'
                  : 'text-[#9A9490] bg-white/5 border-[#F3ECDD]/15'
              }`}
            >
              {closure ? 'Clôturé' : 'Non clôturé'}
            </span>
          </div>
          <p className="text-[#F3ECDD] font-display font-black text-3xl mb-3">{formatMAD(shown.revenue)}</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-[#9A9490] mb-2">
            <div>Cash <span className="block text-[#F3ECDD] font-semibold">{formatMAD(shown.cash)}</span></div>
            <div>Carte <span className="block text-[#F3ECDD] font-semibold">{formatMAD(shown.card)}</span></div>
            <div>Glovo <span className="block text-[#F3ECDD] font-semibold">{formatMAD(shown.glovo)}</span></div>
          </div>
          <p className="text-xs text-[#9A9490]">
            {shown.orderCount} commande(s)
            {shown.payoutsTotal > 0 && <> · {formatMAD(shown.payoutsTotal)} sorties de caisse</>}
          </p>
          <p className="text-xs text-[#9A9490] mt-1">
            {closure
              ? `Clôturé le ${new Date(closure.closedAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} par ${closure.closedByEmployee}`
              : 'Pas de Rapport Z pour ce jour -- calcul en direct depuis les commandes.'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-[#9A9490] text-xs uppercase tracking-wide font-bold mb-2">Tous les jours clôturés</h3>
        {sortedClosures.length === 0 ? (
          <p className="text-[#9A9490] text-sm pos-surface rounded-2xl p-4">Aucun jour clôturé pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {sortedClosures.map((c) => (
              <button
                key={c.date}
                onClick={() => setSelectedDate(c.date)}
                className={`w-full text-left pos-surface rounded-xl p-3 flex items-center justify-between transition-all ${
                  selectedDate === c.date ? 'ring-2 ring-brand-orange/60' : ''
                }`}
              >
                <span className="text-[#F3ECDD] text-sm font-semibold capitalize">{formatDateLabel(c.date)}</span>
                <span className="text-[#F3ECDD] font-bold">{formatMAD(c.revenue)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CATEGORY_LABEL = new Map(initialCategories.filter((c) => c.id !== 'all').map((c) => [c.id, c.name.fr]));
const CATEGORY_OPTIONS = initialCategories.filter((c) => c.id !== 'all');

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
  item: { id: string; name: string; price: number; category: string; active: boolean };
  onClose: () => void;
  onSave: (patch: { name: string; price: number; category: string; active: boolean }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [category, setCategory] = useState(item.category);
  const [active, setActive] = useState(item.active);
  const priceNum = Number(price.replace(',', '.'));
  const valid = name.trim().length > 0 && !Number.isNaN(priceNum) && priceNum >= 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-[#2b241c] w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[#F3ECDD] font-bold text-lg mb-4">Modifier l'article</h3>
        <label className="block text-xs text-[#9A9490] mb-1">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 bg-[#1A1208] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-[#F3ECDD] outline-none focus:border-brand-orange"
        />
        <label className="block text-xs text-[#9A9490] mb-1">Prix (MAD)</label>
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full mb-3 bg-[#1A1208] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-[#F3ECDD] outline-none focus:border-brand-orange"
        />
        <label className="block text-xs text-[#9A9490] mb-1">Catégorie</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full mb-4 bg-[#1A1208] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-[#F3ECDD] outline-none focus:border-brand-orange"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>{c.name.fr}</option>
          ))}
        </select>
        <button
          onClick={() => setActive((a) => !a)}
          className={`w-full mb-4 rounded-lg py-2 font-semibold flex items-center justify-center gap-2 border ${
            active ? 'border-[#8FBF8A]/50 text-[#8FBF8A] bg-[#8FBF8A]/10' : 'border-red-500/50 text-red-400 bg-red-500/10'
          }`}
        >
          {active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {active ? 'Disponible' : 'Indisponible (masqué à la caisse)'}
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#F3ECDD]/15 text-[#9A9490]">Annuler</button>
          <button
            disabled={!valid}
            onClick={() => onSave({ name: name.trim(), price: priceNum, category, active })}
            className="flex-1 py-2.5 rounded-lg bg-brand-orange text-brand-dark font-bold disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuTab({ overrides }: { overrides: Map<string, MenuOverride> }) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const items = useMemo(() => buildMenu(overrides), [overrides]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((it) => it.name.fr.toLowerCase().includes(q)) : items;
    return [...list].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }, [items, query]);
  const editing = editingId ? items.find((it) => it.id === editingId) : null;

  const save = async (id: string, patch: { name: string; price: number; category: string; active: boolean }) => {
    try {
      await setDoc(
        doc(db, 'menuOverrides', id),
        { name: patch.name, price: patch.price, category: patch.category, active: patch.active },
        { merge: true }
      );
    } catch (err) {
      window.alert("Échec de l'enregistrement -- vérifie la connexion et réessaie.");
      console.warn(err);
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-[#F3ECDD] font-display text-lg font-bold flex items-center gap-2">
        <UtensilsCrossed className="w-4.5 h-4.5 text-brand-orange" /> Menu ({items.length})
      </h2>
      <div className="relative">
        <Search className="w-4 h-4 text-[#9A9490] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un article..."
          className="w-full pl-9 pr-3 py-2.5 bg-[#2b241c] border border-[#F3ECDD]/15 rounded-xl text-[#F3ECDD] outline-none focus:border-brand-orange"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((it) => (
          <button
            key={it.id}
            onClick={() => setEditingId(it.id)}
            className={`w-full text-left pos-surface rounded-xl p-3 flex items-center justify-between gap-2 ${it.available === false ? 'opacity-50' : ''}`}
          >
            <div className="min-w-0">
              <p className="text-[#F3ECDD] font-semibold truncate">{it.name.fr}</p>
              <p className="text-xs text-[#9A9490]">{CATEGORY_LABEL.get(it.category) || it.category}{it.available === false ? ' · indisponible' : ''}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[#F3ECDD] font-bold">{formatMAD(it.price)}</span>
              <Pencil className="w-3.5 h-3.5 text-[#9A9490]" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-[#9A9490] text-sm pos-surface rounded-2xl p-4">Aucun article ne correspond.</p>}
      </div>
      {editing && (
        <EditItemModal
          item={{ id: editing.id, name: editing.name.fr, price: editing.price, category: editing.category, active: editing.available !== false }}
          onClose={() => setEditingId(null)}
          onSave={(patch) => save(editing.id, patch)}
        />
      )}
    </div>
  );
}

export default function OwnerApp() {
  const [unlocked, setUnlocked] = useState(readStoredUnlock);
  const [tab, setTab] = useState<Tab>('live');
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [payouts, setPayouts] = useState<CashPayout[]>([]);
  const [closures, setClosures] = useState<DailyClosure[]>([]);
  const [overrides, setOverrides] = useState<Map<string, MenuOverride>>(new Map());

  // Mêmes collections, mêmes listeners (sans filtre) que la caisse -- voir
  // src/pos/PosApp.tsx. Uniquement actif une fois déverrouillé, pour ne pas
  // ouvrir de connexions Firestore inutiles sur l'écran PIN.
  useEffect(() => {
    if (!unlocked) return;
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc)));
    });
    const unsubPayouts = onSnapshot(collection(db, 'cashPayouts'), (snap) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashPayout)));
    });
    const unsubClosures = onSnapshot(collection(db, 'dailyClosures'), (snap) => {
      setClosures(snap.docs.map((d) => d.data() as DailyClosure));
    });
    const unsubMenu = onSnapshot(collection(db, 'menuOverrides'), (snap) => {
      const map = new Map<string, MenuOverride>();
      snap.docs.forEach((d) => map.set(d.id, d.data() as MenuOverride));
      setOverrides(map);
    });
    return () => {
      unsubOrders();
      unsubPayouts();
      unsubClosures();
      unsubMenu();
    };
  }, [unlocked]);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
    { key: 'live', label: 'En direct', icon: TrendingUp },
    { key: 'history', label: 'Historique', icon: History },
    { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
  ];

  return (
    <div className="min-h-screen bg-brand-dark pb-24">
      <header className="px-4 pt-5 pb-3 sticky top-0 bg-brand-dark/95 backdrop-blur z-10 border-b border-[#F3ECDD]/10">
        <h1 className="font-display text-xl font-bold text-[#F3ECDD]">Dom's Café</h1>
        <p className="text-xs text-[#9A9490]">Espace propriétaire</p>
      </header>
      <main className="px-4 py-4 max-w-md mx-auto">
        {tab === 'live' && <LiveTab orders={orders} payouts={payouts} />}
        {tab === 'history' && <HistoryTab orders={orders} payouts={payouts} closures={closures} />}
        {tab === 'menu' && <MenuTab overrides={overrides} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 bg-[#2b241c] border-t border-[#F3ECDD]/10 flex">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs ${active ? 'text-brand-orange' : 'text-[#9A9490]'}`}
            >
              <Icon className="w-5 h-5" />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
