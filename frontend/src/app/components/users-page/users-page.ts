import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { UserService } from '../../services/user';
import { ProfilePictureService } from '../../services/profile-picture.service';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, Subscription } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { DeleteConfirmationModalComponent } from '../delete-confirmation-modal/delete-confirmation-modal.component';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  permission: string;
  status: 'active' | 'inactive';
  since: string;
  initials: string;
  avatarGradient: string;
  profilePictureUrl?: string;
  hasProfilePicture?: boolean;
  cargo?: string;
  show_in_team?: boolean;
}

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent, DeleteConfirmationModalComponent],
  templateUrl: './users-page.html',
  styleUrls: ['./users-page.css']
})
export class UsersPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private userService = inject(UserService);
  private profilePictureService = inject(ProfilePictureService);
  private toastr = inject(ToastrService);
  private subscriptions = new Subscription();

  users: User[] = [];
  loading = false;
  error = '';
  currentFilter: 'active' | 'inactive' | 'all' = 'active';
  openDropdownId: number | null = null;
  canManageUsers = false; // Admin Gerencial não pode editar/deletar usuários

  // Delete Confirmation Modal
  showDeleteModal = false;
  selectedUserForDeletion: User | null = null;
  isDeleting = false;
  deleteMode: 'hard' | 'soft' | null = null;

  ngOnInit() {
    // Verificar se o usuário pode gerenciar usuários (criar/editar/deletar)
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        // Apenas Admin pode gerenciar usuários (Admin Gerencial não pode)
        this.canManageUsers = user.role === 'admin';
      } catch (error) {
        this.canManageUsers = false;
      }
    }

    this.loadUsers();
    this.subscribeToRefreshEvents();
    // Close dropdown when clicking outside
    document.addEventListener('click', this.closeDropdown.bind(this));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    window.removeEventListener('refreshUsers', this.handleRefreshUsers);
    document.removeEventListener('click', this.closeDropdown.bind(this));
  }

  private subscribeToRefreshEvents() {
    window.addEventListener('refreshUsers', this.handleRefreshUsers);
  }

  private handleRefreshUsers = () => {
    this.loadUsers();
  }

  setFilter(filter: 'active' | 'inactive' | 'all') {
    this.currentFilter = filter;
    this.loadUsers();
  }

  async loadUsers() {
    this.loading = true;
    this.error = '';

    const params: { is_active?: boolean } = {};
    if (this.currentFilter !== 'all') {
      params.is_active = this.currentFilter === 'active';
    }

    try {
      const response = await firstValueFrom(this.userService.getUsers(params));
      
      if (response && response.users) {
        this.users = response.users.map(user => this.mapApiUserToTableUser(user));
        this.loadProfilePictures();
      }
    } catch (error: any) {
      console.error('❌ Erro ao carregar usuários:', error);
      this.error = 'Erro ao carregar usuários. Tente novamente.';
      this.toastr.error('Erro ao carregar usuários');
    } finally {
      this.loading = false;
    }
  }

  private mapApiUserToTableUser(apiUser: any): User {
    const initials = this.getInitials(apiUser.name || apiUser.email);
    const since = apiUser.created_at 
    ? new Date(apiUser.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    
    return {
      id: apiUser.id,
      name: apiUser.name || 'Usuário',
      email: apiUser.email,
      role: this.getRoleDisplay(apiUser.role_name),
      permission: this.getPermissionDisplay(apiUser.role_name),
      status: apiUser.is_active ? 'active' : 'inactive',
      since: since,
      initials: initials,
      profilePictureUrl: undefined,
      avatarGradient: this.generateGradient(apiUser.name || apiUser.email),
      hasProfilePicture: !!(apiUser.profile_picture_path), // Nova propriedade
      cargo: apiUser.cargo,
      show_in_team: !!apiUser.show_in_team
    };
  }

  private loadProfilePictures(): void {
    this.users.forEach(user => {
      // Só carrega se o usuário tem foto de perfil no banco
      if (user.hasProfilePicture) {
        this.profilePictureService.getProfilePictureUrl(user.id).subscribe({
          next: (url) => {
            if (url) {
              user.profilePictureUrl = url;
            }
          },
          error: () => {
            // Ignora erros, mantém undefined para mostrar iniciais
          }
        });
      }
    });
  }

  private getRoleDisplay(roleName: string): string {
    const roleMap: { [key: string]: string } = {
      'admin': 'Administrador',
      'admin_gerencial': 'Admin Gerencial',
      'user': 'Usuário',
      'collaborator': 'Colaborador'
    };
    return roleMap[roleName] || 'Usuário';
  }

  private getPermissionDisplay(roleName: string): string {
    const permissionMap: { [key: string]: string } = {
      'admin': 'Admin',
      'admin_gerencial': 'Admin Gerencial',
      'consultor_rs': 'Consultor R&S',
      'user': 'Colaborador',
      'collaborator': 'Colaborador'
    };
    return permissionMap[roleName] || 'Colaborador';
  }

  private getInitials(name: string): string {
    if (!name) return 'NN';
    
    const words = name.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) return 'NN';
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  private generateGradient(name: string): string {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = hash & hash;
    }
    
    return gradients[Math.abs(hash) % gradients.length];
  }

  openNewUserPage() {
    this.router.navigate(['/home/usuarios/novo']);
  }

  editUser(userId: number) {
    this.router.navigate(['/home/usuarios/editar', userId]);
  }

  trackByUserId(index: number, user: User): number {
    return user.id;
  }

  async toggleUserStatus(user: User) {
    this.closeDropdown();
    const action = user.status === 'active' ? 'desativar' : 'ativar';
    const confirmMessage = `Tem certeza que deseja ${action} o usuário ${user.name}?`;
    
    if (confirm(confirmMessage)) {
      try {
        const newStatus = user.status === 'active' ? false : true;
        await this.userService.updateUser(user.id, { is_active: newStatus }).toPromise();
        
        this.toastr.success(`Usuário ${action === 'desativar' ? 'desativado' : 'ativado'} com sucesso!`);
        this.loadUsers();
      } catch (error) {
        console.error('❌ Erro ao alterar status do usuário:', error);
        this.toastr.error(`Erro ao ${action} usuário`);
      }
    }
  }

  async resetPassword(user: User) {
    this.closeDropdown();
    const confirmMessage = `Tem certeza que deseja resetar a senha do usuário ${user.name}? Uma nova senha temporária será enviada por email.`;
    
    if (confirm(confirmMessage)) {
      try {
        // Implementar chamada para API de reset de senha
        await this.userService.resetUserPassword(user.id).toPromise();
        
        this.toastr.success('Senha resetada com sucesso! O usuário receberá as instruções por email.');
      } catch (error) {
        console.error('❌ Erro ao resetar senha:', error);
        this.toastr.error('Erro ao resetar senha do usuário');
      }
    }
  }

  async toggleTeamVisibility(user: User) {
    this.closeDropdown();
    const action = user.show_in_team ? 'remover da' : 'adicionar à';
    const confirmMessage = `Tem certeza que deseja ${action} equipe pública o usuário ${user.name}?`;
    
    if (confirm(confirmMessage)) {
      try {
        const newVisibility = !user.show_in_team;
        await this.userService.updateTeamVisibility(user.id, newVisibility).toPromise();
        
        this.toastr.success(`Usuário ${newVisibility ? 'adicionado à' : 'removido da'} equipe pública com sucesso!`);
        this.loadUsers();
      } catch (error) {
        console.error('❌ Erro ao alterar visibilidade na equipe:', error);
        this.toastr.error(`Erro ao ${action} equipe pública`);
      }
    }
  }

  toggleDropdown(userId: number, event?: MouseEvent) {
    this.openDropdownId = this.openDropdownId === userId ? null : userId;
    
    if (this.openDropdownId === userId && event) {
      // Position dropdown after DOM update
      setTimeout(() => this.positionDropdown(event), 0);
    }
  }
  
  private positionDropdown(event: MouseEvent) {
    const button = event.target as HTMLElement;
    const container = button.closest('.dropdown-container');
    const dropdown = container?.querySelector('.dropdown-menu') as HTMLElement;
    if (!dropdown) return;
    
    const rect = button.getBoundingClientRect();
    const dropdownHeight = 200; // Approximate dropdown height
    const windowHeight = window.innerHeight;
    
    // Check if dropdown would go off-screen at bottom
    const shouldShowAbove = rect.bottom + dropdownHeight > windowHeight;
    
    if (shouldShowAbove) {
      dropdown.style.top = `${rect.top - dropdownHeight}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }
    
    dropdown.style.left = `${rect.right - 180}px`; // 180px = min-width
  }

  closeDropdown() {
    this.openDropdownId = null;
  }

  getEmptyStateTitle(): string {
    switch (this.currentFilter) {
      case 'active':
        return 'Nenhum usuário ativo encontrado';
      case 'inactive':
        return 'Nenhum usuário inativo encontrado';
      case 'all':
        return 'Nenhum usuário cadastrado';
      default:
        return 'Nenhum usuário encontrado';
    }
  }

  getEmptyStateMessage(): string {
    switch (this.currentFilter) {
      case 'active':
        return 'Não há usuários ativos no momento.';
      case 'inactive':
        return 'Não há usuários inativos no momento.';
      case 'all':
        return 'Adicione o primeiro usuário clicando no botão acima';
      default:
        return 'Não há usuários para exibir.';
    }
  }

  deleteUser(userId: number, userName: string) {
    this.closeDropdown();
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.selectedUserForDeletion = user;
      this.deleteMode = 'hard'; // Começar com exclusão permanente
      this.showDeleteModal = true;
    }
  }

  confirmDeleteUser() {
    if (!this.selectedUserForDeletion) return;
    
    this.isDeleting = true;
    
    const deletePromise = this.deleteMode === 'hard' 
      ? firstValueFrom(this.userService.hardDeleteUser(this.selectedUserForDeletion.id))
      : firstValueFrom(this.userService.softDeleteUser(this.selectedUserForDeletion.id));
    
    deletePromise
      .then(() => {
        if (this.deleteMode === 'hard') {
          this.toastr.success('Usuário excluído permanentemente!');
        } else {
          this.toastr.info('Usuário desativado e anonimizado.');
        }
        this.showDeleteModal = false;
        this.selectedUserForDeletion = null;
        this.deleteMode = null;
        this.loadUsers();
      })
      .catch((error: any) => {
        const errorMessage = this.deleteMode === 'hard' 
          ? 'Erro ao excluir permanentemente o usuário.'
          : 'Erro ao desativar o usuário.';
        this.toastr.error(error.error?.error || errorMessage);
      })
      .finally(() => {
        this.isDeleting = false;
      });
  }

  cancelDeleteUser() {
    // Se cancelou a exclusão permanente, perguntar sobre soft delete
    if (this.deleteMode === 'hard') {
      this.deleteMode = 'soft';
      return; // Manter modal aberto mas mudar para soft delete
    }
    
    // Se cancelou o soft delete também, fechar modal
    this.showDeleteModal = false;
    this.selectedUserForDeletion = null;
    this.deleteMode = null;
    this.isDeleting = false;
  }

  getDeleteModalTitle(): string {
    return this.deleteMode === 'hard' 
      ? 'Confirmar Exclusão Permanente' 
      : 'Confirmar Desativação de Usuário';
  }

  getDeleteModalMessage(): string {
    return this.deleteMode === 'hard'
      ? 'Tem certeza que deseja excluir permanentemente este usuário? Esta ação é irreversível e o usuário não poderá ser recuperado.'
      : 'Tem certeza que deseja desativar e anonimizar este usuário? Esta ação manterá o histórico do usuário, mas impedirá seu acesso ao sistema.';
  }

  getDeleteButtonText(): string {
    return this.deleteMode === 'hard' 
      ? 'Excluir Permanentemente' 
      : 'Desativar Usuário';
  }

  getCancelButtonText(): string {
    return this.deleteMode === 'hard' 
      ? 'Desativar ao invés' 
      : 'Cancelar';
  }
}