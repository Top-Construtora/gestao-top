import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProposalServiceItem {
  id?: number;
  proposal_id?: number;
  service_id: number; // Added service_id
  service_name?: string;
  service_description?: string;
  unit_value: number;
  total_value: number;
  selected_by_client?: boolean;
  client_notes?: string;
  created_at?: string;
  recruitmentPercentages?: {
    administrativo_gestao: number;
    comercial: number;
    operacional: number;
    estagio_jovem: number;
  };
  service?: {
    id: number;
    name: string;
    duration_amount?: number;
    duration_unit?: string;
    category?: string;
    description?: string;
    subtitle?: string;
    summary?: string;
  };
}

export interface Proposal {
  id: number;
  proposal_number: string;
  client_id: number;
  client_type?: 'pf' | 'pj' | '';
  type: 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção';
  client_name: string;
  client_document: string;
  client_email: string;
  client_phone?: string;
  client_street: string;
  client_number: string;
  client_complement?: string;
  client_neighborhood: string;
  client_city: string;
  client_zipcode: string;
  solicitante_name?: string;
  solicitante_email?: string;
  solicitante_phone?: string;
  source?: string; // Fonte da proposta: Indicação, Site, Já era cliente, Redes sociais, etc.
  end_date?: string; // Corresponds to 'end_date' in DB, previously 'valid_until'
  validity_days?: number;
  total_value: number;
  valor_global?: number; // Valor global fixo da proposta
  usar_valor_global?: boolean; // Se true, usa valor_global. Se false, usa soma dos serviços
  unique_link?: string; // Corresponds to 'unique_link' in DB, previously 'public_token'
  signature_data?: string;
  client_ip?: string;
  signer_name?: string;
  signer_email?: string;
  signer_phone?: string;
  signer_document?: string;
  signer_observations?: string;
  status: 'draft' | 'sent' | 'signed' | 'rejected' | 'expired' | 'converted' | 'contraproposta'; // contraproposta = Assinada Parcialmente
  converted_to_contract_id?: number;
  converted_at?: string;
  notes?: string;
  max_installments?: number;
  vista_discount_percentage?: number;
  prazo_discount_percentage?: number;
  vista_discount_value?: number;
  prazo_discount_value?: number;
  payment_type?: 'vista' | 'prazo';
  payment_method?: string;
  installments?: number;
  final_value?: number;
  discount_applied?: number;
  created_at: string;
  updated_at: string;
  created_by: number;
  updated_by?: number;
  client?: {
    id: number;
    name: string;
    headquarters?: string;
    market_sector?: string;
    description?: string;
    type?: 'PF' | 'PJ';
    company?: {
      trade_name?: string;
      company_name?: string;
    };
    person?: {
      name?: string;
      document?: string;
    };
  };
  services: ProposalServiceItem[];
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
}

export interface CreateProposalData {
  client_id: number;
  type: 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção';
  client_name: string;
  client_document: string;
  client_email: string;
  client_phone?: string;
  client_street: string;
  client_number: string;
  client_complement?: string;
  client_neighborhood: string;
  client_city: string;
  client_state: string;
  client_zipcode: string;
  solicitante_name?: string;
  solicitante_email?: string;
  solicitante_phone?: string;
  source?: string; // Fonte da proposta: Indicação, Site, Já era cliente, Redes sociais, etc.
  end_date?: string;
  validity_days?: number;
  max_installments?: number;
  vista_discount_percentage?: number;
  prazo_discount_percentage?: number;
  vista_discount_value?: number;
  prazo_discount_value?: number;
  valor_global?: number; // Valor global fixo da proposta
  usar_valor_global?: boolean; // Se true, usa valor_global. Se false, usa soma dos serviços
  services: {
    service_id: number;
    unit_value: number;
    total_value?: number; // Optional since backend calculates it
  }[];
}

export interface ProposalFilters {
  status?: string;
  client_id?: number;
  search?: string;
  expired_only?: boolean;
}

export interface ProposalStats {
  total: number;
  byStatus: {
    draft: number;
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
  };
  totalValue: number;
  acceptedValue: number;
  expired: number;
  conversionRate: string;
}

export interface PrepareProposalData {
  // No longer needed as client data is part of Proposal itself
}

export interface SendProposalData {
  email: string;
  subject?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProposalService {
  private apiUrl = `${environment.apiUrl}/proposals`;
  private proposalsSubject = new BehaviorSubject<Proposal[]>([]);
  public proposals$ = this.proposalsSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Buscar todas as propostas
   */
  getProposals(filters?: ProposalFilters): Observable<any> {
    let params = new HttpParams();
    
    if (filters) {
      if (filters.status) {
        params = params.set('status', filters.status);
      }
      if (filters.client_id) {
        params = params.set('client_id', filters.client_id.toString());
      }
      if (filters.search) {
        params = params.set('search', filters.search);
      }
      if (filters.expired_only) {
        params = params.set('expired_only', filters.expired_only.toString());
      }
    }

    return this.http.get<any>(this.apiUrl, { params });
  }

  /**
   * Buscar proposta por ID
   */
  getProposal(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  /**
   * Criar nova proposta
   */
  createProposal(proposalData: CreateProposalData): Observable<any> {
    return this.http.post<any>(this.apiUrl, proposalData);
  }

  /**
   * Atualizar proposta
   */
  updateProposal(id: number, proposalData: Partial<CreateProposalData>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, proposalData);
  }

  /**
   * Alterar status da proposta
   */
  updateProposalStatus(id: number, status: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/status`, { status });
  }

  /**
   * Duplicar proposta
   */
  duplicateProposal(id: number, duplicateData?: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${id}/duplicate`, duplicateData || {});
  }

  /**
   * Excluir proposta
   */
  deleteProposal(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  /**
   * Buscar estatísticas das propostas
   */
  getProposalStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  

  /**
   * Gerar PDF da proposta
   */
  generateProposalPDF(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/pdf`, {
      responseType: 'blob'
    });
  }

  /**
   * Converter proposta em contrato
   */
  convertToContract(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/convert-to-contract`, {});
  }

  /**
   * Marcar proposta como convertida
   */
  markAsConverted(id: number, contractId: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/mark-converted`, { 
      converted_to_contract_id: contractId,
      status: 'converted'
    });
  }

  /**
   * Atualizar lista local de propostas
   */
  refreshProposals(filters?: ProposalFilters): void {
    this.getProposals(filters).subscribe({
      next: (response) => {
        if (response.success) {
          this.proposalsSubject.next(response.data);
        }
      },
      error: (error) => {
        console.error('Erro ao carregar propostas:', error);
      }
    });
  }

  /**
   * Obter lista atual de propostas
   */
  getCurrentProposals(): Proposal[] {
    return this.proposalsSubject.value;
  }

  /**
   * Formatar valor monetário
   */
  formatCurrency(value: number | null | undefined): string {
    if (typeof value !== 'number' || value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value); // Valor já está em reais
  }

  /**
   * Calcular valor total dos serviços
   */
  calculateServicesTotal(services: ProposalServiceItem[]): number {
    return services.reduce((total, service) => {
      return total + (service.total_value || 0);
    }, 0);
  }

  /**
   * Validar dados da proposta
   */
  validateProposalData(proposalData: CreateProposalData): string[] {
    const errors: string[] = [];

    if (!proposalData.client_id) {
      errors.push('Empresa é obrigatória');
    }

    if (!proposalData.client_name || proposalData.client_name.trim().length < 3) {
      errors.push('Nome do cliente deve ter pelo menos 3 caracteres');
    }

    if (!proposalData.client_document || proposalData.client_document.trim().length < 5) {
      errors.push('Documento do cliente é obrigatório e deve ter pelo menos 5 caracteres');
    }

    if (!proposalData.client_email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(proposalData.client_email)) {
      errors.push('Email do cliente inválido');
    }

    if (!proposalData.client_street || proposalData.client_street.trim().length < 3) {
      errors.push('Rua do cliente é obrigatória');
    }

    if (!proposalData.client_number || proposalData.client_number.trim().length < 1) {
      errors.push('Número do cliente é obrigatório');
    }

    if (!proposalData.client_neighborhood || proposalData.client_neighborhood.trim().length < 3) {
      errors.push('Bairro do cliente é obrigatório');
    }

    if (!proposalData.client_city || proposalData.client_city.trim().length < 3) {
      errors.push('Cidade do cliente é obrigatória');
    }

    if (!proposalData.client_zipcode || proposalData.client_zipcode.trim().length < 8) {
      errors.push('CEP do cliente é obrigatório e deve ter pelo menos 8 caracteres');
    }

    if (!proposalData.type) {
      errors.push('Tipo de proposta é obrigatório');
    }

    if (!proposalData.services || proposalData.services.length === 0) {
      errors.push('Pelo menos um serviço deve ser incluído');
    }

    if (proposalData.services) {
      proposalData.services.forEach((service, index) => {
        if (!service.service_id) {
          errors.push(`Serviço ${index + 1}: Serviço é obrigatório`);
        }
        if (service.unit_value && service.unit_value < 0) {
          errors.push(`Serviço ${index + 1}: Valor unitário não pode ser negativo`);
        }
        if (service.total_value && service.total_value < 0) {
          errors.push(`Serviço ${index + 1}: Valor total do serviço não pode ser negativo`);
        }
      });
    }

    if (proposalData.end_date) {
      const validDate = new Date(proposalData.end_date);
      if (validDate <= new Date()) {
        errors.push('Data de validade deve ser futura');
      }
    }

    return errors;
  }

  /**
   * Obter cor do status
   */
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'draft': '#6b7280', // Cinza
      'sent': '#3b82f6', // Azul
      'signed': '#003b2b', // Verde escuro da marca (Fechada)
      'rejected': '#ef4444', // Vermelho
      'expired': '#f59e0b', // Amarelo
      'converted': '#10b981', // Verde claro (Assinada)
      'contraproposta': '#ef4444' // Vermelho para Assinada Parcialmente
    };
    return colors[status] || '#6b7280';
  }

  /**
   * Obter texto do status
   */
  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'draft': 'Rascunho',
      'sent': 'Enviada',
      'signed': 'Fechada',
      'rejected': 'Rejeitada',
      'expired': 'Expirada',
      'converted': 'Assinada',
      'contraproposta': 'Ass. Parcial'
    };
    return texts[status] || status;
  }

  /**
   * Verificar se proposta pode ser editada
   */
  canEditProposal(proposal: Proposal): boolean {
    return proposal.status === 'draft' || proposal.status === 'rejected';
  }

  /**
   * Verificar se proposta pode ser enviada
   */
  canSendProposal(proposal: Proposal): boolean {
    return proposal.status === 'draft' && proposal.services.length > 0;
  }

  /**
   * Verificar se proposta está expirada
   */
  isProposalExpired(proposal: any): boolean {
    if (!proposal.end_date) return false;
    return new Date(proposal.end_date) < new Date();
  }

  /**
   * Calcular dias restantes para expiração
   */
  getDaysUntilExpiration(proposal: Proposal): number | null {
    if (!proposal.end_date) return null;
    const validDate = new Date(proposal.end_date);
    const today = new Date();
    const diffTime = validDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Preparar proposta para envio (adicionar dados do cliente)
   */
  prepareProposalForSending(proposalId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${proposalId}/prepare-sending`, {});
  }

  /**
   * Enviar proposta por email
   */
  sendProposal(proposalId: number, emailData: SendProposalData): Observable<any> {
    return this.http.post(`${this.apiUrl}/${proposalId}/send`, emailData);
  }

  /**
   * Gerar link público da proposta (muda status de draft para sent automaticamente)
   */
  generatePublicLink(proposalId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${proposalId}/generate-link`, {});
  }

  /**
   * Assinar proposta (muda status de sent para signed)
   */
  signProposal(proposalId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${proposalId}/sign`, {});
  }

  /**
   * Regenerar token público da proposta
   */
  regeneratePublicToken(proposalId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${proposalId}/regenerate-token`, {});
  }

  /**
   * Verificar se proposta pode ser preparada para envio
   */
  canPrepareForSending(proposal: Proposal): boolean {
    return proposal.status === 'draft' && proposal.services.length > 0;
  }

  /**
   * Verificar se proposta já foi enviada
   */
  isProposalSent(proposal: Proposal): boolean {
    return ['sent', 'accepted', 'rejected'].includes(proposal.status);
  }

  /**
   * Obter URL pública da proposta
   */
  getPublicProposalUrl(proposal: Proposal): string | null {
    if (!proposal.unique_link) return null;
    const baseUrl = window.location.origin;

    // Se for proposta de Recrutamento & Seleção, usar a página específica de R&S
    if (proposal.type === 'Recrutamento & Seleção') {
      return `${baseUrl}/public/recruitment-proposal/${proposal.unique_link}`;
    }

    return `${baseUrl}/public/proposal/${proposal.unique_link}`;
  }

  /**
   * Buscar propostas aceitas (para conversão em contratos)
   */
  getAcceptedProposals(filters?: any): Observable<any> {
    let params = new HttpParams();
    params = params.set('status', 'accepted');
    
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          params = params.set(key, filters[key].toString());
        }
      });
    }

    return this.http.get(`${this.apiUrl}`, { params });
  }

}