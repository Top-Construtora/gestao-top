import { Component, Input, Output, EventEmitter, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-payment-methods-selector',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PaymentMethodsSelectorComponent),
      multi: true
    }
  ],
  template: `
    <div class="payment-methods-selector">
      <label class="form-label" *ngIf="label">
        {{ label }}
        <span class="required" *ngIf="required">*</span>
      </label>
      
      <div class="payment-methods-grid">
        <div 
          *ngFor="let method of availablePaymentMethods" 
          class="payment-method-card"
          [class.selected]="isSelected(method.value)"
          [class.disabled]="disabled || (isSelected(method.value) ? false : selectedMethods.length >= maxSelections)"
          (click)="toggleMethod(method.value)">
          
          <div class="payment-method-content">
            <div class="payment-method-icon">
              <i [class]="method.icon"></i>
            </div>
            <span class="payment-method-label">{{ method.label }}</span>
            
            <!-- Checkbox visual -->
            <div class="payment-method-checkbox">
              <i class="fas fa-check" *ngIf="isSelected(method.value)"></i>
            </div>
          </div>
          
          <!-- Ordem de seleção -->
          <div class="selection-order" *ngIf="isSelected(method.value)">
            {{ getSelectionOrder(method.value) }}
          </div>
        </div>
      </div>
      
      <!-- Informações de seleção -->
      <div class="selection-info" *ngIf="selectedMethods.length > 0">
        <div class="selected-summary">
          <i class="fas fa-info-circle"></i>
          <span>{{ selectedMethods.length }} de {{ maxSelections }} formas de pagamento selecionadas</span>
        </div>
        
        <!-- Lista das formas selecionadas -->
        <div class="selected-methods-list">
          <div 
            *ngFor="let methodValue of selectedMethods; let i = index" 
            class="selected-method-item">
            <span class="method-order">{{ i + 1 }}.</span>
            <i [class]="getPaymentMethodIcon(methodValue)"></i>
            <span class="method-name">{{ getPaymentMethodLabel(methodValue) }}</span>
            
            <button 
              type="button" 
              class="remove-method-btn"
              (click)="removeMethod(methodValue)"
              [disabled]="disabled"
              title="Remover forma de pagamento">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Mensagem de limite -->
      <div class="max-selection-info" *ngIf="selectedMethods.length >= maxSelections">
        <i class="fas fa-info-circle"></i>
        <span>Limite máximo de {{ maxSelections }} formas de pagamento atingido</span>
      </div>
    </div>
  `,
  styleUrls: ['./payment-methods-selector.component.css']
})
export class PaymentMethodsSelectorComponent implements OnInit, ControlValueAccessor {
  @Input() label: string = '';
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() maxSelections: number = 2;
  @Input() placeholder: string = 'Selecione até 2 formas de pagamento';
  
  @Output() selectionChange = new EventEmitter<string[]>();

  selectedMethods: string[] = [];
  
  availablePaymentMethods: PaymentMethod[] = [
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

  // ControlValueAccessor implementation
  private onChange = (value: string[]) => {};
  private onTouched = () => {};

  ngOnInit() {
    // Component initialization
  }

  isSelected(value: string): boolean {
    return this.selectedMethods.includes(value);
  }

  getSelectionOrder(value: string): number {
    return this.selectedMethods.indexOf(value) + 1;
  }

  toggleMethod(value: string) {
    if (this.disabled) return;

    if (this.isSelected(value)) {
      this.removeMethod(value);
    } else {
      this.addMethod(value);
    }
  }

  addMethod(value: string) {
    if (this.selectedMethods.length < this.maxSelections && !this.isSelected(value)) {
      this.selectedMethods.push(value);
      this.emitChange();
    }
  }

  removeMethod(value: string) {
    const index = this.selectedMethods.indexOf(value);
    if (index > -1) {
      this.selectedMethods.splice(index, 1);
      this.emitChange();
    }
  }

  private emitChange() {
    this.onChange(this.selectedMethods);
    this.onTouched();
    this.selectionChange.emit([...this.selectedMethods]);
  }

  getPaymentMethodLabel(value: string): string {
    const method = this.availablePaymentMethods.find(m => m.value === value);
    return method ? method.label : value;
  }

  getPaymentMethodIcon(value: string): string {
    const method = this.availablePaymentMethods.find(m => m.value === value);
    return method ? method.icon : 'fas fa-question-circle';
  }

  // ControlValueAccessor methods
  writeValue(value: string[]): void {
    this.selectedMethods = value || [];
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}