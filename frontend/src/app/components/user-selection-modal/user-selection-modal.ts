import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfilePictureService } from '../../services/profile-picture.service';

// Re-using the interface for a user that can be assigned
interface AssignableUser {
  id: number;
  name: string;
  email: string;
  profile_picture_path?: string;
}

@Component({
  selector: 'app-user-selection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-selection-modal.html',
  styleUrls: ['./user-selection-modal.css']
})
export class UserSelectionModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() allUsers: AssignableUser[] = [];
  @Input() initialSelectedIds: number[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() selectionConfirmed = new EventEmitter<number[]>();

  searchTerm = '';
  // Use a Set for efficient add/remove operations inside the modal
  tempSelectedIds = new Set<number>();
  
  private profilePictureService = inject(ProfilePictureService);
  
  profilePictureUrls = new Map<number, string>();

  ngOnChanges(changes: SimpleChanges): void {
    // When the modal is opened, initialize its state from the parent form
    if (changes['isOpen'] && this.isOpen) {
      this.tempSelectedIds = new Set(this.initialSelectedIds);
      this.searchTerm = ''; // Reset search on open
      this.loadProfilePictures();
    }
  }

  get filteredUsers(): AssignableUser[] {
    if (!this.searchTerm) {
      return this.allUsers;
    }
    const lowercasedTerm = this.searchTerm.toLowerCase();
    return this.allUsers.filter(user =>
      user.name.toLowerCase().includes(lowercasedTerm) ||
      user.email.toLowerCase().includes(lowercasedTerm)
    );
  }

  // Toggle user selection within the modal
  toggleSelection(userId: number): void {
    if (this.tempSelectedIds.has(userId)) {
      this.tempSelectedIds.delete(userId);
    } else {
      this.tempSelectedIds.add(userId);
    }
  }

  // Check if a user is selected in the modal's current state
  isSelected(userId: number): boolean {
    return this.tempSelectedIds.has(userId);
  }

  // Handle clicking the modal backdrop to close it
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.close.emit();
    }
  }

  // Emit the final selection and close
  confirm(): void {
    this.selectionConfirmed.emit(Array.from(this.tempSelectedIds));
    this.close.emit();
  }
  
  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }
  
  getProfilePictureUrl(userId: number): string {
    return this.profilePictureUrls.get(userId) || '';
  }
  
  private loadProfilePictures(): void {
    this.allUsers.forEach(user => {
      if (user.profile_picture_path) {
        this.profilePictureService.getProfilePictureUrl(user.id).subscribe({
          next: (url) => {
            if (url) {
              this.profilePictureUrls.set(user.id, url);
            }
          },
          error: () => {
            // Ignora erros
          }
        });
      }
    });
  }
}