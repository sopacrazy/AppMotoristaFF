import { openDB, DBSchema } from 'idb';
import { DeliveryStatus } from '../../types';

export interface PendingUpload {
    id?: number;
    deliveryId: string;
    imageBlob: Blob;
    imageUrl?: string; // URL já obtida do Supabase — quando preenchida, o sync pula o upload
    status: DeliveryStatus;
    capturedAtUtc: string;
    isPartial: boolean;
    createdAt: number;
}

export interface PendingParadaUpload {
    id?: number;
    logId: string;
    imageBlob: Blob;
    finalizedAt: string; // ISO timestamp de quando a foto foi tirada offline
    createdAt: number;
}

interface DeliveryDB extends DBSchema {
    pendingUploads: {
        key: number;
        value: PendingUpload;
        indexes: { 'by-date': number };
    };
    pendingParadaUploads: {
        key: number;
        value: PendingParadaUpload;
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'fasttrack-driver-db';
const DB_VERSION = 3; // Incrementado para suportar fotos de paradas offline

export const initDB = async () => {
    return openDB<DeliveryDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (!db.objectStoreNames.contains('pendingUploads')) {
                const store = db.createObjectStore('pendingUploads', {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                store.createIndex('by-date', 'createdAt');
            }
            if (oldVersion < 3 && !db.objectStoreNames.contains('pendingParadaUploads')) {
                const paradaStore = db.createObjectStore('pendingParadaUploads', {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                paradaStore.createIndex('by-date', 'createdAt');
            }
        },
    });
};

// ── Entregas ──────────────────────────────────────────────
export const savePendingUpload = async (
    deliveryId: string,
    imageBlob: Blob,
    status: DeliveryStatus,
    capturedAtUtc: string,
    isPartial: boolean = false
) => {
    const db = await initDB();
    await db.add('pendingUploads', {
        deliveryId,
        imageBlob,
        status,
        capturedAtUtc,
        isPartial,
        createdAt: Date.now(),
    });
};

export const getPendingUploads = async () => {
    const db = await initDB();
    return db.getAllFromIndex('pendingUploads', 'by-date');
};

export const deletePendingUpload = async (id: number) => {
    const db = await initDB();
    await db.delete('pendingUploads', id);
};

// Salva apenas a URL (Supabase já fez upload, falta só gravar no banco)
export const savePendingUploadWithUrl = async (
    deliveryId: string,
    imageUrl: string,
    status: DeliveryStatus,
    capturedAtUtc: string,
    isPartial: boolean = false
) => {
    const db = await initDB();
    await db.add('pendingUploads', {
        deliveryId,
        imageBlob: new Blob([], { type: 'image/jpeg' }), // blob vazio — URL já está salva
        imageUrl,
        status,
        capturedAtUtc,
        isPartial,
        createdAt: Date.now(),
    });
};

// Persiste a URL obtida do Supabase para que o próximo retry não precise re-fazer upload
export const updatePendingUploadUrl = async (id: number, imageUrl: string) => {
    const db = await initDB();
    const item = await db.get('pendingUploads', id);
    if (item) {
        await db.put('pendingUploads', { ...item, imageUrl });
    }
};

// ── Paradas ───────────────────────────────────────────────
export const savePendingParadaUpload = async (logId: string, imageBlob: Blob, finalizedAt: string) => {
    const db = await initDB();
    await db.add('pendingParadaUploads', {
        logId,
        imageBlob,
        finalizedAt,
        createdAt: Date.now(),
    });
};

export const getPendingParadaUploads = async () => {
    const db = await initDB();
    return db.getAllFromIndex('pendingParadaUploads', 'by-date');
};

export const deletePendingParadaUpload = async (id: number) => {
    const db = await initDB();
    await db.delete('pendingParadaUploads', id);
};

export const updatePendingParadaLogId = async (id: number, newLogId: string) => {
    const db = await initDB();
    const item = await db.get('pendingParadaUploads', id);
    if (item) {
        await db.put('pendingParadaUploads', { ...item, logId: newLogId });
    }
};
