# Guía de logo e íconos — Control de Ventas

Todo vive en la carpeta `img/`, en la raíz del proyecto, al mismo nivel que
`css/` y `js/`.

```
img/
├── logo-horizontal-oscuro.svg / .png   Logo para fondo oscuro (el del sitio)
├── logo-horizontal-claro.svg / .png    Logo para fondo blanco
├── logo-vertical-oscuro.svg            Logo apilado, fondo oscuro
├── logo-vertical-claro.svg             Logo apilado, fondo blanco
├── isotipo.svg                         Solo la bolsa, azul
├── isotipo-blanco.svg                  Solo la bolsa, blanca
├── isotipo-noche.svg                   Solo la bolsa, azul noche
├── isotipo-512.png                     Bolsa en PNG grande
├── favicon.svg / favicon.ico / favicon-32.png   Pestaña del navegador
├── apple-touch-icon.png                Ícono al guardar el sitio en el celular
├── icono-app-512.png                   Ícono de app en grande
├── iconos.svg                          Los 13 íconos de la interfaz en un solo archivo
└── iconos-sueltos/                     Cada ícono por separado
```

---

## 1. Colores y tipografía de la marca

| Uso | Color |
|---|---|
| Ícono y la palabra "Ventas" | `#0466c8` |
| "Control de" sobre fondo oscuro | `#ffffff` |
| "Control de" sobre fondo claro | `#001233` |
| Fondo del favicon e ícono de app | `#0466c8` |

- Tipografía del logo: **Inter Medium** ("Control de") e **Inter ExtraBold** ("Ventas").
- El texto del logo está convertido a trazos: se ve igual aunque la computadora no tenga Inter instalada.

**No hacer:** estirar o deformar el logo, cambiarle los colores, ponerlo sobre
fondos de poco contraste, ni agregarle sombras o efectos. Deja siempre un
espacio libre alrededor (los SVG ya traen ese margen incluido).

---

## 2. Favicon

Pega esto dentro de `<head>` en **todas** las páginas (`login.html`,
`index.html`, `pedidos.html`, `clientes.html`, `cliente.html`, `fondo.html`):

```html
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="img/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
```

---

## 3. Logo en el sitio

### Barra lateral

Reemplaza el `<div class="marca">…</div>` por:

```html
<a href="index.html" class="marca">
  <img src="img/logo-horizontal-oscuro.svg" alt="Control de Ventas" width="180">
</a>
```

### Login

Reemplaza el `<h1>` de la tarjeta de login por:

```html
<img src="img/logo-vertical-oscuro.svg" alt="Control de Ventas" width="160"
     style="display:block;margin:0 auto 16px">
```

### Cuál versión usar

| Dónde | Archivo |
|---|---|
| Barra lateral, encabezados del sitio | `logo-horizontal-oscuro.svg` |
| Login, portadas, espacios angostos | `logo-vertical-oscuro.svg` |
| Documentos o fondos blancos | `logo-horizontal-claro.svg` |
| Espacios muy pequeños (solo símbolo) | `isotipo.svg` |
| Una sola tinta (sellos, impresión simple) | `isotipo-blanco.svg` / `isotipo-noche.svg` |
| Apps que no aceptan SVG | los `.png` |

---

## 4. Íconos de la interfaz

13 íconos de línea: trazo 2 en una rejilla de 24 × 24, puntas redondeadas,
el mismo estilo de la bolsa del logo. Toman el color del texto que los rodea
(`currentColor`), así que se pintan con CSS igual que una letra.

| Nombre | Para qué |
|---|---|
| `resumen` | Menú: Resumen |
| `pedidos` | Menú: Pedidos (caja) |
| `clientes` | Menú: Clientes |
| `fondo` | Menú: Fondo (billetera) |
| `cerrar-sesion` | Menú: Cerrar sesión |
| `agregar` | Botón Registrar productos |
| `cerrar-pedido` | Botón Cerrar pedido (candado) |
| `recibo` | Botón Generar recibo PDF |
| `editar` | Editar una fila |
| `eliminar` | Eliminar una fila |
| `guardar` | Guardar al editar en la fila |
| `cancelar` | Cancelar al editar en la fila |
| `buscar` | Buscador (cuando exista) |

### 4.1 CSS (una sola vez, en `css/styles.css`)

```css
.icono {
  width: 1.15em;
  height: 1.15em;
  flex-shrink: 0;
  vertical-align: -0.2em;
}
```

Para que ícono y texto queden alineados, el botón o enlace que los contiene
debe tener:

```css
display: inline-flex;
align-items: center;
gap: 8px;
```

### 4.2 Insertar un ícono

```html
<svg class="icono" aria-hidden="true"><use href="img/iconos.svg#editar"/></svg>
```

Solo cambia el nombre después de `#`.

### 4.3 Ejemplos

**Enlace del menú**

```html
<a href="pedidos.html" class="nav-link activo">
  <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#pedidos"/></svg>
  Pedidos
</a>
```

**Botón con texto**

```html
<button class="boton">
  <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#agregar"/></svg>
  Registrar productos
</button>
```

**Botón solo con ícono** (Editar / Eliminar en la tabla). Lleva `aria-label`
y `title` para que se entienda al pasar el mouse y con lector de pantalla:

```html
<button class="boton-mini" aria-label="Editar" title="Editar">
  <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#editar"/></svg>
</button>
```

**Desde JavaScript**

```js
function icono(nombre) {
  return `<svg class="icono" aria-hidden="true"><use href="img/iconos.svg#${nombre}"/></svg>`;
}

botonEliminar.innerHTML = icono("eliminar");
```

### 4.4 Dónde usarlos y dónde no

La idea es equilibrar texto e íconos para que la página no se vea saturada.

| Sí | No |
|---|---|
| Barra lateral y menú de abajo en celular | Títulos de sección |
| Botones principales: Registrar, Cerrar pedido, Recibo PDF | Estado Pagado / Pendiente (el color y la palabra ya bastan) |
| Editar / Eliminar en cada fila (solo ícono) | Números del Resumen y del Fondo |
| Guardar / Cancelar al editar en la fila | Etiquetas de formularios |
| Buscar, cuando exista el buscador | Listas de movimientos |

---

## 5. Probar en tu computadora

Los íconos con `<use href="img/iconos.svg#…">` funcionan en GitHub Pages y
en cualquier servidor. Si abres el HTML con doble clic (`file://`), Chrome no
los muestra por una restricción del navegador, no por el sitio. Para probar
en local usa la extensión **Live Server** de VS Code.

Si después de subir un cambio no ves el logo o los íconos nuevos, recarga con
**Ctrl + Shift + R** para saltarte la caché.

## 6. Subir los cambios

```bash
git add .
git commit -m "Agrega logo, favicon e iconos"
git push
```
