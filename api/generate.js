import OpenAI from 'openai';

// Edge Runtime para streaming sem buffering/timeout
export const config = {
  runtime: 'edge',
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
    const provider = body.provider || 'openai';

    if (provider === 'claude') {
      return handleClaude(messages, systemInstruction, corsHeaders);
    } else {
      return handleOpenAI(messages, systemInstruction, corsHeaders);
    }
  } catch (error) {
    console.error('Fatal Handler Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleOpenAI(messages, systemInstruction, corsHeaders) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API Key ausente. Configure OPENAI_API_KEY nas variáveis de ambiente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const openai = new OpenAI({ apiKey });

  const openaiMessages = [];
  if (systemInstruction) {
    openaiMessages.push({ role: 'system', content: systemInstruction });
  }
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
        console.error('OpenAI Stream Error:', err);
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
}

async function handleClaude(messages, systemInstruction, corsHeaders) {
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'API Key ausente. Configure ANTHROPIC_API_KEY nas variáveis de ambiente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Converte mensagens para formato Claude (filtra system, mantém user/assistant)
  const claudeMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (Array.isArray(m.content)) {
        const contentParts = m.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          } else if (part.type === 'image_url') {
            const url = part.image_url?.url || '';
            if (url.startsWith('data:')) {
              const matches = url.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: matches[1],
                    data: matches[2],
                  },
                };
              }
            }
            return { type: 'text', text: `[Imagem: ${url}]` };
          }
          return { type: 'text', text: String(part) };
        });
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content || ' ' };
    });

  // Claude exige que o primeiro message seja do role 'user'
  while (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
    claudeMessages.shift();
  }

  if (claudeMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhuma mensagem de usuário encontrada.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      messages: claudeMessages,
      stream: true,
    }),
  });

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    console.error('Anthropic API error:', errText);
    return new Response(JSON.stringify({ error: `Erro na API Claude: ${errText}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Parseia SSE stream do Anthropic e extrai text_delta events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = anthropicResponse.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        controller.close();
        return;
      }

      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const event = JSON.parse(data);
                if (
                  event.type === 'content_block_delta' &&
                  event.delta?.type === 'text_delta' &&
                  event.delta.text
                ) {
                  controller.enqueue(encoder.encode(event.delta.text));
                }
              } catch (e) {
                // ignora erros de parse de linha incompleta
              }
            }
          }
        }
        controller.close();
      } catch (err) {
        console.error('Claude Stream Error:', err);
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
}
