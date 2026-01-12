// src/app/services/service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateServiceRequest {
  name: string;
  duration: number; // em minutos
  value: number; // em reais
  description?: string | null;
  category?: string | null;
  is_active?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  duration?: number;
  value?: number;
  description?: string | null;
  category?: string | null;
  is_active?: boolean;
}

export interface ApiService {
  id: number;
  name: string;
  duration: number;
  value: number;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
}

export interface ServicesResponse {
  services: ApiService[];
  total: number;
}

export interface ServiceResponse {
  service: ApiService;
}

export interface CreateServiceResponse {
  message: string;
  service: ApiService;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceService {
  private readonly API_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Obter headers com autorização
   */
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Listar serviços
   */
  getServices(filters?: any): Observable<ServicesResponse> {
    return this.http.get<ServicesResponse>(this.API_URL, { 
      params: filters || {},
      headers: this.getAuthHeaders() 
    });
  }

  /**
   * Buscar serviço por ID
   */
  getService(id: number): Observable<ServiceResponse> {
    return this.http.get<ServiceResponse>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Criar novo serviço
   */
  createService(serviceData: CreateServiceRequest): Observable<CreateServiceResponse> {
    return this.http.post<CreateServiceResponse>(this.API_URL, serviceData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualizar serviço
   */
  updateService(id: number, serviceData: UpdateServiceRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, serviceData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Alternar status do serviço
   */
  toggleServiceStatus(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/toggle-status`, {}, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Excluir serviço
   */
  deleteService(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Formatar duração para exibição
   */
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) {
      return `${hours}h`;
    }
    
    return `${hours}h ${mins}min`;
  }

  /**
   * Formatar valor para exibição
   */
  formatValue(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }
}