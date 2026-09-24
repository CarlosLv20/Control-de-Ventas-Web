// Conexión a Firebase — Control de Ventas Online
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8eK0P4KgMw2r5PWtC1Bg6wl_EzJClCA4",
  authDomain: "control-ventas-temu.firebaseapp.com",
  projectId: "control-ventas-temu",
  storageBucket: "control-ventas-temu.firebasestorage.app",
  messagingSenderId: "348265744981",
  appId: "1:348265744981:web:6ca761fdf613ef405662dc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
