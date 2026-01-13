import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ModalService } from '../../services/modal.service';
import { ProposalService, Proposal, PrepareProposalData } from '../../services/proposal';
import { ClientService } from '../../services/client';
import { SendProposalModalComponent } from '../send-proposal-modal/send-proposal-modal';
import { DeleteConfirmationModalComponent } from '../delete-confirmation-modal/delete-confirmation-modal.component';
import { ProposalToContractModalComponent } from '../proposal-to-contract-modal/proposal-to-contract-modal';
import { DuplicateProposalModalComponent } from '../duplicate-proposal-modal/duplicate-proposal-modal';
import { Subscription, firstValueFrom } from 'rxjs';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { ProposalStatsCardsComponent } from '../proposal-stats-cards/proposal-stats-cards';
import { SearchService } from '../../services/search.service';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import jsPDF from 'jspdf';

interface ProposalDisplay {
  id: number;
  proposalNumber: string;
  clientName: string;
  companyName: string;
  tradeName: string;
  clientType: string;
  status: string;
  statusText: string;
  totalValue: string;
  validUntil: string;
  createdAt: string;
  isExpired: boolean;
  sla: string;
  raw: Proposal;
}

@Component({
  selector: 'app-proposals-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SendProposalModalComponent, DeleteConfirmationModalComponent, BreadcrumbComponent, ProposalStatsCardsComponent, ProposalToContractModalComponent, DuplicateProposalModalComponent],
  templateUrl: './proposals-page.html',
  styleUrls: ['./proposals-page.css']
})
export class ProposalsPageComponent implements OnInit, OnDestroy {
  private modalService = inject(ModalService);
  private proposalService = inject(ProposalService);
  private clientService = inject(ClientService);
  private searchService = inject(SearchService);
  private router = inject(Router);
  private subscriptions = new Subscription();

  proposals: ProposalDisplay[] = [];
  filteredProposals: ProposalDisplay[] = [];
  clients: any[] = [];
  isLoading = true;
  isSearching = false;
  error = '';

  // Filters
  filters = {
    search: '',
    status: '',
    client_id: null as number | null,
    type: '',
    month: '',
    year: ''
  };
  availableYears: number[] = [];

  // Send Proposal Modal
  showSendModal = false;
  selectedProposalForSending: Proposal | null = null;

  // Delete Confirmation Modal
  showDeleteModal = false;
  selectedProposalForDeletion: ProposalDisplay | null = null;
  isDeleting = false;

  // Convert to Contract Modal
  showConvertModal = false;
  selectedProposalForConversion: Proposal | null = null;

  // Duplicate Proposal Modal
  showDuplicateModal = false;
  selectedProposalForDuplication: Proposal | null = null;

  // Dropdown control
  activeDropdownId: number | null = null;

  // Sorting
  sortField: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  ngOnInit() {
    this.subscribeToSearch();
    this.loadData();
    this.loadClients();
    window.addEventListener('refreshProposals', this.loadData.bind(this));

    // Fechar dropdown quando clicar fora
    document.addEventListener('click', () => {
      this.activeDropdownId = null;
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    window.removeEventListener('refreshProposals', this.loadData.bind(this));
  }

  private subscribeToSearch() {
    const searchSubscription = this.searchService.searchTerm$
      .pipe(
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe((term) => {
        this.filters.search = term;
        if (term && term.trim()) {
          this.isSearching = true;
        }
        this.applyFilters();
      });
    this.subscriptions.add(searchSubscription);
  }

  async loadClients() {
    try {
      const response = await firstValueFrom(this.clientService.getClients({ is_active: true }));
      if (response?.clients) {
        this.clients = response.clients.sort((a: any, b: any) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  }

  async loadData() {
    this.isLoading = true;
    this.error = '';
    try {
      const proposalsResponse = await firstValueFrom(this.proposalService.getProposals());

      if (proposalsResponse && proposalsResponse.success) {
        this.proposals = (proposalsResponse.data || []).map((apiProposal: any) => {
          return this.mapApiProposalToTableProposal(apiProposal);
        });
        this.filteredProposals = [...this.proposals];
        this.updateAvailableYears();
        this.applyFilters();
      } else {
        // Se não há dados ou falha na resposta, deixa array vazio
        this.proposals = [];
        this.filteredProposals = [];
      }
    } catch (error: any) {
      console.error('❌ Error loading proposals data:', error);

      // Se é erro 500 ou endpoint não existe, mostra que funcionalidade não está disponível
      if (error?.status === 500 || error?.status === 404) {
        this.error = 'A funcionalidade de propostas ainda não está implementada no backend.';
      } else {
        this.error = 'Não foi possível carregar os dados das propostas.';
      }

      // Define array vazio para não quebrar a UI
      this.proposals = [];
      this.filteredProposals = [];
    } finally {
      this.isLoading = false;
      this.isSearching = false;
    }
  }

  applyFilters() {
    let filtered = [...this.proposals];

    // Filtro de busca
    if (this.filters.search) {
      const searchTerm = this.filters.search.toLowerCase();
      filtered = filtered.filter(p =>
        p.proposalNumber.toLowerCase().includes(searchTerm) ||
        p.clientName.toLowerCase().includes(searchTerm)
      );
    }

    // Filtro de status
    if (this.filters.status) {
      filtered = filtered.filter(p => p.status === this.filters.status);
    }

    // Filtro de cliente
    if (this.filters.client_id) {
      filtered = filtered.filter(p => {
        // Verificar diferentes formas de ter o client_id
        const clientId = p.raw.client?.id || p.raw.client_id;
        return clientId === Number(this.filters.client_id);
      });
    }

    // Filtro de tipo
    if (this.filters.type) {
      filtered = filtered.filter(p => p.raw.type === this.filters.type);
    }

    // Filtro de mês/ano
    if (this.filters.month || this.filters.year) {
      filtered = filtered.filter(p => {
        const date = new Date(p.raw.created_at);
        if (this.filters.month && date.getMonth() + 1 !== parseInt(this.filters.month)) {
          return false;
        }
        if (this.filters.year && date.getFullYear() !== parseInt(this.filters.year)) {
          return false;
        }
        return true;
      });
    }

    // Aplicar ordenação se houver
    if (this.sortField) {
      filtered = this.sortProposals(filtered);
    }

    this.filteredProposals = filtered;
    this.isSearching = false;
  }

  sortBy(field: string) {
    if (this.sortField === field) {
      // Se já está ordenando por este campo, inverte a direção
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Se é um novo campo, define como ascendente
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  private sortProposals(proposals: ProposalDisplay[]): ProposalDisplay[] {
    const sorted = [...proposals].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (this.sortField) {
        case 'proposalNumber':
          aValue = a.proposalNumber;
          bValue = b.proposalNumber;
          break;
        case 'clientName':
          aValue = a.clientName.toLowerCase();
          bValue = b.clientName.toLowerCase();
          break;
        case 'totalValue':
          // Converter string de valor para número
          aValue = this.parseMoneyValue(a.totalValue);
          bValue = this.parseMoneyValue(b.totalValue);
          break;
        case 'sla':
          // Ordenar pelo número de dias do SLA
          aValue = this.parseSLADays(a.sla);
          bValue = this.parseSLADays(b.sla);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }

  private parseMoneyValue(value: string): number {
    // Remove "R$ " e pontos de milhares, substitui vírgula por ponto
    const cleanValue = value.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
  }

  private parseSLADays(sla: string): number {
    // Se for "-" retorna um número muito alto para ir para o final da ordenação
    if (sla === '-') {
      return 999999;
    }

    // Extrai o número de dias da string (ex: "5 dias" -> 5)
    const match = sla.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 999999; // Caso não consiga extrair, vai para o final
  }

  getSortIcon(field: string): string {
    if (this.sortField !== field) {
      return 'fas fa-sort';
    }
    return this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
  }

  clearFilters() {
    this.filters = { search: '', status: '', client_id: null, type: '', month: '', year: '' };
    this.searchService.setSearchTerm('');
    this.applyFilters();
  }

  onSearchInput() {
    this.searchService.setSearchTerm(this.filters.search || '');
  }

  clearSearch() {
    this.filters.search = '';
    this.searchService.setSearchTerm('');
  }

  private updateAvailableYears() {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();

    years.add(currentYear);
    years.add(currentYear - 1);
    years.add(currentYear + 1);

    this.proposals.forEach(proposal => {
      if (proposal.raw.created_at) {
        const year = new Date(proposal.raw.created_at).getFullYear();
        years.add(year);
      }
    });

    this.availableYears = Array.from(years).sort((a, b) => b - a);
  }

  getActiveFiltersCount(): number {
    let count = 0;
    if (this.filters.search) count++;
    if (this.filters.status) count++;
    if (this.filters.client_id) count++;
    if (this.filters.type) count++;
    if (this.filters.month || this.filters.year) count++;
    return count;
  }

  private mapApiProposalToTableProposal(apiProposal: any): ProposalDisplay {
    let clientName = 'Cliente não identificado';
    let companyName = '';
    let tradeName = '';
    let clientType = '';
    const client = apiProposal.client;

    if (client) {
        clientType = client.type || 'PJ';
        if (client.company) {
            tradeName = client.company.trade_name || '';
            companyName = client.company.company_name || '';
            clientName = tradeName || companyName || apiProposal.client_name || '';
        } else {
            clientName = apiProposal.client_name || client.name || '';
        }
    } else if (apiProposal.client_name) {
        clientName = apiProposal.client_name;
    }

    // Calcular valor total considerando seleção parcial de serviços
    let totalValue = apiProposal.total_value || 0;

    // Verificar se há serviços com seleção parcial apenas para propostas assinadas, contrapropostas ou convertidas
    // Para propostas enviadas, todos os serviços estão disponíveis
    if ((apiProposal.status === 'signed' || apiProposal.status === 'contraproposta' || apiProposal.status === 'converted') &&
        apiProposal.services && apiProposal.services.length > 0) {
      // Contar quantos serviços NÃO foram selecionados
      const unselectedCount = apiProposal.services.filter((s: any) => s.selected_by_client === false).length;
      const totalServices = apiProposal.services.length;

      // Só é seleção parcial se:
      // 1. Houver pelo menos um serviço NÃO selecionado
      // 2. Mas NÃO todos os serviços são não selecionados (se todos forem false, é dados inconsistentes)
      const hasPartialSelection = unselectedCount > 0 && unselectedCount < totalServices;

      if (hasPartialSelection) {
        // Calcular apenas o valor dos serviços selecionados
        // Filtra por !== false para incluir serviços selecionados (true ou undefined/null)
        const selectedServices = apiProposal.services.filter((service: any) => service.selected_by_client !== false);
        totalValue = selectedServices.reduce((sum: number, service: any) => sum + (service.total_value || 0), 0);
      }
    }

    return {
      id: apiProposal.id,
      proposalNumber: apiProposal.proposal_number,
      clientName: clientName,
      companyName: companyName,
      tradeName: tradeName,
      clientType: clientType,
      status: apiProposal.status,
      statusText: this.proposalService.getStatusText(apiProposal.status),
      totalValue: this.proposalService.formatCurrency(totalValue),
      validUntil: apiProposal.end_date ? this.formatDate(apiProposal.end_date) : 'Sem prazo',
      createdAt: this.formatDate(apiProposal.created_at),
      isExpired: this.proposalService.isProposalExpired(apiProposal),
      sla: this.calculateSLA(apiProposal),
      raw: apiProposal
    };
  }

  openNewProposalPage() {
    // Verifica se há erro de backend antes de navegar
    if (this.error && this.error.includes('ainda não está implementada no backend')) {
      this.modalService.showError('A funcionalidade de criar propostas ainda não está implementada no backend.');
      return;
    }
    this.router.navigate(['/home/propostas/nova']);
  }

  editProposal(id: number) {
    if (this.error && this.error.includes('ainda não está implementada no backend')) {
      this.modalService.showError('A funcionalidade de editar propostas ainda não está implementada no backend.');
      return;
    }
    this.router.navigate(['/home/propostas/editar', id]);
  }

  viewProposal(id: number) {
    if (this.error && this.error.includes('ainda não está implementada no backend')) {
      this.modalService.showError('A funcionalidade de visualizar propostas ainda não está implementada no backend.');
      return;
    }
    this.router.navigate(['/home/propostas/visualizar', id]);
  }

  duplicateProposal(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedProposalForDuplication = proposal.raw;
    this.showDuplicateModal = true;
  }

  onDuplicateModalClose() {
    this.showDuplicateModal = false;
    this.selectedProposalForDuplication = null;
  }

  onProposalDuplicated(newProposal: any) {
    this.modalService.showSuccess('Proposta duplicada com sucesso!');
    this.showDuplicateModal = false;
    this.selectedProposalForDuplication = null;
    this.loadData(); // Recarregar a lista de propostas

    // Perguntar se deseja editar a nova proposta
    const editNewProposal = confirm('Deseja editar a proposta duplicada?');
    if (editNewProposal && newProposal?.id) {
      this.router.navigate(['/home/propostas/editar', newProposal.id]);
    }
  }

  deleteProposal(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedProposalForDeletion = proposal;
    this.showDeleteModal = true;
  }

  confirmDeleteProposal() {
    if (!this.selectedProposalForDeletion) return;
    
    this.isDeleting = true;
    
    firstValueFrom(this.proposalService.deleteProposal(this.selectedProposalForDeletion.id))
      .then(() => {
        this.modalService.showSuccess('Proposta excluída com sucesso!');
        this.showDeleteModal = false;
        this.selectedProposalForDeletion = null;
        this.loadData();
      })
      .catch((error: any) => {
        console.error('❌ Error deleting proposal:', error);
        if (error?.status === 500 || error?.status === 404) {
          this.modalService.showError('Funcionalidade de excluir propostas ainda não implementada no backend.');
        } else {
          this.modalService.showError('Não foi possível excluir a proposta.');
        }
      })
      .finally(() => {
        this.isDeleting = false;
      });
  }

  cancelDeleteProposal() {
    this.showDeleteModal = false;
    this.selectedProposalForDeletion = null;
    this.isDeleting = false;
  }

  /**
   * Remove tags HTML de uma string
   */
  private stripHtmlTags(html: string): string {
    if (!html) return '';

    // Cria um elemento temporário para fazer parsing do HTML
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;

    // Substitui <br> por quebras de linha
    tmp.innerHTML = tmp.innerHTML.replace(/<br\s*\/?>/gi, '\n');

    // Retorna apenas o texto, sem tags
    return tmp.textContent || tmp.innerText || '';
  }

  async generatePDF(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();

    try {
      // Buscar detalhes completos da proposta
      const proposalResponse = await firstValueFrom(this.proposalService.getProposal(proposal.id));

      if (!proposalResponse || !proposalResponse.success || !proposalResponse.data) {
        this.modalService.showError('Não foi possível carregar os dados da proposta.');
        return;
      }

      const fullProposal = proposalResponse.data;

      // Gerar PDF usando jsPDF
      const doc = new jsPDF();

      // Estilos padronizados (mesmo formato dos relatórios)
      const STYLES = {
        COLOR_PRIMARY: '#003b2b',
        COLOR_TEXT: '#333333',
        COLOR_HEADER: '#666666',
        COLOR_STROKE: '#cccccc'
      };

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20; // MARGEM REDUZIDA DE 50 PARA 20
      let currentY = 20; // INÍCIO MAIS ACIMA

      // Adicionar logo da TOP (tamanho reduzido)
      const logoUrl = 'logoTOP.png';
      try {
        const logoImg = new Image();
        logoImg.src = logoUrl;
        await new Promise((resolve) => {
          logoImg.onload = resolve;
          logoImg.onerror = resolve;
        });

        if (logoImg.complete && logoImg.naturalWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = logoImg.naturalWidth;
          canvas.height = logoImg.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(logoImg, 0, 0);
            const logoDataUrl = canvas.toDataURL('image/png');
            // Logo menor: 40px largura
            const logoWidth = 40;
            const logoHeight = logoWidth * (logoImg.naturalHeight / logoImg.naturalWidth);
            doc.addImage(logoDataUrl, 'PNG', margin, currentY, logoWidth, logoHeight);
          }
        }
      } catch (error) {
        console.warn('Logo não carregado:', error);
      }

      // Título ao lado do logo
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('PROPOSTA COMERCIAL', margin + 45, currentY + 8);

      // Subtítulo com número da proposta
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Proposta Nº ${fullProposal.proposal_number}`, margin + 45, currentY + 20);

      // Data de geração
      doc.setFontSize(9);
      const dataGeracao = new Date().toLocaleDateString('pt-BR');
      doc.text(`Gerado em: ${dataGeracao}`, pageWidth - margin, currentY + 8, { align: 'right' });

      // Linha divisória
      currentY += 35;
      doc.setDrawColor(0, 59, 43);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 10;
      doc.setTextColor(0, 0, 0);

      // === DADOS DO CLIENTE ===
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Dados do Cliente', margin, currentY);
      currentY += 10;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const clientName = this.getClientName(fullProposal);
      if (clientName) {
        doc.text(`Nome: ${clientName}`, margin, currentY);
        currentY += 6;
      }

      const clientEmail = this.getClientEmail(fullProposal);
      if (clientEmail) {
        doc.text(`Email: ${clientEmail}`, margin, currentY);
        currentY += 6;
      }

      const clientPhone = this.getClientPhone(fullProposal);
      if (clientPhone) {
        doc.text(`Telefone: ${clientPhone}`, margin, currentY);
        currentY += 6;
      }

      // Tipo da proposta
      if (fullProposal.type) {
        doc.text(`Tipo de Proposta: ${fullProposal.type}`, margin, currentY);
        currentY += 6;
      }

      // Status da proposta
      const statusMap: { [key: string]: string } = {
        'draft': 'Rascunho',
        'sent': 'Enviada',
        'signed': 'Fechada',
        'rejected': 'Rejeitada',
        'expired': 'Expirada',
        'converted': 'Assinada',
        'contraproposta': 'Assinada Parcialmente'
      };
      doc.text(`Status: ${statusMap[fullProposal.status] || fullProposal.status}`, margin, currentY);

      currentY += 15;

      // === SERVIÇOS ===
      if (fullProposal.services && fullProposal.services.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Serviços Propostos', margin, currentY);
        currentY += 10;

        // Criar tabela de serviços (SEM COLUNA DE QUANTIDADE)
        const tableTop = currentY;
        const headerHeight = 18;
        const rowHeight = 16;

        // Cabeçalho da tabela
        doc.setFillColor(0, 59, 43);
        doc.rect(margin, tableTop, pageWidth - (margin * 2), headerHeight, 'F');

        // Apenas 3 colunas: Número, Serviço, Valor
        const colNum = margin + 5;
        const colService = margin + 20;
        const colValue = pageWidth - margin - 5;

        // Textos do cabeçalho
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');

        doc.text('#', colNum, tableTop + 12);
        doc.text('Serviço', colService, tableTop + 12);
        doc.text('Valor', colValue, tableTop + 12, { align: 'right' });

        currentY = tableTop + headerHeight + 5;

        // Linhas da tabela
        doc.setTextColor(51, 51, 51);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        fullProposal.services.forEach((service: any, index: number) => {
          // Verificar se precisa nova página
          if (currentY + rowHeight > doc.internal.pageSize.getHeight() - 30) {
            doc.addPage();
            currentY = 20;

            // Redesenhar cabeçalho na nova página
            doc.setFillColor(0, 59, 43);
            doc.rect(margin, currentY, pageWidth - (margin * 2), headerHeight, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');

            doc.text('#', colNum, currentY + 12);
            doc.text('Serviço', colService, currentY + 12);
            doc.text('Valor', colValue, currentY + 12, { align: 'right' });

            currentY += headerHeight + 5;
            doc.setTextColor(51, 51, 51);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
          }

          // Fundo alternado para linhas
          if (index % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, currentY - 4, pageWidth - (margin * 2), rowHeight, 'F');
          }

          // Garantir cor do texto correta
          doc.setTextColor(51, 51, 51);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);

          // Número do item
          doc.text(String(index + 1), colNum, currentY);

          // Nome do serviço - PRIORIDADE CORRETA
          let serviceName = '';
          // Primeiro tenta service_name
          if (service.service_name) {
            serviceName = service.service_name;
          }
          // Depois tenta name direto
          else if (service.name) {
            serviceName = service.name;
          }
          // Depois tenta service.name (objeto aninhado)
          else if (service.service && service.service.name) {
            serviceName = service.service.name;
          }
          // Fallback
          else {
            serviceName = `Serviço ${index + 1}`;
          }

          // Usar toda a largura disponível para o nome do serviço (sem coluna de quantidade)
          const maxServiceWidth = colValue - colService - 50;
          const serviceText = doc.splitTextToSize(serviceName, maxServiceWidth);
          doc.text(serviceText[0] || serviceName, colService, currentY);

          // Valor (sem quantidade, direto o valor total)
          const value = service.total_value || service.value || service.unit_value || 0;
          doc.text(this.formatCurrency(value), colValue, currentY, { align: 'right' });

          currentY += rowHeight;
        });

        // Linha de total
        currentY += 3;
        doc.setDrawColor(204, 204, 204);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 7;

        // Box do valor total
        const totalBoxWidth = 100;
        const totalBoxX = pageWidth - margin - totalBoxWidth;

        doc.setFillColor(0, 59, 43);
        doc.rect(totalBoxX, currentY - 3, totalBoxWidth, 16, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');

        // Texto "VALOR TOTAL:" alinhado à esquerda do box
        doc.text('VALOR TOTAL:', totalBoxX + 3, currentY + 5);

        // Valor alinhado à direita do box
        const totalValue = this.formatCurrency(fullProposal.total_value || 0);
        doc.text(totalValue, pageWidth - margin - 3, currentY + 5, { align: 'right' });

        currentY += 25;
      }

      // === CONDIÇÕES DE PAGAMENTO ===
      doc.setTextColor(0, 0, 0);
      if (fullProposal.payment_method || fullProposal.installments > 1 || fullProposal.payment_type) {
        // Verificar se precisa de nova página
        if (currentY > doc.internal.pageSize.getHeight() - 80) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Condições de Pagamento', margin, currentY);
        currentY += 10;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (fullProposal.payment_type) {
          const paymentTypeText = fullProposal.payment_type === 'vista' ? 'À Vista' : 'À Prazo';
          doc.text(`Tipo de Pagamento: ${paymentTypeText}`, margin, currentY);
          currentY += 6;
        }

        if (fullProposal.payment_method) {
          doc.text(`Forma de Pagamento: ${fullProposal.payment_method}`, margin, currentY);
          currentY += 6;
        }

        if (fullProposal.installments && fullProposal.installments > 1) {
          doc.text(`Número de Parcelas: ${fullProposal.installments}x`, margin, currentY);
          currentY += 6;

          if (fullProposal.final_value) {
            const valorParcela = fullProposal.final_value / fullProposal.installments;
            doc.text(`Valor por Parcela: ${this.formatCurrency(valorParcela)}`, margin, currentY);
            currentY += 6;
          }
        }

        if (fullProposal.discount_applied && fullProposal.discount_applied > 0) {
          doc.text(`Desconto Aplicado: ${this.formatCurrency(fullProposal.discount_applied)}`, margin, currentY);
          currentY += 6;
        }

        currentY += 10;
      }

      // === ASSINATURA DIGITAL ===
      if ((fullProposal.status === 'signed' || fullProposal.status === 'contraproposta') &&
          (fullProposal.signer_name || fullProposal.signature_data)) {

        // Verificar se precisa de nova página
        if (currentY > doc.internal.pageSize.getHeight() - 120) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 59, 43);
        doc.text('Assinatura Digital', margin, currentY);
        currentY += 10;
        doc.setTextColor(0, 0, 0);

        // Dados do Signatário
        if (fullProposal.signer_name || fullProposal.signer_email) {
          doc.setFillColor(248, 249, 250);
          doc.setDrawColor(220, 220, 220);

          let signerBoxHeight = 15;
          if (fullProposal.signer_name) signerBoxHeight += 6;
          if (fullProposal.signer_email) signerBoxHeight += 6;
          if (fullProposal.signer_phone) signerBoxHeight += 6;
          if (fullProposal.signer_document) signerBoxHeight += 6;
          if (fullProposal.signer_observations) {
            const obsLines = doc.splitTextToSize(fullProposal.signer_observations, pageWidth - margin * 2 - 10);
            signerBoxHeight += (obsLines.length * 5) + 8;
          }

          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), signerBoxHeight, 3, 3, 'FD');
          currentY += 8;

          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 59, 43);
          doc.text('Dados do Signatário', margin + 5, currentY);
          currentY += 8;

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);

          if (fullProposal.signer_name) {
            doc.text(`Nome: ${fullProposal.signer_name}`, margin + 5, currentY);
            currentY += 6;
          }

          if (fullProposal.signer_email) {
            doc.text(`E-mail: ${fullProposal.signer_email}`, margin + 5, currentY);
            currentY += 6;
          }

          if (fullProposal.signer_phone) {
            doc.text(`Telefone: ${fullProposal.signer_phone}`, margin + 5, currentY);
            currentY += 6;
          }

          if (fullProposal.signer_document) {
            doc.text(`Documento: ${fullProposal.signer_document}`, margin + 5, currentY);
            currentY += 6;
          }

          if (fullProposal.signer_observations) {
            doc.setFont('helvetica', 'bold');
            doc.text('Observações:', margin + 5, currentY);
            currentY += 5;
            doc.setFont('helvetica', 'normal');
            const obsLines = doc.splitTextToSize(fullProposal.signer_observations, pageWidth - margin * 2 - 10);
            doc.text(obsLines, margin + 5, currentY);
            currentY += (obsLines.length * 5);
          }

          currentY += 10;
        }

        // Imagem da Assinatura
        if (fullProposal.signature_data) {
          doc.setFillColor(248, 249, 250);
          doc.setDrawColor(220, 220, 220);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 50, 3, 3, 'FD');

          try {
            const imgWidth = 70;
            const imgHeight = 35;
            const imgX = (pageWidth - imgWidth) / 2;
            doc.addImage(fullProposal.signature_data, 'PNG', imgX, currentY + 7.5, imgWidth, imgHeight);
            currentY += 50;
          } catch (error) {
            console.warn('Erro ao adicionar assinatura ao PDF:', error);
            doc.setTextColor(0, 59, 43);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('✓ Assinatura Digital Válida', margin + 5, currentY + 25);
            currentY += 50;
          }

          currentY += 5;
        }

        // Data de Assinatura (usando updated_at quando assinado)
        if (fullProposal.status === 'signed' && fullProposal.updated_at) {
          doc.setTextColor(0, 59, 43);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          const signedDate = new Date(fullProposal.updated_at).toLocaleDateString('pt-BR');
          const dateText = `Assinado em ${signedDate}`;
          const dateWidth = doc.getTextWidth(dateText);
          const dateX = (pageWidth - dateWidth) / 2;
          doc.text(dateText, dateX, currentY);
          currentY += 10;
        }
      }


      // Salvar o PDF
      const fileName = `proposta-${fullProposal.proposal_number.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      doc.save(fileName);

      this.modalService.showSuccess('PDF gerado com sucesso!');

    } catch (error: any) {
      console.error('❌ Error generating PDF:', error);
      this.modalService.showError('Erro ao gerar o PDF da proposta.');
    }
  }

  getProposalTypeText(type: string): string {
    const types: { [key: string]: string } = {
      'Full': 'Full',
      'Pontual': 'Pontual',
      'Individual': 'Individual',
      'Recrutamento & Seleção': 'R&S'
    };
    return types[type] || type || 'Full';
  }

  getStatusColor(status: string): string {
    const statusColors: { [key: string]: string } = {
      'draft': '#6c757d',
      'sent': '#007bff',
      'signed': '#003b2b',  // Verde escuro (Fechada)
      'accepted': '#28a745',
      'rejected': '#dc3545',
      'expired': '#fd7e14',
      'converted': '#10b981',  // Verde claro (Assinada)
      'contraproposta': '#0a8560'  // Verde mais claro que o 'signed'
    };
    return statusColors[status] || '#6c757d';
  }

  private calculateSLA(proposal: any): string {
    if (!proposal.created_at) return '-';

    const createdDate = new Date(proposal.created_at);
    let endDate: Date;

    // Para propostas assinadas, usar a data de atualização (quando foi assinada)
    if (proposal.status === 'signed' && proposal.updated_at) {
      endDate = new Date(proposal.updated_at);
    }
    // Para propostas convertidas, usar a data de conversão (ou atualização)
    else if (proposal.status === 'converted') {
      if (proposal.converted_at) {
        endDate = new Date(proposal.converted_at);
      } else if (proposal.updated_at) {
        endDate = new Date(proposal.updated_at);
      } else {
        return '-';
      }
    }
    // Para propostas com contraproposta (assinadas parcialmente), usar data de atualização
    else if (proposal.status === 'contraproposta' && proposal.updated_at) {
      endDate = new Date(proposal.updated_at);
    }
    // Para propostas enviadas, usar a data atual
    else if (proposal.status === 'sent') {
      endDate = new Date();
    }
    // Para outros status, não mostrar SLA
    else {
      return '-';
    }

    // Calcular diferença em milissegundos
    const timeDiff = endDate.getTime() - createdDate.getTime();

    // Converter para dias (24h = 1 dia)
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    // Retornar formatado
    if (daysDiff === 0) {
      return '0 dia';
    } else if (daysDiff === 1) {
      return '1 dia';
    } else {
      return `${daysDiff} dias`;
    }
  }

  getSLAClass(sla: string): string {
    if (sla === '-') return '';

    // Extrair número de dias
    const days = parseInt(sla.split(' ')[0]);

    // Retornar classe baseada na quantidade de dias
    // 0-3 dias: success (verde)
    // 4+ dias: warning (amarelo/laranja)
    if (days <= 3) {
      return 'sla-success';
    } else {
      return 'sla-warning';
    }
  }

  private formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private formatCurrency(value: number | null | undefined): string {
    if (typeof value !== 'number' || value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value);
  }

  private getClientName(proposal: any): string {
    if (!proposal) return 'Cliente não informado';

    const client = proposal.client;

    if (!client) {
        return proposal.client_name || 'Cliente não informado';
    }

    if (client.type === 'PJ' && client.company) {
        return client.company.trade_name || client.company.company_name || proposal.client_name || '';
    }

    return proposal.client_name || client.name || 'Cliente nao informado';
  }

  private getClientEmail(proposal: any): string {
    if (!proposal) return '';
    return proposal.client?.company?.email || proposal.client_email || '';
  }

  private getClientPhone(proposal: any): string {
    if (!proposal) return '';
    return proposal.client?.company?.phone || proposal.client_phone || '';
  }

  private addSectionHeader(doc: any, title: string, y: number, margin: number, pageWidth: number): void {
    doc.setFillColor(240, 242, 245);
    doc.rect(margin, y - 3, pageWidth - (margin * 2), 12, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 59, 43);
    doc.text(title, margin + 5, y + 5);
    doc.setTextColor(0, 0, 0);
  }

  private addInfoRow(doc: any, label: string, value: string, y: number, margin: number): void {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(label, margin, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(64, 64, 64);
    doc.text(value, margin + 40, y);
    doc.setTextColor(0, 0, 0);
  }

  convertToContract(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    this.selectedProposalForConversion = proposal.raw;
    this.showConvertModal = true;
  }

  openSendProposalModal(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    
    // Verificar se a proposta pode ser preparada para envio
    if (!this.proposalService.canPrepareForSending(proposal.raw)) {
      this.modalService.showError('Esta proposta não pode ser preparada para envio no momento.');
      return;
    }

    this.selectedProposalForSending = proposal.raw;
    this.showSendModal = true;
  }

  onSendModalClose() {
    this.showSendModal = false;
    this.selectedProposalForSending = null;
  }

  onProposalSent(proposal: Proposal) {
    this.modalService.showSuccess('Proposta enviada com sucesso!');
    this.showSendModal = false;
    this.selectedProposalForSending = null;
    this.loadData(); // Recarregar a lista de propostas
  }

  async generatePublicLink(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    
    try {
      const response = await firstValueFrom(
        this.proposalService.prepareProposalForSending(proposal.id)
      );
      
      if (response && response.success) {
        const publicUrl = this.proposalService.getPublicProposalUrl(response.data);
        
        if (publicUrl) {
          // Copiar automaticamente para a área de transferência
          const copySuccess = await this.copyLinkToClipboard(publicUrl);
          
          if (copySuccess) {
            // Se copiou com sucesso, atualizar o status da proposta
            const statusUpdateSuccess = await this.updateProposalStatusToSent(proposal.id);
            
            if (statusUpdateSuccess) {
              this.modalService.showSuccess(`Link público gerado e copiado para a área de transferência!\n\n${publicUrl}`);
            } else {
              this.modalService.showWarning(`Link público gerado e copiado para a área de transferência!\n\n${publicUrl}\n\nAviso: O status da proposta pode não ter sido atualizado automaticamente.`);
            }
            
            // Recarregar a lista para mostrar o novo status
            this.loadData();
          } else {
            this.modalService.showError('Link gerado, mas não foi possível copiá-lo para a área de transferência.');
          }
        } else {
          this.modalService.showError('Erro ao gerar link público.');
        }
      } else {
        this.modalService.showError(response?.message || 'Erro ao gerar link público.');
      }
    } catch (error: any) {
      console.error('❌ Error generating public link:', error);
      this.modalService.showError('Não foi possível gerar o link público.');
    }
  }

  /**
   * Função auxiliar para copiar link para a área de transferência
   */
  private async copyLinkToClipboard(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (error) {
      // Fallback para navegadores antigos
      try {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      } catch (fallbackError) {
        console.error('❌ Erro ao copiar link:', error, fallbackError);
        return false;
      }
    }
  }

  /**
   * Função auxiliar para atualizar o status da proposta para "Enviada"
   */
  private async updateProposalStatusToSent(proposalId: number): Promise<boolean> {
    try {
      const statusResponse = await firstValueFrom(
        this.proposalService.updateProposalStatus(proposalId, 'sent')
      );
      
      if (statusResponse && statusResponse.success) {
        return true;
      } else {
        console.error('⚠️ Aviso: Não foi possível atualizar o status da proposta:', statusResponse?.message);
        return false;
      }
    } catch (statusError: any) {
      console.error('⚠️ Erro ao atualizar status da proposta:', statusError);
      return false;
    }
  }

  async copyPublicLink(proposal: ProposalDisplay, event: MouseEvent) {
    event.stopPropagation();
    
    const publicUrl = this.proposalService.getPublicProposalUrl(proposal.raw);
    if (!publicUrl) {
      this.modalService.showError('Esta proposta não possui um link público.');
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      this.modalService.showSuccess('Link copiado para a área de transferência!');
    } catch (error) {
      // Fallback para navegadores antigos
      const textArea = document.createElement('textarea');
      textArea.value = publicUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.modalService.showSuccess('Link copiado para a área de transferência!');
    }
  }

  // Métodos para controlar dropdown
  toggleDropdown(proposalId: number, event: MouseEvent) {
    event.stopPropagation();
    if (this.activeDropdownId === proposalId) {
      this.activeDropdownId = null;
    } else {
      this.activeDropdownId = proposalId;
      
      // Calcular posição para position: fixed
      setTimeout(() => {
        const target = event.target as HTMLElement;
        const button = target.closest('.dropdown-btn') as HTMLElement;
        const buttonRect = button.getBoundingClientRect();
        const dropdown = document.querySelector('.dropdown-menu') as HTMLElement;
        
        if (dropdown) {
          dropdown.style.top = `${buttonRect.bottom + 4}px`;
          dropdown.style.left = `${buttonRect.right - dropdown.offsetWidth}px`;
        }
      }, 0);
    }
  }

  closeDropdown() {
    this.activeDropdownId = null;
  }

  // New methods for modal conversion
  onConversionCompleted(result: any) {
    this.showConvertModal = false;
    this.selectedProposalForConversion = null;
    
    // Reload the data to show updated status
    this.loadData();
    
    // Ask if user wants to navigate to the created contract
    if (result.contractId) {
      const goToContract = confirm('Deseja visualizar o contrato criado?');
      if (goToContract) {
        this.router.navigate(['/home/contratos/visualizar', result.contractId]);
      }
    }
  }

  closeConvertModal() {
    this.showConvertModal = false;
    this.selectedProposalForConversion = null;
  }

  /**
   * Atualizar status da proposta diretamente da tabela
   */
  async updateProposalStatus(proposal: ProposalDisplay, event: Event) {
    event.stopPropagation();

    const newStatus = proposal.status as 'draft' | 'sent' | 'signed' | 'rejected' | 'expired' | 'converted' | 'contraproposta';
    const previousStatus = proposal.raw.status;

    // Se o status não mudou, não faz nada
    if (newStatus === previousStatus) {
      return;
    }

    try {
      const response = await firstValueFrom(
        this.proposalService.updateProposalStatus(proposal.id, newStatus)
      );

      if (response && response.success) {
        // Atualizar o status no objeto raw também
        proposal.raw.status = newStatus;
        proposal.statusText = this.proposalService.getStatusText(newStatus);

        this.modalService.showSuccess('Status da proposta atualizado com sucesso!');
      } else {
        // Se falhou, reverter o status no select
        proposal.status = previousStatus;
        this.modalService.showError(response?.message || 'Erro ao atualizar o status da proposta.');
      }
    } catch (error: any) {
      console.error('❌ Error updating proposal status:', error);

      // Reverter o status no select
      proposal.status = previousStatus;

      if (error?.status === 404) {
        this.modalService.showError('Proposta não encontrada.');
      } else if (error?.status === 403) {
        this.modalService.showError('Você não tem permissão para alterar o status desta proposta.');
      } else {
        this.modalService.showError('Não foi possível atualizar o status da proposta.');
      }
    }
  }

}