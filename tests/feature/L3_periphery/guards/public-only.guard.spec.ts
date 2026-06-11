import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { Component } from '@angular/core';
import { publicOnlyGuard } from '../../../../src/L3_periphery/guards/public-only.guard';
import { GetActiveSessionUseCase } from '../../../../src/L2_application/use-cases/get-active-session.use-case';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';

class FakeGetActiveSessionUseCase {
  private next: Session | null = null;
  willReturn(s: Session | null) {
    this.next = s;
  }
  async execute() {
    return this.next;
  }
}

@Component({ standalone: true, template: '' })
class DummyComponent {}

describe('publicOnlyGuard', () => {
  let fake: FakeGetActiveSessionUseCase;

  beforeEach(() => {
    fake = new FakeGetActiveSessionUseCase();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'home', component: DummyComponent },
        ]),
        { provide: GetActiveSessionUseCase, useValue: fake },
      ],
    });
  });

  it('permite la navegación si no hay sesión activa (ruta pública usable)', async () => {
    fake.willReturn(null);
    const result = await TestBed.runInInjectionContext(() =>
      publicOnlyGuard(null as never, null as never),
    );
    expect(result).toBe(true);
  });

  it('redirige a /home si ya hay sesión activa (evita login doble)', async () => {
    fake.willReturn(new Session(new BearerToken('6|abc'), 'a@b.com', new Date()));
    const result = (await TestBed.runInInjectionContext(() =>
      publicOnlyGuard(null as never, null as never),
    )) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/home');
  });
});
