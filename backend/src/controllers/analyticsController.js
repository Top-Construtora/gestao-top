const Contract = require('../models/Contract');
const Service = require('../models/Service');
const Client = require('../models/Client');
const Proposal = require('../models/Proposal');
const { supabase } = require('../config/database');

class AnalyticsController {
  /**
   * Obter dados de analytics gerais
   */
  async getGeneralAnalytics(req, res, next) {
    try {
      // Calcular filtro de período
      const period = req.query.period || 'month';
      const dateFilter = this.calculatePeriodFilter(period);

      // Obter dados reais de cada seção
      const [
        general,
        contracts,
        services,
        clients,
        proposals,
        revenue,
        servicesByUser,
        completedServices,
        topServices,
        clientCompletionData,
        contractCompletionData
      ] = await Promise.all([
        this.getGeneralStats(dateFilter),
        this.getContractsAnalytics(dateFilter),
        this.getServicesAnalytics(dateFilter),
        this.getClientsAnalytics(dateFilter),
        this.getProposalsAnalytics(dateFilter),
        this.getRevenueAnalytics(dateFilter),
        this.getServicesByUser(dateFilter),
        this.getCompletedServicesData(dateFilter),
        this.getTopContractedServices(dateFilter),
        this.getClientCompletionData(),
        this.getContractCompletionData()
      ]);

      const analyticsData = {
        general,
        contracts,
        services,
        clients,
        proposals,
        revenue,
        servicesByUser,
        completedServices,
        topServices,
        clientCompletionData,
        contractCompletionData,
        period,
        generatedAt: new Date().toISOString()
      };

      res.json({ 
        analytics: analyticsData,
        success: true 
      });
    } catch (error) {
      console.error('❌ Erro ao obter analytics:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: error.message 
      });
    }
  }

  /**
   * Obter estatísticas gerais
   */
  async getGeneralStats(dateFilter) {
    try {
      console.log('📅 [Analytics] Filtro de período:', dateFilter);

      // Total de contratos no período filtrado
      const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select('id, status, total_value, created_at')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      if (contractsError) {
        console.error('❌ Erro ao buscar contratos:', contractsError);
        throw contractsError;
      }

      const totalContracts = allContracts?.length || 0;
      const activeContracts = allContracts?.filter(c => c.status === 'active').length || 0;
      const completedContracts = allContracts?.filter(c => c.status === 'completed').length || 0;
      // Total revenue apenas de contratos ativos e concluídos
      const totalRevenue = allContracts?.filter(c => c.status === 'active' || c.status === 'completed')
        .reduce((sum, c) => sum + (parseFloat(c.total_value) || 0), 0) || 0;
      const activeRevenue = allContracts?.filter(c => c.status === 'active')
        .reduce((sum, c) => sum + (parseFloat(c.total_value) || 0), 0) || 0;

      // Buscar valor de faturamento de vagas R&S fechadas no período
      const { data: vagasFechadas } = await supabase
        .from('vagas')
        .select('valor_faturamento, data_fechamento_cancelamento')
        .in('status', ['fechada', 'fechada_rep'])
        .gte('data_fechamento_cancelamento', dateFilter.startDate)
        .lte('data_fechamento_cancelamento', dateFilter.endDate);

      const rsRevenue = vagasFechadas?.reduce((sum, v) => sum + (parseFloat(v.valor_faturamento) || 0), 0) || 0;

      // Média baseada apenas em contratos ativos e concluídos
      const activeAndCompletedCount = activeContracts + completedContracts;
      const averageContractValue = activeAndCompletedCount > 0 ? totalRevenue / activeAndCompletedCount : 0;

      // Calcular duração média dos contratos (aproximada)
      const averageContractDuration = await this.calculateAverageContractDuration();

      // Taxa de conversão (propostas -> contratos)
      const conversionRate = await this.calculateConversionRate();

      // Taxa de crescimento
      const growthRate = await this.calculateGrowthRate(dateFilter);

      const result = {
        totalContracts,
        activeContracts,
        completedContracts,
        totalRevenue: totalRevenue + rsRevenue,
        activeRevenue,
        averageContractValue,
        averageContractDuration,
        conversionRate,
        growthRate,
        rsRevenue // Adicionar separadamente para visibilidade
      };

      return result;
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas gerais:', error);
      throw error;
    }
  }

  /**
   * Obter analytics de contratos
   */
  async getContractsAnalytics(dateFilter) {
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('status, type, created_at, total_value')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      // Contratos por status
      const byStatus = {
        active: contracts?.filter(c => c.status === 'active').length || 0,
        completed: contracts?.filter(c => c.status === 'completed').length || 0,
        cancelled: contracts?.filter(c => c.status === 'cancelled').length || 0,
        suspended: contracts?.filter(c => c.status === 'suspended').length || 0
      };

      // Contratos por tipo
      const byType = {
        Full: contracts?.filter(c => c.type === 'Full').length || 0,
        Pontual: contracts?.filter(c => c.type === 'Pontual').length || 0,
        Individual: contracts?.filter(c => c.type === 'Individual').length || 0,
        'Recrutamento & Seleção': contracts?.filter(c => c.type === 'Recrutamento & Seleção').length || 0
      };

      // Evolução mensal (últimos 6 meses)
      const monthlyEvolution = await this.getMonthlyContractEvolution();

      // Criar dados byMonth para compatibilidade com o frontend
      const byMonth = monthlyEvolution.map(evolution => ({
        month: evolution.month,
        new: evolution.contracts,
        completed: Math.floor(evolution.contracts * 0.7), // Estimativa
        revenue: evolution.contracts * 50000 // Estimativa
      }));

      return {
        total: contracts?.length || 0,
        byStatus,
        byType,
        monthlyEvolution,
        byMonth
      };
    } catch (error) {
      console.error('❌ Erro ao obter analytics de contratos:', error);
      throw error;
    }
  }

  /**
   * Obter analytics de serviços
   */
  async getServicesAnalytics(dateFilter) {
    try {
      // Serviços mais utilizados no período filtrado
      const { data: contractServices } = await supabase
        .from('contract_services')
        .select(`
          service_id,
          services:service_id (name, category),
          total_value,
          status,
          created_at
        `)
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      const servicesMap = new Map();
      
      contractServices?.forEach(cs => {
        const serviceId = cs.service_id;
        const serviceName = cs.services?.name || 'Desconhecido';
        const category = cs.services?.category || 'Geral';
        
        if (!servicesMap.has(serviceId)) {
          servicesMap.set(serviceId, {
            id: serviceId,
            name: serviceName,
            category,
            totalContracts: 0,
            activeContracts: 0,
            completedContracts: 0,
            totalRevenue: 0,
            averageValue: 0,
            popularity: 0,
            trend: 0
          });
        }
        
        const service = servicesMap.get(serviceId);
        service.totalContracts++;
        service.totalRevenue += cs.total_value || 0;
        
        if (cs.status === 'in_progress') service.activeContracts++;
        if (cs.status === 'completed') service.completedContracts++;
      });

      // Cores e ícones predefinidos para categorias
      const categoryColors = {
        'Geral': '#6366f1',
        'Consultoria': '#0A8060',
        'Treinamento': '#f59e0b',
        'Mentoria': '#8b5cf6',
        'Diagnóstico': '#10b981',
        'Desenvolvimento': '#f97316',
        'Gestão': '#ef4444',
        'Estratégia': '#06b6d4'
      };

      const categoryIcons = {
        'Geral': 'fas fa-cog',
        'Consultoria': 'fas fa-lightbulb',
        'Treinamento': 'fas fa-graduation-cap',
        'Mentoria': 'fas fa-user-tie',
        'Diagnóstico': 'fas fa-stethoscope',
        'Desenvolvimento': 'fas fa-line-chart',
        'Gestão': 'fas fa-chart-line',
        'Estratégia': 'fas fa-chess'
      };

      // Converter para array e calcular médias
      const servicesArray = Array.from(servicesMap.values()).map(service => ({
        ...service,
        averageValue: service.totalContracts > 0 ? service.totalRevenue / service.totalContracts : 0,
        popularity: service.totalContracts, // Simplificado por agora
        color: categoryColors[service.category] || '#6366f1',
        icon: categoryIcons[service.category] || 'fas fa-cog'
      }));

      // Calcular popularidade como porcentagem
      const totalContracts = servicesArray.reduce((sum, s) => sum + s.totalContracts, 0);
      servicesArray.forEach(service => {
        service.popularity = totalContracts > 0 ? (service.totalContracts / totalContracts) * 100 : 0;
      });

      // Ordenar por popularidade
      servicesArray.sort((a, b) => b.totalContracts - a.totalContracts);

      return servicesArray;
    } catch (error) {
      console.error('❌ Erro ao obter analytics de serviços:', error);
      throw error;
    }
  }

  /**
   * Obter analytics de clientes
   */
  async getClientsAnalytics(dateFilter) {
    try {
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, created_at');

      const { data: newClients } = await supabase
        .from('clients')
        .select('id')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      const { data: clientsWithContracts } = await supabase
        .from('contracts')
        .select('client_id')
        .not('client_id', 'is', null);

      const uniqueClientsWithContracts = new Set(
        clientsWithContracts?.map(c => c.client_id) || []
      ).size;

      // Contar clientes PJ
      const { data: clientsPj } = await supabase
        .from('clients_pj')
        .select('client_id');

      return {
        totalClients: allClients?.length || 0,
        newClients: newClients?.length || 0,
        activeClients: uniqueClientsWithContracts,
        retentionRate: 85, // Valor estimado - pode ser calculado com mais precisão
        byType: {
          pj: clientsPj?.length || 0
        }
      };
    } catch (error) {
      console.error('❌ Erro ao obter analytics de clientes:', error);
      throw error;
    }
  }

  /**
   * Obter analytics de propostas
   */
  async getProposalsAnalytics(dateFilter) {
    try {
      const { data: proposals } = await supabase
        .from('proposals')
        .select('status, created_at, total_value')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      const byStatus = {
        draft: proposals?.filter(p => p.status === 'draft').length || 0,
        sent: proposals?.filter(p => p.status === 'sent').length || 0,
        signed: proposals?.filter(p => p.status === 'signed').length || 0,
        rejected: proposals?.filter(p => p.status === 'rejected').length || 0,
        expired: proposals?.filter(p => p.status === 'expired').length || 0,
        converted: proposals?.filter(p => p.status === 'converted').length || 0,
        contraproposta: proposals?.filter(p => p.status === 'contraproposta').length || 0
      };

      const totalValue = proposals?.reduce((sum, p) => sum + (p.total_value || 0), 0) || 0;
      const averageValue = proposals?.length > 0 ? totalValue / proposals.length : 0;

      return {
        total: proposals?.length || 0,
        byStatus,
        totalValue,
        averageValue
      };
    } catch (error) {
      console.error('❌ Erro ao obter analytics de propostas:', error);
      throw error;
    }
  }

  /**
   * Obter analytics de receita
   */
  async getRevenueAnalytics(dateFilter) {
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('total_value, payment_status, created_at, end_date, status')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      // Receita total apenas de contratos ativos e concluídos
      const totalRevenue = contracts?.filter(c => c.status === 'active' || c.status === 'completed')
        .reduce((sum, c) => sum + (c.total_value || 0), 0) || 0;
      const receivedRevenue = contracts?.filter(c => (c.status === 'active' || c.status === 'completed') && c.payment_status === 'pago')
        .reduce((sum, c) => sum + (c.total_value || 0), 0) || 0;
      const pendingRevenue = totalRevenue - receivedRevenue;

      // Buscar valor de faturamento de vagas R&S fechadas no período
      const { data: vagasFechadas } = await supabase
        .from('vagas')
        .select('valor_faturamento, data_fechamento_cancelamento')
        .in('status', ['fechada', 'fechada_rep'])
        .gte('data_fechamento_cancelamento', dateFilter.startDate)
        .lte('data_fechamento_cancelamento', dateFilter.endDate);

      const rsRevenue = vagasFechadas?.reduce((sum, v) => sum + (parseFloat(v.valor_faturamento) || 0), 0) || 0;

      // Receita por período (últimos 6 meses)
      const monthlyRevenue = await this.getMonthlyRevenueEvolution();

      // Criar dados para compatibilidade com frontend
      const monthly = monthlyRevenue.map((data, index) => ({
        month: data.month,
        revenue: data.revenue,
        projected: data.revenue * 1.1, // 10% maior como projeção
        growth: index > 0 ? ((data.revenue - monthlyRevenue[index-1].revenue) / monthlyRevenue[index-1].revenue) * 100 : 0
      }));

      return {
        totalRevenue: totalRevenue + rsRevenue,
        receivedRevenue,
        pendingRevenue,
        totalCollected: receivedRevenue,
        totalPending: pendingRevenue,
        monthlyRevenue,
        monthly,
        rsRevenue // Adicionar separadamente para visibilidade
      };
    } catch (error) {
      console.error('❌ Erro ao obter analytics de receita:', error);
      throw error;
    }
  }

  /**
   * Calcular duração média dos contratos
   */
  async calculateAverageContractDuration() {
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('start_date, end_date')
        .not('end_date', 'is', null);

      if (!contracts || contracts.length === 0) return 0;

      const durations = contracts.map(contract => {
        const startDate = new Date(contract.start_date);
        const endDate = new Date(contract.end_date);
        return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)); // dias
      });

      const averageDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      return Math.round(averageDuration);
    } catch (error) {
      console.error('❌ Erro ao calcular duração média:', error);
      return 0;
    }
  }

  /**
   * Calcular taxa de conversão (Propostas Assinadas / (Propostas Enviadas + Propostas Assinadas + Propostas Rejeitadas))
   */
  async calculateConversionRate() {
    try {
      const { data: proposals, error: proposalsError } = await supabase
        .from('proposals')
        .select('status');

      if (proposalsError) {
        console.error('❌ Erro ao buscar propostas:', proposalsError);
        return 0;
      }

      // Propostas assinadas (signed ou converted)
      const signedProposals = proposals?.filter(p =>
        p.status === 'signed' || p.status === 'converted'
      ).length || 0;

      // Propostas enviadas (apenas 'sent', não inclui as assinadas ou rejeitadas)
      const sentProposals = proposals?.filter(p => p.status === 'sent').length || 0;

      // Propostas rejeitadas
      const rejectedProposals = proposals?.filter(p => p.status === 'rejected').length || 0;

      // Total do denominador: enviadas + assinadas + rejeitadas
      const totalDenominator = sentProposals + signedProposals + rejectedProposals;

      if (totalDenominator === 0) return 0;

      // Taxa de conversão = Assinadas / (Enviadas + Assinadas + Rejeitadas)
      const rate = parseFloat(((signedProposals / totalDenominator) * 100).toFixed(2));
      return rate;
    } catch (error) {
      console.error('❌ Erro ao calcular taxa de conversão:', error);
      return 0;
    }
  }

  /**
   * Calcular taxa de crescimento
   */
  async calculateGrowthRate(dateFilter) {
    try {
      const { data: currentPeriod } = await supabase
        .from('contracts')
        .select('id')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      // Período anterior (mesmo tamanho)
      const periodLength = new Date(dateFilter.endDate) - new Date(dateFilter.startDate);
      const previousStart = new Date(new Date(dateFilter.startDate) - periodLength);
      const previousEnd = new Date(dateFilter.startDate);

      const { data: previousPeriod } = await supabase
        .from('contracts')
        .select('id')
        .gte('created_at', previousStart.toISOString().split('T')[0])
        .lte('created_at', previousEnd.toISOString().split('T')[0]);

      const currentCount = currentPeriod?.length || 0;
      const previousCount = previousPeriod?.length || 0;

      if (previousCount === 0) return currentCount > 0 ? 100 : 0;
      return Math.round(((currentCount - previousCount) / previousCount) * 100);
    } catch (error) {
      console.error('❌ Erro ao calcular taxa de crescimento:', error);
      return 0;
    }
  }

  /**
   * Obter evolução mensal de contratos
   */
  async getMonthlyContractEvolution() {
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      const monthlyData = new Map();
      
      contracts?.forEach(contract => {
        const month = new Date(contract.created_at).toISOString().slice(0, 7); // YYYY-MM
        monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
      });

      // Preencher últimos 6 meses
      const result = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.toISOString().slice(0, 7);
        result.push({
          month,
          contracts: monthlyData.get(month) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Erro ao obter evolução mensal:', error);
      return [];
    }
  }

  /**
   * Obter evolução mensal de receita
   */
  async getMonthlyRevenueEvolution() {
    try {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('created_at, total_value')
        .gte('created_at', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      const monthlyData = new Map();
      
      contracts?.forEach(contract => {
        const month = new Date(contract.created_at).toISOString().slice(0, 7);
        monthlyData.set(month, (monthlyData.get(month) || 0) + (contract.total_value || 0));
      });

      // Preencher últimos 6 meses
      const result = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.toISOString().slice(0, 7);
        result.push({
          month,
          revenue: monthlyData.get(month) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Erro ao obter evolução de receita:', error);
      return [];
    }
  }

  /**
   * Exportar dados de analytics
   */
  async exportAnalytics(req, res, next) {
    try {
      const { format = 'json' } = req.query;
      
      // Obter dados completos de analytics
      const analyticsData = await this.getGeneralAnalytics(req, { json: () => {} }, () => {});
      
      switch (format) {
        case 'csv':
          // Implementar export CSV
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
          res.send('CSV export not implemented yet');
          break;
        case 'excel':
          // Implementar export Excel
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', 'attachment; filename="analytics.xlsx"');
          res.send('Excel export not implemented yet');
          break;
        default:
          res.json(analyticsData);
      }
    } catch (error) {
      console.error('❌ Erro ao exportar analytics:', error);
      next(error);
    }
  }

  /**
   * Obter distribuição de serviços por usuário
   */
  async getServicesByUser(dateFilter) {
    try {
      // Buscar usuários com contratos atribuídos
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .eq('is_active', true);

      if (usersError) {
        console.error('❌ Erro ao buscar usuários:', usersError);
        return [];
      }

      // Para cada usuário, contar contratos atribuídos via contract_assignments
      const userServicesMap = new Map();

      for (const user of users || []) {
        // Buscar contratos atribuídos ao usuário no período filtrado
        const { data: assignments } = await supabase
          .from('contract_assignments')
          .select(`
            contract_id,
            contracts:contract_id (
              id,
              created_at,
              contract_services (
                services:service_id (category)
              )
            )
          `)
          .eq('user_id', user.id);

        // Filtrar contratos por data após a query
        const filteredAssignments = assignments?.filter(a => {
          if (!a.contracts?.created_at) return false;
          const createdAt = a.contracts.created_at;
          return createdAt >= dateFilter.startDate && createdAt <= dateFilter.endDate;
        });

        if (filteredAssignments && filteredAssignments.length > 0) {
          const servicesByCategory = {};
          let totalServices = 0;

          filteredAssignments.forEach(assignment => {
            const contract = assignment.contracts;
            if (contract && contract.contract_services) {
              contract.contract_services.forEach(cs => {
                const category = cs.services?.category || 'Geral';
                servicesByCategory[category] = (servicesByCategory[category] || 0) + 1;
                totalServices++;
              });
            }
          });

          if (totalServices > 0) {
            userServicesMap.set(user.id, {
              userId: user.id,
              userName: user.name,
              totalServices,
              servicesByCategory
            });
          }
        }
      }

      const result = Array.from(userServicesMap.values()).sort((a, b) => b.totalServices - a.totalServices);
      
      return result;
    } catch (error) {
      console.error('❌ Erro ao obter distribuição de serviços por usuário:', error);
      return [];
    }
  }

  /**
   * Obter dados de serviços concluídos ao longo do tempo
   */
  async getCompletedServicesData(dateFilter) {
    try {
      // Buscar serviços concluídos no período filtrado
      const { data: completedServices, error: servicesError } = await supabase
        .from('contract_services')
        .select('updated_at, created_at')
        .eq('status', 'completed')
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços concluídos:', servicesError);
        return [];
      }


      const monthlyData = new Map();
      
      completedServices?.forEach(service => {
        const month = new Date(service.updated_at).toISOString().slice(0, 7);
        monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
      });

      // Preencher últimos 12 meses
      const result = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.toISOString().slice(0, 7);
        const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        
        result.push({
          month: monthName,
          completed: monthlyData.get(month) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Erro ao obter dados de serviços concluídos:', error);
      return [];
    }
  }

  /**
   * Obter serviços mais contratados
   */
  async getTopContractedServices(dateFilter) {
    try {
      // Buscar contratos no período filtrado
      const { data: contractsWithServices, error: contractsError } = await supabase
        .from('contracts')
        .select(`
          id,
          created_at,
          contract_services (
            id,
            service_id,
            total_value,
            services:service_id (
              id,
              name,
              category
            )
          )
        `)
        .gte('created_at', dateFilter.startDate)
        .lte('created_at', dateFilter.endDate);

      if (contractsError) {
        console.error('❌ Erro ao buscar contratos com serviços:', contractsError);
        return [];
      }

      const servicesMap = new Map();
      
      // Processar cada contrato e seus serviços
      contractsWithServices?.forEach(contract => {
        contract.contract_services?.forEach(cs => {
          const service = cs.services;
          if (service) {
            const serviceId = service.id;
            
            if (!servicesMap.has(serviceId)) {
              servicesMap.set(serviceId, {
                id: serviceId,
                name: service.name,
                category: service.category || 'Geral',
                contractCount: 0,
                totalValue: 0
              });
            }
            
            const serviceData = servicesMap.get(serviceId);
            serviceData.contractCount += 1;
            serviceData.totalValue += (cs.total_value || 0);
          }
        });
      });

      // Converter para array e ordenar por quantidade de contratos
      const servicesArray = Array.from(servicesMap.values())
        .sort((a, b) => b.contractCount - a.contractCount)
        .slice(0, 10); // Top 10

      return servicesArray;
    } catch (error) {
      console.error('❌ Erro ao obter serviços mais contratados:', error);
      return [];
    }
  }

  /**
   * Obter dados de conclusão de contratos por cliente baseado em rotinas reais
   */
  async getClientCompletionData() {
    try {
      // Buscar TODOS os clientes do sistema
      const { data: allClients, error: clientsError } = await supabase
        .from('clients')
        .select(`
          id,
          clients_pj (company_name, trade_name)
        `);

      if (clientsError) {
        return [];
      }
      
      if (!allClients || allClients.length === 0) {
        return [];
      }

      const clientCompletionData = [];

      // Processar cada cliente individualmente
      for (const client of allClients) {
        try {
          // Determinar o nome do cliente (apenas PJ)
          const clientName = client.clients_pj?.trade_name || client.clients_pj?.company_name || 'Cliente';

          // Buscar contratos ATIVOS do cliente
          const { data: contracts, error: contractsError } = await supabase
            .from('contracts')
            .select('id, status')
            .eq('client_id', client.id)
            .eq('status', 'active'); // Apenas contratos com status ativo

          if (contractsError) {
            continue;
          }

          if (!contracts || contracts.length === 0) {
            continue;
          }

          const contractIds = contracts.map(c => c.id);
          
          // Buscar serviços com suas informações
          const { data: contractServices, error: servicesError } = await supabase
            .from('contract_services')
            .select(`
              id,
              contract_id,
              status,
              services:service_id (
                id,
                name,
                category
              )
            `)
            .in('contract_id', contractIds);

          if (servicesError) {
            continue;
          }

          if (!contractServices || contractServices.length === 0) {
            continue;
          }

          // Buscar etapas ESPECÍFICAS dos contract_services
          const contractServiceIds = contractServices.map(cs => cs.id);
          let allContractServiceStages = [];

          if (contractServiceIds.length > 0) {
            const { data: stages, error: stagesError } = await supabase
              .from('contract_service_stages')
              .select('contract_service_id, status, is_not_applicable')
              .in('contract_service_id', contractServiceIds);

            if (!stagesError && stages) {
              allContractServiceStages = stages;
            }
          }

          // Garantir que TODOS os clientes com contratos ativos sejam incluídos
          const activeContracts = contracts.filter(c => c.status === 'active').length;

          // Calcular progresso AGREGADO de todos os contratos do cliente
          let totalStepsAllContracts = 0;
          let completedStepsAllContracts = 0;

          // Para cada contrato ativo, somar suas etapas
          for (const contract of contracts) {
            const contractServicesOfThisContract = contractServices.filter(cs => cs.contract_id === contract.id);

            // Usar TODOS os serviços (incluindo internos)
            const allServicesOfContract = contractServicesOfThisContract;

            // Usar etapas ESPECÍFICAS do contrato
            allServicesOfContract.forEach(service => {
              const serviceStages = allContractServiceStages.filter(
                stage => stage.contract_service_id === service.id
              );

              // Filtrar etapas aplicáveis (não marcadas como N/A)
              const applicableStages = serviceStages.filter(stage => !stage.is_not_applicable);

              if (applicableStages.length > 0) {
                totalStepsAllContracts += applicableStages.length;
                completedStepsAllContracts += applicableStages.filter(stage => stage.status === 'completed').length;
              } else {
                // Fallback: se não tem etapas específicas, usar status do serviço
                totalStepsAllContracts += 1;
                if (service.status === 'completed') {
                  completedStepsAllContracts += 1;
                }
              }
            });
          }

          // Calcular percentual AGREGADO (total de concluídas / total de etapas)
          const completionPercentage = totalStepsAllContracts > 0
            ? Math.round((completedStepsAllContracts / totalStepsAllContracts) * 100)
            : 0;

          // INCLUIR TODOS os clientes que têm pelo menos 1 contrato ativo
          if (contracts.length > 0) {
            clientCompletionData.push({
              clientId: client.id,
              clientName,
              totalServices: totalStepsAllContracts,
              completedServices: completedStepsAllContracts,
              completionPercentage,
              activeContracts,
              totalContracts: contracts.length
            });
          }
          
        } catch (clientError) {
          continue;
        }
      }

      // Ordenar por porcentagem de conclusão (decrescente)
      clientCompletionData.sort((a, b) => b.completionPercentage - a.completionPercentage);

      return clientCompletionData; // TODOS os clientes
    } catch (error) {
      console.error('❌ Erro ao obter dados de conclusão por cliente:', error);
      return [];
    }
  }

  /**
   * Gerar dados de exemplo para demonstração
   */
  generateSampleClientCompletionData() {
    
    const sampleClients = [
      { name: 'ACME Corporation', services: 12, completed: 10 },
      { name: 'Tech Solutions Ltda', services: 8, completed: 8 },
      { name: 'Maria Silva & Associados', services: 15, completed: 11 },
      { name: 'Inovação Digital S.A.', services: 6, completed: 4 },
      { name: 'João Pereira Consultoria', services: 10, completed: 7 },
      { name: 'Global Business Inc', services: 18, completed: 12 },
      { name: 'Ana Costa Desenvolvimento', services: 9, completed: 5 },
      { name: 'Estratégia Plus Ltda', services: 14, completed: 9 },
      { name: 'Crescimento & Cia', services: 7, completed: 3 },
      { name: 'Transformação Digital', services: 11, completed: 6 }
    ];

    return sampleClients.map((client, index) => ({
      clientId: index + 1000, // IDs ficcionais
      clientName: client.name,
      totalServices: client.services,
      completedServices: client.completed,
      completionPercentage: Math.round((client.completed / client.services) * 100),
      activeContracts: Math.floor(client.services / 3) + 1,
      totalContracts: Math.floor(client.services / 2) + 1
    })).sort((a, b) => b.completionPercentage - a.completionPercentage);
  }

  /**
   * Obter dados de conclusão por contrato baseado em etapas de serviços
   */
  async getContractCompletionData() {
    try {
      // Buscar TODOS os contratos ativos com suas informações do cliente
      const { data: allContracts, error: contractsError } = await supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          client_id,
          type,
          status,
          start_date,
          clients:client_id (
            id,
            clients_pj (company_name, trade_name)
          )
        `)
        .eq('status', 'active');

      if (contractsError) {
        console.error('❌ Erro ao buscar contratos:', contractsError);
        return [];
      }

      if (!allContracts || allContracts.length === 0) {
        return [];
      }

      const contractCompletionData = [];

      // Processar cada contrato individualmente
      for (const contract of allContracts) {
        try {
          // Determinar o nome do cliente (apenas PJ)
          const clientName = contract.clients?.clients_pj?.trade_name || contract.clients?.clients_pj?.company_name || 'Cliente';

          // Buscar serviços do contrato
          const { data: contractServices, error: servicesError } = await supabase
            .from('contract_services')
            .select(`
              id,
              status,
              services:service_id (
                id,
                name,
                category
              )
            `)
            .eq('contract_id', contract.id);

          if (servicesError) {
            console.error(`❌ Erro ao buscar serviços do contrato ${contract.id}:`, servicesError);
            continue;
          }

          // Usar TODOS os serviços (incluindo internos)
          const allServices = contractServices || [];

          // Buscar etapas ESPECÍFICAS do contrato (contract_service_stages)
          const contractServiceIds = allServices.map(cs => cs.id);
          let contractServiceStages = [];

          if (contractServiceIds.length > 0) {
            const { data: stages, error: stagesError } = await supabase
              .from('contract_service_stages')
              .select('contract_service_id, status, is_not_applicable')
              .in('contract_service_id', contractServiceIds);

            if (!stagesError && stages) {
              contractServiceStages = stages;
            }
          }

          let totalSteps = 0;
          let completedSteps = 0;

          // Calcular progresso usando etapas ESPECÍFICAS do contrato
          allServices.forEach(service => {
            const serviceStages = contractServiceStages.filter(
              stage => stage.contract_service_id === service.id
            );

            // Filtrar etapas aplicáveis (não marcadas como N/A)
            const applicableStages = serviceStages.filter(stage => !stage.is_not_applicable);

            if (applicableStages.length > 0) {
              const completedCount = applicableStages.filter(stage => stage.status === 'completed').length;
              totalSteps += applicableStages.length;
              completedSteps += completedCount;
            } else {
              // Fallback: se não tem etapas específicas, usar status do serviço
              totalSteps += 1;
              if (service.status === 'completed') {
                completedSteps += 1;
              }
            }
          });

          // Calcular percentual de conclusão
          const completionPercentage = totalSteps > 0
            ? Math.round((completedSteps / totalSteps) * 100)
            : 0;

          // Incluir todos os contratos ativos, mesmo com 0% de conclusão
          contractCompletionData.push({
            contractId: contract.id,
            contractNumber: contract.contract_number,
            clientId: contract.client_id,
            clientName,
            type: contract.type || 'Full',
            totalServices: totalSteps,
            completedServices: completedSteps,
            completionPercentage,
            status: contract.status,
            startDate: contract.start_date
          });
          
        } catch (contractError) {
          console.error(`❌ Erro ao processar contrato ${contract.id}:`, contractError);
          continue;
        }
      }

      // Ordenar por porcentagem de conclusão (decrescente)
      contractCompletionData.sort((a, b) => b.completionPercentage - a.completionPercentage);

      return contractCompletionData;
    } catch (error) {
      console.error('❌ Erro ao obter dados de conclusão por contrato:', error);
      return [];
    }
  }

  /**
   * Calcular período baseado no filtro
   */
  calculatePeriodFilter(period) {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let startDate;

    switch (period) {
      case 'week':
        // Últimos 7 dias
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        // Últimos 30 dias
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        // Últimos 90 dias (3 meses)
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        // Últimos 365 dias
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        // Padrão: últimos 30 dias
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
    }

    const result = {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };

    console.log(`📅 [Analytics] Período calculado (${period}):`, result);
    return result;
  }
}

const analyticsController = new AnalyticsController();

// Bind methods to maintain 'this' context
analyticsController.getGeneralAnalytics = analyticsController.getGeneralAnalytics.bind(analyticsController);
analyticsController.exportAnalytics = analyticsController.exportAnalytics.bind(analyticsController);

module.exports = analyticsController;