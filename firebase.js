// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC72_HNKM4yo4mwo1MS2zrBeSWsM1L2o9A",
  authDomain: "desaciasihan-abd24.firebaseapp.com",
  projectId: "desaciasihan-abd24",

  // ✅ INI YANG DIGANTI
  storageBucket: "desaciasihan-abd24.appspot.com",

  messagingSenderId: "135436911000",
  appId: "1:135436911000:web:5b8a3824353d79d69d6bed",
  measurementId: "G-51JPJ8TSJV"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
