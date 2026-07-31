import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
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
  { id: 'boissons_chaudes', name: { fr: "Boissons Chaudes", en: "Hot Drinks", ar: "مشروبات ساخنة" }, emoji: "☕", displayOrder: 1 },
  { id: 'jus_cocktails', name: { fr: "Jus & Cocktails", en: "Cocktails & Juices", ar: "عصائر و كوكتيلات" }, emoji: "🍹", displayOrder: 2 },
  { id: 'breakfasts', name: { fr: "Petits-Déjeuners", en: "Breakfast", ar: "إفطار" }, emoji: "🍳", displayOrder: 3 },
  { id: 'omelettes', name: { fr: "Omelettes", en: "Omelettes", ar: "أومليت" }, emoji: "🥚", displayOrder: 4 },
  { id: 'toasts', name: { fr: "Toasts", en: "Toasts", ar: "توست" }, emoji: "🍞", displayOrder: 5 },
  { id: 'viennoiserie', name: { fr: "Viennoiseries", en: "Viennoiserie", ar: "معجنات" }, emoji: "🥐", displayOrder: 6 },
  { id: 'crepes_sucrees', name: { fr: "Crêpes Sucrées", en: "Sweet Crêpes", ar: "كريب حلو" }, emoji: "🥞", displayOrder: 7 },
  { id: 'crepes_salees', name: { fr: "Crêpes Salées", en: "Savory Crêpes", ar: "كريب مالح" }, emoji: "🌯", displayOrder: 8 },
  { id: 'pizzas', name: { fr: "Pizzas", en: "Pizzas", ar: "بيتزا" }, emoji: "🍕", displayOrder: 9 },
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
  totalAmount?: number
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

// One-time migration function to seed menuItems and categories to Firestore
export const migrateMenuDataToFirestore = async (force = false): Promise<{
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

    if (force || menuSnap.empty || menuSnap.size < menuItems.length) {
      for (const item of menuItems) {
        const itemWithAvailability = {
          available: item.available ?? true,
          ...item
        };
        const cleaned = cleanUndefined(itemWithAvailability);
        await setDoc(doc(db, "menuItems", item.id), cleaned);
        itemsMigrated++;
      }
    }

    if (force || catSnap.empty) {
      for (const cat of initialCategories) {
        const cleaned = cleanUndefined(cat);
        await setDoc(doc(db, "categories", cat.id), cleaned);
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
          variants: data.variants
        };
        items.push(item);
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
        cats.push({ id: docSnap.id, ...docSnap.data() } as FirestoreCategory);
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
