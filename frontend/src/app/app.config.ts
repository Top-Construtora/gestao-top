// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth';
import { retryInterceptor } from './interceptors/retry.interceptor';
import { CurrencyMaskDirective } from './directives/currency-mask.directive';

export const appConfig: ApplicationConfig = {
  providers: [
    // Roteamento
    provideRouter(routes),
    
    // HTTP Client com interceptors funcionais
    provideHttpClient(
      withInterceptors([retryInterceptor, authInterceptor])
    ),
    
    // Animações para toastr
    provideAnimations(),
    
    // Toastr para notificações
    provideToastr({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      progressBar: true,
      closeButton: true,
      enableHtml: true
    }),

    // Diretivas
    CurrencyMaskDirective
  ]
};