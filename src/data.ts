export interface MenuItemVariant {
  id: string;
  name: Record<'en' | 'fr' | 'ar', string>;
  price: number;
  image?: string;
  description?: Record<'en' | 'fr' | 'ar', string>;
}

export interface MenuItem {
  id: string;
  name: Record<'en' | 'fr' | 'ar', string>;
  category: 'breakfasts' | 'omelettes' | 'toasts' | 'viennoiserie' | 'crepes_sucrees' | 'crepes_salees' | 'pizzas' | 'sandwiches' | 'tacos' | 'pasticcie' | 'burgers' | 'salades' | 'pates' | 'boissons_chaudes' | 'jus_cocktails' | 'boissons_fraiches' | 'desserts' | string;
  price: number;
  description: Record<'en' | 'fr' | 'ar', string>;
  image: string;
  spicy?: boolean;
  popular?: boolean;
  available?: boolean;
  station?: string;
  variants?: MenuItemVariant[];
}

export const menuItems: MenuItem[] = [
  // 1. Petits-déjeuners
  {
    id: 'b-express',
    category: 'breakfasts',
    price: 27,
    name: { fr: "L'Express", en: "The Express", ar: "الإكسبريس" },
    description: {
      fr: "Boisson chaude, jus d'orange, œufs (précisez la cuisson), bouteille d'eau",
      en: "Hot drink, orange juice, eggs (specify cooking), water bottle",
      ar: "مشروب ساخن، عصير برتقال، بيض (حدد الطهي)، زجاجة مياه"
    },
    image: ""
  },
  {
    id: 'b-continental',
    category: 'breakfasts',
    price: 29,
    name: { fr: "Continental", en: "Continental", ar: "كونتيننتال" },
    description: {
      fr: "Boisson chaude, jus d'orange, toast brûlé, viennoiserie, confiture, beurre, miel, bouteille d'eau",
      en: "Hot drink, orange juice, toast, pastry, jam, butter, honey, water bottle",
      ar: "مشروب ساخن، عصير برتقال، توست محمص، قطعة حلويات، مربى، زبدة، عسل، زجاجة مياه"
    },
    image: ""
  },
  {
    id: 'b-doms',
    category: 'breakfasts',
    price: 37,
    name: { fr: "Dom's", en: "Dom's Breakfast", ar: "دومز" },
    description: {
      fr: "Boisson chaude, jus d'orange, toasts, œufs, fromage, charcuterie, bouteille d'eau",
      en: "Hot drink, orange juice, toasts, eggs, cheese, cold cuts, water bottle",
      ar: "مشروب ساخن، عصير برتقال، توست، بيض، جبن، مرتديلا، زجاجة مياه"
    },
    image: "",
    popular: true
  },
  {
    id: 'b-jebli',
    category: 'breakfasts',
    price: 38,
    name: { fr: "Jebli", en: "Jebli", ar: "جبلي" },
    description: {
      fr: "Boisson chaude, jus d'orange, balboula, khlii aux œufs, bouteille d'eau",
      en: "Hot drink, orange juice, barley soup (balboula), khlii with eggs, water bottle",
      ar: "مشروب ساخن، عصير برتقال، بلبولة، خليع بالبيض، زجاجة مياه"
    },
    image: ""
  },
  {
    id: 'b-chamalli',
    category: 'breakfasts',
    price: 48,
    name: { fr: "Chamalli", en: "Chamalli", ar: "شمالي" },
    description: {
      fr: "Boisson chaude, jus d'orange, œufs au plat, mortadelle, jbane, olives noires, huile d'olive, edam, charcuterie, bouteille d'eau",
      en: "Hot drink, orange juice, fried eggs, mortadella, jbane cheese, black olives, olive oil, edam, cold cuts, water bottle",
      ar: "مشروب ساخن، عصير برتقال، بيض عيون، مورتديلا، جبن جبلي، زيتون أسود، زيت زيتون، جبنة إيدام، مرتديلا، زجاجة مياه"
    },
    image: ""
  },

  // 2. Omelettes
  {
    id: 'o-nature',
    category: 'omelettes',
    price: 13,
    name: { fr: "Omelette Nature", en: "Plain Omelette", ar: "أومليت سادة" },
    description: { fr: "Œufs battus nature", en: "Simple plain eggs", ar: "بيض مخفوق سادة" },
    image: ""
  },
  {
    id: 'o-fromage',
    category: 'omelettes',
    price: 18,
    name: { fr: "Omelette Fromage", en: "Cheese Omelette", ar: "أومليت بالجبن" },
    description: { fr: "Œufs battus au fromage", en: "Eggs with melted cheese", ar: "بيض مخفوق بالجبن" },
    image: ""
  },
  {
    id: 'o-champignons',
    category: 'omelettes',
    price: 21,
    name: { fr: "Omelette Champignons", en: "Mushroom Omelette", ar: "أومليت بالفطر" },
    description: { fr: "Œufs battus aux champignons", en: "Eggs with fresh mushrooms", ar: "بيض مخفوق بالفطر" },
    image: ""
  },
  {
    id: 'o-charcuterie',
    category: 'omelettes',
    price: 23,
    name: { fr: "Omelette Charcuterie", en: "Cold Cuts Omelette", ar: "أومليت بالمرتديلا" },
    description: { fr: "Œufs battus à la charcuterie", en: "Eggs with cold cuts", ar: "بيض مخفوق بالمرتديلا" },
    image: ""
  },
  {
    id: 'o-charc-fromage',
    category: 'omelettes',
    price: 24,
    name: { fr: "Omelette Charcuterie Fromage", en: "Cheese & Cold Cuts Omelette", ar: "أومليت بالجبن والمرتديلا" },
    description: { fr: "Œufs battus, charcuterie et fromage", en: "Eggs with cheese and cold cuts", ar: "بيض مخفوق بالمرتديلا والجبن" },
    image: ""
  },
  {
    id: 'o-khlii',
    category: 'omelettes',
    price: 26,
    name: { fr: "Khlii aux œufs", en: "Khlii with Eggs", ar: "خليع بالبيض" },
    description: { fr: "Œufs cuits avec de la viande séchée traditionnelle (Khlii)", en: "Moroccan preserved meat cooked with eggs", ar: "الخليع المغربي التقليدي المطهو بالبيض" },
    image: "",
    popular: true
  },

  // 3. Toasts
  {
    id: 't-fromage',
    category: 'toasts',
    price: 18,
    name: { fr: "Toast Fromage", en: "Cheese Toast", ar: "توست بالجبن" },
    description: { fr: "Toasts de pain de mie garnies de fromage fondant", en: "Warm bread slices with melted cheese", ar: "توست محشو بالجبن الذائب" },
    image: ""
  },
  {
    id: 't-croque',
    category: 'toasts',
    price: 24,
    name: { fr: "Croque Monsieur", en: "Croque Monsieur", ar: "كروك ميسيو" },
    description: { fr: "Pain de mie, jambon de dinde, fromage, sauce béchamel gratinée", en: "Turkey ham, cheese, and gratinéed béchamel", ar: "مرتديلا ديك رومي، جبن، صلصة بشاميل محمرة" },
    image: ""
  },
  {
    id: 't-charc-fromage',
    category: 'toasts',
    price: 24,
    name: { fr: "Toast Charcuterie Fromage", en: "Cold Cuts & Cheese Toast", ar: "توست بالجبن والمرتديلا" },
    description: { fr: "Toasts garnies de charcuterie et fromage", en: "Toasts with cold cuts and cheese", ar: "توست بالمرتديلا والجبن" },
    image: ""
  },
  {
    id: 't-oeuf-charc-fromage',
    category: 'toasts',
    price: 29,
    name: { fr: "Toast Œufs Charcuterie Fromage", en: "Eggs, Cold Cuts & Cheese Toast", ar: "توست البيض والجبن والمرتديلا" },
    description: { fr: "Toasts avec œufs, charcuterie et fromage fondant", en: "Toasts loaded with eggs, cold cuts, and cheese", ar: "توست بالبيض، المرتديلا والجبن" },
    image: ""
  },

  // 4. Viennoiserie
  {
    id: 'v-chocolat',
    category: 'viennoiserie',
    price: 10,
    name: { fr: "Pain au chocolat", en: "Pain au Chocolat", ar: "خبز بالشوكولاتة" },
    description: { fr: "Viennoiserie feuilletée pur beurre au chocolat", en: "Flaky butter pastry with chocolate", ar: "حلوى مورقة بالزبدة والشوكولاتة" },
    image: ""
  },
  {
    id: 'v-raisins',
    category: 'viennoiserie',
    price: 10,
    name: { fr: "Pain aux raisins", en: "Raisin Pastry", ar: "شنيك بالزبيب" },
    description: { fr: "Viennoiserie feuilletée, crème pâtissière et raisins", en: "Flaky pastry with custard and raisins", ar: "حلوى مورقة بكريمة الحلواني والزبيب" },
    image: ""
  },
  {
    id: 'v-croissant',
    category: 'viennoiserie',
    price: 10,
    name: { fr: "Croissant", en: "Croissant", ar: "كرواسون سادة" },
    description: { fr: "Croissant traditionnel pur beurre", en: "Traditional pure butter croissant", ar: "كرواسون تقليدي بالزبدة" },
    image: ""
  },
  {
    id: 'v-suisse',
    category: 'viennoiserie',
    price: 10,
    name: { fr: "Pain suisse", en: "Swiss Pastry", ar: "خبز سويسري" },
    description: { fr: "Pâte feuilletée, crème pâtissière et pépites de chocolat", en: "Flaky pastry with custard and chocolate chips", ar: "حلوى مورقة بكريمة الحلواني وحبيبات الشوكولاتة" },
    image: ""
  },

  // 5. Crêpes sucrées
  {
    id: 'cs-miel',
    category: 'crepes_sucrees',
    price: 18,
    name: { fr: "Crêpe Miel", en: "Honey Crêpe", ar: "كريب بالعسل" },
    description: { fr: "Crêpe douce au miel pur", en: "Thin sweet crêpe with pure honey", ar: "كريب حلو بالعسل الصافي" },
    image: ""
  },
  {
    id: 'cs-confiture',
    category: 'crepes_sucrees',
    price: 16,
    name: { fr: "Crêpe Confiture", en: "Jam Crêpe", ar: "كريب بالمربى" },
    description: { fr: "Crêpe douce nappée de confiture", en: "Thin sweet crêpe with jam", ar: "كريب حلو بالمربى" },
    image: ""
  },
  {
    id: 'cs-nutella',
    category: 'crepes_sucrees',
    price: 22,
    name: { fr: "Crêpe Nutella", en: "Nutella Crêpe", ar: "كريب بالنوتيلا" },
    description: { fr: "Crêpe douce au Nutella onctueux", en: "Thin sweet crêpe with Nutella", ar: "كريب حلو بنوتيلا الغنية" },
    image: "",
    popular: true
  },
  {
    id: 'cs-banane-nutella',
    category: 'crepes_sucrees',
    price: 24,
    name: { fr: "Crêpe Banane Nutella", en: "Banana Nutella Crêpe", ar: "كريب بالموز والنوتيلا" },
    description: { fr: "Crêpe douce avec banane fraîche et Nutella", en: "Thin sweet crêpe with fresh bananas and Nutella", ar: "كريب حلو بشرائح الموز الشوكولاتة" },
    image: ""
  },
  {
    id: 'cs-nutella-noix',
    category: 'crepes_sucrees',
    price: 26,
    name: { fr: "Crêpe Nutella Noix", en: "Nutella & Walnut Crêpe", ar: "كريب بالنوتيلا والجوز" },
    description: { fr: "Crêpe douce avec Nutella et éclats de noix", en: "Thin sweet crêpe with Nutella and walnuts", ar: "كريب حلو بنوتيلا وحبات الجوز" },
    image: ""
  },

  // 6. Crêpes salées
  {
    id: 'cl-3fromages',
    category: 'crepes_salees',
    price: 27,
    name: { fr: "Crêpe 3 Fromages", en: "3 Cheese Crêpe", ar: "كريب ثلاثة أجبان" },
    description: {
      fr: "Bleu, mozzarella, brie, béchamel",
      en: "Blue cheese, mozzarella, brie, béchamel",
      ar: "جبن أزرق، موزاريلا، جبن بري، بشاميل"
    },
    image: ""
  },
  {
    id: 'cl-charcuterie',
    category: 'crepes_salees',
    price: 29,
    name: { fr: "Crêpe Charcuterie", en: "Cold Cuts Crêpe", ar: "كريب بالمرتديلا" },
    description: {
      fr: "Fromage, béchamel, charcuterie",
      en: "Cheese, béchamel, cold cuts",
      ar: "جبن، بشاميل، مرتديلا"
    },
    image: ""
  },
  {
    id: 'cl-poulet',
    category: 'crepes_salees',
    price: 32,
    name: { fr: "Crêpe Poulet", en: "Chicken Crêpe", ar: "كريب بالدجاج" },
    description: {
      fr: "Champignon, fromage, béchamel, poulet",
      en: "Mushroom, cheese, béchamel, chicken",
      ar: "فطر، جبن، بشاميل، دجاج"
    },
    image: "",
    popular: true
  },
  {
    id: 'cl-viande',
    category: 'crepes_salees',
    price: 35,
    name: { fr: "Crêpe Viande Hachée", en: "Minced Beef Crêpe", ar: "كريب باللحم المفروم" },
    description: {
      fr: "Champignon, fromage, sauce blanche, viande hachée",
      en: "Mushroom, cheese, white sauce, minced beef",
      ar: "فطر، جبن، صلصة بيضاء، لحم مفروم"
    },
    image: ""
  },

  // 7. Pizzas
  {
    id: 'p-margherita-superiore',
    category: 'pizzas',
    price: 45,
    name: { fr: "Margherita Superiore", en: "Margherita Superiore", ar: "مارغريتا سوبيريوري" },
    description: {
      fr: "Mozzarella fondante, sauce tomate, basilic frais, filet d'huile d'olive",
      en: "Melted mozzarella, tomato sauce, fresh basil, olive oil drizzle",
      ar: "موزاريلا ذائبة، صلصة طماطم، ريحان طازج، زيت الزيتون"
    },
    image: "/pizzas/margherita-superiore.webp",
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 45 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 7 }
    ]
  },
  {
    id: 'p-manzo-ricco',
    category: 'pizzas',
    price: 75,
    name: { fr: "Manzo Ricco", en: "Manzo Ricco", ar: "مانزو ريكو" },
    description: {
      fr: "Mozzarella, bœuf braisé effiloché, oignons caramélisés, copeaux de parmesan",
      en: "Mozzarella, braised pulled beef, caramelized onions, parmesan shavings",
      ar: "موزاريلا، لحم بقري مطهو ببطء، بصل مكرمل، رقائق البارميزان"
    },
    image: "/pizzas/manzo-ricco.webp",
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 75 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 12 }
    ]
  },
  {
    id: 'p-tuna-riviera',
    category: 'pizzas',
    price: 52,
    name: { fr: "Tuna Riviera", en: "Tuna Riviera", ar: "تونة ريفييرا" },
    description: {
      fr: "Mozzarella, thon émietté, oignon rouge, câpres, olives kalamata, zeste de citron",
      en: "Mozzarella, flaked tuna, red onion, capers, kalamata olives, lemon zest",
      ar: "موزاريلا، تونة مفتتة، بصل أحمر، كبر، زيتون كالاماتا، قشر ليمون"
    },
    image: "/pizzas/tuna-riviera.webp",
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 52 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 8 }
    ]
  },
  {
    id: 'p-poulet-chermoula',
    category: 'pizzas',
    price: 58,
    name: { fr: "Poulet Chermoula", en: "Poulet Chermoula", ar: "بولي شرمولة" },
    description: {
      fr: "Mozzarella, poulet grillé façon chermoula, oignons caramélisés, poivrons, coriandre fraîche",
      en: "Mozzarella, chermoula-spiced grilled chicken, caramelized onions, bell peppers, fresh coriander",
      ar: "موزاريلا، دجاج مشوي بالشرمولة، بصل مكرمل، فلفل حلو، كزبرة طازجة"
    },
    image: "/pizzas/poulet-chermoula.webp",
    popular: true,
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 58 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 9 }
    ]
  },
  {
    id: 'p-merguez-piquante',
    category: 'pizzas',
    price: 60,
    name: { fr: "Merguez Piquante", en: "Merguez Piquante", ar: "مرقاز حار" },
    description: {
      fr: "Mozzarella, merguez grillée, poivrons rôtis, huile de harissa, œuf au plat",
      en: "Mozzarella, grilled merguez, roasted peppers, harissa oil, fried egg",
      ar: "موزاريلا، مرقاز مشوي، فلفل مشوي، زيت الهريسة، بيضة مقلية"
    },
    image: "/pizzas/merguez-piquante.webp",
    spicy: true,
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 60 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 9 }
    ]
  },
  {
    id: 'p-el-reto',
    category: 'pizzas',
    price: 75,
    name: { fr: "El Reto", en: "El Reto", ar: "الريتو" },
    description: {
      fr: "Mozzarella, sauce tomate au harissa, jalapeños, piments doux, viande épicée, sauce piquante",
      en: "Mozzarella, harissa-spiced tomato sauce, jalapeños, sweet chili peppers, spiced beef, hot sauce",
      ar: "موزاريلا، صلصة طماطم بالهريسة، هالبينو، فلفل حار خفيف، لحم متبل، صلصة حارة"
    },
    image: "/pizzas/el-reto.webp",
    spicy: true,
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 75 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 12 }
    ]
  },
  {
    id: 'p-quattro-formaggi',
    category: 'pizzas',
    price: 80,
    name: { fr: "Quattro Formaggi Nobile", en: "Quattro Formaggi Nobile", ar: "كواترو فورماجي نوبيلي" },
    description: {
      fr: "Mozzarella, gorgonzola, chèvre, copeaux de parmesan, filet de miel",
      en: "Mozzarella, gorgonzola, goat cheese, parmesan shavings, honey drizzle",
      ar: "موزاريلا، جبن غورغونزولا، جبن الماعز، رقائق البارميزان، صلصة العسل"
    },
    image: "/pizzas/quattro-formaggi.webp",
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 80 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 13 }
    ]
  },
  {
    id: 'p-rabat-nights',
    category: 'pizzas',
    price: 90,
    name: { fr: "Signature « Rabat Nights »", en: "Signature \"Rabat Nights\"", ar: "التوقيع \"ليالي الرباط\"" },
    description: {
      fr: "Mozzarella, khlea effilochée, oignons caramélisés, olives noires, œuf au plat, filet d'amlou",
      en: "Mozzarella, shredded khlea (confit beef), caramelized onions, black olives, fried egg, amlou drizzle",
      ar: "موزاريلا، خليع مفروم، بصل مكرمل، زيتون أسود، بيضة مقلية، صلصة أملو"
    },
    image: "/pizzas/rabat-nights.webp",
    popular: true,
    variants: [
      { id: 'entiere', name: { fr: "Pizza entière", en: "Whole Pizza", ar: "بيتزا كاملة" }, price: 90 },
      { id: 'part', name: { fr: "Par part", en: "Per Slice", ar: "بالقطعة" }, price: 14 }
    ]
  },

  // 8. Sandwichs
  {
    id: 's-thon',
    category: 'sandwiches',
    price: 32,
    name: { fr: "Sandwich Thon", en: "Tuna Sandwich", ar: "سندويش تونة" },
    description: {
      fr: "Thon, fromage, tomates, laitue, cornichons, oignons, sauce cocktail",
      en: "Tuna, cheese, tomatoes, lettuce, pickles, onions, cocktail sauce",
      ar: "تونة، جبن، طماطم، خس، خيار مخلل، بصل، صلصة كوكتيل"
    },
    image: ""
  },
  {
    id: 's-doms',
    category: 'sandwiches',
    price: 34,
    name: { fr: "Sandwich Dom's", en: "Dom's Special Sandwich", ar: "سندويش دومز" },
    description: {
      fr: "Thon, salami, jambon de bœuf, fromage, tomates, laitue, cornichons",
      en: "Tuna, salami, beef ham, cheese, tomatoes, lettuce, pickles",
      ar: "تونة، سلامي، لحم بقر مقدد، جبن، طماطم، خس، خيار مخلل"
    },
    image: "",
    popular: true
  },
  {
    id: 's-poulet',
    category: 'sandwiches',
    price: 36,
    name: { fr: "Sandwich Poulet", en: "Chicken Sandwich", ar: "سندويش دجاج" },
    description: {
      fr: "Poulet, fromage, tomates, laitue, cornichons, poivrons, sauce au choix",
      en: "Chicken, cheese, tomatoes, lettuce, pickles, bell peppers, sauce of your choice",
      ar: "دجاج، جبن، طماطم، خس، خيار مخلل، فلفل حلو، صلصة من اختيارك"
    },
    image: "",
    variants: [
      { id: 'ail', name: { fr: "Sauce à l'ail", en: "Garlic Sauce", ar: "صلصة الثوم" }, price: 36 },
      { id: 'blanche', name: { fr: "Sauce blanche", en: "White Sauce", ar: "صلصة بيضاء" }, price: 36 }
    ]
  },
  {
    id: 's-kefta',
    category: 'sandwiches',
    price: 38,
    name: { fr: "Sandwich Kefta", en: "Kefta Sandwich", ar: "سندويش كفتة" },
    description: {
      fr: "Viande hachée, fromage, tomates, laitue, cornichons, oignons, sauce au choix",
      en: "Minced beef, cheese, tomatoes, lettuce, pickles, onions, sauce of your choice",
      ar: "لحم مفروم، جبن، طماطم، خس، خيار مخلل، بصل، صلصة من اختيارك"
    },
    image: "",
    variants: [
      { id: 'ail', name: { fr: "Sauce à l'ail", en: "Garlic Sauce", ar: "صلصة الثوم" }, price: 38 },
      { id: 'blanche', name: { fr: "Sauce blanche", en: "White Sauce", ar: "صلصة بيضاء" }, price: 38 }
    ]
  },
  {
    id: 's-formule',
    category: 'sandwiches',
    price: 45,
    name: { fr: "Formule menu (sandwich + frite + soda)", en: "Sandwich Menu (fries + soda)", ar: "وجبة سندويش (بطاطس + صودا)" },
    description: {
      fr: "Sandwich de votre choix servi avec frites dorées et soda fraîche",
      en: "Any sandwich of choice served with golden fries and soda",
      ar: "سندويش من اختيارك يقدم مع بطاطس مقلية ومشروب غازي"
    },
    image: ""
  },

  // 9. Tacos
  {
    id: 'tc-poulet',
    category: 'tacos',
    price: 38,
    name: { fr: "Tacos Poulet", en: "Chicken Tacos", ar: "تاكو دجاج" },
    description: {
      fr: "Poulet, cheddar, frites, sauce béchamel et sauce au choix",
      en: "Chicken, cheddar, fries, béchamel and selected sauce",
      ar: "دجاج، جبن شيدر، بطاطس مقلية، بشاميل والصلصة المفضلة"
    },
    image: "",
    variants: [
      { id: 'fromagere', name: { fr: "Sauce Fromagère", en: "Cheese Sauce", ar: "صلصة الجبن" }, price: 38 },
      { id: 'algerienne', name: { fr: "Sauce Algérienne", en: "Algerian Sauce", ar: "الصلصة الجزائرية" }, price: 38 },
      { id: 'biggy', name: { fr: "Sauce Biggy", en: "Biggy Sauce", ar: "صلصة بيغي" }, price: 38 }
    ]
  },
  {
    id: 'tc-viande',
    category: 'tacos',
    price: 38,
    name: { fr: "Tacos Viande Hachée", en: "Minced Beef Tacos", ar: "تاكو لحم مفروم" },
    description: {
      fr: "Viande hachée, cheddar, frites, sauce béchamel et sauce au choix",
      en: "Minced beef, cheddar, fries, béchamel and selected sauce",
      ar: "لحم مفروم، جبن شيدر، بطاطس مقلية، بشاميل والصلصة المفضلة"
    },
    image: "",
    variants: [
      { id: 'fromagere', name: { fr: "Sauce Fromagère", en: "Cheese Sauce", ar: "صلصة الجبن" }, price: 38 },
      { id: 'algerienne', name: { fr: "Sauce Algérienne", en: "Algerian Sauce", ar: "الصلصة الجزائرية" }, price: 38 },
      { id: 'biggy', name: { fr: "Sauce Biggy", en: "Biggy Sauce", ar: "صلصة بيغي" }, price: 38 }
    ]
  },
  {
    id: 'tc-nuggets',
    category: 'tacos',
    price: 38,
    name: { fr: "Tacos Nuggets", en: "Nuggets Tacos", ar: "تاكو ناجتس" },
    description: {
      fr: "Nuggets, cheddar, frites, sauce béchamel et sauce au choix",
      en: "Nuggets, cheddar, fries, béchamel and selected sauce",
      ar: "ناجتس، جبن شيدر، بطاطس مقلية، بشاميل والصلصة المفضلة"
    },
    image: "",
    variants: [
      { id: 'fromagere', name: { fr: "Sauce Fromagère", en: "Cheese Sauce", ar: "صلصة الجبن" }, price: 38 },
      { id: 'algerienne', name: { fr: "Sauce Algérienne", en: "Algerian Sauce", ar: "الصلصة الجزائرية" }, price: 38 },
      { id: 'biggy', name: { fr: "Sauce Biggy", en: "Biggy Sauce", ar: "صلصة بيغي" }, price: 38 }
    ]
  },
  {
    id: 'tc-cordon',
    category: 'tacos',
    price: 38,
    name: { fr: "Tacos Cordon Bleu", en: "Cordon Bleu Tacos", ar: "تاكو كوردون بلو" },
    description: {
      fr: "Cordon bleu, cheddar, frites, sauce béchamel et sauce au choix",
      en: "Cordon bleu, cheddar, fries, béchamel and selected sauce",
      ar: "كوردون بلو، جبن شيدر، بطاطس مقلية، بشاميل والصلصة المفضلة"
    },
    image: "",
    variants: [
      { id: 'fromagere', name: { fr: "Sauce Fromagère", en: "Cheese Sauce", ar: "صلصة الجبن" }, price: 38 },
      { id: 'algerienne', name: { fr: "Sauce Algérienne", en: "Algerian Sauce", ar: "الصلصة الجزائرية" }, price: 38 },
      { id: 'biggy', name: { fr: "Sauce Biggy", en: "Biggy Sauce", ar: "صلصة بيغي" }, price: 38 }
    ]
  },
  {
    id: 'tc-formule',
    category: 'tacos',
    price: 42,
    name: { fr: "Formule menu (tacos + frite + soda)", en: "Tacos Menu (fries + soda)", ar: "وجبة تاكو (بطاطس + صودا)" },
    description: {
      fr: "Tacos au choix servi avec frites croustillantes et canette de soda fraîche",
      en: "Any tacos of choice served with crispy fries and chilled soda",
      ar: "تاكو من اختيارك يقدم مع بطاطس مقلية ومشروب غازي"
    },
    image: "",
    variants: [
      { id: 'fromagere', name: { fr: "Sauce Fromagère", en: "Cheese Sauce", ar: "صلصة الجبن" }, price: 42 },
      { id: 'algerienne', name: { fr: "Sauce Algérienne", en: "Algerian Sauce", ar: "الصلصة الجزائرية" }, price: 42 },
      { id: 'biggy', name: { fr: "Sauce Biggy", en: "Biggy Sauce", ar: "صلصة بيغي" }, price: 42 }
    ]
  },

  // 10. Pasticcie
  {
    id: 'ps-poulet',
    category: 'pasticcie',
    price: 42,
    name: { fr: "Poulet", en: "Chicken Pasticcio", ar: "باستيشيو دجاج" },
    description: {
      fr: "Poulet, fromage, sauce blanche gratinée",
      en: "Chicken, cheese, oven-baked white sauce",
      ar: "دجاج، جبن، صلصة بيضاء محمرة في الفرن"
    },
    image: "",
    popular: true
  },
  {
    id: 'ps-jambon',
    category: 'pasticcie',
    price: 42,
    name: { fr: "Jambon", en: "Ham Pasticcio", ar: "باستيشيو مرتديلا" },
    description: {
      fr: "Jambon, fromage, sauce blanche gratinée",
      en: "Ham, cheese, oven-baked white sauce",
      ar: "مرتديلا، جبن، صلصة بيضاء محمرة في الفرن"
    },
    image: ""
  },
  {
    id: 'ps-viande',
    category: 'pasticcie',
    price: 45,
    name: { fr: "Viande Hachée", en: "Minced Beef Pasticcio", ar: "باستيشيو لحم مفروم" },
    description: {
      fr: "Viande hachée, fromage, sauce blanche gratinée",
      en: "Minced beef, cheese, oven-baked white sauce",
      ar: "لحم مفروم، جبن، صلصة بيضاء محمرة في الفرن"
    },
    image: ""
  },
  {
    id: 'ps-mixte',
    category: 'pasticcie',
    price: 45,
    name: { fr: "Mixte", en: "Mixed Pasticcio", ar: "باستيشيو مشكل" },
    description: {
      fr: "Poulet, viande hachée, jambon, fromage, sauce blanche gratinée",
      en: "Chicken, beef, ham, cheese, and white sauce",
      ar: "دجاج، لحم مفروم، مرتديلا، جبن، صلصة بيضاء"
    },
    image: ""
  },

  // 11. Burgers
  {
    id: 'bg-chicken',
    category: 'burgers',
    price: 38,
    name: { fr: "Chicken", en: "Chicken Burger", ar: "برجر دجاج" },
    description: {
      fr: "Chicken, cheddar, tomate, oignon, laitue, cornichons",
      en: "Chicken, cheddar, tomato, onion, lettuce, pickles",
      ar: "دجاج، جبن شيدر، طماطم، بصل، خس، خيار مخلل"
    },
    image: ""
  },
  {
    id: 'bg-beef',
    category: 'burgers',
    price: 40,
    name: { fr: "Beef", en: "Beef Burger", ar: "برجر لحم بقري" },
    description: {
      fr: "Viande hachée, cheddar, tomate, oignon, laitue, cornichons",
      en: "Minced beef, cheddar, tomato, onion, lettuce, pickles",
      ar: "لحم بقري مفروم، جبن شيدر، طماطم، بصل، خس، خيار مخلل"
    },
    image: "",
    popular: true
  },
  {
    id: 'bg-eggs',
    category: 'burgers',
    price: 40,
    name: { fr: "Eggs", en: "Eggs Burger", ar: "برجر بيض" },
    description: {
      fr: "Nuggets, cheddar, frites, sauce béchamel",
      en: "Nuggets, cheddar, fries, béchamel sauce",
      ar: "ناجتس، جبن شيدر، بطاطس مقلية، بشاميل"
    },
    image: ""
  },
  {
    id: 'bg-cheese',
    category: 'burgers',
    price: 42,
    name: { fr: "Cheese", en: "Double Cheese Burger", ar: "تشيز برجر مضاعف" },
    description: {
      fr: "Viande hachée, double cheddar, tomate, oignon, laitue, cornichons",
      en: "Minced beef, double cheddar, tomato, onion, lettuce, pickles",
      ar: "لحم بقري مفروم، جبن شيدر مضاعف، طماطم، بصل، خس، مخلل"
    },
    image: ""
  },

  // 12. Salades
  {
    id: 'sl-marocaine',
    category: 'salades',
    price: 27,
    name: { fr: "Marocaine", en: "Moroccan Salad", ar: "سلطة مغربية" },
    description: {
      fr: "Laitue, tomate, oignons, thon, olives noires, vinaigrette",
      en: "Lettuce, tomato, onions, tuna, black olives, vinaigrette",
      ar: "خس، طماطم، بصل، تونة، زيتون أسود، تتبيلة الخل"
    },
    image: ""
  },
  {
    id: 'sl-nicoise',
    category: 'salades',
    price: 33,
    name: { fr: "Niçoise", en: "Niçoise Salad", ar: "سلطة نيسواز" },
    description: {
      fr: "Thon, pommes de terre, betteraves, carottes, concombre, tomates, laitue, olives noires, œuf dur, sauce au choix",
      en: "Tuna, potatoes, beetroot, carrots, cucumber, tomatoes, lettuce, olives, boiled egg, sauce of choice",
      ar: "تونة، بطاطس، شمندر، جزر، خيار، طماطم، خس، زيتون، بيض مسلوق، صلصة من اختيارك"
    },
    image: "",
    variants: [
      { id: 'blanche', name: { fr: "Sauce blanche", en: "White Sauce", ar: "صلصة بيضاء" }, price: 33 },
      { id: 'vinaigrette', name: { fr: "Vinaigrette", en: "Vinaigrette", ar: "صلصة الخل" }, price: 33 }
    ]
  },
  {
    id: 'sl-doms',
    category: 'salades',
    price: 36,
    name: { fr: "Dom's", en: "Dom's Salad", ar: "سلطة دومز" },
    description: {
      fr: "Riz, poulet, thon, tomates, maïs, laitue, edam, sauce au thon",
      en: "Rice, chicken, tuna, tomatoes, corn, lettuce, edam, tuna sauce",
      ar: "أرز، دجاج، تونة، طماطم، ذرة، خس، جبنة إيدام، صلصة تونة"
    },
    image: "",
    popular: true
  },
  {
    id: 'sl-rio',
    category: 'salades',
    price: 55,
    name: { fr: "Rio", en: "Rio Salad", ar: "سلطة ريو" },
    description: {
      fr: "Charcuteries, crevettes, surimi, brie, avocat, ananas, tomates, maïs, laitue, sauce cocktail",
      en: "Cold cuts, shrimp, surimi, brie, avocado, pineapple, tomatoes, corn, lettuce, cocktail sauce",
      ar: "مرتديلا، جمبري، سوريمي، جبن بري، أفوكادو، أناناس، طماطم، ذرة، خس، صلصة كوكتيل"
    },
    image: ""
  },
  {
    id: 'sl-fisherman',
    category: 'salades',
    price: 55,
    name: { fr: "Fisherman", en: "Fisherman Salad", ar: "سلطة صياد السمك" },
    description: {
      fr: "Crevettes, calamar, surimi, avocat, tomates, laitue, cornichons, olives noires, sauce cocktail",
      en: "Shrimp, squid, surimi, avocado, tomatoes, lettuce, pickles, black olives, cocktail sauce",
      ar: "جمبري، كالمار، سوريمي، أفوكادو، طماطم، خس، مخلل، زيتون، صلصة كوكتيل"
    },
    image: ""
  },

  // 13. Pâtes
  {
    id: 'pt-poulet',
    category: 'pates',
    price: 45,
    name: { fr: "Poulet", en: "Chicken Pasta", ar: "معكرونة دجاج" },
    description: {
      fr: "Poulet, champignon, parmesan, sauce blanche",
      en: "Chicken, mushroom, parmesan, rich white sauce",
      ar: "دجاج، فطر، جبنة بارميزان، صلصة بيضاء"
    },
    image: ""
  },
  {
    id: 'pt-bolognaise',
    category: 'pates',
    price: 50,
    name: { fr: "Bolognaise", en: "Bolognese Pasta", ar: "معكرونة بولونيز" },
    description: {
      fr: "Viande hachée, basilic, parmesan, sauce bolognaise",
      en: "Minced beef, fresh basil, parmesan, bolognese sauce",
      ar: "لحم مفروم، ريحان، جبنة بارميزان، صلصة بولونيز"
    },
    image: ""
  },
  {
    id: 'pt-carbonara',
    category: 'pates',
    price: 55,
    name: { fr: "Carbonara", en: "Carbonara Pasta", ar: "معكرونة كربونيرا" },
    description: {
      fr: "Jambon, champignon, parmesan, crème fraîche",
      en: "Ham, mushroom, parmesan, fresh cream",
      ar: "مرتديلا، فطر، جبنة بارميزان، قشدة طرية"
    },
    image: "",
    popular: true
  },
  {
    id: 'pt-fisherman',
    category: 'pates',
    price: 60,
    name: { fr: "Fisherman", en: "Fisherman Pasta", ar: "معكرونة الصياد" },
    description: {
      fr: "Crevettes, calamars, moules, pesto, tomates cerises",
      en: "Shrimp, squid, mussels, basil pesto, cherry tomatoes",
      ar: "جمبري، كالمار، بلح البحر، ريحان بيستو، طماطم كرزية"
    },
    image: ""
  },
  {
    id: 'pt-emince-poulet',
    category: 'pates',
    price: 65,
    name: { fr: "Émincé Poulet", en: "Sliced Chicken Breast", ar: "شرائح صدر الدجاج" },
    description: {
      fr: "Émincé de poulet cuisiné façon traditionnelle",
      en: "Sliced chicken breast cooked in traditional style",
      ar: "شرائح صدر الدجاج المطهوة على الطريقة التقليدية"
    },
    image: ""
  },

  // 14. Boissons chaudes
  {
    id: 'bc-cafe-noir',
    category: 'boissons_chaudes',
    price: 16,
    name: { fr: "Café noir", en: "Black Coffee", ar: "قهوة سوداء" },
    description: { fr: "Café noir riche et serré", en: "Rich bold black coffee", ar: "قهوة سوداء غنية ومركزة" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-cafe-americain',
    category: 'boissons_chaudes',
    price: 16,
    name: { fr: "Café américain", en: "Americano Coffee", ar: "قهوة أمريكية" },
    description: { fr: "Espresso allongé d'eau chaude", en: "Espresso diluted with hot water", ar: "إسبريسو مخفف بالماء الساخن" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-cafe-lait',
    category: 'boissons_chaudes',
    price: 18,
    name: { fr: "Café au lait", en: "Coffee with Milk", ar: "قهوة بالحليب" },
    description: { fr: "Café servi avec du lait chaud", en: "Classic coffee with steamed milk", ar: "قهوة كلاسيكية مع حليب ساخن" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-chocolat',
    category: 'boissons_chaudes',
    price: 24,
    name: { fr: "Chocolat chaud", en: "Hot Chocolate", ar: "شوكولاتة ساخنة" },
    description: { fr: "Chocolat au lait chaud crémeux", en: "Creamy cocoa with hot milk", ar: "شوكولاتة بالحليب الساخن الكريمي" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-nespresso',
    category: 'boissons_chaudes',
    price: 19,
    name: { fr: "Nespresso", en: "Nespresso", ar: "نسبريسو" },
    description: { fr: "Expresso Premium Nespresso", en: "Premium Nespresso espresso", ar: "إسبريسو ممتازة من نسبريسو" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-double-expresso',
    category: 'boissons_chaudes',
    price: 24,
    name: { fr: "Double expresso", en: "Double Espresso", ar: "إسبريسو مضاعف" },
    description: { fr: "Double dose d'expresso intense", en: "Double shot of rich espresso", ar: "جرعة مضاعفة من الإسبريسو" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-cappuccino',
    category: 'boissons_chaudes',
    price: 24,
    name: { fr: "Cappuccino", en: "Cappuccino", ar: "كابوتشينو" },
    description: { fr: "Espresso avec mousse de lait crémeuse", en: "Espresso topped with creamy milk foam", ar: "إسبريسو مغطى برغوة الحليب" },
    image: "",
    popular: true,
    station: "Bar"
  },
  {
    id: 'bc-frappuccino',
    category: 'boissons_chaudes',
    price: 26,
    name: { fr: "Frappuccino", en: "Frappuccino", ar: "فرابوتشينو" },
    description: { fr: "Café frappé glacé et crémeux", en: "Blended ice-cold creamy coffee", ar: "قهوة مثلجة ومخفوقة بالكريمة" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-mocaccino',
    category: 'boissons_chaudes',
    price: 26,
    name: { fr: "Mocaccino", en: "Mocaccino", ar: "موكاشينو" },
    description: { fr: "Mélange d'expresso, chocolat et lait chaud", en: "Espresso, hot chocolate and steamed milk", ar: "إسبريسو، شوكولاتة ساخنة وحليب" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-chocolat-ancienne',
    category: 'boissons_chaudes',
    price: 28,
    name: { fr: "Chocolat chaud à l'ancienne", en: "Old-school Hot Chocolate", ar: "شوكولاتة ساخنة تقليدية" },
    description: { fr: "Chocolat épais et onctueux à l'ancienne", en: "Thick traditional-style rich cocoa", ar: "شوكولاتة غليظة على الطريقة التقليدية" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-the-menthe',
    category: 'boissons_chaudes',
    price: 16,
    name: { fr: "Thé à la menthe", en: "Moroccan Mint Tea", ar: "شاي بالنعناع" },
    description: { fr: "Thé vert traditionnel à la menthe fraîche", en: "Traditional green tea with fresh mint", ar: "شاي أخضر تقليدي بالنعناع الطازج" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-verveine',
    category: 'boissons_chaudes',
    price: 18,
    name: { fr: "Verveine", en: "Verbena Herbal Tea", ar: "لويزة تيزان" },
    description: {
      fr: "Verveine infusée à l'eau ou au lait",
      en: "Verbena brewed with water or milk",
      ar: "لويزة محضر بالماء أو الحليب"
    },
    image: "",
    variants: [
      { id: 'eau', name: { fr: "Eau", en: "Water", ar: "ماء" }, price: 18 },
      { id: 'lait', name: { fr: "Lait", en: "Milk", ar: "حليب" }, price: 18 }
    ],
    station: "Bar"
  },
  {
    id: 'bc-the-noir',
    category: 'boissons_chaudes',
    price: 18,
    name: { fr: "Thé noir", en: "Black Tea", ar: "شاي أسود" },
    description: {
      fr: "Thé noir infusé à l'eau ou au lait",
      en: "Black tea brewed with water or milk",
      ar: "شاي أسود بالماء أو الحليب"
    },
    image: "",
    variants: [
      { id: 'eau', name: { fr: "Eau", en: "Water", ar: "ماء" }, price: 18 },
      { id: 'lait', name: { fr: "Lait", en: "Milk", ar: "حليب" }, price: 18 }
    ],
    station: "Bar"
  },
  {
    id: 'bc-the-aromatise',
    category: 'boissons_chaudes',
    price: 20,
    name: { fr: "Thé aromatisé", en: "Flavored Tea", ar: "شاي معطر" },
    description: { fr: "Thé sélectionné parfumé aux fruits ou fleurs", en: "Fine teas flavored with fruits or flowers", ar: "شاي فاخر معطر بالفواكه أو الزهور" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-lait-froid',
    category: 'boissons_chaudes',
    price: 12,
    name: { fr: "Lait chaud", en: "Hot Milk", ar: "حليب ساخن" },
    description: { fr: "Lait chaud réconfortant", en: "Warm comforting milk", ar: "حليب ساخن دافئ" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bc-lait-chaud',
    category: 'boissons_chaudes',
    price: 14,
    name: { fr: "Lait chaud", en: "Hot Milk", ar: "حليب ساخن" },
    description: { fr: "Lait chaud réconfortant", en: "Warm comforting milk", ar: "حليب ساخن دافئ" },
    image: "",
    station: "Bar"
  },

  // 15. Jus & Cocktails
  {
    id: 'jc-jardin',
    category: 'jus_cocktails',
    price: 28,
    name: { fr: "Jardin de fruits", en: "Fruit Garden", ar: "حديقة الفواكه" },
    description: {
      fr: "Citron, orange, pomme, banane, fruits de saison",
      en: "Lemon, orange, apple, banana, seasonal fruits",
      ar: "ليمون، برتقال، تفاح، موز، فواكه موسمية"
    },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-exotique',
    category: 'jus_cocktails',
    price: 29,
    name: { fr: "Exotique", en: "Exotic Cocktail", ar: "الكوكتيل الاستوائي" },
    description: {
      fr: "Orange, kiwi, mangue, ananas",
      en: "Orange, kiwi, mango, pineapple",
      ar: "برتقال، كيوي، مانجو، أناناس"
    },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-amandine',
    category: 'jus_cocktails',
    price: 29,
    name: { fr: "Amandine", en: "Amandine", ar: "أماندين" },
    description: {
      fr: "Lait, avocat, amande, noix, raisins secs",
      en: "Milk, avocado, almond, walnut, raisins",
      ar: "حليب، أفوكادو، لوز، جوز، زبيب"
    },
    image: "",
    popular: true,
    station: "Bar"
  },
  {
    id: 'jc-pina',
    category: 'jus_cocktails',
    price: 30,
    name: { fr: "Piña colada", en: "Piña Colada (Virgin)", ar: "بينا كولادا" },
    description: {
      fr: "Jus d'ananas, orange, vanille, lait de coco, ananas frais, citron",
      en: "Pineapple, orange, vanilla, coconut milk, fresh pineapple, lemon",
      ar: "أناناس، برتقال، فانيليا، حليب جوز الهند، أناناس طازج، ليمون"
    },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-orange',
    category: 'jus_cocktails',
    price: 22,
    name: { fr: "Orange", en: "Orange Juice", ar: "عصير برتقال" },
    description: { fr: "Jus d'orange frais pressé", en: "Freshly squeezed orange juice", ar: "عصير برتقال معصور طازج" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-citron',
    category: 'jus_cocktails',
    price: 22,
    name: { fr: "Citron", en: "Lemon Juice", ar: "عصير ليمون" },
    description: { fr: "Jus de citron frais pressé", en: "Fresh squeezed lemon juice", ar: "عصير ليمون حامض طازج" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-carotte',
    category: 'jus_cocktails',
    price: 22,
    name: { fr: "Carotte", en: "Carrot Juice", ar: "عصير جزر" },
    description: { fr: "Jus de carotte frais pressé", en: "Fresh squeezed carrot juice", ar: "عصير جزر مغذ طازج" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-banane',
    category: 'jus_cocktails',
    price: 22,
    name: { fr: "Banane", en: "Banana Juice", ar: "عصير موز" },
    description: { fr: "Jus de banane onctueux préparé au lait", en: "Smooth banana milkshake", ar: "عصير موز مخفوق بالحليب" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-fraise',
    category: 'jus_cocktails',
    price: 22,
    name: { fr: "Fraise", en: "Strawberry Juice", ar: "عصير فراولة" },
    description: { fr: "Jus de fraises fraîches pulpeux", en: "Fresh pulp strawberry juice", ar: "عصير فراولة طازج ومنعش" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-citron-ging',
    category: 'jus_cocktails',
    price: 24,
    name: { fr: "Citron gingembre", en: "Lemon Ginger", ar: "ليمون وزنجبيل" },
    description: { fr: "Citron frais avec un zeste de gingembre", en: "Fresh lemon with zesty ginger boost", ar: "ليمون طازج مع لمسة زنجبيل منشطة" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-ananas',
    category: 'jus_cocktails',
    price: 24,
    name: { fr: "Ananas", en: "Pineapple Juice", ar: "عصير أناناس" },
    description: { fr: "Jus d'ananas frais savoureux", en: "Sweet fresh pineapple juice", ar: "عصير أناناس طازج ولذيذ" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-avocat-lait',
    category: 'jus_cocktails',
    price: 26,
    name: { fr: "Avocat au lait", en: "Avocado with Milk", ar: "أفوكادو بالحليب" },
    description: { fr: "Smoothie crémeux à l'avocat et au lait", en: "Creamy avocado smoothie with milk", ar: "أفوكادو كريمي مخفوق بالحليب" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-mangue',
    category: 'jus_cocktails',
    price: 26,
    name: { fr: "Mangue", en: "Mango Juice", ar: "عصير مانجو" },
    description: { fr: "Jus de mangue onctueux et fruité", en: "Smooth pure exotic mango juice", ar: "عصير مانجو استوائي غني" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-panache',
    category: 'jus_cocktails',
    price: 28,
    name: { fr: "Panaché", en: "Panaché", ar: "باناشي" },
    description: { fr: "Cocktail onctueux de fruits mélangés au lait", en: "Creamy mixed fruit juice with milk", ar: "كوكتيل فواكه مشكلة بالحليب" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-avocat-sec',
    category: 'jus_cocktails',
    price: 32,
    name: { fr: "Avocat fruit sec", en: "Avocado with Dried Fruits", ar: "أفوكادو بالفواكه الجافة" },
    description: { fr: "Smoothie avocat garni de dattes, d'amandes et de noix", en: "Rich avocado smoothie with dates, almonds, walnuts", ar: "أفوكادو مغذ بالتمر واللوز والجوز" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-eau',
    category: 'jus_cocktails',
    price: 10,
    name: { fr: "Eau minérale", en: "Mineral Water", ar: "مياه معدنية" },
    description: { fr: "Bouteille d'eau minérale de table", en: "Chilled table mineral water bottle", ar: "زجاجة مياه معدنية طبيعية" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-soda',
    category: 'jus_cocktails',
    price: 16,
    name: { fr: "Soda", en: "Soda", ar: "صودا غازية" },
    description: { fr: "Canette de soda bien fraîche (Coca, Fanta, Sprite...)", en: "Ice-cold can of soda of choice", ar: "علبة مشروب غازي بارد" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-oulmes',
    category: 'jus_cocktails',
    price: 12,
    name: { fr: "Oulmes", en: "Oulmès Sparkling", ar: "والماس" },
    description: { fr: "Eau minérale naturellement gazeuse", en: "Naturally carbonated sparkling water", ar: "مياه معدنية غازية طبيعية" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-mojito',
    category: 'jus_cocktails',
    price: 24,
    name: { fr: "Mojito", en: "Virgin Mojito", ar: "موهيتو" },
    description: { fr: "Citron vert, menthe fraîche et eau gazeuse", en: "Virgin lime and mint carbonated refreshment", ar: "ليمون حامض، نعناع طازج ومياه غازية" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-iced-coffee',
    category: 'jus_cocktails',
    price: 25,
    name: { fr: "Iced Coffee", en: "Iced Coffee", ar: "قهوة مثلجة" },
    description: { fr: "Café expresso glacé avec du lait et de la glace", en: "Chilled espresso served on ice with milk", ar: "إسبريسو بارد بالحليب والثلج" },
    image: "",
    station: "Bar"
  },
  {
    id: 'jc-redbull',
    category: 'jus_cocktails',
    price: 27,
    name: { fr: "Red Bull", en: "Red Bull", ar: "ريد بول" },
    description: { fr: "Boisson énergisante bien fraîche", en: "Chilled energy drink can", ar: "علبة مشروب طاقة بارد" },
    image: "",
    station: "Bar"
  },
  {
    id: 'bf-soda',
    category: 'boissons_fraiches',
    price: 16,
    name: { fr: "Soda", en: "Soda", ar: "مشروب غازي" },
    description: { fr: "Coca-Cola, Fanta, Sprite, Hawai", en: "Coca-Cola, Fanta, Sprite, Hawai", ar: "كوكاكولا، فانتا، سبرايت، هاواي" },
    image: "/src/assets/images/soda_menu_item_1786017801846.jpg",
    station: "Bar",
    available: true
  },

  // 16. Desserts
  {
    id: 'ds-creme-caramel',
    category: 'desserts',
    price: 18,
    name: { fr: "Crème caramel", en: "Crème Caramel", ar: "كريم كراميل" },
    description: { fr: "Flan onctueux nappé de caramel liquide", en: "Creamy flan coated with liquid caramel", ar: "كاسترد ناعم بصلصة الكراميل السائلة" },
    image: ""
  },
  {
    id: 'ds-tarte',
    category: 'desserts',
    price: 25,
    name: { fr: "Tarte du jour", en: "Tart of the Day", ar: "تورتة اليوم" },
    description: { fr: "Tarte maison aux fruits frais de saison", en: "Homemade tart with fresh seasonal fruits", ar: "تورتة منزلية بالفواكه الطازجة" },
    image: "",
    popular: true
  },
  {
    id: 'ds-patisserie',
    category: 'desserts',
    price: 28,
    name: { fr: "Pâtisserie du jour", en: "Pastry of the Day", ar: "حلوى اليوم" },
    description: { fr: "Sélection raffinée de pâtisseries du chef", en: "Chef's daily choice of fine fresh pastry", ar: "حلويات طازجة من اختيار الشيف" },
    image: ""
  },

  // Snooker -- pas un plat/boisson mais une prestation facturable (partie de
  // billard), demandée pour pouvoir l'ajouter à une addition comme n'importe
  // quel article. Category id nouveau ("snooker"), pas dans un CATEGORY_GROUPS
  // existant côté caisse -- il apparaît donc automatiquement dans le groupe
  // "Autres" du rail de catégories, sans toucher au reste du menu.
  // station: "Bar" pour qu'il atterrisse au comptoir, pas dans la liste de
  // préparation cuisine (il n'y a rien à cuisiner).
  {
    id: 'snooker',
    category: 'snooker',
    price: 30,
    name: { fr: "Snooker", en: "Snooker", ar: "سنوكر" },
    description: { fr: "Partie de snooker (billard)", en: "Snooker (billiards) game", ar: "لعبة سنوكر (بيلياردو)" },
    image: "",
    station: "Bar"
  }
];

export const translations = {
  en: {
    meta_title: "Dom's Café & Restaurant | Order Online",
    nav_menu: "Interactive Menu",
    nav_philosophy: "Our Philosophy",
    nav_location: "Hours & Location",
    nav_franchise: "Franchise B2B",
    
    hero_tagline: "Where Agdal meets.",
    hero_headline_1: "DOM'S CAFÉ",
    hero_headline_highlight: "& RESTAURANT",
    hero_description: "Breakfasts, dishes, sandwiches and much more. Dom's Café & Restaurant, 26 rue Jabal Alayachi, Agdal.",
    hero_cta_primary: "Explore Menu & Order Online",
    hero_cta_secondary: "Visit Us in Agdal",
    
    philosophy_tag: "OUR COZY SPIRIT",
    philosophy_title: "Homemade Cuisine, Cozy Atmosphere",
    philosophy_p1: "Every dish is cooked with love and care, using selected local fresh ingredients.",
    philosophy_p2: "From early breakfasts to late night bites, we offer a welcoming bistro atmosphere.",
    philosophy_p3: "We built Dom's Café for the vibrant Agdal neighborhood because our community deserves street food and dishes made with ultimate love.",
    philosophy_invite: "You are invited to experience our warm hospitality and delicious homemade foods.",
    philosophy_values_title: "OUR VALUES",
    
    menu_tag: "THE MENU",
    menu_title: "Delicious Offerings",
    menu_subtitle: "Assemble your order below. When ready, click checkout to send your order directly to our kitchen.",
    menu_search_placeholder: "Search the menu…",
    menu_search_no_results: "No dishes match your search.",
    menu_search_clear: "Clear search",
    menu_popular_title: "Popular Right Now",
    menu_filter_all: "Show All",
    menu_filter_breakfasts: "Breakfast",
    menu_filter_omelettes: "Omelettes",
    menu_filter_toasts: "Toasts",
    menu_filter_viennoiserie: "Viennoiserie",
    menu_filter_crepes_sucrees: "Sweet Crêpes",
    menu_filter_crepes_salees: "Savory Crêpes",
    menu_filter_pizzas: "Pizzas",
    menu_filter_sandwiches: "Sandwiches",
    menu_filter_tacos: "Tacos",
    menu_filter_pasticcie: "Pasticcie",
    menu_filter_burgers: "Burgers",
    menu_filter_salades: "Salads",
    menu_filter_pates: "Pasta",
    menu_filter_boissons_chaudes: "Hot Drinks",
    menu_filter_jus_cocktails: "Cocktails & Juices",
    menu_filter_boissons_fraiches: "Cold Drinks",
    menu_filter_desserts: "Desserts",
    menu_spicy: "Spicy",
    menu_popular: "Popular",
    menu_add_to_cart: "Add to Order",
    menu_item_added: "Added!",
    back_to_top_menu: "Back to Top Menu",
    add_hot_drink_optional: "Pair with a hot drink (optional):",
    select_drink_none: "No hot drink",
    
    cart_title: "Your Order Cart",
    cart_empty: "Your cart is currently empty. Add some delicious dishes to get started!",
    cart_address_label: "Enter Delivery Address in Rabat:",
    cart_address_placeholder: "Street name, Apartment No., Neighborhood...",
    cart_subtotal: "Subtotal",
    cart_delivery: "Delivery Fee",
    cart_free: "FREE",
    cart_delivery_note: "Free delivery for orders above 200 MAD",
    cart_total: "Total",
    cart_checkout_btn: "Send Order",
    cart_type_dine_in: "Dine-in",
    cart_type_delivery: "Delivery in Rabat",
    cart_table_number: "Table Number (Optional)",
    cart_table_number_label: "Table Number",
    cart_first_name_label: "Your First Name",
    cart_first_name_placeholder: "Your first name",
    cart_dine_in_hint: "Indicate your table or first name",
    cart_delivery_first_name_required: "Please enter your first name",
    cart_note_label: "Special request (optional)",
    cart_note_placeholder: "Allergy, no onion, extra spicy...",
    cart_view_order: "View My Order",
    checkout_modal_title: "Confirm Your Order",
    checkout_modal_notice: "Confirm your order. It will be sent directly to the restaurant.",
    checkout_modal_confirm_btn: "Confirm order",
    checkout_modal_cancel_btn: "Cancel / Modify",
    checkout_error_msg: "Couldn't send your order, please check your connection and try again.",
    checkout_retry_btn: "Try again",
    checkout_modal_order_summary: "Order Summary",
    
    promo_banner: "",
    promo_drink_title: "",
    promo_drink_bubble_tea: "",
    promo_drink_coca: "",
    promo_drink_coca_zero: "",
    promo_drink_fanta: "",
    promo_drink_sprite: "",
    promo_drink_water: "",
    
    reviews_tag: "OUR GUESTS",
    reviews_title: "What They Say",
    reviews_subtitle: "Loved by the community in Agdal. Here's what our wonderful guests say.",
    reviews_1_text: "Great atmosphere and delicious food! The sandwich options are incredibly tasty and the coffee is of supreme quality. Best cafe in Agdal!",
    reviews_2_text: "Incredible homemade food served in a warm atmosphere. The staff is extremely welcoming and the outdoor seating on Jabal Alayachi is perfect.",
    reviews_3_text: "Dom's completely redefines the bistro experience in Agdal. Cozy, elegant, yet casual. Highly recommended!",
    google_rating: "4.9 / 5.0 Rating",
    google_review_count: "based on 320+ Google Reviews",
    google_write_review: "Write a Google Review",
    google_view_reviews: "View reviews on Google",
    google_verified: "Verified Google Review",
    
    location_tag: "LOCATION",
    location_title: "Visit Dom's Café",
    location_address: "26 rue Jabal Alayachi, Agdal, Rabat",
    location_hours_title: "Opening Hours",
    location_hours_weekdays: "Monday - Sunday: 08:00 - 23:00",
    location_hours_weekends: "Monday - Sunday: 08:00 - 23:00",
    location_maps_btn: "Get Directions on Google Maps",
    
    franchise_tag: "PARTNERSHIP",
    franchise_title: "Franchise Partnership (B2B)",
    franchise_subtitle: "Bring the warm spirit and delicious model of Dom's Café & Restaurant to your neighborhood.",
    franchise_name: "Full Name",
    franchise_city: "Target City (e.g. Casablanca, Marrakech, Tangier)",
    franchise_budget: "Investment Budget (MAD)",
    franchise_phone: "WhatsApp Phone Number",
    franchise_submit: "Apply for Franchise Partnership",
    franchise_success: "Application received! Our team will contact you on WhatsApp within 24 hours.",
    
    footer_text: "© 2026 Dom's Café & Restaurant. All rights reserved.",
    footer_tagline: "A Taste of Home.",
    pizza_crust_label: "",
    pizza_crust_classic: "",
    pizza_crust_thin: "",
    cart_confirm_dine_in: "Order sent. We'll bring everything to your table shortly.",
    cart_confirm_delivery: "Order sent. We're preparing it and will get it on its way.",
    cart_btn_new_order: "New Order",
    brand_line1: "Depuis des années au cœur d'Agdal.",
    brand_line2: "Cuisine faite maison, ambiance chaleureuse.",
    brand_line3: "26 rue Jabal Alayachi, Agdal, Rabat.",
    brand_trust: "4.9 on Google · 320+ reviews",
    brand_promise: "",
    cart_clear_confirm: "Clear cart?",
    cart_clear_yes: "Yes, clear",
    cart_clear_cancel: "Cancel"
  },
  fr: {
    meta_title: "Dom's Café & Restaurant | Commandez en ligne",
    nav_menu: "Menu Interactif",
    nav_philosophy: "Notre Philosophie",
    nav_location: "Horaires & Lieu",
    nav_franchise: "Franchise B2B",
    
    hero_tagline: "Le café où Agdal se retrouve.",
    hero_headline_1: "DOM'S CAFÉ",
    hero_headline_highlight: "& RESTAURANT",
    hero_description: "Petits-déjeuners, plats, sandwichs et bien plus. Dom's Café & Restaurant, 26 rue Jabal Alayachi, Agdal.",
    hero_cta_primary: "Explorer le Menu & Commander en ligne",
    hero_cta_secondary: "Nous Visiter à Agdal",
    
    philosophy_tag: "NOTRE ESPRIT CHALEUREUX",
    philosophy_title: "Cuisine Faite Maison, Ambiance Conviviale",
    philosophy_p1: "Chaque plat est cuisiné avec passion et attention, en sélectionnant les meilleurs produits locaux.",
    philosophy_p2: "Du petit-déjeuner gourmand aux encas du soir, profitez de l'atmosphère unique de notre bistro.",
    philosophy_p3: "Nous avons conçu Dom's Café au cœur d'Agdal pour offrir à notre communauté des plats authentiques faits avec amour.",
    philosophy_invite: "Une invitation à venir partager des moments agréables autour de nos recettes maison.",
    philosophy_values_title: "NOS VALEURS",
    
    menu_tag: "LE MENU",
    menu_title: "Nos Délices",
    menu_subtitle: "Composez votre commande ci-dessous. Une fois prêt, validez pour envoyer vos choix directement à notre cuisine.",
    menu_search_placeholder: "Rechercher un plat…",
    menu_search_no_results: "Aucun plat ne correspond à votre recherche.",
    menu_search_clear: "Effacer la recherche",
    menu_popular_title: "Populaire en ce moment",
    menu_filter_all: "Tout afficher",
    menu_filter_breakfasts: "Déjeuners",
    menu_filter_omelettes: "Omelettes",
    menu_filter_toasts: "Toasts",
    menu_filter_viennoiserie: "Viennoiserie",
    menu_filter_crepes_sucrees: "Crêpes Sucrées",
    menu_filter_crepes_salees: "Crêpes Salées",
    menu_filter_pizzas: "Pizzas",
    menu_filter_sandwiches: "Sandwichs",
    menu_filter_tacos: "Tacos",
    menu_filter_pasticcie: "Pasticcio",
    menu_filter_burgers: "Burgers",
    menu_filter_salades: "Salades",
    menu_filter_pates: "Pâtes",
    menu_filter_boissons_chaudes: "Boissons Chaudes",
    menu_filter_jus_cocktails: "Jus & Cocktails",
    menu_filter_boissons_fraiches: "Boissons Fraîches",
    menu_filter_desserts: "Desserts",
    menu_spicy: "Épicé",
    menu_popular: "Populaire",
    menu_add_to_cart: "Ajouter au Panier",
    menu_item_added: "Ajouté !",
    back_to_top_menu: "Retour aux catégories",
    add_hot_drink_optional: "Accompagner d'une boisson chaude (optionnel) :",
    select_drink_none: "Aucune boisson",
    
    cart_title: "Votre Panier",
    cart_empty: "Votre panier est vide. Ajoutez des plats faits maison pour commencer !",
    cart_address_label: "Adresse de livraison à Rabat :",
    cart_address_placeholder: "Nom de rue, N° d'appartement, Quartier...",
    cart_subtotal: "Sous-total",
    cart_delivery: "Livraison",
    cart_free: "GRATUITE",
    cart_delivery_note: "Livraison gratuite pour les commandes de plus de 200 MAD",
    cart_total: "Total",
    cart_checkout_btn: "Envoyer la Commande",
    cart_type_dine_in: "Sur place",
    cart_type_delivery: "Livraison à Rabat",
    cart_table_number: "Numéro de table (optionnel)",
    cart_table_number_label: "Numéro de table",
    cart_first_name_label: "Votre prénom",
    cart_first_name_placeholder: "Votre prénom",
    cart_dine_in_hint: "Indiquez votre table ou votre prénom",
    cart_delivery_first_name_required: "Veuillez indiquer votre prénom",
    cart_note_label: "Remarque particulière (optionnel)",
    cart_note_placeholder: "Allergie, sans oignon, bien épicé...",
    cart_view_order: "Voir ma commande",
    checkout_modal_title: "Confirmez votre commande",
    checkout_modal_notice: "Confirmez votre commande. Elle sera envoyée directement au restaurant.",
    checkout_modal_confirm_btn: "Confirmer la commande",
    checkout_modal_cancel_btn: "Annuler / Modifier",
    checkout_error_msg: "Impossible d'envoyer la commande, vérifiez votre connexion et réessayez.",
    checkout_retry_btn: "Réessayer",
    checkout_modal_order_summary: "Récapitulatif de la commande",
    
    promo_banner: "",
    promo_drink_title: "",
    promo_drink_bubble_tea: "",
    promo_drink_coca: "",
    promo_drink_coca_zero: "",
    promo_drink_fanta: "",
    promo_drink_sprite: "",
    promo_drink_water: "",
    
    reviews_tag: "NOS CLIENTS",
    reviews_title: "Leurs Avis",
    reviews_subtitle: "Plébiscité par la communauté d'Agdal. Voici leurs avis sur notre café-restaurant.",
    reviews_1_text: "Excellente ambiance et nourriture délicieuse ! Les formules de petit-déjeuner et les sandwichs sont parfaits. Le meilleur café d'Agdal !",
    reviews_2_text: "Plats faits maison formidables, service chaleureux et terrasse très agréable sur la rue Jabal Alayachi. Une adresse incontournable.",
    reviews_3_text: "Dom's redéfinit l'expérience bistro à Agdal. Convivial, cosy et de grande qualité. Recommandé à 100 % !",
    google_rating: "Note de 4.9 / 5.0",
    google_review_count: "basé sur plus de 320 avis Google",
    google_write_review: "Laisser un avis Google",
    google_view_reviews: "Voir les avis sur Google",
    google_verified: "Avis Google Vérifié",
    
    location_tag: "NOTRE EMPLACEMENT",
    location_title: "Visitez Dom's Café",
    location_address: "26 rue Jabal Alayachi, Agdal, Rabat",
    location_hours_title: "Horaires d'Ouverture",
    location_hours_weekdays: "Lundi - Dimanche : 08h00 - 23h00",
    location_hours_weekends: "Lundi - Dimanche : 08h00 - 23h00",
    location_maps_btn: "Obtenir l'Itinéraire sur Google Maps",
    
    franchise_tag: "PARTENARIAT",
    franchise_title: "Opportunités de Franchise (B2B)",
    franchise_subtitle: "Apportez l'esprit accueillant et le concept à succès de Dom's Café & Restaurant dans votre quartier.",
    franchise_name: "Nom Complet",
    franchise_city: "Ville Cible (ex: Casablanca, Marrakech, Tanger)",
    franchise_budget: "Budget d'Investissement (MAD)",
    franchise_phone: "Numéro de Téléphone WhatsApp",
    franchise_submit: "Postuler pour une Franchise",
    franchise_success: "Candidature reçue ! Notre équipe vous contactera sur WhatsApp d'ici 24 heures.",
    
    footer_text: "© 2026 Dom's Café & Restaurant. Tous droits réservés.",
    footer_tagline: "Une cuisine faite avec cœur.",
    pizza_crust_label: "",
    pizza_crust_classic: "",
    pizza_crust_thin: "",
    cart_confirm_dine_in: "Commande envoyée. On vous apporte tout à table dans un instant.",
    cart_confirm_delivery: "Commande envoyée. On la prépare et on vous l'apporte.",
    cart_btn_new_order: "Nouvelle commande",
    brand_line1: "Depuis des années au cœur d'Agdal.",
    brand_line2: "Cuisine faite maison, ambiance chaleureuse.",
    brand_line3: "26 rue Jabal Alayachi, Agdal, Rabat.",
    brand_trust: "4,9 sur Google · 320+ avis",
    brand_promise: "",
    cart_clear_confirm: "Vider le panier ?",
    cart_clear_yes: "Oui, vider",
    cart_clear_cancel: "Annuler"
  },
  ar: {
    meta_title: "دومز كافيه ومطعم | اطلب عبر الإنترنت",
    nav_menu: "القائمة التفاعلية",
    nav_philosophy: "فلسفتنا",
    nav_location: "الموقع والساعات",
    nav_franchise: "شراكة الامتياز (B2B)",
    
    hero_tagline: "المقهى الذي يجمع أكدال.",
    hero_headline_1: "دومز كافيه",
    hero_headline_highlight: "ومطعم",
    hero_description: "وجبات الإفطار، الأطباق، السندويشات وأكثر من ذلك بكثير. دومز كافيه ومطعم، 26 شارع جبل العياشي، أكدال.",
    hero_cta_primary: "تصفح القائمة واطلب مباشرة",
    hero_cta_secondary: "تفضل بزيارتنا في أكدال",
    
    philosophy_tag: "روحنا الدافئة",
    philosophy_title: "مأكولات منزلية وأجواء مريحة",
    philosophy_p1: "كل طبق يتم طهيه بحب وعناية، باستخدام أفضل المكونات المحلية الطازجة.",
    philosophy_p2: "من وجبات الإفطار الصباحية إلى الوجبات الخفيفة المسائية، استمتع بأجوائنا الدافئة والودية.",
    philosophy_p3: "لقد أسسنا دومز كافيه في قلب أكدال لنقدم لمجتمعنا أطباقاً أصيلة ومصنوعة بكل حب وشغف.",
    philosophy_invite: "يسعدنا دعوتكم لتجربة كرم ضيافتنا ومأكولاتنا المنزلية اللذيذة.",
    philosophy_values_title: "قيمنا",
    
    menu_tag: "القائمة",
    menu_title: "أطباقنا اللذيذة",
    menu_subtitle: "قم بتركيب طلبك أدناه. عندما تصبح جاهزًا، اضغط على زر إرسال الطلب ليتم إرساله مباشرة إلى مطبخنا.",
    menu_search_placeholder: "ابحث في القائمة…",
    menu_search_no_results: "لا توجد أطباق مطابقة لبحثك.",
    menu_search_clear: "مسح البحث",
    menu_popular_title: "الأكثر طلبًا حاليًا",
    menu_filter_all: "عرض الكل",
    menu_filter_breakfasts: "الإفطار",
    menu_filter_omelettes: "أومليت",
    menu_filter_toasts: "توست",
    menu_filter_viennoiserie: "معجنات",
    menu_filter_crepes_sucrees: "كريب حلو",
    menu_filter_crepes_salees: "كريب مالح",
    menu_filter_pizzas: "بيتزا",
    menu_filter_sandwiches: "سندويشات",
    menu_filter_tacos: "تاكو",
    menu_filter_pasticcie: "باستيشيو",
    menu_filter_burgers: "برجر",
    menu_filter_salades: "سلطات",
    menu_filter_pates: "معكرونة",
    menu_filter_boissons_chaudes: "مشروبات ساخنة",
    menu_filter_jus_cocktails: "عصائر وكوكتيل",
    menu_filter_boissons_fraiches: "مشروبات باردة",
    menu_filter_desserts: "حلويات",
    menu_spicy: "حار",
    menu_popular: "محبوب",
    menu_add_to_cart: "أضف إلى الطلب",
    menu_item_added: "تمت الإضافة!",
    back_to_top_menu: "العودة إلى القائمة الرئيسية",
    add_hot_drink_optional: "إضافة مشروب ساخن (اختياري):",
    select_drink_none: "بدون مشروب ساخن",
    
    cart_title: "سلتك",
    cart_empty: "سلتك فارغة حاليًا. أضف بعض الأطباق اللذيذة للبدء!",
    cart_address_label: "أدخل عنوان التوصيل في الرباط:",
    cart_address_placeholder: "اسم الشارع، رقم الشقة، الحي...",
    cart_subtotal: "المجموع الفرعي",
    cart_delivery: "رسوم التوصيل",
    cart_free: "مجاني",
    cart_delivery_note: "التوصيل مجاني للطلبات الأكثر من 200 درهم",
    cart_total: "المجموع الكلي",
    cart_checkout_btn: "إرسال الطلب",
    cart_type_dine_in: "في المطعم",
    cart_type_delivery: "توصيل إلى الرباط",
    cart_table_number: "رقم الطاولة (اختياري)",
    cart_table_number_label: "رقم الطاولة",
    cart_first_name_label: "الاسم الشخصي",
    cart_first_name_placeholder: "الاسم الشخصي",
    cart_dine_in_hint: "يرجى تحديد رقم الطاولة أو الاسم الشخصي",
    cart_delivery_first_name_required: "يرجى إدخال الاسم الشخصي",
    cart_note_label: "ملاحظة خاصة (اختياري)",
    cart_note_placeholder: "حساسية، بدون بصل، حار جدًا...",
    cart_view_order: "عرض طلبي",
    checkout_modal_title: "تأكيد الطلب",
    checkout_modal_notice: "تأكيد طلبك. سيتم إرساله مباشرة إلى المطعم.",
    checkout_modal_confirm_btn: "تأكيد الطلب",
    checkout_modal_cancel_btn: "إلغاء / تعديل",
    checkout_error_msg: "تعذر إرسال الطلب، يرجى التحقق من الاتصال والمحاولة مرة أخرى.",
    checkout_retry_btn: "إعادة المحاولة",
    checkout_modal_order_summary: "ملخص الطلب",
    
    promo_banner: "",
    promo_drink_title: "",
    promo_drink_bubble_tea: "",
    promo_drink_coca: "",
    promo_drink_coca_zero: "",
    promo_drink_fanta: "",
    promo_drink_sprite: "",
    promo_drink_water: "",
    
    reviews_tag: "ضيوفنا",
    reviews_title: "ماذا يقولون",
    reviews_subtitle: "محبوب من قبل مجتمع أكدال. إليك بعض التقييمات الرائعة من ضيوفنا الكرام.",
    reviews_1_text: "أجواء رائعة ومأكولات لذيذة للغاية! أطباق الإفطار والسندويشات ممتازة والقهوة ذات جودة عالية جداً. أفضل مقهى في أكدال!",
    reviews_2_text: "أطباق منزلية مذهلة، معاملة لطيفة من طاقم العمل، وجلسة خارجية هادئة ومميزة على شارع جبل العياشي.",
    reviews_3_text: "دومز يعيد تعريف تجربة المقاهي والمطاعم في أكدال. مريح، راقٍ، ومميز. ننصح به بشدة!",
    google_rating: "التقييم 4.9 / 5.0",
    google_review_count: "بناءً على أكثر من 320 تقييم في جوجل",
    google_write_review: "كتابة تقييم على جوجل",
    google_view_reviews: "عرض التقييمات على جوجل",
    google_verified: "تقييم جوجل موثق",
    
    location_tag: "موقعنا",
    location_title: "تفضل بزيارة دومز",
    location_address: "26 شارع جبل العياشي، أكدال، الرباط",
    location_hours_title: "ساعات العمل",
    location_hours_weekdays: "الإثنين - الأحد: 08:00 صباحًا - 11:00 مساءً",
    location_hours_weekends: "الإثنين - الأحد: 08:00 صباحًا - 11:00 مساءً",
    location_maps_btn: "احصل على الاتجاهات على خرائط جوجل",
    
    franchise_tag: "الشراكة",
    franchise_title: "فرص شريك الامتياز التجاري (B2B)",
    franchise_subtitle: "انقل روح دومز كافيه الدافئة ونموذجه التشغيلي الناجح إلى منطقتك.",
    franchise_name: "الاسم الكامل",
    franchise_city: "المدينة المستهدفة (مثال: الدار البيضاء، مراكش، طنجة)",
    franchise_budget: "ميزانية الاستثمار المتوفرة (درهم)",
    franchise_phone: "رقم هاتف الواتساب",
    franchise_submit: "تقديم طلب شريك الامتياز",
    franchise_success: "تم استلام طلبك بنجاح! سيتصل بك فريقنا عبر الواتساب في غضون 24 ساعة.",
    
    footer_text: "© 2026 دومز كافيه ومطعم. جميع الحقوق محفوظة.",
    footer_tagline: "مذاق دافئ مثل المنزل.",
    pizza_crust_label: "",
    pizza_crust_classic: "",
    pizza_crust_thin: "",
    cart_confirm_dine_in: "تم إرسال الطلب. سنحضر كل شيء إلى طاولتك في الحال.",
    cart_confirm_delivery: "تم إرسال الطلب. سنقوم بتحضيره وتوصيله إليك.",
    cart_btn_new_order: "طلب جديد",
    brand_line1: "منذ سنوات في قلب أكدال.",
    brand_line2: "مأكولات منزلية الصنع، وأجواء دافئة.",
    brand_line3: "26 شارع جبل العياشي، أكدال، الرباط.",
    brand_trust: "4.9 على جوجل · +320 تقييم",
    brand_promise: "",
    cart_clear_confirm: "هل تريد تفريغ السلة؟",
    cart_clear_yes: "نعم، تفريغ",
    cart_clear_cancel: "إلغاء"
  }
};

export interface PhilosophyValue {
  icon: string;
  title: string;
  desc: string;
}

export const philosophyValues: Record<'en' | 'fr' | 'ar', PhilosophyValue[]> = {
  en: [
    {
      icon: "ChefHat",
      title: "Homemade Cuisine",
      desc: "Fresh daily breakfasts, exquisite dishes, and premium gourmet sandwiches made with absolute love and care."
    },
    {
      icon: "Coffee",
      title: "Cozy bistro vibe",
      desc: "A warm and friendly neighborhood spot where the Agdal community gathers to work, talk, and relax."
    },
    {
      icon: "Heart",
      title: "For Agdal, Rabat",
      desc: "Located on 26 rue Jabal Alayachi. We take pride in serving our community with local fresh ingredients."
    }
  ],
  fr: [
    {
      icon: "ChefHat",
      title: "Cuisine Faite Maison",
      desc: "Des petits-déjeuners frais, des plats exquis et des sandwichs gourmands préparés chaque jour avec amour."
    },
    {
      icon: "Coffee",
      title: "Ambiance Bistro Cosy",
      desc: "Un lieu de vie chaleureux et convivial où la communauté d'Agdal se retrouve pour travailler, discuter ou se détendre."
    },
    {
      icon: "Heart",
      title: "Pour Agdal, Rabat",
      desc: "Situé au 26 rue Jabal Alayachi. Nous sommes fiers de servir notre communauté avec des produits frais locaux."
    }
  ],
  ar: [
    {
      icon: "ChefHat",
      title: "مأكولات منزلية الصنع",
      desc: "وجبات إفطار طازجة يومياً، أطباق رائعة، وسندويشات فاخرة محضرة بكل حب وعناية."
    },
    {
      icon: "Coffee",
      title: "أجواء بيستو دافئة",
      desc: "مكان دافئ وودود في الحي حيث يجتمع مجتمع أكدال للعمل، التحدث والاسترخاء."
    },
    {
      icon: "Heart",
      title: "من أجل أكدال، الرباط",
      desc: "يقع في 26 شارع جبل العياشي. نحن فخورون بخدمة مجتمعنا بأفضل المكونات المحلية الطازجة."
    }
  ]
};

export interface Testimonial {
  name: string;
  initials: string;
  text: Record<'en' | 'fr' | 'ar', string>;
}

export const testimonialsData: Testimonial[] = [
  {
    name: "Yassine B.",
    initials: "YB",
    text: {
      en: "The sandwich options are incredible! The bread is so fresh, the sauces are superb, and the overall cozy atmosphere is unmatched. Best cafe in Agdal!",
      fr: "Les formules sandwichs sont incroyables ! Le pain est si frais, les sauces sont délicieuses et l'ambiance chaleureuse est incomparable. Le meilleur café d'Agdal !",
      ar: "سندويشات دومز رائعة للغاية! الخبز طازج، والصلصات لذيذة، والأجواء الدافئة والمريحة لا مثيل لها. أفضل كافيه في أكدال!"
    }
  },
  {
    name: "Sarah M.",
    initials: "SM",
    text: {
      en: "From the moment we walked in, the staff were incredibly welcoming and helpful. Our breakfast came out beautifully presented and everything was delicious.",
      fr: "Dès que nous sommes entrés, le personnel s'est montré extrêmement accueillant et attentionné. Notre petit-déjeuner était superbement présenté et délicieux.",
      ar: "منذ اللحظة التي دخلنا فيها، كان طاقم العمل مرحبًا ولطيفًا للغاية. تم تقديم وجبة الإفطار بشكل جميل وكان كل شيء لذيذًا."
    }
  },
  {
    name: "Karim A.",
    initials: "KA",
    text: {
      en: "Dom's completely redefines the cozy bistro experience. It's warm, elegant, yet welcoming. Their homemade dishes are a delight. 10/5 stars!",
      fr: "Dom's redéfinit complètement l'expérience bistro de quartier. C'est chaleureux, élégant et convivial. Leurs plats faits maison sont un régal. 10/5 étoiles !",
      ar: "دومز يعيد تعريف تجربة بيستو الحي الدافئ تمامًا. إنه مريح، أنيق ومرحب بالجميع. أطباقهم المنزلية متعة حقيقية! 10/5 نجوم!"
    }
  },
  {
    name: "Imane T.",
    initials: "IT",
    text: {
      en: "A beautiful café-restaurant in Agdal. The terrace is great, the service is swift, and the coffee is of supreme quality. Our favorite spot in Rabat.",
      fr: "Un magnifique café-restaurant à Agdal. La terrasse est superbe, le service est rapide, et le café est d'une qualité suprême. Notre endroit préféré à Rabat.",
      ar: "كافيه ومطعم رائع في أكدال. الجلسة الخارجية ممتازة، الخدمة سريعة، والقهوة ذات جودة عالية جداً. مكاننا المفضل في الرباط."
    }
  },
  {
    name: "Omar R.",
    initials: "OR",
    text: {
      en: "Everything tastes made with love and fresh daily. You can tell they actually care about their guests and the quality here.",
      fr: "Tout a le goût d'être fait maison avec amour et fraîcheur quotidienne. On voit qu'ils se soucient vraiment de la qualité et de leurs clients.",
      ar: "كل طبق يحمل لمسة حب ومصنوع طازجًا بشكل يومي. تشعر بمدى اهتمامهم الحقيقي بالضيوف وبجودة الأكل هنا."
    }
  }
];

// Dynamically populate images for all menu items using Unsplash stock photos by category
const categoryImages: Record<string, string[]> = {
  breakfasts: [
    '1525351484163-7529414344d8',
    '1495214783159-3503fd1b572d',
    '1533089860892-a7c6f0a88666',
    '1504754524776-8f4f37790ca0',
    '1482049016688-2d3e1b311543',
    '1497515114629-f71d768fd07c'
  ],
  omelettes: [
    '1510627802775-37365e396b7c',
    '1494597564530-871f2b93ac55',
    '152418262099e-7a5542f79025',
    '1565895405138-6c3a1555da6a',
    '1621510456681-23a23cfb5f57',
    '1608797178974-15b35a61d121'
  ],
  toasts: [
    '1541532713592-79a0317b6b77',
    '1484723091739-30a097e8f929',
    '1584776296944-ab6fb57b0bdd',
    '1542986130-f0c39f75f922',
    '1533089860892-a7c6f0a88666'
  ],
  viennoiserie: [
    '1555507036-ab1f4038808a',
    '1549931319-a545dcf3bc73',
    '1509440159596-0249088772ff',
    '1608686207856-001b95cf60ca',
    '1530610476181-d83430b64dcd'
  ],
  crepes_sucrees: [
    '1584473457406-6240486418e9',
    '1551024601-bec78aea704b',
    '1532550907401-a500c9a57435',
    '1519676867240-f03562e64548',
    '1506084868230-bb9d95c24759'
  ],
  crepes_salees: [
    '1513456852971-30c0b8199d4d',
    '1621303837174-89787a7d4729',
    '1565299585323-38d6b0865b47',
    '1621510456681-23a23cfb5f57'
  ],
  pizzas: [
    '1513104890138-7c749659a591',
    '1534308983496-4fabb1a015ee',
    '1574071318508-1cdbab80d002',
    '1593560708920-61dd98c46a4e',
    '1604382354936-07c5d9983bd3',
    '1565299624946-b28f40a0ae38'
  ],
  sandwiches: [
    '1509722747041-616f39b57569',
    '1521390188846-e2a3a97453a0',
    '1567234669003-dce7a7a88821',
    '1550547660-d9450f859349',
    '1553909489-cd47e0907980'
  ],
  tacos: [
    '1615870216519-2f9fa575fa5c',
    '1624462966581-bc6d768cbce5',
    '1601924582970-d7d3c1d1d991',
    '1544025162-d76694265947'
  ],
  pasticcie: [
    '1543339494-b4cd4f7ba686',
    '1598866539377-f9d26330026e',
    '1574894709920-11b28e7367e3',
    '1546549032-9571cd6b27df'
  ],
  burgers: [
    '1568901346375-23c9450c58cd',
    '1550547660-944c21fe5d45',
    '1571091718767-18b5b1457add',
    '1586190848861-99aa4a171e90'
  ],
  salades: [
    '1512621776951-a57141f2eefd',
    '1540420773420-3366772f4999',
    '1505253716362-afaea1d3d1af',
    '1607532941433-304659e8198a'
  ],
  pates: [
    '1563379091339-03b21ab4a4f8',
    '1612874742237-6526221588e3',
    '1551183053-bf91a1d81141',
    '1621961404018-227e8d64d929'
  ],
  boissons_chaudes: [
    '1541167760496-1628856ab772',
    '1497515114629-f71d768fd07c',
    '1514432324607-a09d9b4aefdd',
    '1507133750040-4a8f57021571'
  ],
  jus_cocktails: [
    '1600271886742-f049cd451bba',
    '1613478223719-2ab802602423',
    '1556881286-fc6915169721',
    '1497534446932-c925b458314e'
  ],
  desserts: [
    '1551024601-bec78aea704b',
    '1587314168485-3236d6710814',
    '1563729784474-d77dbb933a9e',
    '1551806235-a05be94103b8'
  ]
};

const categoryCounters: Record<string, number> = {};

menuItems.forEach((item) => {
  const cat = item.category;
  if (!categoryCounters[cat]) {
    categoryCounters[cat] = 0;
  }
  const images = categoryImages[cat];
  if (images && images.length > 0) {
    const imgIndex = categoryCounters[cat] % images.length;
    item.image = `https://images.unsplash.com/photo-${images[imgIndex]}?w=400&q=80`;
    categoryCounters[cat]++;
  }
});

// Explicitly override image for the focused element (first product card - L'Express)
const expressItem = menuItems.find(item => item.id === 'b-express');
if (expressItem) {
  expressItem.image = 'https://i.ibb.co/7JpJ39Yv/Chat-GPT-Image-20-jul-2026-23-34-51.webp';
}

// Explicitly override image for the focused element (second product card - Continental)
const continentalItem = menuItems.find(item => item.id === 'b-continental');
if (continentalItem) {
  continentalItem.image = 'https://i.ibb.co/3yph5k1S/Chat-GPT-Image-20-jul-2026-23-41-02.webp';
}

// Explicitly override image for the focused element (third product card - Dom's Breakfast)
const domsItem = menuItems.find(item => item.id === 'b-doms');
if (domsItem) {
  domsItem.image = 'https://i.ibb.co/nMDDBg6x/Chat-GPT-Image-20-jul-2026-23-45-00.webp';
}

// Explicitly override image for the focused element (fourth product card - Jebli)
const jebliItem = menuItems.find(item => item.id === 'b-jebli');
if (jebliItem) {
  jebliItem.image = 'https://i.ibb.co/4wf1bB53/Chat-GPT-Image-20-jul-2026-23-55-18.webp';
}

// Explicitly override image for the focused element (fifth product card - Chamalli)
const chamalliItem = menuItems.find(item => item.id === 'b-chamalli');
if (chamalliItem) {
  chamalliItem.image = 'https://i.ibb.co/whP1MST2/Chat-GPT-Image-20-jul-2026-23-59-25.webp';
}

// Explicitly override image for the focused element (sixth product card - Plain Omelette)
const oNatureItem = menuItems.find(item => item.id === 'o-nature');
if (oNatureItem) {
  oNatureItem.image = 'https://i.ibb.co/QvWLxbtN/Chat-GPT-Image-21-jul-2026-00-04-19.webp';
}

// Explicitly override image for the focused element (seventh product card - Cheese Omelette)
const oFromageItem = menuItems.find(item => item.id === 'o-fromage');
if (oFromageItem) {
  oFromageItem.image = 'https://i.ibb.co/QvWLxbtN/Chat-GPT-Image-21-jul-2026-00-04-19.webp';
}

// Explicitly override image for the focused element (eighth product card - Mushroom Omelette)
const oChampignonsItem = menuItems.find(item => item.id === 'o-champignons');
if (oChampignonsItem) {
  oChampignonsItem.image = 'https://i.ibb.co/Z6fjmcSW/Chat-GPT-Image-21-jul-2026-00-07-31.webp';
}

// Explicitly override image for the focused element (ninth product card - Cold Cuts Omelette)
const oCharcuterieItem = menuItems.find(item => item.id === 'o-charcuterie');
if (oCharcuterieItem) {
  oCharcuterieItem.image = 'https://i.ibb.co/dFBCDfg/Chat-GPT-Image-21-jul-2026-00-10-15.webp';
}

// Explicitly override image for the focused element (tenth product card - Cheese & Cold Cuts Omelette)
const oCharcFromageItem = menuItems.find(item => item.id === 'o-charc-fromage');
if (oCharcFromageItem) {
  oCharcFromageItem.image = 'https://i.ibb.co/dFBCDfg/Chat-GPT-Image-21-jul-2026-00-10-15.webp';
}

// Explicitly override image for the focused element (eleventh product card - Khlii with Eggs)
const oKhliiItem = menuItems.find(item => item.id === 'o-khlii');
if (oKhliiItem) {
  oKhliiItem.image = 'https://i.ibb.co/nMT3yQLh/Chat-GPT-Image-21-jul-2026-00-13-56.webp';
}

// Explicitly override image for the focused element (twelfth product card - Cheese Toast)
const tFromageItem = menuItems.find(item => item.id === 't-fromage');
if (tFromageItem) {
  tFromageItem.image = 'https://i.ibb.co/qMH1ZFx6/Chat-GPT-Image-21-jul-2026-00-15-15.webp';
}

// Explicitly override image for the focused element (thirteenth product card - Croque Monsieur)
const tCroqueItem = menuItems.find(item => item.id === 't-croque');
if (tCroqueItem) {
  tCroqueItem.image = 'https://i.ibb.co/RTqQTn9t/Chat-GPT-Image-21-jul-2026-00-18-17.webp';
}

// Explicitly override image for the focused element (fourteenth product card - Toast Charcuterie & Fromage)
const tCharcFromageItem = menuItems.find(item => item.id === 't-charc-fromage');
if (tCharcFromageItem) {
  tCharcFromageItem.image = 'https://i.ibb.co/sh7mGB4/Chat-GPT-Image-21-jul-2026-00-20-59.webp';
}

// Explicitly override image for the focused element (fifteenth product card - Toast Œufs Charcuterie Fromage)
const tOeufCharcFromageItem = menuItems.find(item => item.id === 't-oeuf-charc-fromage');
if (tOeufCharcFromageItem) {
  tOeufCharcFromageItem.image = 'https://i.ibb.co/q3Rd0KtG/Chat-GPT-Image-21-jul-2026-00-27-49.webp';
}

// Explicitly override image for the focused element (sixteenth product card - Pain au chocolat)
const vChocolatItem = menuItems.find(item => item.id === 'v-chocolat');
if (vChocolatItem) {
  vChocolatItem.image = 'https://i.ibb.co/xttpqvpt/Chat-GPT-Image-21-jul-2026-00-30-18.webp';
}

// Explicitly override image for the focused element (seventeenth product card - Pain aux raisins)
const vRaisinsItem = menuItems.find(item => item.id === 'v-raisins');
if (vRaisinsItem) {
  vRaisinsItem.image = 'https://i.ibb.co/KpRkhsgD/Chat-GPT-Image-21-jul-2026-00-32-45.webp';
}

// Explicitly override image for the focused element (eighteenth product card - Croissant)
const vCroissantItem = menuItems.find(item => item.id === 'v-croissant');
if (vCroissantItem) {
  vCroissantItem.image = 'https://i.ibb.co/m5FYmwgg/Chat-GPT-Image-21-jul-2026-00-37-11.webp';
}

// Explicitly override image for the focused element (nineteenth product card - Pain suisse)
const vSuisseItem = menuItems.find(item => item.id === 'v-suisse');
if (vSuisseItem) {
  vSuisseItem.image = 'https://i.ibb.co/WpsWRLCw/Chat-GPT-Image-21-jul-2026-00-42-42.webp';
}

// Explicitly override image for the focused element (twentieth product card - Crêpe Miel)
const csMielItem = menuItems.find(item => item.id === 'cs-miel');
if (csMielItem) {
  csMielItem.image = 'https://i.ibb.co/VcvCBMR0/Chat-GPT-Image-21-jul-2026-00-45-03.webp';
}

// Explicitly override image for the focused element (twenty-first product card - Crêpe Confiture)
const csConfitureItem = menuItems.find(item => item.id === 'cs-confiture');
if (csConfitureItem) {
  csConfitureItem.image = 'https://i.ibb.co/bjgXc29M/Chat-GPT-Image-21-jul-2026-00-48-19-1.webp';
}

// Explicitly override image for the focused element (twenty-second product card - Crêpe Nutella)
const csNutellaItem = menuItems.find(item => item.id === 'cs-nutella');
if (csNutellaItem) {
  csNutellaItem.image = 'https://i.ibb.co/8LstVF4J/Chat-GPT-Image-21-jul-2026-00-50-06.webp';
}

// Explicitly override image for the focused element (twenty-third product card - Crêpe Banane Nutella)
const csBananeNutellaItem = menuItems.find(item => item.id === 'cs-banane-nutella');
if (csBananeNutellaItem) {
  csBananeNutellaItem.image = 'https://i.ibb.co/qMHXfSvr/Chat-GPT-Image-21-jul-2026-00-52-33.webp';
}

// Explicitly override image for the focused element (twenty-fourth product card - Crêpe Nutella Noix)
const csNutellaNoixItem = menuItems.find(item => item.id === 'cs-nutella-noix');
if (csNutellaNoixItem) {
  csNutellaNoixItem.image = 'https://i.ibb.co/jkStM1DW/Chat-GPT-Image-21-jul-2026-00-56-11.webp';
}

// Explicitly override image for the focused element (twenty-fifth product card - Crêpe Salée 3 fromages)
const cl3fromagesItem = menuItems.find(item => item.id === 'cl-3fromages');
if (cl3fromagesItem) {
  cl3fromagesItem.image = 'https://i.ibb.co/Ndq63v1x/Chat-GPT-Image-21-jul-2026-00-59-01.webp';
}

// Explicitly override image for the focused element (twenty-sixth product card - Crêpe Salée Charcuterie)
const clCharcuterieItem = menuItems.find(item => item.id === 'cl-charcuterie');
if (clCharcuterieItem) {
  clCharcuterieItem.image = 'https://i.ibb.co/KzfdtDb5/Chat-GPT-Image-21-jul-2026-01-00-35.webp';
}

// Explicitly override image for the focused element (twenty-seventh product card - Crêpe Salée Poulet)
const clPouletItem = menuItems.find(item => item.id === 'cl-poulet');
if (clPouletItem) {
  clPouletItem.image = 'https://i.ibb.co/C3G6wPPk/Chat-GPT-Image-21-jul-2026-01-03-08.webp';
}

// Explicitly override image for the focused element (twenty-eighth product card - Crêpe Salée Viande Hachée)
const clViandeItem = menuItems.find(item => item.id === 'cl-viande');
if (clViandeItem) {
  clViandeItem.image = 'https://i.ibb.co/kVm5jc05/Chat-GPT-Image-21-jul-2026-01-04-47.webp';
}

// Explicitly override image for the focused element (third product card - Dom's Breakfast)
const bDomsItem = menuItems.find(item => item.id === 'b-doms');
if (bDomsItem) {
  bDomsItem.image = 'https://i.ibb.co/XZcDMxZh/Chat-GPT-Image-21-jul-2026-11-49-42.webp';
}

// Explicitly override image for the focused element (second product card - Continental Breakfast)
const bContinentalItem = menuItems.find(item => item.id === 'b-continental');
if (bContinentalItem) {
  bContinentalItem.image = 'https://i.ibb.co/d0mdvdN9/Chat-GPT-Image-21-jul-2026-11-38-10.webp';
}

// Explicitly override image for Pizza Margherita Superiore
const pMargheritaSuperioreItem = menuItems.find(item => item.id === 'p-margherita-superiore');
if (pMargheritaSuperioreItem) {
  pMargheritaSuperioreItem.image = '/pizzas/margherita-superiore.webp';
}

// Explicitly override image for Pizza Manzo Ricco
const pManzoRiccoItem = menuItems.find(item => item.id === 'p-manzo-ricco');
if (pManzoRiccoItem) {
  pManzoRiccoItem.image = '/pizzas/manzo-ricco.webp';
}

// Explicitly override image for Pizza Tuna Riviera
const pTunaRivieraItem = menuItems.find(item => item.id === 'p-tuna-riviera');
if (pTunaRivieraItem) {
  pTunaRivieraItem.image = '/pizzas/tuna-riviera.webp';
}

// Explicitly override image for Pizza Poulet Chermoula
const pPouletChermoulaItem = menuItems.find(item => item.id === 'p-poulet-chermoula');
if (pPouletChermoulaItem) {
  pPouletChermoulaItem.image = '/pizzas/poulet-chermoula.webp';
}

// Explicitly override image for Pizza Merguez Piquante
const pMerguezPiquanteItem = menuItems.find(item => item.id === 'p-merguez-piquante');
if (pMerguezPiquanteItem) {
  pMerguezPiquanteItem.image = '/pizzas/merguez-piquante.webp';
}

// Explicitly override image for Pizza El Reto
const pElRetoItem = menuItems.find(item => item.id === 'p-el-reto');
if (pElRetoItem) {
  pElRetoItem.image = '/pizzas/el-reto.webp';
}

// Explicitly override image for Pizza Quattro Formaggi Nobile
const pQuattroFormaggiItem = menuItems.find(item => item.id === 'p-quattro-formaggi');
if (pQuattroFormaggiItem) {
  pQuattroFormaggiItem.image = '/pizzas/quattro-formaggi.webp';
}

// Explicitly override image for Pizza Signature Rabat Nights
const pRabatNightsItem = menuItems.find(item => item.id === 'p-rabat-nights');
if (pRabatNightsItem) {
  pRabatNightsItem.image = '/pizzas/rabat-nights.webp';
}

// Explicitly override image for Sandwich Thon
const sThonItem = menuItems.find(item => item.id === 's-thon');
if (sThonItem) {
  sThonItem.image = 'https://i.ibb.co/ycH8QPyn/Chat-GPT-Image-21-jul-2026-12-51-08.webp';
}

// Explicitly override image for Tacos Poulet
const tcPouletItem = menuItems.find(item => item.id === 'tc-poulet');
if (tcPouletItem) {
  tcPouletItem.image = 'https://i.ibb.co/VpNFvNYx/Chat-GPT-Image-21-jul-2026-15-47-08.webp';
}

// Explicitly override image for Sandwich Dom's
const sDomsItem = menuItems.find(item => item.id === 's-doms');
if (sDomsItem) {
  sDomsItem.image = 'https://i.ibb.co/CrLMWcw/Chat-GPT-Image-21-jul-2026-12-57-14.webp';
}

// Explicitly override image for Tacos Viande Hachée
const tcViandeItem = menuItems.find(item => item.id === 'tc-viande');
if (tcViandeItem) {
  tcViandeItem.image = 'https://i.ibb.co/qYkyS392/Chat-GPT-Image-21-jul-2026-15-52-46.webp';
}

// Explicitly override image for Sandwich Poulet
const sPouletItem = menuItems.find(item => item.id === 's-poulet');
if (sPouletItem) {
  sPouletItem.image = 'https://i.ibb.co/Y4GB2y90/Chat-GPT-Image-21-jul-2026-14-54-50.webp';
}

// Explicitly override image for Sandwich Kefta
const sKeftaItem = menuItems.find(item => item.id === 's-kefta');
if (sKeftaItem) {
  sKeftaItem.image = 'https://i.ibb.co/TxS979yB/Chat-GPT-Image-21-jul-2026-15-23-54.webp';
}

// Explicitly override image for Sandwich Formule menu
const sFormuleItem = menuItems.find(item => item.id === 's-formule');
if (sFormuleItem) {
  sFormuleItem.image = 'https://i.ibb.co/5gRDqp7H/Chat-GPT-Image-21-jul-2026-15-37-37.webp';
}

// Explicitly override image for Tacos Nuggets
const tcNuggetsItem = menuItems.find(item => item.id === 'tc-nuggets');
if (tcNuggetsItem) {
  tcNuggetsItem.image = 'https://i.ibb.co/N2MRFXfJ/Chat-GPT-Image-21-jul-2026-15-56-02.webp';
}

// Explicitly override image for Tacos Cordon Bleu
const tcCordonItem = menuItems.find(item => item.id === 'tc-cordon');
if (tcCordonItem) {
  tcCordonItem.image = 'https://i.ibb.co/TCgyhmC/Chat-GPT-Image-21-jul-2026-15-59-02.webp';
}

// Explicitly override image for Tacos Formule menu
const tcFormuleItem = menuItems.find(item => item.id === 'tc-formule');
if (tcFormuleItem) {
  tcFormuleItem.image = 'https://i.ibb.co/9mszh048/Chat-GPT-Image-21-jul-2026-16-01-08.webp';
}

// Explicitly override image for all Pasticcie category dishes
menuItems.forEach(item => {
  if (item.category === 'pasticcie') {
    item.image = 'https://i.ibb.co/hFHD7mdN/Chat-GPT-Image-21-jul-2026-16-05-34.webp';
  }
});

// Explicitly override image for Chicken Burger
const bgChickenItem = menuItems.find(item => item.id === 'bg-chicken');
if (bgChickenItem) {
  bgChickenItem.image = 'https://i.ibb.co/JwpqsmFm/Chat-GPT-Image-21-jul-2026-16-09-40.webp';
}

// Explicitly override image for Beef Burger
const bgBeefItem = menuItems.find(item => item.id === 'bg-beef');
if (bgBeefItem) {
  bgBeefItem.image = 'https://i.ibb.co/5WVxdKk5/Chat-GPT-Image-21-jul-2026-16-12-30.webp';
}

// Explicitly override image for Eggs Burger
const bgEggsItem = menuItems.find(item => item.id === 'bg-eggs');
if (bgEggsItem) {
  bgEggsItem.image = 'https://i.ibb.co/ymLTSn5G/Chat-GPT-Image-21-jul-2026-16-14-46.webp';
}

// Explicitly override image for Double Cheese Burger to match Beef Burger
const bgCheeseItem = menuItems.find(item => item.id === 'bg-cheese');
if (bgCheeseItem) {
  bgCheeseItem.image = 'https://i.ibb.co/5WVxdKk5/Chat-GPT-Image-21-jul-2026-16-12-30.webp';
}

// Explicitly override image for Marocaine Salad
const slMarocaineItem = menuItems.find(item => item.id === 'sl-marocaine');
if (slMarocaineItem) {
  slMarocaineItem.image = 'https://i.ibb.co/s9zYP80J/Chat-GPT-Image-21-jul-2026-16-25-41.webp';
}

// Explicitly override image for Niçoise Salad
const slNicoiseItem = menuItems.find(item => item.id === 'sl-nicoise');
if (slNicoiseItem) {
  slNicoiseItem.image = 'https://i.ibb.co/JjRXmkyd/Chat-GPT-Image-21-jul-2026-16-36-48.webp';
}

// Explicitly override image for Dom's Salad
const slDomsItem = menuItems.find(item => item.id === 'sl-doms');
if (slDomsItem) {
  slDomsItem.image = 'https://i.ibb.co/4RcBF8fy/Chat-GPT-Image-21-jul-2026-16-42-01.webp';
}

// Explicitly override image for Rio Salad
const slRioItem = menuItems.find(item => item.id === 'sl-rio');
if (slRioItem) {
  slRioItem.image = 'https://i.ibb.co/tMLmyxdT/Chat-GPT-Image-21-jul-2026-16-46-45.webp';
}

// Explicitly override image for Fisherman Salad
const slFishermanItem = menuItems.find(item => item.id === 'sl-fisherman');
if (slFishermanItem) {
  slFishermanItem.image = 'https://i.ibb.co/5g0xxmfB/Chat-GPT-Image-21-jul-2026-16-50-17.webp';
}

// Explicitly override image for Chicken Pasta
const ptPouletItem = menuItems.find(item => item.id === 'pt-poulet');
if (ptPouletItem) {
  ptPouletItem.image = 'https://i.ibb.co/HD4zG20v/Chat-GPT-Image-21-jul-2026-16-53-19.webp';
}

// Explicitly override image for Bolognaise Pasta
const ptBolognaiseItem = menuItems.find(item => item.id === 'pt-bolognaise');
if (ptBolognaiseItem) {
  ptBolognaiseItem.image = 'https://i.ibb.co/60r28V4J/Chat-GPT-Image-21-jul-2026-16-56-48.webp';
}

// Explicitly override image for Carbonara Pasta
const ptCarbonaraItem = menuItems.find(item => item.id === 'pt-carbonara');
if (ptCarbonaraItem) {
  ptCarbonaraItem.image = 'https://i.ibb.co/My1TZkS7/Chat-GPT-Image-21-jul-2026-17-01-30.webp';
}

// Explicitly override image for Fisherman Pasta
const ptFishermanItem = menuItems.find(item => item.id === 'pt-fisherman');
if (ptFishermanItem) {
  ptFishermanItem.image = 'https://i.ibb.co/RGsz10MJ/Chat-GPT-Image-21-jul-2026-17-05-46.webp';
}

// Explicitly override image for Sliced Chicken Pasta (Émincé Poulet)
const ptEmincePouletItem = menuItems.find(item => item.id === 'pt-emince-poulet');
if (ptEmincePouletItem) {
  ptEmincePouletItem.image = 'https://i.ibb.co/chMyfFMm/Chat-GPT-Image-21-jul-2026-17-11-14.webp';
}

// Explicitly override image for Lait chaud (previously Lait froid)
const bcLaitFroidItem = menuItems.find(item => item.id === 'bc-lait-froid');
if (bcLaitFroidItem) {
  bcLaitFroidItem.image = 'https://i.ibb.co/N62MV5St/Chat-GPT-Image-21-jul-2026-17-18-06.webp';
}

// Explicitly override image for Lait chaud (standard item)
const bcLaitChaudItem = menuItems.find(item => item.id === 'bc-lait-chaud');
if (bcLaitChaudItem) {
  bcLaitChaudItem.image = 'https://i.ibb.co/N62MV5St/Chat-GPT-Image-21-jul-2026-17-18-06.webp';
}

// Explicitly override image for Creme Caramel
const dsCremeCaramelItem = menuItems.find(item => item.id === 'ds-creme-caramel');
if (dsCremeCaramelItem) {
  dsCremeCaramelItem.image = 'https://i.ibb.co/Sw0wPj0C/Chat-GPT-Image-21-jul-2026-17-41-44.webp';
}

// Explicitly override image for Tarte du jour
const dsTarteItem = menuItems.find(item => item.id === 'ds-tarte');
if (dsTarteItem) {
  dsTarteItem.image = 'https://i.ibb.co/KjCzxq9R/Chat-GPT-Image-21-jul-2026-17-44-51.webp';
}

// Explicitly override image for Pâtisserie du jour
const dsPatisserieItem = menuItems.find(item => item.id === 'ds-patisserie');
if (dsPatisserieItem) {
  dsPatisserieItem.image = 'https://i.ibb.co/cc8ct52X/Chat-GPT-Image-21-jul-2026-17-49-14.webp';
}

// Explicitly override image for coffee-based hot drinks
const coffeeIds = [
  'bc-cafe-noir',
  'bc-cafe-americain',
  'bc-cafe-lait',
  'bc-nespresso',
  'bc-double-expresso',
  'bc-cappuccino',
  'bc-frappuccino',
  'bc-mocaccino'
];
menuItems.forEach(item => {
  if (coffeeIds.includes(item.id)) {
    item.image = 'https://i.ibb.co/BVWdp48y/Chat-GPT-Image-21-jul-2026-17-24-34.webp';
  }
});

// Explicitly override image for tea-based hot drinks (The, Verveine)
const teaIds = [
  'bc-the-menthe',
  'bc-verveine',
  'bc-the-noir',
  'bc-the-aromatise'
];
menuItems.forEach(item => {
  if (teaIds.includes(item.id)) {
    item.image = 'https://i.ibb.co/39PQDS2z/Chat-GPT-Image-21-jul-2026-17-29-25.webp';
  }
});

// Explicitly override image for chocolate-based hot drinks (Chocolat chaud, Chocolat chaud à l'ancienne)
const chocolateIds = [
  'bc-chocolat',
  'bc-chocolat-ancienne'
];
menuItems.forEach(item => {
  if (chocolateIds.includes(item.id)) {
    item.image = 'https://i.ibb.co/Rp1KJ9tG/Chat-GPT-Image-21-jul-2026-17-32-42.webp';
  }
});

// Explicitly override image for all items in the "jus & cocktails" category
menuItems.forEach(item => {
  if (item.category === 'jus_cocktails' && (!item.image || item.image === '')) {
    item.image = 'https://i.ibb.co/chFSk7Wk/Chat-GPT-Image-21-jul-2026-17-38-21.webp';
  }
});






