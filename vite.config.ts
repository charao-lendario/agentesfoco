import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'api-server-middleware',
        configureServer(server) {
          server.middlewares.use('/api/generate', async (req, res, next) => {
            if (req.method !== 'POST') {
              next();
              return;
            }

            let body = '';
            req.on('data', (chunk) => {
              body += chunk.toString();
            });

            req.on('end', async () => {
              try {
                const { contents, systemInstruction, model } = JSON.parse(body);
                const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || env.API_KEY || process.env.API_KEY;

                if (!apiKey) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'API Key missing in .env file' }));
                  return;
                }

                const ai = new GoogleGenAI({ apiKey });
                const selectedModel = model || 'gemini-3-pro-preview';

                const response = await ai.models.generateContent({
                  model: selectedModel,
                  contents: contents,
                  config: {
                    systemInstruction: systemInstruction,
                  },
                });

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: response.text }));
              } catch (error) {
                console.error('Gemini API Error:', error);
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