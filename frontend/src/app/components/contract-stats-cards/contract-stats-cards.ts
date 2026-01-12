import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContractService, ApiContract, ContractsResponse } from '../../services/contract';
import { ToastrService } from 'ngx-toastr';

interface StatsCard {
  id: string;
  title: string;
  value: string | number; // Pode ser string (formatado) ou number
  icon: string;
  color: string;
  trend?: number;
  subtitle?: string;
}

@Component({
  selector: 'app-contract-stats-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contract-stats-cards.html',
  styleUrl: './contract-stats-cards.css'
})
export class ContractStatsCardsComponent implements OnInit, OnChanges {
  @Input() filteredContracts: any[] = [];
  @Input() useFilteredData = false;
  @Input() activeStatusFilter = '';
  @Output() onCardClick = new EventEmitter<string>();

  isLoading = true;
  error: string | null = null;
  cards: StatsCard[] = [];
  allContracts: ApiContract[] = [];
  canViewFinancialInfo = false; // Admin Gerencial não pode ver valores

  constructor(
    private contractService: ContractService,
    private toastr: ToastrService
  ) {
    // Verificar se o usuário pode ver valores financeiros
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        // Apenas Admin pode ver valores (Admin Gerencial não pode)
        this.canViewFinancialInfo = user.role === 'admin';
      } catch (error) {
        this.canViewFinancialInfo = false;
      }
    }
  }

  ngOnInit() {
    this.loadStatistics();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['filteredContracts'] || changes['activeStatusFilter']) && this.useFilteredData && this.filteredContracts) {
      this.updateCardsWithFilteredData();
    }
  }

  loadStatistics() {
    this.isLoading = true;
    this.error = null;

    this.contractService.getContracts().subscribe({
      next: (response: ContractsResponse) => {
        this.allContracts = response.contracts;
        const contracts = this.useFilteredData && this.filteredContracts.length >= 0
          ? this.filteredContracts.map(fc => fc.raw || fc)
          : this.allContracts;

        this.calculateAndUpdateCards(contracts);
      },
      error: (error: any) => {
        console.error('Erro ao carregar estatísticas:', error);
        this.error = 'Erro ao carregar estatísticas de contratos';
        this.isLoading = false;
        this.toastr.error('Erro ao carregar estatísticas');
      }
    });
  }

  updateCardsWithFilteredData() {
    if (!this.allContracts || this.allContracts.length === 0) {
      return;
    }

    const contracts = this.filteredContracts.map(fc => fc.raw || fc);
    this.calculateAndUpdateCards(contracts);
  }

  calculateAndUpdateCards(contracts: any[]) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Total de contratos filtrados
    const totalContracts = contracts.length;

    // Determinar qual status contar baseado no filtro
    let statusCount = 0;
    let statusTitle = 'Contratos';
    let statusIcon = 'fas fa-file-contract';
    let statusColor = '#003b2b';

    if (this.activeStatusFilter) {
      // Se há filtro de status, contar esse status específico
      switch (this.activeStatusFilter) {
        case 'active':
          statusCount = contracts.filter((c: ApiContract) => c.status === 'active').length;
          statusTitle = 'Contratos Ativos';
          statusIcon = 'fas fa-check-circle';
          statusColor = '#059669'; // Verde
          break;
        case 'completed':
          statusCount = contracts.filter((c: ApiContract) => c.status === 'completed').length;
          statusTitle = 'Contratos Concluídos';
          statusIcon = 'fas fa-check-double';
          statusColor = '#3B82F6'; // Azul
          break;
        case 'cancelled':
          statusCount = contracts.filter((c: ApiContract) => c.status === 'cancelled').length;
          statusTitle = 'Contratos Cancelados';
          statusIcon = 'fas fa-times-circle';
          statusColor = '#DC2626'; // Vermelho
          break;
        case 'suspended':
          statusCount = contracts.filter((c: ApiContract) => c.status === 'suspended').length;
          statusTitle = 'Contratos Suspensos';
          statusIcon = 'fas fa-pause-circle';
          statusColor = '#F59E0B'; // Amarelo
          break;
        default:
          statusCount = totalContracts;
          statusTitle = 'Total de Contratos';
          statusIcon = 'fas fa-file-contract';
          statusColor = '#003b2b';
      }
    } else {
      // Sem filtro de status, mostrar total de contratos
      statusCount = totalContracts;
      statusTitle = 'Total de Contratos';
      statusIcon = 'fas fa-file-contract';
      statusColor = '#003b2b';
    }

    // Contratos deste mês
    const contractsThisMonth = contracts.filter((c: ApiContract) => {
      const date = new Date(c.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    // Contratos do mês passado
    const contractsLastMonth = contracts.filter((c: ApiContract) => {
      const date = new Date(c.created_at);
      return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    }).length;

    // Calcular tendência
    const trend = contractsLastMonth > 0
      ? Math.round(((contractsThisMonth - contractsLastMonth) / contractsLastMonth) * 100)
      : contractsThisMonth > 0 ? 100 : 0;

    // Valor total dos contratos filtrados (todos, não apenas ativos)
    const totalValue = contracts
      .reduce((sum: number, c: ApiContract) => {
        // Calcular valor ajustado considerando serviços cancelados
        let adjustedValue = c.total_value || 0;
        if (c.contract_services) {
          const cancelledValue = c.contract_services
            .filter((s: any) => s.status === 'cancelled')
            .reduce((sum: number, s: any) => sum + (s.total_value || 0), 0);
          adjustedValue = Math.max(0, adjustedValue - cancelledValue);
        }
        return sum + adjustedValue;
      }, 0);

    // Taxa de conclusão
    const completedContracts = contracts.filter((c: ApiContract) => c.status === 'completed').length;
    const completionRate = totalContracts > 0
      ? Math.round((completedContracts / totalContracts) * 100)
      : 0;

    // Contratos vencendo em breve (próximos 15 dias)
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);

    const expiringContracts = contracts.filter((c: ApiContract) => {
      if (c.status !== 'active' || !c.end_date) return false;
      const endDate = new Date(c.end_date);
      return endDate >= now && endDate <= fifteenDaysFromNow;
    }).length;

    // Cards base (sem valores financeiros se Admin Gerencial)
    const baseCards: StatsCard[] = [
      {
        id: 'status',
        title: statusTitle,
        value: statusCount,
        icon: statusIcon,
        color: statusColor,
        subtitle: totalContracts > 0 ? `${Math.round((statusCount / totalContracts) * 100)}% do total filtrado` : '0% do total'
      }
    ];

    // Card de Valor Total - APENAS para Admin
    if (this.canViewFinancialInfo) {
      baseCards.push({
        id: 'value',
        title: 'Valor Total',
        value: this.formatCurrency(totalValue),
        icon: 'fas fa-dollar-sign',
        color: '#003b2b',
        subtitle: this.useFilteredData ? `${totalContracts} contrato${totalContracts !== 1 ? 's' : ''} filtrado${totalContracts !== 1 ? 's' : ''}` : 'Todos os contratos'
      });
    }

    // Card de Vencimento
    baseCards.push({
      id: 'expiring',
      title: 'Vencendo em Breve',
      value: expiringContracts,
      icon: 'fas fa-clock',
      color: '#003b2b',
      subtitle: 'Próximos 15 dias'
    });

    this.cards = baseCards;

    this.isLoading = false;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  getTrendClass(trend: number): string {
    return trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'neutral';
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  trackByCardId(index: number, card: StatsCard): string {
    return card.id;
  }

  handleCardClick(cardId: string) {
    // Emitir evento apenas para o card de vencimento
    if (cardId === 'expiring') {
      this.onCardClick.emit(cardId);
    }
  }
}