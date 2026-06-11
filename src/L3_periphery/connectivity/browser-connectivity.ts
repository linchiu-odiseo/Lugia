import { Injectable, OnDestroy } from '@angular/core';
import { Connectivity, ConnectivityUnsubscribe } from '../../L1_domain/ports/connectivity';

// Adapter L3 del puerto Connectivity.
//
// Lee el estado inicial de `navigator.onLine` y se suscribe a los eventos
// `online`/`offline` del `window` para propagar transiciones a los listeners
// registrados. Idempotente ante eventos duplicados: si el browser dispara
// `online` dos veces seguidas, los listeners solo se notifican una vez.
@Injectable({ providedIn: 'root' })
export class BrowserConnectivity implements Connectivity, OnDestroy {
  private isOnline: boolean;
  private readonly listeners = new Set<(isOnline: boolean) => void>();
  private readonly onOnline = () => this.update(true);
  private readonly onOffline = () => this.update(false);

  constructor() {
    this.isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
    }
  }

  current(): boolean {
    return this.isOnline;
  }

  subscribe(listener: (isOnline: boolean) => void): ConnectivityUnsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    this.listeners.clear();
  }

  private update(next: boolean): void {
    if (this.isOnline === next) return;
    this.isOnline = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}
