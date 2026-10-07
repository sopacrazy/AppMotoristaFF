/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly PORT?: string;
  readonly TZ_OFFSET?: string;
  readonly DB_HOST?: string;
  readonly DB_USER?: string;
  readonly DB_PASSWORD?: string;
  readonly DB_NAME?: string;
  readonly DB_HOST_OCORRENCIAS?: string;
  readonly DB_USER_OCORRENCIAS?: string;
  readonly DB_PASSWORD_OCORRENCIAS?: string;
  readonly DB_NAME_OCORRENCIAS?: string;
  readonly GEMINI_API_KEY?: string;
  // Adicione outras variáveis de ambiente aqui conforme necessário
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

