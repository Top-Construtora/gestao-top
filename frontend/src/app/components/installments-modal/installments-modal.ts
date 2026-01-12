import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../services/contract.service';
import { ToastrService } from 'ngx-toastr';

interface Installment {
  id?: number;
  installment_number: number;
  due_date: string;
  amount: number;
  payment_status: 'pendente' | 'pago' | 'atrasado';
  paid_date?: string;
  paid_amount?: number;
  notes?: string;
}

@Component({
  selector: 'app-installments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './installments-modal.html',
  styleUrls: ['./installments-modal.css']
})
export class InstallmentsModalComponent implements OnInit {
  @Input() isOpen = false;
  @Input() contractId: number | null = null;
  @Input() contractNumber: string = '';
  @Input() totalValue: number = 0;
  @Input() installmentCount: number = 1;
  @Input() firstInstallmentDate: string = '';

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Installment[]>();

  installments: Installment[] = [];
  loading = false;

  statusOptions = [
    { value: 'pendente', label: 'Pendente', color: '#FFA500' },
    { value: 'pago', label: 'Pago', color: '#4CAF50' },
    { value: 'atrasado', label: 'Atrasado', color: '#f44336' }
  ];

  constructor(
    private contractService: ContractService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    if (this.isOpen) {
      this.loadInstallments();
    }
  }

  ngOnChanges() {
    if (this.isOpen) {
      this.loadInstallments();
    }
  }

  loadInstallments() {
    if (!this.contractId) {
      // Se não há contractId, gerar parcelas baseado nas informações do formulário
      this.generateInstallments();
      return;
    }

    this.loading = true;
    this.contractService.getContractInstallments(this.contractId).subscribe({
      next: (response) => {
        // Mapear as parcelas da API para o formato do componente
        this.installments = response.installments.map(installment => ({
          id: installment.id,
          installment_number: installment.installment_number,
          due_date: installment.due_date,
          amount: installment.amount,
          payment_status: installment.payment_status,
          paid_date: installment.paid_date || undefined,
          paid_amount: installment.paid_amount || undefined,
          notes: installment.notes || undefined
        }));

        if (this.installments.length === 0) {
          this.generateInstallments();
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar parcelas:', error);
        this.toastr.error('Erro ao carregar parcelas');
        this.loading = false;
      }
    });
  }

  generateInstallments() {
    this.installments = [];
    const installmentValue = this.totalValue / this.installmentCount;

    // Use a data da primeira parcela se fornecida, senão use hoje
    let startDate: Date;
    if (this.firstInstallmentDate) {
      startDate = new Date(this.firstInstallmentDate);
    } else {
      startDate = new Date();
    }

    for (let i = 0; i < this.installmentCount; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const year = dueDate.getFullYear();
      const month = String(dueDate.getMonth() + 1).padStart(2, '0');
      const day = String(dueDate.getDate()).padStart(2, '0');

      this.installments.push({
        installment_number: i + 1,
        due_date: `${year}-${month}-${day}`,
        amount: installmentValue,
        payment_status: 'pendente'
      });
    }
  }

  formatDate(date: Date | string): string {
    if (!date) return '';

    if (typeof date === 'string') {
      // Se já é uma string no formato ISO, formatar para pt-BR
      const parts = date.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return date;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  updateStatus(installment: Installment) {
    if (installment.payment_status === 'pago' && !installment.paid_date) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      installment.paid_date = `${year}-${month}-${day}`;
    } else if (installment.payment_status !== 'pago') {
      installment.paid_date = undefined;
      installment.paid_amount = undefined;
    }
  }

  getStatusColor(status: string): string {
    const option = this.statusOptions.find(opt => opt.value === status);
    return option ? option.color : '#757575';
  }

  getTotalPaid(): number {
    return this.installments
      .filter(i => i.payment_status === 'pago')
      .reduce((sum, i) => sum + i.amount, 0);
  }

  getTotalPending(): number {
    return this.installments
      .filter(i => i.payment_status === 'pendente')
      .reduce((sum, i) => sum + i.amount, 0);
  }

  getTotalOverdue(): number {
    return this.installments
      .filter(i => i.payment_status === 'atrasado')
      .reduce((sum, i) => sum + i.amount, 0);
  }

  getProgress(): number {
    if (this.totalValue === 0) return 0;
    return (this.getTotalPaid() / this.totalValue) * 100;
  }

  saveInstallments() {
    this.save.emit(this.installments);

    if (this.contractId) {
      this.loading = true;
      this.contractService.updateContractInstallments(this.contractId, this.installments).subscribe({
        next: () => {
          this.toastr.success('Parcelas atualizadas com sucesso!');
          this.loading = false;
          this.close.emit();
        },
        error: (error) => {
          console.error('Erro ao atualizar parcelas:', error);
          this.toastr.error('Erro ao atualizar parcelas');
          this.loading = false;
        }
      });
    } else {
      this.close.emit();
    }
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.close.emit();
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }
}