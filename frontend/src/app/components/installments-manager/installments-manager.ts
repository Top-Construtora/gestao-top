import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService, ApiContractInstallment } from '../../services/contract';

export interface ContractInstallment {
  due_date: string;
  amount: number;
  payment_status: 'pago' | 'pendente';
  paid_date?: string | null;
  paid_amount?: number | null;
  notes?: string | null;
}

@Component({
  selector: 'app-installments-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './installments-manager.html',
  styleUrls: ['./installments-manager.css']
})
export class InstallmentsManagerComponent implements OnInit, OnChanges {
  @Input() totalValue: number = 0;
  @Input() paymentMethod: string = '';
  @Input() installments: ContractInstallment[] = [];
  @Input() isViewMode: boolean = false;
  @Input() contractId: number | null = null;
  @Input() apiInstallments: ApiContractInstallment[] = [];
  
  @Output() installmentsChange = new EventEmitter<ContractInstallment[]>();
  @Output() installmentCountChange = new EventEmitter<number>();

  installmentCount: number = 1;
  firstDueDate: string = '';
  intervalDays: number = 30;
  showInstallmentFields: boolean = false;

  constructor(private contractService: ContractService) {}

  ngOnInit() {
    this.updateShowInstallmentFields();
    this.setDefaultFirstDueDate();
  }

  ngOnChanges() {
    this.updateShowInstallmentFields();
    if (this.totalValue > 0 && this.installmentCount > 1 && this.firstDueDate) {
      this.generateInstallments();
    }
  }

  private updateShowInstallmentFields() {
    this.showInstallmentFields = this.contractService.isPaymentMethodInstallable(this.paymentMethod);
    if (!this.showInstallmentFields) {
      this.installmentCount = 1;
      this.onInstallmentCountChange();
    }
  }

  private setDefaultFirstDueDate() {
    if (!this.firstDueDate) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      this.firstDueDate = nextMonth.toISOString().split('T')[0];
    }
  }

  onPaymentMethodChange(newMethod: string) {
    this.paymentMethod = newMethod;
    this.updateShowInstallmentFields();
  }

  onInstallmentCountChange() {
    this.installmentCountChange.emit(this.installmentCount);
    
    if (this.installmentCount === 1) {
      this.installments = [];
    } else if (this.installmentCount > 1 && this.totalValue > 0 && this.firstDueDate) {
      this.generateInstallments();
    }
    
    this.installmentsChange.emit(this.installments);
  }

  onFirstDueDateChange() {
    if (this.installmentCount > 1 && this.totalValue > 0 && this.firstDueDate) {
      this.generateInstallments();
      this.installmentsChange.emit(this.installments);
    }
  }

  onIntervalDaysChange() {
    if (this.installmentCount > 1 && this.totalValue > 0 && this.firstDueDate) {
      this.generateInstallments();
      this.installmentsChange.emit(this.installments);
    }
  }

  generateInstallments() {
    if (this.totalValue <= 0 || this.installmentCount <= 1 || !this.firstDueDate) {
      return;
    }

    const baseInstallments = this.contractService.generateInstallments(
      this.totalValue,
      this.installmentCount,
      this.firstDueDate,
      this.intervalDays
    );

    // Adicionar status padrão de "pendente" a todas as parcelas
    this.installments = baseInstallments.map(installment => ({
      ...installment,
      payment_status: 'pendente' as 'pendente'
    }));
  }

  updateInstallment(index: number, field: 'due_date' | 'amount' | 'notes' | 'payment_status', value: any) {
    if (this.installments[index]) {
      (this.installments[index] as any)[field] = value;
      this.installmentsChange.emit(this.installments);
    }
  }

  onDateChange(index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateInstallment(index, 'due_date', value);
  }

  onAmountChange(index: number, event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.updateInstallment(index, 'amount', value);
  }

  onNotesChange(index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateInstallment(index, 'notes', value);
  }

  onStatusChange(index: number, value: 'pago' | 'pendente') {
    this.updateInstallment(index, 'payment_status', value);

    // Se marcar como paga, definir data e valor de pagamento
    if (value === 'pago' && this.installments[index]) {
      if (!this.installments[index].paid_date) {
        this.installments[index].paid_date = new Date().toISOString().split('T')[0];
      }
      if (!this.installments[index].paid_amount) {
        this.installments[index].paid_amount = this.installments[index].amount;
      }
    } else if (value === 'pendente' && this.installments[index]) {
      // Se voltar para pendente, limpar dados de pagamento
      this.installments[index].paid_date = null;
      this.installments[index].paid_amount = null;
    }

    this.installmentsChange.emit(this.installments);
  }

  addInstallment() {
    const lastInstallment = this.installments[this.installments.length - 1];
    const newDueDate = lastInstallment
      ? new Date(new Date(lastInstallment.due_date).getTime() + (this.intervalDays * 24 * 60 * 60 * 1000))
      : new Date(this.firstDueDate);

    this.installments.push({
      due_date: newDueDate.toISOString().split('T')[0],
      amount: 0,
      payment_status: 'pendente',
      notes: `Parcela ${this.installments.length + 1}`
    });

    this.installmentCount = this.installments.length;
    this.installmentCountChange.emit(this.installmentCount);
    this.installmentsChange.emit(this.installments);
  }

  removeInstallment(index: number) {
    this.installments.splice(index, 1);
    this.installmentCount = this.installments.length;
    
    // Reajustar numeração das notas
    this.installments.forEach((installment, i) => {
      if (installment.notes?.includes('Parcela')) {
        installment.notes = `Parcela ${i + 1} de ${this.installments.length}`;
      }
    });

    this.installmentCountChange.emit(this.installmentCount);
    this.installmentsChange.emit(this.installments);
  }

  // Métodos para modo visualização (contratos existentes)
  markInstallmentAsPaid(installment: ApiContractInstallment) {
    if (!this.contractId) return;

    const paidAmount = prompt(`Valor pago da parcela ${installment.installment_number}:`, installment.amount.toString());
    if (!paidAmount || isNaN(Number(paidAmount))) return;

    this.contractService.markInstallmentAsPaid(installment.id, Number(paidAmount))
      .subscribe({
        next: () => {
          installment.payment_status = 'pago';
          installment.paid_amount = Number(paidAmount);
          installment.paid_date = new Date().toISOString().split('T')[0];
        },
        error: (error) => {
          console.error('Erro ao marcar parcela como paga:', error);
          alert('Erro ao marcar parcela como paga');
        }
      });
  }

  getInstallmentStatusColor(status: string): string {
    return this.contractService.getInstallmentStatusColor(status);
  }

  getInstallmentStatusText(status: string): string {
    return this.contractService.getInstallmentStatusText(status);
  }

  getInstallmentStatusIcon(status: string): string {
    return this.contractService.getInstallmentStatusIcon(status);
  }

  formatCurrency(value: number): string {
    return this.contractService.formatValue(value);
  }

  formatDate(dateString: string): string {
    return this.contractService.formatDate(dateString);
  }

  get totalInstallmentValue(): number {
    return this.installments.reduce((sum, installment) => sum + installment.amount, 0);
  }

  get isInstallmentValueValid(): boolean {
    return Math.abs(this.totalInstallmentValue - this.totalValue) < 0.01;
  }
}