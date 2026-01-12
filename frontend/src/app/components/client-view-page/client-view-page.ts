import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { ClientAttachmentsComponent } from '../client-attachments/client-attachments.component';
import { ClientService, ApiClient, ClientEmail } from '../../services/client';
import { ContractService, ApiContract } from '../../services/contract';
import { ClientAttachmentService } from '../../services/client-attachment.service';
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { environment } from '../../../environments/environment';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-client-view-page',
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent, ClientAttachmentsComponent],
  templateUrl: './client-view-page.html',
  styleUrls: ['./client-view-page.css']
})
export class ClientViewPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientService = inject(ClientService);
  private contractService = inject(ContractService);
  private clientAttachmentService = inject(ClientAttachmentService);
  private breadcrumbService = inject(BreadcrumbService);
  private sanitizer = inject(DomSanitizer);
  public authService = inject(AuthService);
  
  private subscriptions = new Subscription();

  client: ApiClient | null = null;
  logoUrl: SafeUrl | null = null;
  contracts: ApiContract[] = [];
  clientEmails: ClientEmail[] = [];
  isLoading = true;
  error = '';


  // Tab system
  activeTab: 'contracts' | 'attachments' = 'contracts';
  attachmentsCount = 0;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadClient(parseInt(id, 10));
    } else {
      this.error = 'ID do cliente não fornecido';
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    if (this.logoUrl) {
      URL.revokeObjectURL(this.logoUrl.toString());
    }
    this.subscriptions.unsubscribe();
  }

  async loadClient(id: number) {
    this.isLoading = true;
    this.error = '';
    
    try {
      // Load client details
      const clientResponse = await firstValueFrom(this.clientService.getClient(id));
      this.client = clientResponse.client;

      if (this.client.logo_path) {
        this.loadLogo();
      }

      // Update breadcrumb with client name
      this.updateBreadcrumb();

      // Load client contracts
      const contractsResponse = await firstValueFrom(this.contractService.getContracts());
      this.contracts = contractsResponse.contracts.filter(contract => contract.client.id === id);
      
      // Load emails if PJ
      if (this.client.type === 'PJ') {
        await this.loadClientEmails(id);
      }
      
      // Load attachments count
      await this.loadAttachmentsCount(id);
      
      // Calculate statistics
      this.calculateStatistics();
      
    } catch (err: any) {
      console.error('❌ Error loading client:', err);
      if (err.status === 404) {
        this.error = 'Cliente não encontrado';
      } else {
        this.error = 'Erro ao carregar dados do cliente';
      }
    } finally {
      this.isLoading = false;
    }
  }

  loadLogo() {
    if (!this.client) return;
    this.clientService.getClientLogo(this.client.id).subscribe(blob => {
      const objectURL = URL.createObjectURL(blob);
      this.logoUrl = this.sanitizer.bypassSecurityTrustUrl(objectURL);
    });
  }

  private calculateStatistics() {
    // Method kept for potential future statistics
  }

  private updateBreadcrumb(): void {
    if (this.client) {
      const clientName = this.getClientName();
      this.breadcrumbService.setBreadcrumbs([
        { label: 'Home', url: '/home/dashboard', icon: 'fas fa-home' },
        { label: 'Clientes', url: '/home/clients', icon: 'fas fa-users' },
        { label: clientName, icon: 'fas fa-user' }
      ]);
    }
  }

  getClientName(): string {
    if (!this.client) return '';
    return this.client.type === 'PJ' 
      ? (this.client.trade_name || this.client.company_name || 'Nome não informado')
      : (this.client.full_name || 'Nome não informado');
  }

  getClientDocument(): string {
    if (!this.client) return '';
    return this.clientService.getFormattedDocument(this.client);
  }

  getClientLogoUrl(): string {
    if (!this.client || !this.client.id) return '';
    // URL da API para buscar a logo do cliente
    return `${environment.apiUrl}/clients/${this.client.id}/logo`;
  }

  getAddress(): string {
    if (!this.client) return '';
    const parts = [
      this.client.street,
      this.client.number,
      this.client.complement,
      this.client.neighborhood,
      `${this.client.city}/${this.client.state}`,
      this.client.zipcode
    ].filter(part => part && part.trim() !== '');
    
    return parts.join(', ');
  }

  formatValue(value: number): string {
    return this.contractService.formatValue(value);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  }

  getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'active': 'Ativo',
      'completed': 'Concluído',
      'cancelled': 'Cancelado',
      'suspended': 'Suspenso'
    };
    return statusMap[status] || status;
  }

  getTypeText(type: string): string {
    const typeMap: { [key: string]: string } = {
      'Full': 'Completo',
      'Pontual': 'Pontual',
      'Individual': 'Individual',
      'Recrutamento & Seleção': 'Recrutamento & Seleção'
    };
    return typeMap[type] || type;
  }

  editClient() {
    if (this.client) {
      this.router.navigate(['/home/clientes/editar', this.client.id]);
    }
  }

  viewContract(contractId: number) {
    this.router.navigate(['/home/contratos/visualizar', contractId]);
  }

  getInitials(name: string): string {
    const words = name.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) return 'NN';
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  generateGradient(name: string): string {
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

  // Tab methods
  setActiveTab(tab: 'contracts' | 'attachments'): void {
    this.activeTab = tab;
  }

  isTabActive(tab: 'contracts' | 'attachments'): boolean {
    return this.activeTab === tab;
  }

  private async loadAttachmentsCount(clientId: number): Promise<void> {
    try {
      const response = await firstValueFrom(this.clientAttachmentService.getClientAttachments(clientId));
      this.attachmentsCount = response.attachments?.length || 0;
    } catch (error) {
      console.warn('Erro ao carregar contagem de anexos:', error);
      this.attachmentsCount = 0;
    }
  }

  private async loadClientEmails(clientId: number): Promise<void> {
    try {
      const response = await firstValueFrom(this.clientService.getClientEmails(clientId));
      if (response.success && response.emails) {
        this.clientEmails = response.emails;
      } else {
        this.clientEmails = [];
      }
    } catch (error) {
      console.warn('Erro ao carregar emails do cliente:', error);
      // Fallback para o email principal se houver erro
      if (this.client?.email) {
        this.clientEmails = [{
          id: 0,
          email: this.client.email,
          is_primary: true
        }];
      } else {
        this.clientEmails = [];
      }
    }
  }

  trackByEmailId(index: number, email: ClientEmail): number {
    return email.id;
  }
}