import { GoogleGenAI } from '@google/genai';

// DEFINITIVO: Usar Edge Runtime.
// Node.js serverless causa buffering e timeouts em streams de chat.
export const config = {
  runtime: 'edge',
};

/**
 * Converte mensagens do formato OpenAI para o formato Gemini `contents`.
 * OpenAI: [{ role: "user"|"assistant", content: "text" | [{type:"text",text:"..."},{type:"image_url",...}] }]
 * Gemini: [{ role: "user"|"model", parts: [{ text: "..." }] }]
 */
function convertMessagesToContents(messages) {
  if (!messages || !Array.isArray(messages)) return [];

  return messages.map(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          // Converte data URI para inlineData do Gemini
          const match = item.image_url.url.match(/^data:(.+?);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            });
          }
        }
      }
    }

    // Gemini não aceita parts vazio
    if (parts.length === 0) {
      parts.push({ text: " " });
    }

    return { role, parts };
  });
}

export default async function handler(req) {
  // Configuração CORS Padrão
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 1. Handle OPTIONS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. Apenas POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    // 3. Parse Request
    const body = await req.json();

    // Suporta tanto formato Gemini (contents) quanto OpenAI (messages)
    const contents = body.contents || convertMessagesToContents(body.messages);
    const systemInstruction = body.systemInstruction;
    const model = body.model;

    // Validação API Key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key missing. Configure API_KEY nas variáveis de ambiente.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 4. Inicializa Gemini
    const ai = new GoogleGenAI({ apiKey });

    // Ignora modelo OpenAI e usa Gemini
    // gemini-2.0-flash é estável e rápido
    const targetModel = (model && model.startsWith('gemini')) ? model : 'gemini-2.0-flash';

    // 5. Gera Stream
    const geminiStream = await ai.models.generateContentStream({
      model: targetModel,
      contents: contents,
      config: {
        systemInstruction: systemInstruction
      },
    });

    // 6. Cria ReadableStream Nativo (Web Standard)
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of geminiStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err) {
          console.error("Stream Error:", err);
          try {
            controller.enqueue(encoder.encode(`\n\n[Erro interrompeu a resposta: ${err.message}]`));
          } catch(e) {}
          controller.error(err);
        }
      },
    });

    // 7. Retorna Response com Headers de Streaming
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("Fatal Handler Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Error" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
