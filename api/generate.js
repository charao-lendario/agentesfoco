import OpenAI from 'openai';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, systemInstruction, model } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key server configuration missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openai = new OpenAI({ apiKey });

    // Adiciona a instrução do sistema como a primeira mensagem se existir
    const finalMessages = systemInstruction
      ? [{ role: 'system', content: systemInstruction }, ...messages]
      : messages;

    const selectedModel = model || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: finalMessages,
    });

    return new Response(JSON.stringify({ text: completion.choices[0].message.content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error processing request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}