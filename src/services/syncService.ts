import { getPendingUploads, deletePendingUpload, updatePendingUploadUrl } from './offlineStorage';
import { uploadImageToSupabase } from './supabaseService';
import { getApiUrl } from '../apiConfig';
import { isOnline } from './networkService';
import { DeliveryStatus } from '../../types';

// Reusing your backend update logic (slightly adapted)
const updateStatusOnBackend = async (
    numSeq: string,
    status: DeliveryStatus,
    fotoUrl: string,
    capturedAtUtc: string,
    isPartial: boolean = false
) => {
    const apiUrl = getApiUrl(`api/atualizar_status/${numSeq}`);
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: status === DeliveryStatus.COMPLETED ? 'CONCLUIDA' : 'NAO_ENTREGUE',
                fotoUrl: fotoUrl,
                capturedAtUtc: capturedAtUtc,
                isPartial: isPartial,
            }),
        });
        return response.ok;
    } catch (error) {
        console.error('Sync error:', error);
        return false;
    }
};

export const syncPendingUploads = async (onSuccessCallback?: (deliveryId: string) => void) => {
    if (!isOnline()) {
        console.log('Sem internet. Sincronização abortada.');
        return;
    }

    const pendingItems = await getPendingUploads();

    if (pendingItems.length === 0) return;

    console.log(`Iniciando sincronização de ${pendingItems.length} itens...`);

    for (const item of pendingItems) {
        try {
            // 1. Usa URL já obtida (Supabase teve sucesso antes mas backend falhou)
            //    ou faz novo upload se não há URL salva
            let imageUrl = item.imageUrl || null;

            if (!imageUrl) {
                const file = new File([item.imageBlob], `offline_${item.deliveryId}.jpg`, { type: 'image/jpeg' });
                imageUrl = await uploadImageToSupabase(file);

                // Persiste a URL imediatamente para que próximos retries não re-façam upload
                if (imageUrl && item.id != null) {
                    await updatePendingUploadUrl(item.id, imageUrl);
                }
            }

            if (imageUrl) {
                // 2. Grava status no backend com timestamp e flag originais
                const success = await updateStatusOnBackend(
                    item.deliveryId,
                    item.status,
                    imageUrl,
                    item.capturedAtUtc,
                    item.isPartial || false
                );

                if (success) {
                    await deletePendingUpload(item.id!);
                    console.log(`Item ${item.deliveryId} sincronizado com sucesso!`);
                    if (onSuccessCallback) {
                        onSuccessCallback(item.deliveryId);
                    }
                }
                // Se backend falhou: item permanece na fila com imageUrl salva,
                // próximo retry pula o upload e tenta só o backend
            }
        } catch (err) {
            console.error(`Erro ao sincronizar item ${item.deliveryId}:`, err);
        }
    }
};
