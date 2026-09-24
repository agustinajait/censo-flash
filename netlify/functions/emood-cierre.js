// Reenvía el cierre de jornada a E-Mood (RPC registrar_cierre_censo) — la
// plataforma externa que usa Umbral 0 para validar el pago de las duplas.
// Existe como función serverless porque necesita el secreto de la
// organización (EMOOD_SECRET) y la API key del proyecto Supabase de
// E-Mood (EMOOD_SB_KEY) — ninguno de los dos puede viajar al navegador:
// cualquiera podría leerlos con "ver código fuente" y falsificar cierres
// de jornada ajenos, que es justo lo que ese secreto está pensado para
// evitar. Mismo motivo que corregir-texto.js con ANTHROPIC_API_KEY.
//
// Requiere, en Netlify (Site configuration → Environment variables):
//   EMOOD_SUPABASE_URL — URL base del proyecto Supabase de E-Mood
//                         (ej: https://xxxxxxxx.supabase.co)
//   EMOOD_SB_KEY        — la apikey de ese proyecto (E-Mood → Integraciones)
//   EMOOD_SECRET        — el secreto de la organización (p_secret)
//
// Uso: POST /.netlify/functions/emood-cierre
//      { p_dupla, p_fecha, p_responsable, p_horario, p_cantidad_registros,
//        p_inconvenientes, p_situaciones_urgentes, p_observaciones }
//      → agrega p_secret server-side y reenvía tal cual a E-Mood.

const CAMPOS_ESPERADOS = [
  'p_dupla', 'p_fecha', 'p_responsable', 'p_horario', 'p_cantidad_registros',
  'p_inconvenientes', 'p_situaciones_urgentes', 'p_observaciones',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respuesta(405, { error: 'Método no permitido.' });
  }

  const { EMOOD_SUPABASE_URL, EMOOD_SB_KEY, EMOOD_SECRET } = process.env;
  if (!EMOOD_SUPABASE_URL || !EMOOD_SB_KEY || !EMOOD_SECRET) {
    return respuesta(500, { error: 'Falta configurar EMOOD_SUPABASE_URL / EMOOD_SB_KEY / EMOOD_SECRET en las variables de entorno de Netlify.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return respuesta(400, { error: 'El cuerpo del pedido no es JSON válido.' });
  }

  if (!body.p_dupla || !body.p_fecha) {
    return respuesta(400, { error: 'Faltan p_dupla y/o p_fecha.' });
  }

  const payload = { p_secret: EMOOD_SECRET };
  CAMPOS_ESPERADOS.forEach(campo => { payload[campo] = body[campo] != null ? String(body[campo]) : ''; });

  try {
    const resp = await fetch(`${EMOOD_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/registrar_cierre_censo`, {
      method: 'POST',
      headers: {
        apikey: EMOOD_SB_KEY,
        Authorization: `Bearer ${EMOOD_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const texto = await resp.text();
    if (!resp.ok) {
      return respuesta(502, { error: `E-Mood respondió ${resp.status}`, detalle: texto.slice(0, 500) });
    }
    return respuesta(200, { ok: true, detalle: texto });
  } catch (e) {
    return respuesta(502, { error: 'No se pudo contactar a E-Mood: ' + (e.message || 'error desconocido') });
  }
};

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
