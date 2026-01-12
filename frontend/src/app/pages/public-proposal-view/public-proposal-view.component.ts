import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { 
  PublicProposalService as PublicProposalServiceAPI, 
  PublicProposal, 
  PublicProposalService,
  ServiceSelectionData,
  SignatureData,
  ConfirmationData
} from '../../services/public-proposal.service';

import { 
  PublicTeamService, 
  PublicTeamMember 
} from '../../services/public-team.service';

type ProposalServiceItem = PublicProposalService;

@Component({
  selector: 'app-public-proposal-view',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './public-proposal-view.component.html',
  styleUrls: ['./public-proposal-view.component.css']
})
export class PublicProposalViewComponent implements OnInit {
  currentYear = new Date().getFullYear();
  @ViewChild('signatureCanvas', { static: false }) signatureCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('carouselTrack', { static: false }) carouselTrack!: ElementRef<HTMLDivElement>;

  // Landing page properties
  clients: { name: string, logo: string }[] = [];
  
  // Lista filtrada de logos de clientes selecionados
  private clientLogos = [
    'city.webp',
    'Logo-CMO-Construtora.webp',
    'logo-adao.png',
    'Séren.png',
    'Habitat.png',
    'TopConstrutora.png',
    'raizUrbana.png',
    'Elmo-inc.jpg',
    'myBroker.webp',
    'URBS One - Assinaturas_Separadas-01 (1).png',
    'URBS infinity P cima (1).png',
    'UrbsTrend.png',
    'haut.webp',
    'realize.png',
    'haura_principal_preto (1).png',
    'RDiniz.png',
    'Logo-Lopes-Consultoria-de-Imoveis-2020.png',
    'EBM.png'
  ];
  
  carouselProgress = 0;
  isManualControl = false;
  isDragging = false;
  currentTransform = '';
  
  private progressInterval: any;
  private manualControlTimeout: any;
  private startX = 0;
  private currentX = 0;
  private initialTransformX = 0;
  private animationId = 0;

  // Team members
  teamMembers: PublicTeamMember[] = [];
  duplicatedTeamMembers: PublicTeamMember[] = [];
  teamLoading = false;
  
  // Team carousel properties
  teamCarouselProgress = 0;
  isTeamManualControl = false;
  isTeamDragging = false;
  currentTeamTransform = '';
  
  private teamProgressInterval: any;
  private teamManualControlTimeout: any;
  private teamStartX = 0;
  private teamCurrentX = 0;
  private teamInitialTransformX = 0;
  private teamAnimationId = 0;
  private teamCurrentPosition = 0;

  proposal: PublicProposal | null = null;
  signatureForm!: FormGroup;
  confirmationForm!: FormGroup;
  
  // Estados da aplicação
  isLoading = true;
  isSubmitting = false;
  proposalExpired = false;
  daysUntilExpiration: number | null = null;
  
  // Fluxo de estados
  currentStep: 'view' | 'selecting' | 'signing' | 'confirming' | 'completed' | 'rejected' = 'view';
  
  // Dados de seleção de serviços
  selectedServices: Map<number, boolean> = new Map();
  serviceNotes: Map<number, string> = new Map();
  clientObservations = '';
  
  // Controle de expansão de descrições (para mobile)
  expandedDescriptions: Map<number, boolean> = new Map();

  // Controle do modal de sucesso
  showSuccessModal = false;

  // Controle do formulário de assinatura (toggle)
  isSignatureFormExpanded = false;

  // Dados de pagamento
  paymentType: 'vista' | 'prazo' = 'prazo';
  paymentMethod: string = '';
  installments: number | null = null;
  discountPercentage = 6; // Desconto padrão, será atualizado com o valor da proposta
  
  // Métodos de pagamento (baseados nos contratos)
  paymentMethods = {
    vista: [
      { value: 'PIX', label: 'PIX', icon: 'fas fa-qrcode' },
      { value: 'Transferência', label: 'Transferência Bancária', icon: 'fas fa-exchange-alt' }
    ],
    prazo: [
      { value: 'Boleto', label: 'Boleto Bancário', icon: 'fas fa-barcode' },
      { value: 'Pix Parcelado', label: 'Pix Parcelado', icon: 'fas fa-qrcode' }
    ]
  };
  
  // Dados de assinatura
  signatureDrawn = false;
  private signatureContext: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  
  private destroy$ = new Subject<void>();
  private token: string = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private publicProposalService: PublicProposalServiceAPI,
    private publicTeamService: PublicTeamService,
    private toastr: ToastrService,
    private sanitizer: DomSanitizer
  ) {
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    
    if (!this.token) {
      this.toastr.error('Token inválido');
      this.router.navigate(['/']);
      return;
    }

    this.initializeClientLogos();
    this.initializeCarousel();
    this.loadTeamMembers();
    this.loadProposal();
  }

  ngAfterViewInit(): void {
    // Initialize signature canvas after view is ready
    setTimeout(() => {
      this.initializeSignatureCanvas();
    }, 500);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    if (this.manualControlTimeout) {
      clearTimeout(this.manualControlTimeout);
    }
    
    if (this.teamProgressInterval) {
      clearInterval(this.teamProgressInterval);
    }
    
    if (this.teamManualControlTimeout) {
      clearTimeout(this.teamManualControlTimeout);
    }
    
    if (this.teamAnimationId) {
      cancelAnimationFrame(this.teamAnimationId);
    }
  }

  private initializeForms(proposal: PublicProposal | null): void {
    // Não preencher automaticamente - deixar campos vazios para o cliente preencher
    this.signatureForm = this.fb.group({
        client_name: ['', [Validators.required, Validators.minLength(2)]],
        client_email: ['', [Validators.required, Validators.email]],
        client_phone: [''],
        client_document: [''],
        client_observations: [''],
        payment_type: ['prazo', Validators.required],
        payment_method: ['', Validators.required],
        installments: [null]
    });

    this.confirmationForm = this.fb.group({
        client_observations: ['']
    });
  }

  private loadProposal(): void {
    this.publicProposalService.getProposalByToken(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.proposal = response.data;
            this.initializeForms(this.proposal);
            this.checkProposalStatus();
            this.initializeServiceSelection();
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erro ao carregar proposta:', error);
          this.toastr.error('Proposta não encontrada ou link expirado');
          this.isLoading = false;
        }
      });
  }

  private loadTeamMembers(): void {
    this.teamLoading = true;
    this.publicTeamService.getTeamMembers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.teamMembers = response.teamMembers || [];
          this.initializeTeamCarousel();
          this.teamLoading = false;
        },
        error: (error) => {
          console.error('Erro ao carregar membros da equipe:', error);
          this.teamMembers = [];
          this.teamLoading = false;
        }
      });
  }

  private async loadProposalSync(): Promise<void> {
    try {
      const response = await this.publicProposalService.getProposalByToken(this.token).toPromise();
      if (response?.success) {
        this.proposal = response.data;
        this.checkProposalStatus();
        // Não inicializar seleção de serviços novamente após assinatura
      }
    } catch (error) {
      console.error('Erro ao recarregar proposta:', error);
      // Não mostrar erro aqui para não interromper o fluxo
    }
  }

  private checkProposalStatus(): void {
    if (!this.proposal) return;

    this.proposalExpired = this.publicProposalService.isProposalExpired(this.proposal);
    this.daysUntilExpiration = this.publicProposalService.getDaysUntilExpiration(this.proposal);

    // Atualizar desconto com os valores da proposta
    this.updateDiscountPercentages();

    // Definir estado inicial baseado no status
    if (this.proposal.status === 'accepted') {
      this.currentStep = 'completed';
      this.toastr.info('Esta proposta já foi aceita');
    } else if (this.proposal.status === 'rejected') {
      this.currentStep = 'rejected';
      this.toastr.info('Esta proposta foi rejeitada');
    } else if (this.proposal.status !== 'sent') {
      this.toastr.warning('Esta proposta não está disponível');
    }
  }

  private updateDiscountPercentages(): void {
    if (!this.proposal) {
      return;
    }

    // Usar os valores de desconto da proposta se disponíveis - converter para número
    const vistaDiscount = Number(this.proposal.vista_discount_percentage);
    const prazoDiscount = Number(this.proposal.prazo_discount_percentage);

    if (this.paymentType === 'vista' && !isNaN(vistaDiscount)) {
      this.discountPercentage = vistaDiscount;
    } else if (this.paymentType === 'prazo' && !isNaN(prazoDiscount)) {
      this.discountPercentage = prazoDiscount;
    } else {
      // Valores padrão se não definidos na proposta
      this.discountPercentage = this.paymentType === 'vista' ? 6 : 0;
    }
  }

  private initializeServiceSelection(): void {
    if (!this.proposal?.services) return;
    
    // Todos os serviços começam selecionados por padrão
    this.proposal.services.forEach(service => {
      this.selectedServices.set(service.service_id, true);
      this.serviceNotes.set(service.service_id, service.client_notes || '');
    });
    
    // Initialize signature canvas after view init
    setTimeout(() => this.initializeSignatureCanvas(), 100);
  }

  // === MÉTODOS DE SELEÇÃO DE SERVIÇOS ===
  
  startServiceSelection(): void {
    if (this.proposalExpired || this.proposal?.status !== 'sent') {
      this.toastr.error('Esta proposta não está disponível para seleção');
      return;
    }
    this.currentStep = 'selecting';
  }
  
  goToSigningStep(): void {
    this.currentStep = 'signing';
    // Initialize canvas after step change
    setTimeout(() => this.initializeSignatureCanvas(), 100);
  }

  toggleService(serviceId: number): void {
    const current = this.selectedServices.get(serviceId) || false;
    this.selectedServices.set(serviceId, !current);
  }

  isServiceSelected(serviceId: number): boolean {
    return this.selectedServices.get(serviceId) || false;
  }

  updateServiceNote(serviceId: number, note: string): void {
    this.serviceNotes.set(serviceId, note);
  }
  
  // === MÉTODOS PARA EXPANSÃO DE DESCRIÇÕES (MOBILE) ===
  
  toggleDescription(serviceId: number): void {
    const current = this.expandedDescriptions.get(serviceId) || false;
    this.expandedDescriptions.set(serviceId, !current);
  }
  
  isDescriptionExpanded(serviceId: number): boolean {
    return this.expandedDescriptions.get(serviceId) || false;
  }

  updateServiceNoteFromEvent(serviceId: number, event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.updateServiceNote(serviceId, target.value);
  }

  getServiceNote(serviceId: number): string {
    return this.serviceNotes.get(serviceId) || '';
  }

  // === MÉTODOS PARA TABELA DE SERVIÇOS ===
  
  areAllServicesSelected(): boolean {
    if (!this.proposal?.services.length) return false;
    return this.proposal.services.every(service => this.isServiceSelected(service.service_id));
  }

  areSomeServicesSelected(): boolean {
    if (!this.proposal?.services.length) return false;
    const selectedCount = this.proposal.services.filter(service => this.isServiceSelected(service.service_id)).length;
    return selectedCount > 0 && selectedCount < this.proposal.services.length;
  }

  toggleAllServices(event: Event): void {
    const target = event.target as HTMLInputElement;
    const selectAll = target.checked;
    
    if (!this.proposal?.services) return;
    
    this.proposal.services.forEach(service => {
      this.selectedServices.set(service.service_id, selectAll);
    });
  }

  getSelectedServicesCount(): number {
    if (!this.proposal?.services) return 0;
    return this.proposal.services.filter(service => this.isServiceSelected(service.service_id)).length;
  }

  // === MÉTODOS DE VALIDAÇÃO E ASSINATURA ===
  
  canSignProposal(): boolean {
    return (
      this.signatureForm.get('client_name')?.valid === true &&
      this.signatureForm.get('client_email')?.valid === true &&
      this.signatureDrawn &&
      this.hasSelectedServices()
    );
  }

  isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  async saveServiceSelection(): Promise<void> {
    if (!this.hasSelectedServices()) {
      this.toastr.error('Selecione pelo menos um serviço');
      return;
    }

    this.isSubmitting = true;

    const selectionData: ServiceSelectionData = {
      selectedServices: Array.from(this.selectedServices.entries()).map(([serviceId, selected]) => ({
        service_id: serviceId,
        selected,
        client_notes: this.serviceNotes.get(serviceId) || ''
      })),
      client_observations: this.clientObservations
    };

    try {
      const response = await this.publicProposalService.selectServices(this.token, selectionData).toPromise();
      if (response?.success) {
        this.toastr.success('Seleção salva com sucesso!');
        await this.loadProposal(); // Recarregar dados atualizados
        this.goToSigningStep();
      }
    } catch (error) {
      console.error('Erro ao salvar seleção:', error);
      this.toastr.error('Erro ao salvar seleção de serviços');
    } finally {
      this.isSubmitting = false;
    }
  }

  // === MÉTODOS DE ASSINATURA ===

  initializeSignatureCanvas(): void {
    setTimeout(() => {
      if (this.signatureCanvas && this.signatureCanvas.nativeElement) {
        const canvas = this.signatureCanvas.nativeElement;
        const rect = canvas.getBoundingClientRect();
        
        // Set canvas actual size to match CSS size
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        this.signatureContext = canvas.getContext('2d');
        
        if (this.signatureContext) {
          this.signatureContext.strokeStyle = '#000000';
          this.signatureContext.lineWidth = 2;
          this.signatureContext.lineCap = 'round';
          this.signatureContext.lineJoin = 'round';
        }
      }
    }, 200);
  }

  startDrawing(event: MouseEvent): void {
    if (!this.signatureContext) return;
    
    this.isDrawing = true;
    const rect = this.signatureCanvas.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    this.signatureContext.beginPath();
    this.signatureContext.moveTo(x, y);
  }

  draw(event: MouseEvent): void {
    if (!this.isDrawing || !this.signatureContext) return;
    
    const rect = this.signatureCanvas.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    this.signatureContext.lineTo(x, y);
    this.signatureContext.stroke();
    this.signatureDrawn = true;
  }

  stopDrawing(): void {
    this.isDrawing = false;
  }
  
  // Support for touch devices
  startTouchDrawing(event: TouchEvent): void {
    event.preventDefault();
    if (!this.signatureContext) return;
    
    const touch = event.touches[0];
    const rect = this.signatureCanvas.nativeElement.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    this.isDrawing = true;
    this.signatureContext.beginPath();
    this.signatureContext.moveTo(x, y);
  }

  touchDraw(event: TouchEvent): void {
    event.preventDefault();
    if (!this.isDrawing || !this.signatureContext) return;
    
    const touch = event.touches[0];
    const rect = this.signatureCanvas.nativeElement.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    this.signatureContext.lineTo(x, y);
    this.signatureContext.stroke();
    this.signatureDrawn = true;
  }

  stopTouchDrawing(event: TouchEvent): void {
    event.preventDefault();
    this.isDrawing = false;
  }

  clearSignature(): void {
    if (!this.signatureContext) return;
    
    const canvas = this.signatureCanvas.nativeElement;
    this.signatureContext.clearRect(0, 0, canvas.width, canvas.height);
    this.signatureDrawn = false;
  }

  async signProposal(): Promise<void> {
    if (this.signatureForm.invalid) {
      this.markFormGroupTouched(this.signatureForm);
      this.toastr.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!this.signatureDrawn) {
      this.toastr.error('Assinatura é obrigatória');
      return;
    }

    this.isSubmitting = true;

    try {
      const canvas = this.signatureCanvas.nativeElement;
      const signatureDataUrl = canvas.toDataURL();

      // Preparar dados dos serviços selecionados
      const selectedServicesData = this.proposal?.services?.map(service => ({
        service_id: service.service_id,
        selected: this.isServiceSelected(service.service_id),
        client_notes: this.serviceNotes.get(service.service_id) || ''
      })) || [];

      const signatureData: SignatureData & { selected_services?: any[] } = {
        signature_data: signatureDataUrl,
        ...this.signatureForm.value,
        final_value: this.getSelectedTotal() || 0,
        payment_type: this.paymentType || 'prazo',
        payment_method: this.paymentMethod || '',
        installments: this.installments && this.installments >= 1 ? this.installments : 1,
        discount_applied: this.getDiscountAmount() || 0,
        is_counterproposal: !this.areAllServicesSelected(),
        selected_services: selectedServicesData
      };

      const response = await this.publicProposalService.signProposal(this.token, signatureData).toPromise();
      if (response?.success) {
        // Mostrar modal de sucesso
        this.showSuccessModal = true;

        // Recarregar os dados da proposta para refletir o novo status
        await this.loadProposalSync();
        this.currentStep = 'confirming';

        // Auto-fechar o modal após 5 segundos
        setTimeout(() => {
          this.closeSuccessModal();
        }, 5000);
      }
    } catch (error) {
      console.error('Erro ao assinar proposta:', error);
      this.toastr.error('Erro ao processar assinatura');
    } finally {
      this.isSubmitting = false;
    }
  }

  // === MÉTODOS DE CONFIRMAÇÃO ===

  async confirmProposal(): Promise<void> {
    this.isSubmitting = true;

    try {
      const confirmationData: ConfirmationData = this.confirmationForm.value;
      const response = await this.publicProposalService.confirmProposal(this.token, confirmationData).toPromise();
      
      if (response?.success) {
        this.toastr.success('Proposta confirmada com sucesso!');
        // Recarregar os dados da proposta para refletir o status final
        await this.loadProposalSync();
        this.currentStep = 'completed';
      }
    } catch (error) {
      console.error('Erro ao confirmar proposta:', error);
      this.toastr.error('Erro ao confirmar proposta');
    } finally {
      this.isSubmitting = false;
    }
  }

  async rejectProposal(): Promise<void> {
    const reason = prompt('Motivo da rejeição (opcional):');
    
    if (confirm('Tem certeza que deseja rejeitar esta proposta?')) {
      this.isSubmitting = true;

      try {
        const response = await this.publicProposalService.rejectProposal(this.token, reason || '').toPromise();
        if (response?.success) {
          this.toastr.success('Proposta rejeitada');
          // Recarregar os dados da proposta para refletir o status de rejeitada
          await this.loadProposalSync();
          this.currentStep = 'rejected';
        }
      } catch (error) {
        console.error('Erro ao rejeitar proposta:', error);
        this.toastr.error('Erro ao rejeitar proposta');
      } finally {
        this.isSubmitting = false;
      }
    }
  }

  // === MÉTODOS UTILITÁRIOS ===

  hasSelectedServices(): boolean {
    return Array.from(this.selectedServices.values()).some(selected => selected);
  }

  getSelectedTotal(): number {
    if (!this.proposal) return 0;

    const baseTotal = this.proposal.services
      .filter(service => this.selectedServices.get(service.service_id))
      .reduce((total, service) => {
        return total + this.getServiceTotal(service);
      }, 0);

    // Aplicar desconto com base no tipo de pagamento
    if (this.discountPercentage > 0) {
      // Para pagamento à vista, aplica desconto se todos os serviços estão selecionados
      if (this.paymentType === 'vista' && this.areAllServicesSelected()) {
        return baseTotal * (1 - this.discountPercentage / 100);
      }
      // Para pagamento à prazo, aplica desconto se configurado e todos os serviços selecionados
      if (this.paymentType === 'prazo' && this.areAllServicesSelected() && this.proposal?.prazo_discount_percentage) {
        return baseTotal * (1 - this.discountPercentage / 100);
      }
    }

    return baseTotal;
  }
  
  getBaseTotal(): number {
    if (!this.proposal) return 0;

    // Se usar valor global, retornar o valor global
    if (this.proposal.usar_valor_global && this.proposal.valor_global !== null && this.proposal.valor_global !== undefined) {
      return Number(this.proposal.valor_global) || 0;
    }

    // Caso contrário, calcular a soma dos serviços selecionados
    return this.proposal.services
      .filter(service => this.selectedServices.get(service.service_id))
      .reduce((total, service) => {
        return total + this.getServiceTotal(service);
      }, 0);
  }
  
  getDiscountAmount(): number {
    // Desconto se aplica se usar valor global OU todos os serviços estão selecionados
    if (this.proposal?.usar_valor_global || this.areAllServicesSelected()) {
      const baseTotal = this.getBaseTotal();

      // Determinar qual desconto aplicar baseado no tipo de pagamento
      if (this.paymentType === 'vista') {
        // Primeiro verifica valor absoluto
        const vistaDiscountValue = Number(this.proposal?.vista_discount_value);
        if (!isNaN(vistaDiscountValue) && vistaDiscountValue > 0) {
          return Math.min(vistaDiscountValue, baseTotal); // Não pode descontar mais que o total
        }

        // Depois verifica porcentagem
        const vistaDiscountPercentage = Number(this.proposal?.vista_discount_percentage);
        if (!isNaN(vistaDiscountPercentage) && vistaDiscountPercentage > 0) {
          return baseTotal * (vistaDiscountPercentage / 100);
        }
      } else if (this.paymentType === 'prazo') {
        // Primeiro verifica valor absoluto
        const prazoDiscountValue = Number(this.proposal?.prazo_discount_value);
        if (!isNaN(prazoDiscountValue) && prazoDiscountValue > 0) {
          return Math.min(prazoDiscountValue, baseTotal); // Não pode descontar mais que o total
        }

        // Depois verifica porcentagem
        const prazoDiscountPercentage = Number(this.proposal?.prazo_discount_percentage);
        if (!isNaN(prazoDiscountPercentage) && prazoDiscountPercentage > 0) {
          return baseTotal * (prazoDiscountPercentage / 100);
        }
      }
    }
    return 0;
  }

  canGetDiscount(): boolean {
    // Verifica se pode ter desconto baseado no tipo de pagamento e configuração
    if (this.paymentType === 'vista') {
      const vistaDiscountValue = Number(this.proposal?.vista_discount_value);
      const vistaDiscountPercentage = Number(this.proposal?.vista_discount_percentage);

      if ((!isNaN(vistaDiscountValue) && vistaDiscountValue > 0) ||
          (!isNaN(vistaDiscountPercentage) && vistaDiscountPercentage > 0)) {
        // Desconto se usar valor global OU todos os serviços selecionados
        return this.proposal?.usar_valor_global || this.areAllServicesSelected();
      }
    }
    if (this.paymentType === 'prazo') {
      const prazoDiscountValue = Number(this.proposal?.prazo_discount_value);
      const prazoDiscountPercentage = Number(this.proposal?.prazo_discount_percentage);

      if ((!isNaN(prazoDiscountValue) && prazoDiscountValue > 0) ||
          (!isNaN(prazoDiscountPercentage) && prazoDiscountPercentage > 0)) {
        // Desconto se usar valor global OU todos os serviços selecionados
        return this.proposal?.usar_valor_global || this.areAllServicesSelected();
      }
    }
    return false;
  }

  // Método auxiliar para obter o valor final com desconto aplicado
  getFinalValueWithDiscount(): number {
    // Usar os métodos específicos de cada tipo de pagamento
    if (this.paymentType === 'vista') {
      return this.getVistaValueWithDiscount();
    } else {
      return this.getPrazoValueWithDiscount();
    }
  }

  // Método para calcular valor com desconto à vista (para exibição no card)
  getVistaValueWithDiscount(): number {
    const baseTotal = this.getBaseTotal();

    // Se usar valor global OU todos os serviços estão selecionados, aplicar desconto
    if (this.proposal?.usar_valor_global || this.areAllServicesSelected()) {
      // Primeiro verifica se há valor absoluto de desconto
      const vistaDiscountValue = Number(this.proposal?.vista_discount_value);
      if (!isNaN(vistaDiscountValue) && vistaDiscountValue > 0) {
        // Aplica o desconto em valor absoluto
        return Math.max(0, baseTotal - vistaDiscountValue);
      }

      // Se não há valor absoluto, verifica porcentagem
      const vistaDiscountPercentage = Number(this.proposal?.vista_discount_percentage);
      if (!isNaN(vistaDiscountPercentage) && vistaDiscountPercentage > 0) {
        // Aplica o desconto em porcentagem
        return baseTotal * (1 - vistaDiscountPercentage / 100);
      }
    }

    return baseTotal;
  }

  // Método para calcular valor com desconto à prazo (para exibição no card)
  getPrazoValueWithDiscount(): number {
    const baseTotal = this.getBaseTotal();

    // Se usar valor global OU todos os serviços estão selecionados, aplicar desconto
    if (this.proposal?.usar_valor_global || this.areAllServicesSelected()) {
      // Primeiro verifica se há valor absoluto de desconto
      const prazoDiscountValue = Number(this.proposal?.prazo_discount_value);
      if (!isNaN(prazoDiscountValue) && prazoDiscountValue > 0) {
        // Aplica o desconto em valor absoluto
        return Math.max(0, baseTotal - prazoDiscountValue);
      }

      // Se não há valor absoluto, verifica porcentagem
      const prazoDiscountPercentage = Number(this.proposal?.prazo_discount_percentage);
      if (!isNaN(prazoDiscountPercentage) && prazoDiscountPercentage > 0) {
        // Aplica o desconto em porcentagem
        return baseTotal * (1 - prazoDiscountPercentage / 100);
      }
    }

    return baseTotal;
  }

  // Método para calcular valor da parcela com desconto
  getInstallmentValue(): number {
    const finalValue = this.getFinalValueWithDiscount();
    const installments = this.installments || this.proposal?.max_installments || 12;
    return finalValue / installments;
  }
  
  onPaymentTypeChange(type: 'vista' | 'prazo'): void {
    this.paymentType = type;
    this.signatureForm.patchValue({ payment_type: type });

    // Atualizar o desconto baseado no tipo de pagamento
    this.updateDiscountPercentages();

    if (type === 'vista') {
      this.installments = 1;
      this.signatureForm.patchValue({ installments: 1 });
    } else {
      // Resetar para placeholder quando muda para prazo
      this.installments = null;
      this.signatureForm.patchValue({ installments: null });
    }

    // Limpar método de pagamento se não for compatível com o novo tipo
    const availableMethods = this.getAvailablePaymentMethods().map(m => m.value);
    if (this.paymentMethod && !availableMethods.includes(this.paymentMethod)) {
      this.paymentMethod = '';
      this.signatureForm.patchValue({ payment_method: '' });
    }
  }
  
  onPaymentMethodChange(method: string): void {
    this.paymentMethod = method;
    this.signatureForm.patchValue({ payment_method: method });
    
    // Resetar parcelas se o método não permite parcelamento
    if (!this.isPaymentMethodInstallable(method) && this.installments && this.installments > 1) {
      this.installments = 1;
      this.signatureForm.patchValue({ installments: 1 });
    }
  }
  
  getAvailablePaymentMethods(): { value: string, label: string, icon: string }[] {
    return this.paymentMethods[this.paymentType] || [];
  }
  
  isPaymentMethodInstallable(method: string): boolean {
    return method === 'Boleto' || method === 'Pix Parcelado';
  }
  
  getInstallmentOptions(): number[] {
    // Garantir que max_installments seja um número válido e não exceda 18
    let maxInstallments = this.proposal?.max_installments || 12;
    
    // Validação adicional para garantir limites sensatos
    if (maxInstallments < 1) maxInstallments = 1;
    if (maxInstallments > 18) maxInstallments = 18;
    
    const options = [];
    for (let i = 1; i <= maxInstallments; i++) {
      options.push(i);
    }
    
    return options;
  }
  
  onInstallmentsChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = parseInt(target.value, 10);
    const maxInstallments = this.proposal?.max_installments || 12;
    
    // Validar se o valor está dentro do limite permitido
    if (!isNaN(value) && value > 0 && value <= maxInstallments) {
      this.installments = value;
    } else {
      this.installments = null;
      if (value > maxInstallments) {
        this.toastr.error(`Número máximo de parcelas para esta proposta é ${maxInstallments}`);
      }
    }
    
    this.signatureForm.patchValue({ installments: this.installments });
  }
  

  formatCurrency(value: number): string {
    if (typeof value !== 'number' || value === null || value === undefined || isNaN(value)) {
      return 'R$ 0,00';
    }
    
    try {
      return this.publicProposalService.formatCurrency(value);
    } catch (error) {
      // Fallback para formatação manual
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
      }).format(value);
    }
  }

  formatDescription(description: string): SafeHtml {
    if (!description) return this.sanitizer.bypassSecurityTrustHtml('');

    // Verifica se a descrição já é HTML (vem do editor)
    const isHtml = description.includes('<') && description.includes('>');

    let formatted = description;

    if (isHtml) {
      // Se é HTML, preserva as tags mas ajusta para melhor visualização
      formatted = description
        // Adiciona quebra de linha após cada parágrafo
        .replace(/<\/p>/gi, '</p>\n')
        // Adiciona quebra de linha após cada div
        .replace(/<\/div>/gi, '</div>\n')
        // Remove parágrafos vazios mas mantém como linha em branco (apenas um <br>)
        .replace(/<p[^>]*>(&nbsp;|\s|<br\/?>)*<\/p>/gi, '<br>')
        // Remove divs vazios mas mantém como linha em branco (apenas um <br>)
        .replace(/<div[^>]*>(&nbsp;|\s|<br\/?>)*<\/div>/gi, '<br>')
        // Garante que <br> sejam respeitados
        .replace(/<br\s*\/?>/gi, '<br>')
        // Adiciona margem esquerda para todas as listas ul e ol
        .replace(/<ul>/gi, '<ul style="margin-left: 3rem !important; padding-left: 1.5rem !important;">')
        .replace(/<ol>/gi, '<ol style="margin-left: 3rem !important; padding-left: 1.5rem !important;">');
    } else {
      // Se é texto simples, preserva quebras de linha e espaços
      formatted = description
        // Substitui quebras de linha duplas por parágrafo
        .replace(/\n\n+/g, '</p><p>')
        // Substitui quebras de linha simples por <br>
        .replace(/\n/g, '<br>')
        // Preserva espaços múltiplos
        .replace(/  /g, '&nbsp;&nbsp;')
        // Preserva tabs
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

      // Envolve em parágrafo se não for HTML
      formatted = `<p>${formatted}</p>`;
    }

    // Envolve em um container com estilos para preservar formatação
    const wrapped = `<div class="service-description" style="white-space: pre-line; line-height: 1.8; font-family: inherit; color: #022c22;">${formatted}</div>`;

    return this.sanitizer.bypassSecurityTrustHtml(wrapped);
  }

  getServiceValue(service: ProposalServiceItem): number {
    // First try unit_value from proposal data, then custom_value, then service.value
    const value = service.unit_value || service.custom_value || service.service?.value || 0;
    return value;
  }

  getServiceTotal(service: ProposalServiceItem): number {
    // Use the total_value from proposal data if available, otherwise calculate
    return service.total_value || (this.getServiceValue(service) * service.quantity);
  }

  shouldShowServiceValues(): boolean {
    // Não mostrar valores individuais dos serviços quando usar valor global
    return !this.proposal?.usar_valor_global;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  getFormattedSignatureDate(): string {
    if (this.proposal?.signed_at) {
      return this.formatDate(this.proposal.signed_at);
    }
    return this.formatDate(new Date().toISOString());
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'draft': 'Rascunho',
      'sent': 'Enviada',
      'signed': 'Fechada',
      'accepted': 'Aceita',
      'rejected': 'Rejeitada',
      'expired': 'Expirada',
      'converted': 'Assinada',
      'contraproposta': 'Assinada Parcialmente'
    };
    return texts[status] || status;
  }

  // === LANDING PAGE METHODS ===

  onImageError(event: any): void {
    // Hide the image so the avatar with initials will show instead
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    
    // Force the parent element to show the placeholder
    const photoFrame = img.parentElement;
    if (photoFrame) {
      const placeholder = photoFrame.querySelector('.photo-placeholder');
      if (placeholder) {
        (placeholder as HTMLElement).style.display = 'flex';
      }
    }
  }

  onClientLogoError(event: any): void {
    // Fallback para logos de clientes
    event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIiBzdHJva2U9IiNkZGQiIHN0cm9rZS13aWR0aD0iMiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG-yPSJtaWRkbGUiIGR5PSIuM2VtIj5DbGllbnRlPC90ZXh0Pjwvc3ZnPg==';
  }

  private initializeClientLogos(): void {
    // Converte a lista de arquivos em objetos cliente
    this.clients = this.clientLogos.map(logoFile => ({
      name: this.getClientNameFromLogo(logoFile),
      logo: `/cliente-logos/${logoFile}`
    }));
    
    // Duplica a lista para criar um efeito de carousel contínuo
    this.clients = [...this.clients, ...this.clients];
  }

  private getClientNameFromLogo(logoFile: string): string {
    // Remove extensão do arquivo
    const name = logoFile.replace(/\.[^/.]+$/, "");
    
    // Mapeia nomes específicos conhecidos para uma melhor exibição
    const nameMap: { [key: string]: string } = {
      'city': 'City',
      'Logo-CMO-Construtora': 'CMO Construtora',
      'logo-adao': 'Adão',
      'Séren': 'Séren',
      'Habitat': 'Habitat',
      'TopConstrutora': 'Top Construtora',
      'raizUrbana': 'Raiz Urbana',
      'Elmo-inc': 'Elmo Incorporações',
      'myBroker': 'My Broker',
      'URBS One - Assinaturas_Separadas-01 (1)': 'URBS One',
      'URBS infinity P cima (1)': 'URBS Infinity',
      'UrbsTrend': 'URBS Trend',
      'haut': 'Haut',
      'realize': 'Realize',
      'haura_principal_preto (1)': 'Haura',
      'RDiniz': 'R. Diniz',
      'Logo-Lopes-Consultoria-de-Imoveis-2020': 'Lopes Consultoria',
      'EBM': 'EBM'
    };
    
    return nameMap[name] || name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private initializeCarousel(): void {
    this.startProgressAnimation();
  }

  private startProgressAnimation(): void {
    // Simula o progresso baseado na animação CSS
    const animationDuration = 80000; // 80s da animação CSS (muito mais rápido)
    const updateInterval = 100; // Atualiza a cada 100ms
    let elapsed = 0;

    this.progressInterval = setInterval(() => {
      if (!this.isManualControl) {
        elapsed += updateInterval;
        this.carouselProgress = (elapsed % animationDuration) / animationDuration * 100;
      }
    }, updateInterval);
  }

  // Controles simplificados
  scrollCarousel(direction: 'prev' | 'next'): void {
    this.isManualControl = true;
    
    // Simula uma mudança no progresso
    if (direction === 'next') {
      this.carouselProgress = Math.min(100, this.carouselProgress + 10);
    } else {
      this.carouselProgress = Math.max(0, this.carouselProgress - 10);
    }

    // Remove controle manual após um tempo
    if (this.manualControlTimeout) {
      clearTimeout(this.manualControlTimeout);
    }
    
    this.manualControlTimeout = setTimeout(() => {
      this.isManualControl = false;
    }, 3000);
  }

  pauseCarousel(): void {
    this.isManualControl = true;
  }

  resumeCarousel(): void {
    if (this.manualControlTimeout) {
      clearTimeout(this.manualControlTimeout);
    }
    
    this.manualControlTimeout = setTimeout(() => {
      this.isManualControl = false;
    }, 1000);
  }

  // Mouse drag methods
  startDrag(event: MouseEvent): void {
    this.isDragging = true;
    this.startX = event.clientX;
    this.initialTransformX = this.getCurrentTransformValue();
    this.pauseCarousel();
    event.preventDefault();
  }

  onDrag(event: MouseEvent): void {
    if (!this.isDragging) return;
    
    this.currentX = event.clientX;
    const deltaX = this.currentX - this.startX;
    const newTransformX = this.initialTransformX + deltaX;
    
    this.currentTransform = `translateX(${newTransformX}px)`;
    event.preventDefault();
  }

  endDrag(): void {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.currentTransform = '';
    
    // Retomar o carousel após um delay
    setTimeout(() => {
      this.resumeCarousel();
    }, 1000);
  }

  // Touch methods
  startTouch(event: TouchEvent): void {
    this.isDragging = true;
    this.startX = event.touches[0].clientX;
    this.initialTransformX = this.getCurrentTransformValue();
    this.pauseCarousel();
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    
    this.currentX = event.touches[0].clientX;
    const deltaX = this.currentX - this.startX;
    const deltaY = Math.abs(event.touches[0].clientY - event.touches[0].clientY);
    
    // Se o movimento é mais horizontal que vertical, prevenir scroll da página
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
    }
    
    const newTransformX = this.initialTransformX + deltaX;
    this.currentTransform = `translateX(${newTransformX}px)`;
  }

  endTouch(): void {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.currentTransform = '';
    
    // Retomar o carousel após um delay
    setTimeout(() => {
      this.resumeCarousel();
    }, 1000);
  }

  private getCurrentTransformValue(): number {
    // Extrair o valor atual da transform do elemento
    // Para simplificar, começamos do 0 cada vez que começamos a arrastar
    return 0;
  }

  // === MÉTODOS DE MÁSCARA ===

  onPhoneInput(event: any): void {
    let value = event.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    
    if (value.length <= 11) {
      if (value.length <= 2) {
        value = value.replace(/(\d{0,2})/, '($1');
      } else if (value.length <= 6) {
        value = value.replace(/(\d{2})(\d{0,4})/, '($1) $2');
      } else if (value.length <= 10) {
        value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
      } else {
        value = value.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
      }
    }
    
    event.target.value = value;
    this.signatureForm.patchValue({ client_phone: value });
  }

  onPhoneKeyPress(event: any): boolean {
    const char = String.fromCharCode(event.which);
    // Permite apenas números
    if (!/[0-9]/.test(char)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  onDocumentInput(event: any): void {
    let value = event.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    
    if (value.length <= 11) {
      // CPF: 000.000.000-00
      if (value.length <= 3) {
        value = value.replace(/(\d{0,3})/, '$1');
      } else if (value.length <= 6) {
        value = value.replace(/(\d{3})(\d{0,3})/, '$1.$2');
      } else if (value.length <= 9) {
        value = value.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
      } else {
        value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
      }
    } else {
      // CNPJ: 00.000.000/0000-00
      if (value.length <= 2) {
        value = value.replace(/(\d{0,2})/, '$1');
      } else if (value.length <= 5) {
        value = value.replace(/(\d{2})(\d{0,3})/, '$1.$2');
      } else if (value.length <= 8) {
        value = value.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
      } else if (value.length <= 12) {
        value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
      } else {
        value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
      }
    }
    
    event.target.value = value;
    this.signatureForm.patchValue({ client_document: value });
  }

  onDocumentKeyPress(event: any): boolean {
    const char = String.fromCharCode(event.which);
    // Permite apenas números
    if (!/[0-9]/.test(char)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  // === MÉTODOS DA EQUIPE ===

  getTeamMemberPhotoUrl(member: PublicTeamMember): string {
    // Se é usuário fixo (CEO), usar a URL fixa
    if (member.is_fixed && member.profile_picture_url) {
      return member.profile_picture_url;
    }
    
    // Se tem URL direta definida
    if (member.profile_picture_url) {
      return member.profile_picture_url;
    }
    
    // Se tem caminho de arquivo e ID válido (numérico)
    if (member.profile_picture_path && typeof member.id === 'number' && member.id > 0) {
      return this.publicTeamService.getProfilePictureUrl(member.id);
    }
    
    // Retorna string vazia se não há foto disponível
    return '';
  }

  getTeamMemberInitials(name: string): string {
    if (!name) return 'NN';
    
    const words = name.split(' ').filter(word => word.length > 0);
    
    if (words.length === 0) return 'NN';
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  trackByMemberId(index: number, member: PublicTeamMember): number | string {
    return member.id;
  }

  // === TEAM CAROUSEL METHODS ===

  private initializeTeamCarousel(): void {
    if (this.teamMembers.length > 0) {
      // Criar muitas cópias para carrossel verdadeiramente infinito
      const copies = 10; // Mais cópias = mais tempo sem reset
      this.duplicatedTeamMembers = [];
      for (let i = 0; i < copies; i++) {
        this.duplicatedTeamMembers = [...this.duplicatedTeamMembers, ...this.teamMembers];
      }
      this.startInfiniteCarousel();
    }
  }

  private startInfiniteCarousel(): void {
    let position = 0;
    const speed = 2; // pixels por frame (mais rápido)

    const animate = () => {
      if (!this.isTeamManualControl && !this.isTeamDragging) {
        position += speed;
        this.currentTeamTransform = `translateX(-${position}px)`;
        
        // Só resetar depois de MUITO tempo (com 10 cópias nunca vai ser visível)
        if (position > 50000) { // Reset após 50.000 pixels (imperceptível)
          position = 0;
        }
      }
      
      this.teamAnimationId = requestAnimationFrame(animate);
    };
    
    animate();
  }


  pauseTeamCarousel(): void {
    this.isTeamManualControl = true;
  }

  resumeTeamCarousel(): void {
    if (this.teamManualControlTimeout) {
      clearTimeout(this.teamManualControlTimeout);
    }
    
    this.teamManualControlTimeout = setTimeout(() => {
      this.isTeamManualControl = false;
    }, 1000);
  }

  // Mouse drag methods para equipe
  startTeamDrag(event: MouseEvent): void {
    this.isTeamDragging = true;
    this.teamStartX = event.clientX;
    this.teamInitialTransformX = this.getCurrentTeamTransformValue();
    this.pauseTeamCarousel();
    event.preventDefault();
  }

  onTeamDrag(event: MouseEvent): void {
    if (!this.isTeamDragging) return;
    
    this.teamCurrentX = event.clientX;
    const deltaX = this.teamCurrentX - this.teamStartX;
    const newTransformX = this.teamInitialTransformX + deltaX;
    
    this.currentTeamTransform = `translateX(${newTransformX}px)`;
    event.preventDefault();
  }

  endTeamDrag(): void {
    if (!this.isTeamDragging) return;
    
    this.isTeamDragging = false;
    this.currentTeamTransform = '';
    
    // Retomar o carousel após um delay
    setTimeout(() => {
      this.resumeTeamCarousel();
    }, 1000);
  }

  // Touch methods para equipe
  startTeamTouch(event: TouchEvent): void {
    this.isTeamDragging = true;
    this.teamStartX = event.touches[0].clientX;
    this.teamInitialTransformX = this.getCurrentTeamTransformValue();
    this.pauseTeamCarousel();
  }

  onTeamTouchMove(event: TouchEvent): void {
    if (!this.isTeamDragging) return;
    
    this.teamCurrentX = event.touches[0].clientX;
    const deltaX = this.teamCurrentX - this.teamStartX;
    const deltaY = Math.abs(event.touches[0].clientY - event.touches[0].clientY);
    
    // Se o movimento é mais horizontal que vertical, prevenir scroll da página
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
    }
    
    const newTransformX = this.teamInitialTransformX + deltaX;
    this.currentTeamTransform = `translateX(${newTransformX}px)`;
  }

  endTeamTouch(): void {
    if (!this.isTeamDragging) return;
    
    this.isTeamDragging = false;
    this.currentTeamTransform = '';
    
    // Retomar o carousel após um delay
    setTimeout(() => {
      this.resumeTeamCarousel();
    }, 1000);
  }

  private getCurrentTeamTransformValue(): number {
    // Extrair o valor atual da transform do elemento
    // Para simplificar, começamos do 0 cada vez que começamos a arrastar
    return 0;
  }

  // Método para obter a porcentagem de desconto atual (para exibição)
  getCurrentDiscountPercentage(): number {
    if (!this.areAllServicesSelected()) {
      return 0;
    }

    const baseTotal = this.getBaseTotal();
    if (baseTotal === 0) {
      return 0;
    }

    if (this.paymentType === 'vista') {
      // Se há valor absoluto, calcular a porcentagem equivalente
      const vistaDiscountValue = Number(this.proposal?.vista_discount_value);
      if (!isNaN(vistaDiscountValue) && vistaDiscountValue > 0) {
        return Math.min(100, (vistaDiscountValue / baseTotal) * 100);
      }
      // Retornar a porcentagem direta
      const vistaDiscountPercentage = Number(this.proposal?.vista_discount_percentage);
      return (!isNaN(vistaDiscountPercentage) && vistaDiscountPercentage > 0) ? vistaDiscountPercentage : 0;
    } else {
      // Se há valor absoluto, calcular a porcentagem equivalente
      const prazoDiscountValue = Number(this.proposal?.prazo_discount_value);
      if (!isNaN(prazoDiscountValue) && prazoDiscountValue > 0) {
        return Math.min(100, (prazoDiscountValue / baseTotal) * 100);
      }
      // Retornar a porcentagem direta
      const prazoDiscountPercentage = Number(this.proposal?.prazo_discount_percentage);
      return (!isNaN(prazoDiscountPercentage) && prazoDiscountPercentage > 0) ? prazoDiscountPercentage : 0;
    }
  }

  // Método auxiliar para verificar se há desconto à vista
  hasVistaDiscount(): boolean {
    const vistaDiscountValue = Number(this.proposal?.vista_discount_value);
    const vistaDiscountPercentage = Number(this.proposal?.vista_discount_percentage);
    return (!isNaN(vistaDiscountValue) && vistaDiscountValue > 0) ||
           (!isNaN(vistaDiscountPercentage) && vistaDiscountPercentage > 0);
  }

  // Método auxiliar para verificar se há desconto a prazo
  hasPrazoDiscount(): boolean {
    const prazoDiscountValue = Number(this.proposal?.prazo_discount_value);
    const prazoDiscountPercentage = Number(this.proposal?.prazo_discount_percentage);
    return (!isNaN(prazoDiscountValue) && prazoDiscountValue > 0) ||
           (!isNaN(prazoDiscountPercentage) && prazoDiscountPercentage > 0);
  }

  // Método para fechar o modal de sucesso
  closeSuccessModal(): void {
    this.showSuccessModal = false;
  }

  // Método para toggle do formulário de assinatura
  toggleSignatureForm(): void {
    this.isSignatureFormExpanded = !this.isSignatureFormExpanded;

    // Se está expandindo, inicializar o canvas de assinatura após um delay
    if (this.isSignatureFormExpanded) {
      setTimeout(() => {
        this.initializeSignatureCanvas();
      }, 300); // Aguardar a animação de expansão
    }
  }
}