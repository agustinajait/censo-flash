// Credencial de acceso "total" al dashboard: ve todos los proyectos, la
// vista global y los controles de carga de datos.
//
// El acceso de cada CLIENTE es por proyecto, no acá — vive en
// `clientPassword` dentro de config/<proyecto>.js. Un cliente que entra con
// la contraseña de su proyecto ve únicamente ese proyecto (dos áreas de GCBA
// distintas, como Censo Flash y Umbral 0, nunca ven la información de la otra).
window.PLATFORM_AUTH = {
  admin: 'Camilo2016#',
};

window.PLATFORM_NOMBRE = 'Plataforma de Gestión de Operativos de Relevamiento Territorial';
