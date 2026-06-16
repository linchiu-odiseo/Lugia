import { ChangeDetectionStrategy, Component } from '@angular/core';

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-version-footer',
  standalone: true,
  templateUrl: './version-footer.component.html',
  styleUrl: './version-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionFooterComponent {
  readonly version = environment.appVersion;
}
