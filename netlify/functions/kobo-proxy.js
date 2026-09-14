// Proxy server-side a la API de KoBo Toolbox — existe porque el navegador
// no puede llamar a kf.kobotoolbox.org directo: la API de KoBo no habilita
// CORS para dominios arbitrarios, así que un fetch() desde el dashboard
// falla en silencio con "Failed to fetch" (confirmado en producción,
// sept/2026, al conectar la vista de Umbral 0). Esta función corre
// server-to-server (sin CORS) y devuelve la respuesta de KoBo tal cual.
//
// El token de KoBo ya viaja embebido en config/<proyecto>.js y se manda
// acá como query param — a diferencia de corregir-texto.js con
// ANTHROPIC_API_KEY, esta función NO esconde un secreto nuevo, solo
// resuelve el problema de CORS. (Si en algún momento se quiere sacar el
// token del bundle del cliente, ahí sí conviene moverlo a una variable de
// entorno de Netlify y dejar de recibirlo por query param.)
//
// Uso: GET /.netlify/functions/kobo-proxy?url=<url completa de la API de KoBo>&token=<token>
//      → devuelve el JSON de KoBo tal cual (incluye "next" para paginar).
//
// `url` se valida contra un prefijo fijo para que esta función no se pueda
// usar como proxy abierto hacia cualquier otro sitio (SSRF).

const PREFIJO_PERMITIDO = 'https://kf.kobotoolbox.org/api/v2/assets/';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return respuesta(405, { error: 'Método no permitido.' });
  }

  const { url, token } = event.queryStringParameters || {};
  if (!url || !token) {
    return respuesta(400, { error: 'Faltan los parámetros "url" y/o "token".' });
  }
  if (!url.startsWith(PREFIJO_PERMITIDO)) {
    return respuesta(400, { error: 'URL no permitida.' });
  }

  try {
    const resp = await fetch(url, { headers: { Authorization: `Token ${token}` } });
    const data = await resp.json();
    if (!resp.ok) {
      return respuesta(resp.status, { error: `KoBo respondió ${resp.status}`, detalle: data });
    }
    return respuesta(200, data);
  } catch (e) {
    return respuesta(502, { error: 'No se pudo contactar a KoBo: ' + (e.message || 'error desconocido') });
  }
};

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
