import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VersionFooterComponent } from '../../components/version-footer/version-footer.component';
import { LoginViewModel } from '../../view-models/login.view-model';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, VersionFooterComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  providers: [LoginViewModel],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  protected readonly vm = inject(LoginViewModel);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.vm.isSubmitting()) return;
    const outcome = await this.vm.submit(this.form.getRawValue());
    if (outcome === 'ok') {
      this.form.reset({ email: '', password: '' });
    } else if (outcome === 'invalid') {
      this.form.patchValue({ password: '' });
    }
    // network: form values stay as-is para que el usuario reintente.
  }
}
