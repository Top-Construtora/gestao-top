import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentMethodService, PaymentMethod, CreatePaymentMethodRequest } from '../../services/payment-method.service';
import { ModalService } from '../../services/modal.service';
import { firstValueFrom } from 'rxjs';

interface PaymentMethodForm {
  id?: number;
  payment_method: string;
  value_type: 'percentage' | 'fixed_value';
  percentage?: number;
  fixed_value?: number;
  sort_order?: number;
  isEditing?: boolean;
}

@Component({
  selector: 'app-payment-methods-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-methods-manager.component.html',
  styleUrls: ['./payment-methods-manager.component.css']
})
export class PaymentMethodsManagerComponent implements OnInit {
  @Input() contractId!: number;
  @Input() totalValue: number = 0;
  @Input() readonly: boolean = false;
  @Output() paymentMethodsChanged = new EventEmitter<PaymentMethod[]>();

  public paymentMethodService = inject(PaymentMethodService);
  private modalService = inject(ModalService);

  paymentMethods: PaymentMethod[] = [];
  isLoading = false;
  isSaving = false;

  // Formulário para nova forma de pagamento
  newPaymentMethod: PaymentMethodForm = {
    payment_method: '',
    value_type: 'percentage',
    percentage: 0,
    fixed_value: 0,
    sort_order: 1
  };

  showAddForm = false;
  editingIndex = -1;

  paymentMethodOptions: string[] = [];
  validation = {
    isValid: true,
    total: 100,
    difference: 0
  };

  ngOnInit() {
    this.paymentMethodOptions = this.paymentMethodService.getPaymentMethodOptions();
    this.loadPaymentMethods();
  }

  async loadPaymentMethods() {
    if (!this.contractId) return;

    this.isLoading = true;
    try {
      const response = await firstValueFrom(
        this.paymentMethodService.getContractPaymentMethods(this.contractId)
      );
      
      this.paymentMethods = response.payment_methods || [];
      this.updateSortOrders();
      this.validatePercentages();
      this.paymentMethodsChanged.emit(this.paymentMethods);
    } catch (error) {
      console.error('❌ Erro ao carregar formas de pagamento:', error);
      this.modalService.showError('Erro ao carregar formas de pagamento');
    } finally {
      this.isLoading = false;
    }
  }

  showAddPaymentMethod() {
    this.resetForm();
    this.showAddForm = true;
  }

  hideAddPaymentMethod() {
    this.showAddForm = false;
    this.resetForm();
  }

  async savePaymentMethod() {
    if (!this.validateForm()) return;

    this.isSaving = true;
    try {
      if (this.editingIndex >= 0) {
        // Editando
        const paymentMethod = this.paymentMethods[this.editingIndex];
        await firstValueFrom(
          this.paymentMethodService.updatePaymentMethod(paymentMethod.id!, this.newPaymentMethod)
        );
        this.modalService.showSuccess('Forma de pagamento atualizada com sucesso');
      } else {
        // Criando
        await firstValueFrom(
          this.paymentMethodService.createContractPaymentMethod(this.contractId, this.newPaymentMethod)
        );
        this.modalService.showSuccess('Forma de pagamento adicionada com sucesso');
      }

      this.hideAddPaymentMethod();
      this.editingIndex = -1;
      await this.loadPaymentMethods();
    } catch (error) {
      console.error('❌ Erro ao salvar forma de pagamento:', error);
      this.modalService.showError('Erro ao salvar forma de pagamento');
    } finally {
      this.isSaving = false;
    }
  }

  editPaymentMethod(index: number) {
    const paymentMethod = this.paymentMethods[index];
    this.newPaymentMethod = {
      ...paymentMethod,
      percentage: paymentMethod.percentage || 0,
      fixed_value: paymentMethod.fixed_value || 0
    };
    this.editingIndex = index;
    this.showAddForm = true;
  }

  async deletePaymentMethod(index: number) {
    const paymentMethod = this.paymentMethods[index];
    
    if (this.paymentMethods.length === 1) {
      this.modalService.showError('É necessário ter pelo menos uma forma de pagamento');
      return;
    }

    try {
      await firstValueFrom(
        this.paymentMethodService.deletePaymentMethod(paymentMethod.id!)
      );
      this.modalService.showSuccess('Forma de pagamento removida');
      await this.loadPaymentMethods();
    } catch (error) {
      console.error('❌ Erro ao remover forma de pagamento:', error);
      this.modalService.showError('Erro ao remover forma de pagamento');
    }
  }

  onValueTypeChange() {
    if (this.newPaymentMethod.value_type === 'percentage') {
      this.newPaymentMethod.fixed_value = 0;
    } else {
      this.newPaymentMethod.percentage = 0;
    }
  }

  private validateForm(): boolean {
    if (!this.newPaymentMethod.payment_method.trim()) {
      this.modalService.showError('Selecione uma forma de pagamento');
      return false;
    }

    if (this.newPaymentMethod.value_type === 'percentage') {
      if (!this.newPaymentMethod.percentage || this.newPaymentMethod.percentage <= 0) {
        this.modalService.showError('Percentual deve ser maior que 0');
        return false;
      }
    } else {
      if (!this.newPaymentMethod.fixed_value || this.newPaymentMethod.fixed_value <= 0) {
        this.modalService.showError('Valor fixo deve ser maior que 0');
        return false;
      }
    }

    return true;
  }

  private resetForm() {
    this.newPaymentMethod = {
      payment_method: '',
      value_type: 'percentage',
      percentage: 0,
      fixed_value: 0,
      sort_order: this.paymentMethods.length + 1
    };
  }

  private updateSortOrders() {
    this.paymentMethods.forEach((pm, index) => {
      pm.sort_order = index + 1;
    });
  }

  private async validatePercentages() {
    if (this.paymentMethods.some(pm => pm.value_type === 'percentage')) {
      try {
        const response = await firstValueFrom(
          this.paymentMethodService.validateContractPercentages(this.contractId)
        );
        this.validation = response.validation;
      } catch (error) {
        console.warn('⚠️ Erro ao validar percentuais:', error);
      }
    }
  }

  getCalculatedValue(paymentMethod: PaymentMethod): string {
    if (paymentMethod.value_type === 'percentage' && paymentMethod.percentage && this.totalValue) {
      const calculatedValue = this.paymentMethodService.calculateFixedValue(this.totalValue, paymentMethod.percentage);
      return this.paymentMethodService.formatValue(calculatedValue);
    } else if (paymentMethod.value_type === 'fixed_value' && paymentMethod.fixed_value) {
      return this.paymentMethodService.formatValue(paymentMethod.fixed_value);
    }
    return 'R$ 0,00';
  }

  getPercentageFromFixed(paymentMethod: PaymentMethod): string {
    if (paymentMethod.value_type === 'fixed_value' && paymentMethod.fixed_value && this.totalValue > 0) {
      const percentage = (paymentMethod.fixed_value / this.totalValue) * 100;
      return `${percentage.toFixed(1)}%`;
    }
    return '0%';
  }
}