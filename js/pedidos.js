import {
  listarPedidos, crearPedido, obtenerPedido,
  listarClientes, crearCliente,
  listarLineasPedido, agregarLineasPedido, actualizarLinea, eliminarLinea,
  cerrarPedido, eliminarPedido
} from "./db.js";

const params = new URLSearchParams(location.search);
const pedidoId = params.get("id");

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

// Aviso flotante para errores que no deben pasar desapercibidos.
function mostrarAviso(texto) {
  let aviso = document.getElementById("aviso");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "aviso";
    aviso.className = "aviso";
    aviso.setAttribute("role", "alert");
    document.body.appendChild(aviso);
  }
  aviso.textContent = texto;
  aviso.classList.add("visible");
  clearTimeout(mostrarAviso.temporizador);
  mostrarAviso.temporizador = setTimeout(() => aviso.classList.remove("visible"), 4000);
}

const AVISO_CONEXION = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";

/* ---------- Cantidad y precio unitario de cada línea ---------- */

function calcularTotal(cantidad, unitario) {
  return Math.round(cantidad * unitario * 100) / 100;
}

function esCantidadValida(cantidad) {
  return Number.isInteger(cantidad) && cantidad >= 1;
}

// Las líneas registradas antes de agregar la cantidad no la tienen: valen como 1.
function cantidadLinea(l) {
  return Number(l.cantidad) || 1;
}

// Total de la línea: lo cobrado al cliente, o lo que costó si es compra personal.
function montoLinea(l) {
  return Number(l.esPersonal ? l.costoTemuPersonal : l.precioCobrado) || 0;
}

function unitarioLinea(l) {
  const unitario = l.esPersonal ? l.costoUnitario : l.precioUnitario;
  return unitario != null ? Number(unitario) : montoLinea(l) / cantidadLinea(l);
}

/* ============================================================
   Vista: lista de pedidos
   ============================================================ */
async function iniciarVistaLista() {
  document.getElementById("vista-lista").style.display = "block";
  document.getElementById("vista-detalle").style.display = "none";

  const pedidos = await listarPedidos();
  renderListaPedidos(pedidos);

  const siguienteNumero = pedidos.length
    ? Math.max(...pedidos.map(p => Number(p.numero) || 0)) + 1
    : 1;
  document.getElementById("input-numero-pedido").value = siguienteNumero;

  document.getElementById("form-nuevo-pedido").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numero = document.getElementById("input-numero-pedido").value;
    const ref = await crearPedido(Number(numero));
    location.href = `pedidos.html?id=${ref.id}`;
  });
}

function renderListaPedidos(pedidos) {
  const cont = document.getElementById("lista-pedidos");
  cont.innerHTML = "";

  if (pedidos.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no has creado ningún pedido.</p>';
    return;
  }

  for (const p of pedidos) {
    const fila = document.createElement("a");
    fila.href = `pedidos.html?id=${p.id}`;
    fila.className = "fila-ledger fila-link";
    const nota = p.estado === "cerrado" ? "Cerrado" : "Abierto";
    const monto = p.estado === "cerrado" ? formatearMoneda(p.ganancia) : "";
    const clase = p.estado === "cerrado" ? "gold" : "";
    fila.innerHTML = `
      <span class="fila-tipo">Pedido ${p.numero}</span>
      <span class="fila-nota">${nota}</span>
      <span class="fila-monto ${clase}">${monto}</span>
    `;
    cont.appendChild(fila);
  }
}

/* ============================================================
   Vista: detalle de un pedido
   ============================================================ */
let pedidoActual = null;
let clientesCache = [];

async function iniciarVistaDetalle() {
  document.getElementById("vista-lista").style.display = "none";
  document.getElementById("vista-detalle").style.display = "block";

  clientesCache = await listarClientes();
  poblarListaClientes();
  iniciarCaptura();
  iniciarPegarLista();

  document.querySelectorAll(".selector-modo-opcion").forEach(boton => {
    boton.addEventListener("click", () => cambiarModoCaptura(boton.dataset.modo));
  });
  document.getElementById("form-cierre").addEventListener("submit", manejarCerrarPedido);
  document.getElementById("boton-eliminar-pedido").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este pedido completo, con todas sus líneas? Esto no se puede deshacer.")) return;
    await eliminarPedido(pedidoId);
    location.href = "pedidos.html";
  });

  document.getElementById("boton-toggle-linea").addEventListener("click", () => {
    formLineaAbierto = !formLineaAbierto;
    if (formLineaAbierto) formCierreAbierto = false;
    actualizarVisibilidadFormularios();
    if (formLineaAbierto) enfocarInicioCaptura();
  });
  document.getElementById("boton-toggle-cierre").addEventListener("click", () => {
    formCierreAbierto = !formCierreAbierto;
    if (formCierreAbierto) formLineaAbierto = false;
    actualizarVisibilidadFormularios();
  });

  await cargarDetalle();
}

/* ---------- Clientes: búsqueda por nombre ---------- */

// Compara nombres sin importar mayúsculas, acentos ni espacios de más.
function normalizarNombre(nombre) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();
}

function buscarClientePorNombre(nombre) {
  const clave = normalizarNombre(nombre);
  return clientesCache.find(c => normalizarNombre(c.nombre || "") === clave) || null;
}

function poblarListaClientes() {
  const lista = document.getElementById("lista-clientes");
  lista.innerHTML = "";
  for (const c of clientesCache) {
    const opt = document.createElement("option");
    opt.value = c.nombre;
    lista.appendChild(opt);
  }
}

// Devuelve el cliente con ese nombre; si no existe, lo crea.
async function obtenerOCrearCliente(nombre) {
  const existente = buscarClientePorNombre(nombre);
  if (existente) return existente;
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const ref = await crearCliente(limpio);
  const nuevo = { id: ref.id, nombre: limpio };
  clientesCache.push(nuevo);
  return nuevo;
}

/* ---------- Modo de captura: por cliente / pegar lista ---------- */

function cambiarModoCaptura(modo) {
  document.querySelectorAll(".selector-modo-opcion").forEach(b => {
    b.classList.toggle("activo", b.dataset.modo === modo);
  });
  document.getElementById("form-linea").style.display = modo === "cliente" ? "block" : "none";
  document.getElementById("form-pegar").style.display = modo === "pegar" ? "block" : "none";
  enfocarInicioCaptura();
}

function enfocarInicioCaptura() {
  if (document.getElementById("form-pegar").style.display === "block") {
    document.getElementById("input-pegar").focus();
  } else if (esCapturaPersonal()) {
    document.querySelector("#filas-captura .captura-producto")?.focus();
  } else {
    document.getElementById("input-cliente").focus();
  }
}

/* ---------- Captura por cliente: varias filas producto + monto ---------- */

function esCapturaPersonal() {
  return document.getElementById("input-tipo-linea").value === "personal";
}

function iniciarCaptura() {
  const form = document.getElementById("form-linea");
  const inputCliente = document.getElementById("input-cliente");

  document.getElementById("input-tipo-linea").addEventListener("change", actualizarCamposSegunTipo);
  inputCliente.addEventListener("input", actualizarAyudaCliente);
  inputCliente.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      document.querySelector("#filas-captura .captura-producto")?.focus();
    }
  });

  document.getElementById("boton-agregar-fila").addEventListener("click", () => {
    agregarFilaCaptura().querySelector(".captura-producto").focus();
  });

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", manejarGuardarCaptura);

  reiniciarFilasCaptura();
  actualizarCamposSegunTipo();
}

function actualizarCamposSegunTipo() {
  const esPersonal = esCapturaPersonal();
  document.getElementById("campo-cliente").style.display = esPersonal ? "none" : "flex";
  document.getElementById("campo-pagado").style.display = esPersonal ? "none" : "flex";
  document.getElementById("etiqueta-monto").textContent = esPersonal ? "Costo unit." : "Precio unit.";
  actualizarTotalCaptura();
}

function actualizarAyudaCliente() {
  const nombre = document.getElementById("input-cliente").value.trim();
  const ayuda = document.getElementById("ayuda-cliente");
  if (!nombre) {
    ayuda.textContent = "";
  } else if (buscarClientePorNombre(nombre)) {
    ayuda.textContent = "✓ Cliente existente";
  } else {
    ayuda.textContent = `Se creará "${nombre}" como cliente nuevo`;
  }
}

function agregarFilaCaptura() {
  const cont = document.getElementById("filas-captura");
  const fila = document.createElement("div");
  fila.className = "fila-captura";

  const inputProducto = document.createElement("input");
  inputProducto.type = "text";
  inputProducto.className = "captura-producto";
  inputProducto.placeholder = "Producto";
  inputProducto.setAttribute("aria-label", "Producto");

  const inputCantidad = document.createElement("input");
  inputCantidad.type = "number";
  inputCantidad.step = "1";
  inputCantidad.min = "1";
  inputCantidad.value = "1";
  inputCantidad.inputMode = "numeric";
  inputCantidad.className = "captura-cantidad";
  inputCantidad.setAttribute("aria-label", "Cantidad");

  const inputMonto = document.createElement("input");
  inputMonto.type = "number";
  inputMonto.step = "0.01";
  inputMonto.min = "0";
  inputMonto.inputMode = "decimal";
  inputMonto.className = "captura-monto";
  inputMonto.placeholder = "0.00";
  inputMonto.setAttribute("aria-label", "Precio unitario");

  const totalFila = document.createElement("span");
  totalFila.className = "captura-total-fila";
  totalFila.textContent = formatearMoneda(0);

  const botonQuitar = document.createElement("button");
  botonQuitar.type = "button";
  botonQuitar.className = "boton-mini";
  botonQuitar.textContent = "✕";
  botonQuitar.title = "Quitar fila";
  botonQuitar.addEventListener("click", () => {
    fila.remove();
    if (!cont.children.length) agregarFilaCaptura();
    actualizarTotalCaptura();
  });

  // Enter: producto → cantidad → precio → fila siguiente (o una nueva al final)
  const alPresionarEnter = (destino) => (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      destino();
    }
  };
  inputProducto.addEventListener("keydown", alPresionarEnter(() => inputCantidad.select()));
  inputCantidad.addEventListener("keydown", alPresionarEnter(() => inputMonto.focus()));
  inputMonto.addEventListener("keydown", alPresionarEnter(() => {
    const siguiente = fila.nextElementSibling || agregarFilaCaptura();
    siguiente.querySelector(".captura-producto").focus();
  }));

  for (const input of [inputProducto, inputCantidad, inputMonto]) {
    input.addEventListener("input", () => {
      fila.classList.remove("invalida");
      totalFila.textContent = formatearMoneda(
        calcularTotal(Number(inputCantidad.value) || 0, Number(inputMonto.value) || 0));
      actualizarTotalCaptura();
    });
  }

  fila.append(inputProducto, inputCantidad, inputMonto, totalFila, botonQuitar);
  cont.appendChild(fila);
  return fila;
}

function reiniciarFilasCaptura() {
  document.getElementById("filas-captura").innerHTML = "";
  agregarFilaCaptura();
  actualizarTotalCaptura();
}

function actualizarTotalCaptura() {
  const filas = leerFilasCaptura().filas;
  const unidades = filas.reduce((s, f) => s + f.cantidad, 0);
  const total = filas.reduce((s, f) => s + calcularTotal(f.cantidad, f.unitario), 0);
  document.getElementById("total-captura").textContent = filas.length
    ? `${unidades} unidad${unidades === 1 ? "" : "es"} · ${formatearMoneda(total)}`
    : "";
}

// Lee las filas con producto escrito. Una fila con producto pero sin precio
// o con cantidad menor a 1 se marca como inválida; las filas vacías se ignoran.
function leerFilasCaptura() {
  const filas = [];
  const invalidas = [];
  for (const fila of document.querySelectorAll("#filas-captura .fila-captura")) {
    const producto = fila.querySelector(".captura-producto").value.trim();
    const textoMonto = fila.querySelector(".captura-monto").value.trim();
    if (!producto && !textoMonto) continue;
    const cantidad = Number(fila.querySelector(".captura-cantidad").value);
    const unitario = Number(textoMonto);
    if (!producto || !esCantidadValida(cantidad) || textoMonto === "" ||
        !Number.isFinite(unitario) || unitario < 0) {
      invalidas.push(fila);
      continue;
    }
    filas.push({ producto, cantidad, unitario });
  }
  return { filas, invalidas };
}

// Guarda cantidad y precio unitario, y también el total de la línea
// (precioCobrado / costoTemuPersonal), que es lo que suman los totales,
// la ganancia del pedido y el recibo.
function construirLinea({ producto, cantidad, unitario }, cliente, pagado) {
  const total = calcularTotal(cantidad, unitario);
  if (!cliente) {
    return {
      producto, cantidad, esPersonal: true, pagado: false,
      costoUnitario: unitario, costoTemuPersonal: total,
      precioUnitario: null, precioCobrado: null,
      clienteId: null, clienteNombre: null
    };
  }
  return {
    producto, cantidad, esPersonal: false, pagado,
    precioUnitario: unitario, precioCobrado: total,
    costoUnitario: null, costoTemuPersonal: null,
    clienteId: cliente.id, clienteNombre: cliente.nombre
  };
}

async function manejarGuardarCaptura(e) {
  e.preventDefault();
  const error = document.getElementById("error-captura");
  const ok = document.getElementById("ok-captura");
  const boton = document.getElementById("boton-guardar-captura");
  error.textContent = "";
  ok.textContent = "";

  const esPersonal = esCapturaPersonal();
  const nombreCliente = document.getElementById("input-cliente").value.trim();
  const { filas, invalidas } = leerFilasCaptura();

  if (!esPersonal && !nombreCliente) {
    error.textContent = "Escribe el nombre del cliente.";
    document.getElementById("input-cliente").focus();
    return;
  }
  if (invalidas.length) {
    invalidas.forEach(f => f.classList.add("invalida"));
    error.textContent = "Revisa las filas marcadas: cada producto necesita cantidad (mínimo 1) y precio.";
    invalidas[0].querySelector(".captura-producto").focus();
    return;
  }
  if (!filas.length) {
    error.textContent = "Agrega al menos un producto.";
    return;
  }

  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const cliente = esPersonal ? null : await obtenerOCrearCliente(nombreCliente);
    const pagado = document.getElementById("input-pagado-ya").checked;
    const guardadas = await agregarLineasPedido(pedidoId, filas.map(f => construirLinea(f, cliente, pagado)));
    lineasCache.push(...guardadas);

    ok.textContent = `✓ ${filas.length} producto${filas.length === 1 ? "" : "s"} guardado${filas.length === 1 ? "" : "s"}` +
      (cliente ? ` para ${cliente.nombre}` : "");

    // Listo para el siguiente cliente: se conserva el tipo, se limpia lo demás.
    document.getElementById("input-cliente").value = "";
    document.getElementById("input-pagado-ya").checked = false;
    actualizarAyudaCliente();
    reiniciarFilasCaptura();
    poblarListaClientes();
    enfocarInicioCaptura();
    refrescarLineas();
  } catch (err) {
    console.error("Error guardando productos:", err);
    error.textContent = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo; no se perdió lo que escribiste.";
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar productos";
  }
}

/* ---------- Pegar lista: "cliente, producto, precio" por línea ---------- */

function iniciarPegarLista() {
  const input = document.getElementById("input-pegar");
  input.addEventListener("input", actualizarResumenPegar);
  document.getElementById("form-pegar").addEventListener("submit", manejarGuardarPegar);
}

function convertirPrecio(texto) {
  const limpio = texto.replace(/[$\s]/g, "");
  if (limpio === "") return NaN;
  return Number(limpio);
}

// Cada línea: cliente, producto, [cantidad,] precio unitario. Acepta tabuladores
// (Excel), punto y coma o comas. El producto puede llevar comas: se toma todo lo
// que hay en medio. La cantidad solo se reconoce si es un número entero suelto
// justo antes del precio; si no está, vale 1.
function parsearLista(texto) {
  const items = [];
  const errores = [];

  texto.split(/\r?\n/).forEach((renglon, i) => {
    if (!renglon.trim()) return;
    const separador = renglon.includes("\t") ? "\t" : renglon.includes(";") ? ";" : ",";
    const partes = renglon.split(separador).map(p => p.trim());
    if (partes.length < 3) {
      errores.push(`Línea ${i + 1}: faltan datos (cliente, producto, precio)`);
      return;
    }
    const cliente = partes[0];
    const precio = convertirPrecio(partes[partes.length - 1]);
    let cantidad = 1;
    let finProducto = -1;
    if (partes.length >= 4 && /^\d+$/.test(partes[partes.length - 2])) {
      cantidad = Number(partes[partes.length - 2]);
      finProducto = -2;
    }
    const producto = partes.slice(1, finProducto).join(separador === "\t" ? " " : `${separador} `).trim();
    if (!cliente || !producto) {
      errores.push(`Línea ${i + 1}: falta el cliente o el producto`);
    } else if (!Number.isFinite(precio) || precio < 0) {
      errores.push(`Línea ${i + 1}: el precio "${partes[partes.length - 1]}" no es un número`);
    } else if (!esCantidadValida(cantidad)) {
      errores.push(`Línea ${i + 1}: la cantidad debe ser 1 o más`);
    } else {
      items.push({ cliente, producto, cantidad, unitario: precio });
    }
  });

  return { items, errores };
}

function actualizarResumenPegar() {
  const { items, errores } = parsearLista(document.getElementById("input-pegar").value);
  const nombres = new Map();
  for (const it of items) nombres.set(normalizarNombre(it.cliente), it.cliente);
  const nuevos = [...nombres.values()].filter(n => !buscarClientePorNombre(n)).length;
  const total = items.reduce((s, it) => s + calcularTotal(it.cantidad, it.unitario), 0);
  const unidades = items.reduce((s, it) => s + it.cantidad, 0);

  document.getElementById("resumen-pegar").textContent = items.length
    ? `${unidades} unidad${unidades === 1 ? "" : "es"} para ${nombres.size} cliente${nombres.size === 1 ? "" : "s"}` +
      (nuevos ? ` (${nuevos} nuevo${nuevos === 1 ? "" : "s"})` : "") + ` · ${formatearMoneda(total)}`
    : "";
  document.getElementById("error-pegar").textContent = errores.join(" · ");
  document.getElementById("ok-pegar").textContent = "";
}

async function manejarGuardarPegar(e) {
  e.preventDefault();
  const error = document.getElementById("error-pegar");
  const ok = document.getElementById("ok-pegar");
  const boton = document.getElementById("boton-guardar-pegar");
  const { items, errores } = parsearLista(document.getElementById("input-pegar").value);

  if (errores.length) {
    error.textContent = "Corrige estas líneas antes de guardar: " + errores.join(" · ");
    return;
  }
  if (!items.length) {
    error.textContent = "Pega al menos una línea.";
    return;
  }

  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    // Los clientes se resuelven uno a uno para no crear el mismo dos veces.
    const clientesPorNombre = new Map();
    for (const it of items) {
      const clave = normalizarNombre(it.cliente);
      if (!clientesPorNombre.has(clave)) {
        clientesPorNombre.set(clave, await obtenerOCrearCliente(it.cliente));
      }
    }
    const pagado = document.getElementById("input-pagado-pegar").checked;
    const lineas = items.map(it =>
      construirLinea(it, clientesPorNombre.get(normalizarNombre(it.cliente)), pagado));
    const guardadas = await agregarLineasPedido(pedidoId, lineas);
    lineasCache.push(...guardadas);

    document.getElementById("input-pegar").value = "";
    document.getElementById("input-pagado-pegar").checked = false;
    actualizarResumenPegar();
    ok.textContent = `✓ ${lineas.length} productos guardados para ${clientesPorNombre.size} clientes`;
    poblarListaClientes();
    refrescarLineas();
  } catch (err) {
    console.error("Error guardando la lista:", err);
    error.textContent = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo; la lista sigue aquí.";
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar lista";
  }
}

let lineaEnEdicionId = null;
let lineasCache = [];
let formLineaAbierto = false;
let formCierreAbierto = false;

function actualizarVisibilidadFormularios() {
  const cerrado = pedidoActual && pedidoActual.estado === "cerrado";
  document.getElementById("acciones-pedido").style.display = cerrado ? "none" : "flex";
  document.getElementById("bloque-form-linea").style.display = (!cerrado && formLineaAbierto) ? "block" : "none";
  document.getElementById("bloque-cierre").style.display = (!cerrado && formCierreAbierto) ? "block" : "none";

  document.getElementById("boton-toggle-linea").classList.toggle("activo-toggle", formLineaAbierto);
  document.getElementById("boton-toggle-cierre").classList.toggle("activo-toggle", formCierreAbierto);
}

async function cargarDetalle() {
  pedidoActual = await obtenerPedido(pedidoId);

  if (!pedidoActual) {
    document.getElementById("titulo-pedido").textContent = "Pedido no encontrado";
    return;
  }

  document.getElementById("titulo-pedido").textContent = `Pedido ${pedidoActual.numero}`;
  document.getElementById("estado-pedido").textContent =
    pedidoActual.estado === "cerrado" ? "Cerrado" : "Abierto";

  lineasCache = await listarLineasPedido(pedidoId);
  refrescarLineas();

  const cerrado = pedidoActual.estado === "cerrado";
  actualizarVisibilidadFormularios();
  document.getElementById("bloque-resultado").style.display = cerrado ? "block" : "none";

  const botonEliminarPedido = document.getElementById("boton-eliminar-pedido");
  botonEliminarPedido.style.display = cerrado ? "none" : "inline-block";

  if (cerrado) renderResultadoCierre(pedidoActual);
}

// Redibuja la lista desde lo que ya tenemos en memoria, sin volver a Firebase.
function refrescarLineas() {
  renderLineas(lineasCache);
  renderResumenCierre(lineasCache);
}

function agruparLineasPorCliente(lineas) {
  const grupos = new Map();

  for (const l of lineas) {
    const clave = l.esPersonal ? "__personal__" : (l.clienteId || "__sin_cliente__");
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        nombre: l.esPersonal ? "Compra personal" : (l.clienteNombre || "Sin cliente"),
        esPersonal: !!l.esPersonal,
        lineas: []
      });
    }
    grupos.get(clave).lineas.push(l);
  }

  // Compras personales siempre al final; el resto, alfabético por nombre.
  return Array.from(grupos.values()).sort((a, b) => {
    if (a.esPersonal !== b.esPersonal) return a.esPersonal ? 1 : -1;
    return a.nombre.localeCompare(b.nombre);
  });
}

// Iconos rellenos (estilo Material) para los botones de acción de cada línea.
const ICONOS = {
  editar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  eliminar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  guardar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  cancelar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
};

// Líneas cuyo cambio de pago se está guardando: su botón se muestra atenuado.
const lineasGuardando = new Set();

function crearCelda(clase = "", contenido = "") {
  const td = document.createElement("td");
  if (clase) td.className = clase;
  if (contenido instanceof Node) td.appendChild(contenido);
  else td.textContent = contenido;
  return td;
}

function crearBotonIcono(tipo, titulo, alHacerClic) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = `icono ${tipo}`;
  boton.title = titulo;
  boton.setAttribute("aria-label", titulo);
  boton.innerHTML = ICONOS[tipo];
  boton.addEventListener("click", alHacerClic);
  return boton;
}

function renderLineas(lineas) {
  const cont = document.getElementById("lista-lineas");
  cont.innerHTML = "";

  if (lineas.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay líneas en este pedido.</p>';
    return;
  }

  const cerrado = pedidoActual.estado === "cerrado";
  const tabla = document.createElement("table");
  tabla.className = `tabla-pedido${cerrado ? " cerrado" : ""}`;
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Producto</th>
        <th class="centro">Cant.</th>
        <th class="num">P. unitario</th>
        <th class="num">Total</th>
        <th>Estado</th>
        ${cerrado ? "" : '<th class="col-boton">Editar</th><th class="col-boton">Eliminar</th>'}
      </tr>
    </thead>
  `;
  const cuerpo = document.createElement("tbody");

  for (const grupo of agruparLineasPorCliente(lineas)) {
    cuerpo.appendChild(crearEncabezadoMovil(grupo));
    grupo.lineas.forEach((l, i) => {
      const primera = i === 0;
      cuerpo.appendChild(l.id === lineaEnEdicionId
        ? crearFormularioEdicion(l, grupo, primera)
        : crearFilaLinea(l, grupo, primera, cerrado));
    });
    cuerpo.appendChild(crearFilaSubtotal(grupo, cerrado));
  }
  tabla.appendChild(cuerpo);
  tabla.appendChild(crearPieTabla(lineas, cerrado));
  cont.appendChild(tabla);
}

function textoUnidades(n) {
  return `${n} unidad${n === 1 ? "" : "es"}`;
}

function crearSaldo(debe, textoDebe, textoAlDia) {
  const saldo = document.createElement("span");
  saldo.className = `grupo-debe ${debe ? "debe" : "al-dia"}`;
  saldo.textContent = debe ? `${textoDebe} ${formatearMoneda(debe)}` : textoAlDia;
  return saldo;
}

// En celular la tabla se ve como tarjetas: cada cliente abre con su nombre
// y cierra con su subtotal. En computadora el nombre va en la columna Cliente.
function crearEncabezadoMovil(grupo) {
  const fila = document.createElement("tr");
  fila.className = "solo-movil";
  const nombre = crearCelda();
  const etiqueta = document.createElement("span");
  etiqueta.className = "grupo-nombre";
  etiqueta.textContent = grupo.nombre;
  nombre.appendChild(etiqueta);
  fila.appendChild(nombre);
  return fila;
}

function crearCeldaCliente(grupo, primera) {
  const celda = crearCelda(`cliente${primera ? "" : " cliente-repetido"}`, primera ? grupo.nombre : "");
  if (grupo.esPersonal) celda.classList.add("personal");
  return celda;
}

function crearFilaLinea(l, grupo, primera, cerrado) {
  const fila = document.createElement("tr");
  fila.className = "fila-linea";

  const total = crearCelda("num total-linea", formatearMoneda(montoLinea(l)));
  if (l.esPersonal) total.classList.add("rust");

  const estado = crearCelda("estado");
  if (!l.esPersonal) {
    const indicador = document.createElement(cerrado ? "span" : "button");
    pintarBotonPagado(indicador, l.pagado);
    if (!cerrado) {
      indicador.type = "button";
      const guardando = lineasGuardando.has(l.id);
      indicador.disabled = guardando;
      indicador.classList.toggle("guardando", guardando);
      indicador.addEventListener("click", () => alternarPagado(l));
    }
    estado.appendChild(indicador);
  }

  fila.append(
    crearCeldaCliente(grupo, primera),
    crearCelda("producto", l.producto),
    crearCelda("centro cant", String(cantidadLinea(l))),
    crearCelda("num unit", formatearMoneda(unitarioLinea(l))),
    total,
    crearCelda("detalle-movil", `${cantidadLinea(l)} × ${formatearMoneda(unitarioLinea(l))}`),
    estado
  );

  if (!cerrado) {
    fila.append(
      crearCelda("col-boton", crearBotonIcono("editar", "Editar", () => {
        lineaEnEdicionId = l.id;
        refrescarLineas();
        document.querySelector(".fila-linea.editando input")?.focus();
      })),
      crearCelda("col-boton", crearBotonIcono("eliminar", "Eliminar", () => eliminarLineaAlInstante(l)))
    );
  }
  return fila;
}

function crearFilaSubtotal(grupo, cerrado) {
  const unidades = grupo.lineas.reduce((s, l) => s + cantidadLinea(l), 0);
  const total = grupo.lineas.reduce((s, l) => s + montoLinea(l), 0);

  const fila = document.createElement("tr");
  fila.className = "subtotal";
  const etiqueta = crearCelda("", grupo.esPersonal
    ? `Subtotal de compras personales · ${textoUnidades(unidades)}`
    : `Subtotal de ${grupo.nombre} · ${textoUnidades(unidades)}`);
  etiqueta.colSpan = 4;

  const monto = crearCelda("num", formatearMoneda(total));
  if (grupo.esPersonal) monto.classList.add("rust");

  const saldo = crearCelda("estado");
  if (!grupo.esPersonal) {
    const debe = grupo.lineas.filter(l => !l.pagado).reduce((s, l) => s + montoLinea(l), 0);
    saldo.appendChild(crearSaldo(debe, "debe", "al día"));
  }

  fila.append(etiqueta, monto, saldo);
  if (!cerrado) fila.append(crearCelda("col-boton"), crearCelda("col-boton"));
  return fila;
}

function crearPieTabla(lineas, cerrado) {
  const ventas = lineas.filter(l => !l.esPersonal);
  const unidades = ventas.reduce((s, l) => s + cantidadLinea(l), 0);
  const total = ventas.reduce((s, l) => s + montoLinea(l), 0);
  const porCobrar = ventas.filter(l => !l.pagado).reduce((s, l) => s + montoLinea(l), 0);

  const pie = document.createElement("tfoot");
  const fila = document.createElement("tr");
  const etiqueta = crearCelda("", `Total cobrado a clientes · ${textoUnidades(unidades)}`);
  etiqueta.colSpan = 4;
  const saldo = crearCelda("estado");
  saldo.appendChild(crearSaldo(porCobrar, "por cobrar", "todo cobrado"));

  fila.append(etiqueta, crearCelda("num", formatearMoneda(total)), saldo);
  if (!cerrado) fila.append(crearCelda("col-boton"), crearCelda("col-boton"));
  pie.appendChild(fila);
  return pie;
}

/* ---------- Cambios al instante: se ven de inmediato y se guardan por detrás ---------- */

function pintarBotonPagado(boton, pagado) {
  boton.className = `estado-pago ${pagado ? "pagado" : "pendiente"}`;
  boton.textContent = pagado ? "Pagado" : "Pendiente";
}

async function alternarPagado(l) {
  if (lineasGuardando.has(l.id)) return;
  const anterior = l.pagado;
  l.pagado = !anterior;
  lineasGuardando.add(l.id);
  refrescarLineas();
  try {
    await actualizarLinea(pedidoId, l.id, { pagado: l.pagado });
  } catch (err) {
    console.error("Error guardando el pago:", err);
    l.pagado = anterior;
    mostrarAviso(`No se pudo guardar el pago de "${l.producto}". Revisa tu conexión.`);
  } finally {
    lineasGuardando.delete(l.id);
    refrescarLineas();
  }
}

async function eliminarLineaAlInstante(l) {
  if (!confirm(`¿Eliminar la línea "${l.producto}"?`)) return;
  const posicion = lineasCache.indexOf(l);
  lineasCache.splice(posicion, 1);
  refrescarLineas();
  try {
    await eliminarLinea(pedidoId, l.id);
  } catch (err) {
    console.error("Error eliminando la línea:", err);
    lineasCache.splice(posicion, 0, l);
    refrescarLineas();
    mostrarAviso(`No se pudo eliminar "${l.producto}". Revisa tu conexión.`);
  }
}

// Edición dentro de la misma fila: producto, cantidad y precio unitario se
// vuelven campos y el total se recalcula al escribir. Enter guarda y Esc cancela.
function crearFormularioEdicion(l, grupo, primera) {
  const fila = document.createElement("tr");
  fila.className = "fila-linea editando";

  const inputProducto = document.createElement("input");
  inputProducto.className = "celda";
  inputProducto.value = l.producto;
  inputProducto.placeholder = "Producto";
  inputProducto.setAttribute("aria-label", "Producto");

  const inputCantidad = document.createElement("input");
  inputCantidad.className = "celda num cant";
  inputCantidad.type = "number";
  inputCantidad.step = "1";
  inputCantidad.min = "1";
  inputCantidad.inputMode = "numeric";
  inputCantidad.value = cantidadLinea(l);
  inputCantidad.setAttribute("aria-label", "Cantidad");

  const inputUnitario = document.createElement("input");
  inputUnitario.className = "celda num unit";
  inputUnitario.type = "number";
  inputUnitario.step = "0.01";
  inputUnitario.min = "0";
  inputUnitario.inputMode = "decimal";
  inputUnitario.value = Math.round(unitarioLinea(l) * 100) / 100;
  inputUnitario.setAttribute("aria-label", l.esPersonal ? "Costo unitario" : "Precio unitario");

  const total = crearCelda("num total-linea", formatearMoneda(montoLinea(l)));
  const recalcular = () => {
    total.textContent = formatearMoneda(
      calcularTotal(Number(inputCantidad.value) || 0, Number(inputUnitario.value) || 0));
  };
  inputCantidad.addEventListener("input", recalcular);
  inputUnitario.addEventListener("input", recalcular);

  const cancelar = () => {
    lineaEnEdicionId = null;
    refrescarLineas();
  };

  const botonGuardar = crearBotonIcono("guardar", "Guardar", guardar);
  const botonCancelar = crearBotonIcono("cancelar", "Cancelar", cancelar);

  async function guardar() {
    const producto = inputProducto.value.trim();
    const cantidad = Number(inputCantidad.value);
    const unitario = Number(inputUnitario.value);
    if (!producto) {
      mostrarAviso("Escribe el nombre del producto.");
      inputProducto.focus();
      return;
    }
    if (!esCantidadValida(cantidad)) {
      mostrarAviso("La cantidad debe ser un número entero de 1 o más.");
      inputCantidad.focus();
      return;
    }
    if (inputUnitario.value === "" || !Number.isFinite(unitario) || unitario < 0) {
      mostrarAviso("Escribe un precio válido.");
      inputUnitario.focus();
      return;
    }

    const cambios = { producto, cantidad };
    if (l.esPersonal) {
      cambios.costoUnitario = unitario;
      cambios.costoTemuPersonal = calcularTotal(cantidad, unitario);
    } else {
      cambios.precioUnitario = unitario;
      cambios.precioCobrado = calcularTotal(cantidad, unitario);
    }

    botonGuardar.disabled = true;
    try {
      await actualizarLinea(pedidoId, l.id, cambios);
      Object.assign(l, cambios);
      lineaEnEdicionId = null;
      refrescarLineas();
    } catch (err) {
      // La fila sigue abierta con lo que escribiste, para reintentar.
      console.error("Error guardando la línea:", err);
      mostrarAviso(AVISO_CONEXION);
      botonGuardar.disabled = false;
    }
  }

  fila.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); guardar(); }
    if (e.key === "Escape") cancelar();
  });

  fila.append(
    crearCeldaCliente(grupo, primera),
    crearCelda("producto", inputProducto),
    crearCelda("centro cant", inputCantidad),
    crearCelda("num unit", inputUnitario),
    total,
    crearCelda("detalle-movil"),
    crearCelda("estado"),
    crearCelda("col-boton", botonGuardar),
    crearCelda("col-boton", botonCancelar)
  );
  return fila;
}

function renderResumenCierre(lineas) {
  const totalCobrado = lineas
    .filter(l => !l.esPersonal)
    .reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0);
  const costoPersonalTotal = lineas
    .filter(l => l.esPersonal)
    .reduce((s, l) => s + (Number(l.costoTemuPersonal) || 0), 0);

  document.getElementById("resumen-cierre").textContent =
    `Total cobrado a clientes: ${formatearMoneda(totalCobrado)} — Costo de tus compras personales: ${formatearMoneda(costoPersonalTotal)}`;
}

function renderResultadoCierre(pedido) {
  const cont = document.getElementById("resultado-cierre");
  cont.innerHTML = `
    <div class="fila-ledger">
      <span class="fila-tipo">Total cobrado</span>
      <span class="fila-nota"></span>
      <span class="fila-monto">${formatearMoneda(pedido.totalCobrado)}</span>
    </div>
    <div class="fila-ledger">
      <span class="fila-tipo">Gastado en Temu (reventa)</span>
      <span class="fila-nota"></span>
      <span class="fila-monto rust">${formatearMoneda(pedido.totalGastadoTemu - (pedido.costoPersonalTotal || 0))}</span>
    </div>
    <div class="fila-ledger">
      <span class="fila-tipo">Ganancia</span>
      <span class="fila-nota">Ya se agregó al fondo</span>
      <span class="fila-monto gold">${formatearMoneda(pedido.ganancia)}</span>
    </div>
  `;
}

async function manejarCerrarPedido(e) {
  e.preventDefault();
  const totalTemu = document.getElementById("input-total-temu").value;
  if (!confirm("¿Cerrar este pedido y calcular la ganancia? Ya no vas a poder editar sus líneas.")) return;
  await cerrarPedido(pedidoId, Number(totalTemu));
  cargarDetalle();
}

/* ============================================================ */
if (pedidoId) {
  iniciarVistaDetalle();
} else {
  iniciarVistaLista();
}
