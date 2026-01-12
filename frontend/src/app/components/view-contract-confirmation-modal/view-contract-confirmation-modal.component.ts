import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-view-contract-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './view-contract-confirmation-modal.component.html',
  styleUrls: ['./view-contract-confirmation-modal.component.css']
})
export class ViewContractConfirmationModalComponent {
  @Input() isVisible = false;
  @Input() contractNumber = '';
  @Input() contractId: number | null = null;
  
  @Output() onViewContract = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  viewContract(): void {
    this.onViewContract.emit();
  }

  cancel(): void {
    this.onCancel.emit();
  }
}