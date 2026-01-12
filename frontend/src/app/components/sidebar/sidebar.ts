import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth';

interface NavItem {
  id: string;
  icon: string;
  text: string;
  route?: string;
  adminOnly?: boolean; // Requer Admin ou Admin Gerencial
  adminOnlyNotGerencial?: boolean; // Requer APENAS Admin (bloqueia Admin Gerencial)
  consultorRSOnly?: boolean; // Disponível apenas para Consultor R&S
  excludeConsultorRS?: boolean; // Esconder para Consultor R&S
  children?: NavItem[];
  isExpanded?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css']
})
export class SidebarComponent {
  // CORRECTED: Each property has its own @Input() decorator
  @Input() isCollapsed = false;
  @Input() isMobileSidebarOpen = false;
  @Output() sidebarToggled = new EventEmitter<void>();

  navSections: NavSection[] = [
    {
      title: 'PRINCIPAL',
      items: [
        { id: 'dashboard', icon: 'fas fa-chart-line', text: 'Dashboard', route: '/home/dashboard' },
        { id: 'servicos', icon: 'fas fa-briefcase', text: 'Serviços', route: '/home/servicos' },
        { id: 'clientes', icon: 'fas fa-users', text: 'Clientes', route: '/home/clientes', adminOnly: true },
        { id: 'propostas', icon: 'fas fa-file-alt', text: 'Propostas', route: '/home/propostas', adminOnly: true },
        { id: 'contratos', icon: 'fas fa-file-contract', text: 'Contratos', route: '/home/contratos', adminOnly: true }
      ]
    },
    {
      title: 'ANÁLISES',
      items: [
        { id: 'relatorios', icon: 'fas fa-chart-bar', text: 'Relatórios', route: '/home/relatorios', adminOnly: true, adminOnlyNotGerencial: true },
        { id: 'analytics', icon: 'fas fa-chart-pie', text: 'Analytics', route: '/home/analytics', adminOnly: true, adminOnlyNotGerencial: true }
      ]
    },
    {
      title: 'CONFIGURAÇÕES',
      items: [
        { id: 'usuarios', icon: 'fas fa-users', text: 'Usuários', route: '/home/usuarios', adminOnly: true, adminOnlyNotGerencial: true },
        { id: 'configuracoes', icon: 'fas fa-cog', text: 'Configurações', route: '/home/configuracoes' }
      ]
    },
    {
      title: 'AJUDA',
      items: [
        { id: 'ajuda', icon: 'fas fa-question-circle', text: 'Suporte', route: '/home/ajuda' }
      ]
    }
  ];
  
  filteredNavSections: NavSection[] = [];

  constructor(private router: Router, private authService: AuthService) {
    this.filterNavigationByRole();
  }

  isRouteActive(route: string): boolean {
    return this.router.isActive(route, { 
      paths: 'subset', 
      queryParams: 'subset', 
      fragment: 'ignored', 
      matrixParams: 'ignored' 
    });
  }

  private filterNavigationByRole() {
    const isAdmin = this.authService.isAdmin();
    const isAdminGerencial = this.authService.isAdminGerencial();

    this.filteredNavSections = this.navSections.map(section => ({
      ...section,
      items: section.items.filter(item => {
        // Bloquear itens que são APENAS para Admin (não Admin Gerencial)
        if (item.adminOnlyNotGerencial && !isAdmin) {
          return false;
        }

        // Se é admin, pode ver tudo
        if (isAdmin) {
          return true;
        }

        // Se é Admin Gerencial, pode ver itens adminOnly (exceto adminOnlyNotGerencial)
        if (isAdminGerencial && item.adminOnly) {
          return true;
        }

        // Se não é admin nem admin gerencial, não pode ver itens adminOnly
        if (item.adminOnly) {
          return false;
        }

        // Caso contrário, pode ver
        return true;
      }).map(item => {
        // Filtrar children também
        if (item.children) {
          return {
            ...item,
            children: item.children.filter(child => {
              // Bloquear children que são APENAS para Admin
              if (child.adminOnlyNotGerencial && !isAdmin) {
                return false;
              }
              return true;
            })
          };
        }
        return item;
      }).filter(item => !item.children || item.children.length > 0) // Remover itens com children vazios
    })).filter(section => section.items.length > 0);
  }

  toggleSidebar(): void {
    this.sidebarToggled.emit();
  }

  toggleDropdown(item: NavItem): void {
    if (item.children) {
      // Se a sidebar estiver encolhida, expandir primeiro
      if (this.isCollapsed) {
        this.toggleSidebar();
        // Dar um pequeno delay para a animação da sidebar
        setTimeout(() => {
          item.isExpanded = true;
        }, 100);
      } else {
        item.isExpanded = !item.isExpanded;
      }
    }
  }

  isChildRouteActive(children?: NavItem[]): boolean {
    if (!children) return false;
    return children.some(child => child.route && this.isRouteActive(child.route));
  }
}