import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './settings-page.html',
  styleUrls: ['./settings-page.css']
})
export class SettingsPageComponent implements OnInit {
  activeTab = 'general';
  
  usuario = {
    nome: 'Carregando...',
    email: 'Carregando...',
    ultimoLogin: null as Date | null,
    dataCriacao: null as Date | null
  };
  
  
  seguranca = {
    ultimaAlteracaoSenha: null as Date | null
  };
  
  tabs = [
    { id: 'general', label: 'Geral', icon: 'fas fa-cog' },
    { id: 'security', label: 'Segurança', icon: 'fas fa-shield-alt' }
  ];
  
  private router = inject(Router);
  private authService = inject(AuthService);

  ngOnInit() {
    this.loadCurrentUser();
  }

  async loadCurrentUser() {
    try {
      const response = await firstValueFrom(this.authService.getMe());
      const user = response.user;
      
      this.usuario = {
        nome: user.name,
        email: user.email,
        ultimoLogin: user.last_login_at ? new Date(user.last_login_at) : null,
        dataCriacao: user.created_at ? new Date(user.created_at) : null
      };

      this.seguranca.ultimaAlteracaoSenha = user.last_password_change ? new Date(user.last_password_change) : null;

    } catch (error) {
      console.error("Failed to load user data", error);
      this.usuario.nome = "Erro ao carregar";
      this.usuario.email = "Erro ao carregar";
    }
  }

  setActiveTab(tabId: string) {
    this.activeTab = tabId;
  }
  
  
  alterarSenha() {
    this.router.navigate(['/change-password']);
  }
  
  cancelar() {
    // Recarregar dados originais
    this.loadCurrentUser();
  }
  
  formatarData(data: Date | null): string {
    if (!data) return 'Não disponível';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(data);
  }
}