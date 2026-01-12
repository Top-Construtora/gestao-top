import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService, ApiContractInstallment } from '../../services/contract';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-installments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './installments-modal.component.html',
  styleUrls: ['./installments-modal.component.css']
})
export class InstallmentsModalComponent implements OnInit {
  @Input() isOpen: boolean = false;
  @Input() contractId: number | null = null;
  @Input() contractNumber: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() installmentsUpdated = new EventEmitter<void>();

  installments: ApiContractInstallment[] = [];
  isLoading: boolean = false;
  stats: any = null;

  // Para edição de parcela
  editingInstallment: ApiContractInstallment | null = null;
  editForm = {
    payment_status: 'pendente' as 'pago' | 'pendente' | 'atrasado',
    paid_amount: 0,
    paid_date: '',
    notes: ''
  };

  constructor(
    private contractService: ContractService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    if (this.contractId) {
      this.loadInstallments();
    }
  }

  loadInstallments() {
    if (!this.contractId) return;

    this.isLoading = true;
    this.contractService.getContractInstallments(this.contractId).subscribe({
      next: (response) => {
        this.installments = response.installments || [];
        this.stats = response.stats;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar parcelas:', error);
        this.toastr.error('Erro ao carregar parcelas');
        this.isLoading = false;
      }
    });
  }

  closeModal() {
    this.close.emit();
  }

  startEditing(installment: ApiContractInstallment) {
    this.editingInstallment = installment;
    this.editForm = {
      payment_status: installment.payment_status,
      paid_amount: installment.paid_amount || installment.amount,
      paid_date: installment.paid_date || new Date().toISOString().split('T')[0],
      notes: installment.notes || ''
    };
  }

  cancelEditing() {
    this.editingInstallment = null;
  }

  saveInstallmentStatus() {
    if (!this.editingInstallment) return;

    const installmentId = this.editingInstallment.id;

    this.contractService.updateInstallmentStatus(
      installmentId,
      this.editForm.payment_status,
      this.editForm.paid_amount,
      this.editForm.paid_date,
      this.editForm.notes
    ).subscribe({
      next: (response) => {
        this.toastr.success('Status da parcela atualizado com sucesso');
        this.editingInstallment = null;
        this.loadInstallments();
        this.installmentsUpdated.emit();
      },
      error: (error) => {
        console.error('Erro ao atualizar parcela:', error);
        this.toastr.error('Erro ao atualizar parcela');
      }
    });
  }

  markAsPaid(installment: ApiContractInstallment) {
    if (confirm(`Marcar parcela ${installment.installment_number} como paga?`)) {
      this.contractService.updateInstallmentStatus(
        installment.id,
        'pago',
        installment.amount,
        new Date().toISOString().split('T')[0]
      ).subscribe({
        next: () => {
          this.toastr.success('Parcela marcada como paga');
          this.loadInstallments();
          this.installmentsUpdated.emit();
        },
        error: (error) => {
          console.error('Erro ao marcar parcela como paga:', error);
          this.toastr.error('Erro ao marcar parcela como paga');
        }
      });
    }
  }

  markAsPending(installment: ApiContractInstallment) {
    if (confirm(`Marcar parcela ${installment.installment_number} como pendente?`)) {
      this.contractService.updateInstallmentStatus(
        installment.id,
        'pendente'
      ).subscribe({
        next: () => {
          this.toastr.success('Parcela marcada como pendente');
          this.loadInstallments();
          this.installmentsUpdated.emit();
        },
        error: (error) => {
          console.error('Erro ao marcar parcela como pendente:', error);
          this.toastr.error('Erro ao marcar parcela como pendente');
        }
      });
    }
  }

  getStatusColor(status: string): string {
    return this.contractService.getInstallmentStatusColor(status);
  }

  getStatusText(status: string): string {
    return this.contractService.getInstallmentStatusText(status);
  }

  getStatusIcon(status: string): string {
    return this.contractService.getInstallmentStatusIcon(status);
  }

  formatCurrency(value: number): string {
    return this.contractService.formatValue(value);
  }

  formatDate(dateString: string): string {
    return this.contractService.formatDate(dateString);
  }

  get totalValue(): number {
    return this.installments.reduce((sum, i) => sum + i.amount, 0);
  }

  get paidValue(): number {
    return this.installments
      .filter(i => i.payment_status === 'pago')
      .reduce((sum, i) => sum + (i.paid_amount || i.amount), 0);
  }

  get pendingValue(): number {
    return this.installments
      .filter(i => i.payment_status === 'pendente' || i.payment_status === 'atrasado')
      .reduce((sum, i) => sum + i.amount, 0);
  }

  get progressPercentage(): number {
    if (this.totalValue === 0) return 0;
    return Math.round((this.paidValue / this.totalValue) * 100);
  }
}