import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ServiceCommentAttachment {
  id: number;
  comment_id: number;
  file_name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: number;
  uploaded_at: string;
  is_active: boolean;
  uploader?: {
    id: number;
    name: string;
  };
}

export interface AttachmentUploadResponse {
  success: boolean;
  attachment?: ServiceCommentAttachment;
  error?: string;
}

export interface AttachmentUploadProgress {
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  attachment?: ServiceCommentAttachment;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AttachmentService {
  private apiUrl = `${environment.apiUrl}/attachments`;

  // Tipos de arquivo permitidos
  private allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];

  // Tamanho máximo: 50MB
  private maxFileSize = 50 * 1024 * 1024;

  constructor(private http: HttpClient) {}

  /**
   * Valida se o arquivo pode ser enviado
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: 'Nenhum arquivo selecionado' };
    }

    if (file.size > this.maxFileSize) {
      return { valid: false, error: 'Arquivo muito grande. Tamanho máximo: 50MB' };
    }

    if (!this.allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Tipo de arquivo não permitido. Tipos permitidos: imagens, PDF, Word, Excel, texto' 
      };
    }

    return { valid: true };
  }

  /**
   * Faz upload de um arquivo para um comentário
   */
  uploadFile(commentId: number, file: File): Observable<AttachmentUploadProgress> {
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
    formData.append('comment_id', commentId.toString());

    return this.http.post<AttachmentUploadResponse>(
      `${this.apiUrl}/upload`,
      formData,
      {
        reportProgress: true,
        observe: 'events'
      }
    ).pipe(
      map((event: HttpEvent<AttachmentUploadResponse>) => {
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
   * Lista anexos de um comentário
   */
  getCommentAttachments(commentId: number): Observable<{ attachments: ServiceCommentAttachment[] }> {
    return this.http.get<{ attachments: ServiceCommentAttachment[] }>(
      `${this.apiUrl}/comment/${commentId}`
    );
  }

  /**
   * Remove um anexo
   */
  deleteAttachment(attachmentId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/${attachmentId}`
    );
  }

  /**
   * Gera URL para download de um anexo
   */
  getDownloadUrl(attachmentId: number): string {
    return `${this.apiUrl}/download/${attachmentId}`;
  }

  /**
   * Faz download de um anexo
   */
  downloadAttachment(attachmentId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/download/${attachmentId}`, {
      responseType: 'blob'
    });
  }

  /**
   * Obtém informações de um anexo específico
   */
  getAttachment(attachmentId: number): Observable<{ attachment: ServiceCommentAttachment }> {
    return this.http.get<{ attachment: ServiceCommentAttachment }>(
      `${this.apiUrl}/${attachmentId}`
    );
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
    } else if (mimeType.startsWith('text/')) {
      return 'fas fa-file-alt';
    } else {
      return 'fas fa-file';
    }
  }

  /**
   * Verifica se o arquivo é uma imagem
   */
}