import { Capacitor, registerPlugin } from '@capacitor/core';
import { getApiUrl } from '../apiConfig';

interface RouteTrackingNative {
  start(options: { token: string; motorista: string; routeCode: string | null; baseUrl: string }): Promise<{ sessionId: string }>;
  stop(): Promise<void>;
  syncPending(): Promise<void>;
  status(): Promise<{ active: boolean; motorista: string | null; permission: string }>;
}

const RouteTracking = registerPlugin<RouteTrackingNative>('RouteTracking');

export const isAndroidTrackingAvailable = () =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('RouteTracking');

export async function startRouteTracking(token: string, motorista: string, routeCode: string | null) {
  if (!isAndroidTrackingAvailable()) return;
  await RouteTracking.start({ token, motorista, routeCode, baseUrl: getApiUrl('tracking') });
}

export async function stopRouteTracking(motorista: string) {
  if (!isAndroidTrackingAvailable()) return;
  const status = await RouteTracking.status();
  if (status.active && status.motorista === motorista) await RouteTracking.stop();
}

export async function syncPendingTracking() {
  if (!isAndroidTrackingAvailable()) return;
  await RouteTracking.syncPending();
}
