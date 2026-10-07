/// <reference types="vite/client" />

// Configuração da URL da API
// No Android, não temos proxy reverso, então precisamos da URL completa.
// No navegador (DEV), o proxy do Vite lida com /api

const API_BASE = import.meta.env.VITE_API_URL || "";

// ============================================
// 🚨 CONTROLE MANUAL DE AMBIENTE
// ============================================
// Para DESENVOLVIMENTO (localhost): mude para true
// Para PRODUÇÃO: deixe como false (como está agora)
// ============================================
const FORCE_DEVELOPMENT = false; // 👈 true = local | false = produção

// Detectar se está rodando no Android
const isAndroid =
  typeof window !== "undefined" &&
  (window as any).Capacitor?.getPlatform() === "android";

// Função helper para construir URLs da API
export const getApiUrl = (endpoint: string) => {
  // Remove barra inicial do endpoint para evitar //
  const cleanEndpoint = endpoint.startsWith("/")
    ? endpoint.substring(1)
    : endpoint;

  // 🚨 DESENVOLVIMENTO: Usa proxy do Vite (localhost) ou IP do emulador
  if (FORCE_DEVELOPMENT) {
    // No Android, precisa usar 10.0.2.2 para acessar localhost do PC
    // No navegador, usa o proxy do Vite
    if (isAndroid) {
      // Android: usa IP do emulador (10.0.2.2) ou IP local da máquina
      // Para dispositivo físico, você precisa do IP local da sua máquina na rede
      const devHost = import.meta.env.VITE_DEV_HOST || "10.0.2.2"; // 10.0.2.2 = localhost no emulador
      const devPort = import.meta.env.VITE_DEV_PORT || "4002"; // Mesma porta do server.js

      // Remove prefixo 'api/' se existir (o backend não espera /api)
      const finalEndpoint = cleanEndpoint.startsWith("api/")
        ? cleanEndpoint.substring(4)
        : cleanEndpoint;

      return `http://${devHost}:${devPort}/${finalEndpoint}`;
    } else {
      // Navegador: usa proxy do Vite que redireciona /api/* para http://localhost:3005/*
      const finalEndpoint = cleanEndpoint.startsWith("api/")
        ? cleanEndpoint
        : `api/${cleanEndpoint}`;

      return `/${finalEndpoint}`;
    }
  }

  // 🚨 PRODUÇÃO: Usa URL completa do .env ou a oficial
  const base = API_BASE
    ? API_BASE.endsWith("/")
      ? API_BASE
      : `${API_BASE}/`
    : "https://academy.fortfruit.com.br/";

  // REMOVE 'api/' do início em produção para garantir compatibilidade com a raiz do servidor
  const finalEndpoint = cleanEndpoint.startsWith("api/")
    ? cleanEndpoint.substring(4)
    : cleanEndpoint;

  return `${base}${finalEndpoint}`;
};

// Função para comparar versões (ex: "2.1.0" > "2.0.9")
export const isNewerVersion = (
  serverVersion: string,
  currentVersion: string,
) => {
  if (!serverVersion || !currentVersion) return false;

  const s = serverVersion.split(".").map(Number);
  const c = currentVersion.split(".").map(Number);

  for (let i = 0; i < Math.max(s.length, c.length); i++) {
    const sv = s[i] || 0;
    const cv = c[i] || 0;
    if (sv > cv) return true;
    if (sv < cv) return false;
  }
  return false;
};
