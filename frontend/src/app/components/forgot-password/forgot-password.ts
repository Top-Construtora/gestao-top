// src/app/components/forgot-password/forgot-password.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { NotificationService } from '../../services/notification.service';
import { LoginLayout } from '../login-layout/login-layout';
import { LoginPrimaryInput } from '../login-primary-input/login-primary-input';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ CommonModule, ReactiveFormsModule, RouterLink, LoginLayout, LoginPrimaryInput ],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css']
})
export class ForgotPasswordComponent {
  requestForm: FormGroup;
  isLoading = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router
  ) {
    this.requestForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async requestReset() {
    if (this.requestForm.invalid) {
      this.notificationService.warning('Por favor, informe um e-mail válido.');
      return;
    }
    this.isLoading = true;
    this.error = '';

    try {
      const email = this.requestForm.value.email;
      await firstValueFrom(this.authService.forgotPassword(email));
      
      this.notificationService.success('Código de recuperação enviado! Redirecionando...', 'Sucesso');
      this.router.navigate(['/reset-password'], { queryParams: { email: email } });
      
    } catch (error: any) {
      const email = this.requestForm.value.email;
      this.notificationService.success('Se o e-mail estiver cadastrado, você receberá um código.', 'Verifique sua caixa de entrada');
      this.router.navigate(['/reset-password'], { queryParams: { email: email } });
    } finally {
      this.isLoading = false;
    }
  }
}