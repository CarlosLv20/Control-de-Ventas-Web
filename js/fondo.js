import {
  listarMovimientos, registrarMovimiento, actualizarMovimiento, eliminarMovimiento, calcularSaldo
} from "./db.js";

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

function etiquetaTipo(tipo) {
  const mapa = { ganancia: "Ganancia", gasto: "Gasto", retiro: "Retiro", aporte: "Aporte" };
  return mapa[tipo] || tipo;
}

let movimientoEnEdicionId = null;
let movimientosCache = [];

async function cargarFondo() {
  movimientosCache = await listarMovimientos();

  const saldo = calcularSaldo(movimientosCache);
  document.getElementById("saldo-fondo").textContent = formatearMoneda(saldo);

  renderMovimientos(movimientosCache);
}

function renderMovimientos(movimientos) {
  const cont = document.getElementById("lista-movimientos");
  cont.innerHTML = "";

  if (movimientos.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay movimientos registrados.</p>';
    return;
  }

  for (const m of movimientos) {
    if (m.id === movimientoEnEdicionId) {
      cont.appendChild(crearFormularioEdicion(m));
      continue;
    }

    const fila = document.createElement("div");
    fila.className = "fila-ledger";
    const esSalida = m.tipo === "gasto" || m.tipo === "retiro";

    fila.innerHTML = `
      <span class="fila-tipo">${etiquetaTipo(m.tipo)}</span>
      <span class="fila-nota">${m.nota || ""}</span>
      <span class="fila-monto ${esSalida ? "rust" : "gold"}">${esSalida ? "−" : "+"} ${formatearMoneda(Math.abs(m.monto))}</span>
    `;

    // Los movimientos de tipo "ganancia" los genera el cierre de un pedido
    // automáticamente — no se editan ni se borran sueltos, porque
    // descuadrarían la ganancia ya calculada de ese pedido.
    if (m.tipo !== "ganancia") {
      const acciones = document.createElement("div");
      acciones.className = "fila-acciones";

      const botonEditar = document.createElement("button");
      botonEditar.className = "boton-mini";
      botonEditar.textContent = "Editar";
      botonEditar.addEventListener("click", () => {
        movimientoEnEdicionId = m.id;
        renderMovimientos(movimientosCache);
      });

      const botonEliminar = document.createElement("button");
      botonEliminar.className = "boton-mini peligro";
      botonEliminar.textContent = "Eliminar";
      botonEliminar.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este movimiento del fondo?")) return;
        await eliminarMovimiento(m.id);
        cargarFondo();
      });

      acciones.appendChild(botonEditar);
      acciones.appendChild(botonEliminar);
      fila.appendChild(acciones);
    } else {
      const etiqueta = document.createElement("span");
      etiqueta.className = "fila-nota";
      etiqueta.textContent = "Automático";
      fila.appendChild(etiqueta);
    }

    cont.appendChild(fila);
  }
}

function crearFormularioEdicion(m) {
  const fila = document.createElement("div");
  fila.className = "fila-edicion";

  const inputMonto = document.createElement("input");
  inputMonto.type = "number";
  inputMonto.step = "0.01";
  inputMonto.value = m.monto;
  inputMonto.placeholder = "Monto";

  const inputNota = document.createElement("input");
  inputNota.value = m.nota || "";
  inputNota.placeholder = "Nota";

  const botonGuardar = document.createElement("button");
  botonGuardar.className = "boton-mini";
  botonGuardar.textContent = "Guardar";
  botonGuardar.addEventListener("click", async () => {
    await actualizarMovimiento(m.id, {
      monto: Number(inputMonto.value) || 0,
      nota: inputNota.value.trim()
    });
    movimientoEnEdicionId = null;
    cargarFondo();
  });

  const botonCancelar = document.createElement("button");
  botonCancelar.className = "boton-mini";
  botonCancelar.textContent = "Cancelar";
  botonCancelar.addEventListener("click", () => {
    movimientoEnEdicionId = null;
    renderMovimientos(movimientosCache);
  });

  fila.appendChild(inputMonto);
  fila.appendChild(inputNota);
  fila.appendChild(botonGuardar);
  fila.appendChild(botonCancelar);
  return fila;
}

document.getElementById("form-movimiento").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = document.getElementById("input-tipo-movimiento").value;
  const monto = document.getElementById("input-monto-movimiento").value;
  const nota = document.getElementById("input-nota-movimiento").value.trim();

  await registrarMovimiento({ tipo, monto: Number(monto), nota });

  document.getElementById("form-movimiento").reset();
  cargarFondo();
});

cargarFondo();
