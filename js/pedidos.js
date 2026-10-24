import {
  listarPedidos, crearPedido,
  listarClientes, crearCliente,
  listarLineasPedido, agregarLineasPedido, actualizarLinea, eliminarLinea,
  cerrarPedido, eliminarPedido
} from "./db.js";

const params = new URLSearchParams(location.search);
const pedidoId = params.get("id");

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
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
    await agregarLineasPedido(pedidoId, filas.map(f => construirLinea(f, cliente, pagado)));

    ok.textContent = `✓ ${filas.length} producto${filas.length === 1 ? "" : "s"} guardado${filas.length === 1 ? "" : "s"}` +
      (cliente ? ` para ${cliente.nombre}` : "");

    // Listo para el siguiente cliente: se conserva el tipo, se limpia lo demás.
    document.getElementById("input-cliente").value = "";
    document.getElementById("input-pagado-ya").checked = false;
    actualizarAyudaCliente();
    reiniciarFilasCaptura();
    poblarListaClientes();
    enfocarInicioCaptura();
    cargarDetalle();
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
    await agregarLineasPedido(pedidoId, lineas);

    document.getElementById("input-pegar").value = "";
    document.getElementById("input-pagado-pegar").checked = false;
    actualizarResumenPegar();
    ok.textContent = `✓ ${lineas.length} productos guardados para ${clientesPorNombre.size} clientes`;
    poblarListaClientes();
    cargarDetalle();
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
  const pedidos = await listarPedidos();
  pedidoActual = pedidos.find(p => p.id === pedidoId);

  if (!pedidoActual) {
    document.getElementById("titulo-pedido").textContent = "Pedido no encontrado";
    return;
  }

  document.getElementById("titulo-pedido").textContent = `Pedido ${pedidoActual.numero}`;
  document.getElementById("estado-pedido").textContent =
    pedidoActual.estado === "cerrado" ? "Cerrado" : "Abierto";

  lineasCache = await listarLineasPedido(pedidoId);
  renderLineas(lineasCache);
  renderResumenCierre(lineasCache);

  const cerrado = pedidoActual.estado === "cerrado";
  actualizarVisibilidadFormularios();
  document.getElementById("bloque-resultado").style.display = cerrado ? "block" : "none";

  const botonEliminarPedido = document.getElementById("boton-eliminar-pedido");
  botonEliminarPedido.style.display = cerrado ? "none" : "inline-block";

  if (cerrado) renderResultadoCierre(pedidoActual);
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

function renderLineas(lineas) {
  const cont = document.getElementById("lista-lineas");
  cont.innerHTML = "";

  if (lineas.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay líneas en este pedido.</p>';
    return;
  }

  const cerrado = pedidoActual.estado === "cerrado";
  const grupos = agruparLineasPorCliente(lineas);

  for (const grupo of grupos) {
    const subtotal = grupo.esPersonal
      ? grupo.lineas.reduce((s, l) => s + (Number(l.costoTemuPersonal) || 0), 0)
      : grupo.lineas.reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0);

    const encabezado = document.createElement("div");
    encabezado.className = "grupo-cliente-encabezado";
    encabezado.innerHTML = `
      <span>${grupo.nombre}</span>
      <span class="grupo-cliente-subtotal">${formatearMoneda(subtotal)}</span>
    `;
    cont.appendChild(encabezado);

    for (const l of grupo.lineas) {
      if (l.id === lineaEnEdicionId) {
        cont.appendChild(crearFormularioEdicion(l));
        continue;
      }

      const fila = document.createElement("div");
      fila.className = "fila-ledger";

      if (l.esPersonal) {
        fila.innerHTML = `
          <span class="fila-tipo">${l.producto}</span>
          <span class="fila-nota"></span>
          <span class="fila-monto rust">${formatearMoneda(l.costoTemuPersonal)}</span>
        `;
      } else {
        const estadoTexto = l.pagado ? "Pagado" : "Pendiente";
        fila.innerHTML = `
          <span class="fila-tipo">${l.producto}</span>
          <span class="fila-nota"></span>
          <span class="fila-monto gold">${formatearMoneda(l.precioCobrado)}</span>
        `;
        if (!cerrado) {
          const botonPagado = document.createElement("button");
          botonPagado.className = `estado-pago ${l.pagado ? "pagado" : "pendiente"}`;
          botonPagado.textContent = estadoTexto;
          botonPagado.addEventListener("click", async () => {
            await actualizarLinea(pedidoId, l.id, { pagado: !l.pagado });
            cargarDetalle();
          });
          fila.querySelector(".fila-monto").after(botonPagado);
        } else {
          const etiqueta = document.createElement("span");
          etiqueta.className = `estado-pago ${l.pagado ? "pagado" : "pendiente"}`;
          etiqueta.textContent = estadoTexto;
          fila.appendChild(etiqueta);
        }
      }

      if (!cerrado) {
        const acciones = document.createElement("div");
        acciones.className = "fila-acciones";

        const botonEditar = document.createElement("button");
        botonEditar.className = "boton-mini";
        botonEditar.textContent = "Editar";
        botonEditar.addEventListener("click", () => {
          lineaEnEdicionId = l.id;
          renderLineas(lineasCache);
        });

        const botonEliminar = document.createElement("button");
        botonEliminar.className = "boton-mini peligro";
        botonEliminar.textContent = "Eliminar";
        botonEliminar.addEventListener("click", async () => {
          if (!confirm(`¿Eliminar la línea "${l.producto}"?`)) return;
          await eliminarLinea(pedidoId, l.id);
          cargarDetalle();
        });

        acciones.appendChild(botonEditar);
        acciones.appendChild(botonEliminar);
        fila.appendChild(acciones);
      }

      cont.appendChild(fila);
    }
  }
}

function crearFormularioEdicion(l) {
  const fila = document.createElement("div");
  fila.className = "fila-edicion";

  const inputProducto = document.createElement("input");
  inputProducto.value = l.producto;
  inputProducto.placeholder = "Producto";

  const inputMonto = document.createElement("input");
  inputMonto.type = "number";
  inputMonto.step = "0.01";
  inputMonto.value = l.esPersonal ? l.costoTemuPersonal : l.precioCobrado;
  inputMonto.placeholder = l.esPersonal ? "Costo en Temu" : "Precio cobrado";

  const botonGuardar = document.createElement("button");
  botonGuardar.className = "boton-mini";
  botonGuardar.textContent = "Guardar";
  botonGuardar.addEventListener("click", async () => {
    const cambios = { producto: inputProducto.value.trim() };
    if (l.esPersonal) {
      cambios.costoTemuPersonal = Number(inputMonto.value) || 0;
    } else {
      cambios.precioCobrado = Number(inputMonto.value) || 0;
    }
    await actualizarLinea(pedidoId, l.id, cambios);
    lineaEnEdicionId = null;
    cargarDetalle();
  });

  const botonCancelar = document.createElement("button");
  botonCancelar.className = "boton-mini";
  botonCancelar.textContent = "Cancelar";
  botonCancelar.addEventListener("click", () => {
    lineaEnEdicionId = null;
    renderLineas(lineasCache);
  });

  fila.appendChild(inputProducto);
  fila.appendChild(inputMonto);
  fila.appendChild(botonGuardar);
  fila.appendChild(botonCancelar);
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
