import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ClientService, CreateClientRequest } from '../../services/client';
import { ModalService } from '../../services/modal.service';
import { DocumentMaskDirective } from '../../directives/document-mask.directive';
import { firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { ImageUploadComponent } from '../image-upload/image-upload.component';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

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
  private http = inject(HttpClient);

  // State
  errorMessage: string = '';

  // Form data (apenas PJ)
  formData: CreateClientRequest & { logo_url?: string | SafeUrl } = {
    phone: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zipcode: '',
    employee_count: undefined,
    business_segment: '',
    cnpj: '',
    company_name: '',
    trade_name: ''
  };

  // Email fields (múltiplos emails)
  emailFields: string[] = [''];

  // Phone fields (múltiplos telefones)
  phoneFields: string[] = [''];

  isLoading = false;
  isLoadingCep = false;
  isEditing = false;
  editingId: number | null = null;

  // Logo pendente para upload após criar cliente
  pendingLogoFile: File | null = null;

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

      this.formData = {
        phone: client.phone || '',
        street: client.street,
        number: client.number,
        complement: client.complement || '',
        neighborhood: client.neighborhood,
        city: client.city,
        state: client.state,
        zipcode: client.zipcode,
        employee_count: client.employee_count || undefined,
        business_segment: client.business_segment || '',
        cnpj: client.cnpj || '',
        company_name: client.company_name || '',
        trade_name: client.trade_name || ''
      };

      this.loadClientEmails();
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

      const validEmails = this.emailFields.filter(email => email.trim() !== '');
      if (validEmails.length === 0) {
        this.modalService.showError('Pelo menos um e-mail é obrigatório.');
        return;
      }

      const dataToSend: any = {
        ...this.formData,
        emails: validEmails
      };

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

      // Salvar emails
      if (validEmails.length > 0) {
        await this.saveAdditionalEmails(clientId, validEmails);
      }

      // Salvar telefones
      const validPhones = this.phoneFields.filter(phone => phone.trim() !== '');
      if (validPhones.length > 0) {
        await this.saveAdditionalPhones(clientId, validPhones);
      }

      // Upload da logo pendente (se houver)
      if (this.pendingLogoFile) {
        try {
          await firstValueFrom(this.clientService.uploadClientLogo(clientId, this.pendingLogoFile));
        } catch (error) {
          console.warn('Erro ao enviar logo:', error);
        }
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
    // Se for novo cliente, armazenar arquivo para upload após criar
    if (!this.editingId) {
      this.pendingLogoFile = file;
      // Mostrar preview local
      const objectURL = URL.createObjectURL(file);
      this.formData.logo_url = this.sanitizer.bypassSecurityTrustUrl(objectURL);
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
    // Se for novo cliente, apenas limpar o arquivo pendente
    if (!this.editingId) {
      this.pendingLogoFile = null;
      this.formData.logo_url = undefined;
      return;
    }

    try {
      await firstValueFrom(this.clientService.deleteClientLogo(this.editingId));
      this.modalService.showSuccess('Logo removida com sucesso!');
      this.formData.logo_url = undefined;
    } catch (error) {
      this.modalService.showError('Erro ao remover a logo.');
    }
  }

  // ========== MÉTODOS PARA GERENCIAR MÚLTIPLOS EMAILS ==========

  async loadClientEmails() {
    if (!this.editingId) return;

    try {
      const response = await firstValueFrom(this.clientService.getClientEmails(this.editingId));
      if (response.success && response.emails.length > 0) {
        this.emailFields = response.emails.map(e => e.email);
      } else {
        this.emailFields = [''];
      }
    } catch (error) {
      console.error('Erro ao carregar emails:', error);
      this.emailFields = [''];
    }
  }

  addEmailField() {
    this.emailFields.push('');
  }

  removeEmailField(index: number) {
    if (index > 0 && this.emailFields.length > 1) {
      this.emailFields.splice(index, 1);
    }
  }

  validateEmail(index: number) {
    const email = this.emailFields[index];
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.modalService.showError(`E-mail ${index + 1} inválido.`);
      }
    }
  }

  trackByEmailIndex(index: number): number {
    return index;
  }

  // ========== MÉTODOS PARA GERENCIAR MÚLTIPLOS TELEFONES ==========

  addPhoneField() {
    this.phoneFields.push('');
  }

  removePhoneField(index: number) {
    if (index > 0 && this.phoneFields.length > 1) {
      this.phoneFields.splice(index, 1);
    }
  }

  validatePhone(index: number) {
    const phone = this.phoneFields[index];
    if (phone && phone.trim() !== '') {
      const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      if (!phoneRegex.test(phone)) {
        this.modalService.showError(`Telefone ${index + 1} inválido. Use o formato (XX) XXXXX-XXXX`);
      }
    }
  }

  trackByPhoneIndex(index: number): number {
    return index;
  }

  async loadClientPhones() {
    if (!this.editingId) return;

    try {
      const response = await firstValueFrom(this.clientService.getClientPhones(this.editingId));
      if (response.success && response.phones.length > 0) {
        this.phoneFields = response.phones.map(p => p.phone);
      } else {
        this.phoneFields = [this.formData.phone || ''];
      }
    } catch (error) {
      console.error('Erro ao carregar telefones:', error);
      this.phoneFields = [this.formData.phone || ''];
    }
  }

  private async saveAdditionalEmails(clientId: number, allEmails: string[]): Promise<void> {
    try {
      await firstValueFrom(this.clientService.replaceAllEmails(clientId, allEmails));
    } catch (error) {
      console.warn('Erro ao salvar emails adicionais:', error);
    }
  }

  private async saveAdditionalPhones(clientId: number, allPhones: string[]): Promise<void> {
    try {
      await firstValueFrom(this.clientService.replaceAllPhones(clientId, allPhones));
    } catch (error) {
      console.warn('Erro ao salvar telefones adicionais:', error);
    }
  }

  // ========== BUSCA DE CEP ==========

  async onCepBlur() {
    const cep = this.formData.zipcode?.replace(/\D/g, '');

    if (!cep || cep.length !== 8) {
      return;
    }

    this.isLoadingCep = true;

    try {
      const response = await firstValueFrom(
        this.http.get<ViaCepResponse>(`https://viacep.com.br/ws/${cep}/json/`)
      );

      if (response.erro) {
        this.modalService.showError('CEP nao encontrado.');
        return;
      }

      // Preencher campos automaticamente
      this.formData.street = response.logradouro || '';
      this.formData.neighborhood = response.bairro || '';
      this.formData.city = response.localidade || '';
      this.formData.state = response.uf || '';

      if (response.complemento) {
        this.formData.complement = response.complemento;
      }

    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      this.modalService.showError('Erro ao buscar CEP. Verifique sua conexao.');
    } finally {
      this.isLoadingCep = false;
    }
  }

  isFormValid(): boolean {
    const validEmails = this.emailFields.filter(email => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(trimmedEmail);
    });

    if (validEmails.length === 0) return false;

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
  }
}
