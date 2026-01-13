import { Component, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';

interface UserData {
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  cargo?: string;
}

@Component({
  selector: 'app-new-user-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './new-user-page.html',
  styleUrls: ['./new-user-page.css']
})
export class NewUserPageComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private profilePictureService = inject(ProfilePictureService);
  private toastr = inject(ToastrService);

  // Form data
  userData: UserData = {
    name: '',
    email: '',
    role: 'user',
    isActive: true,
    cargo: ''
  };

  // UI states
  isEditMode = false;
  editingUserId: number | null = null;
  isLoading = false;
  errorMessage = '';
  errors: { [key: string]: string } = {};
  profilePictureUrl = '';
  selectedProfilePicture: File | null = null;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.role !== 'admin') {
        this.toastr.error('Apenas administradores podem gerenciar usuários.');
        this.router.navigate(['/home/dashboard']);
        return;
      }
    }
    
    // Check if editing
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.editingUserId = +params['id'];
        this.loadUserData();
      }
    });
  }

  /**
   * Load user data for editing
   */
  private async loadUserData() {
    if (!this.editingUserId) return;
    
    try {
      const users = await this.userService.getUsers().toPromise();
      const user = users?.users.find(u => u.id === this.editingUserId);
      
      if (user) {
        this.isEditMode = true;
        this.userData = {
          name: user.name || '',
          email: user.email || '',
          role: user.role_name || 'user',
          isActive: user.is_active !== false,
          cargo: user.cargo || ''
        };
        
        // Load profile picture if exists
        if (user.profile_picture_path) {
          this.profilePictureService.getProfilePictureUrl(user.id).subscribe({
            next: (url) => {
              this.profilePictureUrl = url;
            },
            error: () => {
              this.profilePictureUrl = '';
            }
          });
        }
      } else {
        this.toastr.error('Usuário não encontrado');
        this.router.navigate(['/home/usuarios']);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar usuário:', error);
      this.toastr.error('Erro ao carregar dados do usuário');
      this.router.navigate(['/home/usuarios']);
    }
  }

  /**
   * Save user
   */
  async saveUser() {
    if (!this.validateForm()) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const payload: any = {
        name: this.userData.name,
        email: this.userData.email,
        role: this.userData.role,
        cargo: this.userData.cargo
      };

      if (this.isEditMode && this.editingUserId) {
        payload.is_active = this.userData.isActive;
        
        await this.userService.updateUser(this.editingUserId, payload).toPromise();
        
        // Upload profile picture if selected
        if (this.selectedProfilePicture) {
          try {
            await this.userService.uploadProfilePicture(this.editingUserId, this.selectedProfilePicture).toPromise();
            // Invalidar cache da foto de perfil
            this.profilePictureService.invalidateCache(this.editingUserId);
          } catch (error) {
            console.error('Erro ao fazer upload da foto de perfil:', error);
            this.toastr.warning('Usuário atualizado, mas houve erro ao salvar a foto de perfil');
          }
        }
        
        this.toastr.success('Usuário atualizado com sucesso!');
      } else {
        const createUser$ = this.userService.createUser(payload).pipe(
          timeout(30000), // 30 segundos de timeout
          catchError(err => {
            if (err.name === 'TimeoutError') {
              return throwError(() => new Error('Tempo limite excedido. Verifique sua conexão.'));
            }
            return throwError(() => err);
          })
        );

        const response = await firstValueFrom(createUser$);
        console.log('📝 Resposta da criação:', response);

        // Upload profile picture if selected for new user
        if (this.selectedProfilePicture) {
          console.log('📷 Foto selecionada, user id:', response.user?.id);
          if (response.user?.id) {
            try {
              const upload$ = this.userService.uploadProfilePicture(response.user.id, this.selectedProfilePicture).pipe(
                timeout(30000)
              );
              await firstValueFrom(upload$);
              this.profilePictureService.invalidateCache(response.user.id);
              console.log('✅ Foto de perfil enviada com sucesso');
            } catch (error) {
              console.error('❌ Erro ao fazer upload da foto de perfil:', error);
              this.toastr.warning('Usuário criado, mas houve erro ao salvar a foto de perfil');
            }
          } else {
            console.warn('⚠️ ID do usuário não encontrado na resposta');
          }
        }

        this.toastr.success('Usuário criado com sucesso! Uma senha temporária foi enviada por e-mail.');
      }

      window.dispatchEvent(new CustomEvent('refreshUsers'));
      this.router.navigate(['/home/usuarios']);
    } catch (error: any) {
      console.error('❌ Erro ao salvar usuário:', error);
      this.errorMessage = error.error?.message || 'Erro ao salvar usuário. Tente novamente.';
      this.toastr.error(this.errorMessage);
    } finally {
      this.isLoading = false;
    }
  }

  private validateForm(): boolean {
    this.errors = {};
    if (!this.userData.name.trim()) {
      this.errors['name'] = 'Nome é obrigatório';
    }
    if (!this.userData.email.trim()) {
      this.errors['email'] = 'Email é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.userData.email)) {
      this.errors['email'] = 'Email inválido';
    }
    return Object.keys(this.errors).length === 0;
  }

  cancel() {
    this.router.navigate(['/home/usuarios']);
  }

  getPageTitle(): string {
    return this.isEditMode ? 'Editar Usuário' : 'Novo Usuário';
  }

  triggerFileInput(): void {
    this.fileInput?.nativeElement?.click();
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedProfilePicture = input.files[0];
      
      // Preview the selected image
      const reader = new FileReader();
      reader.onload = (e) => {
        this.profilePictureUrl = e.target?.result as string;
      };
      reader.readAsDataURL(this.selectedProfilePicture);
    }
  }

  async removeProfilePicture(): Promise<void> {
    if (this.isEditMode && !this.editingUserId) return;
    
    // Se está editando, remove do servidor
    if (this.isEditMode && this.editingUserId) {
      try {
        this.isLoading = true;
        await this.userService.deleteProfilePicture(this.editingUserId).toPromise();
        // Invalidar cache da foto de perfil
        this.profilePictureService.invalidateCache(this.editingUserId);
        this.toastr.success('Foto de perfil removida com sucesso!');
      } catch (error) {
        console.error('Erro ao remover foto de perfil:', error);
        this.toastr.error('Erro ao remover foto de perfil');
      } finally {
        this.isLoading = false;
      }
    }
    
    // Em ambos os casos, limpa o preview local
    this.profilePictureUrl = '';
    this.selectedProfilePicture = null;
  }
}