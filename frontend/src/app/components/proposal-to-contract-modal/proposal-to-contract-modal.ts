// src/app/components/proposal-to-contract-modal/proposal-to-contract-modal.ts
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Proposal, ProposalService } from '../../services/proposal';
import { ContractService, CreateContractRequest, ContractServiceItem, ContractInstallment } from '../../services/contract';
import { UserService } from '../../services/user';
import { ModalService } from '../../services/modal.service';
import { UserSelectionModalComponent } from '../user-selection-modal/user-selection-modal';
import { ViewContractConfirmationModalComponent } from '../view-contract-confirmation-modal/view-contract-confirmation-modal.component';
import { Router } from '@angular/router';

interface AssignableUser {
  id: number;
  name: string;
  email: string;
}

interface AssignedUser {
  id: number;
  user: {
    id: number;
    name: string;
    email: string;
  };
  role: 'editor' | 'viewer';
}

interface ContractConversionData {
  start_date: string;
  end_date: string;
  payment_method: string;
  expected_payment_date: string;
  payment_status: 'pago' | 'pendente';
  installment_count: number;
  notes: string;
}

@Component({
  selector: 'app-proposal-to-contract-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, UserSelectionModalComponent, ViewContractConfirmationModalComponent],
  templateUrl: './proposal-to-contract-modal.html',
  styleUrls: ['./proposal-to-contract-modal.css']
})
export class ProposalToContractModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() proposal: Proposal | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() converted = new EventEmitter<any>();

  private contractService = inject(ContractService);
  private proposalService = inject(ProposalService);
  private userService = inject(UserService);
  private modalService = inject(ModalService);
  private router = inject(Router);

  contractData: ContractConversionData = {
    start_date: '',
    end_date: '',
    payment_method: '',
    expected_payment_date: '',
    payment_status: 'pendente',
    installment_count: 1,
    notes: ''
  };

  assignedUsers: AssignedUser[] = [];
  allUsers: AssignableUser[] = [];
  isUserModalOpen = false;
  isLoading = false;
  today = new Date().toISOString().split('T')[0];
  
  paymentMethods = this.contractService.getPaymentMethods();
  contractInstallments: ContractInstallment[] = [];
  firstInstallmentDate: string = '';
  
  // Modal de confirmação para visualizar contrato
  showViewContractModal = false;
  createdContractId: number | null = null;
  createdContractNumber = '';

  ngOnInit() {
    this.loadUsers();
    // Set default start date to today
    this.contractData.start_date = this.today;
  }

  ngOnChanges() {
    if (this.proposal && this.isOpen) {
      console.log('🔧 Modal opened with proposal:', this.proposal);
      this.loadCompleteProposal();
    }
  }

  async loadCompleteProposal() {
    if (!this.proposal?.id) return;
    
    try {
      const response = await firstValueFrom(this.proposalService.getProposal(this.proposal.id));
      
      if (response.success && response.data) {
        
        // Update the proposal with complete data
        this.proposal = response.data;
        
        // Puxar dados de pagamento da proposta para o contrato
        this.initializePaymentDataFromProposal();
        
        // Check all possible service properties
        const proposalAny = this.proposal as any;
        
        // Log the full structure to identify the correct path
        console.log('🔍 Proposal structure after loading complete data:');
        for (const key in proposalAny) {
          if (Array.isArray(proposalAny[key])) {
            console.log(`  - ${key}: Array(${proposalAny[key].length})`, proposalAny[key]);
          }
        }
      } else {
        console.error('❌ Failed to fetch complete proposal:', response);
      }
    } catch (error) {
      console.error('❌ Error fetching complete proposal:', error);
    }
  }

  async loadUsers() {
    try {
      const response = await firstValueFrom(this.userService.getUsers());
      this.allUsers = response.users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
      }));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  formatCurrency(value: number): string {
    return this.contractService.formatValue(value);
  }

  getProposalFinalValue(): number {
    if (!this.proposal) return 0;
    
    // Se for contraproposta, calcular valor apenas dos serviços selecionados
    if (this.proposal.status === 'contraproposta') {
      const selectedServices = this.getProposalServices();
      const totalValue = selectedServices.reduce((sum: number, service: any) => {
        return sum + (service.total_value || 0);
      }, 0);
      
      // Aplicar desconto se houver pagamento à vista
      if (this.proposal.payment_type === 'vista' && this.proposal.discount_applied && this.proposal.discount_applied > 0) {
        return totalValue - this.proposal.discount_applied;
      }
      return totalValue;
    }
    
    // Se há pagamento à vista com final_value definido, usar esse valor
    if (this.proposal.payment_type === 'vista' && this.proposal.final_value && this.proposal.final_value > 0) {
      return this.proposal.final_value;
    }
    
    // Caso contrário, usar o total_value
    return this.proposal.total_value || 0;
  }

  getClientName(): string {
    if (!this.proposal) return '';
    
    // Try client_name first (direct field)
    if (this.proposal.client_name) {
      return this.proposal.client_name;
    }
    
    // Try nested client structure with type safety
    if (this.proposal.client) {
      const client = this.proposal.client as any;
      
      if (client.clients_pf?.full_name) {
        return client.clients_pf.full_name;
      }
      if (client.clients_pj?.company_name) {
        return client.clients_pj.company_name;
      }
      if (client.name) {
        return client.name;
      }
    }
    
    return 'Cliente não identificado';
  }

  getProposalServices(): any[] {
    if (!this.proposal) return [];
    
    const proposalAny = this.proposal as any;
    
    // Array of possible service property names to check
    const possibleServiceProperties = [
      'services',
      'proposal_services', 
      'service_items',
      'items',
      'proposalServices',
      'servicesList',
      'proposal_service_items',
      'contract_services'
    ];
    
    
    for (const property of possibleServiceProperties) {
      if (proposalAny[property] && Array.isArray(proposalAny[property]) && proposalAny[property].length > 0) {
        // Se for contraproposta, filtrar apenas serviços selecionados
        if (this.proposal.status === 'contraproposta') {
          return proposalAny[property].filter((service: any) => service.selected_by_client === true);
        }
        return proposalAny[property];
      }
    }
    
    // If no services found, log all array properties for debugging
    for (const key in proposalAny) {
      if (Array.isArray(proposalAny[key])) {
        console.log(`  - ${key}: Array(${proposalAny[key].length})`, proposalAny[key]);
      }
    }
    
    console.warn('❌ No services found in any expected property');
    return [];
  }

  isPaymentMethodInstallable(method: string): boolean {
    return this.contractService.isPaymentMethodInstallable(method);
  }

  onPaymentMethodChange() {
    if (!this.isPaymentMethodInstallable(this.contractData.payment_method)) {
      this.contractData.installment_count = 1;
      this.contractInstallments = [];
      this.firstInstallmentDate = '';
    }
  }

  onInstallmentCountChange(count: number) {
    this.contractData.installment_count = count;
    if (count > 1 && this.firstInstallmentDate) {
      this.generateInstallments();
    } else {
      this.contractInstallments = [];
    }
  }

  onFirstInstallmentDateChange(date: string) {
    this.firstInstallmentDate = date;
    if (this.contractData.installment_count > 1 && date) {
      this.generateInstallments();
    }
  }

  generateInstallments() {
    if (!this.proposal || this.contractData.installment_count <= 1 || !this.firstInstallmentDate) {
      this.contractInstallments = [];
      return;
    }

    const totalValue = this.proposal.total_value;
    const installmentValue = totalValue / this.contractData.installment_count;
    const firstDate = new Date(this.firstInstallmentDate);

    this.contractInstallments = [];
    for (let i = 0; i < this.contractData.installment_count; i++) {
      const dueDate = new Date(firstDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      this.contractInstallments.push({
        due_date: dueDate.toISOString().split('T')[0],
        amount: installmentValue,
        payment_status: 'pendente',
        notes: null
      });
    }

    // Update expected payment date to last installment
    if (this.contractInstallments.length > 0) {
      const lastInstallment = this.contractInstallments[this.contractInstallments.length - 1];
      this.contractData.expected_payment_date = lastInstallment.due_date;
    }
  }

  openUserModal(): void {
    this.isUserModalOpen = true;
  }
  
  closeUserModal(): void {
    this.isUserModalOpen = false;
  }

  getAssignedUserIds(): number[] {
    return this.assignedUsers.map(u => u.user.id);
  }

  updateAssignedUsers(selectedIds: number[]): void {
    const currentIds = new Set(this.assignedUsers.map(u => u.user.id));
    
    // Add new users
    selectedIds.forEach(id => {
      if (!currentIds.has(id)) {
        const userToAdd = this.allUsers.find(u => u.id === id);
        if (userToAdd) {
          this.assignedUsers.push({
            id: 0,
            user: {
              id: userToAdd.id,
              name: userToAdd.name,
              email: userToAdd.email
            },
            role: 'editor'
          });
        }
      }
    });

    // Remove users not in selection
    this.assignedUsers = this.assignedUsers.filter(u => selectedIds.includes(u.user.id));
    this.closeUserModal();
  }

  removeUser(userToRemove: AssignedUser): void {
    const userIndex = this.assignedUsers.findIndex(u => u.user.id === userToRemove.user.id);
    if (userIndex > -1) {
      this.assignedUsers.splice(userIndex, 1);
    }
  }

  async onSubmit() {
    console.log('📋 Proposal data received:', this.proposal);
    console.log('🔍 Services structure:', this.proposal?.services);
    console.log('🔍 Services length:', this.proposal?.services?.length);
    
    if (!this.proposal) {
      this.modalService.showError('Dados da proposta não encontrados.');
      return;
    }

    if (!this.contractData.start_date) {
      this.modalService.showError('Data de início é obrigatória.');
      return;
    }

    // Check if services exist in any possible structure
    const services = this.proposal.services || [];
    console.log('🔍 Services array:', services);
    
    // More flexible validation - warn but don't block if no services
    if (services.length === 0) {
      console.warn('⚠️ No services found in proposal, but proceeding with conversion');
      // this.modalService.showError('A proposta deve ter pelo menos um serviço para ser convertida.');
      // return;
    }

    if (!this.proposal.client_id) {
      this.modalService.showError('Dados do cliente não encontrados na proposta.');
      return;
    }

    this.isLoading = true;

    try {
      // Try to find services in different possible properties
      const proposalServices = this.getProposalServices();
      console.log('🔄 Converting services:', proposalServices);
      
      if (proposalServices.length === 0) {
        this.modalService.showError('Não foi possível encontrar serviços na proposta. Verifique se a proposta possui serviços configurados.');
        this.isLoading = false;
        return;
      }
      
      // Calcular o valor total correto da proposta (com desconto se aplicável)
      const proposalFinalValue = this.getProposalFinalValue();
      
      const services: ContractServiceItem[] = proposalServices.map(service => {
        const contractService: ContractServiceItem = {
          service_id: service.service_id,
          unit_value: service.unit_value || 0
        };

        // Incluir percentuais de recrutamento se existirem
        if (service.recruitmentPercentages) {
          contractService.recruitmentPercentages = service.recruitmentPercentages;
        }

        return contractService;
      });

      // Prepare user assignments
      const assignedUserIds = this.assignedUsers.map(u => u.user.id);

      // Map proposal type to valid contract type
      const contractType = this.mapProposalTypeToContractType(this.proposal.type);
      
      // Create contract request
      const contractRequest: CreateContractRequest = {
        client_id: this.proposal.client_id,
        type: contractType,
        start_date: this.contractData.start_date,
        end_date: this.contractData.end_date || null,
        services: services,
        total_value: proposalFinalValue, // Usar o valor correto com desconto se aplicável
        notes: this.contractData.notes || null,
        assigned_users: assignedUserIds,
        payment_method: this.contractData.payment_method || null,
        expected_payment_date: this.contractData.expected_payment_date || null,
        payment_status: this.contractData.payment_status,
        installment_count: this.contractData.installment_count,
        installments: this.contractInstallments
      };

      console.log('🚀 Enviando request para criar contrato:', contractRequest);

      // Create the contract
      const contractResponse = await firstValueFrom(
        this.contractService.createContract(contractRequest)
      );

      if (contractResponse.contract?.id) {
        // Apply user permissions if any
        await this.applyUserPermissions(contractResponse.contract.id);

        // Update proposal status to converted
        await this.updateProposalStatus(this.proposal.id, contractResponse.contract.id);

        // Armazenar dados do contrato criado
        this.createdContractId = contractResponse.contract.id;
        this.createdContractNumber = contractResponse.contract.contract_number;

        this.converted.emit({
          contractId: contractResponse.contract.id,
          contractNumber: contractResponse.contract.contract_number
        });

        // Mostrar modal de confirmação para visualizar contrato
        this.showViewContractModal = true;
      } else {
        throw new Error('Contract ID not returned');
      }

    } catch (error: any) {
      console.error('Error converting proposal to contract:', error);
      console.error('Error details:', {
        status: error.status,
        message: error.message,
        error: error.error,
        statusText: error.statusText
      });

      // Request is out of scope here, so we can't log it

      this.modalService.showError(
        error.error?.message || error.error?.error || 'Erro ao converter proposta em contrato. Tente novamente.'
      );
    } finally {
      this.isLoading = false;
    }
  }

  private async applyUserPermissions(contractId: number): Promise<void> {
    for (const assignedUser of this.assignedUsers) {
      try {
        await firstValueFrom(
          this.contractService.updateUserRole(contractId, assignedUser.user.id, assignedUser.role)
        );
      } catch (error) {
        console.error(`Error applying permission for user ${assignedUser.user.name}:`, error);
        // Don't fail the whole conversion for permission errors
      }
    }
  }

  private async updateProposalStatus(proposalId: number, contractId: number): Promise<void> {
    try {
      await firstValueFrom(
        this.proposalService.markAsConverted(proposalId, contractId)
      );
    } catch (error) {
      console.error('Error updating proposal status:', error);
      // Don't fail the whole conversion for status update errors
    }
  }

  private initializePaymentDataFromProposal(): void {
    if (!this.proposal) return;


    // Puxar método de pagamento
    if (this.proposal.payment_method) {
      this.contractData.payment_method = this.proposal.payment_method;
    }

    // Puxar número de parcelas
    if (this.proposal.installments && this.proposal.installments >= 1) {
      this.contractData.installment_count = this.proposal.installments;
    }

    // Se há desconto à vista, atualizar o valor total da proposta
    if (this.proposal.payment_type === 'vista' && this.proposal.discount_applied && this.proposal.discount_applied > 0) {
      
      // Usar o final_value que contém o valor com desconto
      const finalValue = this.getProposalFinalValue();
    }
  }

  onViewContract(): void {
    this.showViewContractModal = false;
    this.close.emit();
    
    if (this.createdContractId) {
      this.router.navigate(['/contracts', this.createdContractId]);
    }
  }

  onCancelViewContract(): void {
    this.showViewContractModal = false;
    this.close.emit();
  }

  /**
   * Remove HTML tags from a string
   */
  stripHtmlTags(html: string): string {
    if (!html) return '';

    // Create a temporary div element and assign the HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Return the text content which automatically strips HTML tags
    return tmp.textContent || tmp.innerText || '';
  }

  /**
   * Maps proposal type to a valid contract type
   * Valid contract types: 'Full', 'Pontual', 'Individual'
   */
  private mapProposalTypeToContractType(proposalType: string): 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção' {
    // Default mapping - adjust as needed based on your business rules
    switch (proposalType?.toLowerCase()) {
      case 'recrutamento & seleção':
      case 'recrutamento e seleção':
      case 'recruitment':
        return 'Recrutamento & Seleção';
      case 'consultoria':
      case 'consulting':
        return 'Pontual';
      case 'full':
        return 'Full';
      case 'pontual':
        return 'Pontual';
      case 'individual':
        return 'Individual';
      default:
        console.warn('⚠️ Tipo de proposta não reconhecido:', proposalType, '- usando Individual como padrão');
        return 'Individual';
    }
  }
}