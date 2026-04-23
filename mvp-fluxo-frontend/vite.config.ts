import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Importe o módulo 'path'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  plugins: [react()],
  resolve: {
    alias: {
      // Adicione este alias para o Vite
      '~api': path.resolve(__dirname, './src/api'),
      // Se você quiser um alias geral para 'src', pode adicionar:
      // '@': path.resolve(__dirname, './src'),
    },
  },
});
