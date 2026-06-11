import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { App } from './LR_render/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
