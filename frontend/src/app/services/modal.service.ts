// src/app/services/modal.service.ts
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ApiCompany } from './company';
import { ApiUser } from './user';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  // Subjects para controlar a abertura dos modais
  openContractModal$ = new Subject<void>();
  openCompanyModal$ = new Subject<ApiCompany | void>();
  openUserModal$ = new Subject<ApiUser | void>();
  
  // Subject para notificações (mantido para compatibilidade)
  showNotification$ = new Subject<{ message: string; isSuccess: boolean }>();
  
  constructor(private notificationService: NotificationService) {
    // Bridge entre o sistema antigo e o novo
    this.showNotification$.subscribe(({ message, isSuccess }) => {
      if (isSuccess) {
        this.notificationService.success(message);
      } else {
        this.notificationService.error(message);
      }
    });
  }
  
  // Métodos para abrir modais
  openContractModal() {
    this.openContractModal$.next();
  }
  
  openCompanyModal(company?: ApiCompany) {
    this.openCompanyModal$.next(company);
  }
  
  openUserModal(user?: ApiUser) {
    this.openUserModal$.next(user);
  }
  
  // Método antigo (mantido para compatibilidade)
  showNotification(message: string, isSuccess: boolean = true) {
    this.showNotification$.next({ message, isSuccess });
  }
  
  // NOVOS MÉTODOS QUE USAM O SISTEMA MELHORADO
  
  /**
   * Mostrar notificação de sucesso
   */
  showSuccess(message: string, title?: string, options?: any) {
    this.notificationService.success(message, title, options);
  }
  
  /**
   * Mostrar notificação de erro
   */
  showError(message: string, title?: string, options?: any) {
    this.notificationService.error(message, title, options);
  }
  
  /**
   * Mostrar notificação de aviso
   */
  showWarning(message: string, title?: string, options?: any) {
    this.notificationService.warning(message, title, options);
  }
  
  /**
   * Mostrar notificação informativa
   */
  showInfo(message: string, title?: string, options?: any) {
    this.notificationService.info(message, title, options);
  }
}