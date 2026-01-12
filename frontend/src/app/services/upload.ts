import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UploadResponse {
  success: boolean;
  message: string;
  file?: {
    filename: string;
    originalName: string;
    size: number;
    mimetype: string;
    url: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private readonly API_URL = `${environment.apiUrl}/upload`;

  constructor(private http: HttpClient) {}

  /**
   * Obter headers com autorização
   */
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  /**
   * Upload de logo do cliente
   */
  uploadClientLogo(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('logo', file);

    return this.http.post<UploadResponse>(`${this.API_URL}/client-logo`, formData, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Deletar logo do cliente
   */
  deleteClientLogo(filename: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/client-logo/${filename}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Listar logos dos clientes
   */
  listClientLogos(): Observable<any> {
    return this.http.get(`${this.API_URL}/client-logos`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Obter URL completa do arquivo
   */
  getFileUrl(relativeUrl: string): string {
    if (relativeUrl && relativeUrl.startsWith('/')) {
      return environment.apiUrl.replace('/api', '') + relativeUrl;
    }
    return relativeUrl || '';
  }

  /**
   * Validar arquivo de imagem
   */
  validateImageFile(file: File): { valid: boolean; message?: string } {
    // Verificar tamanho (5MB máximo)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return {
        valid: false,
        message: 'Arquivo muito grande. Tamanho máximo permitido: 5MB'
      };
    }

    // Verificar tipo MIME
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        message: 'Tipo de arquivo não suportado. Use apenas imagens (JPEG, PNG, GIF, WebP, SVG)'
      };
    }

    return { valid: true };
  }
}