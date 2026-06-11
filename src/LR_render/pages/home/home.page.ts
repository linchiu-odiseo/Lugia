import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GetActiveSessionUseCase } from '../../../L2_application/use-cases/get-active-session.use-case';
import { LogoutUseCase } from '../../../L2_application/use-cases/logout.use-case';

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly getSession = inject(GetActiveSessionUseCase);
  private readonly logout = inject(LogoutUseCase);
  private readonly router = inject(Router);

  protected readonly email = signal<string | null>(null);
  protected readonly isSigningOut = signal(false);

  constructor() {
    void this.loadEmail();
  }

  private async loadEmail(): Promise<void> {
    const session = await this.getSession.execute();
    this.email.set(session?.principal() ?? null);
  }

  protected async signOut(): Promise<void> {
    if (this.isSigningOut()) return;
    this.isSigningOut.set(true);
    try {
      await this.logout.execute();
      await this.router.navigate(['/login']);
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
