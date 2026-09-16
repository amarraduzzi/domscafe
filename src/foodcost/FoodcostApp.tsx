import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
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
} from 'lucide-react';
import { db } from '../firebase';
import { menuItems as staticMenuItems, type MenuItem } from '../data';
import { formatMAD } from '../shared/posData';

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
}

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
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ---------------------------------------------------------------------------

const DISHES: { id: string; name: string; category: string; price: number }[] = staticMenuItems.map((m: MenuItem) => ({
  id: m.id,
  name: m.name.fr,
  category: m.category,
  price: m.price,
}));

type Tab = 'ingredients' | 'recipes' | 'foodcost' | 'sales' | 'week';

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

  // -------------------------------------------------------------------
  // Verkoop / Inkoop (semaine sélectionnée)
  // -------------------------------------------------------------------
  const setSalesForDish = async (dishId: string, qty: number) => {
    await setDoc(doc(db, 'fcSales', selectedWeek), { qty: { [dishId]: qty } }, { merge: true });
  };
  const setSpentForIngredient = async (ingredientId: string, amount: number) => {
    await setDoc(doc(db, 'fcPurchases', selectedWeek), { spent: { [ingredientId]: amount } }, { merge: true });
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
          <TabButton active={tab === 'sales'} onClick={() => setTab('sales')} icon={TrendingUp} label="Vente / Achat" />
          <TabButton active={tab === 'week'} onClick={() => setTab('week')} icon={Lock} label="Semaine" />
        </div>
      </header>

      <main className="p-5 max-w-6xl mx-auto">
        <div className="mb-4 flex items-start gap-2 text-xs text-[#9A9490] bg-[#F3ECDD]/5 border border-[#F3ECDD]/10 rounded-lg px-3 py-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-orange" />
          <span>
            Tout ce que vous voyez ici est directement modifiable -- cliquez dans une cellule et changez la valeur. Rien n'est calculé
            "derrière" sans être affiché quelque part sur cette page.
          </span>
        </div>

        {tab === 'ingredients' && (
          <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-lg">Ingrédients</h2>
              <button
                onClick={addIngredient}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold bg-brand-orange text-[#1A1208] hover:bg-brand-orange-hover transition-all"
              >
                <Plus className="w-4 h-4" /> Ajouter un ingrédient
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Nom</Th>
                    <Th>Unité d'achat</Th>
                    <Th>Prix d'achat (MAD)</Th>
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
                      <td colSpan={5} className="text-center text-[#7A736C] py-8">
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
                          <td className="px-3 py-1.5 text-right font-bold text-[#F3ECDD]">{formatMAD(lineCost(ing, line.quantity))}</td>
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
                      {formatMAD(recipeCost(currentRecipe, ingredientsById))}
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
                    <td className="px-3 py-1.5 text-right">{d.hasRecipe ? formatMAD(d.cost) : <span className="text-[#7A736C]">-- pas de recette --</span>}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${foodcostColor(d.pct)}`}>{d.hasRecipe ? `${d.pct.toFixed(1)}%` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
              <h2 className="font-display font-black text-lg mb-3">Ventes de la semaine (quantités vendues)</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#F3ECDD]/10">
                    <Th>Plat</Th>
                    <Th className="text-right">Aantal verkocht</Th>
                    <Th className="text-right">Omzet</Th>
                    <Th className="text-right">Kostprijs totaal</Th>
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
                        <td className="px-3 py-1.5 text-right">{formatMAD(qty * d.cost)}</td>
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
                        <td className="px-3 py-1.5 text-right text-[#9A9490]">{formatMAD(theoretical)}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-[#8FBF8A]' : 'text-[#7A736C]'}`}>
                          {delta > 0 ? '+' : ''}
                          {formatMAD(delta)}
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
                <p className="font-display font-black text-2xl text-[#F3ECDD]">{formatMAD(weekFoodcost)}</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Foodcost moyen</p>
                <p className={`font-display font-black text-2xl ${foodcostColor(weekAvgPct)}`}>{weekAvgPct.toFixed(1)}%</p>
              </div>
              <div className="pos-surface border border-[#F3ECDD]/10 rounded-2xl p-4">
                <p className="text-[#9A9490] text-xs uppercase tracking-wider font-bold mb-1">Marge brute</p>
                <p className="font-display font-black text-2xl text-[#8FBF8A]">{formatMAD(weekRevenue - weekFoodcost)}</p>
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
                      <td className="px-3 py-1.5 text-right">{formatMAD(d.cost)}</td>
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
