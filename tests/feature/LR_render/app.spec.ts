import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from '../../../src/LR_render/app';
import { CONNECTIVITY } from '../../../src/app.config';
import { Connectivity } from '../../../src/L1_domain/ports/connectivity';

// Fake del puerto Connectivity para aislar el shell de la implementación
// real (BrowserConnectivity escucha eventos de `window`). El badge se
// renderiza pero queda inerte ante eventos en el test.
const fakeConnectivity: Connectivity = {
  current: () => true,
  subscribe: () => () => undefined,
};

describe('App (root shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: CONNECTIVITY, useValue: fakeConnectivity },
      ],
    }).compileComponents();
  });

  it('crea la instancia', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renderiza un <router-outlet> en su cuerpo', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('muestra el badge de conectividad cuando la ruta no es /login', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-connectivity-badge')).not.toBeNull();
  });
});
