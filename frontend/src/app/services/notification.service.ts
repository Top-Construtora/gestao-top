import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { WebsocketService } from './websocket.service';
import { RateLimitService } from './rate-limit.service';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'contract_assignment' | 'permission_change' | 'contract_expiring' | 'payment_overdue' | 'service_comment' | 'service_status_change' | 'new_contract' | 'new_user' | 'security_alert' | 'approval_required' | 'system_event';
  title: string;
  message: string;
  timestamp: Date;
  isRead?: boolean;
  persistent?: boolean;
  link?: string;
  icon?: string;
  duration?: number;
  priority?: 'normal' | 'high';
  metadata?: any;
  action?: {
    label: string;
    callback: () => void;
  };
}

export interface ApiNotificationResponse {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  priority?: string;
  metadata?: any;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface NotificationListResponse {
  success: boolean;
  notifications: ApiNotificationResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationOptions {
  duration?: number;
  persistent?: boolean;
  icon?: string;
  action?: {
    label: string;
    callback: () => void;
  };
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly API_URL = `${environment.apiUrl}/notifications`;

  private toastQueue = new BehaviorSubject<Notification[]>([]);
  public toastQueue$ = this.toastQueue.asObservable();

  private notificationHistory = new BehaviorSubject<Notification[]>([]);
  public notificationHistory$ = this.notificationHistory.asObservable();

  private unreadCount = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCount.asObservable();

  private currentPage = 1;
  private readonly pageSize = 20;
  private totalPages = 1;
  private isLoading = false;
  private isInitialized = false; // Flag para evitar inicialização múltipla

  private defaultDuration = 5000;
  private maxToasts = 3;

  constructor(
    private http: HttpClient,
    private websocketService: WebsocketService,
    private rateLimitService: RateLimitService
  ) {
    this.loadNotificationsFromStorage();
    this.removeTestNotifications(); // Remove notificações de teste ao inicializar
    this.listenForRealTimeNotifications();
  }

  private listenForRealTimeNotifications(): void {
    this.websocketService.listenForNewNotifications().subscribe(notificationFromServer => {
      // Verificar se a notificação é relevante para o usuário atual
      if (!this.isNotificationRelevantForUser(notificationFromServer)) {
        return;
      }

      const newNotification: Notification = {
        ...notificationFromServer,
        id: `server-${(notificationFromServer as any).id}`,
        timestamp: new Date((notificationFromServer as any).created_at || Date.now()),
        isRead: (notificationFromServer as any).is_read || false,
        persistent: true,
        type: this.mapNotificationType((notificationFromServer as any).type),
        icon: this.getNotificationIcon((notificationFromServer as any).type),
        priority: (notificationFromServer as any).priority || 'normal'
      };
      this.addToHistory(newNotification);
      this.show({ ...newNotification, persistent: false, duration: this.getNotificationDuration(newNotification) });
      this.fetchUnreadCount(); // Atualizar contador
    });
  }

  success(message: string, title: string = 'Sucesso!', options?: NotificationOptions): void { this.show({ type: 'success', title, message, icon: 'fas fa-check-circle', ...options }); }
  error(message: string, title: string = 'Erro!', options?: NotificationOptions): void { this.show({ type: 'error', title, message, icon: 'fas fa-exclamation-circle', duration: 7000, ...options }); }
  warning(message: string, title: string = 'Atenção!', options?: NotificationOptions): void { this.show({ type: 'warning', title, message, icon: 'fas fa-exclamation-triangle', ...options }); }
  info(message: string, title: string = 'Informação', options?: NotificationOptions): void { this.show({ type: 'info', title, message, icon: 'fas fa-info-circle', ...options }); }

  private show(config: Partial<Notification>): void {
    const notification: Notification = {
      id: this.generateId(),
      type: 'info',
      title: '',
      message: '',
      timestamp: new Date(),
      isRead: false,
      duration: this.defaultDuration,
      ...config
    };
    if (!notification.persistent) {
      this.addToToastQueue(notification);
      if (notification.duration && notification.duration > 0) {
        setTimeout(() => this.removeToast(notification.id), notification.duration);
      }
    }
  }

  private addToToastQueue(notification: Notification): void {
    const currentToasts = this.toastQueue.value;
    if (currentToasts.length >= this.maxToasts) currentToasts.shift();
    this.toastQueue.next([...currentToasts, notification]);
  }

  public removeToast(id: string): void {
    this.toastQueue.next(this.toastQueue.value.filter(n => n.id !== id));
  }

  private addToHistory(notification: Notification): void {
    const history = [notification, ...this.notificationHistory.value];
    this.notificationHistory.next(history.slice(0, 100));
    this.updateUnreadCount();
    this.saveNotificationsToStorage();
  }

  fetchUserNotifications(page: number = 1) {
    if (this.isLoading) {
      console.log('⏳ Notificações já carregando, ignorando chamada duplicada');
      return;
    }

    // Verificar se há token antes de fazer a requisição
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('Token não encontrado - pulando busca de notificações');
      return;
    }

    this.isLoading = true;

    // Usar rate limiting mais agressivo para esta requisição
    const requestKey = `notifications-page-${page}`;
    this.rateLimitService.executeRequest(
      requestKey,
      () => this.http.get<NotificationListResponse>(`${this.API_URL}?page=${page}&limit=${this.pageSize}`),
      1500 // Aumentado para 1.5s debounce
    ).subscribe({
      next: (response) => {
        if (response.success && response.notifications) {
          const serverNotifications = response.notifications.map(this.mapApiNotificationToClient);

          if (page === 1) {
            this.notificationHistory.next(serverNotifications);
          } else {
            const current = this.notificationHistory.value;
            this.notificationHistory.next([...current, ...serverNotifications]);
          }

          this.currentPage = response.page;
          this.totalPages = response.totalPages;
          this.saveNotificationsToStorage();
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error("Falha ao buscar notificações", err);
        this.isLoading = false;
      }
    });
  }

  fetchUnreadCount() {
    // Verificar se há token antes de fazer a requisição
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('Token não encontrado - pulando busca de contador de não lidas');
      return;
    }

    // Usar rate limiting mais conservador para esta requisição
    this.rateLimitService.executeRequest(
      'notifications-unread-count',
      () => this.http.get<{ success: boolean, unreadCount: number }>(`${this.API_URL}/unread-count`),
      2000 // Aumentado para 2s debounce para contador
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.unreadCount.next(response.unreadCount);
        }
      },
      error: (err) => console.error("Falha ao buscar contador de não lidas", err)
    });
  }

  markAsRead(id: string): void {
    // Atualizar localmente primeiro
    const history = this.notificationHistory.value.map(n => n.id === id ? { ...n, isRead: true } : n);
    this.notificationHistory.next(history);
    this.updateUnreadCount();
    this.saveNotificationsToStorage();

    // Extrair ID numérico do servidor
    const numericId = this.extractServerId(id);
    if (numericId) {
      this.http.patch(`${this.API_URL}/${numericId}/read`, {}).subscribe({
        next: () => this.fetchUnreadCount(), // Sincronizar contador
        error: (err) => console.error('Erro ao marcar notificação como lida:', err)
      });
    }
  }

  markAllAsRead(): void {
    // Atualizar localmente primeiro
    const history = this.notificationHistory.value.map(n => ({ ...n, isRead: true }));
    this.notificationHistory.next(history);
    this.updateUnreadCount();
    this.saveNotificationsToStorage();

    // Chamar API
    this.http.patch(`${this.API_URL}/read-all`, {}).subscribe({
      next: () => this.fetchUnreadCount(), // Sincronizar contador
      error: (err) => console.error('Erro ao marcar todas como lidas:', err)
    });
  }

  clearHistory(): void {
    // Limpar estado local
    this.notificationHistory.next([]);
    this.updateUnreadCount();
    this.saveNotificationsToStorage();

    // Deletar do backend
    this.http.delete(`${this.API_URL}/delete-all`).subscribe({
      next: () => {
        console.log('✅ Notificações deletadas do servidor');
        this.fetchUnreadCount(); // Sincronizar contador
      },
      error: (err) => console.error('❌ Erro ao deletar notificações do servidor:', err)
    });
  }

  /**
   * Deletar notificações antigas (mais de X dias)
   */
  deleteOldNotifications(daysOld: number = 30): void {
    this.http.delete(`${this.API_URL}/delete-old?days=${daysOld}`).subscribe({
      next: () => {
        console.log(`✅ Notificações antigas (>${daysOld} dias) deletadas`);
        this.refreshNotifications(); // Recarregar notificações
      },
      error: (err) => console.error('❌ Erro ao deletar notificações antigas:', err)
    });
  }

  /**
   * Resetar estado das notificações (usado no logout)
   */
  resetNotificationState(): void {
    console.log('🧹 Resetando estado das notificações');
    this.isInitialized = false;
    this.isLoading = false;
    this.currentPage = 1;
    this.totalPages = 1;
    this.notificationHistory.next([]);
    this.unreadCount.next(0);
    this.toastQueue.next([]);
  }

  removeTestNotifications(): void {
    const history = this.notificationHistory.value.filter(n => !n.id.startsWith('test-'));
    this.notificationHistory.next(history);
    this.updateUnreadCount();
    this.saveNotificationsToStorage();
  }

  clearOldNotifications(): void {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const history = this.notificationHistory.value.filter(n => new Date(n.timestamp) > sevenDaysAgo);
    this.notificationHistory.next(history);
    this.updateUnreadCount();
    this.saveNotificationsToStorage();
  }

  private updateUnreadCount(): void {
    this.unreadCount.next(this.notificationHistory.value.filter(n => !n.isRead).length);
  }

  private saveNotificationsToStorage(): void {
    try { localStorage.setItem('notification_history', JSON.stringify(this.notificationHistory.value)); }
    catch (e) { console.error('Erro ao salvar notificações', e); }
  }

  private loadNotificationsFromStorage(): void {
    try {
      const stored = localStorage.getItem('notification_history');
      if (stored) {
        const history = JSON.parse(stored).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
        this.notificationHistory.next(history);
        this.updateUnreadCount();
      }
    } catch (e) { console.error('Erro ao carregar notificações', e); }
  }

  private generateId(): string {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapApiNotificationToClient = (apiNotification: ApiNotificationResponse): Notification => {
    return {
      id: `server-${apiNotification.id}`,
      type: this.mapNotificationType(apiNotification.type),
      title: apiNotification.title,
      message: apiNotification.message,
      timestamp: new Date(apiNotification.created_at),
      isRead: apiNotification.is_read,
      persistent: true,
      link: apiNotification.link,
      icon: this.getNotificationIcon(apiNotification.type),
      priority: apiNotification.priority as 'normal' | 'high' || 'normal',
      metadata: apiNotification.metadata
    };
  }

  private mapNotificationType(serverType: string): Notification['type'] {
    const typeMap: Record<string, Notification['type']> = {
      'contract_assignment': 'contract_assignment',
      'permission_change': 'permission_change',
      'contract_expiring': 'contract_expiring',
      'payment_overdue': 'payment_overdue',
      'service_comment': 'service_comment',
      'service_status_change': 'service_status_change',
      'new_contract': 'new_contract',
      'new_user': 'new_user',
      'security_alert': 'security_alert',
      'approval_required': 'approval_required',
      'system_event': 'system_event'
    };
    return typeMap[serverType] || 'info';
  }

  private getNotificationIcon(type: string): string {
    const iconMap: Record<string, string> = {
      'contract_assignment': 'fas fa-file-contract',
      'permission_change': 'fas fa-user-shield',
      'contract_expiring': 'fas fa-calendar-times',
      'payment_overdue': 'fas fa-exclamation-triangle',
      'service_comment': 'fas fa-comment',
      'service_status_change': 'fas fa-tasks',
      'new_contract': 'fas fa-file-plus',
      'new_user': 'fas fa-user-plus',
      'security_alert': 'fas fa-shield-alt',
      'approval_required': 'fas fa-check-double',
      'system_event': 'fas fa-cog',
      'success': 'fas fa-check-circle',
      'error': 'fas fa-exclamation-circle',
      'warning': 'fas fa-exclamation-triangle',
      'info': 'fas fa-info-circle'
    };
    return iconMap[type] || 'fas fa-bell';
  }

  private getNotificationDuration(notification: Notification): number {
    if (notification.priority === 'high') return 8000;
    if (notification.type === 'error') return 7000;
    return this.defaultDuration;
  }

  private extractServerId(clientId: string): number | null {
    const match = clientId.match(/^server-(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  // Métodos públicos para paginação
  hasMoreNotifications(): boolean {
    return this.currentPage < this.totalPages;
  }

  loadMoreNotifications(): void {
    if (this.hasMoreNotifications() && !this.isLoading) {
      this.fetchUserNotifications(this.currentPage + 1);
    }
  }

  refreshNotifications(): void {
    this.currentPage = 1;
    this.fetchUserNotifications(1);
    this.fetchUnreadCount();
  }

  /**
   * Inicializa as notificações após o usuário estar autenticado
   */
  initializeNotifications(): void {
    if (this.isInitialized) {
      console.log('🔄 Notificações já inicializadas, ignorando');
      return;
    }

    console.log('🚀 Inicializando notificações...');
    this.isInitialized = true;
    
    // Usar setTimeout para evitar chamadas imediatas que podem causar rate limiting
    setTimeout(() => {
      this.fetchUserNotifications();
    }, 1000);
    
    setTimeout(() => {
      this.fetchUnreadCount();
    }, 2000);
  }

  /**
   * Verifica se uma notificação é relevante para o usuário atual
   * baseado nos vínculos com contratos e role do usuário
   */
  private isNotificationRelevantForUser(notification: any): boolean {
    try {
      // Notificações sem metadata de contrato são sempre relevantes (notificações gerais)
      if (!notification.metadata?.contract_id) {
        return true;
      }

      // Para notificações relacionadas a contratos específicos,
      // a validação já foi feita no backend, então aceitar
      // (o backend só envia notificações para usuários vinculados)
      return true;
    } catch (error) {
      console.error('Erro ao verificar relevância da notificação:', error);
      // Em caso de erro, negar por segurança
      return false;
    }
  }

  /**
   * Filtro adicional para notificações já carregadas
   * (usado como camada extra de segurança)
   */
  private filterNotificationsByAccess(notifications: Notification[]): Notification[] {
    return notifications.filter(notification => {
      // Se não tem metadata de contrato, manter
      if (!notification.metadata?.contract_id) {
        return true;
      }

      // Para notificações com contract_id, confiar na validação do backend
      // pois a API já filtra baseado nos vínculos do usuário
      return true;
    });
  }
}