import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Notification } from './notification.service';

// Mock Socket.IO para evitar erro de build
const io = (url?: string) => ({ on: () => {}, emit: () => {}, disconnect: () => {}, connected: false, id: '' });
type Socket = any;

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: Socket | undefined;
  
  private readonly WEBSOCKET_URL = environment.apiUrl.replace('/api', '');

  connect(userId: number): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.WEBSOCKET_URL);

    this.socket.on('connect', () => {
      this.socket?.emit('register', userId);
    });

    this.socket.on('disconnect', () => {
      // Desconectado
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
  }

  listenForNewNotifications(): Observable<Notification> {
    return new Observable(observer => {
      this.socket?.on('new_notification', (notification: Notification) => {
        observer.next(notification);
      });
    });
  }
}