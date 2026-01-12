import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalService } from '../../services/modal.service';
import { ClientService, ApiClient } from '../../services/client';
import { ContractService } from '../../services/contract';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { DeleteConfirmationModalComponent } from '../delete-confirmation-modal/delete-confirmation-modal.component';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { environment } from '../../../environments/environment';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface ClientDisplay {
  id: number;
  name: string;
  initials: string;
  type: 'PF' | 'PJ';
  location: string;
  document: string;
  contracts: number;
  activeContracts: number;
  totalValue: string;
  gradient: string;
  actionMenuOpen: boolean;
  raw: ApiClient;
  logo_path?: string | null;
  logoUrl?: SafeUrl;
  company_name?: string;
  trade_name?: string;
}

@Component({
  selector: 'app-clients-table',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent, DeleteConfirmationModalComponent],
  templateUrl: './clients-table.html',
  styleUrls: ['./clients-table.css'],
})
export class ClientsTableComponent implements OnInit, OnDestroy {
  public authService = inject(AuthService);
  private modalService = inject(ModalService);
  private clientService = inject(ClientService);
  private contractService = inject(ContractService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);

  private subscriptions = new Subscription();

  stats = {
    total: 0,
    active: 0,
    activePercentage: 0,
    newProspects: 0,
  };

  clients: ClientDisplay[] = [];
  filteredClients: ClientDisplay[] = [];
  searchTerm = '';
  isLoading = true;
  error = '';
  dropdownOpen: number | null = null;

  // Delete Confirmation Modal
  showDeleteModal = false;
  selectedClientForDeletion: ClientDisplay | null = null;
  isDeleting = false;
  deleteMode: 'soft' | 'hard' | null = null;

  ngOnInit() {
    this.loadData();
    window.addEventListener('refreshClients', this.loadData.bind(this));
    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  ngOnDestroy() {
    this.clients.forEach((client) => {
      if (client.logoUrl) {
        URL.revokeObjectURL(client.logoUrl.toString());
      }
    });
    this.subscriptions.unsubscribe();
    window.removeEventListener('refreshClients', this.loadData.bind(this));
    document.removeEventListener('click', this.handleClickOutside.bind(this));
  }

  async loadData() {
    this.isLoading = true;
    this.error = '';
    try {
      const clientsResponse = await firstValueFrom(
        this.clientService.getClients({ is_active: true })
      );
      const contractsResponse = await firstValueFrom(
        this.contractService.getContracts()
      );

      this.clients = clientsResponse.clients.map((apiClient) => {
        const clientContracts = contractsResponse.contracts.filter(
          (c) => c.client.id === apiClient.id
        );
        const aggregates = {
          totalCount: clientContracts.length,
          activeCount: clientContracts.filter((c) => c.status === 'active')
            .length,
          totalValue: clientContracts.reduce(
            (sum, c) => sum + (c.total_value ?? 0),
            0
          ),
        };
        return this.mapApiClientToTableClient(apiClient, aggregates);
      });

      this.filteredClients = [...this.clients].sort((a, b) => a.name.localeCompare(b.name));
      this.loadLogos(); // Carrega as logos após os dados dos clientes
    } catch (err) {
      console.error('❌ Error loading client data:', err);
      this.error = 'Não foi possível carregar os dados dos clientes.';
    } finally {
      this.isLoading = false;
    }
  }

  loadLogos() {
    this.filteredClients.forEach((client) => {
      if (client.logo_path) {
        this.clientService.getClientLogo(client.id).subscribe((blob) => {
          const objectURL = URL.createObjectURL(blob);
          client.logoUrl = this.sanitizer.bypassSecurityTrustUrl(objectURL);
        });
      }
    });
  }

  softDeleteClient(client: ClientDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedClientForDeletion = client;
    this.deleteMode = 'soft';
    this.showDeleteModal = true;
  }

  hardDeleteClient(client: ClientDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedClientForDeletion = client;
    this.deleteMode = 'hard';
    this.showDeleteModal = true;
  }

  confirmDeleteClient() {
    if (!this.selectedClientForDeletion) return;
    
    this.isDeleting = true;
    
    const deletePromise = this.deleteMode === 'soft' 
      ? firstValueFrom(this.clientService.deleteClient(this.selectedClientForDeletion.id))
      : firstValueFrom(this.clientService.deleteClientPermanent(this.selectedClientForDeletion.id));
    
    deletePromise
      .then(() => {
        if (this.deleteMode === 'soft') {
          this.modalService.showSuccess('Cliente desativado com sucesso!');
        } else {
          this.modalService.showSuccess('Cliente excluído permanentemente!');
        }
        this.showDeleteModal = false;
        this.selectedClientForDeletion = null;
        this.deleteMode = null;
        this.loadData();
      })
      .catch((error: any) => {
        // Verificar se temos uma mensagem de erro específica do backend
        let errorMessage: string;
        if (error?.error?.message) {
          errorMessage = error.error.message;
        } else {
          errorMessage = this.deleteMode === 'soft' 
            ? 'Não foi possível desativar o cliente.'
            : 'Não foi possível excluir o cliente permanentemente.';
        }
        this.modalService.showError(errorMessage);
      })
      .finally(() => {
        this.isDeleting = false;
      });
  }

  cancelDeleteClient() {
    this.showDeleteModal = false;
    this.selectedClientForDeletion = null;
    this.deleteMode = null;
    this.isDeleting = false;
  }

  getDeleteModalTitle(): string {
    return this.deleteMode === 'soft' 
      ? 'Confirmar Desativação de Cliente' 
      : 'Confirmar Exclusão Permanente';
  }

  getDeleteModalMessage(): string {
    return this.deleteMode === 'soft'
      ? 'Tem certeza que deseja desativar este cliente? O cliente sairá da lista principal, mas o histórico será mantido.'
      : 'Tem certeza que deseja excluir permanentemente este cliente? Esta ação é irreversível e excluirá todos os dados associados.';
  }

  getDeleteButtonText(): string {
    return this.deleteMode === 'soft' 
      ? 'Desativar Cliente' 
      : 'Excluir Permanentemente';
  }

  private mapApiClientToTableClient(
    apiClient: ApiClient,
    aggregates?: { totalCount: number; activeCount: number; totalValue: number }
  ): ClientDisplay {
    const initials = this.getInitials(apiClient.name);

    return {
      id: apiClient.id,
      name: apiClient.name,
      initials: initials,
      type: apiClient.type,
      location: `${apiClient.city}/${apiClient.state}`,
      document: this.clientService.getFormattedDocument(apiClient),
      contracts: aggregates?.totalCount || 0,
      activeContracts: aggregates?.activeCount || 0,
      totalValue: this.contractService.formatValue(aggregates?.totalValue || 0),
      gradient: this.generateGradient(apiClient.name),
      actionMenuOpen: false,
      raw: apiClient,
      logo_path: apiClient.logo_path,
      company_name: apiClient.company_name,
      trade_name: apiClient.trade_name,
    };
  }

  private getInitials(name: string): string {
    const words = name.split(' ').filter((word) => word.length > 0);

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
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash = hash & hash;
    }

    return gradients[Math.abs(hash) % gradients.length];
  }

  openNewClientPage() {
    this.router.navigate(['/home/clientes/novo']);
  }

  viewClient(id: number) {
    this.router.navigate(['/home/clientes/visualizar', id]);
  }

  editClient(id: number) {
    this.router.navigate(['/home/clientes/editar', id]);
  }

  toggleDropdown(clientId: number, event: MouseEvent) {
    event.stopPropagation();
    this.dropdownOpen = this.dropdownOpen === clientId ? null : clientId;
    
    if (this.dropdownOpen === clientId) {
      // Position dropdown after DOM update
      setTimeout(() => this.positionDropdown(event), 0);
    }
  }
  
  private positionDropdown(event: MouseEvent) {
    const button = event.target as HTMLElement;
    const dropdown = button.closest('.dropdown')?.querySelector('.dropdown-menu') as HTMLElement;
    if (!dropdown) return;
    
    const rect = button.getBoundingClientRect();
    const dropdownHeight = 200; // Approximate dropdown height
    const windowHeight = window.innerHeight;
    
    // Check if dropdown would go off-screen at bottom
    const shouldShowAbove = rect.bottom + dropdownHeight > windowHeight;
    
    if (shouldShowAbove) {
      dropdown.style.top = `${rect.top - dropdownHeight}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 8}px`;
    }
    
    dropdown.style.left = `${rect.right - 150}px`; // 150px = min-width
  }

  closeDropdown() {
    this.dropdownOpen = null;
  }

  handleClickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.dropdownOpen = null;
    }
  }

  toggleActionMenu(client: ClientDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.clients.forEach(
      (c) => (c.actionMenuOpen = c.id === client.id ? !c.actionMenuOpen : false)
    );
  }

  onClientSaved() {
    this.loadData();
    this.modalService.showNotification('Cliente salvo com sucesso!', true);
  }

  filterClients() {
    if (!this.searchTerm.trim()) {
      this.filteredClients = [...this.clients].sort((a, b) => a.name.localeCompare(b.name));
      return;
    }

    const term = this.searchTerm.toLowerCase();
    const termDigitsOnly = this.searchTerm.replace(/\D/g, ''); // Remove tudo que não é dígito

    this.filteredClients = this.clients.filter((client) => {
      // Busca por nome, localização ou tipo
      if (client.name.toLowerCase().includes(term) ||
          client.location.toLowerCase().includes(term) ||
          client.type.toLowerCase().includes(term)) {
        return true;
      }

      // Busca por documento (CPF/CNPJ) - compara apenas números
      if (termDigitsOnly && client.document) {
        const documentDigitsOnly = client.document.replace(/\D/g, '');
        if (documentDigitsOnly.includes(termDigitsOnly)) {
          return true;
        }
      }

      // Também permite busca pelo documento formatado
      if (client.document.toLowerCase().includes(term)) {
        return true;
      }

      return false;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  clearSearch() {
    this.searchTerm = '';
    this.filterClients();
  }

  getClientLogoUrl(clientId: number): string {
    if (!clientId) return '';
    // URL da API para buscar a logo do cliente
    return `${environment.apiUrl}/clients/${clientId}/logo`;
  }
}
