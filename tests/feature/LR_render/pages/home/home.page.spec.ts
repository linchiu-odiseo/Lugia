import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { HomePage } from '../../../../../src/LR_render/pages/home/home.page';
import { GetActiveSessionUseCase } from '../../../../../src/L2_application/use-cases/get-active-session.use-case';
import { LogoutUseCase } from '../../../../../src/L2_application/use-cases/logout.use-case';
import { Session } from '../../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../../src/L1_domain/value-objects/bearer-token';

@Component({ template: '' })
class LoginStub {}

class FakeGetActiveSessionUseCase {
  private next: Session | null = null;
  willReturn(s: Session | null) {
    this.next = s;
  }
  async execute() {
    return this.next;
  }
}

class FakeLogoutUseCase {
  public callCount = 0;
  async execute() {
    this.callCount++;
  }
}

describe('HomePage', () => {
  let fakeGet: FakeGetActiveSessionUseCase;
  let fakeLogout: FakeLogoutUseCase;

  beforeEach(async () => {
    fakeGet = new FakeGetActiveSessionUseCase();
    fakeLogout = new FakeLogoutUseCase();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([
          { path: 'home', component: HomePage },
          { path: 'login', component: LoginStub },
        ]),
        { provide: GetActiveSessionUseCase, useValue: fakeGet },
        { provide: LogoutUseCase, useValue: fakeLogout },
      ],
    }).compileComponents();
  });

  it('muestra saludo con el email del usuario activo', async () => {
    fakeGet.willReturn(new Session(new BearerToken('6|abc'), 'fulano@panda.test', new Date()));
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.greeting')?.textContent).toContain('fulano@panda.test');
  });

  it('NO muestra saludo si no hay sesión (estado raro: protegido por authGuard)', async () => {
    fakeGet.willReturn(null);
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.greeting')).toBeNull();
  });

  it('click en "Cerrar sesión" invoca LogoutUseCase y navega a /login', async () => {
    fakeGet.willReturn(new Session(new BearerToken('6|abc'), 'fulano@panda.test', new Date()));
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();

    expect(fakeLogout.callCount).toBe(1);
    expect(router.url).toBe('/login');
  });
});
