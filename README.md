# Control de Ventas Temu

App web para llevar el registro de pedidos, clientes y el fondo del negocio
familiar de reventa por Temu. Sin backend propio: es un sitio estático
(HTML/CSS/JS) que se conecta directo a Firestore y Firebase Authentication
desde el navegador.

## Estado actual

- ✅ Conexión a Firebase configurada (`js/firebase-config.js`), incluyendo
  Authentication
- ✅ Funciones de datos listas (`js/db.js`): clientes, pedidos, detalle de
  pedido, cierre de pedido con cálculo de ganancia, movimientos del fondo
- ✅ Dashboard, Pedidos, Clientes y Fondo funcionando por completo
- ✅ Login (`login.html`) con correo y contraseña, y las páginas
  protegidas: si no hay sesión iniciada, redirigen solas a `login.html`
- ✅ Ficha del cliente (`cliente.html`, se entra dando clic al nombre
  en la lista de Clientes): historial de compras agrupado por pedido,
  total pendiente, y botón para generar un recibo en PDF por pedido
  (usa la librería jsPDF por CDN, no requiere backend)

## Activar el login (pendiente de hacer una vez en la consola de Firebase)

1. **Firebase Console → Authentication → Comenzar** (si es la primera vez
   que se usa Authentication en este proyecto).
2. Pestaña **Sign-in method** → habilita el proveedor **Correo
   electrónico/contraseña**.
3. Pestaña **Users** → **Add user** → crea una cuenta para ti (tu correo +
   una contraseña) y otra para tu hermana, si cada quien va a tener su
   propio acceso. No hay pantalla de registro público en la app a propósito
   — las cuentas solo se crean desde aquí, en la consola.
4. Prueba entrar en `login.html` con ese correo y contraseña.

## Reglas de seguridad de Firestore

Ve a **Firestore Database → Reglas** en la consola de Firebase y reemplaza
las reglas de prueba por estas, que solo permiten leer o escribir si hay
una sesión iniciada:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Dale clic a **Publicar**. Con esto, aunque alguien encuentre el link de tu
app o el `firebaseConfig` (que siempre es público), no puede leer ni
modificar nada sin iniciar sesión con una de las cuentas que creaste.

## Publicar en GitHub Pages

1. Sube esta carpeta a un repositorio en GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Source** → selecciona la rama
   `main` y la carpeta `/ (root)`.
3. GitHub te da un enlace tipo `https://tuusuario.github.io/nombre-repo/`.

## Estructura del proyecto

```
control-ventas-temu/
├── login.html             Iniciar sesión
├── index.html              Dashboard (resumen del fondo)
├── pedidos.html             Pedidos
├── clientes.html             Clientes
├── cliente.html                Ficha de un cliente + recibo PDF
├── fondo.html                    Fondo
├── css/
│   └── styles.css      Sistema de diseño (colores, tipografía, layout)
└── js/
    ├── firebase-config.js   Conexión a Firebase (Firestore + Auth)
    ├── auth-guard.js        Protege las páginas y maneja "Cerrar sesión"
    ├── login.js              Lógica de login.html
    ├── db.js                Funciones de lectura/escritura en Firestore
    ├── dashboard.js         Lógica del Dashboard
    ├── pedidos.js            Lógica de Pedidos
    ├── clientes.js            Lógica de Clientes
    ├── cliente.js              Lógica de la ficha del cliente + recibo PDF
    └── fondo.js                 Lógica de Fondo
```
