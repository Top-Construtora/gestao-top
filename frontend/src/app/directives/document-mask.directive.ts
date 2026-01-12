import { Directive, HostListener, ElementRef, OnInit, Optional, Input } from '@angular/core';
import { NgControl } from '@angular/forms';

export type DocumentMaskType = 'cpf' | 'cnpj' | 'cep' | 'phone';

@Directive({
  selector: '[appDocumentMask]',
  standalone: true,
})
export class DocumentMaskDirective implements OnInit {
  @Input() appDocumentMask: DocumentMaskType = 'cpf';
  
  private el: HTMLInputElement;

  constructor(
    private elementRef: ElementRef,
    @Optional() private ngControl: NgControl
  ) {
    this.el = this.elementRef.nativeElement;
  }

  ngOnInit() {
    if (this.ngControl?.control?.value) {
      this.format(String(this.ngControl.control.value));
    }
  }

  @HostListener('input', ['$event'])
  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.format(value);
  }

  @HostListener('blur', ['$event'])
  onBlur(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.format(value);
  }

  private format(value: string) {
    if (!value) {
      this.updateValue('');
      return;
    }

    let cleanValue = value.replace(/\D/g, '');
    let formattedValue = '';

    switch (this.appDocumentMask) {
      case 'cpf':
        formattedValue = this.formatCPF(cleanValue);
        break;
      case 'cnpj':
        formattedValue = this.formatCNPJ(cleanValue);
        break;
      case 'cep':
        formattedValue = this.formatCEP(cleanValue);
        break;
      case 'phone':
        formattedValue = this.formatPhone(cleanValue);
        break;
      default:
        formattedValue = cleanValue;
    }

    this.updateValue(formattedValue);
  }

  private formatCPF(value: string): string {
    // Remove caracteres não numéricos
    value = value.replace(/\D/g, '');
    
    // Limita a 11 dígitos
    value = value.substring(0, 11);
    
    // Aplica a máscara
    if (value.length <= 3) {
      return value;
    } else if (value.length <= 6) {
      return value.replace(/(\d{3})(\d+)/, '$1.$2');
    } else if (value.length <= 9) {
      return value.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    } else {
      return value.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
    }
  }

  private formatCNPJ(value: string): string {
    // Remove caracteres não numéricos
    value = value.replace(/\D/g, '');
    
    // Limita a 14 dígitos
    value = value.substring(0, 14);
    
    // Aplica a máscara
    if (value.length <= 2) {
      return value;
    } else if (value.length <= 5) {
      return value.replace(/(\d{2})(\d+)/, '$1.$2');
    } else if (value.length <= 8) {
      return value.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
    } else if (value.length <= 12) {
      return value.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
    } else {
      return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5');
    }
  }


  private formatCEP(value: string): string {
    // Remove caracteres não numéricos
    value = value.replace(/\D/g, '');
    
    // Limita a 8 dígitos
    value = value.substring(0, 8);
    
    // Aplica a máscara
    if (value.length <= 5) {
      return value;
    } else {
      return value.replace(/(\d{5})(\d+)/, '$1-$2');
    }
  }

  private formatPhone(value: string): string {
    // Remove caracteres não numéricos
    value = value.replace(/\D/g, '');
    
    // Limita a 11 dígitos
    value = value.substring(0, 11);
    
    // Aplica a máscara
    if (value.length <= 2) {
      return value;
    } else if (value.length <= 7) {
      return value.replace(/(\d{2})(\d+)/, '($1) $2');
    } else if (value.length <= 10) {
      return value.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
    } else {
      return value.replace(/(\d{2})(\d{5})(\d+)/, '($1) $2-$3');
    }
  }

  private updateValue(formattedValue: string) {
    if (this.ngControl?.control) {
      // Para o form control, mantemos o valor limpo (sem máscara)
      const cleanValue = formattedValue.replace(/\D/g, '');
      this.ngControl.control.setValue(formattedValue); // Alterado para manter a máscara no form
    }
    
    // Atualiza o valor visual no input
    if (this.el.value !== formattedValue) {
      this.el.value = formattedValue;
    }
  }
}