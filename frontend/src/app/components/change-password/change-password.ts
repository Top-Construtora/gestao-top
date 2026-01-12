import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.html',
  styleUrls: ['./change-password.css']
})
export class ChangePasswordComponent implements OnInit {
  changePasswordForm: FormGroup;
  isFirstLogin: boolean = false;
  loading: boolean = false;
  error: string = '';

  // Estados de visibilidade das senhas
  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;
  showConfirmPassword: boolean = false;

  passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public router: Router // Tornado público para usar no template
  ) {
    this.changePasswordForm = this.fb.group({
      current_password: [''],
      new_password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(this.passwordRegex)]],
      confirm_password: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    const user = this.authService.getUser();
    this.isFirstLogin = user?.must_change_password || false;

    if (this.isFirstLogin) {
      // Remover campo de senha atual se for primeiro login
      this.changePasswordForm.removeControl('current_password');
    } else {
      // Adicionar validação obrigatória para senha atual se não for primeiro login
      this.changePasswordForm.get('current_password')?.setValidators([Validators.required]);
      this.changePasswordForm.get('current_password')?.updateValueAndValidity();
    }
  }

  hasUppercase(value: string): boolean {
    return value ? /[A-Z]/.test(value) : false;
  }

  hasNumber(value: string): boolean {
    return value ? /[0-9]/.test(value) : false;
  }

  hasSpecialChar(value: string): boolean {
    return value ? /[@$!%*?&]/.test(value) : false;
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('new_password')?.value;
    const confirmPassword = control.get('confirm_password')?.value;
    
    return newPassword === confirmPassword ? null : { mismatch: true };
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm') {
    switch (field) {
      case 'current':
        this.showCurrentPassword = !this.showCurrentPassword;
        break;
      case 'new':
        this.showNewPassword = !this.showNewPassword;
        break;
      case 'confirm':
        this.showConfirmPassword = !this.showConfirmPassword;
        break;
    }
  }

  getErrorMessage(fieldName: string): string {
    const field = this.changePasswordForm.get(fieldName);
    
    if (field?.errors) {
      if (field.errors['required']) {
        return 'Este campo é obrigatório';
      }
      if (field.errors['minlength']) {
        return 'A senha deve ter no mínimo 8 caracteres';
      }
      if (field.errors['pattern']) {
        return 'A senha deve incluir letra maiúscula, minúscula, número e caractere especial (@$!%*?&)';
      }
    }

    if (fieldName === 'confirm_password' && this.changePasswordForm.errors?.['mismatch']) {
      return 'As senhas não coincidem';
    }

    return '';
  }

  onSubmit() {
    if (this.changePasswordForm.valid) {
      this.loading = true;
      this.error = '';

      const endpoint = this.isFirstLogin 
        ? 'change-password-first-login'
        : 'change-password';

      const data = this.isFirstLogin 
        ? { new_password: this.changePasswordForm.value.new_password }
        : this.changePasswordForm.value;

      this.authService.changePassword(endpoint, data).subscribe({
        next: (response) => {
          if (response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
          }
          this.router.navigate(['/home/dashboard']);
        },
        error: (error) => {
          this.error = error.error?.error || 'Erro ao trocar senha';
          this.loading = false;
        }
      });
    } else {
      this.markFormGroupTouched(this.changePasswordForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      control?.markAsTouched({ onlySelf: true });
    });
  }
}