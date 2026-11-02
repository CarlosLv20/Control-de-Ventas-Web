import {
  listarClientesConResumen, crearCliente, actualizarCliente, eliminarCliente
} from "./db.js";
import { crearBotonIcono } from "./iconos.js";
import { mostrarAviso, AVISO_CONEXION, normalizarNombre, crearCelda } from "./comun.js";

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

let clienteEnEdicionId = null;
let clientesCache = [];

async function cargarClientes() {
  try {
    clientesCache = await listarClientesConResumen();
  } catch (e) {
    console.error(e);
    document.getElementById("lista-clientes").innerHTML =
      '<p class="vacio">No se pudieron cargar los clientes. Revisa tu conexión y recarga la página.</p>';
    return;
  }
  renderClientes();
}

// Otro cliente (no el que se está editando) con el mismo nombre, sin importar acentos ni mayúsculas.
function buscarDuplicado(nombre, excepto = null) {
  const clave = normalizarNombre(nombre);
  return clientesCache.find(c => c.id !== excepto && normalizarNombre(c.nombre || "") === clave) || null;
}

/* ---------- Búsqueda y orden ---------- */

function clientesVisibles() {
  const texto = normalizarNombre(document.getElementById("buscar-cliente").value);
  const orden = document.getElementById("orden-clientes").value;

  const lista = clientesCache.filter(c =>
    !texto ||
    normalizarNombre(c.nombre || "").includes(texto) ||
    (c.telefono || "").replace(/\D/g, "").includes(texto.replace(/\D/g, "") || "—")
  );

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  if (orden === "debe") lista.sort((a, b) => b.totalPendiente - a.totalPendiente || porNombre(a, b));
  else if (orden === "comprado") lista.sort((a, b) => b.totalComprado - a.totalComprado || porNombre(a, b));
  else lista.sort(porNombre);
  return lista;
}

/* ---------- Tabla ---------- */

function crearCeldaDebe(c) {
  const td = crearCelda("num debe");
  if (c.totalPendiente > 0) {
    td.textContent = formatearMoneda(c.totalPendiente);
    td.classList.add("pendiente");
  } else {
    td.textContent = "Al día";
    td.classList.add("al-dia");
  }
  return td;
}

// Resumen del cliente para el celular, donde se ocultan las columnas de números.
function crearDetalleMovil(c) {
  const partes = [];
  if (c.telefono) partes.push(c.telefono);
  partes.push(`${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"}`);
  partes.push(`${formatearMoneda(c.totalComprado)} comprado`);
  return crearCelda("detalle-movil", partes.join(" · "));
}

function renderClientes() {
  const cont = document.getElementById("lista-clientes");
  cont.innerHTML = "";

  if (clientesCache.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no has agregado ningún cliente.</p>';
    return;
  }

  const clientes = clientesVisibles();
  if (clientes.length === 0) {
    cont.innerHTML = '<p class="vacio">Ningún cliente coincide con la búsqueda.</p>';
    return;
  }

  const tabla = document.createElement("table");
  tabla.className = "tabla-pedido tabla-clientes";
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Teléfono</th>
        <th class="num">Pedidos</th>
        <th class="num">Total comprado</th>
        <th class="num">Debe</th>
        <th class="centro">Editar</th>
        <th class="centro">Eliminar</th>
      </tr>
    </thead>`;

  const cuerpo = document.createElement("tbody");
  for (const c of clientes) {
    cuerpo.appendChild(c.id === clienteEnEdicionId ? crearFilaEdicion(c) : crearFilaCliente(c));
  }
  tabla.appendChild(cuerpo);
  tabla.appendChild(crearPieTabla(clientes));
  cont.appendChild(tabla);
}

function crearFilaCliente(c) {
  const fila = document.createElement("tr");
  fila.className = "fila-cliente";

  const enlace = document.createElement("a");
  enlace.href = `cliente.html?id=${encodeURIComponent(c.id)}`;
  enlace.className = "enlace-nombre";
  enlace.textContent = c.nombre;

  fila.append(
    crearCelda("cliente", enlace),
    crearCelda("telefono", c.telefono || "—"),
    crearCelda("num pedidos", String(c.pedidos)),
    crearCelda("num comprado", formatearMoneda(c.totalComprado)),
    crearCeldaDebe(c),
    crearDetalleMovil(c),
    crearCelda("col-boton", crearBotonIcono("editar", "Editar", () => {
      clienteEnEdicionId = c.id;
      renderClientes();
    })),
    crearCelda("col-boton", crearBotonIcono("eliminar", "Eliminar", () => eliminarAlInstante(c)))
  );
  if (!c.telefono) fila.querySelector(".telefono").classList.add("sin-dato");
  return fila;
}

function crearPieTabla(clientes) {
  const comprado = clientes.reduce((s, c) => s + c.totalComprado, 0);
  const pendiente = clientes.reduce((s, c) => s + c.totalPendiente, 0);
  const conDeuda = clientes.filter(c => c.totalPendiente > 0).length;

  const pie = document.createElement("tfoot");
  const fila = document.createElement("tr");
  const etiqueta = crearCelda("", `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}` +
    (conDeuda ? ` · ${conDeuda} con saldo pendiente` : ""));
  etiqueta.colSpan = 3;
  const totalPendiente = crearCelda("num", pendiente > 0 ? formatearMoneda(pendiente) : "Al día");
  totalPendiente.classList.add(pendiente > 0 ? "pendiente" : "al-dia");

  fila.append(
    etiqueta,
    crearCelda("num", formatearMoneda(comprado)),
    totalPendiente,
    crearCelda(),
    crearCelda()
  );
  pie.appendChild(fila);
  return pie;
}

/* ---------- Editar en la misma fila ---------- */

function crearFilaEdicion(c) {
  const fila = document.createElement("tr");
  fila.className = "fila-cliente editando";

  const inputNombre = document.createElement("input");
  inputNombre.className = "celda";
  inputNombre.value = c.nombre;
  inputNombre.placeholder = "Nombre";
  inputNombre.setAttribute("aria-label", "Nombre");

  const inputTelefono = document.createElement("input");
  inputTelefono.className = "celda";
  inputTelefono.type = "tel";
  inputTelefono.value = c.telefono || "";
  inputTelefono.placeholder = "Teléfono";
  inputTelefono.setAttribute("aria-label", "Teléfono");

  const cancelar = () => {
    clienteEnEdicionId = null;
    renderClientes();
  };

  const guardar = async () => {
    const nombre = inputNombre.value.trim().replace(/\s+/g, " ");
    const telefono = inputTelefono.value.trim();
    inputNombre.classList.remove("invalida");

    if (!nombre) {
      inputNombre.classList.add("invalida");
      mostrarAviso("El nombre no puede quedar vacío.");
      inputNombre.focus();
      return;
    }
    const duplicado = buscarDuplicado(nombre, c.id);
    if (duplicado) {
      inputNombre.classList.add("invalida");
      mostrarAviso(`Ya existe un cliente llamado "${duplicado.nombre}".`);
      inputNombre.focus();
      return;
    }

    // Se ve al instante; si falla la conexión se regresa a como estaba.
    const anterior = { nombre: c.nombre, telefono: c.telefono || "" };
    Object.assign(c, { nombre, telefono });
    clienteEnEdicionId = null;
    renderClientes();
    try {
      await actualizarCliente(c.id, { nombre, telefono });
    } catch (e) {
      console.error(e);
      Object.assign(c, anterior);
      renderClientes();
      mostrarAviso(AVISO_CONEXION);
    }
  };

  for (const input of [inputNombre, inputTelefono]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); guardar(); }
      if (e.key === "Escape") { e.preventDefault(); cancelar(); }
    });
  }

  fila.append(
    crearCelda("cliente", inputNombre),
    crearCelda("telefono", inputTelefono),
    crearCelda("num pedidos", String(c.pedidos)),
    crearCelda("num comprado", formatearMoneda(c.totalComprado)),
    crearCeldaDebe(c),
    crearCelda("col-boton", crearBotonIcono("guardar", "Guardar", guardar)),
    crearCelda("col-boton", crearBotonIcono("cancelar", "Cancelar", cancelar))
  );
  setTimeout(() => inputNombre.focus(), 0);
  return fila;
}

/* ---------- Eliminar ---------- */

async function eliminarAlInstante(c) {
  const deuda = c.totalPendiente > 0
    ? `\n\nOjo: todavía te debe ${formatearMoneda(c.totalPendiente)}.`
    : "";
  if (!confirm(`¿Eliminar a "${c.nombre}"? Sus ventas anteriores se quedan en el historial de cada pedido, pero ya no vas a poder elegirlo para líneas nuevas.${deuda}`)) return;

  const posicion = clientesCache.indexOf(c);
  clientesCache.splice(posicion, 1);
  renderClientes();
  try {
    await eliminarCliente(c.id);
  } catch (e) {
    console.error(e);
    clientesCache.splice(posicion, 0, c);
    renderClientes();
    mostrarAviso("No se pudo eliminar. Revisa tu conexión e inténtalo de nuevo.");
  }
}

/* ---------- Cliente nuevo ---------- */

document.getElementById("form-nuevo-cliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = document.getElementById("error-cliente");
  const boton = document.getElementById("boton-agregar-cliente");
  const nombre = document.getElementById("input-nombre-cliente").value.trim().replace(/\s+/g, " ");
  const telefono = document.getElementById("input-telefono-cliente").value.trim();
  error.textContent = "";

  if (!nombre) {
    error.textContent = "Escribe el nombre del cliente.";
    return;
  }
  const duplicado = buscarDuplicado(nombre);
  if (duplicado) {
    error.textContent = `Ya existe un cliente llamado "${duplicado.nombre}".`;
    return;
  }

  boton.disabled = true;
  try {
    const { id } = await crearCliente(nombre, telefono);
    // Se agrega a la tabla sin volver a leer todos los pedidos.
    clientesCache.push({ id, nombre, telefono, totalComprado: 0, totalPendiente: 0, pedidos: 0, unidades: 0 });
    form.reset();
    renderClientes();
  } catch (err) {
    console.error(err);
    error.textContent = AVISO_CONEXION;
  } finally {
    boton.disabled = false;
  }
});

document.getElementById("buscar-cliente").addEventListener("input", renderClientes);
document.getElementById("orden-clientes").addEventListener("change", renderClientes);

cargarClientes();
