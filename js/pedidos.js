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
  document.getElementById("etiqueta-monto").textContent = esPersonal ? "Costo en Temu" : "Precio cobrado";
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

  const inputMonto = document.createElement("input");
  inputMonto.type = "number";
  inputMonto.step = "0.01";
  inputMonto.min = "0";
  inputMonto.inputMode = "decimal";
  inputMonto.className = "captura-monto";
  inputMonto.placeholder = "0.00";

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

  inputProducto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      inputMonto.focus();
    }
  });
  inputMonto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const siguiente = fila.nextElementSibling || agregarFilaCaptura();
      siguiente.querySelector(".captura-producto").focus();
    }
  });
  for (const input of [inputProducto, inputMonto]) {
    input.addEventListener("input", () => {
      fila.classList.remove("invalida");
      actualizarTotalCaptura();
    });
  }

  fila.append(inputProducto, inputMonto, botonQuitar);
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
  const total = filas.reduce((s, f) => s + (f.monto || 0), 0);
  document.getElementById("total-captura").textContent = filas.length
    ? `${filas.length} producto${filas.length === 1 ? "" : "s"} · ${formatearMoneda(total)}`
    : "";
}

// Lee las filas con producto escrito. Una fila con producto pero sin monto
// válido se marca como inválida; las filas vacías se ignoran.
function leerFilasCaptura() {
  const filas = [];
  const invalidas = [];
  for (const fila of document.querySelectorAll("#filas-captura .fila-captura")) {
    const producto = fila.querySelector(".captura-producto").value.trim();
    const textoMonto = fila.querySelector(".captura-monto").value.trim();
    if (!producto && !textoMonto) continue;
    const monto = Number(textoMonto);
    if (!producto || textoMonto === "" || !Number.isFinite(monto) || monto < 0) {
      invalidas.push(fila);
      continue;
    }
    filas.push({ producto, monto });
  }
  return { filas, invalidas };
}

function construirLinea({ producto, monto }, cliente, pagado) {
  if (!cliente) {
    return {
      producto, esPersonal: true, pagado: false,
      costoTemuPersonal: monto, precioCobrado: null,
      clienteId: null, clienteNombre: null
    };
  }
  return {
    producto, esPersonal: false, pagado,
    precioCobrado: monto, costoTemuPersonal: null,
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
    error.textContent = "Revisa las filas marcadas: cada producto necesita su monto.";
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

// Cada línea: cliente, producto, precio. Acepta tabuladores (Excel), punto y coma
// o comas. El producto puede llevar comas: se toma todo lo que hay en medio.
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
    const producto = partes.slice(1, -1).join(separador === "\t" ? " " : `${separador} `).trim();
    if (!cliente || !producto) {
      errores.push(`Línea ${i + 1}: falta el cliente o el producto`);
    } else if (!Number.isFinite(precio) || precio < 0) {
      errores.push(`Línea ${i + 1}: el precio "${partes[partes.length - 1]}" no es un número`);
    } else {
      items.push({ cliente, producto, monto: precio });
    }
  });

  return { items, errores };
}

function actualizarResumenPegar() {
  const { items, errores } = parsearLista(document.getElementById("input-pegar").value);
  const nombres = new Map();
  for (const it of items) nombres.set(normalizarNombre(it.cliente), it.cliente);
  const nuevos = [...nombres.values()].filter(n => !buscarClientePorNombre(n)).length;
  const total = items.reduce((s, it) => s + it.monto, 0);

  document.getElementById("resumen-pegar").textContent = items.length
    ? `${items.length} producto${items.length === 1 ? "" : "s"} para ${nombres.size} cliente${nombres.size === 1 ? "" : "s"}` +
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

function montoLinea(l) {
  return Number(l.esPersonal ? l.costoTemuPersonal : l.precioCobrado) || 0;
}

function crearCelda(clase = "", texto = "") {
  const td = document.createElement("td");
  if (clase) td.className = clase;
  td.textContent = texto;
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
  tabla.className = "tabla-lineas";
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Producto</th>
        <th class="num">Precio</th>
        <th class="col-estado">Estado</th>
        <th class="col-acciones"><span class="solo-lectores">Acciones</span></th>
      </tr>
    </thead>
  `;
  const cuerpo = document.createElement("tbody");

  for (const grupo of agruparLineasPorCliente(lineas)) {
    cuerpo.appendChild(crearFilaGrupo(grupo));
    for (const l of grupo.lineas) {
      cuerpo.appendChild(l.id === lineaEnEdicionId ? crearFormularioEdicion(l) : crearFilaLinea(l, cerrado));
    }
  }
  tabla.appendChild(cuerpo);
  tabla.appendChild(crearPieTabla(lineas));
  cont.appendChild(tabla);
}

function crearFilaGrupo(grupo) {
  const total = grupo.lineas.reduce((s, l) => s + montoLinea(l), 0);
  const fila = document.createElement("tr");
  fila.className = "fila-grupo";

  const nombre = crearCelda();
  const etiqueta = document.createElement("span");
  etiqueta.className = "grupo-nombre";
  etiqueta.textContent = grupo.nombre;
  const cuenta = document.createElement("span");
  cuenta.className = "grupo-cuenta";
  cuenta.textContent = `${grupo.lineas.length} producto${grupo.lineas.length === 1 ? "" : "s"}`;
  nombre.append(etiqueta, cuenta);

  const estado = crearCelda("col-estado");
  if (!grupo.esPersonal) {
    const debe = grupo.lineas.filter(l => !l.pagado).reduce((s, l) => s + montoLinea(l), 0);
    const saldo = document.createElement("span");
    saldo.className = `grupo-debe ${debe ? "debe" : "al-dia"}`;
    saldo.textContent = debe ? `debe ${formatearMoneda(debe)}` : "al día";
    estado.appendChild(saldo);
  }

  const monto = crearCelda("num", formatearMoneda(total));
  monto.classList.add(grupo.esPersonal ? "rust" : "grupo-total");

  fila.append(nombre, monto, estado, crearCelda("col-acciones"));
  return fila;
}

function crearFilaLinea(l, cerrado) {
  const fila = document.createElement("tr");
  fila.className = "fila-linea";

  const monto = crearCelda("num", formatearMoneda(montoLinea(l)));
  monto.classList.add(l.esPersonal ? "rust" : "gold");

  const estado = crearCelda("col-estado");
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

  const acciones = crearCelda("col-acciones");
  if (!cerrado) {
    acciones.append(
      crearBotonIcono("editar", "Editar", () => {
        lineaEnEdicionId = l.id;
        refrescarLineas();
        document.querySelector(".fila-linea.editando input")?.focus();
      }),
      crearBotonIcono("eliminar", "Eliminar", () => eliminarLineaAlInstante(l))
    );
  }

  fila.append(crearCelda("", l.producto), monto, estado, acciones);
  return fila;
}

function crearPieTabla(lineas) {
  const ventas = lineas.filter(l => !l.esPersonal);
  const total = ventas.reduce((s, l) => s + montoLinea(l), 0);
  const porCobrar = ventas.filter(l => !l.pagado).reduce((s, l) => s + montoLinea(l), 0);

  const pie = document.createElement("tfoot");
  const fila = document.createElement("tr");
  const saldo = crearCelda("col-estado");
  const etiqueta = document.createElement("span");
  etiqueta.className = `grupo-debe ${porCobrar ? "debe" : "al-dia"}`;
  etiqueta.textContent = porCobrar ? `por cobrar ${formatearMoneda(porCobrar)}` : "todo cobrado";
  saldo.appendChild(etiqueta);

  fila.append(
    crearCelda("", `Total cobrado a clientes · ${ventas.length} producto${ventas.length === 1 ? "" : "s"}`),
    crearCelda("num", formatearMoneda(total)),
    saldo,
    crearCelda("col-acciones")
  );
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

// Edición dentro de la misma fila: producto y monto se vuelven campos.
// Enter guarda y Esc cancela.
function crearFormularioEdicion(l) {
  const fila = document.createElement("tr");
  fila.className = "fila-linea editando";

  const inputProducto = document.createElement("input");
  inputProducto.className = "celda";
  inputProducto.value = l.producto;
  inputProducto.placeholder = "Producto";
  inputProducto.setAttribute("aria-label", "Producto");

  const inputMonto = document.createElement("input");
  inputMonto.className = "celda num";
  inputMonto.type = "number";
  inputMonto.step = "0.01";
  inputMonto.min = "0";
  inputMonto.inputMode = "decimal";
  inputMonto.value = montoLinea(l);
  inputMonto.setAttribute("aria-label", l.esPersonal ? "Costo en Temu" : "Precio cobrado");

  const cancelar = () => {
    lineaEnEdicionId = null;
    refrescarLineas();
  };

  const botonGuardar = crearBotonIcono("guardar", "Guardar", guardar);
  const botonCancelar = crearBotonIcono("cancelar", "Cancelar", cancelar);

  async function guardar() {
    const producto = inputProducto.value.trim();
    const monto = Number(inputMonto.value);
    if (!producto || inputMonto.value === "" || !Number.isFinite(monto) || monto < 0) {
      mostrarAviso("Escribe el producto y un monto válido.");
      (producto ? inputMonto : inputProducto).focus();
      return;
    }
    const cambios = { producto };
    if (l.esPersonal) cambios.costoTemuPersonal = monto;
    else cambios.precioCobrado = monto;

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

  const celdaProducto = crearCelda();
  celdaProducto.appendChild(inputProducto);
  const celdaMonto = crearCelda("num");
  celdaMonto.appendChild(inputMonto);
  const acciones = crearCelda("col-acciones");
  acciones.append(botonGuardar, botonCancelar);

  fila.append(celdaProducto, celdaMonto, crearCelda("col-estado"), acciones);
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
