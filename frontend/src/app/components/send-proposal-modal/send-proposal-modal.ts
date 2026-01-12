import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ProposalService, Proposal, PrepareProposalData, SendProposalData } from '../../services/proposal';

@Component({
  selector: 'app-send-proposal-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './send-proposal-modal.html',
  styleUrls: ['./send-proposal-modal.css']
})
export class SendProposalModalComponent implements OnInit {
  @Input() proposal: Proposal | null = null;
  @Input() isVisible = false;
  @Output() onClose = new EventEmitter<void>();
  @Output() onProposalSent = new EventEmitter<Proposal>();

  clientForm!: FormGroup;
  emailForm!: FormGroup;
  currentStep: 'client' | 'email' | 'success' = 'client';
  isLoading = false;
  publicUrl = '';

  constructor(
    private fb: FormBuilder,
    private proposalService: ProposalService,
    private toastr: ToastrService
  ) {
    this.initializeForms();
  }

  ngOnInit(): void {
    if (this.proposal && this.proposal.client_name) {
      this.populateClientData();
      this.currentStep = 'email';
    }
  }

  private initializeForms(): void {
    this.clientForm = this.fb.group({
      client_name: ['', [Validators.required, Validators.minLength(2)]],
      client_email: ['', [Validators.required, Validators.email]],
      client_phone: [''],
      client_document: ['']
    });

    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      subject: [''],
      message: ['']
    });
  }

  private populateClientData(): void {
    if (!this.proposal) return;

    this.clientForm.patchValue({
      client_name: this.proposal.client_name,
      client_email: this.proposal.client_email,
      client_phone: this.proposal.client_phone,
      client_document: this.proposal.client_document
    });

    this.emailForm.patchValue({
      email: this.proposal.client_email,
      subject: `Proposta Comercial - ${this.proposal.proposal_number}`,
      message: `Olá ${this.proposal.client_name},

Segue em anexo sua proposta comercial personalizada.

Você pode visualizar, selecionar os serviços desejados e assinar digitalmente através do link abaixo.

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Equipe TOP Construtora`
    });
  }

  prepareProposal(): void {
    if (this.clientForm.invalid) {
      this.markFormGroupTouched(this.clientForm);
      this.toastr.error('Preencha todos os campos obrigatórios do cliente');
      return;
    }

    if (!this.proposal) return;

    this.isLoading = true;
    const clientData: PrepareProposalData = this.clientForm.value;

    this.proposalService.prepareProposalForSending(this.proposal.id)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.proposal = response.data;
            this.publicUrl = this.proposal ? this.proposalService.getPublicProposalUrl(this.proposal) || '' : '';
            this.populateEmailForm();
            this.currentStep = 'email';
            this.toastr.success('Proposta preparada com sucesso');
          } else {
            this.toastr.error(response.message || 'Erro ao preparar proposta');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erro ao preparar proposta:', error);
          this.toastr.error('Erro ao preparar proposta para envio');
          this.isLoading = false;
        }
      });
  }

  private populateEmailForm(): void {
    if (!this.proposal) return;

    this.emailForm.patchValue({
      email: this.proposal.client_email,
      subject: `Proposta Comercial - ${this.proposal.proposal_number}`,
      message: `Olá ${this.proposal.client_name},

Segue sua proposta comercial personalizada.

Você pode visualizar, selecionar os serviços desejados e assinar digitalmente através do link abaixo:

${this.publicUrl}

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Equipe TOP Construtora`
    });
  }

  sendProposal(): void {
    if (this.emailForm.invalid) {
      this.markFormGroupTouched(this.emailForm);
      this.toastr.error('Preencha todos os campos obrigatórios do email');
      return;
    }

    if (!this.proposal) return;

    this.isLoading = true;
    const emailData: SendProposalData = this.emailForm.value;

    this.proposalService.sendProposal(this.proposal.id, emailData)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.currentStep = 'success';
            this.toastr.success('Proposta enviada com sucesso!');
            this.onProposalSent.emit(this.proposal!);
          } else {
            this.toastr.error(response.message || 'Erro ao enviar proposta');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erro ao enviar proposta:', error);
          this.toastr.error('Erro ao enviar proposta por email');
          this.isLoading = false;
        }
      });
  }

  copyPublicUrl(): void {
    if (this.publicUrl) {
      navigator.clipboard.writeText(this.publicUrl).then(() => {
        this.toastr.success('Link copiado para a área de transferência');
      }).catch(() => {
        this.toastr.error('Erro ao copiar link');
      });
    }
  }

  regenerateToken(): void {
    if (!this.proposal) return;

    this.isLoading = true;
    this.proposalService.regeneratePublicToken(this.proposal.id)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.proposal!.unique_link = response.data.unique_link;
            this.publicUrl = this.proposal ? this.proposalService.getPublicProposalUrl(this.proposal) || '' : '';
            this.populateEmailForm();
            this.toastr.success('Novo link gerado com sucesso');
          } else {
            this.toastr.error(response.message || 'Erro ao gerar novo link');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erro ao regenerar token:', error);
          this.toastr.error('Erro ao gerar novo link');
          this.isLoading = false;
        }
      });
  }

  close(): void {
    this.onClose.emit();
    this.resetModal();
  }

  private resetModal(): void {
    this.currentStep = 'client';
    this.isLoading = false;
    this.publicUrl = '';
    this.clientForm.reset();
    this.emailForm.reset();
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  backToClient(): void {
    this.currentStep = 'client';
  }

  openPublicUrl(): void {
    if (this.publicUrl) {
      window.open(this.publicUrl, '_blank');
    }
  }
}