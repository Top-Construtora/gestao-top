import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReportRequest {
  companyId?: string;
  serviceId?: string;
  clientId?: string | number;
  contractId?: string;
  format: 'pdf' | 'excel';
  startDate?: string;
  endDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private apiUrl = `${environment.apiUrl}/reports`;

  constructor(private http: HttpClient) {}

  generateMonthlyReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/monthly`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateClientReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/by-client`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateServicesReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/services`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateFinancialReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/financial`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateServiceRoutinesReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/service-routines`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  // R&S Reports
  generateRsGeneralReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/rs/general`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateRsClientReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/rs/by-client`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateRsConsultoraReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/rs/by-consultora`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateRsOpenVacanciesReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/rs/open-vacancies`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateRsIndividualReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/rs/individual`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateCommercialReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/commercial`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  generateActiveClientsReport(data: ReportRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/active-clients`, data, {
      responseType: 'blob',
      headers: this.getHeaders()
    });
  }

  // Método para buscar vagas por cliente
  getVagasByClient(clientId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/vagas/by-client/${clientId}`, {
      headers: this.getHeaders()
    });
  }

  // Método auxiliar para download do arquivo
  downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }
}