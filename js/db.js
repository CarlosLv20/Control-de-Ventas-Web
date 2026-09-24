// Funciones compartidas de acceso a datos — Control de Ventas Online
import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Referencias ----------
export const clientesRef = collection(db, "clientes");
export const pedidosRef = collection(db, "pedidos");
export const movimientosRef = collection(db, "movimientosFondo");

export function detallePedidoRef(pedidoId) {
  return collection(db, "pedidos", pedidoId, "detalle");
}

// ---------- Clientes ----------
export async function crearCliente(nombre, telefono = "") {
  return addDoc(clientesRef, { nombre, telefono, creado: serverTimestamp() });
}

export async function listarClientes() {
  const snap = await getDocs(query(clientesRef, orderBy("nombre")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function suscribirClientes(callback) {
  return onSnapshot(query(clientesRef, orderBy("nombre")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function actualizarCliente(clienteId, cambios) {
  return updateDoc(doc(db, "clientes", clienteId), cambios);
}

export async function eliminarCliente(clienteId) {
  return deleteDoc(doc(db, "clientes", clienteId));
}

export async function obtenerCliente(clienteId) {
  const snap = await getDoc(doc(db, "clientes", clienteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Trae, para un cliente específico, cada pedido en el que aparece con sus
// líneas, el subtotal que le corresponde en ese pedido y cuánto de eso
// sigue pendiente de pago. Útil para la ficha del cliente y el recibo.
export async function listarComprasCliente(clienteId) {
  const pedidos = await listarPedidos();
  const resultado = [];

  for (const p of pedidos) {
    const lineas = await listarLineasPedido(p.id);
    const lineasCliente = lineas.filter(l => l.clienteId === clienteId);
    if (lineasCliente.length === 0) continue;

    const total = lineasCliente.reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0);
    const pendiente = lineasCliente
      .filter(l => !l.pagado)
      .reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0);

    resultado.push({ pedido: p, lineas: lineasCliente, total, pendiente });
  }

  return resultado;
}

// Trae cada cliente junto con cuánto le han vendido en total y cuánto
// tiene pendiente de pago, recorriendo el detalle de todos los pedidos.
export async function listarClientesConResumen() {
  const [clientes, pedidos] = await Promise.all([listarClientes(), listarPedidos()]);

  const resumenPorId = {};
  for (const c of clientes) {
    resumenPorId[c.id] = { ...c, totalComprado: 0, totalPendiente: 0 };
  }

  for (const p of pedidos) {
    const lineas = await listarLineasPedido(p.id);
    for (const l of lineas) {
      if (l.esPersonal || !l.clienteId) continue;
      const r = resumenPorId[l.clienteId];
      if (!r) continue; // cliente fue borrado pero la línea histórica sigue existiendo
      const monto = Number(l.precioCobrado) || 0;
      r.totalComprado += monto;
      if (!l.pagado) r.totalPendiente += monto;
    }
  }

  return Object.values(resumenPorId);
}

// ---------- Pedidos ----------
export async function crearPedido(numero) {
  return addDoc(pedidosRef, {
    numero,
    fecha: serverTimestamp(),
    estado: "abierto",
    totalGastadoTemu: null,
    costoPersonalTotal: null,
    totalCobrado: null,
    ganancia: null
  });
}

export async function listarPedidos() {
  const snap = await getDocs(query(pedidosRef, orderBy("fecha", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function suscribirPedidos(callback) {
  return onSnapshot(query(pedidosRef, orderBy("fecha", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ---------- Detalle de pedido (subcolección) ----------
// linea: { clienteId, clienteNombre, producto, precioCobrado, pagado, esPersonal, costoTemuPersonal }
export async function agregarLineaPedido(pedidoId, linea) {
  return addDoc(detallePedidoRef(pedidoId), linea);
}

export async function listarLineasPedido(pedidoId) {
  const snap = await getDocs(detallePedidoRef(pedidoId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function suscribirLineasPedido(pedidoId, callback) {
  return onSnapshot(detallePedidoRef(pedidoId), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function actualizarLinea(pedidoId, lineaId, cambios) {
  return updateDoc(doc(db, "pedidos", pedidoId, "detalle", lineaId), cambios);
}

export async function eliminarLinea(pedidoId, lineaId) {
  return deleteDoc(doc(db, "pedidos", pedidoId, "detalle", lineaId));
}

export async function eliminarPedido(pedidoId) {
  const lineas = await listarLineasPedido(pedidoId);
  await Promise.all(lineas.map(l => deleteDoc(doc(db, "pedidos", pedidoId, "detalle", l.id))));
  return deleteDoc(doc(db, "pedidos", pedidoId));
}

// ---------- Cerrar pedido y calcular ganancia ----------
export async function cerrarPedido(pedidoId, totalGastadoTemu) {
  const lineas = await listarLineasPedido(pedidoId);

  const totalCobrado = lineas
    .filter(l => !l.esPersonal)
    .reduce((suma, l) => suma + (Number(l.precioCobrado) || 0), 0);

  const costoPersonalTotal = lineas
    .filter(l => l.esPersonal)
    .reduce((suma, l) => suma + (Number(l.costoTemuPersonal) || 0), 0);

  const gastoTemuReventa = Number(totalGastadoTemu) - costoPersonalTotal;
  const ganancia = totalCobrado - gastoTemuReventa;

  await updateDoc(doc(db, "pedidos", pedidoId), {
    estado: "cerrado",
    totalGastadoTemu: Number(totalGastadoTemu),
    costoPersonalTotal,
    totalCobrado,
    ganancia
  });

  await registrarMovimiento({
    tipo: "ganancia",
    monto: ganancia,
    nota: "Ganancia del pedido",
    pedidoId
  });

  return { totalCobrado, gastoTemuReventa, ganancia };
}

// ---------- Movimientos del fondo ----------
// tipo: 'ganancia' | 'gasto' | 'retiro' | 'aporte'
export async function registrarMovimiento({ tipo, monto, nota = "", pedidoId = null }) {
  return addDoc(movimientosRef, {
    tipo,
    monto: Number(monto),
    nota,
    pedidoId,
    fecha: serverTimestamp()
  });
}

export async function listarMovimientos() {
  const snap = await getDocs(query(movimientosRef, orderBy("fecha", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function suscribirMovimientos(callback) {
  return onSnapshot(query(movimientosRef, orderBy("fecha", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function actualizarMovimiento(movimientoId, cambios) {
  return updateDoc(doc(db, "movimientosFondo", movimientoId), cambios);
}

export async function eliminarMovimiento(movimientoId) {
  return deleteDoc(doc(db, "movimientosFondo", movimientoId));
}

export function calcularSaldo(movimientos) {
  return movimientos.reduce((saldo, m) => {
    if (m.tipo === "gasto" || m.tipo === "retiro") return saldo - m.monto;
    return saldo + m.monto; // ganancia, aporte
  }, 0);
}
