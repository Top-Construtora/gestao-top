import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Guard que permite acesso APENAS para Admin (role === 'admin')
 * Bloqueia acesso de Admin Gerencial
 * Usado para rotas sensíveis: Analytics e Relatórios
 */
@Injectable({
  providedIn: 'root'
})
export class AdminOnlyGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {

    // Verificar se está autenticado
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    // Permitir acesso APENAS para Admin (role === 'admin')
    // Bloqueia Admin Gerencial
    if (this.authService.isAdmin()) {
      return true;
    }

    // Redirecionar para página de acesso negado
    this.router.navigate(['/access-denied']);

    return false;
  }
}
