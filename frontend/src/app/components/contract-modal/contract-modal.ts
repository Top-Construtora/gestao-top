import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InstallmentsModalComponent } from '../installments-modal/installments-modal';

interface Service {
  id: string;
  name: string;
}

@Component({
  selector: 'app-contract-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, InstallmentsModalComponent],
  templateUrl: './contract-modal.html',
  styleUrls: ['./contract-modal.css']
})
export class ContractModalComponent {
  @Input() isOpen = false;
  @Input() servicesList: Service[] = [];
  @Input() selectedServices: Set<string> = new Set();
  @Input() contractId: number | null = null;
  @Input() contractNumber: string = '';
  @Input() totalValue: number = 0;
  @Input() installmentCount: number = 1;

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  isInstallmentsModalOpen = false;

  toggleService(serviceId: string) {
    if (this.selectedServices.has(serviceId)) {
      this.selectedServices.delete(serviceId);
    } else {
      this.selectedServices.add(serviceId);
    }
  }

  isServiceSelected(serviceId: string): boolean {
    return this.selectedServices.has(serviceId);
  }

  getServiceName(serviceId: string): string {
    const service = this.servicesList.find(s => s.id === serviceId);
    return service ? service.name : '';
  }

  openInstallmentsModal() {
    this.isInstallmentsModalOpen = true;
  }

  closeInstallmentsModal() {
    this.isInstallmentsModalOpen = false;
  }

  handleInstallmentsSave(installments: any[]) {
    console.log('Parcelas salvas:', installments);
    this.closeInstallmentsModal();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.close.emit();
    }
  }
}