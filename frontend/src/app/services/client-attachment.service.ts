import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ClientAttachment {
  id: number;
  client_id: number;
  file_name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: number;
  uploaded_at: string;
  updated_at: string;
  is_active: boolean;
  uploader_name?: string;
  uploader_id?: number;
}

export interface ClientAttachmentUploadResponse {
  success: boolean;
  attachment?: ClientAttachment;
  error?: string;
}

export interface ClientAttachmentUploadProgress {
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  attachment?: ClientAttachment;
  error?: string;
}

export interface ClientAttachmentsResponse {
  success: boolean;
  attachments: ClientAttachment[];
}

@Injectable({
  providedIn: 'root'
})
export class ClientAttachmentService {
  private apiUrl = `${environment.apiUrl}/client-attachments`;

  // Tipos de arquivo permitidos
  private allowedTypes = [
    // Imagens
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documentos
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Texto
    'text/plain',
    'text/csv',
    // Comprimidos
    'application/zip',
    'application/x-rar-compressed'
  ];

  // Tamanho máximo: 25MB
  private maxFileSize = 25 * 1024 * 1024;

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
   * Valida se o arquivo pode ser enviado
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'Nenhum arquivo selecionado' };
    }

    if (file.size > this.maxFileSize) {
      return { valid: false, error: 'Arquivo muito grande. Tamanho máximo: 25MB' };
    }

    if (!this.allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Tipo de arquivo não permitido. Tipos permitidos: imagens, PDF, Word, Excel, PowerPoint, texto, ZIP' 
      };
    }

    return { valid: true };
  }

  /**
   * Faz upload de um arquivo para um cliente
   */
  uploadFile(clientId: number, file: File): Observable<ClientAttachmentUploadProgress> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      return new Observable(observer => {
        observer.next({
          progress: 0,
          status: 'error',
          error: validation.error
        });
        observer.complete();
      });
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', clientId.toString());

    return this.http.post<ClientAttachmentUploadResponse>(
      `${this.apiUrl}/upload`,
      formData,
      {
        headers: this.getAuthHeaders(),
        reportProgress: true,
        observe: 'events'
      }
    ).pipe(
      map((event: HttpEvent<ClientAttachmentUploadResponse>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const progress = Math.round(100 * event.loaded / (event.total || 1));
          return {
            progress,
            status: 'uploading' as const
          };
        } else if (event.type === HttpEventType.Response) {
          if (event.body?.success) {
            return {
              progress: 100,
              status: 'completed' as const,
              attachment: event.body.attachment
            };
          } else {
            return {
              progress: 0,
              status: 'error' as const,
              error: event.body?.error || 'Erro ao fazer upload'
            };
          }
        }
        return {
          progress: 0,
          status: 'uploading' as const
        };
      })
    );
  }

  /**
   * Lista anexos de um cliente
   */
  getClientAttachments(clientId: number): Observable<ClientAttachmentsResponse> {
    return this.http.get<ClientAttachmentsResponse>(
      `${this.apiUrl}/client/${clientId}`,
      { headers: this.getAuthHeaders() }
    );
  }


  /**
   * Remove um anexo
   */
  deleteAttachment(attachmentId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/${attachmentId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Gera URL para download de um anexo
   */
  getDownloadUrl(attachmentId: number): string {
    return `${this.apiUrl}/download/${attachmentId}`;
  }

  /**
   * Gera URL para visualização de um anexo
   */
  getViewUrl(attachmentId: number): string {
    return `${this.apiUrl}/view/${attachmentId}`;
  }

  /**
   * Faz download de um anexo
   */
  downloadAttachment(attachmentId: number, filename: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/download/${attachmentId}`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob'
    });
  }

  /**
   * Inicia download automático do arquivo
   */
  downloadFile(attachmentId: number, filename: string): void {
    this.downloadAttachment(attachmentId, filename).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }

  /**
   * Formata o tamanho do arquivo para exibição
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Obtém o ícone baseado no tipo de arquivo
   */
  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) {
      return 'fas fa-image';
    } else if (mimeType === 'application/pdf') {
      return 'fas fa-file-pdf';
    } else if (mimeType.includes('word')) {
      return 'fas fa-file-word';
    } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return 'fas fa-file-excel';
    } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
      return 'fas fa-file-powerpoint';
    } else if (mimeType.startsWith('text/')) {
      return 'fas fa-file-alt';
    } else if (mimeType.includes('zip') || mimeType.includes('rar')) {
      return 'fas fa-file-archive';
    } else {
      return 'fas fa-file';
    }
  }

  /**
   * Verifica se o arquivo é uma imagem
   */
  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Verifica se o arquivo pode ser visualizado no navegador
   */
  canPreview(mimeType: string): boolean {
    return mimeType.startsWith('image/') || 
           mimeType === 'application/pdf' ||
           mimeType.startsWith('text/');
  }

}