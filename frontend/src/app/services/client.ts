import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateClientRequest {
  type: 'PF' | 'PJ';
  email?: string; // Para compatibilidade com PF
  emails?: string[]; // Para múltiplos emails em PJ
  phone?: string;
  phones?: string[]; // Para múltiplos telefones
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipcode: string;
  employee_count?: number;
  business_segment?: string;
  cpf?: string;
  full_name?: string;
  cnpj?: string;
  company_name?: string;
  trade_name?: string;
  legal_representative?: string;
}

export interface UpdateClientRequest {
  email?: string; // Para compatibilidade com PF
  emails?: string[]; // Para múltiplos emails em PJ
  phone?: string;
  phones?: string[]; // Para múltiplos telefones
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  employee_count?: number;
  business_segment?: string;
  cpf?: string;
  full_name?: string;
  cnpj?: string;
  company_name?: string;
  trade_name?: string;
  legal_representative?: string;
}

export interface ClientEmail {
  id: number;
  email: string;
  is_primary: boolean;
}

export interface ClientPhone {
  id: number;
  phone: string;
  is_primary: boolean;
}

export interface ApiClient {
  id: number;
  type: 'PF' | 'PJ';
  name: string;
  email: string; // Email primário para compatibilidade
  emails?: ClientEmail[]; // Lista de emails para PJ
  primary_email?: string; // Email primário extraído
  phone: string | null;
  phones?: ClientPhone[]; // Lista de telefones
  primary_phone?: string; // Telefone primário extraído
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipcode: string;
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
  cpf?: string;
  full_name?: string;
  cnpj?: string;
  company_name?: string;
  trade_name?: string;
  legal_representative?: string;
  employee_count?: number | null;
  business_segment?: string | null;
  logo_path?: string | null;
  logo_original_name?: string | null;
  logo_mime_type?: string | null;
  logo_size?: number | null;
  logo_uploaded_at?: string | null;
  founded_date?: string | null;
  headquarters?: string | null;
  market_sector?: string | null;
}

export interface ClientsResponse {
  clients: ApiClient[];
  total: number;
  filters?: any;
}

export interface ClientResponse {
  client: ApiClient;
}

export interface CreateClientResponse {
  message: string;
  client: ApiClient;
}

export interface ClientStats {
  total: number;
  totalPF: number;
  totalPJ: number;
  byCity: { [key: string]: number };
  byState: { [key: string]: number };
}

export interface ClientFilters {
  type?: 'PF' | 'PJ';
  city?: string;
  state?: string;
  search?: string;
  is_active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private readonly API_URL = `${environment.apiUrl}/clients`;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Listar clientes
   */
  getClients(filters?: ClientFilters): Observable<ClientsResponse> {
    let params: any = {};
    
    if (filters) {
      if (filters.type) {
        params.type = filters.type;
      }
      if (filters.city) {
        params.city = filters.city;
      }
      if (filters.state) {
        params.state = filters.state;
      }
      if (filters.search) {
        params.search = filters.search;
      }
      if (filters.is_active !== undefined) {
        params.is_active = filters.is_active.toString();
      }
    }

    return this.http.get<ClientsResponse>(this.API_URL, { 
      params,
      headers: this.getAuthHeaders() 
    });
  }

  /**
   * Buscar cliente por ID
   */
  getClient(id: number): Observable<ClientResponse> {
    return this.http.get<ClientResponse>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Criar novo cliente
   */
  createClient(clientData: CreateClientRequest): Observable<CreateClientResponse> {
    return this.http.post<CreateClientResponse>(this.API_URL, clientData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualizar cliente
   */
  updateClient(id: number, clientData: UpdateClientRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, clientData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Excluir cliente (soft delete)
   */
  deleteClient(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Excluir cliente permanentemente (apenas admin)
   */
  deleteClientPermanent(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}/permanent`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Obter estatísticas dos clientes
   */
  getClientStats(): Observable<{ stats: ClientStats }> {
    return this.http.get<{ stats: ClientStats }>(`${this.API_URL}/meta/stats`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Formatar CPF
   */
  formatCPF(cpf: string): string {
    if (!cpf) return '';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  /**
   * Formatar CNPJ
   */
  formatCNPJ(cnpj: string): string {
    if (!cnpj) return '';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  /**
   * Formatar CEP
   */
  formatZipCode(zipcode: string): string {
    if (!zipcode) return '';
    return zipcode.replace(/(\d{5})(\d{3})/, '$1-$2');
  }

  /**
   * Formatar telefone
   */
  formatPhone(phone: string): string {
    if (!phone) return '';
    if (phone.length === 11) {
      return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (phone.length === 10) {
      return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  }

  /**
   * Obter endereço completo formatado
   */
  getFullAddress(client: ApiClient): string {
    let address = `${client.street}, ${client.number}`;
    if (client.complement) {
      address += ` - ${client.complement}`;
    }
    address += ` - ${client.neighborhood}, ${client.city}/${client.state}`;
    address += ` - CEP: ${this.formatZipCode(client.zipcode)}`;
    return address;
  }

  /**
   * Obter documento formatado (CPF ou CNPJ)
   */
  getFormattedDocument(client: ApiClient): string {
    if (client.type === 'PF' && client.cpf) {
      return this.formatCPF(client.cpf);
    } else if (client.type === 'PJ' && client.cnpj) {
      return this.formatCNPJ(client.cnpj);
    }
    return '';
  }

  /**
   * Busca a logo de um cliente como um objeto Blob.
   */
  getClientLogo(clientId: number): Observable<Blob> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    return this.http.get(`${this.API_URL}/${clientId}/logo`, { headers, responseType: 'blob' });
  }

  /**
   * Upload da logo do cliente
   */
  uploadClientLogo(clientId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('logo', file);

    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post(`${this.API_URL}/${clientId}/logo`, formData, { headers });
  }

  /**
   * Deletar a logo do cliente
   */
  deleteClientLogo(clientId: number): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.delete(`${this.API_URL}/${clientId}/logo`, { headers });
  }

  /**
   * Obter a URL da logo do cliente
   */
  getClientLogoUrl(clientId: number): string {
    return `${this.API_URL}/${clientId}/logo`;
  }

  // ========== MÉTODOS PARA GERENCIAR EMAILS ==========

  /**
   * Obter todos os emails de um cliente
   */
  getClientEmails(clientId: number): Observable<{ success: boolean; emails: ClientEmail[] }> {
    return this.http.get<{ success: boolean; emails: ClientEmail[] }>(
      `${environment.apiUrl}/clients/${clientId}/emails`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Adicionar um novo email a um cliente
   */
  addClientEmail(clientId: number, email: string, isPrimary = false): Observable<{ success: boolean; email: ClientEmail; message: string }> {
    return this.http.post<{ success: boolean; email: ClientEmail; message: string }>(
      `${environment.apiUrl}/clients/${clientId}/emails`,
      { email, is_primary: isPrimary },
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Atualizar um email
   */
  updateClientEmail(emailId: number, email?: string, isPrimary?: boolean): Observable<{ success: boolean; email: ClientEmail; message: string }> {
    const updateData: any = {};
    if (email !== undefined) updateData.email = email;
    if (isPrimary !== undefined) updateData.is_primary = isPrimary;

    return this.http.put<{ success: boolean; email: ClientEmail; message: string }>(
      `${environment.apiUrl}/emails/${emailId}`,
      updateData,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Definir um email como primário
   */
  setPrimaryEmail(emailId: number): Observable<{ success: boolean; email: ClientEmail; message: string }> {
    return this.http.put<{ success: boolean; email: ClientEmail; message: string }>(
      `${environment.apiUrl}/emails/${emailId}/primary`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Remover um email
   */
  removeClientEmail(emailId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${environment.apiUrl}/emails/${emailId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Substituir todos os emails de um cliente PJ
   */
  replaceAllEmails(clientId: number, emails: string[]): Observable<{ success: boolean; emails: ClientEmail[]; message: string }> {
    return this.http.put<{ success: boolean; emails: ClientEmail[]; message: string }>(
      `${environment.apiUrl}/clients/${clientId}/emails/replace`,
      { emails },
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Obter o email primário de um cliente
   */
  getPrimaryEmail(client: ApiClient): string {
    if (client.primary_email) {
      return client.primary_email;
    }
    
    if (client.emails && client.emails.length > 0) {
      const primaryEmail = client.emails.find(e => e.is_primary);
      return primaryEmail?.email || client.emails[0].email;
    }
    
    return client.email || '';
  }

  /**
   * Obter todos os emails de um cliente como array de strings
   */
  getAllEmails(client: ApiClient): string[] {
    if (client.emails && client.emails.length > 0) {
      return client.emails.map(e => e.email);
    }
    
    return client.email ? [client.email] : [];
  }

  // ========== MÉTODOS PARA GERENCIAR TELEFONES ==========

  /**
   * Obter todos os telefones de um cliente
   */
  getClientPhones(clientId: number): Observable<{ success: boolean; phones: ClientPhone[] }> {
    return this.http.get<{ success: boolean; phones: ClientPhone[] }>(
      `${environment.apiUrl}/clients/${clientId}/phones`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Adicionar um novo telefone a um cliente
   */
  addClientPhone(clientId: number, phone: string, isPrimary = false): Observable<{ success: boolean; phone: ClientPhone; message: string }> {
    return this.http.post<{ success: boolean; phone: ClientPhone; message: string }>(
      `${environment.apiUrl}/clients/${clientId}/phones`,
      { phone, is_primary: isPrimary },
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Atualizar um telefone
   */
  updateClientPhone(phoneId: number, phone?: string, isPrimary?: boolean): Observable<{ success: boolean; phone: ClientPhone; message: string }> {
    const updateData: any = {};
    if (phone !== undefined) updateData.phone = phone;
    if (isPrimary !== undefined) updateData.is_primary = isPrimary;

    return this.http.put<{ success: boolean; phone: ClientPhone; message: string }>(
      `${environment.apiUrl}/phones/${phoneId}`,
      updateData,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Definir um telefone como primário
   */
  setPrimaryPhone(phoneId: number): Observable<{ success: boolean; phone: ClientPhone; message: string }> {
    return this.http.put<{ success: boolean; phone: ClientPhone; message: string }>(
      `${environment.apiUrl}/phones/${phoneId}/primary`,
      {},
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Remover um telefone
   */
  removeClientPhone(phoneId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${environment.apiUrl}/phones/${phoneId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Substituir todos os telefones de um cliente
   */
  replaceAllPhones(clientId: number, phones: string[]): Observable<{ success: boolean; phones: ClientPhone[]; message: string }> {
    return this.http.put<{ success: boolean; phones: ClientPhone[]; message: string }>(
      `${environment.apiUrl}/clients/${clientId}/phones/replace`,
      { phones },
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Obter o telefone primário de um cliente
   */
  getPrimaryPhone(client: ApiClient): string {
    if (client.primary_phone) {
      return client.primary_phone;
    }
    
    if (client.phones && client.phones.length > 0) {
      const primaryPhone = client.phones.find(p => p.is_primary);
      return primaryPhone?.phone || client.phones[0].phone;
    }
    
    return client.phone || '';
  }

  /**
   * Obter todos os telefones de um cliente como array de strings
   */
  getAllPhones(client: ApiClient): string[] {
    if (client.phones && client.phones.length > 0) {
      return client.phones.map(p => p.phone);
    }
    
    return client.phone ? [client.phone] : [];
  }
}