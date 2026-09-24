import { obtenerCliente, listarComprasCliente } from "./db.js";

const params = new URLSearchParams(location.search);
const clienteId = params.get("id");

function formatearMoneda(valor) {
  return "$" + (Number(valor) || 0).toFixed(2);
}

function formatearFecha(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  return timestamp.toDate().toLocaleDateString("es-SV", { year: "numeric", month: "long", day: "numeric" });
}

async function cargarFicha() {
  if (!clienteId) {
    document.getElementById("nombre-cliente").textContent = "Cliente no especificado";
    return;
  }

  const cliente = await obtenerCliente(clienteId);
  if (!cliente) {
    document.getElementById("nombre-cliente").textContent = "Cliente no encontrado";
    return;
  }

  document.getElementById("nombre-cliente").textContent = cliente.nombre;
  document.getElementById("telefono-cliente").textContent = cliente.telefono || "";

  const compras = await listarComprasCliente(clienteId);

  const totalComprado = compras.reduce((s, c) => s + c.total, 0);
  const totalPendiente = compras.reduce((s, c) => s + c.pendiente, 0);
  document.getElementById("total-comprado").textContent = formatearMoneda(totalComprado);
  document.getElementById("total-pendiente").textContent = formatearMoneda(totalPendiente);

  renderPedidosCliente(cliente, compras);
}

function renderPedidosCliente(cliente, compras) {
  const cont = document.getElementById("lista-pedidos-cliente");
  cont.innerHTML = "";

  if (compras.length === 0) {
    cont.innerHTML = '<p class="vacio">Este cliente todavía no tiene compras registradas.</p>';
    return;
  }

  for (const c of compras) {
    const bloque = document.createElement("div");
    bloque.style.marginBottom = "28px";

    const titulo = document.createElement("h3");
    titulo.style.fontSize = "1rem";
    titulo.style.fontWeight = "500";
    titulo.style.marginBottom = "10px";
    titulo.textContent = `Pedido ${c.pedido.numero}${c.pedido.estado === "abierto" ? " (abierto)" : ""}`;
    bloque.appendChild(titulo);

    const ledger = document.createElement("div");
    ledger.className = "ledger";
    for (const l of c.lineas) {
      const fila = document.createElement("div");
      fila.className = "fila-ledger";
      const estadoTexto = l.pagado ? "Pagado" : "Pendiente";
      fila.innerHTML = `
        <span class="fila-tipo">${l.producto}</span>
        <span class="fila-nota">${estadoTexto}</span>
        <span class="fila-monto gold">${formatearMoneda(l.precioCobrado)}</span>
      `;
      ledger.appendChild(fila);
    }

    const filaTotal = document.createElement("div");
    filaTotal.className = "fila-ledger";
    filaTotal.innerHTML = `
      <span class="fila-tipo">Subtotal de este pedido</span>
      <span class="fila-nota"></span>
      <span class="fila-monto">${formatearMoneda(c.total)}</span>
    `;
    ledger.appendChild(filaTotal);

    bloque.appendChild(ledger);

    const botonRecibo = document.createElement("button");
    botonRecibo.className = "boton secundario";
    botonRecibo.style.marginTop = "10px";
    botonRecibo.textContent = "Generar recibo PDF";
    botonRecibo.addEventListener("click", () => generarRecibo(cliente, c));
    bloque.appendChild(botonRecibo);

    cont.appendChild(bloque);
  }
}

function generarRecibo(cliente, compra) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const margen = 56;
  let y = 70;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Control de Ventas Online", margen, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Recibo — Pedido ${compra.pedido.numero}`, margen, y);

  y += 30;
  doc.setFontSize(11);
  doc.text(`Cliente: ${cliente.nombre}`, margen, y);
  if (cliente.telefono) {
    y += 16;
    doc.text(`Teléfono: ${cliente.telefono}`, margen, y);
  }
  y += 16;
  doc.text(`Fecha del pedido: ${formatearFecha(compra.pedido.fecha)}`, margen, y);
  y += 16;
  doc.text(`Fecha de emisión del recibo: ${new Date().toLocaleDateString("es-SV")}`, margen, y);

  y += 30;
  doc.setFont("helvetica", "bold");
  doc.text("Producto", margen, y);
  doc.text("Precio", 500, y, { align: "right" });
  doc.setLineWidth(0.5);
  doc.line(margen, y + 6, 540, y + 6);

  y += 22;
  doc.setFont("helvetica", "normal");
  for (const l of compra.lineas) {
    doc.text(l.producto, margen, y);
    doc.text(formatearMoneda(l.precioCobrado), 500, y, { align: "right" });
    y += 20;
  }

  y += 6;
  doc.line(margen, y, 540, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total", margen, y);
  doc.text(formatearMoneda(compra.total), 500, y, { align: "right" });

  if (compra.pendiente > 0) {
    y += 22;
    doc.setFontSize(11);
    doc.setTextColor(180, 60, 40);
    doc.text(`Pendiente de pago: ${formatearMoneda(compra.pendiente)}`, margen, y);
    doc.setTextColor(0, 0, 0);
  }

  const nombreArchivo = `recibo-pedido-${compra.pedido.numero}-${cliente.nombre.replace(/\s+/g, "-")}.pdf`;
  doc.save(nombreArchivo);
}

cargarFicha();
