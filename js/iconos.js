// Íconos de la interfaz: todos salen del sprite img/iconos.svg (ver GUIA-LOGO-E-ICONOS.md).
// Toman el color del texto que los rodea, igual que una letra.
export function icono(nombre) {
  return `<svg class="icono" aria-hidden="true"><use href="img/iconos.svg#${nombre}"/></svg>`;
}

// Botón cuadrado de solo ícono (editar, eliminar, guardar, cancelar).
// El tipo es a la vez el nombre del ícono y la clase que le da su color.
export function crearBotonIcono(tipo, titulo, alHacerClic) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = `boton-icono ${tipo}`;
  boton.title = titulo;
  boton.setAttribute("aria-label", titulo);
  boton.innerHTML = icono(tipo);
  boton.addEventListener("click", alHacerClic);
  return boton;
}
