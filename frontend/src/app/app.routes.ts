import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { HomeComponent } from './pages/home/home';
import { ChangePasswordComponent } from './components/change-password/change-password';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password';
import { ResetPasswordComponent } from './components/reset-password/reset-password';
import { DashboardContentComponent } from './components/dashboard-content/dashboard-content';
import { ContractsTableComponent } from './components/contracts-table/contracts-table';
import { ContractFormComponent } from './components/contract-form/contract-form';
import { ContractViewPageComponent } from './components/contract-view-page/contract-view-page';
import { ClientsTableComponent } from './components/clients-table/clients-table';
import { NewClientPageComponent } from './components/new-client-page/new-client-page';
import { ClientViewPageComponent } from './components/client-view-page/client-view-page';
import { ServicesTableComponent } from './components/services-table/services-table';
import { ServiceFormComponent } from './components/services-form/services-form';
import { ProposalsPageComponent } from './components/proposals-page/proposals-page';
import { ProposalFormComponent } from './components/proposal-form/proposal-form';
import { ProposalViewPageComponent } from './components/proposal-view-page/proposal-view-page';
import { PublicProposalViewComponent } from './pages/public-proposal-view/public-proposal-view.component';
import { ReportsPage } from './components/reports-page/reports-page';
import { AnalyticsPageComponent } from './components/analytics-page/analytics-page';
import { UsersPageComponent } from './components/users-page/users-page';
import { NewUserPageComponent } from './components/new-user-page/new-user-page';
import { SettingsPageComponent } from './components/settings-page/settings-page';
import { HelpPageComponent } from './components/help-page/help-page';
import { AccessDeniedComponent } from './pages/access-denied/access-denied';
import { AuthGuard } from './guards/auth-guard';
import { MustChangePasswordGuard } from './guards/must-change-password-guard';
import { AdminGuard } from './guards/admin-guard';
import { AdminOnlyGuard } from './guards/admin-only-guard';
import { AdminGerencialGuard } from './guards/admin-gerencial-guard';
import { UserGuard } from './guards/user-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },

  // Rotas de recuperação de senha - públicas
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    title: 'Esqueci minha senha - TOP Construtora',
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    title: 'Nova senha - TOP Construtora',
  },


  // Rota pública para visualização de propostas
  {
    path: 'public/proposal/:token',
    component: PublicProposalViewComponent,
    title: 'Proposta Comercial - TOP Construtora',
  },

  // Rota de acesso negado
  {
    path: 'access-denied',
    component: AccessDeniedComponent,
    title: 'Acesso Negado - TOP Construtora',
  },

  // Rota para trocar senha - protegida apenas por autenticação
  {
    path: 'change-password',
    component: ChangePasswordComponent,
    canActivate: [AuthGuard],
    title: 'Alterar Senha - TOP Construtora',
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [AuthGuard, MustChangePasswordGuard],
    children: [
      // Rota padrão dentro de /home redireciona para dashboard
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },

      // Dashboard principal
      {
        path: 'dashboard',
        component: DashboardContentComponent,
        title: 'Dashboard - TOP Construtora',
      },

      // Gestão de contratos
      {
        path: 'contratos',
        component: ContractsTableComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Contratos - TOP Construtora',
      },

      // Novo contrato
      {
        path: 'contratos/novo',
        component: ContractFormComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Novo Contrato - TOP Construtora',
      },

      // Visualizar contrato
      {
        path: 'contratos/visualizar/:id',
        component: ContractViewPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Visualizar Contrato - TOP Construtora',
      },

      // Editar contrato
      {
        path: 'contratos/editar/:id',
        component: ContractFormComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Editar Contrato - TOP Construtora',
      },

      // Gestão de clientes
      {
        path: 'clientes',
        component: ClientsTableComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Clientes - TOP Construtora',
      },

      // Novo cliente
      {
        path: 'clientes/novo',
        component: NewClientPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Novo Cliente - TOP Construtora',
      },

      // Visualizar cliente
      {
        path: 'clientes/visualizar/:id',
        component: ClientViewPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Detalhes do Cliente - TOP Construtora',
      },

      // Editar cliente
      {
        path: 'clientes/editar/:id',
        component: NewClientPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Editar Cliente - TOP Construtora',
      },

      // Gestão de serviços
      {
        path: 'servicos',
        component: ServicesTableComponent,
        canActivate: [UserGuard],
        title: 'Serviços - TOP Construtora',
      },
      
      // Novo serviço
      {
        path: 'servicos/novo',
        component: ServiceFormComponent,
        canActivate: [UserGuard],
        title: 'Novo Serviço - TOP Construtora',
      },
      
      // Editar serviço
      {
        path: 'servicos/editar/:id',
        component: ServiceFormComponent,
        canActivate: [UserGuard],
        title: 'Editar Serviço - TOP Construtora',
      },

      // Gestão de propostas
      {
        path: 'propostas',
        component: ProposalsPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Propostas - TOP Construtora',
      },

      // Nova proposta
      {
        path: 'propostas/nova',
        component: ProposalFormComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Nova Proposta - TOP Construtora',
      },

      // Visualizar proposta
      {
        path: 'propostas/visualizar/:id',
        component: ProposalViewPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Visualizar Proposta - TOP Construtora',
      },

      // Editar proposta
      {
        path: 'propostas/editar/:id',
        component: ProposalFormComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Editar Proposta - TOP Construtora',
      },

      // Relatórios - APENAS Admin (bloqueia Admin Gerencial)
      {
        path: 'relatorios',
        component: ReportsPage,
        canActivate: [AdminOnlyGuard],
        title: 'Relatórios - TOP Construtora',
      },


      // Analytics e métricas - APENAS Admin (bloqueia Admin Gerencial)
      {
        path: 'analytics',
        component: AnalyticsPageComponent,
        canActivate: [AdminOnlyGuard],
        title: 'Analytics - TOP Construtora',
      },

      // Gestão de usuários - Admin Gerencial pode APENAS visualizar
      {
        path: 'usuarios',
        component: UsersPageComponent,
        canActivate: [AdminGerencialGuard],
        title: 'Usuários - TOP Construtora',
      },

      // Novo usuário - APENAS Admin
      {
        path: 'usuarios/novo',
        component: NewUserPageComponent,
        canActivate: [AdminOnlyGuard],
        title: 'Novo Usuário - TOP Construtora',
      },

      // Editar usuário - APENAS Admin
      {
        path: 'usuarios/editar/:id',
        component: NewUserPageComponent,
        canActivate: [AdminOnlyGuard],
        title: 'Editar Usuário - TOP Construtora',
      },

      // Configurações do sistema
      {
        path: 'configuracoes',
        component: SettingsPageComponent,
        title: 'Configurações - TOP Construtora',
      },

      // Ajuda e suporte
      {
        path: 'ajuda',
        component: HelpPageComponent,
        title: 'Ajuda - TOP Construtora',
      },

      // Redirecionamentos para compatibilidade com rotas antigas
      { path: 'contracts', redirectTo: 'contratos', pathMatch: 'full' },
      { path: 'contracts/new', redirectTo: 'contratos/novo', pathMatch: 'full' },
      { path: 'contracts/view/:id', redirectTo: 'contratos/visualizar/:id', pathMatch: 'full' },
      { path: 'contracts/edit/:id', redirectTo: 'contratos/editar/:id', pathMatch: 'full' },
      
      { path: 'clients', redirectTo: 'clientes', pathMatch: 'full' },
      { path: 'clients/new', redirectTo: 'clientes/novo', pathMatch: 'full' },
      { path: 'clients/view/:id', redirectTo: 'clientes/visualizar/:id', pathMatch: 'full' },
      { path: 'clients/edit/:id', redirectTo: 'clientes/editar/:id', pathMatch: 'full' },
      
      { path: 'services', redirectTo: 'servicos', pathMatch: 'full' },
      { path: 'services/new', redirectTo: 'servicos/novo', pathMatch: 'full' },
      { path: 'services/edit/:id', redirectTo: 'servicos/editar/:id', pathMatch: 'full' },
      
      { path: 'proposals', redirectTo: 'propostas', pathMatch: 'full' },
      { path: 'proposals/new', redirectTo: 'propostas/nova', pathMatch: 'full' },
      { path: 'proposals/view/:id', redirectTo: 'propostas/visualizar/:id', pathMatch: 'full' },
      { path: 'proposals/edit/:id', redirectTo: 'propostas/editar/:id', pathMatch: 'full' },
      
      { path: 'reports', redirectTo: 'relatorios', pathMatch: 'full' },

      { path: 'users', redirectTo: 'usuarios', pathMatch: 'full' },
      { path: 'users/new', redirectTo: 'usuarios/novo', pathMatch: 'full' },
      { path: 'users/edit/:id', redirectTo: 'usuarios/editar/:id', pathMatch: 'full' },
      
      { path: 'settings', redirectTo: 'configuracoes', pathMatch: 'full' },
      { path: 'help', redirectTo: 'ajuda', pathMatch: 'full' },
    ],
  },

  // Rota wildcard para páginas não encontradas - redireciona para login
  {
    path: '**',
    redirectTo: '/login',
  },
];