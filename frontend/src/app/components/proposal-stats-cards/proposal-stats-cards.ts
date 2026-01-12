import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProposalService } from '../../services/proposal';
import { AuthService } from '../../services/auth';
import { firstValueFrom, Subscription } from 'rxjs';

interface StatCard {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: number;
  subtitle?: string;
}

@Component({
  selector: 'app-proposal-stats-cards',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './proposal-stats-cards.html',
  styleUrls: ['./proposal-stats-cards.css']
})
export class ProposalStatsCardsComponent implements OnInit, OnDestroy, OnChanges {
  private proposalService = inject(ProposalService);
  private authService = inject(AuthService);
  private subscriptions = new Subscription();

  @Input() filteredProposals: any[] = [];
  @Input() useFilteredData = false;
  @Input() activeStatusFilter: string = '';

  cards: StatCard[] = [];
  isLoading = true;
  error = '';
  allProposals: any[] = [];

  ngOnInit() {
    this.loadStats();
    // Listen for proposal updates
    window.addEventListener('refreshProposals', this.loadStats.bind(this));
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['filteredProposals'] || changes['activeStatusFilter']) && this.useFilteredData) {
      this.updateCardsWithFilteredData();
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    window.removeEventListener('refreshProposals', this.loadStats.bind(this));
  }

  async loadStats() {
    this.isLoading = true;
    this.error = '';

    try {
      // Carregar todas as propostas
      const proposalsResponse = await firstValueFrom(this.proposalService.getProposals());

      if (proposalsResponse && proposalsResponse.success && proposalsResponse.data) {
        this.allProposals = proposalsResponse.data;

        // Se está usando dados filtrados, usar os filtrados, senão usar todos
        const proposalsToUse = this.useFilteredData && this.filteredProposals && this.filteredProposals.length > 0
          ? this.filteredProposals.map(fp => fp.raw || fp)
          : this.allProposals;

        this.calculateAndUpdateCards(proposalsToUse);
      } else {
        this.buildDefaultCards();
      }

      // Também carregar estatísticas do backend se disponível
      try {
        const statsResponse = await firstValueFrom(this.proposalService.getProposalStats());
        if (statsResponse && statsResponse.success && statsResponse.data && !this.useFilteredData) {
          // Usar stats do backend apenas quando não estiver usando dados filtrados
          this.buildStatCards(statsResponse.data);
        }
      } catch {
        // Ignorar erro de stats, usar cálculo local
      }
    } catch (error: any) {
      console.error('❌ Error loading proposal stats:', error);

      if (error?.status === 500 || error?.status === 404) {
        this.error = 'Estatísticas de propostas ainda não implementadas no backend.';
        this.buildDefaultCards();
      } else {
        this.error = 'Não foi possível carregar as estatísticas.';
        this.buildDefaultCards();
      }
    } finally {
      this.isLoading = false;
    }
  }

  private updateCardsWithFilteredData() {
    if (!this.filteredProposals) {
      return;
    }

    const proposals = this.filteredProposals.map(fp => fp.raw || fp);
    this.calculateAndUpdateCards(proposals);
  }

  private calculateAndUpdateCards(proposals: any[]) {
    const totalProposals = proposals.length;
    const sentProposals = proposals.filter((p: any) => p.status === 'sent').length;
    const signedProposals = proposals.filter((p: any) => p.status === 'signed').length;
    const convertedProposals = proposals.filter((p: any) => p.status === 'converted').length;

    // Calculate pending value based on active status filter
    let pendingValue = 0;
    let pendingTitle = 'Valor em Aberto';
    let pendingSubtitle = '';
    let pendingCount = 0;

    if (this.activeStatusFilter === 'signed') {
      // When "Fechada" filter is selected, show signed proposals value
      pendingValue = proposals
        .filter((p: any) => p.status === 'signed')
        .reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);
      pendingCount = signedProposals;
      pendingSubtitle = `${pendingCount} proposta${pendingCount !== 1 ? 's' : ''} fechada${pendingCount !== 1 ? 's' : ''}`;
    } else if (this.activeStatusFilter === 'sent') {
      // When "Enviada" filter is selected, show sent proposals value
      pendingValue = proposals
        .filter((p: any) => p.status === 'sent')
        .reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);
      pendingCount = sentProposals;
      pendingSubtitle = `${pendingCount} proposta${pendingCount !== 1 ? 's' : ''} enviada${pendingCount !== 1 ? 's' : ''}`;
    } else if (this.activeStatusFilter) {
      // When any other status filter is selected, show that status value
      pendingValue = proposals
        .filter((p: any) => p.status === this.activeStatusFilter)
        .reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);
      pendingCount = proposals.filter((p: any) => p.status === this.activeStatusFilter).length;
      const statusText = this.getStatusText(this.activeStatusFilter);
      pendingSubtitle = `${pendingCount} proposta${pendingCount !== 1 ? 's' : ''} ${statusText.toLowerCase()}${pendingCount !== 1 ? 's' : ''}`;
    } else {
      // Default: show sent proposals value when no filter is active
      pendingValue = proposals
        .filter((p: any) => p.status === 'sent')
        .reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);
      pendingCount = sentProposals;
      pendingSubtitle = `${pendingCount} proposta${pendingCount !== 1 ? 's' : ''} enviada${pendingCount !== 1 ? 's' : ''}`;
    }

    // Calcular valor total de todas as propostas filtradas
    const totalValue = proposals.reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);

    // Construir cards base
    const baseCards: StatCard[] = [
      {
        title: 'Total de Propostas',
        value: totalProposals,
        icon: 'fas fa-file-alt',
        color: '#003b2b',
        subtitle: this.useFilteredData ? 'Propostas filtradas' : undefined
      },
      {
        title: 'Propostas Enviadas',
        value: sentProposals,
        icon: 'fas fa-paper-plane',
        color: '#003b2b',
        subtitle: totalProposals > 0 ? `${Math.round((sentProposals / totalProposals) * 100)}% do total` : '0% do total'
      },
      {
        title: 'Propostas Fechadas',
        value: signedProposals + convertedProposals,
        icon: 'fas fa-check-circle',
        color: '#003b2b',
        subtitle: totalProposals > 0 ? `${Math.round(((signedProposals + convertedProposals) / totalProposals) * 100)}% do total` : '0% do total'
      }
    ];

    // Adicionar card de "Valor em Aberto" apenas se não for admin_gerencial
    if (!this.authService.isAdminGerencial()) {
      baseCards.push({
        title: pendingTitle,
        value: this.formatCurrency(pendingValue),
        icon: 'fas fa-dollar-sign',
        color: '#003b2b',
        subtitle: pendingSubtitle
      } as StatCard);
    }

    this.cards = baseCards;

    this.isLoading = false;
  }

  private buildStatCards(stats: any) {
    const totalProposals = stats.total || 0;
    const sentProposals = stats.byStatus?.sent || 0;
    const signedProposals = stats.byStatus?.signed || 0;
    const acceptedProposals = stats.byStatus?.accepted || 0;
    // Calculate pending value only for sent proposals
    const pendingValue = stats.sentValue || 0;

    // Construir cards base
    const baseCards: StatCard[] = [
      {
        title: 'Total de Propostas',
        value: totalProposals,
        icon: 'fas fa-file-alt',
        color: '#003b2b',
      },
      {
        title: 'Propostas Enviadas',
        value: sentProposals,
        icon: 'fas fa-paper-plane',
        color: '#003b2b',
      },
      {
        title: 'Propostas Fechadas',
        value: signedProposals + acceptedProposals,
        icon: 'fas fa-check-circle',
        color: '#003b2b',
      }
    ];

    // Adicionar card de "Valor em Aberto" apenas se não for admin_gerencial
    if (!this.authService.isAdminGerencial()) {
      baseCards.push({
        title: 'Valor em Aberto',
        value: this.formatCurrency(pendingValue),
        icon: 'fas fa-dollar-sign',
        color: '#003b2b',
        subtitle: `${sentProposals} proposta${sentProposals !== 1 ? 's' : ''} enviada${sentProposals !== 1 ? 's' : ''}`
      } as StatCard);
    }

    this.cards = baseCards;
  }

  private buildDefaultCards() {
    // Construir cards base
    const baseCards: StatCard[] = [
      {
        title: 'Total de Propostas',
        value: 0,
        icon: 'fas fa-file-alt',
        color: '#003b2b',
      },
      {
        title: 'Propostas Enviadas',
        value: 0,
        icon: 'fas fa-paper-plane',
        color: '#003b2b',
      },
      {
        title: 'Propostas Fechadas',
        value: 0,
        icon: 'fas fa-check-circle',
        color: '#003b2b',
      }
    ];

    // Adicionar card de "Valor em Aberto" apenas se não for admin_gerencial
    if (!this.authService.isAdminGerencial()) {
      baseCards.push({
        title: 'Valor em Aberto',
        value: 'R$ 0,00',
        icon: 'fas fa-dollar-sign',
        color: '#003b2b',
      } as StatCard);
    }

    this.cards = baseCards;
  }

  private formatCurrency(value: number): string {
    return this.proposalService.formatCurrency(value);
  }

  private getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'draft': 'rascunho',
      'sent': 'enviada',
      'signed': 'fechada',
      'rejected': 'rejeitada',
      'expired': 'expirada',
      'converted': 'assinada',
      'contraproposta': 'assinada parcialmente'
    };
    return statusMap[status] || status;
  }

  getTrendIcon(trend?: number): string {
    if (!trend) return '';
    return trend > 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
  }

  getTrendClass(trend?: number): string {
    if (!trend) return '';
    return trend > 0 ? 'trend-positive' : 'trend-negative';
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  trackByCardId(index: number, card: StatCard): string {
    return card.title;
  }
}