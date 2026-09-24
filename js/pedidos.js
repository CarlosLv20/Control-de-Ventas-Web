import {
  listarPedidos, crearPedido,
  listarClientes, crearCliente,
  listarLineasPedido, agregarLineaPedido, actualizarLinea, eliminarLinea,
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
  poblarSelectClientes();

  document.getElementById("input-tipo-linea").addEventListener("change", actualizarCamposSegunTipo);
  document.getElementById("input-cliente").addEventListener("change", actualizarCampoClienteNuevo);
  actualizarCamposSegunTipo();

  document.getElementById("form-linea").addEventListener("submit", manejarAgregarLinea);
  document.getElementById("form-cierre").addEventListener("submit", manejarCerrarPedido);
  document.getElementById("boton-eliminar-pedido").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este pedido completo, con todas sus líneas? Esto no se puede deshacer.")) return;
    await eliminarPedido(pedidoId);
    location.href = "pedidos.html";
  });

  await cargarDetalle();
}

function poblarSelectClientes() {
  const select = document.getElementById("input-cliente");
  select.innerHTML = '<option value="__nuevo__">+ Cliente nuevo…</option>';
  for (const c of clientesCache) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.nombre;
    select.appendChild(opt);
  }
}

function actualizarCamposSegunTipo() {
  const esPersonal = document.getElementById("input-tipo-linea").value === "personal";
  document.getElementById("campo-cliente").style.display = esPersonal ? "none" : "flex";
  document.getElementById("campo-cliente-nuevo").style.display =
    (!esPersonal && document.getElementById("input-cliente").value === "__nuevo__") ? "flex" : "none";
  document.getElementById("campo-precio").style.display = esPersonal ? "none" : "flex";
  document.getElementById("campo-costo-personal").style.display = esPersonal ? "flex" : "none";
}

function actualizarCampoClienteNuevo() {
  const esNuevo = document.getElementById("input-cliente").value === "__nuevo__";
  document.getElementById("campo-cliente-nuevo").style.display = esNuevo ? "flex" : "none";
}

let lineaEnEdicionId = null;
let lineasCache = [];

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
  document.getElementById("bloque-form-linea").style.display = cerrado ? "none" : "block";
  document.getElementById("bloque-cierre").style.display = cerrado ? "none" : "block";
  document.getElementById("bloque-resultado").style.display = cerrado ? "block" : "none";

  const botonEliminarPedido = document.getElementById("boton-eliminar-pedido");
  botonEliminarPedido.style.display = cerrado ? "none" : "inline-block";

  if (cerrado) renderResultadoCierre(pedidoActual);
}

function renderLineas(lineas) {
  const cont = document.getElementById("lista-lineas");
  cont.innerHTML = "";

  if (lineas.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay líneas en este pedido.</p>';
    return;
  }

  const cerrado = pedidoActual.estado === "cerrado";

  for (const l of lineas) {
    if (l.id === lineaEnEdicionId) {
      cont.appendChild(crearFormularioEdicion(l));
      continue;
    }

    const fila = document.createElement("div");
    fila.className = "fila-ledger";

    if (l.esPersonal) {
      fila.innerHTML = `
        <span class="fila-tipo">${l.producto}</span>
        <span class="fila-nota">Compra personal</span>
        <span class="fila-monto rust">${formatearMoneda(l.costoTemuPersonal)}</span>
      `;
    } else {
      const estadoTexto = l.pagado ? "Pagado" : "Pendiente";
      fila.innerHTML = `
        <span class="fila-tipo">${l.producto}</span>
        <span class="fila-nota">${l.clienteNombre || "Sin cliente"}</span>
        <span class="fila-monto gold">${formatearMoneda(l.precioCobrado)}</span>
      `;
      if (!cerrado) {
        const botonPagado = document.createElement("button");
        botonPagado.className = "boton-mini";
        botonPagado.textContent = estadoTexto;
        botonPagado.addEventListener("click", async () => {
          await actualizarLinea(pedidoId, l.id, { pagado: !l.pagado });
          cargarDetalle();
        });
        fila.querySelector(".fila-monto").after(botonPagado);
      } else {
        const etiqueta = document.createElement("span");
        etiqueta.className = "fila-nota";
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

async function manejarAgregarLinea(e) {
  e.preventDefault();

  const esPersonal = document.getElementById("input-tipo-linea").value === "personal";
  const producto = document.getElementById("input-producto").value.trim();

  const linea = { producto, esPersonal, pagado: false };

  if (esPersonal) {
    linea.costoTemuPersonal = Number(document.getElementById("input-costo-personal").value) || 0;
    linea.precioCobrado = null;
    linea.clienteId = null;
    linea.clienteNombre = null;
  } else {
    linea.precioCobrado = Number(document.getElementById("input-precio").value) || 0;
    linea.costoTemuPersonal = null;

    const selectCliente = document.getElementById("input-cliente");
    if (selectCliente.value === "__nuevo__") {
      const nombreNuevo = document.getElementById("input-cliente-nuevo").value.trim();
      if (!nombreNuevo) { alert("Escribe el nombre del cliente nuevo."); return; }
      const ref = await crearCliente(nombreNuevo);
      linea.clienteId = ref.id;
      linea.clienteNombre = nombreNuevo;
    } else {
      const cliente = clientesCache.find(c => c.id === selectCliente.value);
      linea.clienteId = cliente.id;
      linea.clienteNombre = cliente.nombre;
    }
  }

  await agregarLineaPedido(pedidoId, linea);

  document.getElementById("form-linea").reset();
  actualizarCamposSegunTipo();

  clientesCache = await listarClientes();
  poblarSelectClientes();

  cargarDetalle();
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
