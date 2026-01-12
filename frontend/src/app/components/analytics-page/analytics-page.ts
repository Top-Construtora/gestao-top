import { Component, OnInit, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Chart, ChartConfiguration } from 'chart.js';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { 
  AnalyticsService, 
  AnalyticsData, 
  AnalyticsPeriodFilter,
  ServiceAnalytics,
  MetricData,
  ContractCompletionData
} from '../../services/analytics';
import { ContractService } from '../../services/contract';

// Lazy load Chart.js

interface DetailedMetric extends MetricData {
  trend: number;
  description?: string;
}

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './analytics-page.html',
  styleUrls: ['./analytics-page.css']
})
export class AnalyticsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private analyticsService = inject(AnalyticsService);
  private contractService = inject(ContractService);
  private router = inject(Router);

  // Estado do componente
  isLoading = true;
  isRefreshing = false;
  selectedPeriod: 'week' | 'month' | 'quarter' | 'year' = 'month';
  lastUpdated: Date = new Date();

  // Filtro para gráfico de contratos
  selectedClientId: number | null = null;
  availableClients: {id: number, name: string}[] = [];

  // Filtro de tipo de contrato
  selectedContractType: string | null = null;
  availableContractTypes: {value: string, label: string}[] = [
    { value: 'Full', label: 'Full' },
    { value: 'Pontual', label: 'Pontual' },
    { value: 'Individual', label: 'Individual' }
  ];

  // Dados de analytics
  analyticsData: AnalyticsData | null = null;
  revenueProgress: number = 0;

  // Charts
  private charts: { [key: string]: Chart } = {};

  constructor() {}

  ngOnInit() {
    this.loadAnalyticsData();
  }

  async ngAfterViewInit() {
    // Inicializar charts após a view estar pronta
    setTimeout(async () => {
      if (this.analyticsData) {
        await this.initializeCharts();
      }
    }, 100);
  }

  ngOnDestroy() {
    // Destruir todos os charts
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
  }

  /**
   * Carregar dados de analytics
   */
  async loadAnalyticsData() {
    try {
      this.isLoading = true;

      const filters: AnalyticsPeriodFilter = {
        period: this.selectedPeriod
      };

      // Carregar dados de analytics
      this.analyticsData = await firstValueFrom(this.analyticsService.getAnalytics(filters));
      this.lastUpdated = new Date();

      // Calcular progresso de receita uma vez
      this.calculateRevenueProgress();

      // Extrair clientes disponíveis para o filtro
      this.extractAvailableClients();

      // Inicializar charts
      setTimeout(() => this.initializeCharts(), 100);

    } catch (error) {
      console.error('Erro ao carregar analytics:', error);
      // Mostrar mensagem de erro para o usuário
      this.analyticsData = null;
    } finally {
      this.isLoading = false;
    }
  }



  /**
   * Obter classe de tendência
   */
  getTrendClass(trend: number): string {
    return trend >= 0 ? 'positive' : 'negative';
  }


  /**
   * Definir período
   */
  setPeriod(period: 'week' | 'month' | 'quarter' | 'year') {
    if (this.selectedPeriod !== period) {
      this.selectedPeriod = period;
      this.loadAnalyticsData();
    }
  }

  /**
   * Atualizar dados
   */
  async refreshData() {
    this.isRefreshing = true;
    await this.loadAnalyticsData();
    this.isRefreshing = false;
  }

  /**
   * Inicializar charts
   */
  private async initializeCharts() {
    // Lazy load Chart.js
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    
    // Assign Chart to class property for use in other methods
    (window as any).Chart = Chart;
    
    this.initConversionGauge();
    this.initContractsDonut();
    this.initContractCompletionChart();
    this.initContractsByTypeChart();
    this.initTopServicesChart();
  }

  /**
   * Gauge de conversão
   */
  private initConversionGauge() {
    const canvas = document.getElementById('conversionGauge') as HTMLCanvasElement;
    if (!canvas || !this.analyticsData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const conversionRate = this.analyticsData.general.conversionRate;

    const Chart = (window as any).Chart;
    this.charts['conversionGauge'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [conversionRate, 100 - conversionRate],
          backgroundColor: ['#0A8060', '#e5e7eb'],
          borderWidth: 0,
          circumference: 180,
          rotation: 270
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  /**
   * Donut de contratos
   */
  private initContractsDonut() {
    const canvas = document.getElementById('contractsDonut') as HTMLCanvasElement;
    if (!canvas || !this.analyticsData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Obter dados por status do backend
    const byStatus = this.analyticsData.contracts?.byStatus || {};

    // Mapear labels e cores para cada status
    const statusConfig = {
      active: { label: 'Ativos', color: '#0A8060' },
      completed: { label: 'Concluídos', color: '#6366f1' },
      cancelled: { label: 'Cancelados', color: '#ef4444' },
      suspended: { label: 'Suspensos', color: '#f59e0b' }
    };

    // Filtrar apenas status com valores > 0
    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    Object.entries(statusConfig).forEach(([status, config]) => {
      const value = byStatus[status] || 0;
      if (value > 0) {
        labels.push(config.label);
        data.push(value);
        colors.push(config.color);
      }
    });

    const Chart = (window as any).Chart;
    this.charts['contractsDonut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: ${value}`;
              }
            }
          }
        }
      }
    });
  }




  // Métodos de formatação e utilitários

  formatCurrency(value: number): string {
    return this.contractService.formatValue(value);
  }


  private calculateRevenueProgress(): void {
    if (!this.analyticsData?.revenue) {
      this.revenueProgress = 0;
      return;
    }
    const { totalCollected, totalPending } = this.analyticsData.revenue;
    const total = totalCollected + totalPending;
    this.revenueProgress = total > 0 ? Math.round((totalCollected / total) * 100) : 0;
  }

  getRevenueProgress(): number {
    return this.revenueProgress;
  }

  getClientTypePercentage(type: 'pf' | 'pj'): number {
    if (!this.analyticsData?.clients) return 0;
    const { pf, pj } = this.analyticsData.clients.byType;
    const total = pf + pj;
    if (total === 0) return 0;
    return Math.round(((type === 'pf' ? pf : pj) / total) * 100);
  }

  // Métodos de ações

  exportChart(chartName: string) {
    const chart = this.charts[chartName];
    if (!chart) return;

    const url = chart.toBase64Image();
    const link = document.createElement('a');
    link.download = `${chartName}_chart.png`;
    link.href = url;
    link.click();
  }

  async exportAnalytics(format: 'excel' | 'json') {
    try {
      const blob = await firstValueFrom(this.analyticsService.exportAnalytics(format));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'json'}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar analytics:', error);
    }
  }

  generateReport() {
    // Navegar para página de relatórios
    this.router.navigate(['/home/relatorios']);
  }

  /**
   * Gráfico de contratos por tipo
   */
  private initContractsByTypeChart() {
    const canvas = document.getElementById('contractsByTypeChart') as HTMLCanvasElement;
    if (!canvas || !this.analyticsData?.contracts?.byType) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const byType = this.analyticsData.contracts.byType;

    // Filtrar tipos com valores > 0 e excluir Recrutamento & Seleção
    const typeConfig: {[key: string]: {label: string, color: string}} = {
      'Full': { label: 'Full', color: '#065f46' },
      'Pontual': { label: 'Pontual', color: '#0A8060' },
      'Individual': { label: 'Individual', color: '#10b981' }
    };

    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    Object.entries(typeConfig).forEach(([type, config]) => {
      const value = byType[type] || 0;
      if (value > 0) {
        labels.push(config.label);
        data.push(value);
        colors.push(config.color);
      }
    });

    if (data.length === 0) return;

    const Chart = (window as any).Chart;
    this.charts['contractsByTypeChart'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true,
              pointStyle: 'circle',
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#374151',
            bodyColor: '#374151',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            callbacks: {
              label: (context: any) => {
                const total = data.reduce((sum, val) => sum + val, 0);
                const percentage = Math.round((context.parsed / total) * 100);
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Mostrar mensagem de erro no lugar do gráfico
   */
  private showChartError(chartId: string, message: string) {
    const canvas = document.getElementById(chartId) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpar o canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Configurar texto
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Desenhar mensagem principal
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);

    // Só mostrar a mensagem adicional se não for sobre progresso de cliente
    if (!message.includes('progresso em seu(s) contrato(s)')) {
      ctx.fillText('Verifique os dados ou recarregue a página', canvas.width / 2, canvas.height / 2 + 20);
    }
  }

  /**
   * Gráfico de serviços mais contratados
   */
  private initTopServicesChart() {
    const canvas = document.getElementById('topServicesChart') as HTMLCanvasElement;
    if (!canvas || !this.analyticsData?.topServices || this.analyticsData.topServices.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Filtrar serviços excluindo "Entrada de Cliente" e "Encerramento"
    const filteredServices = this.analyticsData.topServices.filter((service: any) => 
      service.name !== 'Entrada de Cliente' && service.name !== 'Encerramento'
    );
    
    const data = filteredServices.slice(0, 10); // Top 10 após filtrar
    if (data.length === 0) return;
    const labels = data.map((service: any) => service.name);
    const values = data.map((service: any) => service.contractCount);

    // Todas as barras com verde mais escuro do sistema
    const colors = data.map(() => '#065f46');

    const Chart = (window as any).Chart;
    this.charts['topServicesChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Contratos',
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // Barras horizontais
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#374151',
            bodyColor: '#374151',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            callbacks: {
              label: (context: any) => {
                const service = data[context.dataIndex];
                return `${service.contractCount} contratos - ${this.formatCurrency(service.totalValue)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { 
              color: '#6b7280',
              stepSize: 1
            },
            beginAtZero: true
          },
          y: {
            grid: { display: false },
            ticks: { 
              color: '#6b7280',
              callback: function(value: any) {
                const label = labels[value as number];
                return label && label.length > 25 ? label.substring(0, 25) + '...' : label;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Extrair clientes disponíveis dos dados de contratos
   */
  private extractAvailableClients() {
    if (!this.analyticsData?.contractCompletionData) {
      this.availableClients = [];
      return;
    }

    const clientsMap = new Map<number, string>();
    
    this.analyticsData.contractCompletionData.forEach(contract => {
      if (!clientsMap.has(contract.clientId)) {
        clientsMap.set(contract.clientId, contract.clientName);
      }
    });

    this.availableClients = Array.from(clientsMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Filtrar contratos por cliente, tipo e aplicar lógica de 0% de conclusão
   */
  private getFilteredContractData(): ContractCompletionData[] {
    if (!this.analyticsData?.contractCompletionData) return [];

    let filteredData = this.analyticsData.contractCompletionData;

    // Filtrar por tipo de contrato se selecionado
    if (this.selectedContractType !== null) {
      filteredData = filteredData.filter(
        contract => contract.type === this.selectedContractType
      );
    }

    // Filtrar por cliente se selecionado
    if (this.selectedClientId !== null) {
      filteredData = filteredData.filter(
        contract => contract.clientId === this.selectedClientId
      );
      // Se cliente específico selecionado, mostrar contratos mesmo com 0%
      return filteredData;
    }

    // Se nenhum cliente específico, excluir contratos com 0% de conclusão
    return filteredData.filter(
      contract => (contract.completionPercentage || 0) > 0
    );
  }

  /**
   * Alterar filtro de cliente via evento (para gráfico de contratos)
   */
  onClientFilterChangeEvent(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const value = selectElement.value;
    const clientId = value ? +value : null;
    this.onClientFilterChange(clientId);
  }

  /**
   * Alterar filtro de cliente (para gráfico de contratos)
   */
  onClientFilterChange(clientId: number | null) {
    this.selectedClientId = clientId;
    this.refreshContractCompletionChart();
  }

  /**
   * Alterar filtro de tipo de contrato via evento
   */
  onContractTypeFilterChangeEvent(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const value = selectElement.value;
    const contractType = value ? value : null;
    this.onContractTypeFilterChange(contractType);
  }

  /**
   * Alterar filtro de tipo de contrato
   */
  onContractTypeFilterChange(contractType: string | null) {
    this.selectedContractType = contractType;
    this.refreshContractCompletionChart();
  }

  /**
   * Reinicializar o gráfico de contratos após mudança de filtro
   */
  private refreshContractCompletionChart() {
    // Reinicializar apenas o gráfico de contratos
    if (this.charts['contractCompletionChart']) {
      this.charts['contractCompletionChart'].destroy();
      delete this.charts['contractCompletionChart'];
    }
    setTimeout(() => this.initContractCompletionChart(), 100);
  }


  /**
   * Gráfico de taxa de conclusão por contrato
   */
  private initContractCompletionChart() {
    const canvas = document.getElementById('contractCompletionChart') as HTMLCanvasElement;
    if (!canvas) {
      this.showChartError('contractCompletionChart', 'Canvas não encontrado');
      return;
    }

    // Destruir chart existente se houver
    if (this.charts['contractCompletionChart']) {
      this.charts['contractCompletionChart'].destroy();
      delete this.charts['contractCompletionChart'];
    }

    if (!this.analyticsData?.contractCompletionData) {
      this.showChartError('contractCompletionChart', 'Dados não disponíveis');
      return;
    }

    // Se um cliente específico está selecionado, limitar a 10 itens
    // Se 'Todos os clientes', mostrar todos com progresso > 0%
    const allData = this.getFilteredContractData();
    const data = this.selectedClientId !== null
      ? allData.slice(0, 10)  // Cliente específico: limitar a 10 itens
      : allData;              // Todos os clientes: mostrar todos

    // Altura dinâmica baseada na quantidade de itens
    const itemCount = data.length;
    const baseHeight = 300;
    const heightPerItem = 25; // Espaçamento mínimo entre itens

    // Calcular altura baseada no número de itens
    let calculatedHeight;
    if (this.selectedClientId !== null) {
      // Cliente específico: altura fixa adequada
      calculatedHeight = Math.max(450, baseHeight + (itemCount * heightPerItem));
    } else {
      // Todos os clientes: altura dinâmica sem limite máximo rígido
      calculatedHeight = baseHeight + (itemCount * heightPerItem);
    }

    // Garantir altura mínima e máxima razoável
    calculatedHeight = Math.min(2000, Math.max(450, calculatedHeight));

    // Aplicar altura ao canvas e seu container
    canvas.style.height = `${calculatedHeight}px`;
    canvas.style.maxHeight = 'none';
    canvas.style.minHeight = `${calculatedHeight}px`;

    if (canvas.parentElement) {
      canvas.parentElement.style.height = `${calculatedHeight}px`;
      canvas.parentElement.style.maxHeight = 'none';
      canvas.parentElement.style.minHeight = `${calculatedHeight}px`;
    }

    if (data.length === 0) {
      const message = this.selectedClientId !== null
        ? 'O cliente selecionado ainda não possui contratos'
        : 'Nenhum contrato com progresso encontrado';
      this.showChartError('contractCompletionChart', message);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.showChartError('contractCompletionChart', 'Erro ao obter contexto do canvas');
      return;
    }

    try {
      const labels = data.map((contract: any) => {
        const contractNumber = contract.contractNumber || '';
        const clientName = contract.clientName || '';
        const fullLabel = `${contractNumber} - ${clientName}`;

        // Se o label for muito longo, quebrar em duas linhas
        if (fullLabel.length > 40) {
          // Tentar quebrar no meio do texto em um espaço natural
          const maxLineLength = 35;

          // Procurar o melhor ponto de quebra próximo ao meio
          const midPoint = Math.floor(fullLabel.length / 2);
          let breakPoint = -1;

          // Procurar espaço mais próximo do meio (antes ou depois)
          for (let i = 0; i <= 15; i++) {
            // Verificar depois do meio
            if (midPoint + i < fullLabel.length && fullLabel[midPoint + i] === ' ') {
              breakPoint = midPoint + i;
              break;
            }
            // Verificar antes do meio
            if (midPoint - i >= 0 && fullLabel[midPoint - i] === ' ') {
              breakPoint = midPoint - i;
              break;
            }
          }

          // Se encontrou um bom ponto de quebra, usar
          if (breakPoint > 0 && breakPoint < fullLabel.length - 1) {
            const line1 = fullLabel.substring(0, breakPoint).trim();
            const line2 = fullLabel.substring(breakPoint + 1).trim();
            return [line1, line2];
          }

          // Fallback: quebrar entre contrato e cliente
          return [contractNumber, clientName];
        }

        return fullLabel;
      });

      const completionValues = data.map((contract: any) => {
        const percentage = contract.completionPercentage || 0;
        const validPercentage = Math.max(0, Math.min(100, percentage));
        // Se um cliente foi especificamente selecionado e contrato tem 0%, mostrar uma barra pequena mas visível
        if (validPercentage === 0 && this.selectedClientId !== null) {
          return 1; // 1% para ser visível
        }
        return validPercentage === 0 ? 0 : Math.max(validPercentage, 2);
      });

      // Cores padronizadas baseadas na porcentagem
      const colors = data.map((contract: any) => {
        const percentage = contract.completionPercentage || 0;
        if (percentage < 40) {
          return '#6b7280'; // Cinza
        } else if (percentage >= 40 && percentage <= 80) {
          return '#065f46'; // Verde mais escuro
        } else {
          return '#3b82f6'; // Azul
        }
      });

      const Chart = (window as any).Chart;
      if (!Chart) {
        this.showChartError('contractCompletionChart', 'Chart.js não carregado');
        return;
      }

      this.charts['contractCompletionChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Taxa de Conclusão (%)',
            data: completionValues,
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 'flex',
            maxBarThickness: 28,
            minBarLength: 5,
            categoryPercentage: 0.98,
            barPercentage: 0.95
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          layout: {
            padding: {
              left: 25,
              right: 70,
              top: 10,
              bottom: 10
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: '#ffffff',
              titleColor: '#374151',
              bodyColor: '#374151',
              borderColor: '#e5e7eb',
              borderWidth: 1,
              cornerRadius: 8,
              titleFont: {
                size: 14,
                weight: 'bold'
              },
              bodyFont: {
                size: 12
              },
              callbacks: {
                title: (context: any) => {
                  const contract = data[context[0].dataIndex];
                  // Retornar array para mostrar em linhas separadas no tooltip
                  return [contract.contractNumber, contract.clientName];
                },
                label: (context: any) => {
                  const contract = data[context.dataIndex];
                  return [
                    `📊 ${contract.completionPercentage || 0}% concluído`,
                    `📋 ${contract.totalServices || 0} etapas totais`,
                    `✅ ${contract.completedServices || 0} etapas concluídas`
                  ];
                }
              }
            }
          },
          onHover: (event: any, activeElements: any) => {
            const chart = event.chart;
            chart.canvas.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
          },
          scales: {
            x: {
              grid: {
                color: 'rgba(0, 0, 0, 0.08)',
                drawBorder: false,
                lineWidth: 1
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 11,
                  weight: '500'
                },
                stepSize: 20,
                callback: function(value: any) {
                  return value + '%';
                }
              },
              beginAtZero: true,
              min: 0,
              max: 100,
              title: {
                display: true,
                text: 'Taxa de Conclusão (%)',
                color: '#6b7280',
                font: {
                  size: 12,
                  weight: 'bold'
                }
              }
            },
            y: {
              grid: {
                display: false
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 11,
                  weight: '500',
                  lineHeight: 1.2
                },
                maxRotation: 0,
                padding: 3,
                autoSkip: false,
                callback: function(value: any, index: any) {
                  const label = labels[index];
                  if (Array.isArray(label)) {
                    // Se é um array, já está formatado com quebra de linha
                    return label;
                  }
                  // Se é string simples, retornar como está
                  return label;
                }
              }
            }
          },
          animation: {
            duration: 1200,
            easing: 'easeInOutQuart',
            onComplete: () => {
              const chart = this.charts['contractCompletionChart'];
              if (!chart) return;

              const ctx = chart.ctx;
              ctx.font = 'bold 12px Arial';
              ctx.fillStyle = '#374151';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';

              chart.data.datasets.forEach((dataset: any, i: number) => {
                const meta = chart.getDatasetMeta(i);
                meta.data.forEach((bar: any, index: number) => {
                  const contract = data[index];
                  const percentage = contract.completionPercentage || 0;
                  const text = percentage.toFixed(0) + '%';

                  const x = bar.x + 5;
                  const y = bar.y;

                  ctx.fillText(text, x, y);
                });
              });
            }
          }
        }
      });

    } catch (error: any) {
      this.showChartError('contractCompletionChart', `Erro ao criar gráfico: ${error?.message || 'Erro desconhecido'}`);
    }
  }

}