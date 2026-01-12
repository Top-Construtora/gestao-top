import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Chart } from 'chart.js';
import { Router } from '@angular/router';
import { ContractService } from '../../services/contract';
import { ServiceService } from '../../services/service';
import { ClientService } from '../../services/client';
import { AuthService } from '../../services/auth';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { forkJoin } from 'rxjs';

// Lazy load Chart.js

interface StatCard {
  id: string;
  label: string;
  value: number | string;
  change: string;
  changeType: 'positive' | 'negative';
  icon: string;
  progress: number;
  color: string;
  bgColor: string;
}

interface Activity {
  id?: number;
  time: string;
  title: string;
  description: string;
  type: 'service' | 'diagnostic' | 'okr' | 'mentoring' | 'hr' | 'other';
  status: 'not_started' | 'scheduled' | 'in_progress' | 'completed';
  category?: string;
  value?: number;
  duration?: string;
  contractId?: number;
  serviceId?: number;
}

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  color: string;
  action: string;
}

@Component({
  selector: 'app-dashboard-content',
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent],
  templateUrl: './dashboard-content.html',
  styleUrls: ['./dashboard-content.css']
})
export class DashboardContentComponent implements OnInit, AfterViewInit, OnDestroy {
  statCards: StatCard[] = [];
  recentActivities: Activity[] = [];
  quickActions: QuickAction[] = [
    { id: 'new-service', icon: 'fas fa-briefcase', label: 'Novo Serviço', color: '#1e6076', action: 'newService' },
    { id: 'new-client', icon: 'fas fa-users', label: 'Novo Cliente', color: '#1e6076', action: 'newClient' },
    { id: 'new-proposal', icon: 'fas fa-file-alt', label: 'Nova Proposta', color: '#1e6076', action: 'newProposal' },
    { id: 'new-contract', icon: 'fas fa-file-contract', label: 'Novo Contrato', color: '#1e6076', action: 'newContract' },
    { id: 'generate-report', icon: 'fas fa-chart-bar', label: 'Gerar Relatório', color: '#1e6076', action: 'generateReport' }
  ];
  monthlyContractsData = {
    labels: [] as string[],
    datasets: [{
      label: 'Contratos Criados',
      data: [] as number[],
      borderColor: '#1e6076',
      backgroundColor: 'rgba(30, 96, 118, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 3,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#1e6076',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointHoverBorderWidth: 3
    }, {
      label: 'Contratos Ativos',
      data: [] as number[],
      borderColor: '#baa673',
      backgroundColor: 'rgba(186, 166, 115, 0.1)',
      fill: false,
      tension: 0.4,
      borderWidth: 2,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#baa673',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHoverBorderWidth: 2,
      borderDash: [5, 5]
    }]
  };
  contractsChart: Chart | null = null;
  activityFilter: 'all' | 'completed' | 'in_progress' | 'scheduled' | 'not_started' = 'all';

  private themeObserver!: MutationObserver;

  constructor(
    private router: Router,
    private contractService: ContractService,
    private serviceService: ServiceService,
    private clientService: ClientService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Inicializar com dados zerados
    this.updateStatCards({ total: 0, active: 0 }, { total: 0 }, 0);
    // Filtrar quick actions baseado no role do usuário
    this.filterQuickActionsByRole();
    // Carregar dados de forma sequencial para evitar rate limiting
    this.loadDashboardDataSequentially();
  }

  ngAfterViewInit() {
    // Aguardar um pouco para garantir que o DOM esteja pronto
    setTimeout(async () => {
      await this.initCharts();
    }, 100);

    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setTimeout(async () => {
            await this.initCharts();
          }, 100);
        }
      });
    });

    this.themeObserver.observe(document.body, { attributes: true });
  }

  ngOnDestroy() {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
    if (this.contractsChart) {
      this.contractsChart.destroy();
    }
  }

  private async loadDashboardDataSequentially() {
    try {
      if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
        // Carregar dados de forma sequencial para evitar rate limiting
        await this.loadAdminDataSequentially();
      } else {
        // Para usuários normais, carregar apenas contratos vinculados ao usuário
        await this.loadUserSpecificData();
      }

      // Aguardar antes de carregar chart data
      await this.delay(1000);
      await this.loadChartData();

      // Aguardar antes de carregar atividades
      await this.delay(1000);
      await this.loadRecentActivities();

    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
      // Usar dados com valores zerados em caso de erro
      this.updateStatCards({ total: 0, active: 0 }, { total: 0 }, 0);
    }
  }

  private async loadAdminDataSequentially() {
    try {
      // Carregar dados sequencialmente com delays
      console.log('📊 Carregando stats de contratos...');
      const contractStats = await this.contractService.getStats().toPromise();

      await this.delay(500);
      console.log('📋 Carregando stats de serviços...');
      const serviceStats = await this.serviceService.getStats().toPromise();

      await this.delay(500);
      console.log('👥 Carregando dados de clientes...');
      const clientsData = await this.clientService.getClients().toPromise();

      const totalClients = clientsData?.total || 0;
      this.updateStatCards(contractStats?.stats || { total: 0, active: 0 }, serviceStats?.stats || { total: 0 }, totalClients);

      console.log('✅ Dados do dashboard carregados com sucesso');
    } catch (error) {
      console.error('❌ Erro ao carregar dados admin:', error);
      this.updateStatCards({ total: 0, active: 0 }, { total: 0 }, 0);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async loadChartData() {
    try {
      console.log('📈 Carregando dados do gráfico...');

      if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
        // Para admin e admin_gerencial, carregar dados de todos os contratos como antes
        const response = await this.contractService.getContracts().toPromise();
        this.generateChartData(response?.contracts || []);
      } else {
        // Para usuários normais, carregar dados apenas dos seus contratos
        const response = await this.contractService.getContracts().toPromise();
        const userContracts = response?.contracts || [];
        this.generateUserChartData(userContracts);
      }

      if (this.contractsChart) {
        this.contractsChart.destroy();
      }
      this.initContractsChart();
      console.log('✅ Dados do gráfico carregados');

    } catch (error) {
      console.error('❌ Erro ao carregar dados do gráfico:', error);
      // Usar dados mock/zerados em caso de erro
      if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
        this.generateMockChartData();
      } else {
        this.generateEmptyChartData();
      }

      if (this.contractsChart) {
        this.contractsChart.destroy();
      }
      this.initContractsChart();
    }
  }

  private async loadRecentActivities() {
    try {
      console.log('📋 Carregando atividades recentes...');

      if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
        // Para admin e admin_gerencial, carregar todas as atividades como antes
        const response = await this.contractService.getRecentServiceActivities(10).toPromise();
        if (response?.success && response.activities) {
          this.recentActivities = response.activities.map((activity: any) => ({
            id: activity.id,
            time: activity.time,
            title: activity.title,
            description: activity.description,
            type: 'service',
            status: activity.status,
            category: activity.category,
            value: activity.value,
            duration: activity.duration,
            contractId: activity.contractId,
            serviceId: activity.serviceId
          }));
        }
      } else {
        // Para usuários normais, carregar apenas atividades dos seus contratos
        await this.loadUserActivities();
      }

      console.log('✅ Atividades recentes carregadas');
    } catch (error) {
      console.error('❌ Erro ao carregar atividades recentes:', error);
      // Manter atividades mock em caso de erro para demonstração
    }
  }

  private async loadUserActivities() {
    try {
      // Buscar contratos do usuário primeiro
      const response = await this.contractService.getContracts().toPromise();
      const userContracts = response?.contracts || [];
      const userActivities: Activity[] = [];

      // Converter serviços dos contratos do usuário em atividades
      userContracts.forEach(contract => {
        if (contract.contract_services) {
          contract.contract_services.forEach((service: any) => {
            const timeAgo = this.calculateTimeAgo(service.updated_at || contract.created_at);

            userActivities.push({
              id: service.id,
              time: timeAgo,
              title: service.service.name,
              description: `Contrato: ${contract.contract_number} - Cliente: ${contract.client.name}`,
              type: 'service',
              status: service.status || 'not_started',
              category: service.service.category,
              value: service.total_value,
              duration: service.service.duration ? `${service.service.duration} dias` : undefined,
              contractId: contract.id,
              serviceId: service.service.id
            });
          });
        }
      });

      // Ordenar por data mais recente e limitar a 10
      this.recentActivities = userActivities
        .sort((a, b) => b.id! - a.id!)
        .slice(0, 10);

    } catch (error) {
      console.error('Erro ao carregar atividades do usuário:', error);
      this.recentActivities = [];
    }
  }

  private calculateTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return 'Há poucos minutos';
    } else if (diffHours < 24) {
      return `Há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays === 1) {
      return 'Ontem';
    } else if (diffDays < 7) {
      return `Há ${diffDays} dias`;
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  }

  private generateChartData(contracts: any[]) {
    // Obter últimos 6 meses
    const months = [];
    const createdData = [];
    const activeData = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setDate(1); // Definir para o dia 1 para evitar problemas com meses de diferentes tamanhos
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short' });

      months.push(monthLabel);
      
      // Contar contratos criados no mês
      const createdInMonth = contracts.filter(contract => {
        const contractDate = new Date(contract.created_at).toISOString().substring(0, 7);
        return contractDate === monthKey;
      }).length;
      
      // Contar contratos ativos no mês (criados até o mês e com status 'active')
      const activeInMonth = contracts.filter(contract => {
        const contractDate = new Date(contract.created_at).toISOString().substring(0, 7);
        const isCreatedBeforeOrInMonth = contractDate <= monthKey;
        const isActive = contract.status === 'active';
        return isCreatedBeforeOrInMonth && isActive;
      }).length;
      
      createdData.push(createdInMonth);
      activeData.push(activeInMonth);
    }
    
    this.monthlyContractsData.labels = months;
    this.monthlyContractsData.datasets[0].data = createdData;
    this.monthlyContractsData.datasets[1].data = activeData;
  }

  private generateUserChartData(contracts: any[]) {
    // Obter últimos 6 meses para dados do usuário
    const months = [];
    const myContractsData = [];
    const myServicesData = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setDate(1); // Definir para o dia 1 para evitar problemas com meses de diferentes tamanhos
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short' });

      months.push(monthLabel);
      
      // Contar contratos do usuário criados no mês
      const contractsInMonth = contracts.filter(contract => {
        const contractDate = new Date(contract.created_at).toISOString().substring(0, 7);
        return contractDate === monthKey;
      }).length;
      
      // Contar serviços do usuário ativos/concluídos no mês
      let servicesInMonth = 0;
      contracts.forEach(contract => {
        if (contract.contract_services) {
          contract.contract_services.forEach((service: any) => {
            const serviceDate = service.updated_at ? new Date(service.updated_at).toISOString().substring(0, 7) : monthKey;
            if (serviceDate === monthKey && (service.status === 'in_progress' || service.status === 'completed')) {
              servicesInMonth++;
            }
          });
        }
      });
      
      myContractsData.push(contractsInMonth);
      myServicesData.push(servicesInMonth);
    }
    
    this.monthlyContractsData.labels = months;
    this.monthlyContractsData.datasets[0].data = myContractsData;
    this.monthlyContractsData.datasets[0].label = 'Meus Contratos';
    this.monthlyContractsData.datasets[1].data = myServicesData;
    this.monthlyContractsData.datasets[1].label = 'Meus Serviços';
  }

  private generateEmptyChartData() {
    const months = ['Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan'];
    const emptyData = [0, 0, 0, 0, 0, 0];
    
    this.monthlyContractsData.labels = months;
    this.monthlyContractsData.datasets[0].data = emptyData;
    this.monthlyContractsData.datasets[0].label = 'Meus Contratos';
    this.monthlyContractsData.datasets[1].data = emptyData;
    this.monthlyContractsData.datasets[1].label = 'Meus Serviços';
  }

  private generateMockChartData() {
    const months = ['Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan'];
    const createdData = [8, 12, 15, 18, 14, 20];
    const activeData = [6, 10, 13, 16, 12, 18];

    this.monthlyContractsData.labels = months;
    this.monthlyContractsData.datasets[0].data = createdData;
    this.monthlyContractsData.datasets[1].data = activeData;
  }


  private updateStatCards(contractStats: any, serviceStats: any, totalClients: number) {
    // Usar contagem real de serviços vinculados a contratos ativos
    const servicesInProgress = serviceStats.activeServicesFromActiveContracts || 0;

    // Obter informações de novos contratos
    const newContractsInfo = this.getNewContractsInfo(contractStats);

    this.statCards = [
      {
        id: 'total-contracts',
        label: 'Total de Contratos',
        value: contractStats.total || 0,
        change: newContractsInfo.text,
        changeType: newContractsInfo.type,
        icon: 'fas fa-file-contract',
        progress: contractStats.total === 0 ? 0 : Math.min((contractStats.total / 30) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'active-contracts',
        label: 'Contratos Ativos',
        value: contractStats.active || 0,
        change: contractStats.active === 0 ? '0% do total' : `${Math.round((contractStats.active / contractStats.total) * 100)}% do total`,
        changeType: 'positive',
        icon: 'fas fa-check-circle',
        progress: contractStats.active === 0 ? 0 : Math.min((contractStats.active / contractStats.total) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'services-progress',
        label: 'Serviços em Andamento',
        value: servicesInProgress,
        change: servicesInProgress === 0 ? 'Nenhum serviço vinculado' : `Vinculados a contratos ativos`,
        changeType: 'positive',
        icon: 'fas fa-list-check',
        progress: servicesInProgress === 0 ? 0 : Math.min((servicesInProgress / 50) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'total-clients',
        label: 'Total de Clientes',
        value: totalClients,
        change: totalClients === 0 ? 'Nenhum cliente cadastrado' : `${contractStats.active > 0 ? Math.round((contractStats.active / totalClients) * 100) : 0}% com contratos ativos`,
        changeType: 'positive',
        icon: 'fas fa-users',
        progress: totalClients === 0 ? 0 : Math.min((totalClients / 100) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      }
    ];
  }

  private calculateGrowthPercentage(current: number, previous: number): string {
    if (previous === 0) return '+100% este mês';
    const growth = ((current - previous) / previous) * 100;
    const sign = growth >= 0 ? '+' : '';
    return `${sign}${Math.round(growth)}% este mês`;
  }

  private getNewContractsInfo(contractStats: any): { text: string, type: 'positive' | 'negative' } {
    if (contractStats.total === 0) {
      return { text: 'Nenhum contrato cadastrado', type: 'positive' };
    }

    // Calcular quantos contratos foram criados este mês
    const contractsThisMonth = contractStats.contractsThisMonth || 0;
    
    if (contractsThisMonth === 0) {
      return { text: 'Nenhum novo este mês', type: 'negative' };
    } else if (contractsThisMonth === 1) {
      return { text: '1 novo contrato este mês', type: 'positive' };
    } else {
      return { text: `${contractsThisMonth} novos este mês`, type: 'positive' };
    }
  }


  private async initCharts() {
    // Lazy load Chart.js
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    
    if (this.contractsChart) {
      this.contractsChart.destroy();
    }
    this.initContractsChart();
  }

  private async initContractsChart() {
    const canvas = document.getElementById('contractsChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#e5e7eb' : '#374151';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 59, 43, 0.08)';

    const { Chart } = await import('chart.js');
    this.contractsChart = new Chart(ctx, {
      type: 'line',
      data: this.monthlyContractsData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { 
          mode: 'index', 
          intersect: false 
        },
        plugins: {
          legend: { 
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: textColor,
              font: { size: 12, weight: 'bold' as const },
              padding: 15,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: isDarkMode ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: textColor,
            bodyColor: textColor,
            borderColor: isDarkMode ? '#4b5563' : 'rgba(0, 59, 43, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            titleFont: { size: 13, weight: 'bold' as const },
            bodyFont: { size: 12 },
            callbacks: {
              title: (context) => {
                return `${context[0].label} ${new Date().getFullYear()}`;
              },
              label: (context) => {
                return `${context.dataset.label}: ${context.parsed.y} contratos`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { 
              color: gridColor, 
              display: false 
            },
            ticks: { 
              color: textColor, 
              font: { size: 11, weight: 'bold' as const },
              padding: 8
            },
            border: {
              color: gridColor
            }
          },
          y: {
            beginAtZero: true,
            grid: { 
              color: gridColor, 
              display: true
            },
            ticks: { 
              color: textColor, 
              font: { size: 11 }, 
              stepSize: 2,
              padding: 10,
              callback: function(value) {
                return Number.isInteger(value as number) ? value : '';
              }
            },
            border: {
              display: false
            }
          }
        },
        elements: {
          line: { 
            tension: 0.4
          },
          point: { 
            hoverBorderWidth: 3
          }
        },
        animation: {
          duration: 1500,
          easing: 'easeInOutQuart'
        }
      }
    });
  }

  filterActivities(filter: 'all' | 'completed' | 'in_progress' | 'scheduled' | 'not_started') {
    this.activityFilter = filter;
  }

  get filteredActivities(): Activity[] {
    if (this.activityFilter === 'all') return this.recentActivities;
    return this.recentActivities.filter(activity => activity.status === this.activityFilter);
  }

  getDisplayedActivities(): Activity[] {
    // Mostrar apenas as 2 primeiras atividades filtradas
    return this.filteredActivities.slice(0, 2);
  }

  getTotalActivitiesCount(): number {
    return this.filteredActivities.length;
  }

  navigateToActivities(): void {
    this.router.navigate(['/home/rotinas']);
  }

  navigateToContract(contractId?: number): void {
    if (contractId) {
      this.router.navigate(['/home/rotinas', contractId]);
    }
  }
  
  onActivityClick(event: Event, activity: any): void {
    // Prevenir navegação se não tiver contractId
    if (!activity.contractId) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // Navegar para o contrato
    this.navigateToContract(activity.contractId);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  executeQuickAction(action: string) {
    const routes: { [key: string]: string } = {
      'newProposal': '/home/propostas/nova',
      'newContract': '/home/contratos/novo',
      'newClient': '/home/clientes/novo',
      'newService': '/home/servicos/novo',
      'generateReport': '/home/relatorios',
      'routines': '/home/rotinas'
    };

    if (routes[action]) this.router.navigate([routes[action]]);
  }

  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = { 
      'service': 'fa fa-tasks',
      'diagnostic': 'fa fa-stethoscope', 
      'okr': 'fa fa-bullseye', 
      'mentoring': 'fa fa-user-tie', 
      'hr': 'fa fa-users', 
      'other': 'fa fa-ellipsis-h' 
    };
    return icons[type] || 'fa fa-circle';
  }

  getActivityColor(type: string): string {
    const colors: { [key: string]: string } = { 
      'service': '#003b2b',
      'diagnostic': '#0a8560', 
      'okr': '#003b2b', 
      'mentoring': '#065f46', 
      'hr': '#0f766e', 
      'other': '#17915a' 
    };
    return colors[type] || '#0a8560';
  }
  
  getStatusText(status: string): string {
    const texts: { [key: string]: string } = { 
      'completed': 'Concluído', 
      'in_progress': 'Em andamento', 
      'scheduled': 'Agendado',
      'not_started': 'Não iniciado'
    };
    return texts[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'completed': '#10b981',
      'in_progress': '#f59e0b',
      'scheduled': '#3b82f6',
      'not_started': '#6b7280'
    };
    return colors[status] || '#6b7280';
  }


  getChartInsights() {
    const data = this.monthlyContractsData.datasets[0].data as number[];
    if (data.length === 0) return { growth: '0%', average: 0, projection: 0 };
    
    const current = data[data.length - 1] || 0;
    const previous = data[data.length - 2] || 0;
    const growth = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);
    const average = Math.round(data.reduce((a, b) => a + b, 0) / data.length);
    const projection = Math.round(current * 1.15); // Projeção de 15% de crescimento
    
    return {
      growth: `${growth >= 0 ? '+' : ''}${growth}%`,
      average,
      projection
    };
  }

  // TrackBy functions para performance
  trackByCardId(index: number, card: StatCard): string {
    return card.id;
  }

  trackByActionId(index: number, action: QuickAction): string {
    return action.id;
  }

  private async loadUserSpecificData() {
    try {
      console.log('👤 Carregando dados específicos do usuário...');

      // Buscar apenas contratos vinculados ao usuário logado
      const response = await this.contractService.getContracts().toPromise();
      const userContracts = response?.contracts || [];

      // Calcular estatísticas baseadas nos contratos do usuário
      const userStats = this.calculateUserStats(userContracts);

      // Atualizar cards com dados específicos do usuário
      this.updateUserStatCards(userStats, userContracts.length);

      console.log('✅ Dados do usuário carregados');
    } catch (error) {
      console.error('❌ Erro ao carregar contratos do usuário:', error);
      // Usar dados zerados em caso de erro
      this.updateUserStatCards({ myContracts: 0, myActiveServices: 0, myCompletedServices: 0 }, 0);
    }
  }

  private calculateUserStats(contracts: any[]) {
    const myContracts = contracts.length;
    let myActiveServices = 0;
    let myCompletedServices = 0;
    
    contracts.forEach(contract => {
      if (contract.contract_services) {
        contract.contract_services.forEach((service: any) => {
          if (service.status === 'in_progress' || service.status === 'scheduled') {
            myActiveServices++;
          } else if (service.status === 'completed') {
            myCompletedServices++;
          }
        });
      }
    });
    
    return { myContracts, myActiveServices, myCompletedServices };
  }

  private updateUserStatCards(userStats: any, totalContracts: number) {
    this.statCards = [
      {
        id: 'my-contracts',
        label: 'Meus Contratos',
        value: userStats.myContracts || 0,
        change: userStats.myContracts === 0 ? 'Nenhum contrato vinculado' : `${userStats.myContracts} contrato${userStats.myContracts > 1 ? 's' : ''} vinculado${userStats.myContracts > 1 ? 's' : ''}`,
        changeType: 'positive',
        icon: 'fas fa-file-contract',
        progress: userStats.myContracts === 0 ? 0 : Math.min((userStats.myContracts / 10) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'my-active-services',
        label: 'Serviços Ativos',
        value: userStats.myActiveServices || 0,
        change: userStats.myActiveServices === 0 ? 'Nenhum serviço ativo' : 'Serviços em andamento/agendados',
        changeType: 'positive',
        icon: 'fas fa-tasks',
        progress: userStats.myActiveServices === 0 ? 0 : Math.min((userStats.myActiveServices / 20) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'my-completed-services',
        label: 'Serviços Concluídos',
        value: userStats.myCompletedServices || 0,
        change: userStats.myCompletedServices === 0 ? 'Nenhum serviço concluído' : 'Serviços finalizados',
        changeType: 'positive',
        icon: 'fas fa-check-circle',
        progress: userStats.myCompletedServices === 0 ? 0 : Math.min((userStats.myCompletedServices / 30) * 100, 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      },
      {
        id: 'my-progress',
        label: 'Progresso Geral',
        value: userStats.myActiveServices + userStats.myCompletedServices === 0 ? '0%' : `${Math.round((userStats.myCompletedServices / (userStats.myActiveServices + userStats.myCompletedServices)) * 100)}%`,
        change: 'Percentual de conclusão',
        changeType: 'positive',
        icon: 'fas fa-chart-pie',
        progress: userStats.myActiveServices + userStats.myCompletedServices === 0 ? 0 : Math.round((userStats.myCompletedServices / (userStats.myActiveServices + userStats.myCompletedServices)) * 100),
        color: '#1e6076',
        bgColor: 'rgba(30, 96, 118, 0.15)'
      }
    ];
  }

  private filterQuickActionsByRole() {
    // Se for admin ou admin_gerencial, manter todas as ações
    if (this.authService.isAdmin() || this.authService.isAdminGerencial()) {
      return;
    }

    // Para usuários normais, remover todos os quick actions
    this.quickActions = [];
  }

  // Métodos para responsividade do gráfico
  expandChart() {
    // Implementar modal de gráfico expandido
  }

  downloadChart() {
    if (this.contractsChart) {
      const url = this.contractsChart.toBase64Image();
      const link = document.createElement('a');
      link.download = 'evolucao-contratos.png';
      link.href = url;
      link.click();
    }
  }
}