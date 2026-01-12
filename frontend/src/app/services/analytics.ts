import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';

// Interfaces para dados de analytics
export interface MetricData {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  isCurrency?: boolean;
  suffix?: string;
}

export interface AnalyticsPeriodFilter {
  period?: 'week' | 'month' | 'quarter' | 'year' | 'custom';
  start_date?: string;
  end_date?: string;
}

export interface GeneralStats {
  totalContracts: number;
  activeContracts: number;
  completedContracts: number;
  totalClients: number;
  totalRevenue: number;
  activeRevenue: number;
  averageContractValue: number;
  averageContractDuration: number;
  conversionRate: number;
  growthRate: number;
}

export interface ServiceAnalytics {
  id: number;
  name: string;
  category: string;
  totalContracts: number;
  activeContracts: number;
  completedContracts: number;
  totalRevenue: number;
  averageValue: number;
  popularity: number; // percentage
  trend: number; // percentage growth
  color?: string;
  icon?: string;
}

export interface ClientAnalytics {
  totalClients: number;
  newClients: number;
  activeClients: number;
  retentionRate: number;
  byType: {
    pf: number;
    pj: number;
  };
}

export interface ContractAnalytics {
  total: number;
  byStatus: { [status: string]: number };
  byType: { [type: string]: number };
  monthlyEvolution: {
    month: string;
    contracts: number;
  }[];
  byMonth: {
    month: string;
    new: number;
    completed: number;
    revenue: number;
  }[];
}

export interface ProposalAnalytics {
  total: number;
  byStatus: {
    draft: number;
    sent: number;
    signed: number;
    rejected: number;
    expired: number;
    converted: number;
  };
  totalValue: number;
  averageValue: number;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  receivedRevenue: number;
  pendingRevenue: number;
  totalCollected: number;
  totalPending: number;
  monthlyRevenue: {
    month: string;
    revenue: number;
  }[];
  monthly: {
    month: string;
    revenue: number;
    projected: number;
    growth: number;
  }[];
}

export interface ServicesByUser {
  userId: number;
  userName: string;
  totalServices: number;
  servicesByCategory: { [category: string]: number };
}

export interface CompletedService {
  month: string;
  completed: number;
}

export interface TopService {
  id: number;
  name: string;
  category: string;
  contractCount: number;
  totalValue: number;
}

export interface ClientCompletionData {
  clientId: number;
  clientName: string;
  totalServices: number;
  completedServices: number;
  completionPercentage: number;
  activeContracts: number;
  totalContracts: number;
}

export interface ContractCompletionData {
  contractId: number;
  contractNumber: string;
  clientId: number;
  clientName: string;
  type: string;
  totalServices: number;
  completedServices: number;
  completionPercentage: number;
  status: string;
  startDate: string;
}

export interface AnalyticsData {
  general: GeneralStats;
  services: ServiceAnalytics[];
  clients: ClientAnalytics;
  contracts: ContractAnalytics;
  proposals: ProposalAnalytics;
  revenue: RevenueAnalytics;
  servicesByUser?: ServicesByUser[];
  completedServices?: CompletedService[];
  topServices?: TopService[];
  clientCompletionData?: ClientCompletionData[];
  contractCompletionData?: ContractCompletionData[];
  period?: string;
  generatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}`;

  // Cache de dados com refresh automático
  private analyticsCache$ = new BehaviorSubject<AnalyticsData | null>(null);
  private _isLoading$ = new BehaviorSubject<boolean>(false);

  constructor() {
    // Carregar dados iniciais
    this.refreshAnalytics();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Obter dados completos de analytics
   */
  getAnalytics(filters: AnalyticsPeriodFilter = {}): Observable<AnalyticsData> {
    this._isLoading$.next(true);
    
    const params = new URLSearchParams();
    if (filters.period) params.append('period', filters.period);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);

    const url = `${this.baseUrl}/analytics${params.toString() ? '?' + params.toString() : ''}`;

    return this.http.get<{analytics: AnalyticsData, success: boolean}>(url, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => response.analytics),
      tap(data => {
        this.analyticsCache$.next(data);
        this._isLoading$.next(false);
      }),
      catchError(error => {
        console.error('❌ Erro ao buscar analytics:', error);
        this._isLoading$.next(false);
        throw error;
      })
    );
  }

  /**
   * Refresh dos dados de analytics
   */
  refreshAnalytics(filters: AnalyticsPeriodFilter = {}): void {
    this.getAnalytics(filters).subscribe();
  }

  /**
   * Observable para dados de analytics em cache
   */
  get analytics$(): Observable<AnalyticsData | null> {
    return this.analyticsCache$.asObservable();
  }

  /**
   * Observable para estado de loading
   */
  get isLoading$(): Observable<boolean> {
    return this._isLoading$.asObservable();
  }

  /**
   * Obter insights automáticos baseados nos dados
   */
  getInsights(): Observable<string[]> {
    return this.analytics$.pipe(
      map(data => {
        if (!data) return [];
        
        const insights: string[] = [];
        
        // Insights baseados no crescimento
        if (data.general.growthRate > 10) {
          insights.push(`Crescimento excelente de ${data.general.growthRate}% no período`);
        } else if (data.general.growthRate > 0) {
          insights.push(`Crescimento positivo de ${data.general.growthRate}% no período`);
        }
        
        // Insights sobre conversão
        if (data.general.conversionRate > 80) {
          insights.push(`Taxa de conversão excepcional: ${data.general.conversionRate}%`);
        } else if (data.general.conversionRate < 30) {
          insights.push(`Taxa de conversão baixa: ${data.general.conversionRate}%. Considere revisar a estratégia de propostas`);
        }
        
        // Insights sobre receita
        const pendingPercentage = (data.revenue.pendingRevenue / data.revenue.totalRevenue) * 100;
        if (pendingPercentage > 50) {
          insights.push(`${pendingPercentage.toFixed(0)}% da receita ainda está pendente de pagamento`);
        }
        
        // Insights sobre serviços
        if (data.services.length > 0) {
          const topService = data.services[0];
          insights.push(`"${topService.name}" é o serviço mais popular com ${topService.totalContracts} contratos`);
        }
        
        return insights;
      })
    );
  }

  /**
   * Exportar dados de analytics
   */
  exportAnalytics(format: 'json' | 'csv' | 'excel' = 'json'): Observable<Blob> {
    const params = new URLSearchParams();
    params.append('format', format);
    
    return this.http.get(`${this.baseUrl}/analytics/export?${params.toString()}`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob'
    });
  }

}