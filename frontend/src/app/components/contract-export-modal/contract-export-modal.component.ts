import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractExportService } from '../../services/contract-export.service';

export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  type: 'PJ';
  service: string;
}

@Component({
  selector: 'app-contract-export-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contract-export-modal.component.html',
  styleUrls: ['./contract-export-modal.component.css']
})
export class ContractExportModalComponent {
  @Input() isVisible = false;
  @Input() contract: any = null;
  @Output() onClose = new EventEmitter<void>();

  private exportService = inject(ContractExportService);

  templates: ContractTemplate[] = [
    {
      id: 'consultoria-pj',
      name: 'Contrato 1',
      description: 'Contrato para consultoria corporativa. Inclui diagnostico organizacional, analises e devolutivas.',
      type: 'PJ',
      service: 'Consultoria Corporativa'
    },
    {
      id: 'consultoria-individual',
      name: 'Contrato 2',
      description: 'Contrato para mentoria e consultoria individual. Inclui avaliacoes e testes especificos.',
      type: 'PJ',
      service: 'Mentoria/Consultoria Individual'
    },
    {
      id: 'recrutamento',
      name: 'Contrato 3',
      description: 'Contrato especializado em servicos de R&S. Inclui processo completo desde levantamento ate selecao final.',
      type: 'PJ',
      service: 'Recrutamento e Selecao'
    }
  ];

  selectedTemplateId: string | null = null;
  isExporting = false;

  closeModal() {
    this.onClose.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  selectTemplate(templateId: string) {
    this.selectedTemplateId = templateId;
  }

  async exportSelected(format: 'docx' | 'pdf') {
    if (!this.contract || !this.selectedTemplateId) return;

    this.isExporting = true;
    
    try {
      if (format === 'docx') {
        await this.exportService.exportToDocx(this.contract, this.selectedTemplateId);
      } else {
        await this.exportService.exportToPdf(this.contract, this.selectedTemplateId);
      }
      // Fechar modal após exportação bem-sucedida
      this.closeModal();
    } catch (error) {
      console.error('Erro ao exportar contrato:', error);
      alert('Erro ao exportar contrato. Tente novamente.');
    } finally {
      this.isExporting = false;
    }
  }

  async exportContract(templateId: string, format: 'docx' | 'pdf') {
    if (!this.contract) return;

    this.isExporting = true;
    
    try {
      if (format === 'docx') {
        await this.exportService.exportToDocx(this.contract, templateId);
      } else {
        await this.exportService.exportToPdf(this.contract, templateId);
      }
    } catch (error) {
      console.error('Erro ao exportar contrato:', error);
      alert('Erro ao exportar contrato. Tente novamente.');
    } finally {
      this.isExporting = false;
    }
  }

  getTemplateIcon(templateId: string): string {
    switch (templateId) {
      case 'consultoria-pj': return 'fas fa-building';
      case 'consultoria-pf': return 'fas fa-user';
      case 'recrutamento': return 'fas fa-users';
      default: return 'fas fa-file-contract';
    }
  }
}