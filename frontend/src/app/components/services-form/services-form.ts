import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ServiceService, CreateServiceRequest, UpdateServiceRequest } from '../../services/service';
import { ServiceStageService, CreateServiceStageRequest } from '../../services/service-stage.service';
import { ModalService } from '../../services/modal.service';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { setBlockType } from 'prosemirror-commands';

interface ServiceStageForm {
  name: string;
  description?: string;
  category?: string;
  sort_order: number;
  error?: string;
  id?: number; // ID opcional para etapas existentes
}

@Component({
  selector: 'app-service-form',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent, NgxEditorModule],
  templateUrl: './services-form.html',
  styleUrls: ['./services-form.css']
})
export class ServiceFormComponent implements OnInit, AfterViewInit, OnDestroy {
  private serviceService = inject(ServiceService);
  private serviceStageService = inject(ServiceStageService);
  private modalService = inject(ModalService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private elementRef = inject(ElementRef);

  editor!: Editor;
  showTitleDropdown = false;
  selectedTitle = 'Normal';
  titleOptions = [
    { label: 'Normal', value: 'p', command: null, icon: 'T' },
    { label: 'Título 1', value: 'h1', command: 1, icon: 'H1' },
    { label: 'Título 2', value: 'h2', command: 2, icon: 'H2' },
    { label: 'Título 3', value: 'h3', command: 3, icon: 'H3' },
    { label: 'Título 4', value: 'h4', command: 4, icon: 'H4' },
    { label: 'Título 5', value: 'h5', command: 5, icon: 'H5' }
  ];

  toolbar: Toolbar = [
    // Formatação de texto
    ['bold', 'italic', 'underline'],
    ['indent', 'outdent'],
    // Listas
    ['ordered_list', 'bullet_list'],
    // Outros
    ['horizontal_rule'],
    ['undo', 'redo'],
  ];

  formData = {
    name: '',
    duration_amount: 30 as number | null,
    duration_unit: 'dias' as 'dias' | 'semanas' | 'meses' | 'encontros' | 'Projeto',
    category: 'Geral',
    description: '',
    subtitle: '',
    summary: '',
    is_active: true
  };

  categories = [
    'Geral',
    'Consultoria',
    'Treinamento',
    'Mentoria',
    'Diagnóstico',
    'Desenvolvimento',
    'Gestão',
    'Estratégia',
    'Engenharia',
    'Recrutamento & Seleção',
    'Interno'
  ];

  isLoading = false;
  isSaving = false;
  isEditMode = false;
  serviceId: number | null = null;
  errors: any = {};
  formSubmitted = false;

  // Service stages properties
  serviceStages: ServiceStageForm[] = [];

  ngOnInit() {
    this.editor = new Editor();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode = true;
      this.serviceId = parseInt(id);
      this.loadService();
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.adjustColumnHeights();
      this.preventToolbarSubmit();
    }, 100);
  }

  private preventToolbarSubmit() {
    // Adiciona listener para prevenir submit dos botões da toolbar
    const toolbarButtons = this.elementRef.nativeElement.querySelectorAll('.NgxEditor__MenuBar button, ngx-editor-menu button');
    toolbarButtons.forEach((button: HTMLButtonElement) => {
      button.type = 'button';
      button.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        // Garante que formSubmitted não seja alterado
        const wasSubmitted = this.formSubmitted;
        setTimeout(() => {
          this.formSubmitted = wasSubmitted;
        }, 0);
      });
    });
  }

  toggleTitleDropdown() {
    this.showTitleDropdown = !this.showTitleDropdown;
  }

  applyTitle(option: any) {
    this.selectedTitle = option.label;
    this.showTitleDropdown = false;

    if (!this.editor) return;

    const state = this.editor.view.state;
    const dispatch = this.editor.view.dispatch;

    if (option.command === null) {
      // Voltar para parágrafo normal
      const { schema } = state;
      const type = schema.nodes['paragraph'];
      if (type) {
        setBlockType(type)(state, dispatch);
      }
    } else {
      // Aplicar heading usando comando direto do prosemirror
      const { schema } = state;
      const type = schema.nodes['heading'];
      if (type) {
        setBlockType(type, { level: option.command })(state, dispatch);
      }
    }
  }



  private adjustColumnHeights() {
    const leftColumn = this.elementRef.nativeElement.querySelector('.left-column');
    if (leftColumn) {
      const leftHeight = leftColumn.offsetHeight;
      this.elementRef.nativeElement.style.setProperty('--left-column-height', `${leftHeight}px`);
    }
  }

  ngOnDestroy() {
    this.editor.destroy();
  }


  async loadService() {
    if (!this.serviceId) return;

    this.isLoading = true;
    try {
      const response = await this.serviceService.getService(this.serviceId).toPromise();
      if (response && response.service) {
        const service = response.service;
        this.formData = {
          name: service.name,
          duration_amount: service.duration_amount || (service.duration_unit === 'Projeto' ? null : 30),
          duration_unit: service.duration_unit as any,
          category: service.category || 'Geral',
          description: service.description || '',
          subtitle: service.subtitle || '',
          summary: service.summary || '',
          is_active: service.is_active
        };

        // Carregar etapas existentes
        await this.loadServiceStages();
      }
    } catch (error) {
      console.error('❌ Error loading service:', error);
      this.modalService.showNotification('Erro ao carregar serviço', false);
      this.router.navigate(['/home/servicos']);
    } finally {
      this.isLoading = false;
    }
  }

  async loadServiceStages() {
    if (!this.serviceId) return;

    try {
      const response = await this.serviceStageService.getCatalogServiceStages(this.serviceId).toPromise();
      if (response && response.stages) {
        // Converter ServiceStage para ServiceStageForm
        this.serviceStages = response.stages.map(stage => ({
          name: stage.name,
          description: stage.description || '',
          category: stage.category || '',
          sort_order: stage.sort_order,
          id: stage.id // Adicionar ID para poder fazer update/delete posteriormente
        } as ServiceStageForm & { id: number }));

      }
    } catch (error) {
      console.error('❌ Error loading service stages:', error);
      // Não mostrar erro para o usuário pois as etapas são opcionais
    }
  }


  validateForm(): boolean {
    this.errors = {};
    if (!this.formData.name || this.formData.name.trim().length < 2) {
      this.errors.name = 'Nome deve ter pelo menos 2 caracteres';
    }
    if (this.formData.duration_unit !== 'Projeto' && (!this.formData.duration_amount || this.formData.duration_amount < 1)) {
      this.errors.duration = 'A duração deve ser de no mínimo 1';
    }
    const descriptionText = this.formData.description.replace(/<[^>]*>/g, '');
    if (descriptionText.length > 10000) {
      this.errors.description = 'A descrição não pode exceder 10000 caracteres.';
    }
    
    // Validar etapas
    const stagesValid = this.validateStages();
    
    return Object.keys(this.errors).length === 0 && stagesValid;
  }

  async save(event?: Event) {
    // Verifica se foi disparado por um botão da toolbar do ngx-editor
    if (event) {
      event.preventDefault();

      // Verifica se o evento veio de um botão da toolbar
      const target = event.target as HTMLElement;
      if (target && (target.closest('.NgxEditor__MenuBar') || target.closest('ngx-editor-menu'))) {
        return;
      }

      // Verifica também o relatedTarget para eventos de submit
      const submitEvent = event as any;
      if (submitEvent.submitter) {
        const button = submitEvent.submitter as HTMLElement;
        if (button.closest('.NgxEditor__MenuBar') || button.closest('ngx-editor-menu')) {
          return;
        }
      }
    }

    this.formSubmitted = true;
    if (!this.validateForm()) {
      this.modalService.showNotification('Por favor, corrija os erros no formulário', false);
      return;
    }

    this.isSaving = true;
    
    try {
      if (this.isEditMode && this.serviceId) {
        const updateData: UpdateServiceRequest = {
          name: this.formData.name,
          duration_amount: this.formData.duration_unit === 'Projeto' ? null : this.formData.duration_amount,
          duration_unit: this.formData.duration_unit,
          category: this.formData.category,
          description: this.formData.description,
          subtitle: this.formData.subtitle || null,
          summary: this.formData.summary || null,
          is_active: this.formData.is_active
        };
        
        await this.serviceService.updateService(this.serviceId, updateData).toPromise();
        
        // Atualizar etapas se é modo de edição
        if (this.serviceStages.length > 0) {
          await this.createServiceStages(this.serviceId);
        }
        
        this.modalService.showNotification('Serviço atualizado com sucesso!', true);
      } else {
        const createData: CreateServiceRequest = {
          name: this.formData.name,
          duration_amount: this.formData.duration_unit === 'Projeto' ? null : this.formData.duration_amount,
          duration_unit: this.formData.duration_unit,
          category: this.formData.category,
          description: this.formData.description,
          subtitle: this.formData.subtitle || null,
          summary: this.formData.summary || null
        };
        
        const response = await this.serviceService.createService(createData).toPromise();
        
        // Se há etapas definidas, criar as etapas após criar o serviço
        if (response?.service?.id && this.serviceStages.length > 0) {
          await this.createServiceStages(response.service.id);
        }
        
        this.modalService.showNotification('Serviço criado com sucesso!', true);
      }
      
      window.dispatchEvent(new CustomEvent('refreshServices'));
      
      this.router.navigate(['/home/servicos']);
    } catch (error: any) {
      console.error('❌ Error saving service:', error);
      const errorMessage = error?.error?.error || 'Erro ao salvar serviço';
      this.modalService.showNotification(errorMessage, false);
    } finally {
      this.isSaving = false;
    }
  }

  cancel() {
    this.router.navigate(['/home/servicos']);
  }

  onDurationUnitChange() {
    if (this.formData.duration_unit === 'Projeto') {
      this.formData.duration_amount = null;
    } else if (!this.formData.duration_amount) {
      this.formData.duration_amount = 30;
    }
  }

  getFormattedDuration(): string {
    return this.serviceService.formatDuration(this.formData.duration_amount, this.formData.duration_unit);
  }

  get descriptionTextLength(): number {
      return this.formData.description.replace(/<[^>]*>/g, '').length;
  }

  // Service stages methods
  addStage() {
    this.serviceStages.push({
      name: '',
      description: '',
      category: '',
      sort_order: this.serviceStages.length + 1
    });
    setTimeout(() => this.adjustColumnHeights(), 50);
  }

  async removeStage(index: number) {
    const stageToRemove = this.serviceStages[index];
    
    // Se a etapa tem ID, significa que existe no backend e precisa ser deletada
    if (stageToRemove.id && this.isEditMode) {
      try {
        await this.serviceStageService.deleteStage(stageToRemove.id).toPromise();
      } catch (error) {
        console.error('❌ Error deleting stage:', error);
        this.modalService.showNotification('Erro ao remover etapa', false);
        return; // Não remove da interface se falhou no backend
      }
    }
    
    this.serviceStages.splice(index, 1);
    // Reordenar sort_order
    this.serviceStages.forEach((stage, i) => {
      stage.sort_order = i + 1;
    });
    setTimeout(() => this.adjustColumnHeights(), 50);
  }


  validateStages(): boolean {
    let hasError = false;
    
    this.serviceStages.forEach(stage => {
      stage.error = undefined;
      if (!stage.name || stage.name.trim().length < 2) {
        stage.error = 'Nome da etapa deve ter pelo menos 2 caracteres';
        hasError = true;
      }
    });
    
    return !hasError;
  }

  async createServiceStages(serviceId: number) {
    if (this.serviceStages.length === 0) return;

    try {
      for (const stage of this.serviceStages) {
        if (stage.id) {
          // Etapa existente - atualizar
          const updateData = {
            name: stage.name.trim(),
            description: stage.description?.trim() || null,
            category: stage.category?.trim() || null,
            sort_order: stage.sort_order
          };

          await this.serviceStageService.updateStage(stage.id, updateData).toPromise();
        } else {
          // Nova etapa - criar
          const stageData: CreateServiceStageRequest = {
            service_id: serviceId,
            name: stage.name.trim(),
            description: stage.description?.trim() || null,
            category: stage.category?.trim() || null,
            sort_order: stage.sort_order
          };

          await this.serviceStageService.createStage(stageData).toPromise();
        }
      }
    } catch (error) {
      console.error('Error processing service stages:', error);
      this.modalService.showNotification('Erro ao salvar algumas etapas do serviço', false);
      throw error;
    }
  }

  insertTemplate() {
    const template = `<h3>Objetivos</h3>
<p>Descreva os principais objetivos do serviço...</p>

<h3>Metodologia</h3>
<p>Explique a metodologia que será aplicada...</p>

<h3>Benefícios Esperados</h3>
<ul>
<li>Benefício 1</li>
<li>Benefício 2</li>
<li>Benefício 3</li>
</ul>

<h3>Público-alvo</h3>
<p>Indique para quem este serviço é direcionado...</p>

<h3>Resultados e Entregáveis</h3>
<p>Liste os principais resultados e entregáveis do serviço...</p>`;

    this.formData.description = template;
    this.modalService.showNotification('Template inserido com sucesso!', true);
  }

}