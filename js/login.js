import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Si ya hay una sesión activa (por ejemplo, la pestaña se recargó),
// saltamos directo al dashboard en vez de mostrar el formulario.
onAuthStateChanged(auth, (user) => {
  if (user) location.href = "index.html";
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("input-email").value.trim();
  const password = document.getElementById("input-password").value;
  const errorEl = document.getElementById("error-login");
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    location.href = "index.html";
  } catch (err) {
    errorEl.textContent = "Correo o contraseña incorrectos.";
  }
});
