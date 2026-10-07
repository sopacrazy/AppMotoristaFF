import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente, incluindo a porta do backend
  const env = loadEnv(mode, ".", "");
  const backendPort = env.PORT || 4002; // Pega a porta do .env (4002 - mesma do server.js)

  return {
    server: {
      port: 4002,
      host: "0.0.0.0",
      // 🚨 CONFIGURAÇÃO DO PROXY
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${backendPort}`, // Usa IPv4, como o servidor Express
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""), // Remove /api antes de enviar ao backend
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
        manifest: {
          name: "FortFruit",
          short_name: "FortFruit",
          description: "App de Entregas Offline-First",
          theme_color: "#16a34a",
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
        devOptions: {
          enabled: true, // Permite testar o PWA em desenvolvimento (localhost)
        },
      }),
    ],
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
