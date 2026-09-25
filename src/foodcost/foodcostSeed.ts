// Valeurs standards pour démarrer le foodcost de Dom's Café -- ingrédients
// (prix moyens marché marocain, à ajuster avec vos vrais tarifs fournisseur)
// et recettes de base pour (presque) tout le menu (src/data.ts), construites
// à partir de la composition réelle de chaque plat/boisson. Le snooker et le
// billard n'ont pas de recette (ce ne sont pas des plats).
//
// Chargé une seule fois via le bouton "Charger les valeurs standards" dans
// l'onglet Ingrédients (uniquement proposé quand la liste est vide, pour ne
// jamais écraser des prix déjà corrigés). Tout reste ensuite librement
// modifiable ligne par ligne, comme le reste de l'outil.
//
// Unité de quantité dans les recettes : grammes pour un ingrédient acheté au
// kg, millilitres pour un ingrédient acheté au litre, pièce(s) pour "stuk" --
// identique à RECIPE_UNIT_LABEL dans FoodcostApp.tsx.

export type SeedUnit = 'kg' | 'liter' | 'stuk';

export interface SeedIngredient {
  id: string;
  name: string;
  unit: SeedUnit;
  unitPrice: number;
}

export interface SeedRecipeLine {
  ingredientId: string;
  quantity: number;
}

export const DEFAULT_INGREDIENTS: SeedIngredient[] = [
  // Boissons chaudes -- base
  { id: 'cafe_grains', name: 'Café en grains', unit: 'kg', unitPrice: 135 },
  { id: 'the_vert', name: 'Thé vert (menthe)', unit: 'kg', unitPrice: 90 },
  { id: 'the_noir', name: 'Thé noir', unit: 'kg', unitPrice: 70 },
  { id: 'the_aromatise', name: 'Thé aromatisé', unit: 'kg', unitPrice: 110 },
  { id: 'the_verveine', name: 'Verveine', unit: 'kg', unitPrice: 130 },
  { id: 'chocolat_poudre', name: 'Chocolat en poudre', unit: 'kg', unitPrice: 50 },
  { id: 'sucre', name: 'Sucre', unit: 'kg', unitPrice: 8 },
  // Eau / sodas / boissons en canette (produits revendus tels quels)
  { id: 'eau_bouteille_50cl', name: "Bouteille d'eau 50cl", unit: 'stuk', unitPrice: 2.5 },
  { id: 'eau_bouteille_33cl', name: 'Ciel - Eau 33cl', unit: 'stuk', unitPrice: 1.7 },
  { id: 'oulmes_bouteille', name: 'Bouteille Oulmès', unit: 'stuk', unitPrice: 6 },
  { id: 'canette_coca', name: 'Coca-Cola 25cl', unit: 'stuk', unitPrice: 4.48 },
  { id: 'canette_coca_33cl', name: 'Coca-Cola 33cl', unit: 'stuk', unitPrice: 7.55 }, // pas encore lié à un plat -- le menu n'a qu'un seul "Coca Cola" (utilise la 25cl)
  { id: 'canette_coca_zero', name: 'Coca-Cola Zero 33cl', unit: 'stuk', unitPrice: 7.55 },
  { id: 'canette_sprite', name: 'Canette Sprite', unit: 'stuk', unitPrice: 6 },
  { id: 'canette_poms', name: 'Poms 25cl', unit: 'stuk', unitPrice: 4.48 },
  { id: 'canette_schweppes_citron', name: 'Canette Schweppes Citron', unit: 'stuk', unitPrice: 6.5 },
  { id: 'canette_schweppes_mojito', name: 'Canette Schweppes Mojito', unit: 'stuk', unitPrice: 6.5 },
  { id: 'canette_schweppes_tonic', name: 'Canette Schweppes Tonic', unit: 'stuk', unitPrice: 6.5 },
  { id: 'canette_hawaii', name: 'Hawaii 25cl', unit: 'stuk', unitPrice: 4.48 },
  { id: 'canette_redbull', name: 'Canette Red Bull', unit: 'stuk', unitPrice: 14 },
  { id: 'glace_pilee', name: 'Glace pilée', unit: 'kg', unitPrice: 3 },
  // Base / boulangerie
  { id: 'oeuf', name: 'Œuf', unit: 'stuk', unitPrice: 1.8 },
  { id: 'pain_mie', name: 'Pain de mie (tranche)', unit: 'stuk', unitPrice: 1.2 },
  { id: 'pain_ciabatta', name: 'Pain ciabatta', unit: 'stuk', unitPrice: 2.2 },
  { id: 'baguette_semoule', name: 'Baguette semoule (Chorouk Agdal)', unit: 'stuk', unitPrice: 3 },
  { id: 'pate_pizza', name: 'Pâte à pizza (boule)', unit: 'stuk', unitPrice: 5 },
  { id: 'crepe_base', name: 'Crêpe nature (base)', unit: 'stuk', unitPrice: 3 },
  { id: 'tortilla', name: 'Tortilla tacos', unit: 'stuk', unitPrice: 3.5 },
  { id: 'croissant_premade', name: 'Croissant simple (Chorouk Agdal)', unit: 'stuk', unitPrice: 5 },
  { id: 'pain_choc_premade', name: 'Pain au chocolat (Chorouk Agdal)', unit: 'stuk', unitPrice: 6.5 },
  { id: 'pain_raisins_premade', name: 'Pain aux raisins (Chorouk Agdal)', unit: 'stuk', unitPrice: 6 },
  { id: 'pain_suisse_premade', name: 'Pain suisse (préfabriqué)', unit: 'stuk', unitPrice: 5.5 },
  { id: 'tarte_du_jour_achetee', name: 'Tarte du jour (achetée)', unit: 'stuk', unitPrice: 10 },
  { id: 'patisserie_du_jour_achetee', name: 'Pâtisserie du jour (achetée)', unit: 'stuk', unitPrice: 12 },
  { id: 'balboula_base', name: 'Balboula (soupe orge)', unit: 'kg', unitPrice: 8 },
  // Fromages / laitier
  { id: 'mozzarella', name: 'Mozzarella', unit: 'kg', unitPrice: 65 },
  { id: 'edam', name: 'Edam', unit: 'kg', unitPrice: 70 },
  { id: 'cheddar', name: 'Cheddar', unit: 'kg', unitPrice: 85 },
  { id: 'roquefort', name: 'Roquefort', unit: 'kg', unitPrice: 110 }, // TODO prix reel a confirmer (pas donne)
  { id: 'brie', name: 'Brie', unit: 'kg', unitPrice: 120 },
  { id: 'jbane', name: 'Jbane (fromage frais)', unit: 'kg', unitPrice: 60 },
  { id: 'creme_fraiche', name: 'Crème fraîche', unit: 'kg', unitPrice: 45 },
  { id: 'lait', name: 'Lait', unit: 'liter', unitPrice: 9 },
  { id: 'beurre', name: 'Beurre', unit: 'kg', unitPrice: 70 },
  { id: 'lait_coco', name: 'Lait de coco', unit: 'liter', unitPrice: 25 },
  // Confitures / sucré
  { id: 'confiture', name: 'Confiture', unit: 'kg', unitPrice: 25 },
  { id: 'miel', name: 'Miel', unit: 'kg', unitPrice: 60 },
  { id: 'nutella', name: 'Nutella', unit: 'kg', unitPrice: 55 },
  { id: 'caramel', name: 'Caramel', unit: 'kg', unitPrice: 30 },
  { id: 'vanille', name: 'Vanille', unit: 'kg', unitPrice: 80 },
  // Viandes / charcuterie / poisson
  { id: 'jambon_dinde', name: 'Jambon de dinde', unit: 'kg', unitPrice: 90 },
  { id: 'jambon_boeuf', name: 'Jambon de bœuf', unit: 'kg', unitPrice: 110 },
  { id: 'mortadelle', name: 'Mortadelle', unit: 'kg', unitPrice: 55 },
  { id: 'charcuterie_mix', name: 'Charcuterie (mix)', unit: 'kg', unitPrice: 80 },
  { id: 'khlii', name: 'Khlii', unit: 'kg', unitPrice: 180 },
  { id: 'poulet', name: 'Poulet (cuit, dés)', unit: 'kg', unitPrice: 70 },
  { id: 'viande_hachee', name: 'Viande hachée', unit: 'kg', unitPrice: 95 },
  { id: 'pepperoni', name: 'Pepperoni', unit: 'kg', unitPrice: 120 },
  { id: 'thon', name: 'Thon (égoutté)', unit: 'kg', unitPrice: 55 },
  { id: 'crevettes', name: 'Crevettes', unit: 'kg', unitPrice: 140 },
  { id: 'calamars', name: 'Calamars', unit: 'kg', unitPrice: 110 },
  { id: 'surimi', name: 'Surimi', unit: 'kg', unitPrice: 65 },
  { id: 'nuggets', name: 'Nuggets', unit: 'kg', unitPrice: 70 },
  { id: 'cordon_bleu', name: 'Cordon bleu (pièce)', unit: 'stuk', unitPrice: 8 },
  // Légumes / fruits
  { id: 'tomate', name: 'Tomate', unit: 'kg', unitPrice: 10 },
  { id: 'oignon', name: 'Oignon', unit: 'kg', unitPrice: 5 },
  { id: 'laitue', name: 'Laitue', unit: 'kg', unitPrice: 20 }, // 8DH/tete (~400g/tete) converti en kg
  { id: 'cornichons', name: 'Cornichons', unit: 'kg', unitPrice: 35 },
  { id: 'olives_noires', name: 'Olives noires', unit: 'kg', unitPrice: 50 },
  { id: 'poivrons', name: 'Poivrons', unit: 'kg', unitPrice: 10 },
  { id: 'champignons', name: 'Champignons', unit: 'kg', unitPrice: 80 },
  { id: 'pommes_de_terre', name: 'Pommes de terre', unit: 'kg', unitPrice: 8 },
  { id: 'betteraves', name: 'Betteraves', unit: 'kg', unitPrice: 10 },
  { id: 'carottes', name: 'Carottes', unit: 'kg', unitPrice: 10 },
  { id: 'concombre', name: 'Concombre', unit: 'kg', unitPrice: 10 },
  { id: 'avocat', name: 'Avocat', unit: 'kg', unitPrice: 35 },
  { id: 'ananas', name: 'Ananas', unit: 'kg', unitPrice: 15 },
  { id: 'mais', name: 'Maïs', unit: 'kg', unitPrice: 15 },
  { id: 'legumes_saison', name: 'Légumes de saison (mix)', unit: 'kg', unitPrice: 10 },
  { id: 'courgette', name: 'Courgette', unit: 'kg', unitPrice: 20 },
  { id: 'aubergine', name: 'Aubergine', unit: 'kg', unitPrice: 20 },
  { id: 'haricot', name: 'Haricot vert', unit: 'kg', unitPrice: 21 },
  { id: 'persil', name: 'Persil', unit: 'kg', unitPrice: 330 }, // 10DH/botte (~30g/botte) converti en kg
  { id: 'basilic', name: 'Basilic', unit: 'kg', unitPrice: 400 }, // 10DH/botte (~25g/botte) converti en kg -- reste ~1,2DH pour 3g sur une pizza
  { id: 'citron', name: 'Citron', unit: 'kg', unitPrice: 8 },
  { id: 'gingembre', name: 'Gingembre', unit: 'kg', unitPrice: 25 },
  { id: 'menthe', name: 'Menthe fraîche', unit: 'kg', unitPrice: 15 },
  { id: 'fruits_saison', name: 'Fruits de saison (mix)', unit: 'kg', unitPrice: 15 },
  { id: 'banane', name: 'Banane', unit: 'kg', unitPrice: 9 },
  { id: 'fraise', name: 'Fraise', unit: 'kg', unitPrice: 25 },
  { id: 'mangue', name: 'Mangue', unit: 'kg', unitPrice: 20 },
  { id: 'kiwi', name: 'Kiwi', unit: 'kg', unitPrice: 30 },
  { id: 'orange', name: 'Orange', unit: 'kg', unitPrice: 6 },
  { id: 'pomme', name: 'Pomme', unit: 'kg', unitPrice: 9 },
  { id: 'dattes', name: 'Dattes', unit: 'kg', unitPrice: 40 },
  { id: 'amandes', name: 'Amandes', unit: 'kg', unitPrice: 90 },
  { id: 'noix', name: 'Noix', unit: 'kg', unitPrice: 90 },
  { id: 'riz', name: 'Riz', unit: 'kg', unitPrice: 9 },
  // Sauces / huiles
  { id: 'sauce_tomate', name: 'Sauce tomate (pizza)', unit: 'kg', unitPrice: 12 },
  { id: 'sauce_bechamel', name: 'Sauce béchamel', unit: 'kg', unitPrice: 15 },
  { id: 'sauce_cocktail', name: 'Sauce cocktail', unit: 'kg', unitPrice: 20 },
  { id: 'sauce_vinaigrette', name: 'Vinaigrette', unit: 'liter', unitPrice: 15 },
  { id: 'sauce_blanche', name: 'Sauce blanche', unit: 'kg', unitPrice: 18 },
  { id: 'huile_olive', name: "Huile d'olive", unit: 'liter', unitPrice: 55 },
  { id: 'frites', name: 'Frites (surgelées)', unit: 'kg', unitPrice: 14 },
];

// dishId (voir src/data.ts) -> lignes de recette. Les tailles/variantes
// (ex : sauce au choix, verveine à l'eau/au lait) partagent la recette de
// base -- pas de distinction ici, comme le reste de l'outil foodcost qui
// travaille au niveau du plat, pas de la variante.
export const DEFAULT_RECIPES: Record<string, SeedRecipeLine[]> = {
  // --- Petits-déjeuners --------------------------------------------------
  'b-express': [
    { ingredientId: 'cafe_grains', quantity: 8 },
    { ingredientId: 'lait', quantity: 30 },
    { ingredientId: 'orange', quantity: 350 },
    { ingredientId: 'oeuf', quantity: 2 },
    { ingredientId: 'eau_bouteille_50cl', quantity: 1 },
  ],
  'b-continental': [
    { ingredientId: 'cafe_grains', quantity: 8 },
    { ingredientId: 'lait', quantity: 30 },
    { ingredientId: 'orange', quantity: 350 },
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'croissant_premade', quantity: 1 },
    { ingredientId: 'confiture', quantity: 20 },
    { ingredientId: 'beurre', quantity: 15 },
    { ingredientId: 'miel', quantity: 15 },
    { ingredientId: 'eau_bouteille_50cl', quantity: 1 },
  ],
  'b-doms': [
    { ingredientId: 'cafe_grains', quantity: 8 },
    { ingredientId: 'lait', quantity: 30 },
    { ingredientId: 'orange', quantity: 350 },
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'oeuf', quantity: 2 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'charcuterie_mix', quantity: 40 },
    { ingredientId: 'eau_bouteille_50cl', quantity: 1 },
  ],
  'b-jebli': [
    { ingredientId: 'cafe_grains', quantity: 8 },
    { ingredientId: 'lait', quantity: 30 },
    { ingredientId: 'orange', quantity: 350 },
    { ingredientId: 'balboula_base', quantity: 250 },
    { ingredientId: 'khlii', quantity: 60 },
    { ingredientId: 'oeuf', quantity: 2 },
    { ingredientId: 'eau_bouteille_50cl', quantity: 1 },
  ],
  'b-chamalli': [
    { ingredientId: 'cafe_grains', quantity: 8 },
    { ingredientId: 'lait', quantity: 30 },
    { ingredientId: 'orange', quantity: 350 },
    { ingredientId: 'oeuf', quantity: 2 },
    { ingredientId: 'mortadelle', quantity: 30 },
    { ingredientId: 'jbane', quantity: 40 },
    { ingredientId: 'olives_noires', quantity: 20 },
    { ingredientId: 'huile_olive', quantity: 10 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'charcuterie_mix', quantity: 30 },
    { ingredientId: 'eau_bouteille_50cl', quantity: 1 },
  ],
  // --- Omelettes -----------------------------------------------------------
  'o-nature': [{ ingredientId: 'oeuf', quantity: 3 }],
  'o-fromage': [
    { ingredientId: 'oeuf', quantity: 3 },
    { ingredientId: 'edam', quantity: 30 },
  ],
  'o-champignons': [
    { ingredientId: 'oeuf', quantity: 3 },
    { ingredientId: 'champignons', quantity: 50 },
  ],
  'o-charcuterie': [
    { ingredientId: 'oeuf', quantity: 3 },
    { ingredientId: 'charcuterie_mix', quantity: 40 },
  ],
  'o-charc-fromage': [
    { ingredientId: 'oeuf', quantity: 3 },
    { ingredientId: 'charcuterie_mix', quantity: 30 },
    { ingredientId: 'edam', quantity: 25 },
  ],
  'o-khlii': [
    { ingredientId: 'oeuf', quantity: 3 },
    { ingredientId: 'khlii', quantity: 50 },
  ],
  // --- Toasts --------------------------------------------------------------
  't-fromage': [
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'edam', quantity: 40 },
  ],
  't-croque': [
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'jambon_dinde', quantity: 30 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'sauce_bechamel', quantity: 20 },
  ],
  't-charc-fromage': [
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'charcuterie_mix', quantity: 35 },
    { ingredientId: 'edam', quantity: 30 },
  ],
  't-oeuf-charc-fromage': [
    { ingredientId: 'pain_mie', quantity: 2 },
    { ingredientId: 'oeuf', quantity: 1 },
    { ingredientId: 'charcuterie_mix', quantity: 30 },
    { ingredientId: 'edam', quantity: 30 },
  ],
  // --- Viennoiserie (achetée préfabriquée) ---------------------------------
  'v-chocolat': [{ ingredientId: 'pain_choc_premade', quantity: 1 }],
  'v-raisins': [{ ingredientId: 'pain_raisins_premade', quantity: 1 }],
  'v-croissant': [{ ingredientId: 'croissant_premade', quantity: 1 }],
  'v-suisse': [{ ingredientId: 'pain_suisse_premade', quantity: 1 }],
  // --- Crêpes sucrées --------------------------------------------------------
  'cs-miel': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'miel', quantity: 25 },
  ],
  'cs-confiture': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'confiture', quantity: 30 },
  ],
  'cs-nutella': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'nutella', quantity: 30 },
  ],
  'cs-banane-nutella': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'nutella', quantity: 25 },
    { ingredientId: 'banane', quantity: 60 },
  ],
  'cs-nutella-noix': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'nutella', quantity: 25 },
    { ingredientId: 'noix', quantity: 15 },
  ],
  // --- Crêpes salées ---------------------------------------------------------
  'cl-3fromages': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'roquefort', quantity: 20 },
    { ingredientId: 'mozzarella', quantity: 20 },
    { ingredientId: 'brie', quantity: 20 },
    { ingredientId: 'sauce_bechamel', quantity: 20 },
  ],
  'cl-charcuterie': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'sauce_bechamel', quantity: 20 },
    { ingredientId: 'charcuterie_mix', quantity: 35 },
  ],
  'cl-poulet': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'champignons', quantity: 30 },
    { ingredientId: 'edam', quantity: 25 },
    { ingredientId: 'sauce_bechamel', quantity: 20 },
    { ingredientId: 'poulet', quantity: 50 },
  ],
  'cl-viande': [
    { ingredientId: 'crepe_base', quantity: 1 },
    { ingredientId: 'champignons', quantity: 30 },
    { ingredientId: 'edam', quantity: 25 },
    { ingredientId: 'sauce_blanche', quantity: 20 },
    { ingredientId: 'viande_hachee', quantity: 60 },
  ],
  // --- Pizzas ----------------------------------------------------------------
  'p-margarita': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 60 },
    { ingredientId: 'mozzarella', quantity: 120 },
    { ingredientId: 'olives_noires', quantity: 20 },
    { ingredientId: 'basilic', quantity: 3 },
  ],
  'p-vegetarienne': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 60 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'legumes_saison', quantity: 100 },
  ],
  'p-thons': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'thon', quantity: 70 },
    { ingredientId: 'poivrons', quantity: 50 },
    { ingredientId: 'olives_noires', quantity: 20 },
  ],
  'p-pollo': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'poulet', quantity: 80 },
    { ingredientId: 'poivrons', quantity: 40 },
    { ingredientId: 'champignons', quantity: 40 },
  ],
  'p-americaine': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'pepperoni', quantity: 70 },
    { ingredientId: 'olives_noires', quantity: 20 },
  ],
  'p-vivanda': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'viande_hachee', quantity: 80 },
    { ingredientId: 'champignons', quantity: 40 },
    { ingredientId: 'poivrons', quantity: 40 },
    { ingredientId: 'olives_noires', quantity: 15 },
  ],
  'p-quatre-fromages': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 40 },
    { ingredientId: 'edam', quantity: 40 },
    { ingredientId: 'roquefort', quantity: 30 },
    { ingredientId: 'brie', quantity: 30 },
    { ingredientId: 'mozzarella', quantity: 60 },
    { ingredientId: 'creme_fraiche', quantity: 30 },
  ],
  'p-quatre-saisons': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 130 },
    { ingredientId: 'poulet', quantity: 40 },
    { ingredientId: 'champignons', quantity: 30 },
    { ingredientId: 'poivrons', quantity: 30 },
    { ingredientId: 'olives_noires', quantity: 20 },
    { ingredientId: 'viande_hachee', quantity: 30 },
  ],
  'p-fisherman': [
    { ingredientId: 'pate_pizza', quantity: 1 },
    { ingredientId: 'sauce_tomate', quantity: 55 },
    { ingredientId: 'mozzarella', quantity: 110 },
    { ingredientId: 'crevettes', quantity: 60 },
    { ingredientId: 'calamars', quantity: 50 },
    { ingredientId: 'surimi', quantity: 50 },
    { ingredientId: 'olives_noires', quantity: 20 },
  ],
  // --- Sandwiches --------------------------------------------------------------
  's-thon': [
    { ingredientId: 'pain_ciabatta', quantity: 1 },
    { ingredientId: 'thon', quantity: 70 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'tomate', quantity: 40 },
    { ingredientId: 'laitue', quantity: 20 },
    { ingredientId: 'cornichons', quantity: 20 },
    { ingredientId: 'oignon', quantity: 20 },
    { ingredientId: 'sauce_cocktail', quantity: 25 },
  ],
  's-doms': [
    { ingredientId: 'pain_ciabatta', quantity: 1 },
    { ingredientId: 'thon', quantity: 40 },
    { ingredientId: 'jambon_boeuf', quantity: 40 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'tomate', quantity: 40 },
    { ingredientId: 'laitue', quantity: 20 },
    { ingredientId: 'cornichons', quantity: 20 },
  ],
  's-poulet': [
    { ingredientId: 'pain_ciabatta', quantity: 1 },
    { ingredientId: 'poulet', quantity: 90 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'tomate', quantity: 40 },
    { ingredientId: 'laitue', quantity: 20 },
    { ingredientId: 'cornichons', quantity: 20 },
    { ingredientId: 'poivrons', quantity: 30 },
  ],
  's-kefta': [
    { ingredientId: 'pain_ciabatta', quantity: 1 },
    { ingredientId: 'viande_hachee', quantity: 100 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'tomate', quantity: 40 },
    { ingredientId: 'laitue', quantity: 20 },
    { ingredientId: 'cornichons', quantity: 20 },
    { ingredientId: 'oignon', quantity: 20 },
  ],
  // --- Tacos ---------------------------------------------------------------
  'tc-poulet': [
    { ingredientId: 'tortilla', quantity: 1 },
    { ingredientId: 'poulet', quantity: 100 },
    { ingredientId: 'cheddar', quantity: 40 },
    { ingredientId: 'frites', quantity: 80 },
    { ingredientId: 'sauce_bechamel', quantity: 30 },
  ],
  'tc-viande': [
    { ingredientId: 'tortilla', quantity: 1 },
    { ingredientId: 'viande_hachee', quantity: 100 },
    { ingredientId: 'cheddar', quantity: 40 },
    { ingredientId: 'frites', quantity: 80 },
    { ingredientId: 'sauce_bechamel', quantity: 30 },
  ],
  'tc-nuggets': [
    { ingredientId: 'tortilla', quantity: 1 },
    { ingredientId: 'nuggets', quantity: 100 },
    { ingredientId: 'cheddar', quantity: 40 },
    { ingredientId: 'frites', quantity: 80 },
    { ingredientId: 'sauce_bechamel', quantity: 30 },
  ],
  'tc-cordon': [
    { ingredientId: 'tortilla', quantity: 1 },
    { ingredientId: 'cordon_bleu', quantity: 1 },
    { ingredientId: 'cheddar', quantity: 30 },
    { ingredientId: 'frites', quantity: 80 },
    { ingredientId: 'sauce_bechamel', quantity: 30 },
  ],
  // --- Accompagnements -------------------------------------------------------
  'a-frites': [{ ingredientId: 'frites', quantity: 200 }],
  // --- Salades -------------------------------------------------------------
  'sl-marocaine': [
    { ingredientId: 'laitue', quantity: 80 },
    { ingredientId: 'tomate', quantity: 100 },
    { ingredientId: 'oignon', quantity: 30 },
    { ingredientId: 'thon', quantity: 60 },
    { ingredientId: 'olives_noires', quantity: 20 },
    { ingredientId: 'sauce_vinaigrette', quantity: 20 },
  ],
  'sl-nicoise': [
    { ingredientId: 'thon', quantity: 60 },
    { ingredientId: 'pommes_de_terre', quantity: 100 },
    { ingredientId: 'betteraves', quantity: 50 },
    { ingredientId: 'carottes', quantity: 50 },
    { ingredientId: 'concombre', quantity: 60 },
    { ingredientId: 'tomate', quantity: 60 },
    { ingredientId: 'laitue', quantity: 60 },
    { ingredientId: 'olives_noires', quantity: 20 },
    { ingredientId: 'oeuf', quantity: 1 },
    { ingredientId: 'sauce_blanche', quantity: 20 },
  ],
  'sl-doms': [
    { ingredientId: 'riz', quantity: 80 },
    { ingredientId: 'poulet', quantity: 60 },
    { ingredientId: 'thon', quantity: 40 },
    { ingredientId: 'tomate', quantity: 50 },
    { ingredientId: 'mais', quantity: 40 },
    { ingredientId: 'laitue', quantity: 50 },
    { ingredientId: 'edam', quantity: 30 },
    { ingredientId: 'sauce_cocktail', quantity: 20 },
  ],
  'sl-rio': [
    { ingredientId: 'charcuterie_mix', quantity: 60 },
    { ingredientId: 'crevettes', quantity: 50 },
    { ingredientId: 'surimi', quantity: 50 },
    { ingredientId: 'brie', quantity: 30 },
    { ingredientId: 'avocat', quantity: 60 },
    { ingredientId: 'ananas', quantity: 50 },
    { ingredientId: 'tomate', quantity: 50 },
    { ingredientId: 'mais', quantity: 30 },
    { ingredientId: 'laitue', quantity: 50 },
    { ingredientId: 'sauce_cocktail', quantity: 25 },
  ],
  'sl-fisherman': [
    { ingredientId: 'crevettes', quantity: 60 },
    { ingredientId: 'calamars', quantity: 50 },
    { ingredientId: 'surimi', quantity: 50 },
    { ingredientId: 'avocat', quantity: 60 },
    { ingredientId: 'tomate', quantity: 50 },
    { ingredientId: 'laitue', quantity: 50 },
    { ingredientId: 'cornichons', quantity: 20 },
    { ingredientId: 'olives_noires', quantity: 15 },
    { ingredientId: 'sauce_cocktail', quantity: 25 },
  ],
  // --- Boissons chaudes ------------------------------------------------------
  'bc-cafe-noir': [{ ingredientId: 'cafe_grains', quantity: 8 }],
  'bc-cafe-americain': [{ ingredientId: 'cafe_grains', quantity: 7 }],
  'bc-cafe-lait': [
    { ingredientId: 'cafe_grains', quantity: 7 },
    { ingredientId: 'lait', quantity: 100 },
  ],
  'bc-chocolat': [
    { ingredientId: 'lait', quantity: 180 },
    { ingredientId: 'chocolat_poudre', quantity: 20 },
  ],
  'bc-double-expresso': [{ ingredientId: 'cafe_grains', quantity: 14 }],
  'bc-cappuccino': [
    { ingredientId: 'cafe_grains', quantity: 7 },
    { ingredientId: 'lait', quantity: 100 },
  ],
  'bc-frappuccino': [
    { ingredientId: 'cafe_grains', quantity: 10 },
    { ingredientId: 'lait', quantity: 100 },
    { ingredientId: 'glace_pilee', quantity: 100 },
  ],
  'bc-mocaccino': [
    { ingredientId: 'cafe_grains', quantity: 7 },
    { ingredientId: 'lait', quantity: 100 },
    { ingredientId: 'chocolat_poudre', quantity: 15 },
  ],
  'bc-the-menthe': [
    { ingredientId: 'the_vert', quantity: 5 },
    { ingredientId: 'menthe', quantity: 15 },
    { ingredientId: 'sucre', quantity: 15 },
  ],
  'bc-verveine': [{ ingredientId: 'the_verveine', quantity: 5 }],
  'bc-the-noir': [{ ingredientId: 'the_noir', quantity: 5 }],
  'bc-the-aromatise': [{ ingredientId: 'the_aromatise', quantity: 6 }],
  'bc-lait-chaud': [{ ingredientId: 'lait', quantity: 200 }],
  // --- Jus / cocktails frais ---------------------------------------------------
  'jc-jardin': [
    { ingredientId: 'citron', quantity: 50 },
    { ingredientId: 'orange', quantity: 150 },
    { ingredientId: 'pomme', quantity: 100 },
    { ingredientId: 'banane', quantity: 80 },
    { ingredientId: 'fruits_saison', quantity: 100 },
  ],
  'jc-exotique': [
    { ingredientId: 'orange', quantity: 150 },
    { ingredientId: 'kiwi', quantity: 100 },
    { ingredientId: 'mangue', quantity: 120 },
    { ingredientId: 'ananas', quantity: 120 },
  ],
  'jc-pina': [
    { ingredientId: 'ananas', quantity: 150 },
    { ingredientId: 'orange', quantity: 80 },
    { ingredientId: 'vanille', quantity: 2 },
    { ingredientId: 'lait_coco', quantity: 100 },
    { ingredientId: 'citron', quantity: 20 },
  ],
  'jc-orange': [{ ingredientId: 'orange', quantity: 400 }],
  'jc-citron': [{ ingredientId: 'citron', quantity: 300 }],
  'jc-carotte': [{ ingredientId: 'carottes', quantity: 350 }],
  'jc-banane': [
    { ingredientId: 'banane', quantity: 200 },
    { ingredientId: 'lait', quantity: 150 },
  ],
  'jc-fraise': [{ ingredientId: 'fraise', quantity: 200 }],
  'jc-citron-ging': [
    { ingredientId: 'citron', quantity: 200 },
    { ingredientId: 'gingembre', quantity: 20 },
  ],
  'jc-ananas': [{ ingredientId: 'ananas', quantity: 300 }],
  'jc-avocat-lait': [
    { ingredientId: 'avocat', quantity: 150 },
    { ingredientId: 'lait', quantity: 150 },
  ],
  'jc-mangue': [{ ingredientId: 'mangue', quantity: 250 }],
  'jc-panache': [
    { ingredientId: 'orange', quantity: 100 },
    { ingredientId: 'banane', quantity: 80 },
    { ingredientId: 'fraise', quantity: 80 },
    { ingredientId: 'mangue', quantity: 80 },
    { ingredientId: 'lait', quantity: 100 },
  ],
  'jc-avocat-sec': [
    { ingredientId: 'avocat', quantity: 150 },
    { ingredientId: 'lait', quantity: 100 },
    { ingredientId: 'dattes', quantity: 20 },
    { ingredientId: 'amandes', quantity: 15 },
    { ingredientId: 'noix', quantity: 15 },
  ],
  'jc-mojito': [
    { ingredientId: 'citron', quantity: 150 },
    { ingredientId: 'menthe', quantity: 10 },
    { ingredientId: 'oulmes_bouteille', quantity: 0.3 },
  ],
  // --- "Soda" (sodas, eaux, café glacé...) -----------------------------------
  'jc-hawaii': [{ ingredientId: 'canette_hawaii', quantity: 1 }],
  'jc-eau': [{ ingredientId: 'eau_bouteille_50cl', quantity: 1 }],
  'jc-eau-33': [{ ingredientId: 'eau_bouteille_33cl', quantity: 1 }],
  'jc-coca': [{ ingredientId: 'canette_coca', quantity: 1 }],
  'jc-coca-zero': [{ ingredientId: 'canette_coca_zero', quantity: 1 }],
  'jc-sprite': [{ ingredientId: 'canette_sprite', quantity: 1 }],
  'jc-poms': [{ ingredientId: 'canette_poms', quantity: 1 }],
  'jc-schweppes-citron': [{ ingredientId: 'canette_schweppes_citron', quantity: 1 }],
  'jc-schweppes-mojito': [{ ingredientId: 'canette_schweppes_mojito', quantity: 1 }],
  'jc-schweppes-tonic': [{ ingredientId: 'canette_schweppes_tonic', quantity: 1 }],
  'jc-lait-froid': [{ ingredientId: 'lait', quantity: 250 }],
  'jc-oulmes': [{ ingredientId: 'oulmes_bouteille', quantity: 1 }],
  'jc-iced-coffee': [
    { ingredientId: 'cafe_grains', quantity: 10 },
    { ingredientId: 'lait', quantity: 100 },
    { ingredientId: 'glace_pilee', quantity: 80 },
  ],
  'jc-redbull': [{ ingredientId: 'canette_redbull', quantity: 1 }],
  // --- Desserts --------------------------------------------------------------
  'ds-creme-caramel': [
    { ingredientId: 'lait', quantity: 120 },
    { ingredientId: 'oeuf', quantity: 1 },
    { ingredientId: 'caramel', quantity: 20 },
  ],
  'ds-tarte': [{ ingredientId: 'tarte_du_jour_achetee', quantity: 1 }],
  'ds-patisserie': [{ ingredientId: 'patisserie_du_jour_achetee', quantity: 1 }],
};
