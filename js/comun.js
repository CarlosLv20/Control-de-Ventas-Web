// Utilidades compartidas entre páginas.

// Aviso flotante (rojo) para errores que no tienen un lugar fijo en la
// pantalla, por ejemplo cuando falla guardar un cambio hecho al instante.
export function mostrarAviso(texto) {
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

export const AVISO_CONEXION = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";

// Celda de tabla con texto (seguro: nunca se interpreta como HTML) o con un elemento.
export function crearCelda(clase = "", contenido = "") {
  const td = document.createElement("td");
  if (clase) td.className = clase;
  if (contenido instanceof Node) td.appendChild(contenido);
  else td.textContent = contenido;
  return td;
}

// Para comparar y buscar nombres sin importar acentos, mayúsculas ni espacios de más.
export function normalizarNombre(nombre) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();
}
