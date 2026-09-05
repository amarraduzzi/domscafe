import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc,
  getDocs, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { menuItems, MenuItem } from "./data";

// Web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyByqX1U0arK1rSfBjom6icws3QK6Ypo8GE",
  authDomain: "doms-cafe-b197d.firebaseapp.com",
  projectId: "doms-cafe-b197d",
  storageBucket: "doms-cafe-b197d.firebasestorage.app",
  messagingSenderId: "370381353453",
  appId: "1:370381353453:web:a50fcff47b7592bcc077e4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface RestaurantConfig {
  id: string;
  name: string;
  primaryColor: string;
  accentColor: string;
  whatsappNumber: string;
  defaultLanguage: 'fr' | 'en' | 'ar';
  pin: string;
  logo?: string;
  address?: string;
  tagline?: Record<'fr' | 'en' | 'ar', string>;
}

export const defaultDomsCafeConfig: RestaurantConfig = {
  id: "doms-cafe",
  name: "Dom's Café",
  primaryColor: "#A0783C",
  accentColor: "#26A69A",
  whatsappNumber: "212611053649",
  defaultLanguage: "fr",
  pin: "1234",
  address: "26 rue Jabal Alayachi, Agdal, Rabat",
  tagline: {
    fr: "Café & Restaurant",
    en: "Café & Restaurant",
    ar: "مقهى ومطعم"
  }
};

export function getRestaurantIdFromURL(): string {
  if (typeof window === 'undefined') return "doms-cafe";
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0) {
    const candidate = segments[0].toLowerCase().trim();
    if (!['assets', 'api', 'favicon.ico', 'index.html'].includes(candidate)) {
      return candidate;
    }
  }
  return "doms-cafe";
}

export function adjustHexBrightness(hex: string, percent: number): string {
  let num = parseInt(hex.replace('#', ''), 16);
  if (isNaN(num)) return hex;
  let amt = Math.round(2.55 * percent);
  let R = (num >> 16) + amt;
  let G = (num >> 8 & 0x00FF) + amt;
  let B = (num & 0x0000FF) + amt;
  R = Math.max(0, Math.min(255, R));
  G = Math.max(0, Math.min(255, G));
  B = Math.max(0, Math.min(255, B));
  return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

export function applyRestaurantTheme(config: RestaurantConfig) {
  if (typeof document === 'undefined') return;
  const primary = config.primaryColor || '#A0783C';
  const accent = config.accentColor || '#26A69A';

  const root = document.documentElement;
  root.style.setProperty('--color-brand-orange', primary);
  root.style.setProperty('--color-brand-orange-hover', adjustHexBrightness(primary, -15));
  root.style.setProperty('--color-brand-accent', accent);
}

export const subscribeToRestaurantConfig = (
  restaurantId: string,
  onUpdate: (config: RestaurantConfig | null) => void,
  onError?: (error: any) => void
) => {
  const restDocRef = doc(db, "restaurants", restaurantId);
  return onSnapshot(
    restDocRef,
    async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({
          id: docSnap.id,
          name: data.name || "Dom's Café",
          primaryColor: data.primaryColor || "#A0783C",
          accentColor: data.accentColor || "#26A69A",
          whatsappNumber: data.whatsappNumber || "212611053649",
          defaultLanguage: data.defaultLanguage || "fr",
          pin: data.pin || "1234",
          logo: data.logo || "",
          address: data.address || "",
          tagline: data.tagline
        });
      } else {
        if (restaurantId === "doms-cafe") {
          try {
            await setDoc(restDocRef, defaultDomsCafeConfig);
            onUpdate(defaultDomsCafeConfig);
          } catch (err) {
            console.warn("Failed to auto-seed doms-cafe config:", err);
            onUpdate(defaultDomsCafeConfig);
          }
        } else {
          onUpdate(null);
        }
      }
    },
    (err) => {
      console.warn(`Error subscribing to restaurant config (${restaurantId}):`, err);
      if (restaurantId === "doms-cafe") {
        onUpdate(defaultDomsCafeConfig);
      } else if (onError) {
        onError(err);
      } else {
        onUpdate(null);
      }
    }
  );
};

export interface FirestoreOrderItem {
  name: string;
  quantity: number;
  note: string;
  unitPrice: number;
  lineTotal: number;
}

export interface FirestoreCategory {
  id: string;
  name: Record<'en' | 'fr' | 'ar', string>;
  emoji: string;
  displayOrder: number;
}

export const initialCategories: FirestoreCategory[] = [
  { id: 'all', name: { fr: "Tout afficher", en: "Show All", ar: "الكل" }, emoji: "🍽️", displayOrder: 0 },
  // Pizzas moved to the first category slot (right after "Tout afficher")
  // at the client's explicit request — it's the site's flagship item and
  // should be the first thing people can filter to, ahead of drinks.
  { id: 'pizzas', name: { fr: "Pizzas", en: "Pizzas", ar: "بيتزا" }, emoji: "🍕", displayOrder: 1 },
  { id: 'boissons_chaudes', name: { fr: "Boissons Chaudes", en: "Hot Drinks", ar: "مشروبات ساخنة" }, emoji: "☕", displayOrder: 2 },
  { id: 'boissons_fraiches', name: { fr: "Boissons Fraîches", en: "Cold Drinks", ar: "مشروبات باردة" }, emoji: "🥤", displayOrder: 3 },
  { id: 'jus_cocktails', name: { fr: "Jus & Cocktails", en: "Cocktails & Juices", ar: "عصائر و كوكتيلات" }, emoji: "🍹", displayOrder: 4 },
  { id: 'breakfasts', name: { fr: "Petits-Déjeuners", en: "Breakfast", ar: "إفطار" }, emoji: "🍳", displayOrder: 5 },
  { id: 'omelettes', name: { fr: "Omelettes", en: "Omelettes", ar: "أومليت" }, emoji: "🥚", displayOrder: 5 },
  { id: 'toasts', name: { fr: "Toasts", en: "Toasts", ar: "توست" }, emoji: "🍞", displayOrder: 6 },
  { id: 'viennoiserie', name: { fr: "Viennoiseries", en: "Viennoiserie", ar: "معجنات" }, emoji: "🥐", displayOrder: 7 },
  { id: 'crepes_sucrees', name: { fr: "Crêpes Sucrées", en: "Sweet Crêpes", ar: "كريب حلو" }, emoji: "🥞", displayOrder: 8 },
  { id: 'crepes_salees', name: { fr: "Crêpes Salées", en: "Savory Crêpes", ar: "كريب مالح" }, emoji: "🌯", displayOrder: 9 },
  { id: 'sandwiches', name: { fr: "Sandwiches", en: "Sandwiches", ar: "ساندويتشات" }, emoji: "🥪", displayOrder: 10 },
  { id: 'tacos', name: { fr: "Tacos", en: "Tacos", ar: "تاكو" }, emoji: "🌮", displayOrder: 11 },
  { id: 'pasticcie', name: { fr: "Pasticcies", en: "Pasticcie", ar: "باستيشيو" }, emoji: "🍲", displayOrder: 12 },
  { id: 'burgers', name: { fr: "Burgers", en: "Burgers", ar: "برغر" }, emoji: "🍔", displayOrder: 13 },
  { id: 'salades', name: { fr: "Salades", en: "Salads", ar: "سلطات" }, emoji: "🥗", displayOrder: 14 },
  { id: 'pates', name: { fr: "Pâtes", en: "Pasta", ar: "باستا" }, emoji: "🍝", displayOrder: 15 },
  { id: 'desserts', name: { fr: "Desserts", en: "Desserts", ar: "حلويات" }, emoji: "🍰", displayOrder: 16 }
];

// Helper to remove undefined properties before saving to Firestore
function cleanUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object') {
    const cleanObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleanObj[key] = cleanUndefined(value);
      }
    }
    return cleanObj;
  }
  return obj;
}

export const createFirestoreOrder = async (
  tableNumber: string,
  items: any[],
  totalAmount?: number,
  restaurantId: string = "doms-cafe"
): Promise<void> => {
  try {
    const sanitizedItems = items.map(item => {
      const unitPrice = Number(
        item.unitPrice ?? 
        item.price ?? 
        item.pricePerItem ?? 
        item.menuItem?.price
      ) || 0;
      const quantity = Number(item.quantity) || 1;
      const lineTotal = Number(item.lineTotal) || (unitPrice * quantity);
      return {
        name: item.name || item.menuItem?.name?.fr || item.menuItem?.name?.en || 'Article',
        quantity,
        note: item.note || '',
        unitPrice,
        lineTotal
      };
    });

    const calculatedTotal = sanitizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const orderTotal = (typeof totalAmount === 'number' && totalAmount > 0) ? totalAmount : calculatedTotal;

    const ordersRef = collection(db, "orders");
    await addDoc(ordersRef, {
      restaurantId,
      tableNumber: tableNumber || "?",
      items: sanitizedItems,
      total: orderTotal,
      createdAt: serverTimestamp(),
      status: "new"
    });
  } catch (error) {
    console.warn("Firestore order creation failed:", error);
  }
};

// Helper to save or update a single menu item to Firestore
export const saveOrUpdateMenuItemToFirestore = async (
  item: MenuItem,
  restaurantId: string = "doms-cafe"
): Promise<void> => {
  const itemWithMeta = {
    restaurantId,
    available: item.available ?? true,
    station: item.station || (['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches'].includes(item.category) ? 'Bar' : 'Kitchen'),
    ...item
  };
  const cleaned = cleanUndefined(itemWithMeta);
  await setDoc(doc(db, "menuItems", item.id), cleaned, { merge: true });
};

// One-time migration function to seed menuItems and categories to Firestore
export const migrateMenuDataToFirestore = async (
  restaurantId: string = "doms-cafe",
  force = false
): Promise<{
  itemsMigrated: number;
  categoriesMigrated: number;
  status: string;
}> => {
  try {
    const menuColl = collection(db, "menuItems");
    const catColl = collection(db, "categories");

    const menuSnap = await getDocs(menuColl);
    const catSnap = await getDocs(catColl);

    let itemsMigrated = 0;
    let categoriesMigrated = 0;

    // Remove legacy 'jc-soda' item from Firestore if present
    try {
      await deleteDoc(doc(db, "menuItems", "jc-soda"));
    } catch (e) {
      console.log("No legacy jc-soda doc to delete or error deleting:", e);
    }

    const existingMenuMap = new Set(
      menuSnap.docs
        .filter(d => (d.data().restaurantId || "doms-cafe") === restaurantId)
        .map(d => d.id)
    );
    const existingCatMap = new Set(
      catSnap.docs
        .filter(d => (d.data().restaurantId || "doms-cafe") === restaurantId)
        .map(d => d.id)
    );

    // Sync any missing or new menu items from data.ts to Firestore
    for (const item of menuItems) {
      if (force || !existingMenuMap.has(item.id) || item.id === 'bf-soda') {
        await saveOrUpdateMenuItemToFirestore(item, restaurantId);
        itemsMigrated++;
      }
    }

    // Ensure all initial categories (including new 'boissons_fraiches') exist in Firestore with updated displayOrder
    for (const cat of initialCategories) {
      const catWithMeta = {
        restaurantId,
        ...cat
      };
      const cleaned = cleanUndefined(catWithMeta);
      await setDoc(doc(db, "categories", cat.id), cleaned, { merge: true });
      if (!existingCatMap.has(cat.id)) {
        categoriesMigrated++;
      }
    }

    return {
      itemsMigrated,
      categoriesMigrated,
      status: "success"
    };
  } catch (err) {
    console.error("Migration to Firestore failed:", err);
    return {
      itemsMigrated: 0,
      categoriesMigrated: 0,
      status: `error: ${err}`
    };
  }
};

// Realtime listeners for menuItems and categories
export const subscribeToMenuItems = (
  restaurantId: string,
  onUpdate: (items: MenuItem[]) => void,
  onError?: (error: any) => void
) => {
  const menuColl = collection(db, "menuItems");
  return onSnapshot(
    menuColl,
    (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const items: MenuItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const itemRestId = data.restaurantId || "doms-cafe";
        if (itemRestId === restaurantId && docSnap.id !== 'jc-soda') {
          const item: MenuItem = {
            id: docSnap.id,
            name: data.name,
            category: data.category,
            price: data.price,
            description: data.description,
            image: data.image,
            spicy: data.spicy,
            popular: data.popular,
            available: data.available !== false,
            station: data.station || (['boissons_chaudes', 'jus_cocktails', 'boissons_fraiches'].includes(data.category) ? 'Bar' : 'Kitchen'),
            variants: data.variants
          };
          items.push(item);
        }
      });
      onUpdate(items);
    },
    (err) => {
      console.warn("Error subscribing to menuItems Firestore collection:", err);
      if (onError) onError(err);
    }
  );
};

export const subscribeToCategories = (
  restaurantId: string,
  onUpdate: (categories: FirestoreCategory[]) => void,
  onError?: (error: any) => void
) => {
  const catColl = collection(db, "categories");
  return onSnapshot(
    catColl,
    (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
        return;
      }
      const cats: FirestoreCategory[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const catRestId = data.restaurantId || "doms-cafe";
        if (catRestId === restaurantId) {
          cats.push({ id: docSnap.id, ...data } as FirestoreCategory);
        }
      });
      cats.sort((a, b) => a.displayOrder - b.displayOrder);
      onUpdate(cats);
    },
    (err) => {
      console.warn("Error subscribing to categories Firestore collection:", err);
      if (onError) onError(err);
    }
  );
};
