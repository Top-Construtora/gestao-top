import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService, LoginResponse } from './auth';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private readonly API_URL = `${environment.authUrl}/login`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  /**
   * Realiza o login usando o AuthService
   */
  login(email: string, password: string): Observable<LoginResponse> {
    return this.authService.login(email, password);
  }

  /**
   * Solicita recuperação de senha
   */
  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.API_URL}/forgot-password`, { email });
  }

  /**
   * Redefine a senha usando token de recuperação
   */
  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.API_URL}/reset-password`, {
      token,
      new_password: newPassword
    });
  }

  /**
   * Verifica se o token de recuperação é válido
   */
  validateResetToken(token: string): Observable<any> {
    return this.http.post(`${this.API_URL}/validate-reset-token`, { token });
  }
}