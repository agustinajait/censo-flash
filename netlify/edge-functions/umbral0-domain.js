// Subdominio dedicado a Umbral 0 (23/9/2026, pedido de Agustina: "cuando
// entras a cada una tendria que llevarte a umbral0.huehaci.com"). La raíz
// del sitio (`/`) sirve Censo Flash (index.html del repo) para el resto de
// los dominios — este edge function solo actúa cuando el pedido llega por
// umbral0.huehaci.com Y es justo la raíz, para no interferir con nada más
// (los assets/config/shared compartidos, y las páginas que ya viven bajo
// /umbral-0/, se sirven exactamente igual sin pasar por acá — ver el
// `config.path` más abajo, que restringe esto a "/" nada más).
//
// Es un redirect real (Response.redirect), no un rewrite transparente: así
// el navegador queda en la URL real donde vive el archivo
// (/umbral-0/index.html) y todos los links relativos de adentro de Umbral 0
// (`./casos.html`, `../dashboard.html` para volver a Censo Flash, etc.)
// siguen resolviendo exactamente igual que siempre, sin necesidad de
// mantener una lista de excepciones acá.
export default async (request) => {
  const url = new URL(request.url);
  if (url.hostname === 'umbral0.huehaci.com') {
    return Response.redirect(url.origin + '/umbral-0/index.html', 302);
  }
};

export const config = { path: '/' };
