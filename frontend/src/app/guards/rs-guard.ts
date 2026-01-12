import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Guard para rotas de Recrutamento & Seleção (R&S)
 * Permite acesso para: Admin, Admin Gerencial e Consultor R&S
 */
export const rsGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verificar se está autenticado
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Permitir acesso para Admin, Admin Gerencial e Consultor R&S
  if (authService.isAdmin() || authService.isAdminGerencial() || authService.isConsultorRS()) {
    return true;
  }

  // Redirecionar para página de acesso negado
  router.navigate(['/access-denied']);
  return false;
};
