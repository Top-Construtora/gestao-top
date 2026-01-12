import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProposalService, Proposal } from '../../services/proposal';
import { ClientService } from '../../services/client';
import { ModalService } from '../../services/modal.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-duplicate-proposal-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './duplicate-proposal-modal.html',
  styleUrls: ['./duplicate-proposal-modal.css']
})
export class DuplicateProposalModalComponent implements OnInit {
  @Input() proposal: Proposal | null = null;
  @Input() show: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() proposalDuplicated = new EventEmitter<any>();

  private proposalService = inject(ProposalService);
  private clientService = inject(ClientService);
  private modalService = inject(ModalService);

  // Dados da nova proposta
  duplicateData = {
    client_id: null as number | null,
    type: '',
    end_date: '',
    max_installments: 12,
    vista_discount_percentage: 6,
    prazo_discount_percentage: 0,
    solicitante_name: '',
    solicitante_email: '',
    solicitante_phone: '',
    duplicate_services: true, // Por padrão, duplica os serviços
    duplicate_terms: true, // Por padrão, duplica os termos
    duplicate_recruitment_percentages: true // Por padrão, duplica as porcentagens de recrutamento
  };

  clients: any[] = [];
  isLoading = false;
  isDuplicating = false;
  today = new Date().toISOString().split('T')[0];

  proposalTypes = [
    { value: 'Full', label: 'Full' },
    { value: 'Pontual', label: 'Pontual' },
    { value: 'Individual', label: 'Individual' },
    { value: 'Recrutamento & Seleção', label: 'Recrutamento & Seleção' }
  ];

  ngOnInit() {
    if (this.show) {
      this.loadClients();
      this.initializeDuplicateData();
    }
  }

  ngOnChanges() {
    if (this.show) {
      this.loadClients();
      this.initializeDuplicateData();
    }
  }

  private initializeDuplicateData() {
    if (this.proposal) {
      // Pré-preencher com dados da proposta original
      this.duplicateData.client_id = this.proposal.client_id || this.proposal.client?.id || null;
      this.duplicateData.type = this.proposal.type || 'Full';

      // Definir data de validade para 30 dias a partir de hoje
      const today = new Date();
      const endDate = new Date(today.setDate(today.getDate() + 30));
      this.duplicateData.end_date = endDate.toISOString().split('T')[0];

      // Copiar informações do solicitante se existirem
      this.duplicateData.solicitante_name = this.proposal.solicitante_name || '';
      this.duplicateData.solicitante_email = this.proposal.solicitante_email || '';
      this.duplicateData.solicitante_phone = this.proposal.solicitante_phone || '';

      // Copiar descontos
      this.duplicateData.max_installments = this.proposal.max_installments || 12;
      this.duplicateData.vista_discount_percentage = this.proposal.vista_discount_percentage || 6;
      this.duplicateData.prazo_discount_percentage = this.proposal.prazo_discount_percentage || 0;
    }
  }

  async loadClients() {
    this.isLoading = true;
    try {
      const response = await firstValueFrom(this.clientService.getClients({ is_active: true }));
      if (response?.clients) {
        this.clients = response.clients.sort((a: any, b: any) => {
          const nameA = this.getClientDisplayName(a).toLowerCase();
          const nameB = this.getClientDisplayName(b).toLowerCase();
          return nameA.localeCompare(nameB);
        });
      }
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      this.modalService.showError('Erro ao carregar lista de clientes');
    } finally {
      this.isLoading = false;
    }
  }

  getClientDisplayName(client: any): string {
    if (!client) return '';

    if (client.type === 'PJ' && client.company) {
      return client.company.trade_name || client.company.company_name || '';
    }

    if (client.type === 'PF' && client.person) {
      return client.person.full_name || '';
    }

    return client.name || '';
  }

  closeModal() {
    this.close.emit();
    this.resetForm();
  }

  private resetForm() {
    this.duplicateData = {
      client_id: null,
      type: '',
      end_date: '',
      max_installments: 12,
      vista_discount_percentage: 6,
      prazo_discount_percentage: 0,
      solicitante_name: '',
      solicitante_email: '',
      solicitante_phone: '',
      duplicate_services: true,
      duplicate_terms: true,
      duplicate_recruitment_percentages: true
    };
  }

  async duplicateProposal() {
    if (!this.proposal) {
      this.modalService.showError('Nenhuma proposta selecionada para duplicar');
      return;
    }

    // Validar campos obrigatórios
    if (!this.duplicateData.client_id) {
      this.modalService.showError('Por favor, selecione um cliente');
      return;
    }

    if (!this.duplicateData.type) {
      this.modalService.showError('Por favor, selecione o tipo da proposta');
      return;
    }

    if (!this.duplicateData.end_date) {
      this.modalService.showError('Por favor, informe a data de validade');
      return;
    }

    this.isDuplicating = true;

    try {
      // Preparar dados para duplicação - sem incluir original_proposal_id
      const duplicatePayload = {
        ...this.duplicateData
      };

      const response = await firstValueFrom(
        this.proposalService.duplicateProposal(this.proposal.id, duplicatePayload)
      );

      if (response && response.success) {
        this.modalService.showSuccess('Proposta duplicada com sucesso!');
        this.proposalDuplicated.emit(response.data);
        this.closeModal();
      } else {
        this.modalService.showError(response?.message || 'Erro ao duplicar proposta');
      }
    } catch (error: any) {
      console.error('Erro ao duplicar proposta:', error);

      if (error?.status === 500 || error?.status === 404) {
        this.modalService.showError('Funcionalidade de duplicar propostas ainda não implementada no backend.');
      } else {
        this.modalService.showError(error?.error?.message || 'Erro ao duplicar proposta');
      }
    } finally {
      this.isDuplicating = false;
    }
  }

  // Métodos auxiliares para o template
  isFormValid(): boolean {
    return !!(
      this.duplicateData.client_id &&
      this.duplicateData.type &&
      this.duplicateData.end_date
    );
  }

  getProposalSummary(): string {
    if (!this.proposal) return '';

    const client = this.proposal.client;
    let clientName = 'Cliente não identificado';

    if (client) {
      if (client.type === 'PJ' && client.company) {
        clientName = client.company.trade_name || client.company.company_name || '';
      } else if (client.type === 'PF' && client.person) {
        clientName = (client.person as any).full_name || client.person.name || '';
      }
    }

    return `${this.proposal.proposal_number} - ${clientName}`;
  }

  formatCurrency(value: number | null | undefined): string {
    if (typeof value !== 'number' || value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value);
  }
}