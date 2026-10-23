// Completa/redacta el párrafo de "Devolución" (el texto que se comparte
// por WhatsApp — ver _armarMensajeCasoWhatsapp() en umbral-0/casos.html)
// a partir de lo que tipeó la dupla, usando como referencia la estructura
// de las planillas de ejemplo que manda gobierno (Plantillas_de_formatos_
// de_devoluciones.pdf). Pedido de Agustina (23/10/2026): "ya que la
// devolucion es tan importante... podes agregar un editor de texto de IA
// para que ellos escriban y la IA lo complete tomando la referencia de la
// plantilla?".
//
// Función aparte de corregir-texto.js (no un modo más de esa) porque hace
// algo distinto: esa solo corrige redacción sin cambiar el contenido;
// esta reescribe/estructura el texto como un párrafo de Devolución — y la
// regla de no inventar datos pesa más acá, así que tiene su propio
// prompt, no uno compartido con ramas.
//
// Requiere la misma variable de entorno ANTHROPIC_API_KEY que
// corregir-texto.js (configurada en Netlify).
//
// Uso: POST /.netlify/functions/completar-devolucion  { "texto": "..." }
//      → { "texto_completado": "..." }

const MAX_CARACTERES = 4000;

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
    return respuesta(400, { error: 'Escribí algo primero — no hay nada para completar.' });
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
          'Redactás el párrafo de "Devolución" que un equipo territorial de calle (Umbral 0, Buenos Aires) ' +
          'comparte por WhatsApp después de un contacto con una persona en situación de calle. Te llega el ' +
          'texto tal cual lo tipeó la dupla — puede ser breve, en viñetas, desordenado, o ya bastante completo.\n\n' +
          'Tu trabajo: convertirlo en un párrafo narrativo breve, profesional y en español rioplatense, tomando ' +
          'como referencia la estructura de las planillas de devolución que pide gobierno — cubriendo, SOLO ' +
          'cuando la dupla lo haya mencionado, estos puntos en este orden: (1) motivo de la situación de calle, ' +
          '(2) estado de salud y medicación, (3) cómo se sostiene económicamente, (4) redes familiares o ' +
          'sociales, (5) cómo fue el diálogo con la persona, (6) qué se le ofreció y qué respondió.\n\n' +
          'Reglas estrictas, sin excepción:\n' +
          '- NUNCA inventes ni asumas un dato que no esté explícito en el texto que te dieron (diagnósticos, ' +
          'direcciones, edades, nombres, qué se ofreció, cómo respondió, etc.).\n' +
          '- Si la dupla no mencionó alguno de los 6 puntos, simplemente omitilo del párrafo — no lo rellenes ' +
          'con frases genéricas, suposiciones ni placeholders como "no se especifica".\n' +
          '- No agregues encabezados, viñetas, comillas, ni comentarios tuyos — tu respuesta es ÚNICAMENTE el ' +
          'párrafo final, listo para pegar en el mensaje.\n' +
          '- Si el texto que te dieron es tan escueto que no alcanza para armar ni una oración con sentido ' +
          '(por ejemplo una sola palabra suelta), devolvé el texto original sin cambios en vez de inventar ' +
          'contenido para rellenar.',
        messages: [{ role: 'user', content: texto }],
      }),
    });

    if (!resp.ok) {
      const cuerpoError = await resp.text();
      return respuesta(502, { error: 'Error de la IA: ' + cuerpoError.slice(0, 300) });
    }

    const data = await resp.json();
    const textoCompletado = (data.content && data.content[0] && data.content[0].text) || texto;
    return respuesta(200, { texto_completado: textoCompletado.trim() });
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
