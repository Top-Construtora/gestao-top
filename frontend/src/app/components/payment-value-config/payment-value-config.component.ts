import { Component, Input, Output, EventEmitter, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyMaskDirective } from '../../directives/currency-mask.directive';

interface PaymentValueConfig {
  type: 'percentage' | 'value';
  value: number | null;
  percentage: number | null;
}

@Component({
  selector: 'app-payment-value-config',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyMaskDirective],
  template: `
    <div class="payment-value-config" *ngIf="paymentMethod">
      <div class="payment-method-header">
        <div class="payment-method-info">
          <i [class]="getPaymentMethodIcon(paymentMethod)"></i>
          <span class="payment-method-name">{{ getPaymentMethodLabel(paymentMethod) }}</span>
        </div>
        <span class="payment-order">{{ orderNumber }}ª forma</span>
      </div>

      <div class="value-type-selector">
        <label class="radio-option" [class.selected]="config.type === 'percentage'">
          <input 
            type="radio" 
            name="valueType_{{orderNumber}}"
            value="percentage"
            [(ngModel)]="config.type"
            (ngModelChange)="onTypeChange()"
            [disabled]="disabled">
          <span class="radio-content">
            <span class="radio-title">
              <i class="fas fa-percentage"></i>
              Porcentagem do Total
            </span>
            <span class="radio-description">Definir como % do valor total</span>
          </span>
        </label>
        
        <label class="radio-option" [class.selected]="config.type === 'value'">
          <input 
            type="radio" 
            name="valueType_{{orderNumber}}"
            value="value"
            [(ngModel)]="config.type"
            (ngModelChange)="onTypeChange()"
            [disabled]="disabled">
          <span class="radio-content">
            <span class="radio-title">
              <i class="fas fa-dollar-sign"></i>
              Valor Fixo em Reais
            </span>
            <span class="radio-description">Definir valor específico</span>
          </span>
        </label>
      </div>

      <div class="value-input-section">
        <div class="form-group" *ngIf="config.type === 'percentage'">
          <label class="form-label">
            Porcentagem do Total <span class="required">*</span>
          </label>
          <div class="input-group">
            <input 
              type="number" 
              class="form-control"
              [(ngModel)]="config.percentage"
              name="percentage_{{orderNumber}}"
              [disabled]="disabled"
              min="0.01"
              max="100"
              step="0.01"
              placeholder="Ex: 50"
              (ngModelChange)="onValueChange()">
            <span class="input-suffix">%</span>
          </div>
          <div class="calculated-value" *ngIf="config.percentage && totalValue">
            <i class="fas fa-calculator"></i>
            <span>Valor: {{ getCalculatedValue() | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
        </div>

        <div class="form-group" *ngIf="config.type === 'value'">
          <label class="form-label">
            Valor em Reais <span class="required">*</span>
          </label>
          <input 
            type="text" 
            class="form-control"
            [(ngModel)]="config.value"
            name="value_{{orderNumber}}"
            [disabled]="disabled"
            placeholder="R$ 0,00"
            appCurrencyMask
            (ngModelChange)="onValueChange()">
          <div class="calculated-percentage" *ngIf="config.value && totalValue">
            <i class="fas fa-calculator"></i>
            <span>Porcentagem: {{ getCalculatedPercentage() }}%</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./payment-value-config.component.css']
})
export class PaymentValueConfigComponent implements OnInit {
  @Input() paymentMethod: string = '';
  @Input() orderNumber: number = 1;
  @Input() totalValue: number = 0;
  @Input() disabled: boolean = false;
  @Input() config: PaymentValueConfig = {
    type: 'percentage',
    value: null,
    percentage: null
  };
  
  @Output() configChange = new EventEmitter<PaymentValueConfig>();

  private paymentMethods = [
    { value: 'pix', label: 'PIX', icon: 'fas fa-qrcode' },
    { value: 'cartao_credito', label: 'Cartão de Crédito', icon: 'fas fa-credit-card' },
    { value: 'cartao_debito', label: 'Cartão de Débito', icon: 'fas fa-credit-card' },
    { value: 'boleto', label: 'Boleto Bancário', icon: 'fas fa-barcode' },
    { value: 'transferencia', label: 'Transferência Bancária', icon: 'fas fa-university' },
    { value: 'dinheiro', label: 'Dinheiro', icon: 'fas fa-money-bill-wave' },
    { value: 'cheque', label: 'Cheque', icon: 'fas fa-money-check' },
    { value: 'permuta', label: 'Permuta', icon: 'fas fa-exchange-alt' },
    { value: 'parcelado', label: 'Parcelado', icon: 'fas fa-calendar-alt' },
    { value: 'financiamento', label: 'Financiamento', icon: 'fas fa-hand-holding-usd' },
    { value: 'outro', label: 'Outro', icon: 'fas fa-ellipsis-h' }
  ];

  ngOnInit() {
    // Inicializar com porcentagem se não estiver definido
    if (!this.config.type) {
      this.config.type = 'percentage';
    }
  }

  onTypeChange() {
    // Limpar valores quando mudar tipo
    if (this.config.type === 'percentage') {
      this.config.value = null;
    } else {
      this.config.percentage = null;
    }
    this.emitChange();
  }

  onValueChange() {
    this.emitChange();
  }

  private emitChange() {
    this.configChange.emit({ ...this.config });
  }

  getPaymentMethodLabel(value: string): string {
    const method = this.paymentMethods.find(m => m.value === value);
    return method ? method.label : value;
  }

  getPaymentMethodIcon(value: string): string {
    const method = this.paymentMethods.find(m => m.value === value);
    return method ? method.icon : 'fas fa-question-circle';
  }

  getCalculatedValue(): number {
    if (this.config.percentage && this.totalValue) {
      return (this.totalValue * this.config.percentage) / 100;
    }
    return 0;
  }

  getCalculatedPercentage(): string {
    if (this.config.value && this.totalValue) {
      const percentage = (this.config.value / this.totalValue) * 100;
      return percentage.toFixed(2);
    }
    return '0.00';
  }
}