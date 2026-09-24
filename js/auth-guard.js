import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  // Ya confirmamos que hay sesión: mostramos el contenido
  // (el <body> arranca oculto para que no se vea nada antes de este chequeo).
  document.body.style.visibility = "visible";
});

document.querySelectorAll(".boton-logout").forEach(boton => {
  boton.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    location.href = "login.html";
  });
});
