import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente baseadas no modo atual (development/production)
  // O terceiro argumento '' garante que carregue todas as env vars do sistema (como as da Vercel)
  // Fix: Cast process to any to resolve "Property 'cwd' does not exist on type 'Process'" error
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Isso substitui 'process.env.API_KEY' no código pelo valor real durante o build
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});