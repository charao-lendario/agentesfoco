import { GoogleGenAI } from '@google/genai';

// DEFINITIVO: Usar Edge Runtime. 
// Node.js serverless causa buffering e timeouts em streams de chat.
export const config = {
  runtime: 'edge',
};

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
    const { contents, systemInstruction, model } = await req.json();
    
    // Validação API Key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key missing' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    // 4. Inicializa Gemini
    const ai = new GoogleGenAI({ apiKey });
    
    // Força modelo rápido se não especificado para evitar lag inicial
    // gemini-3-flash-preview é MUITO mais rápido no TTFB (Time to First Byte)
    const targetModel = model || 'gemini-3-flash-preview';

    // 5. Gera Stream
    const geminiStream = await ai.models.generateContentStream({
      model: targetModel,
      contents: contents,
      config: { 
        systemInstruction: systemInstruction 
      },
    });

    // 6. Cria ReadableStream Nativo (Web Standard)
    // Isso conecta diretamente a saída do Gemini à resposta HTTP sem buffers intermediários
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
          // Tenta avisar o frontend do erro antes de fechar
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