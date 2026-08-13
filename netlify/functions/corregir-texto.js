// Corrige la redacción de un texto usando la API de Anthropic (Claude).
// Existe como función serverless — y no como código directo en
// umbral-0/casos.html — porque necesita la clave de la API, que jamás
// puede vivir en código que corre en el navegador (cualquiera podría
// leerla y usarla a costa de la cuenta).
//
// Requiere la variable de entorno ANTHROPIC_API_KEY configurada en
// Netlify (Site configuration → Environment variables). Sin eso, la
// función responde 500 con un mensaje claro en vez de fallar en silencio.
//
// Uso: POST /.netlify/functions/corregir-texto  { "texto": "..." }
//      → { "texto_corregido": "..." }

const MAX_CARACTERES = 6000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respuesta(405, { error: 'Método no permitido.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respuesta(500, { error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Netlify.' });
  }

  let texto;
  try {
    ({ texto } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return respuesta(400, { error: 'El cuerpo del pedido no es JSON válido.' });
  }
  if (!texto || !texto.trim()) {
    return respuesta(400, { error: 'Falta el texto a corregir.' });
  }
  if (texto.length > MAX_CARACTERES) {
    return respuesta(400, { error: `El texto es demasiado largo (máximo ${MAX_CARACTERES} caracteres).` });
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:
          'Corregís la redacción de informes sociales que escribe un equipo territorial de calle en Buenos Aires, ' +
          'para un dispositivo de inclusión social (Umbral 0). Mejorás ortografía, gramática, claridad y tono ' +
          'profesional, en español rioplatense. No inventás datos ni agregás información que no esté en el texto ' +
          'original — si algo es ambiguo, lo dejás como está. No agregás encabezados, comillas ni comentarios: ' +
          'tu respuesta es únicamente el texto corregido, listo para pegar en el informe.',
        messages: [{ role: 'user', content: texto }],
      }),
    });

    if (!resp.ok) {
      const cuerpoError = await resp.text();
      return respuesta(502, { error: 'Error de la IA: ' + cuerpoError.slice(0, 300) });
    }

    const data = await resp.json();
    const textoCorregido = (data.content && data.content[0] && data.content[0].text) || texto;
    return respuesta(200, { texto_corregido: textoCorregido.trim() });
  } catch (e) {
    return respuesta(500, { error: e.message || 'Error desconocido llamando a la IA.' });
  }
};

function respuesta(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
