import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { LoginPrimaryInput } from '../../components/login-primary-input/login-primary-input';
import { LoginLayout } from '../../components/login-layout/login-layout';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  imports: [
    LoginLayout,
    ReactiveFormsModule,
    LoginPrimaryInput,
    RouterLink,
    CommonModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  loginForm: FormGroup;
  error = '';
  loading = false;

  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastrService);

  constructor() {
    this.loginForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
    });
  }

  submit() {
    if (this.loginForm.invalid) {
      this.error = 'Por favor, preencha todos os campos corretamente.';
      return;
    }

    this.loading = true;
    this.error = '';
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: (response: any) => {
        if (response.user.must_change_password) {
          this.router.navigate(['/change-password']);
        } else {
          this.router.navigate(['/home']);
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Email ou senha inválidos.';
        this.loading = false;
      }
    });
  }

  navigate() {
    this.router.navigate(['register']);
  }
}
