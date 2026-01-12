import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateServiceRequest {
  name: string;
  duration_amount: number | null;
  duration_unit: 'dias' | 'semanas' | 'meses' | 'encontros' | 'Projeto';
  description?: string | null;
  category?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  is_active?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  duration_amount?: number | null;
  duration_unit?: 'dias' | 'semanas' | 'meses' | 'encontros' | 'Projeto';
  description?: string | null;
  category?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  is_active?: boolean;
}

export interface ApiService {
  id: number;
  name: string;
  duration_amount: number | null;
  duration_unit: string;
  description: string | null;
  category: string | null;
  subtitle: string | null;
  summary: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: number;
  updated_by: number;
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
}

export interface ServiceStats {
  total: number;
  active: number;
  inactive: number;
  averageDuration: number;
  categoryStats: { [key: string]: number };
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
  private readonly API_URL = `${environment.apiUrl}/services`;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  getServices(filters?: any): Observable<ServicesResponse> {
    return this.http.get<ServicesResponse>(this.API_URL, { 
      params: filters || {},
      headers: this.getAuthHeaders() 
    });
  }

  getServicesForContracts(filters?: any): Observable<ServicesResponse> {
    const contractFilters = {
      ...filters,
      exclude_internal: 'true'
    };
    return this.http.get<ServicesResponse>(this.API_URL, { 
      params: contractFilters,
      headers: this.getAuthHeaders() 
    });
  }

  getService(id: number): Observable<ServiceResponse> {
    return this.http.get<ServiceResponse>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  getServiceStats(): Observable<{ stats: ServiceStats }> {
    return this.http.get<{ stats: ServiceStats }>(`${this.API_URL}/meta/stats`, {
      headers: this.getAuthHeaders()
    });
  }

  createService(serviceData: CreateServiceRequest): Observable<CreateServiceResponse> {
    return this.http.post<CreateServiceResponse>(this.API_URL, serviceData, {
      headers: this.getAuthHeaders()
    });
  }

  updateService(id: number, serviceData: UpdateServiceRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, serviceData, {
      headers: this.getAuthHeaders()
    });
  }

  toggleServiceStatus(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/toggle-status`, {}, {
      headers: this.getAuthHeaders()
    });
  }

  deleteService(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  duplicateService(id: number, duplicateData?: any): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/${id}/duplicate`, duplicateData || {}, {
      headers: this.getAuthHeaders()
    });
  }

  formatDuration(amount: number | null, unit: string): string {
    if (unit === 'Projeto') return 'Projeto';
    if (!amount || !unit) return 'N/A';
    if (amount === 1) {
      const singularUnit = unit.endsWith('es') ? unit.slice(0, -2) : (unit.endsWith('s') ? unit.slice(0, -1) : unit);
      return `${amount} ${singularUnit}`;
    }
    return `${amount} ${unit}`;
  }


  getStats(filters?: any): Observable<{ stats: ServiceStats }> {
    return this.http.get<{ stats: ServiceStats }>(`${this.API_URL}/meta/stats`, {
      headers: this.getAuthHeaders(),
      params: filters
    });
  }
}