import { Injectable, inject, Injector } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { NotificationService } from './notification.service';
import { environment } from '../../environments/environment';
import { WebsocketService } from './websocket.service';

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  role_id: number;
  must_change_password: boolean;
  permissions?: string[];
  profile_picture_path?: string;
}

export interface ApiUserResponse {
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    permissions: string[];
    must_change_password: boolean;
    last_password_change: string | null;
    first_login_at: string | null;
    last_login_at?: string | null;
    created_at?: string;
    profile_picture_path?: string;
  }
}

export interface LoginResponse {
  token: string;
  user: User;
  message: string;
}

export interface ChangePasswordResponse {
  message: string;
  token?: string;
  user?: User;
}

export interface ForgotPasswordResponse {
  message: string;
  success?: boolean;
}

export interface ResetPasswordResponse {
  message: string;
  success?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = `${environment.authUrl}`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private isLoggingIn = false; // Flag para evitar logins simultâneos

  private http = inject(HttpClient);
  private router = inject(Router);
  private injector = inject(Injector);
  private websocketService = inject(WebsocketService);
  
  private get notificationService(): NotificationService {
    return this.injector.get(NotificationService);
  }

  constructor() {
    this.loadUserFromStorage();
  }

  login(email: string, password: string): Observable<LoginResponse> {
    if (this.isLoggingIn) {
      console.warn('⚠️ Login já em andamento, ignorando tentativa duplicada');
      return throwError(() => new Error('Login já em andamento'));
    }

    this.isLoggingIn = true;
    
    return this.http.post<LoginResponse>(`${this.API_URL}/login`, { email, password }).pipe(
      tap(response => {
        if (response.token && response.user) {
          this.setSession(response.token, response.user);
          this.websocketService.connect(response.user.id);
          // Inicializar notificações após delay maior para evitar rate limiting
          setTimeout(() => {
            this.notificationService.initializeNotifications();
          }, 3000);
        }
        this.isLoggingIn = false; // Reset flag após sucesso
      }),
      catchError(error => {
        this.isLoggingIn = false; // Reset flag após erro
        this.notificationService.error('Email ou senha inválidos', 'Falha no Login');
        return throwError(() => error);
      })
    );
  }

  logout(): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post(`${this.API_URL}/logout`, {}, { headers }).pipe(
      tap(() => {
        this.websocketService.disconnect();
        this.notificationService.resetNotificationState(); // Reset do estado das notificações
        this.clearSession();
        this.notificationService.info('Você foi desconectado.', 'Sessão Encerrada');
        this.router.navigate(['/login']);
      }),
      catchError(error => {
        this.websocketService.disconnect();
        this.notificationService.resetNotificationState(); // Reset mesmo em erro
        this.clearSession();
        this.router.navigate(['/login']);
        return throwError(() => error);
      })
    );
  }

  changePassword(endpoint: string, data: any): Observable<ChangePasswordResponse> {
    const headers = this.getAuthHeaders();
    const fullUrl = `${this.API_URL}/${endpoint}`;
    
    return this.http.post<ChangePasswordResponse>(fullUrl, data, { headers }).pipe(
      tap(response => {
        if (response.token && response.user) {
          this.setSession(response.token, response.user);
        } else if (response.user) {
          this.updateUser(response.user);
        }
      })
    );
  }

  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.API_URL}/forgot-password`, { email }).pipe(
      tap(response => {
        // Solicitação enviada
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  resetPassword(code: string, password: string): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.API_URL}/reset-password`, {
      token: code,
      password
    }).pipe(
      tap(response => {
        // Password reset successful
      }),
      catchError(error => {
        console.error('❌ Erro ao resetar senha:', error);
        return throwError(() => error);
      })
    );
  }

  validateResetCode(code: string): Observable<any> {
    return this.http.post(`${this.API_URL}/validate-reset-code`, { token: code }).pipe(
      tap(response => {
        // Reset code validated
      }),
      catchError(error => {
        console.error('❌ Código inválido:', error);
        return throwError(() => error);
      })
    );
  }

  getMe(): Observable<ApiUserResponse> {
    const headers = this.getAuthHeaders();
    return this.http.get<ApiUserResponse>(`${this.API_URL}/me`, { headers });
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  }

  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role;
  }

  isAdmin(): boolean {
    const user = this.getUser();
    return user?.role === 'admin' || user?.role_id === 1;
  }

  isAdminGerencial(): boolean {
    const user = this.getUser();
    return user?.role === 'admin_gerencial';
  }

  isConsultorRS(): boolean {
    const user = this.getUser();
    return user?.role === 'consultor_rs';
  }

  isAdminOrGerencial(): boolean {
    return this.isAdmin() || this.isAdminGerencial();
  }

  hasPermission(permission: string): boolean {
    const user = this.getUser();
    return user?.permissions?.includes(permission) || false;
  }

  getToken(): string | null {
    const token = localStorage.getItem('token');
    
    // Validar formato do token antes de retornar
    if (token && this.isValidJwtFormat(token)) {
      return token;
    }
    
    // Se token inválido, limpar storage
    if (token) {
      console.warn('🔑 Token inválido encontrado - limpando storage');
      this.clearSession();
    }
    
    return null;
  }

  private isValidJwtFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }
    
    // JWT deve ter 3 partes separadas por ponto
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }
    
    // Cada parte deve ser base64 válido (pelo menos tentar)
    try {
      for (const part of parts) {
        if (!part || part.trim() === '') {
          return false;
        }
        // Tentar decodificar as duas primeiras partes (header e payload)
        if (parts.indexOf(part) < 2) {
          JSON.parse(atob(part));
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  getUser(): User | null {
    return this.currentUserSubject.value;
  }

  mustChangePassword(): boolean {
    const user = this.getUser();
    return user?.must_change_password || false;
  }

  updateUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('Token não encontrado');
    }
    
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private setSession(token: string, user: User): void {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private clearSession(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  private loadUserFromStorage(): void {
    const userJson = localStorage.getItem('user');
    if (userJson && this.isAuthenticated()) {
      try {
        const user = JSON.parse(userJson);
        this.currentUserSubject.next(user);
        // Inicializar notificações se usuário já estiver autenticado (com delay maior)
        setTimeout(() => {
          this.notificationService.initializeNotifications();
        }, 3000);
      } catch (error) {
        console.error('❌ Erro ao analisar dados do usuário no localStorage. Limpando sessão.', error);
        this.clearSession();
      }
    } else {
      this.clearSession();
    }
  }

  refreshToken(): Observable<LoginResponse> {
    const headers = this.getAuthHeaders();
    return this.http.post<LoginResponse>(`${this.API_URL}/refresh`, {}, { headers }).pipe(
      tap(response => {
        if (response.token && response.user) {
          this.setSession(response.token, response.user);
          // Reinicializar notificações após refresh do token (com delay)
          setTimeout(() => {
            this.notificationService.initializeNotifications();
          }, 1500);
        }
      })
    );
  }
}