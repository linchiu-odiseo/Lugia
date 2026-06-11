import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { Component } from '@angular/core';
import { authGuard } from '../../../../src/L3_periphery/guards/auth.guard';
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

describe('authGuard', () => {
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

  it('permite la navegación si hay sesión activa', async () => {
    fake.willReturn(new Session(new BearerToken('6|abc'), 'a@b.com', new Date()));
    const result = await TestBed.runInInjectionContext(() =>
      authGuard(null as never, null as never),
    );
    expect(result).toBe(true);
  });

  it('redirige a /login si no hay sesión', async () => {
    fake.willReturn(null);
    const result = (await TestBed.runInInjectionContext(() =>
      authGuard(null as never, null as never),
    )) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login');
  });
});
