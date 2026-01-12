import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { NotificationService, Notification } from '../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-toast.html',
  styleUrls: ['./notification-toast.css'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class NotificationToastComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  showProgress = true;
  private subscription?: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit() {
    this.subscription = this.notificationService.toastQueue$.subscribe(
      notifications => {
        this.notifications = notifications;
      }
    );
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  trackById(index: number, notification: Notification): string {
    return notification.id;
  }

  close(id: string, event: Event) {
    event.stopPropagation();
    this.notificationService.removeToast(id);
  }

  handleClick(notification: Notification) {
    if (notification.persistent) {
      this.notificationService.markAsRead(notification.id);
    }
  }

  executeAction(notification: Notification, event: Event) {
    event.stopPropagation();
    if (notification.action) {
      notification.action.callback();
      this.close(notification.id, event);
    }
  }
}