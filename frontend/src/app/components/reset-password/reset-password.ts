import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { LoginLayout } from '../login-layout/login-layout';
import { AuthService } from '../../services/auth';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    RouterLink,
    LoginLayout
  ],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm: FormGroup;
  loading = false;
  error = '';
  buttonText = 'Resetar Senha';
  email = '';

  // Estados de visibilidade das senhas
  showPassword = false;
  showConfirmPassword = false;

  // Regex para senha forte (mesma do backend)
  private passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private notificationService: NotificationService
  ) {
    this.resetPasswordForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(this.passwordRegex)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    // Pegar email dos query params
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
    });
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    
    return password === confirmPassword ? null : { mismatch: true };
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onCodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    // Permitir apenas números
    input.value = input.value.replace(/[^0-9]/g, '');
  }

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.resetPasswordForm.valid && !this.loading) {
      event.preventDefault();
      this.submit();
    }
  }

  // Helper methods for template password validation
  hasMinLength(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    return password && password.length >= 8;
  }

  hasLowercase(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    return password && /[a-z]/.test(password);
  }

  hasUppercase(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    return password && /[A-Z]/.test(password);
  }

  hasNumber(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    return password && /\d/.test(password);
  }

  hasSpecialChar(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    return password && /[@$!%*?&]/.test(password);
  }

  passwordsMatch(): boolean {
    const password = this.resetPasswordForm.get('password')?.value;
    const confirmPassword = this.resetPasswordForm.get('confirmPassword')?.value;
    return password === confirmPassword && confirmPassword;
  }

  getErrorMessage(fieldName: string): string {
    const field = this.resetPasswordForm.get(fieldName);

    if (field?.errors) {
      if (field.errors['required']) {
        return 'Este campo é obrigatório';
      }
      if (field.errors['pattern']) {
        if (fieldName === 'code') {
          return 'O código deve ter 6 dígitos';
        }
        if (fieldName === 'password') {
          return 'A senha deve conter letra maiúscula, minúscula, número e caractere especial (@$!%*?&)';
        }
      }
      if (field.errors['minlength']) {
        return 'A senha deve ter pelo menos 8 caracteres';
      }
    }

    // Erro de confirmação de senha
    if (fieldName === 'confirmPassword' && this.resetPasswordForm.errors?.['mismatch']) {
      return 'As senhas não coincidem';
    }

    return '';
  }

  submit() {
    if (this.resetPasswordForm.valid && !this.loading) {
      this.loading = true;
      this.error = '';
      this.buttonText = 'Resetando...';

      const { code, password } = this.resetPasswordForm.value;

      this.authService.resetPassword(code, password).subscribe({
        next: () => {
          this.notificationService.success(
            'Senha alterada!',
            'Sua senha foi alterada com sucesso. Faça login com a nova senha.'
          );
          
          // Redirecionar para login
          this.router.navigate(['/login']);
        },
        error: (error) => {
          this.loading = false;
          this.buttonText = 'Resetar Senha';
          
          if (error.status === 400) {
            if (error.error?.error?.includes('expirado')) {
              this.error = 'Código expirado. Solicite um novo código.';
            } else if (error.error?.error?.includes('inválido')) {
              this.error = 'Código inválido. Verifique e tente novamente.';
            } else {
              this.error = error.error?.error || 'Erro ao resetar senha';
            }
          } else if (error.status === 429) {
            this.error = 'Muitas tentativas. Aguarde alguns minutos.';
          } else {
            this.error = 'Erro ao resetar senha. Tente novamente.';
          }
        }
      });
    } else {
      // Marcar todos os campos como tocados para mostrar erros
      this.markFormGroupTouched(this.resetPasswordForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      control?.markAsTouched({ onlySelf: true });
    });
  }
}