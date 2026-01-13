const { supabase } = require('../config/database');
const { generateProposalToken } = require('../utils/tokenGenerator');

class ProposalModel {
  /**
   * Helper function to transform client data and add name property
   */
  transformClientData(proposals) {
    return proposals.map(proposal => {
      if (proposal.client) {
        // All clients are now PJ only
        const isPJ = proposal.client.clients_pj && proposal.client.clients_pj.company_name;

        if (isPJ) {
          // Priorizar trade_name (nome fantasia) sobre company_name (razão social)
          proposal.client.name = proposal.client.clients_pj.trade_name || proposal.client.clients_pj.company_name;
          proposal.client.type = 'PJ';
          proposal.client.company = proposal.client.clients_pj;
        } else {
          proposal.client.name = 'Cliente sem nome';
        }
      }
      return proposal;
    });
  }

  /**
   * Gerar número de proposta sequencial
   */
  async generateProposalNumber() {
    try {
      const year = new Date().getFullYear();
      const prefix = `PROP-${year}-`;
      
      const { data, error } = await supabase
        .from('proposals')
        .select('proposal_number')
        .like('proposal_number', `${prefix}%`)
        .order('proposal_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('❌ Erro ao buscar último número de proposta:', error);
        throw error;
      }

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastNumberMatch = data[0].proposal_number.match(/PROP-\d{4}-(\d+)/);
        if (lastNumberMatch) {
          nextNumber = parseInt(lastNumberMatch[1]) + 1;
        }
      }

      const proposalNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
      return proposalNumber;
    } catch (error) {
      console.error('❌ Erro ao gerar número da proposta:', error);
      throw error;
    }
  }

  /**
   * Criar nova proposta
   */
  async create(proposalData, userId) {
    const {
      client_id,
      type = 'Full',
      services
    } = proposalData;

    try {
      console.log('Attempting to create proposal with data:', proposalData);

      // Gerar número da proposta
      const proposal_number = await this.generateProposalNumber();

      // Gerar link único para a proposta
      const unique_link = generateProposalToken();

      // Iniciar transação
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert([{
          client_id,
          type,
          proposal_number,
          status: 'draft',
          total_value: 0,
          unique_link
        }])
        .select('*')
        .single();

      if (proposalError) {
        console.error('❌ Erro ao criar proposta na tabela proposals:', proposalError);
        throw proposalError;
      }

      // Adicionar serviços à proposta
      if (services && services.length > 0) {
        const servicesForInsert = services.map((service, index) => ({
          proposal_id: proposal.id,
          service_id: service.service_id,
          unit_value: service.unit_value || 0,
          total_value: service.total_value || service.unit_value || 0
        }));

        console.log('🔧 Attempting to insert proposal services:', JSON.stringify(servicesForInsert, null, 2));

        const { error: servicesError } = await supabase
          .from('proposal_services')
          .insert(servicesForInsert);

        if (servicesError) {
          // Rollback - excluir proposta criada
          await supabase.from('proposals').delete().eq('id', proposal.id);
          console.error('❌ Erro ao adicionar serviços à proposta:', servicesError);
          throw servicesError;
        }

        // Recalcular valor total
        await this.recalculateTotal(proposal.id);
      }

      return await this.findById(proposal.id);
    } catch (error) {
      console.error('❌ Erro geral no create da ProposalModel:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as propostas
   */
  async findAll(filters = {}) {
    try {
      let query = supabase
        .from('proposals')
        .select(`
          id, proposal_number, client_id, type, status, total_value, unique_link, converted_to_contract_id,
          created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pj(company_name, trade_name)
          )
        `)
        .order('created_at', { ascending: false });

      // Aplicar filtros

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.client_id) {
        query = query.eq('client_id', filters.client_id);
      }

      if (filters.search) {
        query = query.or(`proposal_number.ilike.%${filters.search}%`);
      }

      // Filtro por propostas expiradas (usando status)
      if (filters.expired_only) {
        query = query.eq('status', 'expired');
      }

      const { data: proposals, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar propostas:', error);
        throw error;
      }

      // Buscar serviços para cada proposta (necessário para calcular valor de contrapropostas)
      const proposalsWithServices = await Promise.all(
        (proposals || []).map(async (proposal) => {
          // Buscar serviços para contrapropostas e propostas convertidas (que podem ter sido contrapropostas)
          if (proposal.status === 'contraproposta' || proposal.status === 'converted') {
            const { data: services, error: servicesError } = await supabase
              .from('proposal_services')
              .select('id, service_id, total_value')
              .eq('proposal_id', proposal.id);

            if (!servicesError && services) {
              proposal.services = services;
            }
          }
          return proposal;
        })
      );

      return this.transformClientData(proposalsWithServices);
    } catch (error) {
      console.error('❌ Erro no findAll:', error);
      throw error;
    }
  }

  /**
   * Buscar proposta por ID com serviços
   */
  async findById(id) {
    try {
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          id, proposal_number, client_id, type, status, total_value,
          unique_link, converted_to_contract_id, created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (proposalError) {
        if (proposalError.code === 'PGRST116') return null;
        console.error('❌ Erro ao buscar proposta por ID:', proposalError);
        throw proposalError;
      }

      // Buscar serviços da proposta
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, unit_value, total_value,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', id);

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços da proposta:', servicesError);
        throw servicesError;
      }

      proposal.services = services || [];
      return proposal ? this.transformClientData([proposal])[0] : null;
    } catch (error) {
      console.error('❌ Erro no findById:', error);
      throw error;
    }
  }

  /**
   * Atualizar proposta
   */
  async update(id, proposalData, userId) {
    try {
      const { services, type, status, client_id } = proposalData;

      // Preparar dados para atualização
      const updateData = {};

      if (type !== undefined) updateData.type = type;
      if (status !== undefined) updateData.status = status;
      if (client_id !== undefined) updateData.client_id = client_id;

      // Atualizar dados básicos da proposta
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (proposalError) {
        console.error('❌ Erro ao atualizar proposta:', proposalError);
        throw proposalError;
      }

      // Se serviços foram fornecidos, atualizar
      if (services) {
        // Remover serviços existentes
        await supabase
          .from('proposal_services')
          .delete()
          .eq('proposal_id', id);

        // Adicionar novos serviços
        if (services.length > 0) {
          const servicesForInsert = services.map((service) => ({
            proposal_id: id,
            service_id: service.service_id,
            unit_value: service.unit_value || 0,
            total_value: service.total_value || service.unit_value || 0
          }));

          const { error: servicesError } = await supabase
            .from('proposal_services')
            .insert(servicesForInsert);

          if (servicesError) {
            console.error('❌ Erro ao atualizar serviços da proposta:', servicesError);
            throw servicesError;
          }
        }

        // Recalcular valor total
        await this.recalculateTotal(id);
      }

      return await this.findById(id);
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  /**
   * Alterar status da proposta
   */
  async updateStatus(id, status, userId) {
    try {
      const validStatuses = ['draft', 'sent', 'signed', 'rejected', 'expired', 'converted', 'contraproposta'];

      if (!validStatuses.includes(status)) {
        throw new Error(`Status inválido. Use: ${validStatuses.join(', ')}`);
      }

      const updateData = { status };

      const { data, error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar status da proposta:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no updateStatus:', error);
      throw error;
    }
  }

  /**
   * Atualizar ID do contrato convertido
   */
  async updateConvertedContract(id, contractId) {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .update({ converted_to_contract_id: contractId })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar contrato convertido:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no updateConvertedContract:', error);
      throw error;
    }
  }

  /**
   * Recalcular valor total da proposta
   */
  async recalculateTotal(proposalId) {
    try {
      // Calcular a soma dos serviços
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select('unit_value, total_value')
        .eq('proposal_id', proposalId);

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços para recálculo:', servicesError);
        throw servicesError;
      }

      const totalValue = (services || []).reduce((total, item) => {
        // Use total_value directly since it's already calculated
        return total + (item.total_value || 0);
      }, 0);

      const { error: updateError } = await supabase
        .from('proposals')
        .update({ total_value: totalValue })
        .eq('id', proposalId);

      if (updateError) {
        console.error('❌ Erro ao atualizar valor total:', updateError);
        throw updateError;
      }

      return totalValue;
    } catch (error) {
      console.error('❌ Erro no recalculateTotal:', error);
      throw error;
    }
  }

  /**
   * Excluir proposta permanentemente (hard delete)
   */
  async softDelete(id, userId) {
    try {
      console.log('🗑️ Iniciando exclusão permanente da proposta:', id);

      // Primeiro, excluir registros dependentes em cascade
      
      // 1. Excluir logs de acesso da proposta
      console.log('🗑️ Excluindo logs de acesso...');
      const { error: accessLogsError } = await supabase
        .from('proposal_access_logs')
        .delete()
        .eq('proposal_id', id);

      if (accessLogsError) {
        console.error('❌ Erro ao excluir logs de acesso:', accessLogsError);
        // Continuar mesmo se não existir a tabela ou logs
      } else {
      }

      // 2. Excluir serviços da proposta
      console.log('🗑️ Excluindo serviços da proposta...');
      const { error: servicesError } = await supabase
        .from('proposal_services')
        .delete()
        .eq('proposal_id', id);

      if (servicesError) {
        console.error('❌ Erro ao excluir serviços da proposta:', servicesError);
        throw servicesError;
      } else {
      }

      // 3. Finalmente, excluir a proposta principal
      console.log('🗑️ Excluindo proposta principal...');
      const { data, error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao excluir proposta principal:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro na exclusão permanente:', error);
      throw error;
    }
  }

  /**
   * Duplicar proposta
   */
  async duplicate(id, duplicateOptions = {}, userId) {
    try {
      const originalProposal = await this.findById(id);
      if (!originalProposal) {
        throw new Error('Proposta não encontrada');
      }

      console.log('📋 Duplicando proposta:', originalProposal.proposal_number);
      console.log('📋 Opções de duplicação:', duplicateOptions);

      // Preparar dados da nova proposta
      const newProposalData = {
        client_id: duplicateOptions.client_id || originalProposal.client_id,
        type: duplicateOptions.type || originalProposal.type,
        services: []
      };

      // Duplicar serviços se solicitado (padrão é true)
      if (duplicateOptions.duplicate_services !== false && originalProposal.services) {
        newProposalData.services = originalProposal.services.map(service => ({
          service_id: service.service_id || service.id,
          unit_value: service.unit_value,
          total_value: service.total_value
        }));
      }

      console.log('📋 Dados da nova proposta:', newProposalData);

      // Criar a nova proposta
      const newProposal = await this.create(newProposalData, userId);

      // Duplicar termos e condições se solicitado
      if (duplicateOptions.duplicate_terms !== false) {
        // Buscar termos da proposta original
        const { data: originalTerms, error: termsError } = await supabase
          .from('proposal_terms')
          .select('term_number, term_title, term_description')
          .eq('proposal_id', id)
          .order('term_number');

        if (!termsError && originalTerms && originalTerms.length > 0) {
          const newTerms = originalTerms.map(term => ({
            proposal_id: newProposal.id,
            term_number: term.term_number,
            term_title: term.term_title,
            term_description: term.term_description
          }));

          const { error: insertTermsError } = await supabase
            .from('proposal_terms')
            .insert(newTerms);

          if (insertTermsError) {
            console.error('❌ Erro ao duplicar termos:', insertTermsError);
            // Continuar mesmo se falhar
          } else {
            console.log('✅ Termos duplicados com sucesso');
          }
        }
      }

      return await this.findById(newProposal.id);
    } catch (error) {
      console.error('❌ Erro no duplicate:', error);
      throw error;
    }
  }

  /**
   * Buscar proposta por token público
   */
  async findByPublicToken(token) {
    try {
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          id, proposal_number, client_id, type, status, total_value,
          unique_link, converted_to_contract_id, created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('unique_link', token)
        .single();

      if (proposalError) {
        if (proposalError.code === 'PGRST116') return null;
        console.error('❌ Erro ao buscar proposta por token:', proposalError);
        throw proposalError;
      }

      // Verificar se a proposta está expirada pelo status
      if (proposal.status === 'expired') {
        return null;
      }

      // Buscar serviços da proposta
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, unit_value, total_value,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposal.id);

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços da proposta:', servicesError);
        throw servicesError;
      }

      proposal.services = services || [];
      return proposal ? this.transformClientData([proposal])[0] : null;
    } catch (error) {
      console.error('❌ Erro no findByPublicToken:', error);
      throw error;
    }
  }

  /**
   * Estatísticas das propostas
   */
  async getStats() {
    try {
      const { data: proposals, error } = await supabase
        .from('proposals')
        .select('id, status, total_value, created_at');

      if (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        throw error;
      }

      const total = proposals?.length || 0;
      const byStatus = {
        draft: 0,
        sent: 0,
        signed: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        converted: 0,
        contraproposta: 0
      };

      let totalValue = 0;
      let acceptedValue = 0;
      let sentValue = 0;
      let expired = 0;

      (proposals || []).forEach(proposal => {
        byStatus[proposal.status] = (byStatus[proposal.status] || 0) + 1;
        totalValue += proposal.total_value || 0;

        if (proposal.status === 'signed' || proposal.status === 'accepted' || proposal.status === 'converted') {
          acceptedValue += proposal.total_value || 0;
        }

        if (proposal.status === 'sent') {
          sentValue += proposal.total_value || 0;
        }

        if (proposal.status === 'expired') {
          expired++;
        }
      });

      const closedCount = byStatus.signed + byStatus.accepted + byStatus.converted;

      return {
        total,
        byStatus,
        totalValue,
        acceptedValue,
        sentValue,
        expired,
        conversionRate: total > 0 ? ((closedCount / total) * 100).toFixed(2) : 0
      };
    } catch (error) {
      console.error('❌ Erro no getStats:', error);
      throw error;
    }
  }

  /**
   * Registrar visualização da proposta
   */
  async recordView(proposalId, viewData) {
    try {
      // Tentar inserir na tabela proposal_access_logs
      const { error } = await supabase
        .from('proposal_access_logs')
        .insert([{
          proposal_id: proposalId,
          action: 'view',
          ip_address: viewData.ip_address,
          user_agent: viewData.user_agent,
          accessed_at: viewData.viewed_at || new Date()
        }]);

      if (error) {
        console.log('⚠️ Tabela de logs não encontrada, ignorando registro de visualização:', error.message);
        return; // Não lançar erro, apenas continuar
      }

    } catch (error) {
      console.log('⚠️ Erro ao registrar visualização (ignorado):', error.message);
      // Não lançar erro para não quebrar o fluxo
    }
  }

  /**
   * Atualizar seleção de serviços pelo cliente
   */
  async updateServiceSelection(proposalId, selectedServices, clientInfo) {
    try {
      // Buscar serviços atualizados
      const { data: updatedServices, error: fetchError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, unit_value, total_value,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposalId);

      if (fetchError) {
        console.error('❌ Erro ao buscar serviços atualizados:', fetchError);
        throw fetchError;
      }

      return updatedServices || [];
    } catch (error) {
      console.error('❌ Erro no updateServiceSelection:', error);
      throw error;
    }
  }

  /**
   * Buscar proposta por token público com todos os dados necessários
   */
  async findByPublicTokenComplete(token) {
    try {
      console.log('🔍 Buscando proposta com token:', token);

      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          id, proposal_number, client_id, type, status, total_value,
          unique_link, max_installments, converted_to_contract_id, created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('unique_link', token)
        .single();

      if (proposalError) {
        if (proposalError.code === 'PGRST116') {
          console.log('⚠️ Proposta não encontrada com token:', token);
          return null;
        }
        console.error('❌ Erro ao buscar proposta por token:', proposalError);
        throw proposalError;
      }

      // Verificar se a proposta está expirada pelo status
      if (proposal.status === 'expired') {
        console.log('⚠️ Proposta expirada:', proposal.proposal_number);
        return null;
      }

      // Buscar serviços da proposta
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, unit_value, total_value,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposal.id);

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços da proposta:', servicesError);
        throw servicesError;
      }

      proposal.services = services || [];
      return proposal ? this.transformClientData([proposal])[0] : null;
    } catch (error) {
      console.error('❌ Erro no findByPublicTokenComplete:', error);
      throw error;
    }
  }

  /**
   * Buscar visualizações de uma proposta
   */
  async getProposalViews(proposalId) {
    try {
      const { data: views, error } = await supabase
        .from('proposal_views')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('viewed_at', { ascending: false });

      if (error) {
        console.error('❌ Erro ao buscar visualizações:', error);
        throw error;
      }

      return views || [];
    } catch (error) {
      console.error('❌ Erro no getProposalViews:', error);
      throw error;
    }
  }

  /**
   * Buscar propostas aceitas (para conversão em contratos)
   */
  async findAcceptedProposals(filters = {}) {
    try {
      let query = supabase
        .from('proposals')
        .select(`
          id, proposal_number, client_id, total_value,
          created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pj(company_name, trade_name)
          ),
          services:proposal_services(
            id, service_id, unit_value, total_value,
            service:services(id, name, duration_amount, duration_unit, category, description)
          )
        `)
        .eq('status', 'signed')
        .order('updated_at', { ascending: false });

      // Aplicar filtros adicionais
      if (filters.client_id) {
        query = query.eq('client_id', filters.client_id);
      }

      if (filters.start_date) {
        query = query.gte('updated_at', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('updated_at', filters.end_date);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar propostas aceitas:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Erro no findAcceptedProposals:', error);
      throw error;
    }
  }

  /**
   * Atualizar proposta com dados da assinatura do cliente
   */
  async signProposal(proposalId, signatureData, isCounterproposal = false, selectedServices = null) {
    try {
      console.log('🔍 signProposal - dados recebidos:', { proposalId, isCounterproposal });

      // Determinar o status baseado se é contraproposta ou não
      const status = isCounterproposal ? 'contraproposta' : 'signed';

      const updateData = { status };

      // Atualizar total_value com o valor final se fornecido
      if (signatureData.final_value && signatureData.final_value > 0) {
        updateData.total_value = signatureData.final_value;
      }

      const { error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId);

      if (error) {
        console.error('❌ Erro ao assinar proposta:', error);
        throw error;
      }

      return await this.findById(proposalId);
    } catch (error) {
      console.error('❌ Erro no signProposal:', error);
      throw error;
    }
  }

  /**
   * Regenerar token público da proposta
   */
  async regenerateToken(proposalId, userId) {
    try {
      const newToken = generateProposalToken();

      const { error } = await supabase
        .from('proposals')
        .update({ unique_link: newToken })
        .eq('id', proposalId);

      if (error) {
        console.error('❌ Erro ao regenerar token:', error);
        throw error;
      }

      return { unique_link: newToken };
    } catch (error) {
      console.error('❌ Erro no regenerateToken:', error);
      throw error;
    }
  }

  /**
   * Atualizar propostas sem unique_link
   */
  async updateProposalsWithoutLinks() {
    try {
      // Buscar propostas sem unique_link
      const { data: proposals, error: findError } = await supabase
        .from('proposals')
        .select('id, proposal_number')
        .is('unique_link', null);

      if (findError) {
        console.error('❌ Erro ao buscar propostas:', findError);
        throw findError;
      }

      if (proposals && proposals.length > 0) {
        for (const proposal of proposals) {
          const newToken = generateProposalToken();

          const { error: updateError } = await supabase
            .from('proposals')
            .update({
              unique_link: newToken
            })
            .eq('id', proposal.id);

          if (updateError) {
            console.error(`❌ Erro ao atualizar proposta ${proposal.proposal_number}:`, updateError);
          } else {
          }
        }
      }

      return proposals?.length || 0;
    } catch (error) {
      console.error('❌ Erro no updateProposalsWithoutLinks:', error);
      throw error;
    }
  }

  /**
   * Preparar proposta para envio (adicionar dados do cliente e gerar token se necessário)
   */
  async prepareForSending(proposalId, clientData, userId) {
    try {
      // Gerar token público se não existir
      const currentProposal = await this.findById(proposalId);
      if (!currentProposal.unique_link) {
        const { error } = await supabase
          .from('proposals')
          .update({ unique_link: generateProposalToken() })
          .eq('id', proposalId);

        if (error) {
          console.error('❌ Erro ao preparar proposta:', error);
          throw error;
        }
      }

      return await this.findById(proposalId);
    } catch (error) {
      console.error('❌ Erro no prepareForSending:', error);
      throw error;
    }
  }
}

module.exports = new ProposalModel();