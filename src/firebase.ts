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
}

export const createFirestoreOrder = async (
  tableNumber: string,
  items: FirestoreOrderItem[]
): Promise<void> => {
  try {
    const ordersRef = collection(db, "orders");
    await addDoc(ordersRef, {
      tableNumber: tableNumber || "?",
      items,
      createdAt: serverTimestamp(),
      status: "new"
    });
  } catch (error) {
    console.warn("Firestore order creation failed:", error);
  }
};
