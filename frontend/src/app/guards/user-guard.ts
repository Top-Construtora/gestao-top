import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class UserGuard implements CanActivate {
  
  // Rotas permitidas para usuários com role 'usuario'
  private allowedRoutesForUser = [
    '/home/dashboard',
    '/home/servicos',
    '/home/servicos/novo',
    '/home/rotinas',
    '/home/configuracoes',
    '/home/ajuda'
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  /**
   * Verifica se a URL corresponde a rotas dinâmicas permitidas
   */
  private checkDynamicRoutes(url: string): boolean {
    const dynamicRoutePatterns = [
      // Rotas de serviços com IDs (permitido para usuários)
      /^\/home\/servicos\/editar\/\d+$/,

      // Rotas de rotinas com IDs (permitido para usuários)
      /^\/home\/rotinas\/visualizar\/\d+$/,

      // Rota de acompanhamento de serviço (permitido para usuários)
      /^\/home\/rotinas\/\d+\/servico\/\d+$/
    ];

    return dynamicRoutePatterns.some(pattern => pattern.test(url));
  }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {    
    // Verificar se está autenticado
    if (!this.authService.isAuthenticated()) {
      console.log('❌ Usuário não autenticado');
      this.router.navigate(['/login']);
      return false;
    }

    // Se é admin, permitir acesso total
    if (this.authService.isAdmin()) {
      return true;
    }

    // Para usuários não-admin, verificar se a rota está permitida
    const currentUrl = state.url;
    
    // Verificar se a rota atual está na lista de rotas permitidas
    const isAllowedRoute = this.allowedRoutesForUser.some(allowedRoute => 
      currentUrl.startsWith(allowedRoute) || currentUrl === allowedRoute
    );

    // Verificar rotas especiais com parâmetros dinâmicos
    const isDynamicRoute = this.checkDynamicRoutes(currentUrl);

    if (isAllowedRoute || isDynamicRoute) {
      return true;
    }

    // Se não é uma rota permitida, redirecionar para página de acesso negado
    console.log('❌ Acesso negado - Rota não permitida para usuário');
    console.log('🔍 Rota atual:', currentUrl);
    console.log('🔍 User role:', this.authService.getUser()?.role);
    console.log('🔍 isAllowedRoute:', isAllowedRoute);
    console.log('🔍 isDynamicRoute:', isDynamicRoute);

    // Redirecionar para página de acesso negado
    this.router.navigate(['/access-denied']);

    return false;
  }
}