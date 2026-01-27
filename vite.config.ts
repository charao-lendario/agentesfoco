import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import OpenAI from 'openai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'api-server-middleware',
        configureServer(server) {
          server.middlewares.use('/api/generate', async (req, res, next) => {
            console.log(">>> [PROXY] Recebida requisição para /api/generate");

            if (req.method !== 'POST') {
              console.log(">>> [PROXY] Método ignorado:", req.method);
              next();
              return;
            }

            let body = '';
            req.on('data', (chunk) => {
              body += chunk.toString();
            });

            req.on('end', async () => {
              try {
                console.log(">>> [PROXY] Corpo recebido (tamanho):", body.length);
                const { messages, systemInstruction, model } = JSON.parse(body);

                const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
                console.log(">>> [PROXY] Chave API:", apiKey ? "OK (Inicia com " + apiKey.substring(0, 5) + "...)" : "AUSENTE");

                if (!apiKey) {
                  throw new Error('API Key missing in .env file (OPENAI_API_KEY required)');
                }

                const openai = new OpenAI({ apiKey });
                const selectedModel = model || 'gpt-4o-mini';
                console.log(">>> [PROXY] Modelo:", selectedModel);

                const finalMessages = systemInstruction
                  ? [{ role: 'system', content: systemInstruction }, ...messages]
                  : messages;

                console.log(">>> [PROXY] Enviando para OpenAI...");
                const completion = await openai.chat.completions.create({
                  model: selectedModel,
                  messages: finalMessages,
                });

                console.log(">>> [PROXY] Resposta recebida da OpenAI!");
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: completion.choices[0].message.content }));
              } catch (error: any) {
                console.error('>>> [PROXY] ERRO FATAL:', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error.message || 'Error processing request' }));
              }
            });
          });
        },
      },
    ],
  };
});