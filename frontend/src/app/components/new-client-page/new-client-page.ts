import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ClientService, CreateClientRequest } from '../../services/client';
import { ModalService } from '../../services/modal.service';
import { DocumentMaskDirective } from '../../directives/document-mask.directive';
import { firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { ImageUploadComponent } from '../image-upload/image-upload.component';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-new-client-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DocumentMaskDirective, BreadcrumbComponent, ImageUploadComponent],
  templateUrl: './new-client-page.html',
  styleUrls: ['./new-client-page.css']
})
export class NewClientPageComponent implements OnInit {
  private clientService = inject(ClientService);
  private modalService = inject(ModalService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  
  // State
  errorMessage: string = '';
  
  // Form data
  formData: CreateClientRequest & { logo_url?: string | SafeUrl } = {
    type: 'PF',
    email: '',
    phone: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zipcode: '',
    // Optional fields
    employee_count: undefined,
    business_segment: '',
    // PF fields
    cpf: '',
    full_name: '',
    // PJ fields
    cnpj: '',
    company_name: '',
    trade_name: '',
    legal_representative: ''
  };

  // Email fields para PJ (múltiplos emails)
  emailFields: string[] = [''];
  
  // Phone fields (múltiplos telefones para todos os clientes)
  phoneFields: string[] = [''];
  
  isLoading = false;
  isEditing = false;
  editingId: number | null = null;
  
  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditing = true;
      this.editingId = parseInt(id);
      this.loadClient();
    }
  }

  async loadClient() {
    if (!this.editingId) return;
    
    try {
      this.isLoading = true;
      const response = await firstValueFrom(this.clientService.getClient(this.editingId));
      const client = response.client;
      
      // Map client data to form
      this.formData = {
        type: client.type,
        email: client.email,
        phone: client.phone || '',
        street: client.street,
        number: client.number,
        complement: client.complement || '',
        neighborhood: client.neighborhood,
        city: client.city,
        state: client.state,
        zipcode: client.zipcode,
        // Optional fields
        employee_count: client.employee_count || undefined,
        business_segment: client.business_segment || '',
        // PF fields
        cpf: client.cpf || '',
        full_name: client.full_name || '',
        // PJ fields
        cnpj: client.cnpj || '',
        company_name: client.company_name || '',
        trade_name: client.trade_name || '',
        legal_representative: client.legal_representative || ''
      };

      // Carregar emails se for PJ
      if (client.type === 'PJ') {
        this.loadClientEmails();
      }

      // Carregar telefones para todos os tipos de cliente
      this.loadClientPhones();

      if (client.logo_path) {
        this.loadLogo();
      }
    } catch (error) {
      console.error('Erro ao carregar cliente:', error);
      this.modalService.showError('Erro ao carregar dados do cliente');
      this.goBack();
    } finally {
      this.isLoading = false;
    }
  }

  loadLogo() {
    if (!this.editingId) return;
    this.clientService.getClientLogo(this.editingId).subscribe(blob => {
      const objectURL = URL.createObjectURL(blob);
      this.formData.logo_url = this.sanitizer.bypassSecurityTrustUrl(objectURL);
    });
  }

  async onSubmit() {
    if (this.isLoading) return;
    
    try {
      this.isLoading = true;
      
      // Preparar dados para envio
      const dataToSend = { ...this.formData };
      
      // Se for PJ, usar o primeiro email como principal e salvar os outros depois
      if (this.formData.type === 'PJ') {
        const validEmails = this.emailFields.filter(email => email.trim() !== '');
        if (validEmails.length === 0) {
          this.modalService.showError('Pelo menos um e-mail é obrigatório para empresas.');
          return;
        }
        // Usar o primeiro email válido como email principal
        dataToSend.email = validEmails[0];
        // Não enviar o campo emails no momento da criação
        delete dataToSend.emails;
      }
      
      let clientId: number;
      
      if (this.isEditing && this.editingId) {
        await firstValueFrom(this.clientService.updateClient(this.editingId, dataToSend));
        clientId = this.editingId;
        this.modalService.showSuccess('Cliente atualizado com sucesso!');
      } else {
        const response = await firstValueFrom(this.clientService.createClient(dataToSend));
        clientId = response.client.id;
        this.modalService.showSuccess('Cliente criado com sucesso!');
      }
      
      // Salvar emails adicionais para PJ (se houver mais de um email)
      if (this.formData.type === 'PJ') {
        const validEmails = this.emailFields.filter(email => email.trim() !== '');
        if (validEmails.length > 1) {
          await this.saveAdditionalEmails(clientId, validEmails);
        }
      }

      // Salvar telefones adicionais (se houver mais de um telefone)
      const validPhones = this.phoneFields.filter(phone => phone.trim() !== '');
      if (validPhones.length > 1) {
        await this.saveAdditionalPhones(clientId, validPhones);
      }
      
      this.goBack();
    } catch (error: any) {
      console.error('Erro ao salvar cliente:', error);
      
      if (error.status === 400) {
        this.modalService.showError(error.error?.message || 'Dados inválidos');
      } else {
        this.modalService.showError('Erro ao salvar cliente');
      }
    } finally {
      this.isLoading = false;
    }
  }

  goBack() {
    this.router.navigate(['/home/clientes']);
  }

  getPageTitle(): string {
    return this.isEditing ? 'Editar Cliente' : 'Novo Cliente';
  }

  async onLogoUploaded(file: File) {
    if (!this.editingId) {
      this.modalService.showError('É necessário salvar o cliente antes de enviar uma logo.');
      return;
    }
  
    try {
      this.isLoading = true;
    
      const response = await firstValueFrom(this.clientService.uploadClientLogo(this.editingId, file));

      this.modalService.showSuccess('Logo enviada com sucesso!');

      if (response && response.logo_url) {
        this.loadLogo();
      }

    } catch (error) {
      this.modalService.showError('Ocorreu um erro ao enviar a logo.');
      console.error('Upload error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async onLogoRemoved() {
    if (!this.editingId) return;

    try {
      await firstValueFrom(this.clientService.deleteClientLogo(this.editingId));
      this.modalService.showSuccess('Logo removida com sucesso!');
      this.formData.logo_url = undefined;
    } catch (error) {
      this.modalService.showError('Erro ao remover a logo.');
    }
  }

  // ========== MÉTODOS PARA GERENCIAR MÚLTIPLOS EMAILS ==========

  /**
   * Carrega os emails do cliente (para edição)
   */
  async loadClientEmails() {
    if (!this.editingId) return;
    
    try {
      const response = await firstValueFrom(this.clientService.getClientEmails(this.editingId));
      if (response.success && response.emails.length > 0) {
        this.emailFields = response.emails.map(e => e.email);
      } else {
        // Se não houver emails específicos, usar o email do cliente
        this.emailFields = [this.formData.email || ''];
      }
    } catch (error) {
      console.error('Erro ao carregar emails:', error);
      // Usar o email padrão em caso de erro
      this.emailFields = [this.formData.email || ''];
    }
  }

  /**
   * Adiciona um novo campo de email
   */
  addEmailField() {
    this.emailFields.push('');
  }

  /**
   * Remove um campo de email específico
   */
  removeEmailField(index: number) {
    if (index > 0 && this.emailFields.length > 1) {
      this.emailFields.splice(index, 1);
    }
  }

  /**
   * Valida um email específico
   */
  validateEmail(index: number) {
    const email = this.emailFields[index];
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.modalService.showError(`E-mail ${index + 1} inválido.`);
      }
    }
  }

  /**
   * TrackBy function para o ngFor dos emails
   */
  trackByEmailIndex(index: number): number {
    return index;
  }

  /**
   * Adiciona um novo campo de telefone
   */
  addPhoneField() {
    this.phoneFields.push('');
  }

  /**
   * Remove um campo de telefone específico
   */
  removePhoneField(index: number) {
    if (index > 0 && this.phoneFields.length > 1) {
      this.phoneFields.splice(index, 1);
    }
  }

  /**
   * Valida um telefone específico
   */
  validatePhone(index: number) {
    const phone = this.phoneFields[index];
    if (phone && phone.trim() !== '') {
      const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      if (!phoneRegex.test(phone)) {
        this.modalService.showError(`Telefone ${index + 1} inválido. Use o formato (XX) XXXXX-XXXX`);
      }
    }
  }

  /**
   * TrackBy function para o ngFor dos telefones
   */
  trackByPhoneIndex(index: number): number {
    return index;
  }

  /**
   * Carrega os telefones do cliente (para edição)
   */
  async loadClientPhones() {
    if (!this.editingId) return;
    
    try {
      const response = await firstValueFrom(this.clientService.getClientPhones(this.editingId));
      if (response.success && response.phones.length > 0) {
        this.phoneFields = response.phones.map(p => p.phone);
      } else {
        // Se não houver telefones específicos, usar o telefone do cliente
        this.phoneFields = [this.formData.phone || ''];
      }
    } catch (error) {
      console.error('Erro ao carregar telefones:', error);
      // Usar o telefone padrão em caso de erro
      this.phoneFields = [this.formData.phone || ''];
    }
  }

  /**
   * Salva emails adicionais após criar/atualizar cliente
   */
  private async saveAdditionalEmails(clientId: number, allEmails: string[]): Promise<void> {
    try {
      // Substitui todos os emails do cliente
      await firstValueFrom(this.clientService.replaceAllEmails(clientId, allEmails));
    } catch (error) {
      console.warn('Erro ao salvar emails adicionais:', error);
      // Não exibe erro para o usuário pois o cliente já foi criado/atualizado com sucesso
    }
  }

  /**
   * Salva telefones adicionais após criar/atualizar cliente
   */
  private async saveAdditionalPhones(clientId: number, allPhones: string[]): Promise<void> {
    try {
      // Substitui todos os telefones do cliente
      await firstValueFrom(this.clientService.replaceAllPhones(clientId, allPhones));
    } catch (error) {
      console.warn('Erro ao salvar telefones adicionais:', error);
      // Não exibe erro para o usuário pois o cliente já foi criado/atualizado com sucesso
    }
  }

  /**
   * Verifica se o formulário é válido
   */
  isFormValid(): boolean {
    if (this.formData.type === 'PJ') {
      // Para PJ, verificar se há pelo menos um email válido
      const validEmails = this.emailFields.filter(email => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(trimmedEmail);
      });
      
      if (validEmails.length === 0) return false;
      
      // Verificar campos obrigatórios para PJ
      return !!(
        this.formData.company_name &&
        this.formData.cnpj &&
        this.formData.street &&
        this.formData.number &&
        this.formData.neighborhood &&
        this.formData.city &&
        this.formData.state &&
        this.formData.zipcode
      );
    } else {
      // Para PF, usar validação padrão
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isEmailValid = !!(this.formData.email && emailRegex.test(this.formData.email));
      
      return !!(
        isEmailValid &&
        this.formData.full_name &&
        this.formData.cpf &&
        this.formData.street &&
        this.formData.number &&
        this.formData.neighborhood &&
        this.formData.city &&
        this.formData.state &&
        this.formData.zipcode
      );
    }
  }
}