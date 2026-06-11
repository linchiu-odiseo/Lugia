import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { LoginPage } from '../../../../../src/LR_render/pages/login/login.page';
import { LoginUseCase } from '../../../../../src/L2_application/use-cases/login.use-case';
import { Session } from '../../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../../src/L1_domain/value-objects/bearer-token';
import { Credentials } from '../../../../../src/L1_domain/ports/auth-repository';
import { InvalidCredentialsError } from '../../../../../src/L1_domain/errors/invalid-credentials.error';
import { NetworkError } from '../../../../../src/L1_domain/errors/network.error';

@Component({ template: '' })
class HomeStub {}

class FakeLoginUseCase {
  private nextOutcome: 'ok' | Error = 'ok';
  public calls: Credentials[] = [];

  willResolve() {
    this.nextOutcome = 'ok';
  }
  willRejectInvalid() {
    this.nextOutcome = new InvalidCredentialsError();
  }
  willRejectNetwork() {
    this.nextOutcome = new NetworkError();
  }

  async execute(credentials: Credentials): Promise<Session> {
    this.calls.push(credentials);
    if (this.nextOutcome === 'ok') {
      return new Session(new BearerToken('6|abc'), credentials.email, new Date());
    }
    throw this.nextOutcome;
  }
}

const validCredentials = { email: 'fulano@panda.test', password: '12345678' };

const setEmailAndPasswordViaDOM = (fixture: { nativeElement: HTMLElement }, c: Credentials) => {
  const el = fixture.nativeElement;
  const email = el.querySelector('input[formcontrolname="email"]') as HTMLInputElement;
  const pwd = el.querySelector('input[formcontrolname="password"]') as HTMLInputElement;
  email.value = c.email;
  email.dispatchEvent(new Event('input'));
  pwd.value = c.password;
  pwd.dispatchEvent(new Event('input'));
};

describe('LoginPage', () => {
  let fakeUseCase: FakeLoginUseCase;

  beforeEach(async () => {
    fakeUseCase = new FakeLoginUseCase();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([
          { path: 'login', component: LoginPage },
          { path: 'home', component: HomeStub },
        ]),
        { provide: LoginUseCase, useValue: fakeUseCase },
      ],
    }).compileComponents();
  });

  it('renderiza inputs de email y password y botón submit', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[formcontrolname="email"]')).not.toBeNull();
    expect(el.querySelector('input[formcontrolname="password"]')).not.toBeNull();
    expect(el.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('botón submit deshabilitado cuando el form está inválido', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('botón submit habilitado cuando el form es válido', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    setEmailAndPasswordViaDOM(fixture, validCredentials);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('submit exitoso invoca LoginUseCase con las credenciales y navega a /home', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    setEmailAndPasswordViaDOM(fixture, validCredentials);
    fixture.detectChanges();
    fakeUseCase.willResolve();

    const router = TestBed.inject(Router);
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(fakeUseCase.calls).toEqual([validCredentials]);
    expect(router.url).toBe('/home');
  });

  it('credenciales inválidas muestran mensaje y limpian password pero conservan email', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    setEmailAndPasswordViaDOM(fixture, validCredentials);
    fixture.detectChanges();
    fakeUseCase.willRejectInvalid();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('Credenciales inválidas');
    expect((el.querySelector('input[formcontrolname="email"]') as HTMLInputElement).value).toBe(
      validCredentials.email,
    );
    expect((el.querySelector('input[formcontrolname="password"]') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('error de red muestra mensaje y conserva ambos campos', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    setEmailAndPasswordViaDOM(fixture, validCredentials);
    fixture.detectChanges();
    fakeUseCase.willRejectNetwork();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('No se pudo conectar al servidor');
    expect((el.querySelector('input[formcontrolname="email"]') as HTMLInputElement).value).toBe(
      validCredentials.email,
    );
    expect((el.querySelector('input[formcontrolname="password"]') as HTMLInputElement).value).toBe(
      validCredentials.password,
    );
  });
});
