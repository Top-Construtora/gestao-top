import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceService, ApiService } from '../../services/service';
import { ModalService } from '../../services/modal.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-duplicate-service-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './duplicate-service-modal.html',
  styleUrls: ['./duplicate-service-modal.css']
})
export class DuplicateServiceModalComponent implements OnInit {
  @Input() service: ApiService | null = null;
  @Input() show: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() serviceDuplicated = new EventEmitter<any>();

  private serviceService = inject(ServiceService);
  private modalService = inject(ModalService);

  // Dados do novo serviço
  duplicateData = {
    name: '',
    category: '',
    duration_amount: null as number | null,
    duration_unit: 'dias' as 'dias' | 'semanas' | 'meses' | 'encontros' | 'Projeto'
  };

  isDuplicating = false;

  categories = [
    'Consultoria',
    'Treinamento',
    'Mentoria',
    'Diagnóstico',
    'Desenvolvimento',
    'Gestão',
    'Estratégia',
    'Recrutamento & Seleção',
    'Geral',
    'Interno'
  ];

  durationUnits = [
    { value: 'dias', label: 'Dias' },
    { value: 'semanas', label: 'Semanas' },
    { value: 'meses', label: 'Meses' },
    { value: 'encontros', label: 'Encontros' },
    { value: 'Projeto', label: 'Projeto' }
  ];

  ngOnInit() {
    if (this.show) {
      this.initializeDuplicateData();
    }
  }

  ngOnChanges() {
    if (this.show) {
      this.initializeDuplicateData();
    }
  }

  private initializeDuplicateData() {
    if (this.service) {
      // Pré-preencher com dados do serviço original
      this.duplicateData.name = `${this.service.name} (Cópia)`;
      this.duplicateData.category = this.service.category || 'Geral';
      this.duplicateData.duration_amount = this.service.duration_amount;
      this.duplicateData.duration_unit = this.service.duration_unit as any;
    }
  }

  closeModal() {
    this.close.emit();
    this.resetForm();
  }

  private resetForm() {
    this.duplicateData = {
      name: '',
      category: '',
      duration_amount: null,
      duration_unit: 'dias'
    };
  }

  async duplicateService() {
    if (!this.service) {
      this.modalService.showError('Nenhum serviço selecionado para duplicar');
      return;
    }

    // Validar campos obrigatórios
    if (!this.duplicateData.name || this.duplicateData.name.trim() === '') {
      this.modalService.showError('Por favor, informe o nome do serviço');
      return;
    }

    if (!this.duplicateData.category) {
      this.modalService.showError('Por favor, selecione a categoria');
      return;
    }

    if (this.duplicateData.duration_unit !== 'Projeto' && !this.duplicateData.duration_amount) {
      this.modalService.showError('Por favor, informe a duração do serviço');
      return;
    }

    this.isDuplicating = true;

    try {
      // Preparar dados para duplicação
      const duplicatePayload = {
        ...this.duplicateData
      };

      const response = await firstValueFrom(
        this.serviceService.duplicateService(this.service.id, duplicatePayload)
      );

      if (response && response.service) {
        this.modalService.showSuccess('Serviço duplicado com sucesso!');
        this.serviceDuplicated.emit(response.service);
        this.closeModal();
      } else {
        this.modalService.showError(response?.message || 'Erro ao duplicar serviço');
      }
    } catch (error: any) {
      console.error('Erro ao duplicar serviço:', error);
      this.modalService.showError(error?.error?.error || 'Erro ao duplicar serviço');
    } finally {
      this.isDuplicating = false;
    }
  }

  // Métodos auxiliares para o template
  isFormValid(): boolean {
    const hasName = !!(this.duplicateData.name && this.duplicateData.name.trim() !== '');
    const hasCategory = !!this.duplicateData.category;
    const hasDuration = this.duplicateData.duration_unit === 'Projeto' || !!this.duplicateData.duration_amount;

    return hasName && hasCategory && hasDuration;
  }

  onDurationUnitChange() {
    // Se mudar para 'Projeto', limpar a duração
    if (this.duplicateData.duration_unit === 'Projeto') {
      this.duplicateData.duration_amount = null;
    }
  }

  getCategoryIcon(category: string): string {
    const iconMap: { [key: string]: string } = {
      'Consultoria': 'fas fa-comments',
      'Treinamento': 'fas fa-chalkboard-teacher',
      'Mentoria': 'fas fa-user-tie',
      'Diagnóstico': 'fas fa-stethoscope',
      'Desenvolvimento': 'fas fa-line-chart',
      'Gestão': 'fas fa-tasks',
      'Estratégia': 'fas fa-bullseye',
      'Recrutamento & Seleção': 'fas fa-users',
      'Geral': 'far fa-sticky-note',
      'Interno': 'fas fa-file-contract'
    };
    return iconMap[category] || 'fas fa-concierge-bell';
  }

  formatDuration(amount: number | null, unit: string): string {
    return this.serviceService.formatDuration(amount, unit);
  }
}
