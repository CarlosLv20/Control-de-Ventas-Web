import { listarPedidos, listarLineasPedido, listarMovimientos, calcularSaldo } from "./db.js";

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

function etiquetaTipo(tipo) {
  const mapa = { ganancia: "Ganancia", gasto: "Gasto", retiro: "Retiro", aporte: "Aporte" };
  return mapa[tipo] || tipo;
}

function renderMovimientos(movimientos) {
  const cont = document.getElementById("lista-movimientos");
  cont.innerHTML = "";

  if (movimientos.length === 0) {
    cont.innerHTML = '<p class="vacio">Todavía no hay movimientos registrados en el fondo.</p>';
    return;
  }

  for (const m of movimientos.slice(0, 8)) {
    const esSalida = m.tipo === "gasto" || m.tipo === "retiro";
    const fila = document.createElement("div");
    fila.className = "fila-ledger";
    fila.innerHTML = `
      <span class="fila-tipo">${etiquetaTipo(m.tipo)}</span>
      <span class="fila-nota">${m.nota || ""}</span>
      <span class="fila-monto ${esSalida ? "rust" : "gold"}">${esSalida ? "−" : "+"} ${formatearMoneda(Math.abs(m.monto))}</span>
    `;
    cont.appendChild(fila);
  }
}

function renderPedidosAbiertos(pedidos) {
  const cont = document.getElementById("lista-pedidos-abiertos");
  cont.innerHTML = "";

  if (pedidos.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay pedidos abiertos en este momento.</p>';
    return;
  }

  for (const p of pedidos) {
    const fila = document.createElement("a");
    fila.href = `pedidos.html?id=${p.id}`;
    fila.className = "fila-ledger fila-link";
    fila.innerHTML = `
      <span class="fila-tipo">Pedido ${p.numero}</span>
      <span class="fila-nota">Abierto</span>
      <span class="fila-monto"></span>
    `;
    cont.appendChild(fila);
  }
}

async function cargarDashboard() {
  const [pedidos, movimientos] = await Promise.all([listarPedidos(), listarMovimientos()]);

  const saldo = calcularSaldo(movimientos);
  document.getElementById("saldo-fondo").textContent = formatearMoneda(saldo);

  const gananciaAcumulada = movimientos
    .filter(m => m.tipo === "ganancia")
    .reduce((suma, m) => suma + m.monto, 0);
  document.getElementById("ganancia-acumulada").textContent = formatearMoneda(gananciaAcumulada);

  const pedidosAbiertos = pedidos.filter(p => p.estado === "abierto");
  document.getElementById("pedidos-abiertos").textContent = pedidosAbiertos.length;

  // Pagos pendientes: recorremos el detalle de cada pedido.
  // (A esta escala son pocas lecturas; evita depender de un índice
  // de colección-grupo en Firestore que habría que crear a mano.)
  let pendientes = 0;
  for (const p of pedidos) {
    const lineas = await listarLineasPedido(p.id);
    pendientes += lineas.filter(l => !l.esPersonal && !l.pagado).length;
  }
  document.getElementById("pagos-pendientes").textContent = pendientes;

  renderPedidosAbiertos(pedidosAbiertos);
  renderMovimientos(movimientos);
}

cargarDashboard().catch(err => {
  console.error("Error cargando el dashboard:", err);
});
