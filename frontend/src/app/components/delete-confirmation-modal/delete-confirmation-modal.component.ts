import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-confirmation-modal.component.html',
  styleUrls: ['./delete-confirmation-modal.component.css']
})
export class DeleteConfirmationModalComponent {
  @Input() isVisible = false;
  @Input() title = 'Confirmar Exclusão';
  @Input() message = 'Tem certeza que deseja excluir este item?';
  @Input() itemName = '';
  @Input() isDeleting = false;
  @Input() deleteButtonText = 'Excluir';
  @Input() cancelButtonText = 'Cancelar';
  
  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  confirmDelete(): void {
    if (!this.isDeleting) {
      this.onConfirm.emit();
    }
  }

  cancelDelete(): void {
    if (!this.isDeleting) {
      this.onCancel.emit();
    }
  }

}