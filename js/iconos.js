// Íconos de la interfaz: todos salen del sprite img/iconos.svg (ver GUIA-LOGO-E-ICONOS.md).
// Toman el color del texto que los rodea, igual que una letra.
export function icono(nombre) {
  return `<svg class="icono" aria-hidden="true"><use href="img/iconos.svg#${nombre}"/></svg>`;
}
