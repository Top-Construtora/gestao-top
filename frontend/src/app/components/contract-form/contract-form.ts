import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ContractService, CreateContractRequest, UpdateContractRequest, ContractServiceItem, ContractInstallment, ApiContractInstallment, UserAssignment } from '../../services/contract';
import { ClientService, ApiClient } from '../../services/client';
import { ServiceService, ApiService } from '../../services/service';
import { ModalService } from '../../services/modal.service';
import { UserService } from '../../services/user';
import { AuthService } from '../../services/auth';
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { UserSelectionModalComponent } from '../user-selection-modal/user-selection-modal';
import { CurrencyMaskDirective } from '../../directives/currency-mask.directive';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { InstallmentsManagerComponent } from '../installments-manager/installments-manager';
import { InstallmentsModalComponent } from '../installments-modal/installments-modal';
import { PaymentMethodService } from '../../services/payment-method.service';

interface SelectedService {
  service_id: number;
  name: string;
  unit_value: number;
  total_value: number;
  duration: number | null;
  duration_unit: string; // Added this property
  category: string;
}

interface AssignableUser {
  id: number;
  name: string;
  email: string;
}

interface AssignedUser {
  id: number;
  user: {
    id: number;
    name: string;
    email: string;
  };
  role: 'owner' | 'editor' | 'viewer';
}

@Component({
  selector: 'app-contract-form',
  standalone: true,
  imports: [CommonModule, FormsModule, UserSelectionModalComponent, CurrencyMaskDirective, BreadcrumbComponent, InstallmentsManagerComponent, InstallmentsModalComponent],
  templateUrl: './contract-form.html',
  styleUrls: ['./contract-form.css'],
})
export class ContractFormComponent implements OnInit {
  private contractService = inject(ContractService);
  private clientService = inject(ClientService);
  private serviceService = inject(ServiceService);
  private modalService = inject(ModalService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private breadcrumbService = inject(BreadcrumbService);
  private paymentMethodService = inject(PaymentMethodService);

  formData: any = {
    contract_number: '',
    client_id: null as number | null,
    type: 'Full' as 'Full' | 'Pontual' | 'Individual',
    status: 'active' as 'active' | 'completed' | 'cancelled' | 'suspended',
    start_date: '',
    end_date: '',
    notes: '',
    payment_method: '',
    payment_method_1: '',
    payment_method_2: '',
    payment_method_1_value_type: 'percentage' as 'percentage' | 'value',
    payment_method_1_value: null as number | null,
    payment_method_1_percentage: null as number | null,
    payment_method_2_value_type: 'percentage' as 'percentage' | 'value',
    payment_method_2_value: null as number | null,
    payment_method_2_percentage: null as number | null,
    expected_payment_date: '',
    payment_status: 'pendente' as 'pago' | 'pendente',
    installment_count: 1,
    barter_type: null as 'percentage' | 'value' | null,
    barter_value: null as number | null,
    barter_percentage: null as number | null,
    secondary_payment_method: '',
  };

  contractStatuses = [
    { value: 'active', label: 'Ativo' },
    { value: 'completed', label: 'Concluído' },
    { value: 'suspended', label: 'Suspenso' },
    { value: 'cancelled', label: 'Cancelado' }
  ];

  availableServices: ApiService[] = [];
  selectedServices: SelectedService[] = [];
  clients: ApiClient[] = [];
  contractTypes = ['Full', 'Pontual', 'Individual'];
  assignedUsers: AssignedUser[] = [];
  paymentMethods = this.contractService.getPaymentMethods();
  hasSecondPaymentMethod: boolean = false;
  
  // Sistema simples de múltiplas formas de pagamento
  dynamicPaymentMethods: Array<{
    payment_method: string;
    value_type: 'percentage' | 'fixed_value';
    percentage?: number;
    fixed_value?: number;
    installment_count?: number;
    first_installment_date?: string;
  }> = [
    { payment_method: '', value_type: 'percentage', percentage: 100, installment_count: 1 }
  ];
  
  // Propriedades para parcelamento
  contractInstallments: ContractInstallment[] = [];
  apiInstallments: ApiContractInstallment[] = [];
  firstInstallmentDate: string = '';
  
  availableRoles = [
    { value: 'owner', label: 'Proprietário' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Visualizador' }
  ];

  allUsers: AssignableUser[] = [];
  currentUserId: number | null = null;

  isLoading = true;
  isSaving = false;
  isEditMode = false;
  isViewMode = false;
  isInstallmentsModalOpen = false;
  isUserModalOpen = false;
  contractId: number | null = null;
  errors: any = {};

  showServiceModal = false;
  serviceSearchTerm = '';
  serviceCategoryFilter = '';
  
  // Propriedades para Permuta
  showBarterOptions = false;
  remainingValue = 0;
  secondaryInstallmentCount = 1;
  secondaryInstallments: ContractInstallment[] = [];
  secondaryFirstInstallmentDate = '';

  ngOnInit() {
    this.currentUserId = this.authService.getUser()?.id ?? null;
    const id = this.route.snapshot.paramMap.get('id');
    const isView = this.route.snapshot.url.some(
      (segment) => segment.path === 'view'
    );

    if (id) {
      this.contractId = parseInt(id);
      this.isEditMode = !isView;
      this.isViewMode = isView;
      this.setBreadcrumb(id, isView);
      this.loadContract();
    } else {
      this.setBreadcrumb();
      this.generateContractNumber();
      this.setDefaultFirstInstallmentDate();
      this.addCurrentUserAsOwner();
      this.isLoading = false;
    }

    this.loadInitialData();
  }

  private setBreadcrumb(id?: string, isView?: boolean) {
    const baseBreadcrumbs: any[] = [
      { label: 'Home', url: '/home/dashboard', icon: 'fas fa-home' },
      { label: 'Contratos', url: '/home/contracts' }
    ];

    if (id) {
      if (isView) {
        baseBreadcrumbs.push({ label: `Visualizar Contrato #${id}` });
      } else {
        baseBreadcrumbs.push({ label: `Editar Contrato #${id}` });
      }
    } else {
      baseBreadcrumbs.push({ label: 'Novo Contrato' });
    }

    this.breadcrumbService.setBreadcrumbs(baseBreadcrumbs);
  }

  private setDefaultFirstInstallmentDate() {
    if (!this.firstInstallmentDate) {
      // Usar data local sem conversão UTC
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      // Formatar manualmente para evitar conversão UTC
      const year = nextMonth.getFullYear();
      const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
      const day = String(nextMonth.getDate()).padStart(2, '0');
      this.firstInstallmentDate = `${year}-${month}-${day}`;
    }
  }

  private addCurrentUserAsOwner() {
    const currentUser = this.authService.getUser();
    if (currentUser && this.currentUserId) {
      this.assignedUsers.push({
        id: 0,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email
        },
        role: 'owner'
      });
    }
  }

  private ensureCurrentUserInAssignedUsers() {
    const currentUser = this.authService.getUser();
    if (!currentUser || !this.currentUserId) return;

    // Verificar se o usuário atual já está no array
    const userExists = this.assignedUsers.some(u => u.user.id === this.currentUserId);

    if (!userExists) {
      // Adicionar usuário atual como owner se não estiver no array
      this.assignedUsers.push({
        id: 0,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email
        },
        role: 'owner'
      });
    }
  }

  loadInitialData() {
    this.loadClients();
    this.loadServices();
    this.loadUsersForAssignment();
  }

  async loadUsersForAssignment() {
    try {
      const response = await firstValueFrom(this.userService.getUsers());
      if (response && response.users) {
        this.allUsers = response.users
          .filter((user) => user.id !== this.currentUserId)
          .map((user) => ({ id: user.id, name: user.name, email: user.email }));
      }
    } catch (error) {
      console.error('❌ Error loading users:', error);
    }
  }

  async generateContractNumber() {
    try {
      const response = await firstValueFrom(
        this.contractService.generateContractNumber()
      );
      if (response) {
        this.formData.contract_number = response.contractNumber;
      }
    } catch (error) {
      console.error('❌ Error generating contract number:', error);
    }
  }

  async loadContract() {
    if (!this.contractId) {
        this.isLoading = false;
        return;
    }
    this.isLoading = true;
    try {
      const response = await firstValueFrom(
        this.contractService.getContract(this.contractId)
      );
      if (response && response.contract) {
        const contract = response.contract as any;
        this.formData = {
          contract_number: contract.contract_number,
          client_id: contract.client.id,
          type: contract.type,
          status: contract.status,
          start_date: contract.start_date.split('T')[0],
          end_date: contract.end_date ? contract.end_date.split('T')[0] : '',
          notes: contract.notes || '',
          payment_method: contract.payment_method || '',
          payment_method_1: contract.payment_method_1 || contract.payment_method || '',
          payment_method_2: contract.payment_method_2 || contract.secondary_payment_method || '',
          payment_method_1_value_type: contract.payment_method_1_value_type || 'percentage',
          payment_method_1_value: contract.payment_method_1_value || null,
          payment_method_1_percentage: contract.payment_method_1_percentage || null,
          payment_method_2_value_type: contract.payment_method_2_value_type || 'percentage',
          payment_method_2_value: contract.payment_method_2_value || null,
          payment_method_2_percentage: contract.payment_method_2_percentage || null,
          expected_payment_date: contract.expected_payment_date ? contract.expected_payment_date.split('T')[0] : '',
          payment_status: contract.payment_status || 'pendente',
          installment_count: contract.installment_count || 1,
          barter_type: contract.barter_type || null,
          barter_value: contract.barter_value || null,
          barter_percentage: contract.barter_percentage || null,
          secondary_payment_method: contract.secondary_payment_method || '',
        };
        
        // Primeiro, carregar os serviços para que getTotalValue() funcione corretamente
        this.selectedServices = contract.contract_services.map((cs: any) => {
            const selectedService: SelectedService = {
              service_id: cs.service.id,
              name: cs.service.name,
              unit_value: cs.unit_value,
              total_value: cs.total_value,
              duration: cs.service.duration,
              duration_unit: cs.service.duration_unit,
              category: cs.service.category,
            };

            return selectedService;
          });

        // Agora carregar formas de pagamento no array dynamicPaymentMethods
        this.dynamicPaymentMethods = [];

        // Primeira forma de pagamento
        if (contract.payment_method || contract.payment_method_1) {
          const firstMethod: any = {
            payment_method: contract.payment_method_1 || contract.payment_method || '',
            value_type: contract.payment_method_1_value_type || 'percentage',
            installment_count: contract.installment_count || 1,
            first_installment_date: ''
          };

          if (firstMethod.value_type === 'percentage') {
            firstMethod.percentage = contract.payment_method_1_percentage ||
              (!this.formData.payment_method_2 ? 100 : 50); // Se só tem uma forma, 100%, senão 50%
          } else {
            firstMethod.fixed_value = contract.payment_method_1_value || this.getTotalValue();
          }

          this.dynamicPaymentMethods.push(firstMethod);
        }

        // Segunda forma de pagamento (se existir)
        if (contract.payment_method_2 || contract.secondary_payment_method) {
          const secondMethod: any = {
            payment_method: contract.payment_method_2 || contract.secondary_payment_method || '',
            value_type: contract.payment_method_2_value_type || 'percentage',
            installment_count: 1
          };

          if (secondMethod.value_type === 'percentage') {
            secondMethod.percentage = contract.payment_method_2_percentage || 50;
          } else {
            secondMethod.fixed_value = contract.payment_method_2_value || 0;
          }

          this.dynamicPaymentMethods.push(secondMethod);
        }

        // Se não há formas de pagamento, criar uma vazia
        if (this.dynamicPaymentMethods.length === 0) {
          this.dynamicPaymentMethods.push({
            payment_method: '',
            value_type: 'percentage',
            percentage: 100,
            installment_count: 1
          });
        }

        // Definir se tem segunda forma de pagamento baseado no array carregado
        this.hasSecondPaymentMethod = this.dynamicPaymentMethods.length > 1;

        // Se tiver permuta, mostrar as opções
        if (contract.payment_method === 'Permuta' ||
            this.dynamicPaymentMethods.some(m => m.payment_method === 'Permuta')) {
          this.showBarterOptions = true;
          this.calculateRemainingValue();
        }

        this.assignedUsers = contract.assigned_users || [];

        // Garantir que o usuário atual está no array de assignedUsers ao editar
        this.ensureCurrentUserInAssignedUsers();

        // Carregar first_installment_date se existir no contrato
        if (contract.first_installment_date) {
          this.firstInstallmentDate = contract.first_installment_date.split('T')[0];

          // Sincronizar com dynamicPaymentMethods se já foi criado
          if (this.dynamicPaymentMethods.length > 0 && this.dynamicPaymentMethods[0]) {
            this.dynamicPaymentMethods[0].first_installment_date = this.firstInstallmentDate;
          }
        }

        // Carregar parcelas se existirem
        if (contract.installments && contract.installments.length > 0) {
          this.apiInstallments = contract.installments;

          // Se não houver first_installment_date no contrato, usar a data da primeira parcela
          if (!this.firstInstallmentDate && contract.installments[0] && contract.installments[0].due_date) {
            this.firstInstallmentDate = contract.installments[0].due_date.split('T')[0];

            // Atualizar também no dynamicPaymentMethods se tiver parcelas
            if (this.dynamicPaymentMethods.length > 0) {
              const firstMethod = this.dynamicPaymentMethods[0];
              if (firstMethod && firstMethod.installment_count && firstMethod.installment_count > 1) {
                // Encontrar a primeira parcela (menor número de parcela)
                const firstInstallment = contract.installments.reduce((min: any, curr: any) =>
                  curr.installment_number < min.installment_number ? curr : min
                );
                firstMethod.first_installment_date = firstInstallment.due_date.split('T')[0];
              }
            }
          }
        }
      }
    } catch (error) {
      this.modalService.showError('Erro ao carregar contrato');
      this.router.navigate(['/home/contratos']);
    } finally {
      this.isLoading = false;
    }
  }

  async loadClients() {
    try {
      const response = await firstValueFrom(
        this.clientService.getClients({ is_active: true })
      );
      if (response && response.clients) {
        this.clients = response.clients.sort((a, b) => 
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
    } catch (error) {
      console.error('❌ Error loading clients:', error);
    }
  }

  async loadServices() {
    try {
      const response = await firstValueFrom(
        this.serviceService.getServicesForContracts({ is_active: true })
      );
      if (response && response.services) {
        // Filtrar serviços da categoria 'Interno' para não aparecerem na edição de contratos
        this.availableServices = response.services
          .filter((service) => service.category !== 'Interno')
          .sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );
      }
    } catch (error) {
      console.error('❌ Error loading services:', error);
    }
  }

  onRoleChangeLocal(assignedUser: AssignedUser, newRole: string): void {
    if (this.isEditMode && this.contractId) {
      this.onRoleChange(assignedUser, newRole);
    } else {
      assignedUser.role = newRole as 'owner' | 'editor' | 'viewer';
    }
  }

  async onRoleChange(assignedUser: AssignedUser, newRole: string) {
    if (!this.contractId) return;

    try {
      await firstValueFrom(this.contractService.updateUserRole(this.contractId, assignedUser.user.id, newRole));
      this.modalService.showSuccess(`Permissão de ${assignedUser.user.name} alterada para ${this.getRoleLabel(newRole)}.`);
      assignedUser.role = newRole as 'owner' | 'editor' | 'viewer';
    } catch (error) {
      console.error('Error updating user role:', error);
      this.modalService.showError('Não foi possível alterar a permissão do usuário.');
      this.loadContract(); 
    }
  }

  getRoleLabel(roleValue: string): string {
    const allRoles = [
      { value: 'owner', label: 'Proprietário' },
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Visualizador' }
    ];
    return allRoles.find(r => r.value === roleValue)?.label || roleValue;
  }

  async applyUserPermissions(contractId: number): Promise<void> {
    for (const assignedUser of this.assignedUsers) {
      try {
        await firstValueFrom(
          this.contractService.updateUserRole(contractId, assignedUser.user.id, assignedUser.role)
        );
      } catch (error) {
        console.error(`Erro ao aplicar permissão para usuário ${assignedUser.user.name}:`, error);
        // Não exibir erro para o usuário pois o contrato já foi criado
      }
    }
  }

  get filteredServices(): ApiService[] {
    let services = this.availableServices;

    if (this.serviceCategoryFilter) {
      services = services.filter(s => s.category === this.serviceCategoryFilter);
    }

    if (this.serviceSearchTerm) {
      const search = this.serviceSearchTerm.toLowerCase();
      services = services.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.category?.toLowerCase().includes(search)
      );
    }

    return services.sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }

  formatDate(dateString: string): string {
    return this.contractService.formatDate(dateString);
  }

  formatServiceDuration(service: ApiService): string {
    return this.serviceService.formatDuration(service.duration_amount, service.duration_unit);
  }

  get availableCategories(): string[] {
    const categories = this.availableServices
      .map(s => s.category || 'Geral')
      .filter((category, index, self) => self.indexOf(category) === index)
      .filter(category => category !== 'Interno') // Excluir categoria 'Interno' da lista
      .sort();
    return categories;
  }

  openServiceModal() {
    this.showServiceModal = true;
    this.serviceSearchTerm = '';
    this.serviceCategoryFilter = '';
  }

  closeServiceModal() {
    this.showServiceModal = false;
    this.serviceSearchTerm = '';
    this.serviceCategoryFilter = '';
  }

  addService(service: ApiService) {
    const newService: any = {
      service_id: service.id,
      name: service.name,
      unit_value: 0,
      total_value: 0,
      duration: service.duration_amount || null,
      duration_unit: service.duration_unit,
      category: service.category || 'Geral',
    };

    this.selectedServices.push(newService);
    this.closeServiceModal();
  }

  removeService(index: number) {
    this.selectedServices.splice(index, 1);
  }

  onPriceChange(index: number, priceInReais: number) {
    const service = this.selectedServices[index];
    if (priceInReais < 0) {
      priceInReais = 0;
    }
    service.unit_value = priceInReais;
    service.total_value = service.unit_value; 
    
    this.formData.total_value = this.getTotalValue();
    
    // Atualizar lógica de forma única quando valor total mudar
    this.updateSinglePaymentMethodLogic();
    
    // Recriar parcelas se necessário
    if (this.formData.installment_count > 1 && this.firstInstallmentDate) {
      this.generateInstallments();
    }
  }

  getTotalValue(): number {
    return this.selectedServices.reduce((sum, s) => sum + s.total_value, 0);
  }

  getFormattedTotalValue(): string {
    return this.contractService.formatValue(this.getTotalValue());
  }

  openUserModal(): void {
    this.isUserModalOpen = true;
  }
  
  closeUserModal(): void {
    this.isUserModalOpen = false;
  }

  getAssignedUserIds(): number[] {
    return this.assignedUsers.map(u => u.user.id);
  }

  updateAssignedUsers(selectedIds: number[]): void {
    const currentIds = new Set(this.assignedUsers.map(u => u.user.id));
    selectedIds.forEach(id => {
        if (!currentIds.has(id)) {
            const userToAdd = this.allUsers.find(u => u.id === id);
            if (userToAdd) {
                this.assignedUsers.push({
                    id: 0, 
                    user: {
                        id: userToAdd.id,
                        name: userToAdd.name,
                        email: userToAdd.email
                    },
                    role: 'editor' 
                });
            }
        }
    });
    this.closeUserModal();
  }

  removeUser(userToRemove: AssignedUser): void {
      const userIndex = this.assignedUsers.findIndex(u => u.user.id === userToRemove.user.id);
      if (userIndex > -1) {
          this.assignedUsers.splice(userIndex, 1);
      }
  }

  validateForm(): boolean {
    this.errors = {};
    if (!this.formData.contract_number)
      this.errors.contract_number = 'Número do contrato é obrigatório';
    if (!this.formData.client_id)
      this.errors.client_id = 'Cliente é obrigatório';
    if (!this.formData.start_date)
      this.errors.start_date = 'Data de início é obrigatória';
    if (this.selectedServices.length === 0)
      this.errors.services = 'Pelo menos um serviço deve ser adicionado';
    return Object.keys(this.errors).length === 0;
  }

  async save() {
    console.log('💾 [Frontend] Iniciando save()...');
    console.log('📅 [Frontend] firstInstallmentDate no início do save:', this.firstInstallmentDate);
    console.log('📅 [Frontend] dynamicPaymentMethods[0]:', this.dynamicPaymentMethods[0]);

    if (!this.validateForm()) {
      this.modalService.showWarning('Por favor, corrija os erros no formulário', 'Formulário Inválido');
      return;
    }
    this.isSaving = true;

    // Garantir que o usuário atual está no array de assignedUsers antes de salvar
    this.ensureCurrentUserInAssignedUsers();

    const userIdsToSave = this.assignedUsers.map(u => u.user.id);

    try {
      const services: ContractServiceItem[] = this.selectedServices.map(
        (s) => ({
          service_id: s.service_id,
          unit_value: s.unit_value
        })
      );
      
      // Se houver permuta com valor restante e parcelamento, combinar as parcelas
      let finalInstallments = this.contractInstallments;
      if (this.formData.payment_method === 'Permuta' && this.remainingValue > 0 && this.secondaryInstallments.length > 0) {
        finalInstallments = this.secondaryInstallments;
        this.formData.installment_count = this.secondaryInstallmentCount;
      }

      // Atualizar os dados das formas de pagamento baseado no array dynamicPaymentMethods
      const firstMethod = this.dynamicPaymentMethods[0];
      const secondMethod = this.dynamicPaymentMethods[1];

      if (firstMethod) {
        this.formData.payment_method = firstMethod.payment_method;
        this.formData.payment_method_1 = firstMethod.payment_method;
        this.formData.payment_method_1_value_type = firstMethod.value_type;
        this.formData.payment_method_1_percentage = firstMethod.percentage || null;
        this.formData.payment_method_1_value = firstMethod.fixed_value || null;
        this.formData.installment_count = firstMethod.installment_count || 1;
      }

      if (secondMethod) {
        this.formData.payment_method_2 = secondMethod.payment_method;
        this.formData.secondary_payment_method = secondMethod.payment_method;
        this.formData.payment_method_2_value_type = secondMethod.value_type;
        this.formData.payment_method_2_percentage = secondMethod.percentage || null;
        this.formData.payment_method_2_value = secondMethod.fixed_value || null;
      } else {
        // Limpar segunda forma se não existir
        this.formData.payment_method_2 = '';
        this.formData.secondary_payment_method = '';
        this.formData.payment_method_2_value_type = 'percentage';
        this.formData.payment_method_2_percentage = null;
        this.formData.payment_method_2_value = null;
      }

      if (this.isEditMode && this.contractId) {
        console.log('📅 [Frontend] firstInstallmentDate antes de salvar:', this.firstInstallmentDate);

        const updateData: UpdateContractRequest = {
          contract_number: this.formData.contract_number,
          client_id: this.formData.client_id!,
          type: this.formData.type,
          start_date: this.formData.start_date,
          end_date: this.formData.end_date || null,
          services: services,
          notes: this.formData.notes || null,
          status: this.formData.status,
          assigned_users: userIdsToSave,
          payment_method: this.formData.payment_method || this.getMainPaymentMethod(),
          expected_payment_date: this.formData.expected_payment_date || null,
          first_installment_date: this.firstInstallmentDate || null,
          payment_status: this.formData.payment_status,
          installment_count: this.formData.installment_count || 1,
          installments: finalInstallments,
          barter_type: this.formData.barter_type || null,
          barter_value: this.formData.barter_value || null,
          barter_percentage: this.formData.barter_percentage || null,
          secondary_payment_method: this.formData.secondary_payment_method || null,
        };

        console.log('📤 [Frontend] Dados que serão enviados ao backend:', JSON.stringify(updateData, null, 2));

        await firstValueFrom(
          this.contractService.updateContract(this.contractId, updateData)
        );
        this.modalService.showSuccess('Contrato atualizado com sucesso!', 'Sucesso');
      } else {
        const createData: CreateContractRequest = {
          contract_number: this.formData.contract_number,
          client_id: this.formData.client_id!,
          type: this.formData.type,
          start_date: this.formData.start_date,
          end_date: this.formData.end_date || null,
          notes: this.formData.notes || null,
          services,
          assigned_users: userIdsToSave,
          payment_method: this.formData.payment_method || this.getMainPaymentMethod(),
          expected_payment_date: this.formData.expected_payment_date || null,
          first_installment_date: this.firstInstallmentDate || null,
          payment_status: this.formData.payment_status,
          installment_count: this.formData.installment_count || 1,
          installments: finalInstallments,
          barter_type: this.formData.barter_type || null,
          barter_value: this.formData.barter_value || null,
          barter_percentage: this.formData.barter_percentage || null,
          secondary_payment_method: this.formData.secondary_payment_method || null,
        };
        const createdContract = await firstValueFrom(this.contractService.createContract(createData));
        
        // Aplicar permissões personalizadas após criação
        if (createdContract.contract?.id) {
          await this.applyUserPermissions(createdContract.contract.id);
        }
        
        this.modalService.showSuccess('Contrato criado com sucesso!', 'Sucesso');
      }
      this.router.navigate(['/home/contratos']);
    } catch (error: any) {
      this.modalService.showError(error.error?.message || 'Erro ao salvar o contrato.', 'Erro');
    } finally {
      this.isSaving = false;
    }
  }

  cancel() {
    this.router.navigate(['/home/contratos']);
  }

  enableEdit() {
    this.isViewMode = false;
    this.isEditMode = true;
  }

  formatCurrency(value: number): string {
    return this.contractService.formatValue(value);
  }

  calculateInstallmentValue(method: any): number {
    if (!method.installment_count || method.installment_count <= 1) return 0;
    
    const totalValue = this.getTotalValue();
    if (totalValue <= 0) return 0;
    
    let methodValue = 0;
    if (method.value_type === 'percentage' && method.percentage) {
      methodValue = (totalValue * method.percentage) / 100;
    } else if (method.value_type === 'fixed_value' && method.fixed_value) {
      methodValue = method.fixed_value;
    }
    
    return methodValue / method.installment_count;
  }

  getInstallmentPreview(method: any, installmentCount: number): string {
    const totalValue = this.getTotalValue();
    if (totalValue <= 0) return 'R$ 0,00';
    
    let methodValue = 0;
    if (method.value_type === 'percentage' && method.percentage) {
      methodValue = (totalValue * method.percentage) / 100;
    } else if (method.value_type === 'fixed_value' && method.fixed_value) {
      methodValue = method.fixed_value;
    } else {
      return 'R$ --,--';
    }
    
    const installmentValue = methodValue / installmentCount;
    return this.formatCurrency(installmentValue);
  }

  getClientName(clientId: number | null): string {
    const client = this.clients.find((c) => c.id === clientId);
    return client ? client.name : '-';
  }

  getStatusText(status: string): string {
    if (!status) return '';
    return this.contractService.getStatusText(status);
  }

  getPaymentStatusText(status: string): string {
    if (!status) return 'Não informado';
    return this.contractService.getPaymentStatusText(status);
  }

  // Métodos para o modal de parcelas
  openInstallmentsModal() {
    this.isInstallmentsModalOpen = true;
  }

  closeInstallmentsModal() {
    this.isInstallmentsModalOpen = false;
  }

  handleInstallmentsSave(installments: any[]) {
    console.log('Parcelas salvas:', installments);
    this.contractInstallments = installments;
    this.closeInstallmentsModal();
  }

  // Métodos para gerenciar parcelas
  onInstallmentsChange(installments: ContractInstallment[]) {
    this.contractInstallments = installments;
  }

  onInstallmentCountChange(count: number) {
    this.formData.installment_count = count;
    
    if (count > 1 && this.getTotalValue() > 0 && this.firstInstallmentDate) {
      this.generateInstallments();
    } else if (count === 1) {
      this.contractInstallments = [];
      // Quando voltar para "À vista", resetar para a data padrão se não foi definida manualmente
      if (!this.formData.expected_payment_date) {
        this.formData.expected_payment_date = '';
      }
    }
  }

  onFirstInstallmentDateChange(date: string) {
    this.firstInstallmentDate = date;
    
    if (this.formData.installment_count > 1 && this.getTotalValue() > 0 && date) {
      this.generateInstallments();
    }
  }

  private generateInstallments() {
    if (this.getTotalValue() <= 0 || this.formData.installment_count <= 1 || !this.firstInstallmentDate) {
      return;
    }

    this.contractInstallments = this.contractService.generateInstallments(
      this.getTotalValue(),
      this.formData.installment_count,
      this.firstInstallmentDate,
      30 // intervalo padrão de 30 dias
    );

    // Atualizar data prevista para pagamento com a data da última parcela
    if (this.contractInstallments.length > 0) {
      const lastInstallment = this.contractInstallments[this.contractInstallments.length - 1];
      this.formData.expected_payment_date = lastInstallment.due_date;
    }
  }

  onPaymentMethodChange() {
    // Atualizar compatibilidade com campo antigo
    this.formData.payment_method = this.formData.payment_method_1;
    
    // Verificar se primeira forma é permuta
    if (this.formData.payment_method_1 === 'Permuta') {
      this.showBarterOptions = true;
      this.formData.barter_type = 'percentage'; // Default
      this.formData.installment_count = 1; // Permuta não permite parcelamento direto
      this.contractInstallments = [];
      this.setDefaultSecondaryFirstInstallmentDate();
    } else if (this.formData.payment_method_2 !== 'Permuta') {
      // Resetar campos de permuta apenas se nenhuma das duas for permuta
      this.showBarterOptions = false;
      this.formData.barter_type = null;
      this.formData.barter_value = null;
      this.formData.barter_percentage = null;
      this.remainingValue = 0;
      this.secondaryInstallmentCount = 1;
      this.secondaryInstallments = [];
      this.secondaryFirstInstallmentDate = '';
    }
    
    // Se não permitir parcelamento, resetar para 1 parcela
    if (!this.isPaymentMethodInstallable(this.formData.payment_method_1)) {
      this.formData.installment_count = 1;
      this.contractInstallments = [];
      this.formData.expected_payment_date = '';
    }

    // Definir valor padrão se não tiver segunda forma
    if (!this.hasSecondPaymentMethod && this.formData.payment_method_1) {
      this.formData.payment_method_1_percentage = 100; // 100% se só tem uma forma
      this.formData.payment_method_1_value = null;
    }

    this.calculateRemainingValue();
  }
  
  onBarterTypeChange() {
    // Resetar valores quando mudar o tipo
    this.formData.barter_value = null;
    this.formData.barter_percentage = null;
    this.calculateRemainingValue();
  }
  
  calculateRemainingValue() {
    const totalValue = this.getTotalValue();
    let barterAmount = 0;
    
    if (this.formData.barter_type === 'percentage' && this.formData.barter_percentage) {
      // Limitar porcentagem a 100%
      if (this.formData.barter_percentage > 100) {
        this.formData.barter_percentage = 100;
      } else if (this.formData.barter_percentage < 0) {
        this.formData.barter_percentage = 0;
      }
      barterAmount = (totalValue * this.formData.barter_percentage) / 100;
    } else if (this.formData.barter_type === 'value' && this.formData.barter_value) {
      // Limitar valor ao total do contrato
      if (this.formData.barter_value > totalValue) {
        this.formData.barter_value = totalValue;
        this.modalService.showWarning('O valor da permuta não pode ser maior que o valor total do contrato');
      } else if (this.formData.barter_value < 0) {
        this.formData.barter_value = 0;
      }
      barterAmount = this.formData.barter_value;
    }
    
    // Garantir que o valor da permuta não exceda o valor total
    barterAmount = Math.min(barterAmount, totalValue);
    this.remainingValue = Math.max(0, totalValue - barterAmount);
    
    // Se não houver valor restante, limpar forma de pagamento secundária
    if (this.remainingValue === 0) {
      this.formData.secondary_payment_method = '';
      this.secondaryInstallmentCount = 1;
      this.secondaryInstallments = [];
    } else {
      // Se houver valor restante e forma de pagamento secundária for parcelável, gerar parcelas
      if (this.formData.secondary_payment_method && 
          this.isPaymentMethodInstallable(this.formData.secondary_payment_method) && 
          this.secondaryInstallmentCount > 1 &&
          this.secondaryFirstInstallmentDate) {
        this.generateSecondaryInstallments();
      }
    }
  }
  
  onBarterValueChange() {
    this.calculateRemainingValue();
  }

  isServiceSelected(serviceId: number): boolean {
    return this.selectedServices.some((s) => s.service_id === serviceId);
  }

  hasSelectedServices(): boolean {
    // Verificar se há pelo menos um serviço que não seja interno
    return this.selectedServices.filter(s => s.category !== 'Interno').length > 0;
  }

  // Retorna apenas serviços visíveis (não internos)
  getVisibleServices(): SelectedService[] {
    return this.selectedServices.filter(s => s.category !== 'Interno');
  }

  // Retorna a quantidade de serviços visíveis
  getVisibleServicesCount(): number {
    return this.getVisibleServices().length;
  }

  isPaymentMethodInstallable(paymentMethod: string): boolean {
    return this.contractService.isPaymentMethodInstallable(paymentMethod);
  }
  
  // Métodos para parcelamento secundário (valor restante após permuta)
  onSecondaryPaymentMethodChange() {
    // Atualizar compatibilidade com campo antigo
    this.formData.secondary_payment_method = this.formData.payment_method_2;
    
    // Verificar se segunda forma é permuta
    if (this.formData.payment_method_2 === 'Permuta') {
      this.showBarterOptions = true;
      this.calculateRemainingValue();
    } else if (this.formData.payment_method_1 !== 'Permuta') {
      this.showBarterOptions = false;
      this.formData.barter_type = null;
      this.formData.barter_value = null;
      this.formData.barter_percentage = null;
    }
    
    // Resetar parcelamento secundário se não permitir
    if (!this.isPaymentMethodInstallable(this.formData.secondary_payment_method)) {
      this.secondaryInstallmentCount = 1;
      this.secondaryInstallments = [];
    } else if (!this.secondaryFirstInstallmentDate) {
      this.setDefaultSecondaryFirstInstallmentDate();
    }
  }
  
  setDefaultSecondaryFirstInstallmentDate() {
    if (!this.secondaryFirstInstallmentDate) {
      // Usar data local sem conversão UTC
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      // Formatar manualmente para evitar conversão UTC
      const year = nextMonth.getFullYear();
      const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
      const day = String(nextMonth.getDate()).padStart(2, '0');
      this.secondaryFirstInstallmentDate = `${year}-${month}-${day}`;
    }
  }

  // Métodos para múltiplas formas de pagamento
  buildPaymentMethodsArray(contract: any): string[] {
    const methods: string[] = [];
    if (contract.payment_method_1 || contract.payment_method) {
      methods.push(contract.payment_method_1 || contract.payment_method);
    }
    if (contract.payment_method_2 || contract.secondary_payment_method) {
      methods.push(contract.payment_method_2 || contract.secondary_payment_method);
    }
    return methods;
  }

  onSecondPaymentMethodToggle() {
    if (!this.hasSecondPaymentMethod) {
      // Limpar segunda forma de pagamento quando desabilitada
      this.formData.payment_method_2 = '';
      this.formData.secondary_payment_method = '';
      this.formData.payment_method_2_value_type = 'percentage';
      this.formData.payment_method_2_value = null;
      this.formData.payment_method_2_percentage = null;
      
      // Se só tem uma forma, definir como 100%
      if (this.formData.payment_method_1) {
        this.formData.payment_method_1_percentage = 100;
        this.formData.payment_method_1_value = null;
      }
    } else {
      // Ao habilitar segunda forma, dividir igualmente por padrão
      if (this.formData.payment_method_1) {
        this.formData.payment_method_1_percentage = 50;
        this.formData.payment_method_1_value = null;
        this.formData.payment_method_1_value_type = 'percentage';
        
        this.formData.payment_method_2_value_type = 'percentage';
        this.formData.payment_method_2_percentage = 50;
        this.formData.payment_method_2_value = null;
      }
    }
  }

  addNewPaymentMethod() {
    // Se é a primeira forma de pagamento, configurar para 100% ou valor total
    if (this.dynamicPaymentMethods.length === 0) {
      this.dynamicPaymentMethods.push({
        payment_method: '',
        value_type: 'percentage',
        percentage: 100,
        fixed_value: this.getTotalValue(),
        installment_count: 1
      });
    } else {
      // Se já há formas, redistribuir os valores
      this.redistributePaymentValues();
      this.dynamicPaymentMethods.push({
        payment_method: '',
        value_type: 'percentage',
        percentage: 0,
        installment_count: 1
      });
    }
    
    this.updateSinglePaymentMethodLogic();
  }

  removePaymentMethod(index: number) {
    if (this.dynamicPaymentMethods.length > 1) {
      this.dynamicPaymentMethods.splice(index, 1);
      this.updateSinglePaymentMethodLogic();
    }
  }

  // Nova lógica para forma única de pagamento
  updateSinglePaymentMethodLogic() {
    if (this.dynamicPaymentMethods.length === 1) {
      const method = this.dynamicPaymentMethods[0];
      const contractTotal = this.getTotalValue();
      
      // Se for percentual, travar em 100%
      if (method.value_type === 'percentage') {
        method.percentage = 100;
      } else if (method.value_type === 'fixed_value') {
        // Se for valor fixo, usar valor total do contrato
        method.fixed_value = contractTotal;
      }
    }
  }

  redistributePaymentValues() {
    // Redistributir valores quando adicionar nova forma
    const totalMethods = this.dynamicPaymentMethods.length + 1;
    const percentagePerMethod = Math.floor(100 / totalMethods);
    
    this.dynamicPaymentMethods.forEach((method, index) => {
      if (method.value_type === 'percentage') {
        method.percentage = percentagePerMethod;
      }
    });
  }

  getMainPaymentMethod(): string | null {
    // Retorna o método de pagamento principal (da primeira forma configurada)
    const firstMethod = this.dynamicPaymentMethods.find(method => method.payment_method);
    return firstMethod?.payment_method || null;
  }

  setPaymentValueType(index: number, type: 'percentage' | 'fixed_value') {
    const method = this.dynamicPaymentMethods[index];
    if (!method) return;
    
    method.value_type = type;
    
    // Lógica especial para forma única de pagamento
    if (this.dynamicPaymentMethods.length === 1) {
      const contractTotal = this.getTotalValue();
      
      if (type === 'percentage') {
        method.percentage = 100; // Sempre 100% para forma única
        method.fixed_value = undefined;
      } else if (type === 'fixed_value') {
        method.fixed_value = contractTotal; // Valor total do contrato
        method.percentage = undefined;
      }
    } else {
      // Para múltiplas formas, limpar e deixar usuário configurar
      if (type === 'percentage') {
        method.fixed_value = undefined;
        method.percentage = method.percentage || 0;
      } else {
        method.percentage = undefined;
        method.fixed_value = method.fixed_value || 0;
      }
    }
  }

  calculatePaymentValue(method: any): number {
    if (method.value_type === 'percentage' && method.percentage) {
      return (this.getTotalValue() * method.percentage) / 100;
    } else if (method.value_type === 'fixed_value' && method.fixed_value) {
      return method.fixed_value;
    }
    return 0;
  }

  getTotalPaymentMethodsValue(): number {
    return this.dynamicPaymentMethods.reduce((total, method) => {
      return total + this.calculatePaymentValue(method);
    }, 0);
  }

  getTotalPaymentMethodsPercentage(): number {
    const totalValue = this.getTotalValue();
    if (totalValue === 0) return 0;
    
    return (this.getTotalPaymentMethodsValue() / totalValue) * 100;
  }

  isInstallmentSupported(paymentMethod: string): boolean {
    // Lista de métodos que suportam parcelamento
    const installmentMethods = ['Boleto', 'Pix Parcelado', 'À Prazo'];
    return installmentMethods.includes(paymentMethod);
  }

  onPaymentInstallmentCountChange(methodIndex: number, installmentCount: number) {
    this.dynamicPaymentMethods[methodIndex].installment_count = installmentCount;

    // Sincronizar com formData se for o primeiro método
    if (methodIndex === 0) {
      this.formData.installment_count = installmentCount;
      console.log(`📅 [Sync] formData.installment_count atualizado para: ${installmentCount}`);

      // Regenerar parcelas se necessário
      if (installmentCount > 1 && this.getTotalValue() > 0 && this.firstInstallmentDate) {
        this.generateInstallments();
      } else if (installmentCount === 1) {
        this.contractInstallments = [];
      }
    }

    console.log(`📅 Método ${methodIndex + 1}: ${installmentCount}x`);
  }

  onPaymentFirstInstallmentDateChange(methodIndex: number, date: string) {
    this.dynamicPaymentMethods[methodIndex].first_installment_date = date;

    // Sincronizar com a variável principal se for o primeiro método
    if (methodIndex === 0) {
      this.firstInstallmentDate = date;
      console.log(`📅 [Sync] firstInstallmentDate atualizado para: ${date}`);

      // Regenerar parcelas se necessário
      if (this.formData.installment_count > 1 && this.getTotalValue() > 0 && date) {
        this.generateInstallments();
      }
    }

    console.log(`📅 Método ${methodIndex + 1} primeira parcela: ${date}`);
  }

  // Método removido - usando sistema simples interno
  // onPaymentMethodsChanged(paymentMethods: PaymentMethod[]) { ... }

  setPaymentMethod1Type(type: 'percentage' | 'value') {
    this.formData.payment_method_1_value_type = type;
    if (type === 'percentage') {
      this.formData.payment_method_1_value = null;
    } else {
      this.formData.payment_method_1_percentage = null;
    }
    this.adjustSecondPaymentValue();
  }

  setPaymentMethod2Type(type: 'percentage' | 'value') {
    this.formData.payment_method_2_value_type = type;
    if (type === 'percentage') {
      this.formData.payment_method_2_value = null;
    } else {
      this.formData.payment_method_2_percentage = null;
    }
    this.adjustFirstPaymentValue();
  }

  // Ajustar segunda forma baseada na primeira
  adjustSecondPaymentValue() {
    if (!this.hasSecondPaymentMethod || !this.formData.payment_method_2) return;
    
    const contractTotal = this.getTotalValue();
    if (contractTotal <= 0) return;

    let firstValue = 0;
    
    // Calcular valor da primeira forma
    if (this.formData.payment_method_1_value_type === 'percentage' && this.formData.payment_method_1_percentage) {
      firstValue = (contractTotal * this.formData.payment_method_1_percentage) / 100;
    } else if (this.formData.payment_method_1_value_type === 'value' && this.formData.payment_method_1_value) {
      firstValue = this.formData.payment_method_1_value;
    } else {
      return; // Não há valor definido na primeira forma
    }

    // Calcular valor restante para segunda forma
    const remainingValue = contractTotal - firstValue;
    
    if (remainingValue <= 0) {
      // Se primeira forma cobre tudo, zerar segunda
      this.formData.payment_method_2_value = null;
      this.formData.payment_method_2_percentage = null;
      return;
    }

    // Ajustar segunda forma baseada no seu tipo
    if (this.formData.payment_method_2_value_type === 'percentage') {
      const remainingPercentage = (remainingValue / contractTotal) * 100;
      this.formData.payment_method_2_percentage = Math.round(remainingPercentage * 100) / 100; // 2 casas decimais
      this.formData.payment_method_2_value = null;
    } else {
      this.formData.payment_method_2_value = remainingValue;
      this.formData.payment_method_2_percentage = null;
    }
  }

  // Ajustar primeira forma baseada na segunda
  adjustFirstPaymentValue() {
    if (!this.hasSecondPaymentMethod || !this.formData.payment_method_1) return;
    
    const contractTotal = this.getTotalValue();
    if (contractTotal <= 0) return;

    let secondValue = 0;
    
    // Calcular valor da segunda forma
    if (this.formData.payment_method_2_value_type === 'percentage' && this.formData.payment_method_2_percentage) {
      secondValue = (contractTotal * this.formData.payment_method_2_percentage) / 100;
    } else if (this.formData.payment_method_2_value_type === 'value' && this.formData.payment_method_2_value) {
      secondValue = this.formData.payment_method_2_value;
    } else {
      return; // Não há valor definido na segunda forma
    }

    // Calcular valor restante para primeira forma
    const remainingValue = contractTotal - secondValue;
    
    if (remainingValue <= 0) {
      // Se segunda forma cobre tudo, zerar primeira
      this.formData.payment_method_1_value = null;
      this.formData.payment_method_1_percentage = null;
      return;
    }

    // Ajustar primeira forma baseada no seu tipo
    if (this.formData.payment_method_1_value_type === 'percentage') {
      const remainingPercentage = (remainingValue / contractTotal) * 100;
      this.formData.payment_method_1_percentage = Math.round(remainingPercentage * 100) / 100; // 2 casas decimais
      this.formData.payment_method_1_value = null;
    } else {
      this.formData.payment_method_1_value = remainingValue;
      this.formData.payment_method_1_percentage = null;
    }
  }

  showPaymentSummary(): boolean {
    return !!(this.formData.payment_method_1 && (
      this.formData.payment_method_1_value || this.formData.payment_method_1_percentage ||
      (this.hasSecondPaymentMethod && (this.formData.payment_method_2_value || this.formData.payment_method_2_percentage))
    ));
  }

  getTotalConfiguredValue(): number {
    let total = 0;
    const contractTotal = this.getTotalValue();
    
    // Primeira forma de pagamento
    if (this.formData.payment_method_1_value_type === 'percentage' && this.formData.payment_method_1_percentage) {
      total += (contractTotal * this.formData.payment_method_1_percentage) / 100;
    } else if (this.formData.payment_method_1_value_type === 'value' && this.formData.payment_method_1_value) {
      total += this.formData.payment_method_1_value;
    }
    
    // Segunda forma de pagamento
    if (this.hasSecondPaymentMethod) {
      if (this.formData.payment_method_2_value_type === 'percentage' && this.formData.payment_method_2_percentage) {
        total += (contractTotal * this.formData.payment_method_2_percentage) / 100;
      } else if (this.formData.payment_method_2_value_type === 'value' && this.formData.payment_method_2_value) {
        total += this.formData.payment_method_2_value;
      }
    }
    
    return total;
  }

  isPaymentValuesValid(): boolean {
    const contractTotal = this.getTotalValue();
    const configuredTotal = this.getTotalConfiguredValue();
    
    // Tolerância de R$ 0,01 para problemas de arredondamento
    return Math.abs(contractTotal - configuredTotal) <= 0.01;
  }

  
  onSecondaryInstallmentCountChange(count: number) {
    this.secondaryInstallmentCount = count;
    
    if (count > 1 && this.remainingValue > 0 && this.secondaryFirstInstallmentDate) {
      this.generateSecondaryInstallments();
    } else if (count === 1) {
      this.secondaryInstallments = [];
    }
  }
  
  onSecondaryFirstInstallmentDateChange(date: string) {
    this.secondaryFirstInstallmentDate = date;
    
    if (this.secondaryInstallmentCount > 1 && this.remainingValue > 0 && date) {
      this.generateSecondaryInstallments();
    }
  }
  
  generateSecondaryInstallments() {
    if (this.remainingValue <= 0 || this.secondaryInstallmentCount <= 1 || !this.secondaryFirstInstallmentDate) {
      return;
    }

    this.secondaryInstallments = this.contractService.generateInstallments(
      this.remainingValue,
      this.secondaryInstallmentCount,
      this.secondaryFirstInstallmentDate,
      30 // intervalo padrão de 30 dias
    );
  }
}