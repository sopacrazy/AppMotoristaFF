import { openDB } from 'idb';
import { getApiUrl } from '../apiConfig';
import { uploadBase64ToSupabase } from './supabaseService';

export interface ExpenseSyncItem {
  id: string;
  date: string; // YYYY-MM-DD
  supplier: string;
  category: string;
  customCategory?: string;
  amount: string;
  photoUrl: string | null;
}

export interface ExpenseSnapshot {
  reportId: string;
  motorista: string;
  routeCode: string | null;
  driverName: string | null;
  destination: string;
  advanceAmount: number;
  startDateText: string | null;
  endDateText: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'open' | 'finished';
  items: ExpenseSyncItem[];
}

interface PendingExpense extends ExpenseSnapshot {
  revision: number;
}

export interface ExpenseSyncResult {
  pending: number;
  authRequired: boolean;
  error: string | null;
}

const dbPromise = openDB('fortfruit-expense-sync', 1, {
  upgrade(db) {
    db.createObjectStore('pending', { keyPath: 'reportId' });
  },
});

let writeTail: Promise<unknown> = Promise.resolve();
let currentSync: Promise<ExpenseSyncResult> | null = null;
let currentSyncMotorista: string | null = null;
let syncAgain = false;
const photoListeners = new Set<(reportId: string, itemId: string, oldUrl: string, newUrl: string) => void>();

function writeSerial<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeTail.then(operation, operation);
  writeTail = next.catch(() => {});
  return next;
}

function nextRevision(reportId: string): number {
  const key = `app_expense_revision_${reportId}`;
  const previous = Number(localStorage.getItem(key) || 0);
  const next = (Number.isSafeInteger(previous) && previous >= 0 ? previous : 0) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export function queueExpenseReport(snapshot: ExpenseSnapshot): Promise<void> {
  const pending: PendingExpense = {
    ...snapshot,
    revision: nextRevision(snapshot.reportId),
    items: snapshot.items.map((item) => ({ ...item })),
  };
  syncAgain = true;
  return writeSerial(async () => {
    const db = await dbPromise;
    await db.put('pending', pending);
  });
}

export async function getPendingExpenseReport(reportId: string): Promise<PendingExpense | undefined> {
  await writeTail;
  const db = await dbPromise;
  return db.get('pending', reportId);
}

async function pendingCount(motorista: string): Promise<number> {
  await writeTail;
  const db = await dbPromise;
  const all: PendingExpense[] = await db.getAll('pending');
  return all.filter((report) => report.motorista === motorista).length;
}

function updateLocalReceipt(motorista: string, reportId: string, itemId: string, url: string) {
  if (localStorage.getItem(`app_despesas_report_id_${motorista}`) !== reportId) return;
  const key = `app_despesas_itens_${motorista}`;
  try {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(items)) return;
    const item = items.find((entry) => entry.id === itemId);
    if (!item || (item.photoUrl && !item.photoUrl.startsWith('data:'))) return;
    item.photoUrl = url;
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.warn('Não foi possível atualizar o comprovante local:', error);
  }
}

async function saveUploadedPhoto(motorista: string, reportId: string, itemId: string, previousDataUrl: string, url: string): Promise<boolean> {
  return writeSerial(async () => {
    const db = await dbPromise;
    const report: PendingExpense | undefined = await db.get('pending', reportId);
    const item = report?.items.find((entry) => entry.id === itemId);
    if (!report || !item || item.photoUrl !== previousDataUrl) return false;
    item.photoUrl = url;
    report.revision = nextRevision(reportId);
    await db.put('pending', report);
    updateLocalReceipt(motorista, reportId, itemId, url);
    return true;
  });
}

async function syncOnce(motorista: string, onPhotoUploaded?: (reportId: string, itemId: string, oldUrl: string, newUrl: string) => void): Promise<ExpenseSyncResult> {
  const token = localStorage.getItem('app_trackingToken');
  if (!token) return { pending: await pendingCount(motorista), authRequired: true, error: null };
  if (!navigator.onLine) return { pending: await pendingCount(motorista), authRequired: false, error: null };

  await writeTail;
  const db = await dbPromise;
  const reports: PendingExpense[] = (await db.getAll('pending')).filter((report) => report.motorista === motorista);
  let lastError: string | null = null;
  for (const original of reports) {
    let report: PendingExpense | undefined = await getPendingExpenseReport(original.reportId);
    if (!report) continue;
    for (const item of report.items) {
      if (!item.photoUrl?.startsWith('data:')) continue;
      const oldUrl = item.photoUrl;
      try {
        const uploaded = await uploadBase64ToSupabase(oldUrl, 'despesa', 'despesas');
        if (uploaded && await saveUploadedPhoto(report.motorista, report.reportId, item.id, oldUrl, uploaded)) {
          onPhotoUploaded?.(report.reportId, item.id, oldUrl, uploaded);
        }
      } catch (error) {
        console.warn('Comprovante de despesa pendente de envio:', error);
      }
    }
    report = await getPendingExpenseReport(original.reportId);
    if (!report) continue;
    const body = {
      revision: report.revision,
      driverName: report.driverName,
      routeCode: report.routeCode,
      destination: report.destination,
      advanceAmount: report.advanceAmount,
      startDateText: report.startDateText,
      endDateText: report.endDateText,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      status: report.status,
      items: report.items.map((item) => ({
        id: item.id,
        date: item.date,
        supplier: item.supplier,
        category: item.category,
        customCategory: item.customCategory || null,
        amount: item.amount,
        receiptUrl: item.photoUrl?.startsWith('http') ? item.photoUrl : null,
        receiptPending: Boolean(item.photoUrl?.startsWith('data:')),
      })),
    };
    try {
      const response = await fetch(getApiUrl(`expenses/reports/${report.reportId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (response.status === 401) return { pending: await pendingCount(motorista), authRequired: true, error: null };
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        lastError = data.error || `Falha ao salvar despesas (${response.status})`;
        continue;
      }
      if (!report.items.some((item) => item.photoUrl?.startsWith('data:'))) {
        await writeSerial(async () => {
          const latest: PendingExpense | undefined = await db.get('pending', report.reportId);
          if (latest?.revision === report.revision) await db.delete('pending', report.reportId);
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Sem conexão com o servidor';
    }
  }
  return { pending: await pendingCount(motorista), authRequired: false, error: lastError };
}

export function syncPendingExpenseReports(motorista: string, onPhotoUploaded?: (reportId: string, itemId: string, oldUrl: string, newUrl: string) => void): Promise<ExpenseSyncResult> {
  if (onPhotoUploaded) photoListeners.add(onPhotoUploaded);
  if (currentSync) {
    if (currentSyncMotorista !== motorista) {
      return currentSync.then(() => syncPendingExpenseReports(motorista, onPhotoUploaded));
    }
    syncAgain = true;
    return currentSync;
  }
  currentSyncMotorista = motorista;
  const notifyPhotoUploaded = (reportId: string, itemId: string, oldUrl: string, newUrl: string) => {
    for (const listener of photoListeners) listener(reportId, itemId, oldUrl, newUrl);
  };
  currentSync = (async () => {
    let result: ExpenseSyncResult;
    do {
      syncAgain = false;
      result = await syncOnce(motorista, notifyPhotoUploaded);
    } while (syncAgain && result.pending > 0 && !result.authRequired && !result.error && navigator.onLine);
    return result;
  })().finally(() => { currentSync = null; currentSyncMotorista = null; photoListeners.clear(); });
  return currentSync;
}
