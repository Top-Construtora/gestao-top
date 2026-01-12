import { Component, Input, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientAttachmentService, ClientAttachment } from '../../services/client-attachment.service';
import { AuthService } from '../../services/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-client-attachments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-attachments.component.html',
  styleUrls: ['./client-attachments.component.css']
})
export class ClientAttachmentsComponent implements OnInit, OnDestroy {
  @Input() clientId!: number;
  @Input() clientName: string = '';
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private clientAttachmentService = inject(ClientAttachmentService);
  private authService = inject(AuthService);
  private subscriptions = new Subscription();

  attachments: ClientAttachment[] = [];
  isLoading = false;
  isUploading = false;
  uploadProgress = 0;
  error = '';

  // Multi-file upload data
  selectedFiles: File[] = [];
  dragOver = false;
  currentUploadIndex = 0;
  totalUploads = 0;
  currentUploadingFile = '';

  ngOnInit(): void {
    if (this.clientId) {
      this.loadAttachments();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadAttachments(): void {
    this.isLoading = true;
    this.error = '';

    const subscription = this.clientAttachmentService.getClientAttachments(this.clientId)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.attachments = response.attachments;
          } else {
            this.error = 'Erro ao carregar anexos';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Erro ao carregar anexos:', err);
          this.error = 'Erro ao carregar anexos';
          this.isLoading = false;
        }
      });

    this.subscriptions.add(subscription);
  }

  // File handling
  onFileSelected(event: any): void {
    const files = Array.from(event.target.files) as File[];
    this.processAndUploadFiles(files);
  }

  processAndUploadFiles(files: File[]): void {
    console.log('Processando arquivos:', files.length);
    
    // Validar arquivos
    const validFiles: File[] = [];
    for (const file of files) {
      const validation = this.clientAttachmentService.validateFile(file);
      if (!validation.valid) {
        this.error = `Erro no arquivo "${file.name}": ${validation.error || 'Arquivo inválido'}`;
        setTimeout(() => this.error = '', 3000); // Limpar erro após 3 segundos
        continue;
      }
      validFiles.push(file);
    }

    // Se houver arquivos válidos, fazer upload imediatamente
    if (validFiles.length > 0) {
      this.selectedFiles = validFiles;
      this.uploadAllFiles();
    }
    
    // Limpar input para permitir novo upload
    this.resetFileInput();
  }

  private resetFileInput(): void {
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // Drag and drop
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.isUploading) {
      this.dragOver = true;
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;

    // Não permitir drop durante upload
    if (this.isUploading) {
      console.log('⚠️ Upload em andamento, aguarde...');
      return;
    }

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files) as File[];
      this.processAndUploadFiles(fileArray);
    }
  }

  // Upload multiple files
  uploadAllFiles(): void {
    if (this.selectedFiles.length === 0) {
      return;
    }

    // Prevenir uploads simultâneos
    if (this.isUploading) {
      console.log('⚠️ Upload já em andamento');
      return;
    }

    this.isUploading = true;
    this.error = '';
    this.currentUploadIndex = 0;
    this.totalUploads = this.selectedFiles.length;
    this.uploadProgress = 0;

    console.log(`🚀 Iniciando upload de ${this.totalUploads} arquivo(s)`);
    this.uploadNextFile();
  }

  private uploadNextFile(): void {
    if (this.currentUploadIndex >= this.selectedFiles.length) {
      // Todos os arquivos foram enviados
      this.finishUpload();
      return;
    }

    const currentFile = this.selectedFiles[this.currentUploadIndex];
    this.currentUploadingFile = currentFile.name;
    
    console.log(`Enviando arquivo ${this.currentUploadIndex + 1}/${this.totalUploads}: ${currentFile.name}`);

    const subscription = this.clientAttachmentService.uploadFile(
      this.clientId,
      currentFile
    ).subscribe({
      next: (progress) => {
        // Calcular progresso geral
        const fileProgress = progress.progress;
        const overallProgress = ((this.currentUploadIndex * 100) + fileProgress) / this.totalUploads;
        this.uploadProgress = Math.round(overallProgress);
        
        if (progress.status === 'completed') {
          this.currentUploadIndex++;
          
          // Upload do próximo arquivo
          setTimeout(() => {
            this.uploadNextFile();
          }, 200);
          
        } else if (progress.status === 'error') {
          this.error = `Erro ao enviar "${currentFile.name}": ${progress.error || 'Erro desconhecido'}`;
          this.isUploading = false;
          console.error('Erro no upload do arquivo:', currentFile.name, progress.error);
        }
      },
      error: (err) => {
        console.error('Erro no upload do arquivo:', currentFile.name, err);
        this.error = `Erro ao enviar "${currentFile.name}"`;
        this.isUploading = false;
      }
    });

    this.subscriptions.add(subscription);
  }

  private finishUpload(): void {
    this.isUploading = false;
    this.uploadProgress = 100;
    this.currentUploadingFile = '';
    
    console.log('🎉 Todos os arquivos foram enviados!');
    
    // Recarregar lista de anexos
    this.loadAttachments();
    
    // Limpar tudo imediatamente
    this.selectedFiles = [];
    this.uploadProgress = 0;
    this.currentUploadIndex = 0;
    this.totalUploads = 0;
    
    // Resetar input para permitir novo upload
    this.resetFileInput();
  }


  // Delete
  deleteAttachment(attachment: ClientAttachment): void {
    if (!confirm(`Deseja realmente excluir o arquivo "${attachment.original_name}"?`)) {
      return;
    }

    const subscription = this.clientAttachmentService.deleteAttachment(attachment.id)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.loadAttachments();
          } else {
            this.error = response.message || 'Erro ao excluir anexo';
          }
        },
        error: (err) => {
          console.error('Erro ao excluir anexo:', err);
          this.error = 'Erro ao excluir anexo';
        }
      });

    this.subscriptions.add(subscription);
  }

  // Download
  downloadAttachment(attachment: ClientAttachment): void {
    this.clientAttachmentService.downloadFile(attachment.id, attachment.original_name);
  }

  // View
  viewAttachment(attachment: ClientAttachment): void {
    if (this.clientAttachmentService.canPreview(attachment.mime_type)) {
      const url = this.clientAttachmentService.getViewUrl(attachment.id);
      window.open(url, '_blank');
    } else {
      this.downloadAttachment(attachment);
    }
  }

  // Permissions
  canDeleteAttachment(attachment: ClientAttachment): boolean {
    return this.authService.isAdmin() || attachment.uploaded_by === this.authService.getUser()?.id;
  }

  // Utility methods
  getFileIcon(attachment: ClientAttachment): string {
    return this.clientAttachmentService.getFileIcon(attachment.mime_type);
  }

  getFileIconFromMimeType(mimeType: string): string {
    return this.clientAttachmentService.getFileIcon(mimeType);
  }

  formatFileSize(size: number): string {
    return this.clientAttachmentService.formatFileSize(size);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR') + ' às ' + date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}