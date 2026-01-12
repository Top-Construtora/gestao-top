import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateCompanyRequest {
  name: string;
  employee_count?: number | null;
  founded_date?: string | null;
  headquarters?: string | null;
  locations?: string[];
  market_sector?: string | null;
  description?: string | null;
}

export interface UpdateCompanyRequest {
  name?: string;
  employee_count?: number | null;
  founded_date?: string | null;
  headquarters?: string | null;
  locations?: string[];
  market_sector?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface ApiCompany {
  id: number;
  name: string;
  employee_count: number | null;
  founded_date: string | null;
  headquarters: string | null;
  locations: string[];
  market_sector: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_user?: { name: string };
  updated_by_user?: { name: string };
}

export interface CompaniesResponse {
  companies: ApiCompany[];
  total: number;
  filters?: any;
}

export interface CompanyResponse {
  company: ApiCompany;
}

export interface CreateCompanyResponse {
  message: string;
  company: ApiCompany;
}

export interface CompanyStats {
  total: number;
  active: number;
  inactive: number;
  totalEmployees: number;
  sectorStats: { [key: string]: number };
}

export interface CompanyFilters {
  is_active?: boolean;
  market_sector?: string;
  search?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly API_URL = `${environment.apiUrl}/companies`;

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
   * Listar empresas
   */
  getCompanies(filters?: CompanyFilters): Observable<CompaniesResponse> {
    let params: any = {};
    
    if (filters) {
      if (filters.is_active !== undefined) {
        params.is_active = filters.is_active.toString();
      }
      if (filters.market_sector) {
        params.market_sector = filters.market_sector;
      }
      if (filters.search) {
        params.search = filters.search;
      }
    }

    return this.http.get<CompaniesResponse>(this.API_URL, { 
      params,
      headers: this.getAuthHeaders() 
    });
  }

  /**
   * Buscar empresa por ID
   */
  getCompany(id: number): Observable<CompanyResponse> {
    return this.http.get<CompanyResponse>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Criar nova empresa
   */
  createCompany(companyData: CreateCompanyRequest): Observable<CreateCompanyResponse> {
    return this.http.post<CreateCompanyResponse>(this.API_URL, companyData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Atualizar empresa
   */
  updateCompany(id: number, companyData: UpdateCompanyRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, companyData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Alternar status da empresa
   */
  toggleCompanyStatus(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/toggle-status`, {}, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Excluir empresa (soft delete)
   */
  deleteCompany(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Excluir empresa permanentemente (apenas admin)
   */
  deleteCompanyPermanent(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}/permanent`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Obter setores de mercado
   */
  getMarketSectors(): Observable<{ sectors: string[] }> {
    return this.http.get<{ sectors: string[] }>(`${this.API_URL}/meta/sectors`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Obter estatísticas das empresas
   */
  getCompanyStats(): Observable<{ stats: CompanyStats }> {
    return this.http.get<{ stats: CompanyStats }>(`${this.API_URL}/meta/stats`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Formatar número de funcionários para exibição
   */
  formatEmployeeCount(count: number | null): string {
    if (!count) return 'Não informado';
    
    if (count < 1000) {
      return count.toString();
    } else if (count < 1000000) {
      return (count / 1000).toFixed(1) + 'K';
    } else {
      return (count / 1000000).toFixed(1) + 'M';
    }
  }

  /**
   * Formatar data de fundação
   */
  formatFoundedDate(dateString: string | null): string {
    if (!dateString) return 'Não informado';
    
    const date = new Date(dateString);
    const year = date.getFullYear();
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    
    return `${year} (${age} anos)`;
  }

  /**
   * Obter ícone do setor
   */
  getMarketSectorIcon(sector: string | null): string {
    if (!sector) return 'fas fa-building';
    
    const iconMap: { [key: string]: string } = {
      'Tecnologia': 'fas fa-laptop-code',
      'Saúde': 'fas fa-heartbeat',
      'Educação': 'fas fa-graduation-cap',
      'Varejo': 'fas fa-shopping-cart',
      'Finanças': 'fas fa-chart-line',
      'Indústria': 'fas fa-industry',
      'Serviços': 'fas fa-concierge-bell',
      'Construção': 'fas fa-hard-hat',
      'Agricultura': 'fas fa-seedling',
      'Energia': 'fas fa-bolt',
      'Transporte': 'fas fa-truck',
      'Telecomunicações': 'fas fa-signal'
    };
    
    return iconMap[sector] || 'fas fa-building';
  }
}