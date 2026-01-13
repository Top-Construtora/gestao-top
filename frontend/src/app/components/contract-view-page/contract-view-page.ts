import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { ContractService, ApiContract } from '../../services/contract';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { ContractExportModalComponent } from '../contract-export-modal/contract-export-modal.component';
import { DeleteConfirmationModalComponent } from '../delete-confirmation-modal/delete-confirmation-modal.component';
import { ModalService } from '../../services/modal.service';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-contract-view-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BreadcrumbComponent, ContractExportModalComponent, DeleteConfirmationModalComponent],
  templateUrl: './contract-view-page.html',
  styleUrls: ['./contract-view-page.css']
})
export class ContractViewPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private contractService = inject(ContractService);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private modalService = inject(ModalService);
  private subscriptions = new Subscription();
  contract: ApiContract | null = null;
  contractId: number = 0;
  isLoading = true;
  error = '';
  canEdit = false;
  currentUserId: number;
  isAdmin = false;
  canViewFinancialInfo = false; // Admin Gerencial não pode ver valores
  showExportModal = false;
  showDeleteModal = false;
  isDeleting = false;
  expandedServices: { [key: number]: boolean } = {};

  constructor() {
    // Recuperar informações do usuário do localStorage
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        this.currentUserId = user.id || 0;
        this.isAdmin = user.role === 'admin';
        // Admin Gerencial não pode ver valores financeiros
        this.canViewFinancialInfo = user.role === 'admin';
      } catch (error) {
        this.currentUserId = 0;
        this.isAdmin = false;
        this.canViewFinancialInfo = false;
      }
    } else {
      this.currentUserId = 0;
      this.isAdmin = false;
      this.canViewFinancialInfo = false;
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (!id) {
      this.error = 'ID do contrato não fornecido';
      this.isLoading = false;
      return;
    }

    this.contractId = parseInt(id, 10);
    this.loadContract();
  }

  async loadContract() {
    this.isLoading = true;
    this.error = '';
    
    try {
      const response = await firstValueFrom(this.contractService.getContract(this.contractId));
      
      if (response && response.contract) {
        this.contract = response.contract;
        console.log('🔍 Contract data received:', this.contract);
        
        // Garantir que contract_services seja um array
        if (!this.contract.contract_services) {
          this.contract.contract_services = [];
        }
        
        // Garantir que assigned_users seja um array
        if (!this.contract.assigned_users) {
          this.contract.assigned_users = [];
        }
        
        this.checkEditPermissions();
      } else {
        this.error = 'Contrato não encontrado';
      }
    } catch (error: any) {
      console.error('❌ Error loading contract:', error);
      
      if (error?.status === 404) {
        this.error = 'Contrato não encontrado';
      } else if (error?.status === 500) {
        this.error = 'Erro interno do servidor';
      } else {
        this.error = 'Erro ao carregar contrato';
      }
    } finally {
      this.isLoading = false;
    }
  }

  checkEditPermissions() {
    if (!this.contract) return;

    if (this.isAdmin) {
      this.canEdit = true;
      return;
    }

    // Verificar se o usuário tem role de owner ou editor
    const userAssignment = (this.contract as any).assigned_users?.find(
      (assignment: any) => assignment.user.id === this.currentUserId
    );

    this.canEdit = userAssignment && ['owner', 'editor'].includes(userAssignment.role || '');
  }


  formatDate(date: string | null): string {
    return this.contractService.formatDate(date);
  }

  // Verificar se um serviço foi adicionado após a criação do contrato (aditivo)
  isAdditiveService(service: any): boolean {
    // Usar o campo is_addendum do banco de dados
    return service?.is_addendum === true;
  }

  // Formatar data de quando o serviço foi adicionado
  getServiceAddedDate(service: any): string {
    // Usar addendum_date se disponível, senão usar created_at
    const dateToUse = service.addendum_date || service.created_at;
    if (!dateToUse) return '';
    return new Date(dateToUse).toLocaleDateString('pt-BR');
  }

  getStatusColor(status: string): string {
    return this.contractService.getStatusColor(status);
  }

  getStatusText(status: string): string {
    return this.contractService.getStatusText(status);
  }

  getTypeIcon(type: string): string {
    return this.contractService.getTypeIcon(type);
  }


  editContract() {
    if (this.contract) {
      this.router.navigate(['/home/contratos/editar', this.contract.id]);
    }
  }

  getClientName(): string {
    if (!this.contract?.client) {
      return 'Cliente não informado';
    }
    
    const client = this.contract.client as any;
    
    // Check if client has a name property (from backend transformation)
    if (client.name) {
      return client.name;
    }

    // Para PJ (Pessoa Juridica)
    if (client.clients_pj && client.clients_pj.length > 0) {
      const pjName = client.clients_pj[0].company_name || client.clients_pj[0].trade_name || 'Empresa nao informada';
      return pjName;
    }

    return 'Cliente nao identificado';
  }

  getClientEmail(): string {
    if (!this.contract?.client) {
      return 'E-mail não informado';
    }
    
    const client = this.contract.client as any;
    return client.email || 'E-mail não informado';
  }

  getClientPhone(): string {
    if (!this.contract?.client) {
      return 'Telefone não informado';
    }
    
    const client = this.contract.client as any;
    return client.phone || 'Telefone não informado';
  }

  getContractDuration(): string {
    if (!this.contract?.start_date || !this.contract?.end_date) return '-';
    
    const start = new Date(this.contract.start_date);
    const end = new Date(this.contract.end_date);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} dias`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'mês' : 'meses'}`;
    } else {
      const years = Math.floor(diffDays / 365);
      const remainingMonths = Math.floor((diffDays % 365) / 30);
      if (remainingMonths > 0) {
        return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remainingMonths} ${remainingMonths === 1 ? 'mês' : 'meses'}`;
      }
      return `${years} ${years === 1 ? 'ano' : 'anos'}`;
    }
  }

  getRoleText(role: string): string {
    const roleMap: { [key: string]: string } = {
      'owner': 'Proprietário',
      'editor': 'Editor',
      'viewer': 'Visualizador'
    };
    return roleMap[role] || role;
  }
  
  // Métodos para cálculos de permuta
  getBarterAmount(): number {
    if (!this.contract || this.contract.payment_method !== 'Permuta') return 0;
    
    if (this.contract.barter_type === 'percentage' && this.contract.barter_percentage) {
      return (this.contract.total_value * this.contract.barter_percentage) / 100;
    } else if (this.contract.barter_type === 'value' && this.contract.barter_value) {
      return Math.min(this.contract.barter_value, this.contract.total_value);
    }
    
    return 0;
  }
  
  getRemainingValue(): number {
    if (!this.contract) return 0;
    
    if (this.contract.payment_method === 'Permuta') {
      const barterAmount = this.getBarterAmount();
      return Math.max(0, this.contract.total_value - barterAmount);
    }
    
    return this.contract.total_value;
  }
  
  getInstallmentValue(): number {
    if (!this.contract || !this.contract.installment_count || this.contract.installment_count <= 1) {
      return 0;
    }
    
    // Se tem permuta, calcular parcela do valor restante
    if (this.contract.payment_method === 'Permuta') {
      return this.getRemainingValue() / this.contract.installment_count;
    }
    
    // Senão, calcular parcela do valor total
    return this.contract.total_value / this.contract.installment_count;
  }

  getStatusIcon(status: string): string {
    const iconMap: { [key: string]: string } = {
      'active': 'fas fa-play-circle',
      'completed': 'fas fa-check-circle',
      'cancelled': 'fas fa-times-circle', 
      'suspended': 'fas fa-pause-circle'
    };
    return iconMap[status] || 'fas fa-circle';
  }

  backToContracts() {
    this.router.navigate(['/home/contratos']);
  }

  deleteContract() {
    if (!this.contract) return;
    this.showDeleteModal = true;
  }

  async confirmDeleteContract() {
    if (!this.contract) return;

    this.isDeleting = true;
    try {
      await firstValueFrom(this.contractService.deleteContractPermanent(this.contractId));
      this.modalService.showSuccess('Contrato excluído com sucesso!');
      this.router.navigate(['/home/contratos']);
    } catch (error: any) {
      console.error('❌ Error deleting contract:', error);
      this.modalService.showError('Não foi possível excluir o contrato.');
    } finally {
      this.isDeleting = false;
      this.showDeleteModal = false;
    }
  }

  cancelDeleteContract() {
    this.showDeleteModal = false;
  }

  async generatePDF() {
    if (!this.contract) {
      this.modalService.showError('Nenhum contrato carregado para gerar PDF.');
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Configurações básicas
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 25;
      let currentY = margin;

      // === CABEÇALHO PRINCIPAL ===
      doc.setFillColor(0, 59, 43);
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('CONTRATO DE SERVIÇOS', margin, 22);
      
      currentY = 50;
      doc.setTextColor(0, 0, 0);

      // === INFO BOX ===
      doc.setFillColor(248, 249, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 25, 3, 3, 'FD');
      
      currentY += 8;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Contrato: ${this.contract.contract_number}`, margin + 8, currentY);
      
      currentY += 7;
      doc.setFont('helvetica', 'normal');
      doc.text(`Data de geração: ${new Date().toLocaleDateString('pt-BR')}`, margin + 8, currentY);
      
      currentY += 7;
      doc.setTextColor(0, 59, 43);
      doc.setFont('helvetica', 'bold');
      doc.text(`STATUS: ${this.getStatusText(this.contract.status).toUpperCase()}`, margin + 8, currentY);
      doc.setTextColor(0, 0, 0);

      currentY += 25;

      // === DADOS DO CLIENTE ===
      this.addSectionHeader(doc, 'DADOS DO CLIENTE', currentY, margin, pageWidth);
      currentY += 15;

      const clientName = this.getClientName();
      if (clientName) {
        this.addInfoRow(doc, 'Cliente:', clientName, currentY, margin);
        currentY += 10;
      }

      // === DADOS DO CONTRATO ===
      currentY += 10;
      this.addSectionHeader(doc, 'DADOS DO CONTRATO', currentY, margin, pageWidth);
      currentY += 15;

      this.addInfoRow(doc, 'Tipo:', this.contract.type, currentY, margin);
      currentY += 10;
      
      this.addInfoRow(doc, 'Data de Início:', this.formatDate(this.contract.start_date), currentY, margin);
      currentY += 10;
      
      if (this.contract.end_date) {
        this.addInfoRow(doc, 'Data de Término:', this.formatDate(this.contract.end_date), currentY, margin);
        currentY += 10;
      }

      // === SERVIÇOS ===
      if (this.contract.contract_services && this.contract.contract_services.length > 0) {
        currentY += 10;
        this.addSectionHeader(doc, 'SERVIÇOS DO CONTRATO', currentY, margin, pageWidth);
        currentY += 15;

        this.contract.contract_services.forEach((contractService, index) => {
          const serviceHeight = 25;

          if (currentY + serviceHeight > pageHeight - 40) {
            doc.addPage();
            currentY = margin + 20;
          }

          // Box para cada serviço
          doc.setFillColor(252, 253, 254);
          doc.setDrawColor(229, 231, 235);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), serviceHeight, 2, 2, 'FD');

          // Nome do serviço
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 59, 43);
          doc.text(`${index + 1}. ${contractService.service.name}`, margin + 5, currentY + 8);
          
          // Categoria e valor
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.text(`Categoria: ${contractService.service.category}`, margin + 5, currentY + 15);
          
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 59, 43);
          doc.setFontSize(10);
          doc.text(`Valor: ${this.formatCurrency(contractService.total_value)}`, margin + 5, currentY + 22);
          
          currentY += serviceHeight + 8;
          doc.setTextColor(0, 0, 0);
        });
      }

      // === VALOR TOTAL ===
      currentY += 10;
      
      doc.setFillColor(0, 59, 43);
      doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 20, 5, 5, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      // Mostrar breakdown de valores se há serviços cancelados
      if (this.hasCancelledServices()) {
        doc.text(`VALOR ORIGINAL: ${this.formatCurrency(this.contract.total_value)}`, margin + 10, currentY + 8);
        doc.text(`SERVIÇOS CANCELADOS: -${this.formatCurrency(this.getCancelledServicesValue())}`, margin + 10, currentY + 13);
        doc.text(`VALOR ATUAL: ${this.formatCurrency(this.getAdjustedTotalValue())}`, margin + 10, currentY + 18);
      } else {
        doc.text(`VALOR TOTAL: ${this.formatCurrency(this.contract.total_value)}`, margin + 10, currentY + 13);
      }

      // === RODAPÉ ===
      currentY = pageHeight - 20;
      doc.setTextColor(128, 128, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('TOP Construtora - Documento gerado automaticamente', margin, currentY);
      doc.text(`Página 1 de ${doc.getNumberOfPages()}`, pageWidth - margin - 20, currentY);
      
      // Salvar o PDF
      const fileName = `contrato-${this.contract.contract_number.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      doc.save(fileName);
      
      this.modalService.showSuccess('PDF gerado com sucesso!');

    } catch (error: any) {
      console.error('❌ Error generating PDF:', error);
      this.modalService.showError('Erro ao gerar o PDF do contrato.');
    }
  }

  private addSectionHeader(doc: any, title: string, y: number, margin: number, pageWidth: number): void {
    doc.setFillColor(240, 242, 245);
    doc.rect(margin, y - 3, pageWidth - (margin * 2), 12, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 59, 43);
    doc.text(title, margin + 5, y + 5);
    
    doc.setTextColor(0, 0, 0);
  }

  private addInfoRow(doc: any, label: string, value: string, y: number, margin: number): void {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin + 5, y);
    
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 35, y);
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  // Calcular valor total considerando serviços cancelados
  getAdjustedTotalValue(): number {
    if (!this.contract?.contract_services) return this.contract?.total_value || 0;
    
    let totalValue = this.contract.total_value || 0;
    let cancelledValue = 0;
    
    this.contract.contract_services.forEach(service => {
      const serviceStatus = this.getServiceStatus(service);
      if (serviceStatus === 'cancelled') {
        cancelledValue += service.total_value || 0;
      }
    });
    
    return Math.max(0, totalValue - cancelledValue);
  }

  // Calcular valor total dos serviços cancelados
  getCancelledServicesValue(): number {
    if (!this.contract?.contract_services) return 0;
    
    let cancelledValue = 0;
    
    this.contract.contract_services.forEach(service => {
      const serviceStatus = this.getServiceStatus(service);
      if (serviceStatus === 'cancelled') {
        cancelledValue += service.total_value || 0;
      }
    });
    
    return cancelledValue;
  }

  // Verificar se há serviços cancelados
  hasCancelledServices(): boolean {
    return this.getCancelledServicesValue() > 0;
  }

  // Obter status do serviço (considerando rotinas se existirem)
  getServiceStatus(service: any): string {
    // Se há dados de rotina, usar o status da rotina
    if (service.service_routines && service.service_routines.length > 0) {
      return service.service_routines[0].status || 'not_started';
    }
    // Caso contrário, usar o status do serviço do contrato
    return service.status || 'not_started';
  }

  canEditContract(): boolean {
    return this.canEdit;
  }

  canDeleteContract(): boolean {
    return this.canEdit;
  }

  onServiceUpdated() {
    // Recarregar o contrato quando um serviço for atualizado
    console.log('🔄 Service updated, reloading contract...');
    if (this.contract && this.contract.id) {
      this.contractId = this.contract.id;
      this.loadContract();
    } else {
      console.error('❌ Cannot reload: no contract or contract ID');
    }
  }

  getNonInternalServices() {
    if (!this.contract?.contract_services) {
      return [];
    }
    return this.contract.contract_services.filter(service => 
      service.service?.category !== 'Interno'
    );
  }

  openExportModal() {
    this.showExportModal = true;
  }

  closeExportModal() {
    this.showExportModal = false;
  }

  toggleServiceDetails(serviceId: number) {
    this.expandedServices[serviceId] = !this.expandedServices[serviceId];
  }

  isServiceExpanded(serviceId: number): boolean {
    return this.expandedServices[serviceId] || false;
  }

  hasServiceDetails(service: any): boolean {
    return !!(service.service?.subtitle || service.service?.summary || service.service?.description);
  }
}