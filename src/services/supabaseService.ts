import { createClient } from '@supabase/supabase-js';

// 🚨 Substitua pelas suas variáveis de ambiente ou coloque no .env (Recomendado)
const SUBS_URL = import.meta.env.VITE_SUPABASE_URL;
const SUBS_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET_NAME = 'comprovantes'; // Nome do seu bucket no Supabase Storage

// Debug: Log das variáveis (apenas em desenvolvimento)
if (import.meta.env.DEV) {
    console.log('🔍 Debug Supabase:', {
        URL: SUBS_URL ? `${SUBS_URL.substring(0, 30)}...` : '❌ Não configurado',
        KEY: SUBS_KEY ? `${SUBS_KEY.substring(0, 20)}...` : '❌ Não configurado',
        BUCKET: BUCKET_NAME
    });
}

// Cria o cliente apenas se as chaves existirem
const supabase = (SUBS_URL && SUBS_KEY)
    ? createClient(SUBS_URL, SUBS_KEY)
    : null;

export const uploadImageToSupabase = async (file: File, bucketName: string = BUCKET_NAME): Promise<string | null> => {
    if (!supabase) {
        const errorMsg = "Supabase não configurado! Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env";
        console.error(errorMsg);
        console.error("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL ? "✅ Configurado" : "❌ Não configurado");
        console.error("VITE_SUPABASE_ANON_KEY:", import.meta.env.VITE_SUPABASE_ANON_KEY ? "✅ Configurado" : "❌ Não configurado");
        throw new Error(errorMsg);
    }

    try {
        // Gera um nome único para o arquivo: timestamp_nome-original
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        console.log('📤 Iniciando upload para Supabase:', {
            bucket: bucketName,
            fileName: fileName,
            fileSize: `${(file.size / 1024).toFixed(2)} KB`
        });

        // 1. Upload do arquivo diretamente
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Erro no upload Supabase:', error);
            console.error('Detalhes completos:', JSON.stringify(error, null, 2));

            // Mensagens de erro mais específicas
            if (error.message?.includes('new row violates row-level security')) {
                throw new Error('Erro de permissão: Configure as políticas RLS do bucket no Supabase para permitir uploads.');
            }
            if (error.message?.includes('Bucket not found')) {
                throw new Error(`Bucket "${bucketName}" não encontrado. Crie o bucket no painel do Supabase.`);
            }
            if ('statusCode' in error && Number(error.statusCode) === 403) {
                throw new Error('Acesso negado. Verifique as políticas de acesso do bucket no Supabase.');
            }

            throw new Error(`Erro no upload: ${error.message || 'Erro desconhecido'}`);
        }

        // 2. Obter URL Pública
        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Não foi possível obter a URL pública da imagem');
        }

        return publicUrlData.publicUrl;

    } catch (error: any) {
        console.error('Falha ao enviar para o Supabase:', error);

        // Mensagens de erro mais específicas
        if (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
            throw new Error('Erro de conexão com Supabase. Verifique sua internet e as configurações do Supabase.');
        }

        if (error.message?.includes('not configured')) {
            throw new Error('Supabase não está configurado. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
        }

        throw error;
    }
};

export const uploadBase64ToSupabase = async (
    base64Data: string,
    fileNamePrefix: string = 'despesa',
    bucketName: string = 'despesas'
): Promise<string | null> => {
    try {
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const file = new File([blob], `${fileNamePrefix}_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
        return await uploadImageToSupabase(file, bucketName);
    } catch (err) {
        console.error('Erro ao converter base64 e enviar para o Supabase:', err);
        throw err;
    }
};

