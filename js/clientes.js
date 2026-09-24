import {
  listarClientesConResumen, crearCliente, actualizarCliente, eliminarCliente
} from "./db.js";

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

let clienteEnEdicionId = null;
let clientesCache = [];

async function cargarClientes() {
  clientesCache = await listarClientesConResumen();
  clientesCache.sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderClientes(clientesCache);
}

function renderClientes(clientes) {
  const cont = document.getElementById("lista-clientes");
  cont.innerHTML = "";

  if (clientes.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no has agregado ningún cliente.</p>';
    return;
  }

  for (const c of clientes) {
    if (c.id === clienteEnEdicionId) {
      cont.appendChild(crearFormularioEdicion(c));
      continue;
    }

    const fila = document.createElement("div");
    fila.className = "fila-ledger";

    const nota = c.telefono ? c.telefono : `Total comprado: ${formatearMoneda(c.totalComprado)}`;
    const tienePendiente = c.totalPendiente > 0;

    fila.innerHTML = `
      <span class="fila-tipo"><a href="cliente.html?id=${c.id}" class="enlace-nombre">${c.nombre}</a></span>
      <span class="fila-nota">${nota}</span>
      <span class="fila-monto ${tienePendiente ? "rust" : ""}">${tienePendiente ? "Debe " + formatearMoneda(c.totalPendiente) : "Al día"}</span>
    `;

    const acciones = document.createElement("div");
    acciones.className = "fila-acciones";

    const botonEditar = document.createElement("button");
    botonEditar.className = "boton-mini";
    botonEditar.textContent = "Editar";
    botonEditar.addEventListener("click", () => {
      clienteEnEdicionId = c.id;
      renderClientes(clientesCache);
    });

    const botonEliminar = document.createElement("button");
    botonEliminar.className = "boton-mini peligro";
    botonEliminar.textContent = "Eliminar";
    botonEliminar.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar a "${c.nombre}"? Sus ventas anteriores se quedan en el historial de cada pedido, pero ya no vas a poder elegirlo para líneas nuevas.`)) return;
      await eliminarCliente(c.id);
      cargarClientes();
    });

    acciones.appendChild(botonEditar);
    acciones.appendChild(botonEliminar);
    fila.appendChild(acciones);

    cont.appendChild(fila);
  }
}

function crearFormularioEdicion(c) {
  const fila = document.createElement("div");
  fila.className = "fila-edicion";

  const inputNombre = document.createElement("input");
  inputNombre.value = c.nombre;
  inputNombre.placeholder = "Nombre";

  const inputTelefono = document.createElement("input");
  inputTelefono.value = c.telefono || "";
  inputTelefono.placeholder = "Teléfono";

  const botonGuardar = document.createElement("button");
  botonGuardar.className = "boton-mini";
  botonGuardar.textContent = "Guardar";
  botonGuardar.addEventListener("click", async () => {
    await actualizarCliente(c.id, {
      nombre: inputNombre.value.trim(),
      telefono: inputTelefono.value.trim()
    });
    clienteEnEdicionId = null;
    cargarClientes();
  });

  const botonCancelar = document.createElement("button");
  botonCancelar.className = "boton-mini";
  botonCancelar.textContent = "Cancelar";
  botonCancelar.addEventListener("click", () => {
    clienteEnEdicionId = null;
    renderClientes(clientesCache);
  });

  fila.appendChild(inputNombre);
  fila.appendChild(inputTelefono);
  fila.appendChild(botonGuardar);
  fila.appendChild(botonCancelar);
  return fila;
}

document.getElementById("form-nuevo-cliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("input-nombre-cliente").value.trim();
  const telefono = document.getElementById("input-telefono-cliente").value.trim();
  if (!nombre) return;
  await crearCliente(nombre, telefono);
  document.getElementById("form-nuevo-cliente").reset();
  cargarClientes();
});

cargarClientes();
