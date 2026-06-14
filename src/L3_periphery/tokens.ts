import { InjectionToken } from '@angular/core';
import { IdentityStorage } from '../L1_domain/ports/identity-storage';
import { ProfileStorage } from '../L1_domain/ports/profile-storage';
import { OutboxStoragePort } from '../L1_domain/ports/outbox-storage.port';
import { SwMessengerPort } from '../L1_domain/ports/sw-messenger.port';

// Tokens DI para los ports L1 que se inyectan via interface (Angular no
// puede inyectar interfaces por tipo en TypeScript runtime). Los bindings
// concretos viven en `app.config.ts` con `useExisting` apuntando a las
// implementaciones concretas L3.
//
// Beneficio arquitectónico: los adapters L3 que necesitan un port lo
// inyectan por token → dependen de la interface L1, no de la clase
// concreta. Esto preserva el Principio de Inversión de Dependencias
// y evita que un adapter dependa de otro adapter directamente
// (lo que era el layer violation original de `IndexedDbMarkingsStorage`).
export const IDENTITY_STORAGE = new InjectionToken<IdentityStorage>('IdentityStorage');
export const PROFILE_STORAGE = new InjectionToken<ProfileStorage>('ProfileStorage');
export const OUTBOX_STORAGE = new InjectionToken<OutboxStoragePort>('OutboxStoragePort');
export const SW_MESSENGER = new InjectionToken<SwMessengerPort>('SwMessengerPort');
