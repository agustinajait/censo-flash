// Registro central de proyectos de la plataforma. Cargar este script después
// de cada config/<proyecto>.js. Para sumar un proyecto nuevo: crear su
// config/<proyecto>.js (mismo esquema que censo-flash.js), agregar el
// <script> en plataforma.html y dashboard.html, y sumarlo acá.
window.PLATFORM_PROJECTS = [
  window.PROJECT_CONFIG_CENSO_FLASH,
  window.PROJECT_CONFIG_UMBRAL_0,
].filter(Boolean);
