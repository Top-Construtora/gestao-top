import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, CreateUserRequest, UpdateUserRequest, ApiUser } from '../../services/user';
import { ToastrService } from 'ngx-toastr';

interface UserFormData {
  name: string;
  email: string;
  role: 'admin' | 'user';
  password: string;
}

@Component({
  selector: 'app-user-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-modal.html',
  styleUrls: ['./user-modal.css']
})
export class UserModal implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() editingUser: ApiUser | null = null; // ← Usuário sendo editado
  
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  
  // Form data
  userData: UserFormData = {
    name: '',
    email: '',
    role: 'user',
    password: ''
  };
  
  roleOptions = [
    { value: 'user', label: 'Usuário' },
    { value: 'admin', label: 'Administrador' }
  ];

  loading = false;
  isEditMode = false; // ← Flag para modo de edição
  
  constructor(
    private userService: UserService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.setupForm();
  }

  ngOnChanges(changes: SimpleChanges) {
    
    if (changes['isOpen'] && this.isOpen) {
      this.setupForm();
    }
    
    if (changes['editingUser']) {
      this.setupForm();
    }
  }

  /**
   * Configurar formulário baseado no modo (criar/editar)
   */
  private setupForm() {
    this.isEditMode = !!this.editingUser;
    
    if (this.isEditMode && this.editingUser) {
      // Modo edição - pré-popular dados
      this.userData = {
        name: this.editingUser.name,
        email: this.editingUser.email,
        role: this.editingUser.role_name === 'admin' ? 'admin' : 'user',
        password: '' // Senha não é necessária na edição
      };
      console.log('🔍 Populated userData for edit:', this.userData); // Debug
    } else {
      // Modo criação - limpar formulário e gerar senha
      this.resetForm();
      if (this.isOpen && !this.userData.password) {
        this.generatePassword();
      }
    }
  }

  generatePassword() {
    this.userData.password = this.userService.generateTempPassword();
  }
  
  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.close.emit();
    }
  }
  
  onSave() {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;

    if (this.isEditMode && this.editingUser) {
      this.updateUser();
    } else {
      this.createUser();
    }
  }

  /**
   * Criar novo usuário
   */
  private createUser() {
    const createUserData: CreateUserRequest = {
      email: this.userData.email,
      password: this.userData.password,
      name: this.userData.name,
      role: this.userData.role
    };

    this.userService.createUser(createUserData).subscribe({
      next: (response) => {
        this.toastr.success('Usuário criado com sucesso!');
        this.handleSuccess();
      },
      error: (error) => {
        this.handleError(error, 'criar');
      }
    });
  }

  /**
   * Atualizar usuário existente
   */
  private updateUser() {
    if (!this.editingUser) return;

    const updateUserData: UpdateUserRequest = {
      name: this.userData.name,
      email: this.userData.email,
      role: this.userData.role
    };

    // Remover campos vazios ou inalterados
    if (updateUserData.name === this.editingUser.name) {
      delete updateUserData.name;
    }
    if (updateUserData.email === this.editingUser.email) {
      delete updateUserData.email;
    }
    if (updateUserData.role === (this.editingUser.role_name === 'admin' ? 'admin' : 'user')) {
      delete updateUserData.role;
    }

    // Se nada mudou, não fazer requisição
    if (Object.keys(updateUserData).length === 0) {
      this.toastr.info('Nenhuma alteração detectada');
      this.loading = false;
      return;
    }

    this.userService.updateUser(this.editingUser.id, updateUserData).subscribe({
      next: (response) => {
        this.toastr.success('Usuário atualizado com sucesso!');
        this.handleSuccess();
      },
      error: (error) => {
        this.handleError(error, 'atualizar');
      }
    });
  }

  /**
   * Tratar sucesso das operações
   */
  private handleSuccess() {
    this.resetForm();
    this.save.emit(); // Notificar componente pai
    this.close.emit();
    this.loading = false;
  }

  /**
   * Tratar erro das operações
   */
  private handleError(error: any, action: string) {
    console.error(`Erro ao ${action} usuário:`, error);
    
    let errorMessage = `Erro ao ${action} usuário`;
    if (error.status === 409) {
      errorMessage = 'Email já cadastrado';
    } else if (error.status === 403) {
      errorMessage = 'Sem permissão para esta operação';
    } else if (error.error?.error) {
      errorMessage = error.error.error;
    }
    
    this.toastr.error(errorMessage);
    this.loading = false;
  }

  private validateForm(): boolean {
    if (!this.userData.name.trim()) {
      this.toastr.warning('Nome é obrigatório');
      return false;
    }

    if (!this.userData.email.trim()) {
      this.toastr.warning('Email é obrigatório');
      return false;
    }

    if (!this.isValidEmail(this.userData.email)) {
      this.toastr.warning('Email inválido');
      return false;
    }

    // Senha só é obrigatória na criação
    if (!this.isEditMode) {
      if (!this.userData.password) {
        this.toastr.warning('Senha é obrigatória');
        return false;
      }

      if (this.userData.password.length < 6) {
        this.toastr.warning('Senha deve ter pelo menos 6 caracteres');
        return false;
      }
    }

    return true;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private resetForm() {
    this.userData = {
      name: '',
      email: '',
      role: 'user',
      password: ''
    };
    this.isEditMode = false;
  }

  onClose() {
    this.resetForm();
    this.close.emit();
  }

  /**
   * Getter para título do modal
   */
  get modalTitle(): string {
    return this.isEditMode ? 'Editar Usuário' : 'Novo Usuário';
  }

  /**
   * Getter para texto do botão
   */
  get saveButtonText(): string {
    if (this.loading) {
      return this.isEditMode ? 'Atualizando...' : 'Criando...';
    }
    return this.isEditMode ? 'Atualizar Usuário' : 'Criar Usuário';
  }
}