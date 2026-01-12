import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PaymentMethod } from './payment-method.service';

export interface ContractServiceItem {
  service_id: number;
  unit_value: number; // em reais
  scheduled_start_date?: string | null;
  status?: 'not_started' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  recruitmentPercentages?: {
    administrativo_gestao: number;
    comercial: number;
    operacional: number;
    estagio_jovem: number;
  };
}

export interface ContractInstallment {
  due_date: string;
  amount: number;
  payment_status: 'pago' | 'pendente';
  paid_date?: string | null;
  paid_amount?: number | null;
  notes?: string | null;
}

export interface UserAssignment {
  user_id: number;
  role: 'owner' | 'editor' | 'viewer';
}

export interface RoutineListItem {
  id: number;
  contractNumber: string;
  clientName: string;
  clientId: number;
  type: string;
  status: string;
  servicesCount: number;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface ApiContractInstallment {
  id: number;
  installment_number: number;
  due_date: string;
  amount: number;
  payment_status: 'pago' | 'pendente' | 'atrasado';
  paid_date?: string | null;
  paid_amount?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContractRequest {
  contract_number?: string;
  client_id: number;
  type: 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção';
  start_date: string;
  end_date?: string | null;
  status?: 'active' | 'completed' | 'cancelled' | 'suspended';
  services: ContractServiceItem[];
  total_value?: number;
  notes?: string | null;
  assigned_users?: number[];
  payment_method?: string | null;
  payment_method_1?: string | null;
  payment_method_2?: string | null;
  payment_method_1_value_type?: 'percentage' | 'value' | null;
  payment_method_1_value?: number | null;
  payment_method_1_percentage?: number | null;
  payment_method_2_value_type?: 'percentage' | 'value' | null;
  payment_method_2_value?: number | null;
  payment_method_2_percentage?: number | null;
  expected_payment_date?: string | null;
  first_installment_date?: string | null;
  payment_status?: 'pago' | 'pendente';
  installment_count?: number;
  installments?: ContractInstallment[];
  barter_type?: 'percentage' | 'value' | null;
  barter_value?: number | null;
  barter_percentage?: number | null;
  secondary_payment_method?: string | null;
}

export interface UpdateContractRequest {
  contract_number?: string;
  client_id?: number;
  type?: 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção';
  start_date?: string;
  end_date?: string | null;
  status?: 'active' | 'completed' | 'cancelled' | 'suspended';
  services?: ContractServiceItem[];
  notes?: string | null;
  assigned_users?: number[];
  payment_method?: string | null;
  payment_method_1?: string | null;
  payment_method_2?: string | null;
  payment_method_1_value_type?: 'percentage' | 'value' | null;
  payment_method_1_value?: number | null;
  payment_method_1_percentage?: number | null;
  payment_method_2_value_type?: 'percentage' | 'value' | null;
  payment_method_2_value?: number | null;
  payment_method_2_percentage?: number | null;
  expected_payment_date?: string | null;
  first_installment_date?: string | null;
  payment_status?: 'pago' | 'pendente';
  installment_count?: number;
  installments?: ContractInstallment[];
  barter_type?: 'percentage' | 'value' | null;
  barter_value?: number | null;
  barter_percentage?: number | null;
  secondary_payment_method?: string | null;
}

export interface ServiceStage {
  id: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  sort_order: number;
  is_active: boolean;
}

export interface ApiContractService {
  id: number;
  contract_id?: number;
  unit_value: number;
  total_value: number;
  scheduled_start_date?: string | null;
  status?: 'not_started' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  updated_at?: string;
  service: {
    id: number;
    name: string;
    duration: number;
    category: string;
    description?: string;
    summary?: string;
    subtitle?: string;
    service_stages?: ServiceStage[];
  };
}

export interface ApiContract {
  id: number;
  contract_number: string;
  type: 'Full' | 'Pontual' | 'Individual' | 'Recrutamento & Seleção';
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'cancelled' | 'suspended';
  total_value: number; // em reais
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  payment_method?: string | null;
  expected_payment_date?: string | null;
  first_installment_date?: string | null;
  payment_status?: 'pago' | 'pendente';
  installment_count?: number;
  installment_value?: number | null;
  installments?: ApiContractInstallment[];
  barter_type?: 'percentage' | 'value' | null;
  barter_value?: number | null;
  barter_percentage?: number | null;
  secondary_payment_method?: string | null;
  payment_methods?: PaymentMethod[]; // Nova propriedade para formas de pagamento flexíveis
  client: {
    id: number;
    name: string;
  };
  contract_services: ApiContractService[];
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
  assigned_users?: { user: { id: number; name: string; email: string }; role: string }[];
}

export interface ContractsResponse {
  contracts: ApiContract[];
  total: number;
}

export interface ContractResponse {
  contract: ApiContract;
}

export interface CreateContractResponse {
  message: string;
  contract: ApiContract;
}

export interface ContractStats {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  suspended: number;
  totalValueActive: number;
  totalValueAll: number;
  averageValue: number;
  typeStats: {
    Full: number;
    Pontual: number;
    Individual: number;
    'Recrutamento & Seleção': number;
  };
  averageDuration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ContractService {
  private readonly API_URL = `${environment.apiUrl}/contracts`;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  getContracts(filters?: any): Observable<ContractsResponse> {
    const cleanFilters: any = {};
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== '' && filters[key] !== 'null') {
          cleanFilters[key] = filters[key];
        }
      });
    }
    return this.http.get<ContractsResponse>(this.API_URL, { 
      params: cleanFilters,
      headers: this.getAuthHeaders() 
    });
  }

  getContract(id: number): Observable<ContractResponse> {
    return this.http.get<ContractResponse>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  getContractsByClient(clientId: number): Observable<{ contracts: any[] }> {
    return this.http.get<{ contracts: any[] }>(`${this.API_URL}/client/${clientId}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Endpoint otimizado para página de rotinas
   * Retorna apenas dados necessários para listagem
   */
  getRoutines(): Observable<{ routines: RoutineListItem[]; total: number }> {
    return this.http.get<{ routines: RoutineListItem[]; total: number }>(`${this.API_URL}/routines`, {
      headers: this.getAuthHeaders()
    });
  }

  createContract(contractData: CreateContractRequest): Observable<CreateContractResponse> {
    return this.http.post<CreateContractResponse>(this.API_URL, contractData, {
      headers: this.getAuthHeaders()
    });
  }

  updateContract(id: number, contractData: UpdateContractRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, contractData, {
      headers: this.getAuthHeaders()
    });
  }

  updateUserRole(contractId: number, userId: number, role: string): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.patch(`${this.API_URL}/${contractId}/assign/${userId}`, { role }, { headers });
  }


  updateContractStatus(id: number, status: string): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/status`, { status }, {
      headers: this.getAuthHeaders()
    });
  }

  generateContractNumber(): Observable<{ contractNumber: string }> {
    return this.http.get<{ contractNumber: string }>(`${this.API_URL}/meta/generate-number`, {
      headers: this.getAuthHeaders()
    });
  }

  getContractTypes(): Observable<{ types: { value: string, label: string }[] }> {
    return this.http.get<{ types: { value: string, label: string }[] }>(`${this.API_URL}/meta/types`, {
      headers: this.getAuthHeaders()
    });
  }
  
  getContractStatuses(): Observable<{ statuses: { value: string, label: string }[] }> {
    return this.http.get<{ statuses: { value: string, label: string }[] }>(`${this.API_URL}/meta/statuses`, {
      headers: this.getAuthHeaders()
    });
  }

  getStats(filters?: any): Observable<{ stats: ContractStats }> {
    return this.http.get<{ stats: ContractStats }>(`${this.API_URL}/meta/stats`, {
      headers: this.getAuthHeaders(),
      params: filters
    });
  }

  deleteContractPermanent(id: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.delete(`${this.API_URL}/${id}/permanent`, { headers });
  }

  formatValue(valueInReais: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInReais || 0);
  }

  /**
   * Formatar data para exibição
   */
  formatDate(date: string | null): string {
    if (!date) return 'Indeterminado';
    // Adiciona T00:00:00 para garantir que a data seja interpretada como local
    return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
  }

  /**
   * Obter data atual no formato YYYY-MM-DD sem conversão UTC
   */
  getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formatar objeto Date para string YYYY-MM-DD sem conversão UTC
   */
  formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  calculateDuration(startDate: string, endDate?: string | null): number {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'active': '#10b981', 'completed': '#3b82f6', 'cancelled': '#ef4444', 'suspended': '#f59e0b'
    };
    return colors[status] || '#6b7280';
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'active': 'Ativo', 'completed': 'Concluído', 'cancelled': 'Cancelado', 'suspended': 'Suspenso'
    };
    return texts[status] || status;
  }

  getTypeIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'Full': 'fas fa-building', 'Pontual': 'fas fa-calendar-check', 'Individual': 'fas fa-user', 'Recrutamento & Seleção': 'fas fa-users'
    };
    return icons[type] || 'fas fa-file-contract';
  }

  /**
   * Verificar se contrato está vencido
   */
  isContractExpired(contract: any): boolean {
    if (!contract.end_date) return false;
    return new Date(contract.end_date) < new Date();
  }

  // Métodos para serviços do contrato
  getContractServiceById(serviceId: number): Observable<ApiContractService> {
    return this.http.get<ApiContractService>(`${this.API_URL}/services/${serviceId}`, {
      headers: this.getAuthHeaders()
    });
  }

  updateContractService(serviceId: number, data: { status?: string; scheduled_start_date?: string | null }): Observable<any> {
    return this.http.patch(`${this.API_URL}/services/${serviceId}`, data, {
      headers: this.getAuthHeaders()
    });
  }

  getServiceComments(serviceId: number): Observable<{ comments: ServiceComment[]; total: number }> {
    return this.http.get<{ comments: ServiceComment[]; total: number }>(
      `${this.API_URL}/services/${serviceId}/comments`,
      { headers: this.getAuthHeaders() }
    );
  }

  addServiceComment(serviceId: number, comment: string): Observable<any> {
    return this.http.post(
      `${this.API_URL}/services/${serviceId}/comments`,
      { comment },
      { headers: this.getAuthHeaders() }
    );
  }

  updateServiceComment(commentId: number, comment: string): Observable<any> {
    return this.http.put(
      `${this.API_URL}/comments/${commentId}`,
      { comment },
      { headers: this.getAuthHeaders() }
    );
  }

  deleteServiceComment(commentId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/comments/${commentId}`, {
      headers: this.getAuthHeaders()
    });
  }

  // Helpers para status de serviços
  getServiceStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'not_started': '#6b7280',
      'scheduled': '#3b82f6',
      'in_progress': '#f59e0b',
      'completed': '#10b981',
      'cancelled': '#ef4444'
    };
    return colors[status] || '#6b7280';
  }

  getServiceStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'not_started': 'Não iniciado',
      'scheduled': 'Agendado',
      'in_progress': 'Em andamento',
      'completed': 'Finalizado',
      'cancelled': 'Cancelado'
    };
    return texts[status] || status;
  }

  getServiceStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'not_started': 'fas fa-circle',
      'scheduled': 'fas fa-calendar-alt',
      'in_progress': 'fas fa-spinner',
      'completed': 'fas fa-check-circle',
      'cancelled': 'fas fa-times-circle'
    };
    return icons[status] || 'fas fa-circle';
  }

  // Métodos para status de pagamento
  getPaymentStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'pago': '#10b981',
      'pendente': '#f59e0b'
    };
    return colors[status] || '#6b7280';
  }

  getPaymentStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'pago': 'Pago',
      'pendente': 'Pendente'
    };
    return texts[status] || status;
  }

  getPaymentStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pago': 'fas fa-check-circle',
      'pendente': 'fas fa-clock'
    };
    return icons[status] || 'fas fa-question-circle';
  }

  // Métodos de pagamento comuns
  getPaymentMethods(): { value: string, label: string }[] {
    return [
      { value: 'PIX', label: 'PIX' },
      { value: 'Transferência', label: 'Transferência Bancária' },
      { value: 'Boleto', label: 'Boleto Bancário' },
      { value: 'Dinheiro', label: 'Dinheiro' },
      { value: 'Pix Parcelado', label: 'Pix Parcelado' },
      { value: 'Permuta', label: 'Permuta' },
      { value: 'Outros', label: 'Outros' }
    ];
  }

  // Verificar se forma de pagamento permite parcelamento
  isPaymentMethodInstallable(paymentMethod: string): boolean {
    const installableMethods = ['Boleto', 'Pix Parcelado'];
    return installableMethods.includes(paymentMethod);
  }

  // Gerar parcelas automaticamente
  generateInstallments(totalValue: number, installmentCount: number, firstDueDate: string, intervalDays: number = 30): ContractInstallment[] {
    const installments: ContractInstallment[] = [];
    const installmentValue = totalValue / installmentCount;

    // Parse da data sem conversão UTC - usar formato local
    const [year, month, day] = firstDueDate.split('-').map(Number);
    let currentDate = new Date(year, month - 1, day); // month - 1 porque meses em JS são 0-indexed

    for (let i = 0; i < installmentCount; i++) {
      // Formatar data manualmente para evitar conversão UTC
      const dateYear = currentDate.getFullYear();
      const dateMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dateDay = String(currentDate.getDate()).padStart(2, '0');
      const formattedDate = `${dateYear}-${dateMonth}-${dateDay}`;

      installments.push({
        due_date: formattedDate,
        amount: installmentValue,
        payment_status: 'pendente',
        notes: `Parcela ${i + 1} de ${installmentCount}`
      });

      // Próxima data (adicionar intervalDays)
      currentDate.setDate(currentDate.getDate() + intervalDays);
    }

    return installments;
  }

  // Métodos para API de parcelas
  getContractInstallments(contractId: number): Observable<{ installments: ApiContractInstallment[]; total: number; stats?: any }> {
    return this.http.get<{ installments: ApiContractInstallment[]; total: number; stats?: any }>(
      `${environment.apiUrl}/contracts/${contractId}/installments`,
      { headers: this.getAuthHeaders() }
    );
  }

  updateInstallmentStatus(installmentId: number, status: 'pago' | 'pendente' | 'atrasado', paidAmount?: number, paidDate?: string, notes?: string): Observable<any> {
    const body: any = { payment_status: status };

    if (status === 'pago') {
      body.paid_amount = paidAmount || 0;
      body.paid_date = paidDate || this.getTodayDateString();
    }

    if (notes !== undefined) {
      body.notes = notes;
    }

    return this.http.put(
      `${environment.apiUrl}/installments/${installmentId}/status`,
      body,
      { headers: this.getAuthHeaders() }
    );
  }

  markInstallmentAsPaid(installmentId: number, paidAmount: number, paidDate?: string): Observable<any> {
    return this.http.put(
      `${environment.apiUrl}/installments/${installmentId}/pay`,
      { paid_amount: paidAmount, paid_date: paidDate },
      { headers: this.getAuthHeaders() }
    );
  }

  // Atualizar parcelas vencidas
  updateOverdueInstallments(): Observable<any> {
    return this.http.post(
      `${environment.apiUrl}/installments/update-overdue`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  getOverdueInstallments(): Observable<{ installments: ApiContractInstallment[]; total: number }> {
    return this.http.get<{ installments: ApiContractInstallment[]; total: number }>(
      `${environment.apiUrl}/installments/overdue`,
      { headers: this.getAuthHeaders() }
    );
  }

  getInstallmentsByDateRange(startDate: string, endDate: string, status?: string): Observable<{ installments: ApiContractInstallment[]; total: number }> {
    const params: any = { start_date: startDate, end_date: endDate };
    if (status) params.status = status;

    return this.http.get<{ installments: ApiContractInstallment[]; total: number }>(
      `${environment.apiUrl}/installments/date-range`,
      { params, headers: this.getAuthHeaders() }
    );
  }

  // Atualizar todas as parcelas de um contrato
  updateContractInstallments(contractId: number, installments: any[]): Observable<any> {
    return this.http.put(
      `${environment.apiUrl}/contracts/${contractId}/installments`,
      { installments },
      { headers: this.getAuthHeaders() }
    );
  }

  // Helper para status de parcelas
  getInstallmentStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'pago': '#10b981',
      'pendente': '#f59e0b',
      'atrasado': '#ef4444'
    };
    return colors[status] || '#6b7280';
  }

  getInstallmentStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'pago': 'Pago',
      'pendente': 'Pendente',
      'atrasado': 'Atrasado'
    };
    return texts[status] || status;
  }

  getInstallmentStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pago': 'fas fa-check-circle',
      'pendente': 'fas fa-clock',
      'atrasado': 'fas fa-exclamation-triangle'
    };
    return icons[status] || 'fas fa-question-circle';
  }

  getRecentServiceActivities(limit: number = 10): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/meta/recent-activities?limit=${limit}`);
  }
}

export interface ServiceComment {
  id: number;
  comment: string;
  created_at: string;
  updated_at: string;
  has_attachments?: boolean;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface ServiceActivity {
  id: number;
  type: 'service';
  status: 'not_started' | 'scheduled' | 'in_progress' | 'completed';
  title: string;
  description: string;
  time: string;
  scheduledStartDate?: string | null;
  value: number;
  category: string;
  duration?: string | null;
  contractId: number;
  serviceId: number;
}