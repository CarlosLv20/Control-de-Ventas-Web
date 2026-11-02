# Control de Ventas Temu

App web para llevar el registro de pedidos, clientes y el fondo del negocio
familiar de reventa por Temu. Sin backend propio: es un sitio estático
(HTML/CSS/JS) que se conecta directo a Firestore y Firebase Authentication
desde el navegador. Se publica en GitHub Pages.

## Qué hace hoy

### Pedidos (`pedidos.html`)
- **Lista de pedidos** con su número y estado (abierto / cerrado, con la
  ganancia si ya se cerró). El número del pedido nuevo se propone solo.
- **Registrar productos**, con dos modos:
  - **Por cliente:** se escribe el cliente una sola vez (busca mientras
    escribes, sin importar acentos ni mayúsculas, y crea el cliente si no
    existe) y debajo varias filas de **producto · cantidad · precio
    unitario**. El total de cada fila se calcula solo. Con Enter se pasa
    de producto → cantidad → precio → fila nueva; **Ctrl + Enter** guarda
    todo de una vez. También sirve para **compras personales** (lo que se
    compra para uno mismo en el mismo pedido).
  - **Pegar lista:** una línea por producto con el formato
    `Cliente, Producto, Cantidad, Precio unitario` (la cantidad es
    opcional; si falta, vale 1). Acepta comas, punto y coma o columnas
    copiadas de Excel. Muestra un resumen antes de guardar y avisa qué
    línea tiene un error.
- **Tabla del pedido** con columnas **Cliente · Producto · Cant. ·
  P. unitario · Total · Estado · Editar · Eliminar**. Las filas van
  agrupadas por cliente, con un **subtotal** (unidades, total y cuánto
  debe) y, al final, el **total del pedido** y lo que falta por cobrar.
- **Estado de pago** con botón relleno: **Pendiente** (ámbar) o **Pagado**
  (verde). El cambio se ve al instante y se guarda por detrás; si falla
  la conexión, se deshace y aparece un aviso.
- **Editar** dentro de la misma fila (producto, cantidad y precio, con el
  total recalculándose). Enter guarda, Esc cancela.
- **Cerrar pedido:** se ingresa lo gastado en Temu, se calcula la ganancia
  y se suma automáticamente al Fondo. Un pedido cerrado ya no se edita.
- En **celular** la tabla se convierte en tarjetas: nombre del cliente
  arriba, sus productos (con el detalle `2 × $6.00`) y el subtotal abajo.

### Clientes (`clientes.html`) y ficha del cliente (`cliente.html`)
- **Tabla de clientes** con columnas **Cliente · Teléfono · Pedidos ·
  Total comprado · Debe · Editar · Eliminar**. Lo que se debe sale en
  ámbar; si no debe nada, "Al día" en verde. Al final, un pie con el
  número de clientes, cuántos tienen saldo pendiente, el total comprado
  y el total por cobrar.
- **Buscador** por nombre (sin importar acentos ni mayúsculas) o teléfono,
  y **orden** por nombre, más deuda o más comprado.
- **Alta, edición y eliminación al instante:** editar es dentro de la
  misma fila (Enter guarda, Esc cancela); no deja guardar un nombre vacío
  ni repetido; al eliminar avisa si el cliente aún debe. Si falla la
  conexión, el cambio se deshace y aparece un aviso.
- En **celular** cada cliente es una tarjeta: nombre y deuda arriba;
  teléfono, pedidos y total comprado abajo, con los botones a la derecha.
- Ficha de cada cliente (clic en su nombre): compras agrupadas por pedido,
  total comprado, total pendiente y **recibo en PDF** por pedido, con las
  columnas producto, cantidad, precio unitario y total (librería jsPDF
  por CDN).

### Resumen (`index.html`) y Fondo (`fondo.html`)
- Resumen: saldo del fondo, ganancia acumulada, pedidos abiertos, pagos
  pendientes y últimos movimientos.
- Fondo: saldo actual y movimientos (ganancia, gasto, retiro, aporte),
  con edición y eliminación.

### Acceso
- Login con correo y contraseña (`login.html`). Todas las páginas están
  protegidas: sin sesión, redirigen solas al login.

## Cómo se guardan los datos (Firestore)

```
clientes/{id}                 nombre, telefono
pedidos/{id}                  numero, fecha, estado, totales del cierre, resumen
pedidos/{id}/detalle/{id}     una línea (producto) del pedido
movimientosFondo/{id}         tipo, monto, nota, pedidoId, fecha
```

**Línea de un pedido** (`pedidos/{id}/detalle`):

| Campo | Venta a cliente | Compra personal |
|---|---|---|
| `producto`, `cantidad` | ✓ | ✓ |
| `precioUnitario` / `precioCobrado` (total) | ✓ | — |
| `costoUnitario` / `costoTemuPersonal` (total) | — | ✓ |
| `clienteId`, `clienteNombre`, `pagado` | ✓ | — |

- Se guardan **el precio unitario y el total** de cada línea. Los totales,
  la ganancia del cierre y el recibo usan el total, así que todo sigue
  funcionando igual que antes de agregar la cantidad.
- Las líneas registradas antes de existir la cantidad no la tienen: el
  sitio las trata como **cantidad 1**.

**Resumen de cada pedido** (`pedidos/{id}.resumen`): productos, unidades,
total cobrado, por cobrar, pagos pendientes, costo personal y, por
cliente, sus unidades, total y pendiente.

- Se actualiza en **la misma operación** que cada cambio de línea
  (agregar, editar, eliminar, marcar pago, cerrar), así que nunca queda
  distinto de las líneas.
- Resumen, Clientes y la ficha del cliente leen este resumen en lugar de
  abrir cada pedido. Con 30 pedidos de 80 productos, una pantalla pasó de
  ~2,400 lecturas a ~30–150.
- Los pedidos creados antes de este cambio se ponen al día solos la
  primera vez que se abre Resumen o Clientes. Si un resumen no coincide
  con sus líneas (por ejemplo, tras editar algo a mano en la consola de
  Firebase), se corrige al abrir ese pedido.

## Diseño

- Tema oscuro con la paleta azul:
  `#0466c8 · #0353a4 · #023e7d · #002855 · #001845 · #001233 · #33415c ·
  #5c677d · #7d8597 · #979dac`.
- Colores de estado: **ámbar** pendiente, **verde** pagado, **terracota**
  para lo que sale (gastos, compras personales, eliminar).
- **Identidad visual:** logo (bolsa con check + "Control de Ventas"),
  favicon e íconos de línea en `img/`. Los íconos salen de un solo archivo,
  `img/iconos.svg`, con la función `icono()` de `js/iconos.js`. Van en el
  menú, en los botones principales y en las acciones de la tabla; dónde
  usar cada uno está en `GUIA-LOGO-E-ICONOS.md`.
- Botones de acción rellenos: **azul** editar, **rojo** eliminar, **verde**
  guardar, **gris** cancelar (solo ícono, con `title` y `aria-label`).
- Todos los colores están definidos una sola vez en `:root` de
  `css/styles.css`; las reglas para celular solo cambian la distribución,
  nunca los colores. Si se ven distintos entre aparatos, es por la
  pantalla (modo de color, brillo), no por el sitio.
- Tipografías (Google Fonts): **Bricolage Grotesque** (títulos y nombres),
  **Figtree** (texto) y **DM Mono** (cifras, para que los montos queden
  alineados). Se cambian en un solo lugar: las variables `--font-*` de
  `:root` y el enlace de Google Fonts en el `<head>` de cada página.

## Plan de mejoras

### Tablas en todo el sitio
| Etapa | Qué | Estado |
|---|---|---|
| 1 | Pedido: cantidad + precio unitario, tabla con columnas de edición | ✅ Hecha |
| 2 | Resumen guardado en cada pedido (carga rápida) | ✅ Hecha |
| 3 | Tabla de Clientes: teléfono, pedidos, total comprado, debe, editar, eliminar | ✅ Hecha |
| 4 | Tabla de la lista de Pedidos (fecha, clientes, unidades, cobrado, por cobrar, ganancia) y tablas en Resumen | Pendiente |
| 5 | Tabla de movimientos en Fondo y compras en tabla en la ficha del cliente | Pendiente |

### Otras mejoras ya hechas
- ✅ Captura rápida por cliente y pegar lista.
- ✅ Cambios al instante (pago, editar, eliminar, agregar) sin recargar
  todo el pedido; solo se descarga el pedido abierto.
- ✅ Validaciones con mensajes en español y avisos cuando falla la conexión.
- ✅ Nombres y productos se muestran como texto (un `<` en un nombre ya no
  rompe la pantalla) en la tabla del pedido y la ficha del cliente.

### Pendientes
- **Cerrar pedido de forma segura:** guardar el cierre y la ganancia del
  Fondo en una sola operación, bloquear el botón mientras procesa, y
  quitar la ganancia del Fondo si se borra un pedido cerrado.
- **Herramientas para pedidos largos:** filtro "solo pendientes", buscador,
  grupos contraíbles y "marcar todo pagado" por cliente.
- **Mantenimiento:** una sola función compartida para formatear dinero,
  guardar montos en centavos y modo sin conexión de Firebase.

## Activar el login (una vez, en la consola de Firebase)

1. **Firebase Console → Authentication → Comenzar** (si es la primera vez
   que se usa Authentication en este proyecto).
2. Pestaña **Sign-in method** → habilita el proveedor **Correo
   electrónico/contraseña**.
3. Pestaña **Users** → **Add user** → crea una cuenta para cada persona
   que vaya a usar la app. No hay pantalla de registro público a
   propósito: las cuentas solo se crean desde la consola.
4. Prueba entrar en `login.html` con ese correo y contraseña.

## Reglas de seguridad de Firestore

En **Firestore Database → Reglas**, usa estas reglas, que solo permiten
leer o escribir con una sesión iniciada:

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

Dale clic a **Publicar**. Aunque alguien encuentre el link de la app o el
`firebaseConfig` (que siempre es público), no puede leer ni modificar nada
sin iniciar sesión. Estas reglas ya permiten guardar el resumen de cada
pedido; si algún día las restringes por campo, deja permitido actualizar
`resumen` en `pedidos/{id}`.

## Publicar en GitHub Pages

1. Sube esta carpeta a un repositorio en GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Source** → rama `main`, carpeta
   `/ (root)`.
3. GitHub da un enlace tipo `https://tuusuario.github.io/nombre-repo/`.

Para subir cambios:

```bash
git add .
git commit -m "Pantalla: qué cambió"
git push
```

## Estructura del proyecto

```
control-ventas-temu/
├── login.html            Iniciar sesión
├── index.html            Resumen (saldo, pendientes, movimientos)
├── pedidos.html          Lista de pedidos y detalle de un pedido
├── clientes.html         Clientes
├── cliente.html          Ficha de un cliente + recibo PDF
├── fondo.html            Fondo
├── GUIA-LOGO-E-ICONOS.md Cómo usar el logo, el favicon y los íconos
├── img/                  Logo, favicon, ícono de app e iconos.svg (sprite de íconos)
├── css/
│   └── styles.css        Colores, tipografía, tablas, tarjetas en celular
└── js/
    ├── firebase-config.js   Conexión a Firebase (Firestore + Auth)
    ├── auth-guard.js        Protege las páginas y maneja "Cerrar sesión"
    ├── iconos.js            icono(nombre): inserta un ícono del sprite
    ├── comun.js             Avisos, celdas de tabla y comparar nombres (compartido)
    ├── login.js             Lógica de login.html
    ├── db.js                Lectura/escritura en Firestore y resumen de pedidos
    ├── dashboard.js         Lógica del Resumen
    ├── pedidos.js           Captura, tabla, edición y cierre de pedidos
    ├── clientes.js          Tabla de clientes: buscar, ordenar, editar, eliminar
    ├── cliente.js           Ficha del cliente + recibo PDF
    └── fondo.js             Lógica de Fondo
```
