import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalService } from '../../services/modal.service';
import { ServiceService, ApiService, ServiceStats } from '../../services/service';
import { Subscription, firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { DuplicateServiceModalComponent } from '../duplicate-service-modal/duplicate-service-modal';

interface ServiceDisplay {
  id: number;
  name: string;
  category: string;
  duration: string;
  isActive: boolean;
  raw: ApiService;
}

@Component({
  selector: 'app-services-table',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent, DuplicateServiceModalComponent],
  templateUrl: './services-table.html',
  styleUrls: ['./services-table.css']
})
export class ServicesTableComponent implements OnInit, OnDestroy {
  private modalService = inject(ModalService);
  private serviceService = inject(ServiceService);
  private router = inject(Router);
  private subscriptions = new Subscription();

  services: ServiceDisplay[] = [];
  filteredServices: ServiceDisplay[] = [];
  isLoading = true;
  error = '';

  // Filter properties
  searchTerm = '';
  selectedCategory = '';
  availableCategories: string[] = [];

  // Duplicate modal properties
  showDuplicateModal = false;
  selectedServiceForDuplication: ApiService | null = null;

  ngOnInit() {
    this.loadData();
    window.addEventListener('refreshServices', this.loadData.bind(this));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    window.removeEventListener('refreshServices', this.loadData.bind(this));
  }

  async loadData() {
    this.isLoading = true;
    this.error = '';
    try {
      const servicesResponse = await firstValueFrom(this.serviceService.getServices({ is_active: true }));
      this.services = servicesResponse.services.map(apiService => this.mapApiServiceToTableService(apiService));
      this.extractCategories();
      this.applyFilters();

    } catch (error) {
      console.error('❌ Error loading services data:', error);
      this.error = 'Não foi possível carregar os dados dos serviços.';
    } finally {
      this.isLoading = false;
    }
  }

  private mapApiServiceToTableService(apiService: ApiService): ServiceDisplay {
    return {
      id: apiService.id,
      name: apiService.name,
      category: apiService.category || 'N/A',
      duration: this.serviceService.formatDuration(apiService.duration_amount, apiService.duration_unit),
      isActive: apiService.is_active,
      raw: apiService
    };
  }
  
  openNewServicePage() {
    this.router.navigate(['/home/servicos/novo']);
  }

  editService(id: number) {
    this.router.navigate(['/home/servicos/editar', id]);
  }

  async toggleServiceStatus(service: ServiceDisplay, event: MouseEvent) {
    event.stopPropagation();
    
    const action = service.isActive ? 'desativar' : 'ativar';
    if (confirm(`Tem certeza que deseja ${action} o serviço "${service.name}"?`)) {
      try {
        await firstValueFrom(this.serviceService.toggleServiceStatus(service.id));
        this.modalService.showSuccess(`Serviço ${action === 'desativar' ? 'desativado' : 'ativado'} com sucesso!`);
        this.loadData(); // Reload data to reflect changes
      } catch (error) {
        console.error(`❌ Error toggling service status:`, error);
        this.modalService.showError(`Não foi possível ${action} o serviço.`);
      }
    }
  }

  async deleteService(service: ServiceDisplay, event: MouseEvent) {
    event.stopPropagation();

    if (confirm(`Tem certeza que deseja excluir o serviço "${service.name}"?`)) {
      try {
        await firstValueFrom(this.serviceService.deleteService(service.id));
        this.modalService.showSuccess('Serviço excluído com sucesso!');
        this.loadData();
      } catch (error) {
        console.error(`❌ Error deleting service:`, error);
        this.modalService.showError('Não foi possível excluir o serviço.');
      }
    }
  }

  getCategoryIcon(category: string): string {
    const iconMap: { [key: string]: string } = {
      'Consultoria': 'fas fa-comments',
      'Treinamento': 'fas fa-chalkboard-teacher',
      'Mentoria': 'fas fa-user-tie',
      'Diagnóstico': 'fas fa-stethoscope',
      'Desenvolvimento': 'fas fa-line-chart',
      'Gestão': 'fas fa-tasks',
      'Estratégia': 'fas fa-bullseye',
      'Recrutamento & Seleção': 'fas fa-users',
      'Geral': 'far fa-sticky-note',
      'Interno': 'fas fa-file-contract'
    };
    return iconMap[category] || 'fas fa-concierge-bell';
  }



  private extractCategories() {
    const categories = new Set(this.services.map(service => service.category));
    this.availableCategories = Array.from(categories).sort();
  }

  applyFilters() {
    let filtered = [...this.services];

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(service =>
        service.name.toLowerCase().includes(searchLower) ||
        service.category.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (this.selectedCategory) {
      filtered = filtered.filter(service => service.category === this.selectedCategory);
    }

    this.filteredServices = filtered;
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilters();
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.applyFilters();
  }

  duplicateService(service: ServiceDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedServiceForDuplication = service.raw;
    this.showDuplicateModal = true;
  }

  onDuplicateModalClose() {
    this.showDuplicateModal = false;
    this.selectedServiceForDuplication = null;
  }

  onServiceDuplicated(newService: any) {
    this.modalService.showSuccess('Serviço duplicado com sucesso!');
    this.showDuplicateModal = false;
    this.selectedServiceForDuplication = null;
    this.loadData(); // Reload services list

    // Offer to edit the new service
    const editNewService = confirm('Deseja editar o serviço duplicado?');
    if (editNewService && newService?.id) {
      this.router.navigate(['/home/servicos/editar', newService.id]);
    }
  }
}