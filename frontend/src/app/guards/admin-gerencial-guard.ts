import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class AdminGerencialGuard implements CanActivate {
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

    // Permitir acesso para Admin e Admin Gerencial
    if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
      return true;
    }

    // Redirecionar para página de acesso negado
    this.router.navigate(['/access-denied']);

    return false;
  }
}
