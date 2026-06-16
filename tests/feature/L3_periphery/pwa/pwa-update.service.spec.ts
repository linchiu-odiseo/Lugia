// Tests del `PwaUpdateService` (L3) que orquesta updates del shell servido
// por el Service Worker de Angular. Cubre los scenarios del spec
// `pwa-shell-update` (gating de ruta, fallback de versión, applyUpdate con
// fallback silencioso, throttle de visibilitychange).
//
// El servicio se prueba con TestBed proveyendo dobles manuales/mock de
// `SwUpdate` y `Router`. `versionUpdates` y `events` son `Subject` rxjs para
// permitir emisiones controladas. `document` y `navigator` se mutan via
// `Object.defineProperty` (con cleanup en afterEach).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { PwaUpdateService } from '../../../../src/L3_periphery/pwa/pwa-update.service';

// Doble manual del SwUpdate. Mantiene `isEnabled` mutable y los métodos como
// `vi.fn()` para poder afirmar call-count desde los tests.
class FakeSwUpdate {
  public isEnabled = true;
  public versionUpdates = new Subject<VersionEvent>();
  public activateUpdate = vi.fn().mockResolvedValue(true);
  public checkForUpdate = vi.fn().mockResolvedValue(true);
}

// Doble manual del Router. `url` es mutable; `events` es un Subject sobre el
// que el test dispara `NavigationEnd` para forzar re-evaluación del gating.
class FakeRouter {
  public url = '/home';
  public events = new Subject<unknown>();
}

// Constructor helper: arma un VersionReadyEvent con appData opcionales.
// Si `currentAppData === null`, queda undefined en el evento (caso legacy
// install sin appData en ngsw.json viejo).
function buildVersionReadyEvent(
  currentAppData: { version: string } | null,
  latestAppData: { version: string } | null,
): VersionReadyEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: {
      hash: 'hash-current',
      ...(currentAppData !== null ? { appData: currentAppData } : {}),
    },
    latestVersion: {
      hash: 'hash-latest',
      ...(latestAppData !== null ? { appData: latestAppData } : {}),
    },
  } as VersionReadyEvent;
}

// Microtask flush — los handlers de Subject corren sync, pero el effect del
// signal y el setter dentro de un subscriber a veces requieren un tick.
const flushMicrotasks = async (n = 3): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};

describe('PwaUpdateService', () => {
  let fakeSw: FakeSwUpdate;
  let fakeRouter: FakeRouter;
  let originalVisibilityDescriptor: PropertyDescriptor | undefined;
  let originalOnlineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    fakeSw = new FakeSwUpdate();
    fakeRouter = new FakeRouter();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: fakeSw },
        { provide: Router, useValue: fakeRouter },
        PwaUpdateService,
      ],
    });

    // Capturar descriptores originales de visibilityState y onLine para
    // restaurarlos en afterEach (los tests los mutan via defineProperty).
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'visibilityState',
    );
    originalOnlineDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

    // Nota sobre `document.location.reload`: en jsdom es non-configurable y
    // non-writable, por lo que `vi.spyOn`, `Object.defineProperty` y stubs
    // sobre `window.location` no interceptan la llamada (document.location
    // se resuelve via getter independiente). El test 13.10 verifica el side
    // effect observable: jsdom escribe en stderr el warning
    // "Not implemented: navigation to another Document" cuando reload corre.
  });

  afterEach(() => {
    if (originalVisibilityDescriptor) {
      Object.defineProperty(Document.prototype, 'visibilityState', originalVisibilityDescriptor);
    }
    if (originalOnlineDescriptor) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnlineDescriptor);
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ---------- Helpers locales para mutar visibility / onLine / now ----------

  const setVisibility = (state: 'visible' | 'hidden'): void => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  };

  const setOnline = (online: boolean): void => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  };

  // 13.4 — SwUpdate disabled: start() debe ser no-op completo (sin suscripción
  // a versionUpdates, sin listener visibilitychange).
  it('start() con SwUpdate disabled no se suscribe ni registra listener', async () => {
    fakeSw.isEnabled = false;
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    // Emitir VERSION_READY igual: si el servicio no se suscribió, el handler
    // no corre y pendingUpdate sigue en EMPTY.
    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(false);
    expect(service.pendingUpdate().fromVersion).toBe('');
    expect(service.pendingUpdate().toVersion).toBe('');

    // Verificar que el listener visibilitychange NO se registró: forzar visible
    // + online y disparar el evento; checkForUpdate no debe llamarse.
    setVisibility('visible');
    setOnline(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).not.toHaveBeenCalled();
  });

  // 13.5 — VERSION_READY en /home → available=true con versiones correctas.
  it('VERSION_READY en /home expone update con fromVersion y toVersion', async () => {
    fakeRouter.url = '/home';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();

    expect(service.pendingUpdate()).toEqual({
      available: true,
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
    });
  });

  // 13.6 — VERSION_READY en /simulacro/:id → available=false (latched, no se expone).
  it('VERSION_READY en /simulacro/:id mantiene available=false pero retiene versiones', async () => {
    fakeRouter.url = '/simulacro/abc';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();

    expect(service.pendingUpdate().available).toBe(false);
    expect(service.pendingUpdate().fromVersion).toBe('1.0.0');
    expect(service.pendingUpdate().toVersion).toBe('1.1.0');
  });

  // 13.7 — En simulacro + latched, volver a /home flippea available a true.
  it('navegación /simulacro/:id → /home con latched expone available=true', async () => {
    fakeRouter.url = '/simulacro/abc';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(false);

    fakeRouter.url = '/home';
    fakeRouter.events.next(new NavigationEnd(1, '/home', '/home'));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(true);
  });

  // 13.8 — En /home con available=true, entrar a /simulacro/:id flippea a false.
  it('navegación /home → /simulacro/:id con available=true flippea a false', async () => {
    fakeRouter.url = '/home';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(true);

    fakeRouter.url = '/simulacro/abc';
    fakeRouter.events.next(new NavigationEnd(2, '/simulacro/abc', '/simulacro/abc'));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(false);
  });

  // 13.9 — appData undefined en currentVersion → fromVersion === '—' (em dash).
  it('VERSION_READY con currentVersion.appData undefined usa fallback "—"', async () => {
    fakeRouter.url = '/home';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    // currentAppData === null fuerza a que appData quede undefined en el evento.
    fakeSw.versionUpdates.next(buildVersionReadyEvent(null, { version: '1.1.0' }));
    await flushMicrotasks();

    expect(service.pendingUpdate().fromVersion).toBe('—');
    expect(service.pendingUpdate().toVersion).toBe('1.1.0');
  });

  // 13.10 — applyUpdate() éxito: activateUpdate llamado, reload disparado.
  // En jsdom `document.location.reload` es non-configurable y non-writable;
  // no se puede instalar un spy con vi.spyOn ni con defineProperty. Pero
  // jsdom delega el "Not implemented" warning a `process.stderr.write` cuando
  // se invoca `reload()` (porque la navegación real no está disponible en
  // node). Espiamos esa salida como señal observable del side effect.
  it('applyUpdate() en éxito llama activateUpdate y document.location.reload', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    const stderrChunks: string[] = [];
    const proc = (globalThis as { process?: { stderr: { write: (chunk: unknown) => boolean } } })
      .process;
    const originalWrite = proc?.stderr.write.bind(proc.stderr);
    if (proc && originalWrite) {
      proc.stderr.write = (chunk: unknown) => {
        if (typeof chunk === 'string') stderrChunks.push(chunk);
        else if (chunk && typeof (chunk as { toString: () => string }).toString === 'function')
          stderrChunks.push((chunk as { toString: () => string }).toString());
        return true;
      };
    }

    try {
      await service.applyUpdate();
    } finally {
      if (proc && originalWrite) proc.stderr.write = originalWrite;
    }
    expect(fakeSw.activateUpdate).toHaveBeenCalledTimes(1);
    const reloadSignal = stderrChunks.join('');
    expect(reloadSignal).toContain('Not implemented: navigation to another Document');
  });

  // 13.11 — applyUpdate() falla: reload NO llamado, available permanece true,
  // error logueado vía console.warn. Comprobamos que NO se emite el warning
  // de jsdom (señal indirecta de "reload no fue llamado").
  it('applyUpdate() en error NO llama reload, mantiene available=true, loguea warn', async () => {
    fakeRouter.url = '/home';
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    // Setear estado: hay update disponible.
    fakeSw.versionUpdates.next(buildVersionReadyEvent({ version: '1.0.0' }, { version: '1.1.0' }));
    await flushMicrotasks();
    expect(service.pendingUpdate().available).toBe(true);

    // Mockear console.warn ANTES de invocar applyUpdate.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boom = new Error('boom');
    fakeSw.activateUpdate.mockRejectedValueOnce(boom);

    // Capturar stderr para confirmar que reload NO disparó la navegación.
    const stderrChunks: string[] = [];
    const proc = (globalThis as { process?: { stderr: { write: (chunk: unknown) => boolean } } })
      .process;
    const originalWrite = proc?.stderr.write.bind(proc.stderr);
    if (proc && originalWrite) {
      proc.stderr.write = (chunk: unknown) => {
        if (typeof chunk === 'string') stderrChunks.push(chunk);
        return true;
      };
    }

    try {
      await service.applyUpdate();
    } finally {
      if (proc && originalWrite) proc.stderr.write = originalWrite;
    }

    expect(stderrChunks.join('')).not.toContain('Not implemented: navigation to another Document');
    expect(service.pendingUpdate().available).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    // El error es uno de los argumentos pasados al warn (no aserción del string
    // humano — solo del objeto Error).
    const calls = warnSpy.mock.calls;
    const containsError = calls.some((args) => args.some((arg) => arg === boom));
    expect(containsError).toBe(true);
  });

  // 13.12 — applyUpdate() llamado 2 veces sin que la primera resuelva:
  // activateUpdate corre 1 sola vez (idempotente vía flag `applying`).
  it('applyUpdate() concurrente no-op en la segunda llamada', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    // La primera activateUpdate queda colgada con un Promise manual.
    let resolveActivate: (v: boolean) => void = () => undefined;
    const pendingActivate = new Promise<boolean>((resolve) => {
      resolveActivate = resolve;
    });
    fakeSw.activateUpdate.mockReturnValueOnce(pendingActivate);

    const first = service.applyUpdate();
    const second = service.applyUpdate(); // debe ser no-op

    // Hasta acá activateUpdate se invocó solo 1 vez (la 2da retornó antes).
    expect(fakeSw.activateUpdate).toHaveBeenCalledTimes(1);

    // Resolver y limpiar.
    resolveActivate(true);
    await Promise.all([first, second]);
    expect(fakeSw.activateUpdate).toHaveBeenCalledTimes(1);
  });

  // 13.13 — visibilitychange visible + online → checkForUpdate llamado.
  it('visibilitychange con visible + online dispara checkForUpdate', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    setVisibility('visible');
    setOnline(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  // 13.14 — visibilitychange visible + offline → checkForUpdate NO llamado.
  it('visibilitychange con visible + offline NO llama checkForUpdate', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    setVisibility('visible');
    setOnline(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).not.toHaveBeenCalled();
  });

  // 13.15 — Throttle: dos visibilitychange a <60s solo dispara 1. A >60s dispara
  // el segundo. Usamos spy sobre Date.now (más portable que fake timers).
  it('throttle de 60s entre checkForUpdate consecutivos', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    setVisibility('visible');
    setOnline(true);

    let currentNow = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentNow);

    // Primera vuelta — dispara.
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).toHaveBeenCalledTimes(1);

    // Avanzar 30s — no debe disparar.
    currentNow += 30_000;
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).toHaveBeenCalledTimes(1);

    // Avanzar a 65s desde la primera — debe disparar.
    currentNow += 35_000; // total 65s
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  // 13.16 — visibilitychange con visibilityState === 'hidden' → no llama.
  it('visibilitychange con hidden NO llama checkForUpdate', async () => {
    const service = TestBed.inject(PwaUpdateService);
    service.start();

    setVisibility('hidden');
    setOnline(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();
    expect(fakeSw.checkForUpdate).not.toHaveBeenCalled();
  });
});
