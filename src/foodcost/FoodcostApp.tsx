import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import {
  Lock,
  Calculator,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Package,
  ClipboardList,
  BarChart3,
  Info,
  Boxes,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShoppingCart,
} from 'lucide-react';
import { db } from '../firebase';
import { menuItems as staticMenuItems, type MenuItem } from '../data';
import { formatMAD, dateStr, type OrderDoc } from '../shared/posData';
import { DEFAULT_INGREDIENTS, DEFAULT_RECIPES } from './foodcostSeed';

// ---------------------------------------------------------------------------
// Dom's Café — outil Foodcost (domscafe.pages.dev/foodcost.html)
//
// Demandé le 16/09/2026 : un outil "type Excel" pour suivre le coût réel des
// recettes, PAS une base de données cachée. Chaque table est directement
// visible et modifiable à l'écran (nom, prix, quantités...) -- rien ne se
// calcule "derrière" sans être montré. Les données vivent dans Firestore
// (mêmes projet/règles que le reste du site) uniquement pour survivre entre
// deux visites et entre le téléphone et l'ordinateur -- pas un système
// séparé à administrer, et toujours visible/éditable ici, jamais seulement
// en base.
//
// Les gerechten (plats) sont préremplis depuis data.ts (le vrai menu) --
// pas besoin de les retaper : voir DISHES ci-dessous. Ajouter un ingrédient
// et une recette suffit pour que le foodcost de ce plat apparaisse partout.
//
// Accès : même code manager que la caisse (voir MANAGER_PIN dans
// PosApp.tsx) -- à garder synchronisé si vous changez l'un des deux.
// ---------------------------------------------------------------------------

const MANAGER_PIN = '7734';
const SESSION_KEY = 'domscafe_foodcost_unlocked';

function readStoredUnlock(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === MANAGER_PIN) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // pas grave, redemandera le code la prochaine fois
      }
      onUnlock();
    } else {
      setError(true);
      setValue('');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 text-[#F3ECDD]">
      <Calculator className="w-10 h-10 text-brand-orange mb-4" />
      <h1 className="font-display text-2xl font-bold mb-1">Dom's Café</h1>
      <p className="text-sm text-[#9A9490] mb-6">Foodcost -- code manager</p>
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

// ---------------------------------------------------------------------------
// Types + données Firestore
// ---------------------------------------------------------------------------

type Unit = 'kg' | 'liter' | 'stuk';

const UNIT_LABEL: Record<Unit, string> = { kg: 'kg', liter: 'litre', stuk: 'pièce' };
// Unité de recette correspondante (plus fine, pour des quantités par plat) --
// gramme pour un ingrédient acheté au kilo, ml pour un ingrédient acheté au
// litre, pièce à pièce pour "stuk".
const RECIPE_UNIT_LABEL: Record<Unit, string> = { kg: 'g', liter: 'ml', stuk: 'pièce(s)' };

interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  unitPrice: number; // MAD par kg / par litre / par pièce
  deliveryDays?: number; // nombre de jours entre deux livraisons -- sert au conseil d'achat du jour
}

// Fréquence de livraison par défaut (jours) quand l'ingrédient n'a pas encore
// été renseigné individuellement.
const DEFAULT_DELIVERY_DAYS = 7;

interface RecipeLine {
  ingredientId: string;
  quantity: number; // en RECIPE_UNIT_LABEL[unit] de l'ingrédient
}

interface Recipe {
  dishId: string;
  lines: RecipeLine[];
}

// Coût MAD d'une ligne de recette.
function lineCost(ingredient: Ingredient | undefined, quantity: number): number {
  if (!ingredient || !isFinite(quantity)) return 0;
  if (ingredient.unit === 'stuk') return ingredient.unitPrice * quantity;
  // kg/liter : prix d'achat par kg ou litre, quantité de recette en g/ml.
  return ingredient.unitPrice * (quantity / 1000);
}

function recipeCost(recipe: Recipe | undefined, ingredientsById: Map<string, Ingredient>): number {
  if (!recipe) return 0;
  return recipe.lines.reduce((sum, l) => sum + lineCost(ingredientsById.get(l.ingredientId), l.quantity), 0);
}

function foodcostPct(cost: number, price: number): number {
  if (!price) return 0;
  return (cost / price) * 100;
}

function foodcostColor(pct: number): string {
  if (pct <= 0) return 'text-[#7A736C]';
  if (pct < 30) return 'text-[#8FBF8A]';
  if (pct <= 40) return 'text-[#D9A45C]';
  return 'text-red-400';
}

// formatMAD() de posData arrondit à l'entier -- très bien pour des prix de
// vente (toujours ronds ici), mais un coût de recette hérite directement des
// prix d'achat des ingrédients qui, eux, ont des centimes (ex : un croissant
// à 6,50 DH). Arrondir ça à 7 MAD cache l'info qu'on est justement en train
// d'afficher. Donc pour tout ce qui est coût/recette : décimales visibles
// quand il y en a, entier tout court sinon.
function formatCostMAD(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} MAD` : `${rounded.toFixed(2)} MAD`;
}

function foodcostBg(pct: number): string {
  if (pct <= 0) return '';
  if (pct < 30) return 'bg-[#8FBF8A]/10';
  if (pct <= 40) return 'bg-[#D9A45C]/10';
  return 'bg-red-500/10';
}

// ---------------------------------------------------------------------------
// Semaine ISO -- "YYYY-Www", compatible avec <input type="week">.
// ---------------------------------------------------------------------------

function isoWeekId(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function mondayOfWeek(weekId: string): Date {
  const [yearStr, wStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 1 - dow);
  return simple;
}

function shiftWeek(weekId: string, deltaWeeks: number): string {
  const monday = mondayOfWeek(weekId);
  return isoWeekId(new Date(monday.getTime() + deltaWeeks * 7 * 86400000));
}

function weekRangeLabel(weekId: string): string {
  const start = mondayOfWeek(weekId);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ---------------------------------------------------------------------------

// Doit rester identique aux constantes du même nom dans PosApp.tsx --
// utilisées ici uniquement pour générer le prix des variantes "(Emporter)"
// et "(Menu)" ci-dessous, jamais pour modifier une commande.
const TAKEAWAY_DISCOUNT = 1;
const MENU_SURCHARGE = 8;

// Un plat de base ("Café noir") ET, quand la caisse propose ce choix, ses
// variantes "(Emporter)" et "(Menu)" comme plats à part entière -- ce ne
// sont pas juste des prix différents, ce sont de vraies recettes
// différentes (pas de bouteille d'eau à emporter ; un soda en plus dans le
// menu sandwich/tacos). Voir foodcostSeed.ts (DEFAULT_RECIPES) pour les
// recettes standards de ces variantes, et menuEligible/takeawayEligible
// dans PosApp.tsx pour la même logique côté caisse.
const DISHES: { id: string; name: string; category: string; price: number }[] = (() => {
  const base = staticMenuItems.map((m: MenuItem) => ({ id: m.id, name: m.name.fr, category: m.category, price: m.price }));
  const variants: typeof base = [];
  staticMenuItems.forEach((m: MenuItem) => {
    if (m.category === 'boissons_chaudes') {
      variants.push({ id: `${m.id}::emporter`, name: `${m.name.fr} (Emporter)`, category: m.category, price: m.price - TAKEAWAY_DISCOUNT });
    }
    if (m.category === 'sandwiches' || m.category === 'tacos') {
      variants.push({ id: `${m.id}::menu`, name: `${m.name.fr} (Menu)`, category: m.category, price: m.price + MENU_SURCHARGE });
    }
  });
  return [...base, ...variants];
})();

type Tab = 'ingredients' | 'recipes' | 'foodcost' | 'inventory' | 'sales' | 'week';

interface InventoryEntry {
  qty: number; // champ historique, plus affiché -- voir InventoryBaseline
  parLevel: number;
}

// "0-meting" (comptage physique) par ingrédient : le point de départ à
// partir duquel le stock est ensuite calculé automatiquement (jamais tapé
// à la main entre deux comptages). Un nouveau comptage remplace le
// précédent -- c'est aussi le moment où la casse/le vol/la portion trop
// généreuse se voit : l'écart entre "stock calculé juste avant" et "ce que
// vous comptez réellement".
interface InventoryBaseline {
  qty: number;
  setAt: number; // Date.now() au moment du comptage
}

// Une livraison reçue -- collection séparée plutôt qu'additionnée
// directement au comptage, pour garder une trace de chaque entrée de stock.
interface PurchaseLogEntry {
  id: string;
  ingredientId: string;
  qty: number;
  createdAt: number;
}

// Fenêtre glissante sur laquelle on calcule la consommation théorique
// moyenne/jour (pour l'inventaire et la prédiction d'achats), à partir des
// VRAIES commandes Firestore (collection "orders") -- pas des ventes tapées
// à la main dans l'onglet Vente / Achat, qui restent réservées à la
// comparaison "réel dépensé vs théorique" par semaine.
const PREDICTION_WINDOW_DAYS = 30;

// Associe le nom d'un article de commande à UN SEUL plat -- important
// depuis l'ajout des variantes "(Emporter)"/"(Menu)" dans DISHES : une
// correspondance "startsWith" naïve testée plat par plat compterait
// "Café noir (Emporter)" à la fois sous "Café noir" (préfixe) ET sous
// "Café noir (Emporter)" (exact), ce qui doublerait le théorique. On
// cherche donc d'abord une correspondance EXACTE (couvre les variantes
// connues) et on ne retombe sur un préfixe que pour un suffixe non modélisé
// ici (ex : l'ancien "(Gratis - fidélité)" dans d'anciennes commandes).
function resolveDishForItemName(itemName: string): { id: string; name: string; category: string; price: number } | undefined {
  const exact = DISHES.find((d) => d.name === itemName);
  if (exact) return exact;
  let best: (typeof DISHES)[number] | undefined;
  DISHES.forEach((d) => {
    if (itemName.startsWith(d.name + ' (') && (!best || d.name.length > best.name.length)) best = d;
  });
  return best;
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Package; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold border transition-all ${
        active
          ? 'bg-brand-orange border-brand-orange text-[#1A1208]'
          : 'border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left text-[10px] font-bold text-[#7A736C] uppercase tracking-wider px-3 py-2 ${className}`}>{children}</th>;
}

export default function FoodcostApp() {
  const [unlocked, setUnlocked] = useState(readStoredUnlock);
  const [tab, setTab] = useState<Tab>('ingredients');

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());
  const [selectedDishId, setSelectedDishId] = useState<string>(DISHES[0]?.id || '');
  const [selectedWeek, setSelectedWeek] = useState<string>(() => isoWeekId(new Date()));
  const [salesQty, setSalesQty] = useState<Record<string, number>>({});
  const [purchaseSpent, setPurchaseSpent] = useState<Record<string, number>>({});
  const [sortDesc, setSortDesc] = useState(true);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [inventory, setInventory] = useState<Map<string, InventoryEntry>>(new Map());
  const [baselines, setBaselines] = useState<Map<string, InventoryBaseline>>(new Map());
  const [purchaseLog, setPurchaseLog] = useState<PurchaseLogEntry[]>([]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'fcIngredients'), (snap) => {
      setIngredients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ingredient, 'id'>) })));
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'fcRecipes'), (snap) => {
      const map = new Map<string, Recipe>();
      snap.docs.forEach((d) => map.set(d.id, { dishId: d.id, lines: (d.data().lines as RecipeLine[]) || [] }));
      setRecipes(map);
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(doc(db, 'fcSales', selectedWeek), (snap) => {
      setSalesQty((snap.exists() ? (snap.data().qty as Record<string, number>) : {}) || {});
    });
    return () => unsub();
  }, [unlocked, selectedWeek]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(doc(db, 'fcPurchases', selectedWeek), (snap) => {
      setPurchaseSpent((snap.exists() ? (snap.data().spent as Record<string, number>) : {}) || {});
    });
    return () => unsub();
  }, [unlocked, selectedWeek]);

  // Vraies commandes (même collection que la caisse / l'écran propriétaire)
  // -- sert à calculer automatiquement les ventes réelles (bouton "Remplir
  // avec les vraies ventes") et la consommation moyenne/jour pour
  // l'inventaire et la prédiction d'achats.
  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, 'id'>) })));
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'fcInventory'), (snap) => {
      const map = new Map<string, InventoryEntry>();
      snap.docs.forEach((d) => {
        const data = d.data();
        map.set(d.id, { qty: Number(data.qty) || 0, parLevel: Number(data.parLevel) || 0 });
      });
      setInventory(map);
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'fcInventoryBaseline'), (snap) => {
      const map = new Map<string, InventoryBaseline>();
      snap.docs.forEach((d) => {
        const data = d.data();
        map.set(d.id, { qty: Number(data.qty) || 0, setAt: Number(data.setAt) || 0 });
      });
      setBaselines(map);
    });
    return () => unsub();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onSnapshot(collection(db, 'fcPurchasesLog'), (snap) => {
      setPurchaseLog(
        snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ingredientId: data.ingredientId, qty: Number(data.qty) || 0, createdAt: Number(data.createdAt) || 0 };
        })
      );
    });
    return () => unsub();
  }, [unlocked]);

  const ingredientsById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const dishesById = useMemo(() => new Map(DISHES.map((d) => [d.id, d])), []);

  const dishRows = useMemo(() => {
    return DISHES.map((d) => {
      const recipe = recipes.get(d.id);
      const cost = recipeCost(recipe, ingredientsById);
      const pct = foodcostPct(cost, d.price);
      return { ...d, cost, pct, hasRecipe: !!recipe && recipe.lines.length > 0 };
    });
  }, [recipes, ingredientsById]);

  const sortedDishRows = useMemo(() => {
    return [...dishRows].sort((a, b) => (sortDesc ? b.pct - a.pct : a.pct - b.pct));
  }, [dishRows, sortDesc]);

  // ---------------------------------------------------------------------
  // Consommation réelle des N derniers jours, à partir des vraies commandes
  // -- sert à l'inventaire (conso. moyenne/jour, jours restants, suggestion
  // d'achat) et sera la base de la prédiction d'achats quotidienne.
  // ---------------------------------------------------------------------
  const recentOrders = useMemo(() => {
    const cutoff = Date.now() - PREDICTION_WINDOW_DAYS * 86400000;
    return orders.filter((o) => o.status !== 'cancelled' && o.createdAt && o.createdAt.toMillis() >= cutoff);
  }, [orders]);

  // Nombre de jours réellement couverts par les données (peut être < 30 si
  // le système vient d'être mis en route) -- évite de diviser par 30 alors
  // qu'on n'a que 3 jours d'historique et donc de sous-estimer la conso.
  const predictionDaysSpan = useMemo(() => {
    if (recentOrders.length === 0) return 1;
    const earliest = recentOrders.reduce((min, o) => Math.min(min, o.createdAt!.toMillis()), Date.now());
    return Math.max(1, Math.min(PREDICTION_WINDOW_DAYS, Math.ceil((Date.now() - earliest) / 86400000)));
  }, [recentOrders]);

  const itemQtyByNameRecent = useMemo(() => {
    const map = new Map<string, number>();
    recentOrders.forEach((o) => o.items.forEach((it) => map.set(it.name, (map.get(it.name) || 0) + it.quantity)));
    return map;
  }, [recentOrders]);

  const dishQtyRecent = useMemo(() => {
    const map = new Map<string, number>();
    itemQtyByNameRecent.forEach((qty, name) => {
      const dish = resolveDishForItemName(name);
      if (!dish) return;
      map.set(dish.id, (map.get(dish.id) || 0) + qty);
    });
    return map;
  }, [itemQtyByNameRecent]);

  // Quantité théorique consommée par ingrédient sur la fenêtre, dans son
  // unité d'achat (kg / litre / pièce) -- pas en MAD.
  const ingredientQtyUsedRecent = useMemo(() => {
    const map = new Map<string, number>();
    DISHES.forEach((d) => {
      const qtySold = dishQtyRecent.get(d.id) || 0;
      if (qtySold <= 0) return;
      const recipe = recipes.get(d.id);
      recipe?.lines.forEach((l) => {
        const ing = ingredientsById.get(l.ingredientId);
        if (!ing) return;
        const perUnit = ing.unit === 'stuk' ? l.quantity : l.quantity / 1000;
        map.set(l.ingredientId, (map.get(l.ingredientId) || 0) + perUnit * qtySold);
      });
    });
    return map;
  }, [dishQtyRecent, recipes, ingredientsById]);

  const avgDailyUsage = (ingredientId: string): number => (ingredientQtyUsedRecent.get(ingredientId) || 0) / predictionDaysSpan;

  // ---------------------------------------------------------------------
  // Conso. moyenne PAR JOUR DE LA SEMAINE (lun/mar/.../dim) -- une conso.
  // "générale" sur 30 jours mélange vendredi et mardi, alors qu'un café peut
  // vendre très différemment selon le jour. Fenêtre plus large (8 semaines)
  // pour avoir un échantillon correct par jour. Sert au conseil d'achat du
  // jour ci-dessous ; les colonnes historiques de l'onglet Inventaire (Conso.
  // moy/jour, jours restants) restent, elles, sur la moyenne generale.
  // ---------------------------------------------------------------------
  const WEEKDAY_WINDOW_DAYS = 56;

  const weekdayOrders = useMemo(() => {
    const cutoff = Date.now() - WEEKDAY_WINDOW_DAYS * 86400000;
    return orders.filter((o) => o.status !== 'cancelled' && o.createdAt && o.createdAt.toMillis() >= cutoff);
  }, [orders]);

  // Combien de fois chaque jour de la semaine (0=dimanche ... 6=samedi) est
  // réellement apparu dans la fenêtre -- pour diviser juste, y compris quand
  // le système vient d'être mis en route et que la fenêtre n'est pas pleine.
  const weekdayOccurrences = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = Date.now();
    for (let i = 0; i < WEEKDAY_WINDOW_DAYS; i++) {
      counts[new Date(now - i * 86400000).getDay()]++;
    }
    return counts;
  }, []);

  const dishQtyByWeekday = useMemo(() => {
    const map: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];
    weekdayOrders.forEach((o) => {
      const wd = o.createdAt!.toDate().getDay();
      o.items.forEach((it) => {
        const dish = resolveDishForItemName(it.name);
        if (!dish) return;
        map[wd].set(dish.id, (map[wd].get(dish.id) || 0) + it.quantity);
      });
    });
    return map;
  }, [weekdayOrders]);

  const ingredientQtyByWeekday = useMemo(() => {
    const map: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];
    for (let wd = 0; wd < 7; wd++) {
      dishQtyByWeekday[wd].forEach((qtySold, dishId) => {
        const recipe = recipes.get(dishId);
        recipe?.lines.forEach((l) => {
          const ing = ingredientsById.get(l.ingredientId);
          if (!ing) return;
          const perUnit = ing.unit === 'stuk' ? l.quantity : l.quantity / 1000;
          map[wd].set(l.ingredientId, (map[wd].get(l.ingredientId) || 0) + perUnit * qtySold);
        });
      });
    }
    return map;
  }, [dishQtyByWeekday, recipes, ingredientsById]);

  // Conso. moyenne prévue pour un jour de la semaine donné. Si on n'a pas
  // encore vu ce jour-là au moins 2 fois dans la fenêtre (système tout juste
  // démarré), on retombe sur la moyenne générale plutôt que de sortir un
  // chiffre basé sur un seul jour, pas fiable.
  const avgUsageForWeekday = (ingredientId: string, weekday: number): number => {
    const occurrences = weekdayOccurrences[weekday];
    if (occurrences < 2) return avgDailyUsage(ingredientId);
    return (ingredientQtyByWeekday[weekday].get(ingredientId) || 0) / occurrences;
  };

  // Conso. théorique cumulée sur les "horizonDays" prochains jours, à partir
  // d'aujourd'hui, jour de la semaine par jour de la semaine.
  const projectedUsage = (ingredientId: string, horizonDays: number): number => {
    const todayWd = new Date().getDay();
    let total = 0;
    for (let i = 0; i < horizonDays; i++) {
      total += avgUsageForWeekday(ingredientId, (todayWd + i) % 7);
    }
    return total;
  };

  // Quantité à commander aujourd'hui pour tenir jusqu'à la prochaine
  // livraison prévue (fréquence réglée par ingrédient, ou {DEFAULT_DELIVERY_DAYS}
  // jours par défaut), en tenant aussi compte du niveau cible réglé à la main.
  // null = pas de 0-meting pour cet ingrédient -> pas de conseil possible.
  const suggestedBuyQty = (ingredientId: string, ing: Ingredient): number | null => {
    const stock = computedStock(ingredientId);
    if (stock === null) return null;
    const days = ing.deliveryDays && ing.deliveryDays > 0 ? ing.deliveryDays : DEFAULT_DELIVERY_DAYS;
    const parLevel = inventory.get(ingredientId)?.parLevel || 0;
    const target = Math.max(projectedUsage(ingredientId, days), parLevel);
    return Math.max(0, target - stock);
  };

  // ---------------------------------------------------------------------
  // Stock calculé = dernier comptage ("0-meting") + inkoop enregistré
  // depuis − vraies ventes (théorique, via les recettes) depuis. Jamais un
  // champ qu'on tape à la main entre deux comptages -- voir InventoryBaseline
  // plus haut.
  //
  // dishQtySinceCutoff() est mis en cache par date de comptage : la plupart
  // du temps, plusieurs ingrédients sont comptés ensemble (même "setAt"), ce
  // qui évite de repasser sur toutes les commandes une fois par ingrédient.
  // ---------------------------------------------------------------------
  const dishQtySinceCutoff = useMemo(() => {
    const cache = new Map<number, Map<string, number>>();
    return (cutoff: number): Map<string, number> => {
      const cached = cache.get(cutoff);
      if (cached) return cached;
      const filtered = orders.filter((o) => o.status !== 'cancelled' && o.createdAt && o.createdAt.toMillis() >= cutoff);
      const nameQty = new Map<string, number>();
      filtered.forEach((o) => o.items.forEach((it) => nameQty.set(it.name, (nameQty.get(it.name) || 0) + it.quantity)));
      const dishQty = new Map<string, number>();
      nameQty.forEach((v, name) => {
        const dish = resolveDishForItemName(name);
        if (!dish) return;
        dishQty.set(dish.id, (dishQty.get(dish.id) || 0) + v);
      });
      cache.set(cutoff, dishQty);
      return dishQty;
    };
  }, [orders]);

  const usageSinceForIngredient = (ingredientId: string, cutoff: number): number => {
    const ing = ingredientsById.get(ingredientId);
    if (!ing) return 0;
    const dishQty = dishQtySinceCutoff(cutoff);
    let total = 0;
    DISHES.forEach((d) => {
      const qtySold = dishQty.get(d.id) || 0;
      if (qtySold <= 0) return;
      const line = recipes.get(d.id)?.lines.find((l) => l.ingredientId === ingredientId);
      if (!line) return;
      const perUnit = ing.unit === 'stuk' ? line.quantity : line.quantity / 1000;
      total += perUnit * qtySold;
    });
    return total;
  };

  const purchasedSinceForIngredient = (ingredientId: string, cutoff: number): number =>
    purchaseLog.filter((p) => p.ingredientId === ingredientId && p.createdAt >= cutoff).reduce((s, p) => s + p.qty, 0);

  // null = pas encore de "0-meting" pour cet ingrédient -- on ne fait
  // jamais semblant que le stock est 0.
  const computedStock = (ingredientId: string): number | null => {
    const baseline = baselines.get(ingredientId);
    if (!baseline) return null;
    return baseline.qty + purchasedSinceForIngredient(ingredientId, baseline.setAt) - usageSinceForIngredient(ingredientId, baseline.setAt);
  };

  const recordBaseline = async (ingredientId: string, currentValue: number | null) => {
    const input = window.prompt('Comptage physique actuel :', currentValue !== null ? String(currentValue) : '0');
    if (input === null) return;
    const qty = parseFloat(input.replace(',', '.'));
    if (!isFinite(qty) || qty < 0) return;
    await setDoc(doc(db, 'fcInventoryBaseline', ingredientId), { qty, setAt: Date.now() });
  };

  const recordPurchase = async (ingredientId: string) => {
    const input = window.prompt('Quantité reçue (livraison) :', '');
    if (input === null) return;
    const qty = parseFloat(input.replace(',', '.'));
    if (!isFinite(qty) || qty <= 0) return;
    await addDoc(collection(db, 'fcPurchasesLog'), { ingredientId, qty, createdAt: Date.now() });
  };

  // Ajoute UNIQUEMENT les ingrédients/recettes standards qui n'existent pas
  // encore (comparé par id) -- ne touche jamais à ce qui existe déjà.
  // Nécessaire parce que "Charger les valeurs standards" ci-dessous ne se
  // déclenche que sur une liste vide : sans ce bouton, un nouvel ingrédient
  // standard ajouté plus tard (ex : distinction 25cl/33cl) n'apparaît
  // jamais chez quelqu'un qui a déjà chargé les valeurs standards avant.
  //
  // IMPORTANT : ces trois useMemo doivent rester AVANT le "if (!unlocked)
  // return" ci-dessous -- les hooks React doivent s'exécuter dans le même
  // ordre à chaque rendu. Placés après, ils ne s'exécutent pas tant que
  // l'écran est verrouillé, puis apparaissent d'un coup dès le code PIN
  // entré : React voit un nombre de hooks différent entre les deux rendus
  // et plante (écran blanc jusqu'au rechargement complet de la page, qui
  // repart d'un rendu déjà déverrouillé donc sans changement de nombre de
  // hooks en cours de route). C'est exactement le bug corrigé le 25/09/2026.
  const missingDefaultIngredients = useMemo(
    () => DEFAULT_INGREDIENTS.filter((ing) => !ingredientsById.has(ing.id)),
    [ingredientsById]
  );
  const missingDefaultRecipeIds = useMemo(
    () => Object.keys(DEFAULT_RECIPES).filter((id) => !recipes.has(id)),
    [recipes]
  );
  // Anciens noms génériques ("Canette Coca-Cola") d'avant la distinction
  // 25cl/33cl -- on ne renomme QUE si le nom actuel correspond exactement à
  // l'ancien nom connu, jamais si quelqu'un l'a déjà personnalisé.
  const ingredientsToRename = useMemo(() => {
    // legacyPrice : optionnel -- ne corrige le prix que si le prix actuel
    // correspond exactement à l'ancien prix générique connu, jamais si
    // quelqu'un l'a déjà ajusté manuellement.
    const legacyFixups: Record<string, { name: string; legacyPrice?: number }> = {
      canette_coca: { name: 'Canette Coca-Cola' },
      canette_hawaii: { name: 'Canette Hawaii' },
      canette_poms: { name: 'Canette Poms' },
      canette_coca_zero: { name: 'Canette Coca-Cola Zero', legacyPrice: 6 },
    };
    return Object.entries(legacyFixups)
      .map(([id, { name: legacyName, legacyPrice }]) => {
        const current = ingredientsById.get(id);
        const target = DEFAULT_INGREDIENTS.find((d) => d.id === id);
        if (!current || !target || current.name !== legacyName) return null;
        const nameChanged = current.name !== target.name;
        const priceChanged = legacyPrice !== undefined && current.unitPrice === legacyPrice && current.unitPrice !== target.unitPrice;
        if (!nameChanged && !priceChanged) return null;
        return {
          id,
          newName: target.name,
          newPrice: priceChanged ? target.unitPrice : undefined,
        };
      })
      .filter((x): x is { id: string; newName: string; newPrice: number | undefined } => x !== null);
  }, [ingredientsById]);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  // -------------------------------------------------------------------
  // Ingrédients
  // -------------------------------------------------------------------
  const addIngredient = async () => {
    await addDoc(collection(db, 'fcIngredients'), { name: 'Nouvel ingrédient', unit: 'kg', unitPrice: 0 });
  };
  const updateIngredient = async (id: string, patch: Partial<Omit<Ingredient, 'id'>>) => {
    await setDoc(doc(db, 'fcIngredients', id), patch, { merge: true });
  };
  // Charge en une fois les ingrédients + recettes standards (voir
  // foodcostSeed.ts) -- prix moyens du marché marocain, à corriger ensuite
  // ligne par ligne. Proposé uniquement quand la liste d'ingrédients est
  // encore vide pour ne jamais écraser des prix déjà ajustés.
  const seedStandardDefaults = async () => {
    if (
      !window.confirm(
        "Charger les ingrédients et recettes standards de Dom's Café ? Ce sont des prix et quantités moyens de départ -- vous pourrez ensuite tout corriger ligne par ligne."
      )
    )
      return;
    const batch = writeBatch(db);
    DEFAULT_INGREDIENTS.forEach((ing) => {
      batch.set(doc(db, 'fcIngredients', ing.id), { name: ing.name, unit: ing.unit, unitPrice: ing.unitPrice });
    });
    Object.entries(DEFAULT_RECIPES).forEach(([dishId, lines]) => {
      batch.set(doc(db, 'fcRecipes', dishId), { lines });
    });
    await batch.commit();
  };

  const completeMissingDefaults = async () => {
    if (
      !window.confirm(
        `Ajouter ${missingDefaultIngredients.length} ingrédient(s) et ${missingDefaultRecipeIds.length} recette(s) manquant(e)s, et renommer ${ingredientsToRename.length} ancien(s) nom(s) générique(s) (ex : "Canette Coca-Cola" -> "Coca-Cola 25cl") ? Rien d'autre ne sera modifié.`
      )
    )
      return;
    const batch = writeBatch(db);
    missingDefaultIngredients.forEach((ing) => {
      batch.set(doc(db, 'fcIngredients', ing.id), { name: ing.name, unit: ing.unit, unitPrice: ing.unitPrice });
    });
    missingDefaultRecipeIds.forEach((id) => {
      batch.set(doc(db, 'fcRecipes', id), { lines: DEFAULT_RECIPES[id] });
    });
    ingredientsToRename.forEach(({ id, newName, newPrice }) => {
      const patch: { name: string; unitPrice?: number } = { name: newName };
      if (newPrice !== undefined) patch.unitPrice = newPrice;
      batch.set(doc(db, 'fcIngredients', id), patch, { merge: true });
    });
    await batch.commit();
  };

  const removeIngredient = async (id: string) => {
    if (!window.confirm('Supprimer cet ingrédient ? Il sera aussi retiré des recettes qui l’utilisent.')) return;
    await deleteDoc(doc(db, 'fcIngredients', id));
    for (const recipe of recipes.values()) {
      if (recipe.lines.some((l) => l.ingredientId === id)) {
        await setDoc(doc(db, 'fcRecipes', recipe.dishId), { lines: recipe.lines.filter((l) => l.ingredientId !== id) }, { merge: true });
      }
    }
  };

  // -------------------------------------------------------------------
  // Recettes
  // -------------------------------------------------------------------
  const currentRecipe = recipes.get(selectedDishId);
  const saveRecipeLines = async (lines: RecipeLine[]) => {
    await setDoc(doc(db, 'fcRecipes', selectedDishId), { lines }, { merge: true });
  };
  const addRecipeLine = () => {
    if (ingredients.length === 0) return;
    const lines = [...(currentRecipe?.lines || []), { ingredientId: ingredients[0].id, quantity: 0 }];
    saveRecipeLines(lines);
  };
  const updateRecipeLine = (index: number, patch: Partial<RecipeLine>) => {
    const lines = [...(currentRecipe?.lines || [])];
    lines[index] = { ...lines[index], ...patch };
    saveRecipeLines(lines);
  };
  const removeRecipeLine = (index: number) => {
    const lines = (currentRecipe?.lines || []).filter((_, i) => i !== index);
    saveRecipeLines(lines);
  };
  const defaultRecipeAvailable = !!DEFAULT_RECIPES[selectedDishId];
  const applyDefaultRecipe = async () => {
    const defaults = DEFAULT_RECIPES[selectedDishId];
    if (!defaults) return;
    if ((currentRecipe?.lines.length || 0) > 0 && !window.confirm('Remplacer la recette actuelle de ce plat par la recette standard ?')) return;
    await saveRecipeLines(defaults.map((l) => ({ ...l })));
  };

  // -------------------------------------------------------------------
  // Verkoop / Inkoop (semaine sélectionnée)
  // -------------------------------------------------------------------
  const setSalesForDish = async (dishId: string, qty: number) => {
    await setDoc(doc(db, 'fcSales', selectedWeek), { qty: { [dishId]: qty } }, { merge: true });
  };
  const setSpentForIngredient = async (ingredientId: string, amount: number) => {
    await setDoc(doc(db, 'fcPurchases', selectedWeek), { spent: { [ingredientId]: amount } }, { merge: true });
  };

  // Recalcule les quantités vendues de la semaine sélectionnée à partir des
  // VRAIES commandes (au lieu de les taper à la main) -- reste ensuite
  // librement corrigeable comme n'importe quelle cellule de l'outil.
  const fillSalesFromRealOrders = async () => {
    const start = mondayOfWeek(selectedWeek);
    const weekDates = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      weekDates.add(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
      );
    }
    const qty: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.status === 'cancelled' || !o.createdAt) return;
      if (!weekDates.has(dateStr(o.createdAt.toDate()))) return;
      o.items.forEach((it) => {
        const dish = resolveDishForItemName(it.name);
        if (!dish) return;
        qty[dish.id] = (qty[dish.id] || 0) + it.quantity;
      });
    });
    await setDoc(doc(db, 'fcSales', selectedWeek), { qty });
  };

  // ---------------------------------------------------------------------
  // Inventaire -- "qty" sur fcInventory est un champ historique (avant le
  // système de 0-meting), plus utilisé pour l'affichage ; seul parLevel
  // reste piloté depuis ce doc.
  // ---------------------------------------------------------------------
  const setInventoryParLevel = async (ingredientId: string, parLevel: number) => {
    await setDoc(doc(db, 'fcInventory', ingredientId), { parLevel }, { merge: true });
  };

  const soldDishRows = dishRows.filter((d) => (salesQty[d.id] || 0) > 0 || d.hasRecipe);
  const weekRevenue = dishRows.reduce((s, d) => s + (salesQty[d.id] || 0) * d.price, 0);
  const weekFoodcost = dishRows.reduce((s, d) => s + (salesQty[d.id] || 0) * d.cost, 0);
  const weekAvgPct = foodcostPct(weekFoodcost, weekRevenue);
  const top5Expensive = [...dishRows].filter((d) => d.hasRecipe).sort((a, b) => b.cost - a.cost).slice(0, 5);

  // Théorique = somme, sur tous les plats vendus cette semaine, de la
  // quantité d'ingrédient utilisée par recette × quantité vendue.
  const theoreticalUsageByIngredient = new Map<string, number>();
  DISHES.forEach((d) => {
    const qty = salesQty[d.id] || 0;
    if (qty <= 0) return;
    const recipe = recipes.get(d.id);
    recipe?.lines.forEach((l) => {
      const ing = ingredientsById.get(l.ingredientId);
      theoreticalUsageByIngredient.set(l.ingredientId, (theoreticalUsageByIngredient.get(l.ingredientId) || 0) + lineCost(ing, l.quantity * qty));
    });
  });

  return (
    <div className="min-h-screen bg-brand-dark text-[#F3ECDD]">
      <header className="sticky top-0 z-40 bg-gradient-to-b from-brand-dark to-[#1f160c] border-b border-[#F3ECDD]/10 shadow-lg shadow-black/30 px-5 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="w-7 h-7 text-brand-orange" />
          <div>
            <h1 className="font-display font-black text-xl leading-tight tracking-wide">FOODCOST</h1>
            <p className="text-[#9A9490] text-xs">Dom's Café -- coût des recettes &amp; marges</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TabButton active={tab === 'ingredients'} onClick={() => setTab('ingredients')} icon={Package} label="Ingrédients" />
          <TabButton active={tab === 'recipes'} onClick={() => setTab('recipes')} icon={ClipboardList} label="Recettes" />
          <TabButton active={tab === 'foodcost'} onClick={() => setTab('foodcost')} icon={BarChart3} label="Foodcost" />
          <TabButton active={tab === 'inventory'} onClick={() => setTab('inventory')} icon={Boxes} label="Inventaire" />
          <TabButton active={tab === 'sales'} onClick={() => setTab('sales')} icon={TrendingUp} label="Vente / Achat" />
          <TabButton active={tab === 'week'} onClick={() => setTab('week')} icon={Lock} label="Semaine" />
        </div>
      </header>

      <main className="p-5 max-w-6xl mx-auto">
        {(missingDefaultIngredients.length > 0 || missingDefaultRecipeIds.length > 0 || ingredientsToRename.length > 0) && (
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap text-xs bg-brand-orange/10 border border-brand-orange/40 rounded-lg px-3 py-2.5">
            <span className="flex items-center gap-2 text-[#F3ECDD]">
              <Sparkles className="w-4 h-4 shrink-0 text-brand-orange" />
              {missingDefaultIngredients.length} nouvel(le)s ingrédient(s), {missingDefaultRecipeIds.length} nouvelle(s) recette(s) et{' '}
              {ingredientsToRename.length} nom(s) à corriger (ex : distinction 25cl/33cl).
            </span>
            <button
              onClick={completeMissingDefaults}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-orange text-[#1A1208] hover:bg-brand-orange-hover transition-all"
            >
              Compléter (sans toucher au reste)
            </button>
          </div>
        )}
        <div className="mb-4 flex items-start gap-2 text-xs text-[#9A9490] bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 rounded-lg px-3 py-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-orange" />
          <span>
            Tout ce que vous voyez ici est directement modifiable -- cliquez dans une cellule et changez la valeur. Rien n'est calculé
            "derrière" sans être affiché quelque part sur cette page.
          </span>
        </div>

        {tab === 'ingredients' && (
          <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-display font-black text-lg">Ingrédients</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {ingredients.length === 0 && (
                  <button
                    onClick={seedStandardDefaults}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-[#1A1208] transition-all"
                  >
                    <Sparkles className="w-4 h-4" /> Charger les valeurs standards
                  </button>
                )}
                <button
                  onClick={addIngredient}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold bg-brand-orange text-[#1A1208] hover:bg-brand-orange-hover transition-all"
                >
                  <Plus className="w-4 h-4" /> Ajouter un ingrédient
                </button>
              </div>
            </div>
            {ingredients.length === 0 && (
              <p className="text-[#9A9490] text-xs mb-3">
                Rien encore -- cliquez sur « Charger les valeurs standards » pour démarrer avec les ~100 ingrédients et
                recettes de tout le menu (prix moyens du marché), ou ajoutez vos propres ingrédients un par un.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Nom</Th>
                    <Th>Unité d'achat</Th>
                    <Th>Prix d'achat (MAD)</Th>
                    <Th className="text-right">Livraison (jours)</Th>
                    <Th className="text-right">Utilisé dans</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ing) => {
                    const usedIn = DISHES.filter((d) => (recipes.get(d.id)?.lines || []).some((l) => l.ingredientId === ing.id)).length;
                    return (
                      <tr key={ing.id} className="border-b border-[#F3ECDD]/5">
                        <td className="px-3 py-1.5">
                          <input
                            value={ing.name}
                            onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
                            className="w-full bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={ing.unit}
                            onChange={(e) => updateIngredient(ing.id, { unit: e.target.value as Unit })}
                            className="bg-[#2b241c] border border-[#F3ECDD]/15 rounded-lg px-2 py-1 text-sm"
                          >
                            <option value="kg">kg</option>
                            <option value="liter">litre</option>
                            <option value="stuk">pièce</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={ing.unitPrice}
                            onChange={(e) => updateIngredient(ing.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="w-24 bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                          />
                          <span className="text-[#7A736C] text-xs ml-1">/ {UNIT_LABEL[ing.unit]}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            step="1"
                            min={1}
                            placeholder={String(DEFAULT_DELIVERY_DAYS)}
                            value={ing.deliveryDays ?? ''}
                            onChange={(e) => updateIngredient(ing.id, { deliveryDays: parseInt(e.target.value, 10) || undefined })}
                            title="Nombre de jours entre deux livraisons -- utilisé pour les conseils d'achat du jour"
                            className="w-16 text-right bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#9A9490] text-xs">{usedIn} plat(s)</td>
                        <td className="px-3 py-1.5 text-right">
                          <button onClick={() => removeIngredient(ing.id)} className="text-[#7A736C] hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {ingredients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-[#7A736C] py-8">
                        Aucun ingrédient -- commencez par en ajouter un.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'recipes' && (
          <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-display font-black text-lg">Recettes</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedDishId}
                  onChange={(e) => setSelectedDishId(e.target.value)}
                  className="bg-[#2b241c] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-sm max-w-full"
                >
                  {DISHES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({formatMAD(d.price)})
                    </option>
                  ))}
                </select>
                {defaultRecipeAvailable && (
                  <button
                    onClick={applyDefaultRecipe}
                    title="Remplir avec la recette standard de ce plat"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Recette standard
                  </button>
                )}
              </div>
            </div>
            {ingredients.length === 0 ? (
              <p className="text-[#7A736C] text-sm py-6 text-center">Ajoutez d'abord des ingrédients dans l'onglet « Ingrédients ».</p>
            ) : (
              <>
                <table className="w-full border-collapse mb-3">
                  <thead>
                    <tr className="border-b border-[#F3ECDD]/10">
                      <Th>Ingrédient</Th>
                      <Th>Quantité</Th>
                      <Th className="text-right">Coût de la ligne</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentRecipe?.lines || []).map((line, i) => {
                      const ing = ingredientsById.get(line.ingredientId);
                      return (
                        <tr key={i} className="border-b border-[#F3ECDD]/5">
                          <td className="px-3 py-1.5">
                            <select
                              value={line.ingredientId}
                              onChange={(e) => updateRecipeLine(i, { ingredientId: e.target.value })}
                              className="bg-[#2b241c] border border-[#F3ECDD]/15 rounded-lg px-2 py-1 text-sm"
                            >
                              {ingredients.map((ig) => (
                                <option key={ig.id} value={ig.id}>
                                  {ig.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              step="1"
                              min={0}
                              value={line.quantity}
                              onChange={(e) => updateRecipeLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-24 bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                            />
                            <span className="text-[#7A736C] text-xs ml-1">{ing ? RECIPE_UNIT_LABEL[ing.unit] : ''}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-[#F3ECDD]">{formatCostMAD(lineCost(ing, line.quantity))}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => removeRecipeLine(i)} className="text-[#7A736C] hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {(currentRecipe?.lines || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-[#7A736C] py-6">
                          Pas encore d'ingrédient dans cette recette.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="flex items-center justify-between">
                  <button
                    onClick={addRecipeLine}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Ajouter un ingrédient à la recette
                  </button>
                  <div className="text-right">
                    <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold">Coût total de la recette</p>
                    <p className="font-display font-black text-2xl text-brand-orange">
                      {formatCostMAD(recipeCost(currentRecipe, ingredientsById))}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'foodcost' && (
          <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-lg">Foodcost par plat</h2>
              <div className="flex items-center gap-3 text-xs text-[#9A9490]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#8FBF8A]" /> &lt; 30%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#D9A45C]" /> 30-40%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> &gt; 40%</span>
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#F3ECDD]/10">
                  <Th>Plat</Th>
                  <Th>Catégorie</Th>
                  <Th className="text-right">Prix de vente</Th>
                  <Th className="text-right">Coût (recette)</Th>
                  <Th className="text-right">
                    <button onClick={() => setSortDesc((s) => !s)} className="inline-flex items-center gap-1 hover:text-[#F3ECDD] transition-colors">
                      Foodcost % {sortDesc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                    </button>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sortedDishRows.map((d) => (
                  <tr key={d.id} className={`border-b border-[#F3ECDD]/5 ${foodcostBg(d.pct)}`}>
                    <td className="px-3 py-1.5">{d.name}</td>
                    <td className="px-3 py-1.5 text-[#9A9490] text-xs">{d.category}</td>
                    <td className="px-3 py-1.5 text-right">{formatMAD(d.price)}</td>
                    <td className="px-3 py-1.5 text-right">{d.hasRecipe ? formatCostMAD(d.cost) : <span className="text-[#7A736C]">-- pas de recette --</span>}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${foodcostColor(d.pct)}`}>{d.hasRecipe ? `${d.pct.toFixed(1)}%` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'inventory' && (() => {
          const weekdayLabels = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
          const todayLabel = weekdayLabels[new Date().getDay()];
          const purchaseAdviceRows = ingredients
            .map((ing) => {
              const stock = computedStock(ing.id);
              if (stock === null) return null;
              const buyQty = suggestedBuyQty(ing.id, ing);
              if (!buyQty || buyQty <= 0) return null;
              const usageToday = avgUsageForWeekday(ing.id, new Date().getDay());
              const daysLeft = usageToday > 0 ? stock / usageToday : Infinity;
              return { ing, stock, buyQty, daysLeft };
            })
            .filter((x): x is { ing: Ingredient; stock: number; buyQty: number; daysLeft: number } => x !== null)
            .sort((a, b) => a.daysLeft - b.daysLeft);
          const anyBaseline = baselines.size > 0;

          return (
          <div className="space-y-4">
            <div className="pos-surface border border-brand-orange/40 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-brand-orange shrink-0" />
                <h2 className="font-display font-black text-lg">Conseils d'achat du jour ({todayLabel})</h2>
              </div>
              <p className="text-[#9A9490] text-xs mb-3">
                Basé sur la conso. moyenne réelle des {weekdayLabels[new Date().getDay()]}s des 8 dernières semaines, et
                sur la fréquence de livraison réglée par ingrédient (colonne « Livraison » dans l'onglet Ingrédients,
                {' '}
                {DEFAULT_DELIVERY_DAYS} jours par défaut). Quantité = ce qu'il faut pour tenir jusqu'à la prochaine
                livraison, en respectant aussi le niveau cible.
              </p>
              {!anyBaseline ? (
                <p className="text-[#7A736C] text-sm py-4 text-center">
                  Faites d'abord un « Comptage initial » sur au moins un ingrédient ci-dessous pour activer les conseils
                  d'achat.
                </p>
              ) : purchaseAdviceRows.length === 0 ? (
                <p className="text-[#7A736C] text-sm py-4 text-center">Rien à commander aujourd'hui, les stocks tiennent.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#F3ECDD]/10">
                        <Th>Ingrédient</Th>
                        <Th className="text-right">Stock calculé</Th>
                        <Th className="text-right">Jours restants</Th>
                        <Th className="text-right">À commander aujourd'hui</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseAdviceRows.map(({ ing, stock, buyQty, daysLeft }) => (
                        <tr key={ing.id} className={`border-b border-[#F3ECDD]/5 ${daysLeft < 1 ? 'bg-red-500/10' : ''}`}>
                          <td className="px-3 py-1.5">
                            {ing.name}
                            {daysLeft < 1 && <AlertTriangle className="inline w-3.5 h-3.5 text-red-400 ml-1.5" />}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {stock.toFixed(2)} <span className="text-[#7A736C] text-xs">{UNIT_LABEL[ing.unit]}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right">{isFinite(daysLeft) ? daysLeft.toFixed(1) : '--'}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-brand-orange">
                            {buyQty.toFixed(2)} <span className="text-[#7A736C] text-xs font-normal">{UNIT_LABEL[ing.unit]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 text-xs text-[#9A9490] bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-brand-orange" />
              <span>
                « Stock calculé » n'est plus un champ qu'on tape : cliquez sur « Comptage initial » pour enregistrer un
                comptage physique (point de départ), et sur « + Achat » à chaque livraison reçue. Entre les deux, le
                stock se calcule tout seul : dernier comptage + achats reçus depuis − vraies ventes de la caisse
                depuis (via les recettes). Recomptez de temps en temps : l'écart avec le calcul, c'est votre
                casse/perte/portion réelle.
                « Conso. moy/jour » reste basé sur les {PREDICTION_WINDOW_DAYS} derniers jours, indépendamment du
                comptage.
              </span>
            </div>
            <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
              <h2 className="font-display font-black text-lg mb-3">Inventaire &amp; suggestion d'achat</h2>
              {ingredients.length === 0 ? (
                <p className="text-[#7A736C] text-sm py-6 text-center">Ajoutez d'abord des ingrédients.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#F3ECDD]/10">
                        <Th>Ingrédient</Th>
                        <Th className="text-right">Stock calculé</Th>
                        <Th></Th>
                        <Th className="text-right">Niveau cible</Th>
                        <Th className="text-right">Conso. moy/jour</Th>
                        <Th className="text-right">Jours restants</Th>
                        <Th className="text-right">À commander</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map((ing) => {
                        const inv = inventory.get(ing.id) || { qty: 0, parLevel: 0 };
                        const baseline = baselines.get(ing.id);
                        const stock = computedStock(ing.id);
                        const usage = avgDailyUsage(ing.id);
                        const daysLeft = stock !== null && usage > 0 ? stock / usage : Infinity;
                        const toOrder = stock !== null ? Math.max(0, inv.parLevel - stock) : 0;
                        const low = stock !== null && inv.parLevel > 0 && stock < inv.parLevel;
                        const critical = stock !== null && usage > 0 && daysLeft < 2;
                        return (
                          <tr key={ing.id} className={`border-b border-[#F3ECDD]/5 ${critical ? 'bg-red-500/10' : low ? 'bg-[#D9A45C]/10' : ''}`}>
                            <td className="px-3 py-1.5">
                              {ing.name}
                              {critical && <AlertTriangle className="inline w-3.5 h-3.5 text-red-400 ml-1.5" />}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {stock !== null ? (
                                <>
                                  <span className="font-bold text-[#F3ECDD]">{stock.toFixed(2)}</span>{' '}
                                  <span className="text-[#7A736C] text-xs">{UNIT_LABEL[ing.unit]}</span>
                                  <div className="text-[10px] text-[#7A736C]">
                                    compté le {new Date(baseline!.setAt).toLocaleDateString('fr-FR')}
                                  </div>
                                </>
                              ) : (
                                <span className="text-[#7A736C] text-xs italic">pas encore compté</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => recordBaseline(ing.id, stock)}
                                  title="Enregistrer un comptage physique"
                                  className="px-2 py-1 rounded-md text-[10px] font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all whitespace-nowrap"
                                >
                                  Comptage initial
                                </button>
                                <button
                                  onClick={() => recordPurchase(ing.id)}
                                  title="Enregistrer une livraison reçue"
                                  className="px-2 py-1 rounded-md text-[10px] font-bold border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all whitespace-nowrap"
                                >
                                  + Achat
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={inv.parLevel}
                                onChange={(e) => setInventoryParLevel(ing.id, parseFloat(e.target.value) || 0)}
                                className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                              />
                              <span className="text-[#7A736C] text-xs ml-1">{UNIT_LABEL[ing.unit]}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-[#9A9490]">
                              {usage > 0 ? `${usage.toFixed(2)} ${UNIT_LABEL[ing.unit]}` : '--'}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-bold ${critical ? 'text-red-400' : low ? 'text-[#D9A45C]' : 'text-[#9A9490]'}`}>
                              {stock !== null && usage > 0 ? (isFinite(daysLeft) ? daysLeft.toFixed(1) : '--') : '--'}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-bold ${toOrder > 0 ? 'text-brand-orange' : 'text-[#7A736C]'}`}>
                              {stock !== null && toOrder > 0 ? `${toOrder.toFixed(2)} ${UNIT_LABEL[ing.unit]}` : '--'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {tab === 'sales' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSelectedWeek((w) => shiftWeek(w, -1))}
                className="px-3 py-2 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
              >
                ←
              </button>
              <input
                type="week"
                value={selectedWeek}
                onChange={(e) => e.target.value && setSelectedWeek(e.target.value)}
                className="bg-[#2b241c] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => setSelectedWeek((w) => shiftWeek(w, 1))}
                className="px-3 py-2 rounded-lg border border-[#F3ECDD]/20 text-[#9A9490] hover:text-[#F3ECDD] hover:border-[#F3ECDD]/40 transition-all"
              >
                →
              </button>
              <span className="text-[#9A9490] text-sm">{weekRangeLabel(selectedWeek)}</span>
              <button
                onClick={() => setSelectedWeek(isoWeekId(new Date()))}
                className="text-xs font-bold text-brand-orange hover:underline"
              >
                Cette semaine
              </button>
            </div>

            <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-display font-black text-lg">Ventes de la semaine (quantités vendues)</h2>
                <button
                  onClick={fillSalesFromRealOrders}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-[#1A1208] transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Remplir avec les vraies ventes
                </button>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Plat</Th>
                    <Th className="text-right">Quantité vendue</Th>
                    <Th className="text-right">Chiffre d'affaires</Th>
                    <Th className="text-right">Coût total</Th>
                  </tr>
                </thead>
                <tbody>
                  {soldDishRows.map((d) => {
                    const qty = salesQty[d.id] || 0;
                    return (
                      <tr key={d.id} className="border-b border-[#F3ECDD]/5">
                        <td className="px-3 py-1.5">{d.name}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={qty}
                            onChange={(e) => setSalesForDish(d.id, parseInt(e.target.value, 10) || 0)}
                            className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">{formatMAD(qty * d.price)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCostMAD(qty * d.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
              <h2 className="font-display font-black text-lg mb-1">Achats réels vs. théorique</h2>
              <p className="text-[#9A9490] text-xs mb-3">
                Remplissez ce que vous avez réellement dépensé par ingrédient cette semaine ; le théorique vient des ventes ci-dessus × les recettes.
                Un gros écart peut signaler de la casse, des portions trop généreuses ou du vol.
              </p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Ingrédient</Th>
                    <Th className="text-right">Dépensé réellement</Th>
                    <Th className="text-right">Théorique (ventes × recette)</Th>
                    <Th className="text-right">Écart</Th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ing) => {
                    const spent = purchaseSpent[ing.id] || 0;
                    const theoretical = theoreticalUsageByIngredient.get(ing.id) || 0;
                    const delta = spent - theoretical;
                    return (
                      <tr key={ing.id} className="border-b border-[#F3ECDD]/5">
                        <td className="px-3 py-1.5">{ing.name}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={spent}
                            onChange={(e) => setSpentForIngredient(ing.id, parseFloat(e.target.value) || 0)}
                            className="w-24 text-right bg-transparent border-b border-transparent hover:border-[#F3ECDD]/20 focus:border-brand-orange outline-none py-1"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#9A9490]">{formatCostMAD(theoretical)}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-[#8FBF8A]' : 'text-[#7A736C]'}`}>
                          {delta > 0 ? '+' : ''}
                          {formatCostMAD(delta)}
                        </td>
                      </tr>
                    );
                  })}
                  {ingredients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-[#7A736C] py-6">
                        Aucun ingrédient.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'week' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="week"
                value={selectedWeek}
                onChange={(e) => e.target.value && setSelectedWeek(e.target.value)}
                className="bg-[#2b241c] border border-[#F3ECDD]/15 rounded-lg px-3 py-2 text-sm"
              />
              <span className="text-[#9A9490] text-sm">{weekRangeLabel(selectedWeek)}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Chiffre d'affaires</p>
                <p className="font-display font-black text-2xl text-brand-orange">{formatMAD(weekRevenue)}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Foodcost total</p>
                <p className="font-display font-black text-2xl text-[#F3ECDD]">{formatCostMAD(weekFoodcost)}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Foodcost moyen</p>
                <p className={`font-display font-black text-2xl ${foodcostColor(weekAvgPct)}`}>{weekAvgPct.toFixed(1)}%</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Marge brute</p>
                <p className="font-display font-black text-2xl text-[#8FBF8A]">{formatCostMAD(weekRevenue - weekFoodcost)}</p>
              </div>
            </div>
            <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
              <h2 className="font-display font-black text-lg mb-3">Top 5 des plats les plus chers à produire</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Plat</Th>
                    <Th className="text-right">Coût (recette)</Th>
                    <Th className="text-right">Prix de vente</Th>
                    <Th className="text-right">Foodcost %</Th>
                  </tr>
                </thead>
                <tbody>
                  {top5Expensive.map((d) => (
                    <tr key={d.id} className="border-b border-[#F3ECDD]/5">
                      <td className="px-3 py-1.5">{d.name}</td>
                      <td className="px-3 py-1.5 text-right">{formatCostMAD(d.cost)}</td>
                      <td className="px-3 py-1.5 text-right">{formatMAD(d.price)}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${foodcostColor(d.pct)}`}>{d.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {top5Expensive.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-[#7A736C] py-6">
                        Aucune recette définie pour l'instant.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
