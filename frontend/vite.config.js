import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load this folder's .env / .env.local (never expose server keys here).
  const env = loadEnv(mode, frontendRoot, '');
  const frontendPort = Number(env.FRONTEND_PORT ?? 5173);
  const backendUrl = env.BACKEND_URL ?? 'http://localhost:8787';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: frontendPort,
    },
  };
});
