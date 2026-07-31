import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

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

export const createFirestoreOrder = async (
  tableNumber: string,
  items: FirestoreOrderItem[],
  _totalAmount?: number
): Promise<void> => {
  try {
    // Process items ensuring unitPrice and lineTotal are valid numbers derived directly from item price data
    const sanitizedItems = items.map(item => {
      const unitPrice = Number(item.unitPrice) || 0;
      const quantity = Number(item.quantity) || 1;
      const lineTotal = unitPrice * quantity;
      return {
        name: item.name,
        quantity,
        note: item.note || '',
        unitPrice,
        lineTotal
      };
    });

    // Calculate order total strictly as the sum of line totals (unitPrice * quantity)
    const orderTotal = sanitizedItems.reduce((sum, item) => sum + item.lineTotal, 0);

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
