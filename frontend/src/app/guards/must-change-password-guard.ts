import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const user = this.authService.getUser();
    
    // Se o usuário precisa trocar a senha
    if (user?.must_change_password === true) {
      
      // Se já está na página de troca de senha, permite
      if (state.url.includes('/change-password')) {
        return true;
      }
      
      // Caso contrário, redireciona para troca de senha
      this.router.navigate(['/change-password']);
      return false;
    }
    
    return true;
  }
}