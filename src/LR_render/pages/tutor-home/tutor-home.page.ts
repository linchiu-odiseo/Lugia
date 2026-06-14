import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LogoutUseCase } from '../../../L2_application/use-cases/logout.use-case';
import { TutorHomePageViewModel } from '../../view-models/tutor-home.view-model';

@Component({
  selector: 'app-tutor-home-page',
  templateUrl: './tutor-home.page.html',
  styleUrl: './tutor-home.page.scss',
  providers: [TutorHomePageViewModel],
})
export class TutorHomePage {
  private readonly logout = inject(LogoutUseCase);
  private readonly router = inject(Router);
  protected readonly vm = inject(TutorHomePageViewModel);

  protected readonly isSigningOut = signal(false);

  constructor() {
    void this.vm.start();
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
