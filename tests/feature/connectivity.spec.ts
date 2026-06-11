import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserConnectivity } from '../../src/L3_periphery/connectivity/browser-connectivity';

// Tests del adapter L3 `BrowserConnectivity`.
//
// Cubrimos los escenarios listados en
// `openspec/changes/cartilla-fase-2/specs/connectivity-indicator/spec.md`
// Requirements 1 y 2:
//   - estado inicial reflejando `navigator.onLine`
//   - transiciones online → offline y offline → online vía eventos del window
//   - idempotencia ante eventos duplicados
//   - subscribe(listener) devuelve un unsubscribe que efectivamente desregistra
//
// El adapter es una clase con `@Injectable` pero NO tiene dependencias
// inyectadas: se puede instanciar directamente con `new BrowserConnectivity()`
// sin TestBed. Eso aísla mejor el test del wiring DI.
//
// Para manipular `navigator.onLine` usamos `Object.defineProperty` con
// `configurable: true`, lo que jsdom permite (el descriptor por defecto no
// es writable). Restauramos el estado online entre tests.

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
  });
}

describe('BrowserConnectivity', () => {
  let adapter: BrowserConnectivity | null = null;

  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    // Limpiamos listeners registrados sobre `window` por el adapter,
    // de modo que un test no contamine al siguiente.
    adapter?.ngOnDestroy();
    adapter = null;
    setNavigatorOnLine(true);
  });

  describe('estado inicial', () => {
    it('refleja navigator.onLine = true al construir', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      expect(adapter.current()).toBe(true);
    });

    it('refleja navigator.onLine = false al construir', () => {
      setNavigatorOnLine(false);
      adapter = new BrowserConnectivity();
      expect(adapter.current()).toBe(false);
    });
  });

  describe('transiciones por eventos del window', () => {
    it('online → offline cuando el window dispara `offline`', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((next) => received.push(next));

      window.dispatchEvent(new Event('offline'));

      expect(adapter.current()).toBe(false);
      expect(received).toEqual([false]);
    });

    it('offline → online cuando el window dispara `online`', () => {
      setNavigatorOnLine(false);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((next) => received.push(next));

      window.dispatchEvent(new Event('online'));

      expect(adapter.current()).toBe(true);
      expect(received).toEqual([true]);
    });

    it('notifica a múltiples suscriptores en la misma transición', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const a: boolean[] = [];
      const b: boolean[] = [];
      adapter.subscribe((v) => a.push(v));
      adapter.subscribe((v) => b.push(v));

      window.dispatchEvent(new Event('offline'));

      expect(a).toEqual([false]);
      expect(b).toEqual([false]);
    });
  });

  describe('idempotencia ante eventos duplicados', () => {
    it('no notifica si llega `online` estando ya online', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((v) => received.push(v));

      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));

      expect(adapter.current()).toBe(true);
      expect(received).toEqual([]);
    });

    it('no notifica si llega `offline` estando ya offline', () => {
      setNavigatorOnLine(false);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((v) => received.push(v));

      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));

      expect(adapter.current()).toBe(false);
      expect(received).toEqual([]);
    });

    it('tras una transición online → offline, un segundo `offline` no notifica', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((v) => received.push(v));

      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));

      expect(adapter.current()).toBe(false);
      expect(received).toEqual([false]);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('el unsubscribe devuelto desregistra al listener', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      const unsubscribe = adapter.subscribe((v) => received.push(v));

      window.dispatchEvent(new Event('offline'));
      expect(received).toEqual([false]);

      unsubscribe();
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('offline'));

      // Nada nuevo después del unsubscribe.
      expect(received).toEqual([false]);
    });

    it('unsubscribe solo afecta al listener correspondiente', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const a: boolean[] = [];
      const b: boolean[] = [];
      const unsubA = adapter.subscribe((v) => a.push(v));
      adapter.subscribe((v) => b.push(v));

      unsubA();
      window.dispatchEvent(new Event('offline'));

      expect(a).toEqual([]);
      expect(b).toEqual([false]);
    });

    it('unsubscribe es idempotente: invocarlo dos veces no rompe', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      const unsubscribe = adapter.subscribe((v) => received.push(v));

      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();

      window.dispatchEvent(new Event('offline'));
      expect(received).toEqual([]);
    });
  });

  describe('ngOnDestroy', () => {
    it('deja de propagar eventos tras destruir el adapter', () => {
      setNavigatorOnLine(true);
      adapter = new BrowserConnectivity();
      const received: boolean[] = [];
      adapter.subscribe((v) => received.push(v));

      adapter.ngOnDestroy();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));

      expect(received).toEqual([]);
      // Evitamos el ngOnDestroy del afterEach.
      adapter = null;
    });
  });
});
