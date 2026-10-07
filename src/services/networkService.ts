import { Capacitor } from '@capacitor/core';

// Estado centralizado de conectividade — começa com o valor do browser
let _isOnline: boolean = navigator.onLine;
const _listeners: Array<(online: boolean) => void> = [];

const notify = (online: boolean) => {
  _isOnline = online;
  _listeners.forEach((fn) => fn(online));
};

// No Android/iOS usa o plugin Capacitor (confiável no WebView)
// No browser usa os eventos nativos do window
if (Capacitor.isNativePlatform()) {
  import('@capacitor/network').then(({ Network }) => {
    Network.getStatus().then((status) => notify(status.connected));
    Network.addListener('networkStatusChange', (status) => notify(status.connected));
  });
} else {
  window.addEventListener('online', () => notify(true));
  window.addEventListener('offline', () => notify(false));
}

/** Retorna true se há conexão com internet (confiável no Android APK) */
export const isOnline = (): boolean => _isOnline;

/** Registra um callback chamado toda vez que a conexão mudar */
export const onNetworkChange = (fn: (online: boolean) => void): (() => void) => {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
};
