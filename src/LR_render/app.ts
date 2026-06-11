import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { ConnectivityBadgeComponent } from './components/connectivity-badge/connectivity-badge.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectivityBadgeComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  // Signal con la URL actual derivada de NavigationEnd. Arranca con `router.url`
  // para cubrir el primer render antes de que dispare el primer NavigationEnd.
  // Sólo se usa para decidir si el badge global se muestra; no es estado de negocio.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  // El badge se oculta sólo en /login (per spec: visible mientras el alumno
  // esté autenticado). authGuard protege las demás rutas, así que basta con
  // chequear el path en vez de leer la sesión acá.
  protected readonly showConnectivityBadge = computed(
    () => !this.currentUrl().startsWith('/login'),
  );
}
