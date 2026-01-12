import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification } from '../../services/notification.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-center.html',
  styleUrls: ['./notification-center.css']
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  notifications: Notification[] = [];
  displayedNotifications: Notification[] = [];
  unreadCount = 0;
  totalCount = 0;
  activeFilter: 'all' | 'unread' = 'all';
  isLoading = false;
  hasMoreNotifications = true;
  
  private subscription?: Subscription;
  private unreadSubscription?: Subscription;
  private scrollThrottleTimer?: any;

  constructor(
    private notificationService: NotificationService,
    private router: Router
  ) {}

  // Detectar clique fora do modal para fechar
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isOpen) {
      this.close.emit();
    }
  }

  ngOnInit() {
    this.loadNotifications();
    this.setupSubscriptions();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    this.unreadSubscription?.unsubscribe();
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
    }
  }

  private setupSubscriptions() {
    // Subscribe to notification updates
    this.subscription = this.notificationService.notificationHistory$.subscribe(
      notifications => {
        this.notifications = notifications;
        this.totalCount = notifications.length;
        this.updateDisplayedNotifications();
      }
    );

    // Subscribe to unread count updates
    this.unreadSubscription = this.notificationService.unreadCount$.subscribe(
      count => this.unreadCount = count
    );
  }

  private loadNotifications() {
    this.isLoading = true;
    // Refresh notifications from server
    this.notificationService.refreshNotifications();
    
    // Simulate loading delay for better UX
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  private updateDisplayedNotifications() {
    let filtered = this.notifications;
    
    if (this.activeFilter === 'unread') {
      filtered = this.notifications.filter(n => !n.isRead);
    }
    
    this.displayedNotifications = filtered;
    this.hasMoreNotifications = this.notificationService.hasMoreNotifications();
  }

  setFilter(filter: 'all' | 'unread') {
    this.activeFilter = filter;
    this.updateDisplayedNotifications();
    
    // Scroll to top when changing filter
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = 0;
    }
  }

  onScroll(event: Event) {
    if (this.scrollThrottleTimer) {
      return;
    }

    this.scrollThrottleTimer = setTimeout(() => {
      const element = event.target as HTMLElement;
      const threshold = 200; // pixels from bottom
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - threshold;

      if (atBottom && this.hasMoreNotifications && !this.isLoading) {
        this.loadMoreNotifications();
      }

      this.scrollThrottleTimer = null;
    }, 100);
  }

  private loadMoreNotifications() {
    if (this.isLoading || !this.hasMoreNotifications) return;

    this.isLoading = true;
    this.notificationService.loadMoreNotifications();
    
    // Simulate loading delay
    setTimeout(() => {
      this.isLoading = false;
      this.hasMoreNotifications = this.notificationService.hasMoreNotifications();
    }, 800);
  }

  handleNotificationClick(notification: Notification) {
    this.markAsRead(notification);
    
    // Navigate to link if exists
    if (notification.link) {
      this.router.navigateByUrl(notification.link);
      this.close.emit();
    }
  }

  markAsRead(notification: Notification, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification.id);
    }
  }

  markAllAsRead() {
    if (this.unreadCount === 0) return;

    if (confirm(`Marcar todas as ${this.unreadCount} notificações como lidas?`)) {
      this.notificationService.markAllAsRead();
    }
  }

  clearAllNotifications() {
    if (this.totalCount === 0) return;

    const confirmMessage = `Tem certeza que deseja DELETAR todas as ${this.totalCount} notificações?\n\nEsta ação não pode ser desfeita e todas as notificações serão permanentemente removidas.`;

    if (confirm(confirmMessage)) {
      this.notificationService.clearHistory();
      // Fechar modal após limpar
      setTimeout(() => {
        this.close.emit();
      }, 500);
    }
  }

  trackById(index: number, notification: Notification): string {
    return notification.id;
  }

  formatTime(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Agora mesmo';
    if (minutes < 60) return `Há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    if (hours < 24) return `Há ${hours} hora${hours > 1 ? 's' : ''}`;
    if (days < 7) return `Há ${days} dia${days > 1 ? 's' : ''}`;
    
    return timestamp.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}