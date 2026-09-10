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
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
// Firestore -- gewone in-memory cache, GEEN persistentLocalCache meer.
//
// Stond hier eerder wel (IndexedDB-cache + persistentMultipleTabManager) om
// het kassascherm te laten doorwerken bij een korte internetstoring. Maar
// zodra de browser zijn IndexedDB-backing-store niet kan openen (gebeurt in
// de praktijk vaker dan je zou denken: kapotte/geblokkeerde site-data,
// corrupte profielmap, sommige extensies/kiosk-instellingen), gooit de
// Firestore-SDK (12.x) daarna een interne "Unexpected state (ID: b815)"
// assertion-crash die de hele app blokkeert -- geen orders meer lezen of
// schrijven, geen TV-slides meer opslaan, tot een refresh, waarna het meteen
// weer misgaat zolang IndexedDB in die browser stuk blijft. Dat woog niet op
// tegen het beetje offline-comfort dat de cache gaf, dus terug naar de
// simpele, altijd-werkende instelling.
export const db = getFirestore(app);

// Firebase Storage -- utilisé uniquement pour les photos des slides de
// l'écran TV (voir uploadTvSlideImage plus bas). Le reste de l'app (menu,
// commandes) ne stocke que du texte/des prix dans Firestore, pas de fichiers.
export const storage = getStorage(app);

// Redimensionne côté navigateur avant l'upload -- une photo de téléphone fait
// souvent 3 à 5 Mo à une résolution bien plus grande que ce qu'un écran de TV
// peut afficher, ce qui ralentirait inutilement le chargement sur la Smart TV
// (et l'upload lui-même sur un wifi de restaurant pas toujours rapide).
// 1920px de large est largement suffisant pour un écran plein cadre, même 4K
// (l'image est affichée en object-cover, pas en 1:1 pixel).
function resizeImageForTv(file: File, maxWidth = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire cette image"));
    };
    img.src = url;
  });
}

// Upload une photo de slide TV vers Storage et renvoie son URL publique de
// téléchargement, à stocker telle quelle dans le champ `imageUrl` du doc
// Firestore (tvSlides ne contient jamais le fichier lui-même, juste ce lien).
export async function uploadTvSlideImage(file: File): Promise<string> {
  const blob = await resizeImageForTv(file);
  const path = `tvSlides/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

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
  { id: 'desserts', name: { fr: "Desserts", en: "Desserts", ar: "حلويات" }, emoji: "🍰", displayOrder: 16 },
  // Snooker (billard) -- pas un plat, une prestation facturable à 30 MAD la
  // partie ; pas listé dans PosApp.tsx's CATEGORY_GROUPS donc elle tombe
  // automatiquement dans le groupe "Autres" du rail de catégories.
  { id: 'snooker', name: { fr: "Snooker", en: "Snooker", ar: "سنوكر" }, emoji: "🎱", displayOrder: 17 }
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
  note?: string,
  restaurantId: string = "doms-cafe"
): Promise<void> => {
  // Every order now reaches the restaurant exclusively through this
  // Firestore write -- the customer site no longer has a WhatsApp fallback,
  // so a failure here must surface to the caller (App.tsx shows an error and
  // lets the customer retry) instead of being swallowed silently, which
  // would previously look like a successful order that never arrived.
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
      lineTotal,
      // Without this, every order placed from the customer site landed in
      // the POS kitchen view's "Kitchen" bucket regardless of what it
      // actually was, since the field was computed by the caller but
      // dropped here before it reached Firestore.
      station: item.station || 'Kitchen',
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
    status: "new",
    source: "site",
    orderType: (tableNumber && tableNumber !== "?") ? "dine_in" : "delivery",
    paid: false,
    // Order-level "special request" note from the customer's cart (allergy,
    // no onion, etc.) -- kept separate from the per-item notes above since
    // the customer site's cart has no per-item note UI, just one note for
    // the whole order. Omitted entirely rather than an empty string so it
    // doesn't clutter every order doc with a blank field.
    ...(note && note.trim() ? { note: note.trim() } : {}),
  });
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
  itemsRemoved: number;
  categoriesMigrated: number;
  status: string;
}> => {
  try {
    const menuColl = collection(db, "menuItems");
    const catColl = collection(db, "categories");

    const menuSnap = await getDocs(menuColl);
    const catSnap = await getDocs(catColl);

    let itemsMigrated = 0;
    let itemsRemoved = 0;
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

    // Remove stale Firestore docs that no longer exist in data.ts (e.g. old
    // pizza names from an earlier menu that were never cleaned up -- the
    // live site reads menuItems from Firestore, not from data.ts directly,
    // so a discontinued item stays visible forever unless it's deleted here).
    const currentIds = new Set(menuItems.map(i => i.id));
    for (const d of menuSnap.docs) {
      const data = d.data();
      if ((data.restaurantId || "doms-cafe") === restaurantId && !currentIds.has(d.id)) {
        try {
          await deleteDoc(doc(db, "menuItems", d.id));
          itemsRemoved++;
        } catch (e) {
          console.log("Failed to delete stale menu item:", d.id, e);
        }
      }
    }

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
      itemsRemoved,
      categoriesMigrated,
      status: "success"
    };
  } catch (err) {
    console.error("Migration to Firestore failed:", err);
    return {
      itemsMigrated: 0,
      itemsRemoved: 0,
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
