import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // URLs que não precisam de token
  const publicUrls = [
    '/auth/login',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/validate-reset-token',
    '/api/auth/',
    '/public/proposals',
    '/api/public/proposals'
  ];

  // Verificar se deve adicionar token
  const shouldAddToken = !publicUrls.some(url => req.url.includes(url));
  
  // Clonar requisição e adicionar headers padrão
  // Não definir Content-Type para FormData (uploads de arquivo)
  const isFormData = req.body instanceof FormData;
  
  let authReq = req.clone({
    setHeaders: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'Accept': 'application/json'
    }
  });

  // Adicionar token se necessário
  if (shouldAddToken) {
    const token = authService.getToken();
    if (token && token.trim() !== '' && token !== 'null' && token !== 'undefined') {
      authReq = authReq.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
    }
  }


  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Verificar se é uma rota pública
      const isPublicRoute = publicUrls.some(url => req.url.includes(url));

      // Erro 401 - Token inválido ou expirado
      if (error.status === 401 && !isPublicRoute) {
        authService.logout().subscribe(() => {
          router.navigate(['/login']);
        });
      }

      // Erro 403 - Acesso negado (só redireciona se não for rota pública)
      if (error.status === 403 && !isPublicRoute) {
        router.navigate(['/home/dashboard']);
      }

      // Erro 0 - Problema de rede
      if (error.status === 0) {
        console.error('🌐 Erro de conexão com o servidor');
      }

      return throwError(() => error);
    })
  );
};