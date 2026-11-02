// Funciones compartidas de acceso a datos — Control de Ventas Online
import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, where, onSnapshot, serverTimestamp, writeBatch
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
// Gracias al resumen de cada pedido, solo se leen las líneas de los
// pedidos donde aparece el cliente.
export async function listarComprasCliente(clienteId) {
  const pedidos = await listarPedidosConResumen();
  const suyos = pedidos.filter(p => p.resumen.clientes[clienteId]);

  const lineasPorPedido = await Promise.all(suyos.map(p => listarLineasDeCliente(p.id, clienteId)));
  return suyos.map((p, i) => {
    const lineasCliente = lineasPorPedido[i];
    const total = redondear(lineasCliente.reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0));
    const pendiente = redondear(lineasCliente
      .filter(l => !l.pagado)
      .reduce((s, l) => s + (Number(l.precioCobrado) || 0), 0));
    return { pedido: p, lineas: lineasCliente, total, pendiente };
  }).filter(c => c.lineas.length > 0);
}

// Trae cada cliente junto con cuánto le han vendido en total y cuánto
// tiene pendiente de pago, sumando el resumen guardado en cada pedido.
export async function listarClientesConResumen() {
  const [clientes, pedidos] = await Promise.all([listarClientes(), listarPedidosConResumen()]);

  const resumenPorId = {};
  for (const c of clientes) {
    resumenPorId[c.id] = { ...c, totalComprado: 0, totalPendiente: 0, pedidos: 0, unidades: 0 };
  }

  for (const p of pedidos) {
    for (const [clienteId, rc] of Object.entries(p.resumen.clientes)) {
      const r = resumenPorId[clienteId];
      if (!r) continue; // cliente fue borrado pero la línea histórica sigue existiendo
      r.totalComprado = redondear(r.totalComprado + rc.total);
      r.totalPendiente = redondear(r.totalPendiente + rc.pendiente);
      r.unidades += rc.unidades;
      r.pedidos += 1;
    }
  }

  return Object.values(resumenPorId);
}

// ---------- Resumen guardado en cada pedido ----------
// Cada pedido guarda sus totales para que Resumen, Clientes y la ficha del
// cliente no tengan que leer todas las líneas de todos los pedidos.
// Se recalcula desde las líneas y se guarda junto con cada cambio.
const VERSION_RESUMEN = 1;

function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

export function calcularResumenPedido(lineas) {
  const resumen = {
    version: VERSION_RESUMEN,
    lineas: 0,
    unidades: 0,
    totalCobrado: 0,
    porCobrar: 0,
    pagosPendientes: 0,
    costoPersonal: 0,
    clientes: {}
  };

  for (const l of lineas) {
    const cantidad = Number(l.cantidad) || 1;
    resumen.lineas += 1;
    resumen.unidades += cantidad;

    if (l.esPersonal) {
      resumen.costoPersonal += Number(l.costoTemuPersonal) || 0;
      continue;
    }

    const monto = Number(l.precioCobrado) || 0;
    resumen.totalCobrado += monto;
    if (!l.pagado) {
      resumen.porCobrar += monto;
      resumen.pagosPendientes += 1;
    }

    if (!l.clienteId) continue;
    const rc = resumen.clientes[l.clienteId] ||=
      { nombre: l.clienteNombre || "", lineas: 0, unidades: 0, total: 0, pendiente: 0 };
    rc.lineas += 1;
    rc.unidades += cantidad;
    rc.total += monto;
    if (!l.pagado) rc.pendiente += monto;
  }

  resumen.totalCobrado = redondear(resumen.totalCobrado);
  resumen.porCobrar = redondear(resumen.porCobrar);
  resumen.costoPersonal = redondear(resumen.costoPersonal);
  for (const rc of Object.values(resumen.clientes)) {
    rc.total = redondear(rc.total);
    rc.pendiente = redondear(rc.pendiente);
  }
  return resumen;
}

// Firestore no conserva el orden de las claves, así que se comparan ordenadas.
function textoOrdenado(valor) {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  const claves = Object.keys(valor).sort();
  return "{" + claves.map(k => JSON.stringify(k) + ":" + textoOrdenado(valor[k])).join(",") + "}";
}

export function resumenesIguales(a, b) {
  return !!a && !!b && textoOrdenado(a) === textoOrdenado(b);
}

export async function guardarResumenPedido(pedidoId, resumen) {
  return updateDoc(doc(db, "pedidos", pedidoId), { resumen });
}

// Devuelve el resumen del pedido; si no lo tiene (pedidos creados antes de
// este cambio), lo calcula con sus líneas y lo guarda para la próxima vez.
export async function asegurarResumen(pedido) {
  if (pedido.resumen && pedido.resumen.version === VERSION_RESUMEN) return pedido.resumen;
  const resumen = calcularResumenPedido(await listarLineasPedido(pedido.id));
  try {
    await guardarResumenPedido(pedido.id, resumen);
  } catch (err) {
    console.error("No se pudo guardar el resumen del pedido", pedido.id, err);
  }
  return resumen;
}

export async function listarPedidosConResumen() {
  const pedidos = await listarPedidos();
  const resumenes = await Promise.all(pedidos.map(asegurarResumen));
  return pedidos.map((p, i) => ({ ...p, resumen: resumenes[i] }));
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
    ganancia: null,
    resumen: calcularResumenPedido([])
  });
}

export async function listarPedidos() {
  const snap = await getDocs(query(pedidosRef, orderBy("fecha", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function obtenerPedido(pedidoId) {
  const snap = await getDoc(doc(db, "pedidos", pedidoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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

// Guarda varias líneas en una sola operación: o se guardan todas o ninguna.
// Firestore admite hasta 500 escrituras por lote, así que partimos en tandas.
// El resumen nuevo del pedido viaja en la última tanda.
// Devuelve las líneas guardadas con su id, para no tener que volver a leerlas.
export async function agregarLineasPedido(pedidoId, lineas, resumen) {
  const TAMANO_LOTE = 450;
  const guardadas = [];
  for (let i = 0; i < lineas.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    const tanda = lineas.slice(i, i + TAMANO_LOTE).map(linea => {
      const ref = doc(detallePedidoRef(pedidoId));
      lote.set(ref, linea);
      return { id: ref.id, ...linea };
    });
    if (resumen && i + TAMANO_LOTE >= lineas.length) {
      lote.update(doc(db, "pedidos", pedidoId), { resumen });
    }
    await lote.commit();
    guardadas.push(...tanda);
  }
  return guardadas;
}

export async function listarLineasPedido(pedidoId) {
  const snap = await getDocs(detallePedidoRef(pedidoId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Solo las líneas de un cliente dentro de un pedido. Usa el índice simple
// que Firestore crea solo, así que no hay que configurar nada.
export async function listarLineasDeCliente(pedidoId, clienteId) {
  const snap = await getDocs(query(detallePedidoRef(pedidoId), where("clienteId", "==", clienteId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function suscribirLineasPedido(pedidoId, callback) {
  return onSnapshot(detallePedidoRef(pedidoId), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// Cambiar o borrar una línea actualiza también el resumen del pedido,
// en la misma operación, para que nunca queden distintos.
export async function actualizarLinea(pedidoId, lineaId, cambios, resumen) {
  const lote = writeBatch(db);
  lote.update(doc(db, "pedidos", pedidoId, "detalle", lineaId), cambios);
  if (resumen) lote.update(doc(db, "pedidos", pedidoId), { resumen });
  return lote.commit();
}

export async function eliminarLinea(pedidoId, lineaId, resumen) {
  const lote = writeBatch(db);
  lote.delete(doc(db, "pedidos", pedidoId, "detalle", lineaId));
  if (resumen) lote.update(doc(db, "pedidos", pedidoId), { resumen });
  return lote.commit();
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
    ganancia,
    resumen: calcularResumenPedido(lineas)
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
