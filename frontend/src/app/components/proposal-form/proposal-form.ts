import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CurrencyMaskDirective } from '../../directives/currency-mask.directive';
import { DocumentMaskDirective } from '../../directives/document-mask.directive';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Subject, takeUntil, forkJoin, BehaviorSubject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';

import { ProposalService, CreateProposalData, Proposal } from '../../services/proposal';
import { ClientService, ApiClient, CreateClientRequest } from '../../services/client';
import { ServiceService, ApiService } from '../../services/service';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';

interface SelectedService {
  service_id: number;
  id: number;
  name: string;
  unit_value: number;
  total_value: number;
  duration: number | null;
  duration_unit: string | null;
  category: string;
  _uniqueId?: string; // ID único para controle interno
}

@Component({
  selector: 'app-proposal-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyMaskDirective, DocumentMaskDirective, BreadcrumbComponent],
  templateUrl: './proposal-form.html',
  styleUrls: ['./proposal-form.css'],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(-10px)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(-10px)', opacity: 0 }))
      ])
    ])
  ]
})
export class ProposalFormComponent implements OnInit, OnDestroy {
  @Input() proposalId?: number;
  @Input() isModal = false;
  @Output() onSave = new EventEmitter<Proposal>();
  @Output() onCancel = new EventEmitter<void>();

  proposalForm!: FormGroup;
  clients: ApiClient[] = [];
  services: ApiService[] = [];
  selectedServices: SelectedService[] = [];
  availableServices: ApiService[] = [];
  showServiceModal = false;
  serviceSearchTerm = '';
  serviceCategoryFilter = '';
  isLoading = false;
  isSubmitting = false;
  isEditMode = false;
  showNewClientForm = false;
  newClientForm!: FormGroup;

  // Observable para valor total reativo
  private totalValue$ = new BehaviorSubject<number>(0);
  updateCounter: number = 0;
  isCreatingClient: boolean = false;
  private isLoadingData: boolean = false; // Flag para evitar recálculos durante carregamento

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private proposalService: ProposalService,
    private clientService: ClientService,
    private serviceService: ServiceService,
    private toastr: ToastrService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForms();
  }

  ngOnInit(): void {
    this.loadInitialData();

    // Verificar se há ID na rota (para edit/view mode)
    const routeId = this.route.snapshot.paramMap.get('id');
    if (routeId || this.proposalId) {
      this.proposalId = this.proposalId || parseInt(routeId!, 10);
      this.isEditMode = true;
      this.loadProposal();
    }

    // Adicionar listeners para conversão entre valor e porcentagem
    // IMPORTANTE: Adicionar delay apenas se estiver em modo de edição
    if (this.isEditMode) {
      setTimeout(() => {
        this.setupDiscountListeners();
      }, 500); // Delay para garantir que os dados sejam carregados primeiro
    } else {
      this.setupDiscountListeners();
    }

    // Listener para checkbox de usar valor global
    this.proposalForm.get('usar_valor_global')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(usarValorGlobal => {
        const valorGlobalControl = this.proposalForm.get('valor_global');
        if (usarValorGlobal) {
          valorGlobalControl?.setValidators([Validators.required, Validators.min(0)]);
        } else {
          valorGlobalControl?.setValidators([Validators.min(0)]);
          valorGlobalControl?.setValue(null);
        }
        valorGlobalControl?.updateValueAndValidity();
        this.updateTotalValue();
      });

    // Listener para campo de valor global
    this.proposalForm.get('valor_global')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.proposalForm.get('usar_valor_global')?.value) {
          this.updateTotalValue();

          // Recalcular valores de desconto baseados no novo valor global
          if (!this.isLoadingData && !this.isUpdatingDiscounts) {
            const vistaPercentage = this.proposalForm.get('vista_discount_percentage')?.value;
            const prazoPercentage = this.proposalForm.get('prazo_discount_percentage')?.value;

            if (vistaPercentage !== null && vistaPercentage !== undefined) {
              this.updateVistaDiscountValue(vistaPercentage);
            }

            if (prazoPercentage !== null && prazoPercentage !== undefined) {
              this.updatePrazoDiscountValue(prazoPercentage);
            }
          }
        }
      });

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForms(): void {
    this.proposalForm = this.fb.group({
      client_id: ['', Validators.required],
      type: ['Full', Validators.required],
      end_date: [''],
      observations: [''],
      max_installments: [12, [Validators.required, Validators.min(1), Validators.max(24)]],
      vista_discount_percentage: [6, [Validators.required, Validators.min(0), Validators.max(100)]],
      prazo_discount_percentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      vista_discount_value: [0, [Validators.required, Validators.min(0)]],
      prazo_discount_value: [0, [Validators.required, Validators.min(0)]],
      status: ['draft'], // Campo de status adicionado
      solicitante_name: [''],
      solicitante_email: ['', Validators.email],
      solicitante_phone: [''],
      source: [''], // Fonte da proposta: Indicação, Site, Já era cliente, etc.
      usar_valor_global: [false], // Checkbox para usar valor global
      valor_global: [null, [Validators.min(0)]] // Valor global fixo
    });

    this.newClientForm = this.fb.group({
      client_type: ['pj'],
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      cnpj: ['', Validators.required],
      trade_name: ['']
    });

    // Não adiciona serviço vazio - agora é via modal
  }

  private loadInitialData(): void {
    this.isLoading = true;
    
    forkJoin({
      clients: this.clientService.getClients({}),
      services: this.serviceService.getServicesForContracts({ is_active: true })
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.clients = (data.clients.clients || []).sort((a, b) => 
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
        // Filtrar apenas serviços ativos e ordenar alfabeticamente
        this.services = (data.services.services || [])
          .filter(service => service.is_active)
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        this.availableServices = [...this.services];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar dados:', error);
        this.toastr.error('Erro ao carregar dados necessários');
        this.isLoading = false;
      }
    });
  }

  private loadProposal(): void {
    if (!this.proposalId) return;

    this.proposalService.getProposal(this.proposalId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.populateForm(response.data);
          }
        },
        error: (error) => {
          console.error('Erro ao carregar proposta:', error);
          this.toastr.error('Erro ao carregar proposta');
        }
      });
  }

  private populateForm(proposal: Proposal): void {
    // Debug: verificar valores recebidos
    console.log('🔍 Valores de desconto recebidos:', {
      vista_discount_percentage: proposal.vista_discount_percentage,
      prazo_discount_percentage: proposal.prazo_discount_percentage,
      vista_discount_value: proposal.vista_discount_value,
      prazo_discount_value: proposal.prazo_discount_value
    });

    // Desabilitar listeners temporariamente durante o carregamento
    this.isLoadingData = true;

    this.proposalForm.patchValue({
      client_id: proposal.client_id,
      type: proposal.type || 'Full',
      end_date: proposal.end_date ? proposal.end_date.split('T')[0] : '',
      observations: proposal.notes || '',
      max_installments: proposal.max_installments ?? 12,
      vista_discount_percentage: proposal.vista_discount_percentage !== null && proposal.vista_discount_percentage !== undefined ? proposal.vista_discount_percentage : 6,
      prazo_discount_percentage: proposal.prazo_discount_percentage !== null && proposal.prazo_discount_percentage !== undefined ? proposal.prazo_discount_percentage : 0,
      vista_discount_value: proposal.vista_discount_value !== null && proposal.vista_discount_value !== undefined ? proposal.vista_discount_value : 0,
      prazo_discount_value: proposal.prazo_discount_value !== null && proposal.prazo_discount_value !== undefined ? proposal.prazo_discount_value : 0,
      status: proposal.status || 'draft', // Carregar status da proposta
      solicitante_name: proposal.solicitante_name || '',
      solicitante_email: proposal.solicitante_email || '',
      solicitante_phone: proposal.solicitante_phone || '',
      source: proposal.source || '',
      usar_valor_global: proposal.usar_valor_global || false, // Carregar checkbox
      valor_global: proposal.valor_global || null // Carregar valor global
    });

    // Carregar serviços da proposta
    this.selectedServices = proposal.services.map((service, index) => {
      const serviceData = this.services.find(s => s.id === service.service_id);
      const uniqueId = `${service.service_id}_${Date.now()}_${index}`;

      const selectedService: SelectedService = {
        service_id: service.service_id,
        id: service.service_id,
        name: serviceData?.name || '',
        unit_value: service.unit_value || 0,
        total_value: service.total_value || 0,
        duration: serviceData?.duration_amount || null,
        duration_unit: serviceData?.duration_unit || null,
        category: serviceData?.category || 'Geral',
        _uniqueId: uniqueId
      };

      return selectedService;
    }).filter(service => service.id);

    // Atualização concluída - reativar listeners após um pequeno delay
    setTimeout(() => {
      this.isLoadingData = false;
    }, 100);
  }

  // Service Modal Methods (igual ao contrato)
  openServiceModal(): void {
    this.showServiceModal = true;
    this.serviceSearchTerm = '';
    this.serviceCategoryFilter = '';
  }

  closeServiceModal(): void {
    this.showServiceModal = false;
    this.serviceSearchTerm = '';
    this.serviceCategoryFilter = '';
  }

  addService(service: ApiService): void {
    const uniqueId = `${service.id}_${Date.now()}_${Math.random()}`;

    const newService: any = {
      service_id: service.id,
      id: service.id, // Para compatibilidade
      name: service.name,
      unit_value: 0,
      total_value: 0,
      duration: service.duration_amount || null,
      duration_unit: service.duration_unit || null,
      category: service.category || 'Geral',
      _uniqueId: uniqueId
    };

    this.selectedServices.push(newService);

    // Atualizar valor total
    this.updateTotalValue();

    // Fechar modal após adicionar
    this.closeServiceModal();
  }

  removeService(index: number): void {
    this.selectedServices.splice(index, 1);
    // Atualizar valor total após remover serviço
    this.updateTotalValue();
  }

  // Drag and drop methods for service ordering
  onServiceDragStart(event: DragEvent, index: number): void {
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', index.toString());
  }

  onServiceDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onServiceDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();
    const dragIndex = parseInt(event.dataTransfer!.getData('text/plain'), 10);

    if (dragIndex === dropIndex) return;

    // Use moveItemInArray to properly reorder without destroying elements
    this.moveItemInArray(this.selectedServices, dragIndex, dropIndex);
  }

  // Helper method to move item in array without destroying DOM
  private moveItemInArray<T>(array: T[], fromIndex: number, toIndex: number): void {
    const element = array[fromIndex];
    array.splice(fromIndex, 1);
    array.splice(toIndex, 0, element);
  }

  // TrackBy function for better performance and to prevent re-rendering issues
  trackByServiceId(index: number, service: SelectedService): number {
    return service.service_id;
  }

  // Update recruitment percentage values
  get filteredServices(): ApiService[] {
    let services = this.availableServices;

    if (this.serviceCategoryFilter) {
      services = services.filter(s => s.category === this.serviceCategoryFilter);
    }

    if (this.serviceSearchTerm) {
      services = services.filter(s =>
        s.name.toLowerCase().includes(this.serviceSearchTerm.toLowerCase()) ||
        s.category?.toLowerCase().includes(this.serviceSearchTerm.toLowerCase())
      );
    }

    return services.sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }

  get serviceCategories(): string[] {
    const categories = Array.from(new Set(
      this.availableServices
        .map(s => s.category)
        .filter((category): category is string => Boolean(category))
    ));
    return categories.sort();
  }

  onPriceChange(index: number, priceInReais: number): void {
    this.updateServicePrice(index, priceInReais);
  }

  onPriceInputWithMask(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;

    // A diretiva já formata o valor, só precisamos extrair o numérico
    const numericValue = this.extractNumericValue(rawValue);

    // Atualiza o serviço
    this.updateServicePriceImmediate(index, numericValue);
  }

  private updateServicePriceImmediate(index: number, priceInReais: number): void {
    if (index < 0 || index >= this.selectedServices.length) return;
    
    const service = this.selectedServices[index];
    if (priceInReais < 0) {
      priceInReais = 0;
    }
    
    service.unit_value = priceInReais;
    service.total_value = service.unit_value;
    
    // Atualização imediata
    this.updateCounter++;
    this.cdr.detectChanges();
  }

  private extractNumericValue(formattedValue: string): number {
    // Remove formatação de moeda e converte para número
    if (!formattedValue) return 0;
    
    // Remove R$, espaços, pontos de milhar e converte vírgula para ponto
    const cleanValue = formattedValue
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    
    const numericValue = parseFloat(cleanValue) || 0;
    return numericValue;
  }

  private updateServicePrice(index: number, priceInReais: number): void {
    if (index < 0 || index >= this.selectedServices.length) return;
    
    const service = this.selectedServices[index];
    if (priceInReais < 0) {
      priceInReais = 0;
    }
    
    service.unit_value = priceInReais;
    service.total_value = service.unit_value;
    
    // Log do valor total antes e depois
    const oldTotal = this.getTotalValue();
    
    // Força múltiplas atualizações
    this.updateTotalValue();
    
    // Log do novo total
    const newTotal = this.getTotalValue();
  }

  private updateTotalValue(): void {
    // Verificar se usa valor global
    const usarValorGlobal = this.proposalForm.get('usar_valor_global')?.value;
    const valorGlobal = this.proposalForm.get('valor_global')?.value;

    let newTotal: number;

    if (usarValorGlobal && valorGlobal !== null && valorGlobal !== undefined) {
      // Usar valor global fixo
      newTotal = Number(valorGlobal) || 0;
    } else {
      // Calcular soma dos serviços
      newTotal = this.calculateTotal();
    }

    this.updateCounter++;

    // Atualizar observable
    this.totalValue$.next(newTotal);

    // Forçar detecção de mudanças
    this.cdr.detectChanges();
    this.cdr.markForCheck();

    // Backup async update
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  private calculateTotal(): number {
    return this.selectedServices.reduce((sum, service) => {
      const serviceValue = parseFloat(service.unit_value?.toString()) || 0;
      return sum + serviceValue;
    }, 0);
  }

  getTotalValue(): number {
    // Verificar se usa valor global
    const usarValorGlobal = this.proposalForm.get('usar_valor_global')?.value;
    const valorGlobal = this.proposalForm.get('valor_global')?.value;

    if (usarValorGlobal && valorGlobal !== null && valorGlobal !== undefined) {
      // Retornar valor global fixo
      return Number(valorGlobal) || 0;
    }

    // Caso contrário, calcular soma dos serviços
    const total = this.selectedServices.reduce((sum, service) => {
      const serviceValue = parseFloat(service.unit_value?.toString()) || 0;
      return sum + serviceValue;
    }, 0);

    return total;
  }

  getTotalValueFormatted(): string {
    const total = this.getTotalValue();
    const formatted = this.formatCurrency(total);
    return formatted;
  }

  formatCurrency(value: number): string {
    return this.proposalService.formatCurrency(value);
  }

  formatCurrencyForInput(value: number): string {
    if (!value || value === 0) return '';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Debug method
  debugComponent(): void {
  }

  toggleNewClientForm(): void {
    this.showNewClientForm = !this.showNewClientForm;
    if (!this.showNewClientForm) {
      this.newClientForm.reset();
    }
  }

  createNewClient(): void {
    // Prevenir múltiplos cliques/submissions
    if (this.isCreatingClient) {
      this.toastr.warning('Aguarde... Cliente sendo criado.');
      return;
    }

    if (this.newClientForm.invalid) {
      this.toastr.error('Preencha os campos obrigatórios do novo cliente');
      this.markNewClientFormGroupTouched();
      return;
    }

    this.isCreatingClient = true;
    const formValue = this.newClientForm.value;
    const clientType = formValue.client_type;
    
    
    // Build client data (apenas PJ)
    const clientData: CreateClientRequest = {
      street: 'Rua temporaria',
      number: '123',
      complement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipcode: '01310100',
      phone: '',
      emails: [formValue.email || ''],
      cnpj: formValue.cnpj?.replace(/\D/g, '') || '00000000000000',
      company_name: formValue.name || '',
      trade_name: formValue.trade_name || '',
      employee_count: 1,
      business_segment: 'A definir'
    };

    console.log('Client data being sent:', JSON.stringify(clientData, null, 2));
    
    this.clientService.createClient(clientData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.clients.push(response.client);
          this.proposalForm.get('client_id')?.setValue(response.client.id);
          this.showNewClientForm = false;
          this.newClientForm.reset();
          this.isCreatingClient = false;
          this.toastr.success('Cliente criado com sucesso! Complete as informações depois editando o cliente.');
        },
        error: (error) => {
          console.error('❌ Error creating client:', error);
          console.error('📋 Complete error details:', {
            status: error.status,
            statusText: error.statusText,
            message: error?.error?.message,
            details: error?.error?.details,
            validationErrors: error?.error?.errors,
            fullError: error?.error,
            requestPayload: clientData
          });
          
          // Log específico do erro para debug
          if (error?.error?.message) {
            console.error('🚨 Server error message:', error.error.message);
          }
          
          // Tratamento específico por tipo de erro
          if (error.status === 429) {
            this.isCreatingClient = false;
            this.toastr.error('Muitas tentativas. Aguarde alguns segundos antes de tentar novamente.', 'Limite de Tentativas');
          } else if (error.status === 400) {
            this.tryAlternativeClientCreation(formValue, clientType);
          } else if (error.status === 500) {
            this.trySimplifiedClientCreation(formValue, clientType);
          } else {
            this.isCreatingClient = false;
            this.handleClientCreationError(error);
          }
        }
      });
  }

  private tryAlternativeClientCreation(formValue: any, clientType: string): void {
    console.log('Trying alternative strategy...');

    const minimalData: CreateClientRequest = {
      street: 'A definir',
      number: '0',
      neighborhood: 'A definir',
      city: 'A definir',
      state: 'SP',
      zipcode: '00000000',
      emails: [formValue.email || ''],
      cnpj: formValue.cnpj?.replace(/\D/g, '') || '00000000000000',
      company_name: formValue.name || '',
      trade_name: formValue.trade_name || '',
      employee_count: 1,
      business_segment: 'A definir'
    };

    this.clientService.createClient(minimalData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.clients.push(response.client);
          this.proposalForm.get('client_id')?.setValue(response.client.id);
          this.showNewClientForm = false;
          this.newClientForm.reset();
          this.isCreatingClient = false;
          this.toastr.success('Cliente criado com sucesso! Complete as Informações depois editando o cliente.');
        },
        error: (error) => {
          console.error('Alternative strategy failed:', error);
          this.trySimplifiedClientCreation(formValue, clientType);
        }
      });
  }

  private tryEmailsArrayStrategy(formValue: any, clientType: string): void {
    this.trySimplifiedClientCreation(formValue, clientType);
  }

  private trySimplifiedClientCreation(formValue: any, clientType: string): void {
    const simplifiedData: CreateClientRequest = {
      phone: '',
      street: 'Nao informado',
      number: '0',
      neighborhood: 'Nao informado',
      city: 'Nao informado',
      state: 'SP',
      zipcode: '00000000',
      emails: [formValue.email || ''],
      cnpj: formValue.cnpj?.replace(/\D/g, '') || '00000000000000',
      company_name: formValue.name || '',
      trade_name: formValue.trade_name || '',
      employee_count: 1,
      business_segment: 'Outros'
    };

    console.log('Trying simplified payload:', simplifiedData);

    this.clientService.createClient(simplifiedData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.clients.push(response.client);
          this.proposalForm.get('client_id')?.setValue(response.client.id);
          this.showNewClientForm = false;
          this.newClientForm.reset();
          this.isCreatingClient = false;
          this.toastr.success('Cliente criado com sucesso! Complete as Informações depois editando o cliente.');
        },
        error: (error) => {
          console.error('Simplified creation also failed:', error);
          this.isCreatingClient = false;
          this.handleClientCreationError(error);
        }
      });
  }

  private handleClientCreationError(error: any): void {
    let errorMessage = 'Erro ao criar cliente após todas as tentativas';
    let errorTitle = 'Erro ao criar cliente';
    
    // Log detalhado final para debug
    console.error('🚨 FINAL ERROR after all strategies failed:', {
      status: error.status,
      message: error?.error?.message,
      details: error?.error?.details,
      validationErrors: error?.error?.errors,
      fullError: error?.error
    });
    
    if (error.status === 429) {
      errorMessage = 'Muitas tentativas. Aguarde alguns segundos antes de tentar novamente.';
      errorTitle = 'Limite de Tentativas Excedido';
    } else if (error?.error?.message) {
      errorMessage = `${error.error.message}. Verifique se todos os campos obrigatórios estão preenchidos.`;
    } else if (error?.error?.errors) {
      // Se tiver erros de validação específicos
      const validationErrors = error.error.errors;
      const errorMessages = Object.keys(validationErrors).map(key => 
        `${key}: ${validationErrors[key]}`
      );
      errorMessage = `Erro de validação: ${errorMessages.join(', ')}`;
      errorTitle = 'Erro de Validação';
    } else if (error?.error?.details) {
      errorMessage = `${error.error.details}. Entre em contato com o suporte se o problema persistir.`;
    } else if (error.status === 500) {
      errorMessage = 'Erro interno do servidor. Tente novamente ou contate o suporte.';
      errorTitle = 'Erro do Servidor';
    } else if (error.status === 400) {
      errorMessage = 'Dados inválidos ou campos obrigatórios faltando. Entre em contato com o suporte para verificar a configuração.';
      errorTitle = 'Dados Inválidos';
    } else {
      errorMessage = `Erro desconhecido (${error.status}). Entre em contato com o suporte.`;
      errorTitle = 'Erro Desconhecido';
    }
    
    this.toastr.error(errorMessage, errorTitle, {
      timeOut: 10000, // Mais tempo para ler a mensagem
      closeButton: true
    });
  }

  private markNewClientFormGroupTouched(): void {
    Object.keys(this.newClientForm.controls).forEach(key => {
      const control = this.newClientForm.get(key);
      control?.markAsTouched();
    });
  }

  onSubmit(): void {
    
    if (this.proposalForm.invalid) {
      this.markFormGroupTouched(this.proposalForm);
      this.toastr.error('Preencha todos os campos obrigatórios');
      return;
    }

    // Validar se há pelo menos um serviço
    if (this.selectedServices.length === 0) {
      this.toastr.error('Adicione pelo menos um serviço');
      return;
    }

    // Validar se todos os serviços têm valor
    const invalidServices = this.selectedServices.filter(service =>
      !service.unit_value || service.unit_value <= 0
    );

    if (invalidServices.length > 0) {
      this.toastr.error('Todos os serviços devem ter um valor válido');
      return;
    }

    this.isSubmitting = true;
    
    // Mostrar feedback de salvamento no banco
    const loadingToast = this.toastr.info('Salvando proposta no banco de dados...', 'Processando', {
      disableTimeOut: true,
      closeButton: false
    });
    
    // Obter dados do cliente selecionado
    const clientId = parseInt(this.proposalForm.value.client_id) || 0;
    const selectedClient = this.clients.find(c => c.id === clientId);
    
    if (!selectedClient) {
      this.toastr.error('Cliente selecionado não encontrado');
      this.isSubmitting = false;
      return;
    }

    const formData: CreateProposalData = {
      client_id: clientId,
      type: this.proposalForm.value.type || 'Full',
      client_name: selectedClient.trade_name || selectedClient.company_name || '',
      client_document: selectedClient.cnpj || '',
      client_email: selectedClient.email || '',
      client_phone: selectedClient.phone || undefined,
      client_street: selectedClient.street || '',
      client_number: selectedClient.number || '',
      client_complement: selectedClient.complement || undefined,
      client_neighborhood: selectedClient.neighborhood || '',
      client_city: selectedClient.city || '',
      client_state: selectedClient.state || '',
      client_zipcode: selectedClient.zipcode || '',
      solicitante_name: this.proposalForm.value.solicitante_name || undefined,
      solicitante_email: this.proposalForm.value.solicitante_email || undefined,
      solicitante_phone: this.proposalForm.value.solicitante_phone || undefined,
      source: this.proposalForm.value.source || undefined,
      end_date: this.proposalForm.value.end_date || null,
      max_installments: this.proposalForm.value.max_installments || 12,
      vista_discount_percentage: this.proposalForm.value.vista_discount_percentage ?? 6,
      prazo_discount_percentage: this.proposalForm.value.prazo_discount_percentage ?? 0,
      vista_discount_value: this.proposalForm.value.vista_discount_value ?? 0,
      prazo_discount_value: this.proposalForm.value.prazo_discount_value ?? 0,
      usar_valor_global: this.proposalForm.value.usar_valor_global || false,
      valor_global: this.proposalForm.value.valor_global || null,
      validity_days: 30, // Valor padrão
      services: this.selectedServices.map((service, index) => ({
        service_id: service.id,
        unit_value: service.unit_value || 0,
        sort_order: index
      }))
    };

    // Adicionar status apenas quando estiver em modo de edição
    if (this.isEditMode && this.proposalForm.value.status) {
      (formData as any).status = this.proposalForm.value.status;
    }


    const operation = this.isEditMode 
      ? this.proposalService.updateProposal(this.proposalId!, formData)
      : this.proposalService.createProposal(formData);

    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        // Limpar toast de loading
        this.toastr.clear();

        if (response.success) {
          const successMessage = this.isEditMode ? 'Proposta atualizada com sucesso' : 'Proposta criada com sucesso';

          // Sempre mostrar sucesso primeiro
          this.toastr.success(successMessage);

          // Emitir evento de salvamento
          this.onSave.emit(response.data);

          // Redirecionar para a lista de propostas após um delay (tanto para criar quanto editar)
          setTimeout(() => {
            if (!this.isModal) {
              this.router.navigate(['/home/propostas']);
            }
          }, 1500);
        } else {
          this.toastr.error(response.message || 'Erro ao salvar proposta');
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        // Limpar toast de loading
        this.toastr.clear();
        console.error('Erro ao salvar proposta:', error);
        this.toastr.error('Erro ao salvar proposta');
        this.isSubmitting = false;
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach(arrayControl => {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl);
          }
        });
      }
    });
  }

  private resetForm(): void {
    this.proposalForm.reset();
    this.selectedServices = [];
    this.proposalForm.patchValue({
      type: 'Full',
      client_id: ''
    });
  }

  cancel(): void {
    if (this.isModal) {
      this.onCancel.emit();
    } else {
      // Se não é modal, redirecionar para a lista de propostas
      this.router.navigate(['/home/propostas']);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.proposalForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }



  getNewClientNamePlaceholder(): string {
    return 'Ex: Empresa LTDA';
  }

  getNewClientNameLabel(): string {
    return 'Razão social';
  }

  cancelNewClient(): void {
    this.showNewClientForm = false;
    this.newClientForm.reset();
    this.isCreatingClient = false;
  }

  isNewClientFieldInvalid(fieldName: string): boolean {
    const field = this.newClientForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  private detectClientType(document: string): 'pj' | '' {
    if (!document) return '';
    const cleanDocument = document.replace(/\D/g, '');
    if (cleanDocument.length === 14) {
      return 'pj';
    }
    return '';
  }

  private updateDocumentValidation(clientType: string): void {
    const cnpjControl = this.newClientForm.get('cnpj');
    cnpjControl?.setValidators([Validators.required]);
    cnpjControl?.updateValueAndValidity();
  }

  // Métodos para conversão entre valor absoluto e porcentagem de desconto
  private setupDiscountListeners(): void {
    // Listener para desconto à vista - porcentagem
    this.proposalForm.get('vista_discount_percentage')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((percentage) => {
        if (percentage !== null && percentage !== undefined && !this.isUpdatingDiscounts && !this.isLoadingData) {
          this.updateVistaDiscountValue(percentage);
        }
      });

    // Listener para desconto à vista - valor
    this.proposalForm.get('vista_discount_value')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        if (value !== null && value !== undefined && !this.isUpdatingDiscounts && !this.isLoadingData) {
          this.updateVistaDiscountPercentage(value);
        }
      });

    // Listener para desconto a prazo - porcentagem
    this.proposalForm.get('prazo_discount_percentage')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((percentage) => {
        if (percentage !== null && percentage !== undefined && !this.isUpdatingDiscounts && !this.isLoadingData) {
          this.updatePrazoDiscountValue(percentage);
        }
      });

    // Listener para desconto a prazo - valor
    this.proposalForm.get('prazo_discount_value')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        if (value !== null && value !== undefined && !this.isUpdatingDiscounts && !this.isLoadingData) {
          this.updatePrazoDiscountPercentage(value);
        }
      });

    // Listener para usar_valor_global - recalcular descontos quando mudar
    this.proposalForm.get('usar_valor_global')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((usarValorGlobal) => {
        if (!this.isLoadingData) {
          this.recalculateDiscountsOnBaseValueChange();
        }
      });

    // Listener para valor_global - recalcular descontos quando mudar
    this.proposalForm.get('valor_global')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((valorGlobal) => {
        const usarValorGlobal = this.proposalForm.get('usar_valor_global')?.value;
        if (usarValorGlobal && !this.isLoadingData) {
          this.recalculateDiscountsOnBaseValueChange();
        }
      });
  }

  // Recalcular valores de desconto quando o valor base mudar
  private recalculateDiscountsOnBaseValueChange(): void {
    if (this.isUpdatingDiscounts) return;

    // Recalcular desconto à vista baseado na porcentagem atual
    const vistaPercentage = this.proposalForm.get('vista_discount_percentage')?.value;
    if (vistaPercentage !== null && vistaPercentage !== undefined && vistaPercentage > 0) {
      this.updateVistaDiscountValue(vistaPercentage);
    }

    // Recalcular desconto a prazo baseado na porcentagem atual
    const prazoPercentage = this.proposalForm.get('prazo_discount_percentage')?.value;
    if (prazoPercentage !== null && prazoPercentage !== undefined && prazoPercentage > 0) {
      this.updatePrazoDiscountValue(prazoPercentage);
    }
  }

  private isUpdatingDiscounts = false; // Flag para evitar loops infinitos

  // Método auxiliar para obter valor base para cálculo de desconto
  private getBaseValueForDiscount(): number {
    const usarValorGlobal = this.proposalForm.get('usar_valor_global')?.value;
    const valorGlobal = this.proposalForm.get('valor_global')?.value;

    if (usarValorGlobal && valorGlobal !== null && valorGlobal !== undefined) {
      return Number(valorGlobal) || 0;
    }

    return this.calculateTotal();
  }

  private updateVistaDiscountValue(percentage: number): void {
    const totalValue = this.getBaseValueForDiscount();
    const discountValue = totalValue * (percentage / 100);
    this.isUpdatingDiscounts = true;
    this.proposalForm.patchValue({ vista_discount_value: Number(discountValue.toFixed(2)) }, { emitEvent: false });
    this.isUpdatingDiscounts = false;
  }

  private updateVistaDiscountPercentage(value: number): void {
    const totalValue = this.getBaseValueForDiscount();
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
    this.isUpdatingDiscounts = true;
    this.proposalForm.patchValue({ vista_discount_percentage: Number(percentage.toFixed(2)) }, { emitEvent: false });
    this.isUpdatingDiscounts = false;
  }

  private updatePrazoDiscountValue(percentage: number): void {
    const totalValue = this.getBaseValueForDiscount();
    const discountValue = totalValue * (percentage / 100);
    this.isUpdatingDiscounts = true;
    this.proposalForm.patchValue({ prazo_discount_value: Number(discountValue.toFixed(2)) }, { emitEvent: false });
    this.isUpdatingDiscounts = false;
  }

  private updatePrazoDiscountPercentage(value: number): void {
    const totalValue = this.getBaseValueForDiscount();
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
    this.isUpdatingDiscounts = true;
    this.proposalForm.patchValue({ prazo_discount_percentage: Number(percentage.toFixed(2)) }, { emitEvent: false });
    this.isUpdatingDiscounts = false;
  }


}