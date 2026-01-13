const { supabase } = require('../config/database');
const { generateProposalToken } = require('../utils/tokenGenerator');

class ProposalModel {
  /**
   * Helper function to transform client data and add name property
   */
  transformClientData(proposals) {
    return proposals.map(proposal => {
      if (proposal.client) {
        // Determine if client is PF or PJ and add name property
        // Note: clients_pf and clients_pj are objects (1:1 relation), not arrays
        const isPF = proposal.client.clients_pf && proposal.client.clients_pf.full_name;
        const isPJ = proposal.client.clients_pj && proposal.client.clients_pj.company_name;
        
        if (isPF) {
          proposal.client.name = proposal.client.clients_pf.full_name;
          proposal.client.type = 'PF';
          proposal.client.person = proposal.client.clients_pf;
        } else if (isPJ) {
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
      type = 'Full', // Tipo da proposta: Full, Pontual, Individual
      max_installments = 12,
      vista_discount_percentage = 6, // Desconto padrão para pagamento à vista
      prazo_discount_percentage = 0, // Desconto padrão para pagamento à prazo
      vista_discount_value = 0, // Valor absoluto de desconto para pagamento à vista
      prazo_discount_value = 0, // Valor absoluto de desconto para pagamento à prazo
      solicitante_name, // Nome do solicitante
      solicitante_email, // Email do solicitante
      source, // Fonte da proposta: Indicação, Site, Já era cliente, etc.
      valor_global = null, // Valor global fixo da proposta
      usar_valor_global = false, // Se true, usa valor_global. Se false, usa soma dos serviços
      services // Array de objetos: [{ service_id, unit_value }]
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
          type, // Tipo da proposta: Full, Pontual, Individual
          proposal_number,
          status: 'draft', // draft, sent, signed, rejected, expired, converted
          total_value: 0, // Será calculado depois
          valor_global: valor_global || null, // Valor global fixo
          usar_valor_global: usar_valor_global || false, // Flag para usar valor global
          unique_link,
          max_installments: max_installments,
          vista_discount_percentage: vista_discount_percentage,
          prazo_discount_percentage: prazo_discount_percentage,
          vista_discount_value: vista_discount_value,
          prazo_discount_value: prazo_discount_value,
          solicitante_name: solicitante_name || null,
          solicitante_email: solicitante_email || null,
          source: source || null,
          created_by: userId,
          updated_by: userId
        }])
        .select('*')
        .single();

      if (proposalError) {
        console.error('❌ Erro ao criar proposta na tabela proposals:', proposalError);
        throw proposalError;
      }

      // Adicionar serviços à proposta
      if (services && services.length > 0) {
        // Fetch service details to populate service_name and service_description
        const servicesWithDetails = await Promise.all(
          services.map(async (service, index) => {
            const { data: serviceData, error } = await supabase
              .from('services')
              .select('name, description, category')
              .eq('id', service.service_id)
              .single();

            if (error) {
              console.error(`❌ Erro ao buscar detalhes do serviço ${service.service_id}:`, error);
              throw error;
            }

            // Para serviços de Recrutamento & Seleção, use valor 0 se não fornecido
            const isRecruitment = serviceData.category === 'Recrutamento & Seleção';
            const unitValue = isRecruitment && !service.unit_value ? 0 : (service.unit_value || 0);
            const totalValue = isRecruitment && !service.total_value ? 0 : (service.total_value || unitValue);

            return {
              proposal_id: proposal.id,
              service_id: service.service_id,
              service_name: serviceData.name,
              service_description: serviceData.description || '',
              unit_value: unitValue,
              total_value: totalValue,
              sort_order: service.sort_order !== undefined ? service.sort_order : index,
              recruitmentPercentages: service.recruitmentPercentages,
              isRecruitment
            };
          })
        );

        console.log('🔧 Attempting to insert proposal services:', JSON.stringify(servicesWithDetails, null, 2));

        // Inserir serviços (mantendo sort_order)
        const servicesForInsert = servicesWithDetails.map(({ recruitmentPercentages, isRecruitment, ...serviceData }) => serviceData);

        const { data: insertedServices, error: servicesError } = await supabase
          .from('proposal_services')
          .insert(servicesForInsert)
          .select('*');

        if (servicesError) {
          // Rollback - excluir proposta criada
          await supabase.from('proposals').delete().eq('id', proposal.id);
          console.error('❌ Erro ao adicionar serviços à proposta na tabela proposal_services:', servicesError);
          throw servicesError;
        }

        // Inserir porcentagens de recrutamento para serviços de Recrutamento & Seleção
        for (let i = 0; i < servicesWithDetails.length; i++) {
          const serviceDetail = servicesWithDetails[i];
          const insertedService = insertedServices[i];

          console.log(`🔍 Verificando serviço ${i}:`, {
            isRecruitment: serviceDetail.isRecruitment,
            hasPercentages: !!serviceDetail.recruitmentPercentages,
            hasInsertedService: !!insertedService,
            percentages: serviceDetail.recruitmentPercentages
          });

          if (serviceDetail.isRecruitment && serviceDetail.recruitmentPercentages && insertedService) {
            const percentageData = {
              proposal_service_id: insertedService.id,
              administrativo_gestao: serviceDetail.recruitmentPercentages.administrativo_gestao || 100,
              comercial: serviceDetail.recruitmentPercentages.comercial || 100,
              operacional: serviceDetail.recruitmentPercentages.operacional || 100,
              estagio_jovem: serviceDetail.recruitmentPercentages.estagio_jovem || 100
            };

            console.log('📊 Inserindo porcentagens de recrutamento:', percentageData);

            const { error: percentError } = await supabase
              .from('proposal_recruitment_percentages')
              .insert(percentageData);

            if (percentError) {
              console.error('❌ Erro ao inserir porcentagens de recrutamento:', percentError);
              // Continuar mesmo com erro, pois as tabelas podem não existir ainda
            } else {
              console.log('✅ Porcentagens de recrutamento inseridas com sucesso para proposal_service_id:', insertedService.id);
            }
          }
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
          id, proposal_number, client_id, type, status, total_value, unique_link, signature_data, converted_to_contract_id,
          signer_name, signer_email, signer_phone, signer_document, signer_observations,
          payment_type, payment_method, installments, final_value, discount_applied, max_installments,
          vista_discount_percentage, prazo_discount_percentage, vista_discount_value, prazo_discount_value,
          solicitante_name, solicitante_email, source,
          valor_global, usar_valor_global,
          created_at, updated_at,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pf(full_name),
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
              .select('id, service_id, service_name, total_value, selected_by_client')
              .eq('proposal_id', proposal.id)
              .order('sort_order', { ascending: true });

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
          unique_link, signature_data,
          converted_to_contract_id, created_at, updated_at,
          signer_name, signer_email, signer_phone, signer_document, signer_observations,
          payment_type, payment_method, installments, final_value, discount_applied, max_installments,
          vista_discount_percentage, prazo_discount_percentage, vista_discount_value, prazo_discount_value,
          solicitante_name, solicitante_email, source,
          valor_global, usar_valor_global,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pf(full_name),
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
          id, service_id, service_name, service_description, unit_value, total_value, sort_order,
          selected_by_client, client_notes,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', id)
        .order('sort_order', { ascending: true });

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços da proposta:', servicesError);
        throw servicesError;
      }

      // Buscar percentuais de recrutamento para cada serviço
      if (services && services.length > 0) {
        console.log('📊 [Model] Buscando percentuais de recrutamento para os serviços da proposta...');
        for (const service of services) {
          const { data: percentages } = await supabase
            .from('proposal_recruitment_percentages')
            .select('administrativo_gestao, comercial, operacional, estagio_jovem')
            .eq('proposal_service_id', service.id)
            .maybeSingle();

          if (percentages) {
            service.recruitmentPercentages = percentages;
            console.log(`✅ [Model] Percentuais carregados para proposal_service_id: ${service.id}`);
          }
        }
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
      const {
        services,
        type,
        status,
        client_id,
        max_installments,
        vista_discount_percentage,
        prazo_discount_percentage,
        vista_discount_value,
        prazo_discount_value,
        solicitante_name,
        solicitante_email,
        source,
        valor_global,
        usar_valor_global
      } = proposalData;

      // Preparar dados para atualização
      const updateData = {
        updated_by: userId
      };

      if (type !== undefined) updateData.type = type;
      if (status !== undefined) updateData.status = status;
      if (client_id !== undefined) updateData.client_id = client_id;
      if (max_installments !== undefined) updateData.max_installments = max_installments;
      if (vista_discount_percentage !== undefined) updateData.vista_discount_percentage = vista_discount_percentage;
      if (prazo_discount_percentage !== undefined) updateData.prazo_discount_percentage = prazo_discount_percentage;
      if (vista_discount_value !== undefined) updateData.vista_discount_value = vista_discount_value;
      if (prazo_discount_value !== undefined) updateData.prazo_discount_value = prazo_discount_value;
      if (solicitante_name !== undefined) updateData.solicitante_name = solicitante_name;
      if (solicitante_email !== undefined) updateData.solicitante_email = solicitante_email;
      if (source !== undefined) updateData.source = source;
      if (valor_global !== undefined) updateData.valor_global = valor_global;
      if (usar_valor_global !== undefined) updateData.usar_valor_global = usar_valor_global;

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
          const servicesWithDetails = await Promise.all(
            services.map(async (service, index) => {
              const { data: serviceData, error } = await supabase
                .from('services')
                .select('name, description')
                .eq('id', service.service_id)
                .single();

              if (error) {
                console.error(`❌ Erro ao buscar detalhes do serviço ${service.service_id}:`, error);
                throw error;
              }

              return {
                proposal_id: id,
                service_id: service.service_id,
                service_name: serviceData.name,
                service_description: serviceData.description || '',
                unit_value: service.unit_value,
                total_value: service.unit_value,
                sort_order: service.sort_order !== undefined ? service.sort_order : index
              };
            })
          );

          const { error: servicesError } = await supabase
            .from('proposal_services')
            .insert(servicesWithDetails);

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

      // Se está enviando a proposta, gerar token público
      const updateData = {
        status,
        updated_by: userId
      };

      // Não precisamos definir sent_at pois a coluna não existe na tabela
      // O timestamp de quando foi enviada pode ser inferido do updated_at quando status = 'sent'

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
      // Primeiro, buscar a proposta para verificar se usa valor global
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('usar_valor_global, valor_global')
        .eq('id', proposalId)
        .single();

      if (proposalError) {
        console.error('❌ Erro ao buscar proposta para recálculo:', proposalError);
        throw proposalError;
      }

      // Se usar valor global, atualizar com esse valor
      if (proposal.usar_valor_global && proposal.valor_global !== null) {
        const { error: updateError } = await supabase
          .from('proposals')
          .update({ total_value: proposal.valor_global })
          .eq('id', proposalId);

        if (updateError) {
          console.error('❌ Erro ao atualizar valor total com valor global:', updateError);
          throw updateError;
        }

        return proposal.valor_global;
      }

      // Caso contrário, calcular a soma dos serviços
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
        max_installments: duplicateOptions.max_installments !== undefined ? duplicateOptions.max_installments : originalProposal.max_installments,
        vista_discount_percentage: duplicateOptions.vista_discount_percentage !== undefined ? duplicateOptions.vista_discount_percentage : originalProposal.vista_discount_percentage,
        prazo_discount_percentage: duplicateOptions.prazo_discount_percentage !== undefined ? duplicateOptions.prazo_discount_percentage : originalProposal.prazo_discount_percentage,
        solicitante_name: duplicateOptions.solicitante_name || originalProposal.solicitante_name,
        solicitante_email: duplicateOptions.solicitante_email || originalProposal.solicitante_email,
        source: duplicateOptions.source || originalProposal.source,
        usar_valor_global: duplicateOptions.usar_valor_global !== undefined ? duplicateOptions.usar_valor_global : originalProposal.usar_valor_global,
        valor_global: duplicateOptions.valor_global !== undefined ? duplicateOptions.valor_global : originalProposal.valor_global,
        services: []
      };

      // Duplicar serviços se solicitado (padrão é true)
      if (duplicateOptions.duplicate_services !== false) {
        // Buscar porcentagens de recrutamento se existirem
        const servicesWithPercentages = [];

        for (const service of originalProposal.services) {
          const serviceData = {
            service_id: service.service_id || service.id,
            unit_value: service.unit_value,
            total_value: service.total_value,
            sort_order: service.sort_order
          };

          // Se for serviço de recrutamento e duplicate_recruitment_percentages for true
          if (service.service?.category === 'Recrutamento & Seleção' && duplicateOptions.duplicate_recruitment_percentages !== false) {
            // Buscar porcentagens de recrutamento do serviço original
            const { data: percentages, error: percentError } = await supabase
              .from('proposal_recruitment_percentages')
              .select('administrativo_gestao, comercial, operacional, estagio_jovem')
              .eq('proposal_service_id', service.id)
              .maybeSingle();

            if (!percentError && percentages) {
              serviceData.recruitmentPercentages = percentages;
              console.log('📊 Porcentagens encontradas para serviço:', service.id, percentages);
            }
          }

          servicesWithPercentages.push(serviceData);
        }

        newProposalData.services = servicesWithPercentages;
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
          unique_link,
          converted_to_contract_id, created_at, updated_at,
          signer_name, signer_email, signer_phone, signer_document, signer_observations,
          payment_type, payment_method, installments, final_value, discount_applied, max_installments,
          vista_discount_percentage, prazo_discount_percentage, vista_discount_value, prazo_discount_value,
          solicitante_name, solicitante_email, source,
          valor_global, usar_valor_global,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pf(full_name),
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
          id, service_id, service_name, service_description, unit_value, total_value, sort_order,
          selected_by_client, client_notes,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposal.id)
        .order('sort_order', { ascending: true });

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
      // Atualizar cada serviço
      const updatePromises = selectedServices.map(async (serviceUpdate) => {
        const { error } = await supabase
          .from('proposal_services')
          .update({
            selected_by_client: serviceUpdate.selected,
            client_notes: serviceUpdate.client_notes || null
          })
          .eq('proposal_id', proposalId)
          .eq('service_id', serviceUpdate.service_id);

        if (error) {
          console.error('❌ Erro ao atualizar serviço:', error);
          throw error;
        }
      });

      await Promise.all(updatePromises);

      // Buscar serviços atualizados
      const { data: updatedServices, error: fetchError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, unit_value, total_value, selected_by_client, client_notes,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposalId)
        .order('created_at');

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
          unique_link, max_installments,
          signature_data, converted_to_contract_id, created_at, updated_at,
          signer_name, signer_email, signer_phone, signer_document, signer_observations,
          payment_type, payment_method, installments, final_value, discount_applied,
          vista_discount_percentage, prazo_discount_percentage, vista_discount_value, prazo_discount_value,
          solicitante_name, solicitante_email, source,
          valor_global, usar_valor_global,
          client:clients(
            id, email, phone, street, number, complement,
            neighborhood, city, state, zipcode,
            clients_pf(full_name),
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

      // Buscar serviços da proposta com seleção do cliente
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select(`
          id, service_id, service_name, service_description, unit_value, total_value, selected_by_client, client_notes, sort_order,
          service:services(id, name, duration_amount, duration_unit, category, description)
        `)
        .eq('proposal_id', proposal.id)
        .order('sort_order', { ascending: true });

      if (servicesError) {
        console.error('❌ Erro ao buscar serviços da proposta:', servicesError);
        throw servicesError;
      }

      // Buscar porcentagens de recrutamento para cada serviço
      if (services && services.length > 0) {
        for (let service of services) {
          const { data: percentages, error: percentError } = await supabase
            .from('proposal_recruitment_percentages')
            .select('administrativo_gestao, comercial, operacional, estagio_jovem')
            .eq('proposal_service_id', service.id)
            .maybeSingle();

          if (!percentError && percentages) {
            service.recruitmentPercentages = percentages;
          }
        }
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
            clients_pf(full_name),
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

      // Filtrar apenas serviços selecionados pelo cliente
      const filteredData = (data || []).map(proposal => ({
        ...proposal,
        services: proposal.services.filter(s => s.selected_by_client)
      }));

      return filteredData;
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
      console.log('🔍 signProposal - dados recebidos:', {
        proposalId,
        isCounterproposal,
        signatureData: {
          ...signatureData,
          signature_data: signatureData.signature_data ? '[DATA_PRESENTE]' : '[NULO]'
        }
      });

      // Determinar o status baseado se é contraproposta ou não
      const status = isCounterproposal ? 'contraproposta' : 'signed';

      // Se pagamento à vista, atualizar o total_value com desconto
      const updateData = {
        status: status,
        signature_data: signatureData.signature_data,
        signer_name: signatureData.signer_name,
        signer_email: signatureData.signer_email,
        signer_phone: signatureData.signer_phone,
        signer_document: signatureData.signer_document,
        signer_observations: signatureData.signer_observations,
        payment_type: signatureData.payment_type,
        payment_method: signatureData.payment_method,
        // Using single payment method only
        installments: signatureData.installments,
        final_value: signatureData.final_value,
        discount_applied: signatureData.discount_applied
      };

      // Adicionar informação sobre contraproposta nas observações temporariamente
      if (isCounterproposal) {
        const currentObservations = updateData.signer_observations || '';
        updateData.signer_observations = currentObservations + (currentObservations ? '\n\n' : '') + '[CONTRAPROPOSTA] - Nem todos os serviços foram selecionados pelo cliente.';
      }

      // Atualizar total_value com o valor final (com desconto se à vista)
      if (signatureData.payment_type === 'vista' && signatureData.final_value && signatureData.final_value > 0) {
        updateData.total_value = signatureData.final_value;
        console.log('💰 Atualizando total_value para pagamento à vista:', signatureData.final_value);
      }

      const { error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId);

      if (error) {
        console.error('❌ Erro ao assinar proposta:', error);
        throw error;
      }

      // Atualizar serviços selecionados (tanto para proposta normal quanto contraproposta)
      if (selectedServices && Array.isArray(selectedServices)) {
        try {
          console.log('🔄 Atualizando serviços selecionados:', selectedServices);

          // Atualizar cada serviço com a informação de seleção
          for (const serviceData of selectedServices) {
            const { error: serviceUpdateError } = await supabase
              .from('proposal_services')
              .update({
                selected_by_client: serviceData.selected,
                client_notes: serviceData.client_notes || null
              })
              .match({
                proposal_id: proposalId,
                service_id: serviceData.service_id
              });

            if (serviceUpdateError) {
              console.error('❌ Erro ao atualizar serviço:', serviceUpdateError);
              // Não falhar a assinatura por erro nos serviços
            }
          }

          console.log('✅ Serviços selecionados atualizados com sucesso');
        } catch (serviceError) {
          console.error('❌ Erro ao atualizar serviços selecionados:', serviceError);
          // Não falhar a assinatura por erro nos serviços
        }
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
        .update({
          unique_link: newToken,
          updated_by: userId
        })
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
      const updateData = {
        updated_by: userId
      };

      // Gerar token público se não existir
      const currentProposal = await this.findById(proposalId);
      if (!currentProposal.unique_link) {
        updateData.unique_link = generateProposalToken();
      }

      const { error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId);

      if (error) {
        console.error('❌ Erro ao preparar proposta:', error);
        throw error;
      }

      return await this.findById(proposalId);
    } catch (error) {
      console.error('❌ Erro no prepareForSending:', error);
      throw error;
    }
  }
}

module.exports = new ProposalModel();