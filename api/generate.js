import OpenAI from 'openai';

// Edge Runtime para streaming sem buffering/timeout
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await req.json();
    const messages = body.messages || [];
    const systemInstruction = body.systemInstruction;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key ausente. Configure OPENAI_API_KEY nas variáveis de ambiente.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Monta array de mensagens com system prompt no início
    const openaiMessages = [];
    if (systemInstruction) {
      openaiMessages.push({ role: 'system', content: systemInstruction });
    }
    // Mensagens já chegam no formato OpenAI (role: user/assistant, content: string ou array)
    openaiMessages.push(...messages);

    const openaiStream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: openaiMessages,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of openaiStream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err) {
          console.error('Stream Error:', err);
          try {
            controller.enqueue(encoder.encode(`\n\n[Erro interrompeu a resposta: ${err.message}]`));
          } catch (e) {}
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Fatal Handler Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
