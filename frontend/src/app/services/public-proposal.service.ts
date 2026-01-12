import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PublicProposalService {
  id: number;
  service_id: number;
  quantity: number;
  unit_value: number;
  total_value: number;
  custom_value?: number;
  selected_by_client?: boolean;
  client_notes?: string;
  recruitmentPercentages?: {
    administrativo_gestao: number;
    comercial: number;
    operacional: number;
    estagio_jovem: number;
  };
  service: {
    name: string;
    value: number;
    duration_amount?: number;
    duration_unit?: string;
    category: string;
    description?: string;
    subtitle?: string;
    summary?: string;
  };
}

export interface PublicProposal {
  id: number;
  proposal_number?: string;
  type?: string;
  title: string;
  description?: string;
  status: string;
  total_value: number;
  valor_global?: number; // Valor global fixo da proposta
  usar_valor_global?: boolean; // Se true, usa valor_global. Se false, usa soma dos serviços
  valid_until?: string;
  end_date?: string;
  observations?: string;
  sent_at: string;
  client_name?: string;
  client_email?: string;
  signed_at?: string;
  signature_data?: string;
  accepted_value?: number;
  max_installments?: number;
  vista_discount_percentage?: number;
  prazo_discount_percentage?: number;
  vista_discount_value?: number;
  prazo_discount_value?: number;
  solicitante_name?: string;
  solicitante_email?: string;
  client: {
    id: number;
    email: string;
    phone?: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipcode: string;
    type?: 'PJ' | 'PF';
    company?: {
      company_name: string;
      trade_name?: string;
      cnpj: string;
    };
    person?: {
      full_name: string;
      cpf: string;
    };
  };
  services: PublicProposalService[];
}

export interface ServiceSelectionData {
  selectedServices: {
    service_id: number;
    selected: boolean;
    client_notes?: string;
  }[];
  client_observations?: string;
}

export interface SignatureData {
  signature_data: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  client_document?: string;
  client_observations?: string;
  payment_type?: 'vista' | 'prazo';
  payment_method?: string;
  installments?: number;
  final_value?: number;
  discount_applied?: number;
  is_counterproposal?: boolean;
}

export interface ConfirmationData {
  client_observations?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PublicProposalService {
  private apiUrl = `${environment.apiUrl}/public/proposals`;

  constructor(private http: HttpClient) {}

  /**
   * Buscar proposta por token público
   */
  getProposalByToken(token: string): Observable<{
    success: boolean;
    data: PublicProposal;
    message?: string;
  }> {
    const url = `${this.apiUrl}/${token}`;
    return this.http.get<any>(url);
  }

  /**
   * Selecionar serviços da proposta
   */
  selectServices(token: string, data: ServiceSelectionData): Observable<any> {
    return this.http.post(`${this.apiUrl}/${token}/services`, data);
  }

  /**
   * Assinar proposta eletronicamente
   */
  signProposal(token: string, data: SignatureData): Observable<any> {
    return this.http.post(`${this.apiUrl}/${token}/sign`, data);
  }

  /**
   * Confirmar proposta (finalizar processo)
   */
  confirmProposal(token: string, data: ConfirmationData): Observable<any> {
    return this.http.post(`${this.apiUrl}/${token}/confirm`, data);
  }

  /**
   * Rejeitar proposta
   */
  rejectProposal(token: string, reason?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${token}/reject`, { rejection_reason: reason });
  }

  /**
   * Calcular valor total dos serviços selecionados
   */
  calculateSelectedTotal(services: PublicProposalService[]): number {
    return services
      .filter(service => service.selected_by_client)
      .reduce((total, service) => {
        const value = service.custom_value || service.service.value;
        return total + (value * service.quantity);
      }, 0);
  }

  /**
   * Obter serviços selecionados
   */
  getSelectedServices(services: PublicProposalService[]): PublicProposalService[] {
    return services.filter(service => service.selected_by_client);
  }

  /**
   * Verificar se há pelo menos um serviço selecionado
   */
  hasSelectedServices(services: PublicProposalService[]): boolean {
    return services.some(service => service.selected_by_client);
  }

  /**
   * Formatar valor monetário
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value); // Valor já está em reais
  }

  /**
   * Verificar se proposta está expirada
   */
  isProposalExpired(proposal: PublicProposal): boolean {
    const dateField = proposal.end_date || proposal.valid_until;
    if (!dateField) return false;
    return new Date(dateField) < new Date();
  }

  /**
   * Obter dias restantes até expiração
   */
  getDaysUntilExpiration(proposal: PublicProposal): number | null {
    const dateField = proposal.end_date || proposal.valid_until;
    if (!dateField) return null;
    
    const validDate = new Date(dateField);
    const today = new Date();
    const diffTime = validDate.getTime() - today.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return days > 0 ? days : 0;
  }
}