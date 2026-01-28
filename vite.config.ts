import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Redireciona chamadas /api para localhost:3000 (padrão do vercel dev)
      // Isso permite testar o frontend com npm run dev conectando ao backend local
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});