// Subdominios propios (huehaci.com) de la plataforma. Arrancó como un
// único caso (23/9/2026, Umbral 0: "cuando entras a cada una tendria que
// llevarte a umbral0.huehaci.com") y se extiende acá (25/11/2026, pedido
// de Agustina: "esta web tiene que tener el dominio releva.huehaci.com...
// y censoflash.huehaci.com") — el archivo pasó a llamarse
// "dominios-propios" (antes "umbral0-domain") porque ya no es de un solo
// dominio.
//
// La raíz del sitio (`/`) sirve Censo Flash (index.html del repo) para
// cualquier dominio sin regla propia acá (el `.netlify.app` default,
// soluciones.huehaci.com, y también censoflash.huehaci.com en cuanto
// Agustina lo dé de alta en Netlify/DNS — no necesita ninguna regla
// nueva, ya es lo que la raíz sirve hoy). Esta función SOLO actúa cuando
// hace falta mandar la raíz a otro lado que no sea Censo Flash — hoy,
// umbral0.huehaci.com (a Umbral 0) y releva.huehaci.com (a la plataforma
// general, plataforma.html) — y únicamente en la raíz exacta (ver
// `config.path` más abajo): los assets/config/shared compartidos, y las
// páginas que ya viven bajo /umbral-0/ o en la raíz del repo, se sirven
// igual sin pasar por acá.
//
// Son redirects reales (Response.redirect), no rewrites transparentes:
// así el navegador queda en la URL real donde vive el archivo
// (/umbral-0/index.html, /plataforma.html) y todos los links relativos
// de adentro de cada página (`./casos.html`, `../dashboard.html`, etc.)
// siguen resolviendo exactamente igual que siempre, sin necesidad de
// mantener una lista de excepciones acá.
const DESTINO_POR_DOMINIO = {
  'umbral0.huehaci.com': '/umbral-0/index.html',
  'releva.huehaci.com': '/plataforma.html',
};

export default async (request) => {
  const url = new URL(request.url);
  const destino = DESTINO_POR_DOMINIO[url.hostname];
  if (destino) {
    return Response.redirect(url.origin + destino, 302);
  }
};

export const config = { path: '/' };
