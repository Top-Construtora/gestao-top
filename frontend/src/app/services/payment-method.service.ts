import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PaymentMethod {
  id?: number;
  contract_id?: number;
  payment_method: string;
  value_type: 'percentage' | 'fixed_value';
  percentage?: number | null;
  fixed_value?: number | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePaymentMethodRequest {
  payment_method: string;
  value_type: 'percentage' | 'fixed_value';
  percentage?: number;
  fixed_value?: number;
  sort_order?: number;
}

export interface PaymentMethodsResponse {
  payment_methods: PaymentMethod[];
  total: number;
}

export interface ValidationResponse {
  validation: {
    isValid: boolean;
    total: number;
    difference: number;
  };
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentMethodService {
  private readonly API_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  // Contract Payment Methods
  getContractPaymentMethods(contractId: number): Observable<PaymentMethodsResponse> {
    return this.http.get<PaymentMethodsResponse>(
      `${this.API_URL}/contracts/${contractId}/payment-methods`,
      { headers: this.getAuthHeaders() }
    );
  }

  createContractPaymentMethod(contractId: number, paymentData: CreatePaymentMethodRequest): Observable<any> {
    return this.http.post(
      `${this.API_URL}/contracts/${contractId}/payment-methods`,
      paymentData,
      { headers: this.getAuthHeaders() }
    );
  }

  updatePaymentMethod(id: number, paymentData: Partial<CreatePaymentMethodRequest>): Observable<any> {
    return this.http.put(
      `${this.API_URL}/payment-methods/${id}`,
      paymentData,
      { headers: this.getAuthHeaders() }
    );
  }

  deletePaymentMethod(id: number): Observable<any> {
    return this.http.delete(
      `${this.API_URL}/payment-methods/${id}`,
      { headers: this.getAuthHeaders() }
    );
  }

  reorderContractPaymentMethods(contractId: number, paymentMethodIds: number[]): Observable<any> {
    return this.http.post(
      `${this.API_URL}/contracts/${contractId}/payment-methods/reorder`,
      { payment_method_ids: paymentMethodIds },
      { headers: this.getAuthHeaders() }
    );
  }

  validateContractPercentages(contractId: number): Observable<ValidationResponse> {
    return this.http.get<ValidationResponse>(
      `${this.API_URL}/contracts/${contractId}/payment-methods/validate`,
      { headers: this.getAuthHeaders() }
    );
  }

  // Proposals use single payment method only - no multiple payment methods service

  // Utility methods
  getPaymentMethodOptions(): string[] {
    return [
      'Dinheiro',
      'PIX',
      'Transferência Bancária',
      'Cartão de Débito',
      'Cartão de Crédito',
      'Boleto',
      'Cheque',
      'Permuta/Troca',
      'Outros'
    ];
  }

  formatValue(value: number | null | undefined): string {
    if (!value) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  calculateFixedValue(totalValue: number, percentage: number): number {
    return (totalValue * percentage) / 100;
  }
}