// src/app/components/notification-dropdown/notification-dropdown.ts
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification } from '../../services/notification.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-dropdown.html',
  styleUrls: ['./notification-dropdown.css']
})
export class NotificationDropdownComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() viewAllClick = new EventEmitter<void>();
  
  notifications: Notification[] = [];
  displayedNotifications: Notification[] = [];
  isLoading = false;
  hasMoreNotifications = true;
  private maxItemsToShow = 10; // Mostrar mais itens por vez
  private subscription?: Subscription;
  private lastScrollTop = 0;
  
  constructor(
    private notificationService: NotificationService,
    private router: Router
  ) {}

  // Detectar ESC para fechar dropdown
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isOpen) {
      this.close.emit();
    }
  }
  
  ngOnInit() {
    this.subscription = this.notificationService.notificationHistory$.subscribe(
      notifications => {
        this.notifications = notifications.filter(n => n.persistent);
        
        
        // Inicialmente mostrar apenas as primeiras para permitir scroll
        this.maxItemsToShow = 5;
        this.displayedNotifications = this.notifications.slice(0, this.maxItemsToShow);
        this.hasMoreNotifications = this.notifications.length > this.maxItemsToShow;
      }
    );
  }
  
  
  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
  
  onScroll(event: Event) {
    const element = event.target as HTMLElement;
    const currentScrollTop = element.scrollTop;
    
    // Verificar se chegou ao final (com margem de 30px)
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    
    // Carregar mais quando:
    // 1. Está perto do final (menos de 30px)
    // 2. Está rolando para baixo
    // 3. Não está carregando
    // 4. Tem mais notificações
    if (distanceFromBottom < 30 && 
        currentScrollTop > this.lastScrollTop && 
        !this.isLoading && 
        this.hasMoreNotifications) {
      this.loadMoreNotifications();
    }
    
    this.lastScrollTop = currentScrollTop;
  }
  
  private loadMoreNotifications() {
    if (this.isLoading) return;

    this.isLoading = true;
    
    setTimeout(() => {
      // Aumentar o número de itens mostrados
      this.maxItemsToShow += 5;
      this.displayedNotifications = this.notifications.slice(0, this.maxItemsToShow);
      this.hasMoreNotifications = this.notifications.length > this.maxItemsToShow;
      this.isLoading = false;
    }, 100);
  }
  
  trackById(index: number, notification: Notification): string {
    return notification.id;
  }
  
  markAsRead(notification: Notification) {
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification.id);
    }
    
    // Navegar para o link se existir
    if (notification.link) {
      this.router.navigateByUrl(notification.link);
      this.close.emit();
    }
  }
  
  clearAll() {
    // Confirmar com o usuário antes de deletar tudo
    const totalNotifications = this.notifications.length;

    if (totalNotifications === 0) {
      return;
    }

    const confirmMessage = `Tem certeza que deseja deletar todas as ${totalNotifications} notificações? Esta ação não pode ser desfeita.`;

    if (confirm(confirmMessage)) {
      this.notificationService.clearHistory();
      // Fechar dropdown após limpar
      setTimeout(() => {
        this.close.emit();
      }, 500);
    }
  }
  
  
  viewAll(event: Event) {
    event.preventDefault();
    this.viewAllClick.emit();
    this.close.emit();
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
    
    return timestamp.toLocaleDateString('pt-BR');
  }
}