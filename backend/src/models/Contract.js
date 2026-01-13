const { supabase } = require('../config/database');
const ContractInstallment = require('./ContractInstallment');
const ContractPaymentMethod = require('./ContractPaymentMethod');

class ContractModel {
  /**
   * Consolida serviços duplicados (mesmo service_id) em um único registro
   * com quantidade e valor total apropriados
   */
  consolidateDuplicateServices(services) {
    console.log('🔧 [Model] Iniciando consolidação de serviços duplicados...');
    console.log('📥 [Model] Serviços recebidos:', JSON.stringify(services, null, 2));
    
    if (!services || services.length === 0) {
      console.log('⚠️ [Model] Nenhum serviço para consolidar');
      return [];
    }
    
    const serviceMap = new Map();
    
    services.forEach((service, index) => {
      console.log(`🔍 [Model] Processando serviço ${index + 1}:`, {
        service_id: service.service_id,
        unit_value: service.unit_value,
        existing: serviceMap.has(service.service_id)
      });
      
      const serviceId = service.service_id;
      
      // Validar se service_id existe
      if (!serviceId) {
        console.warn(`⚠️ [Model] Serviço sem service_id encontrado no índice ${index}:`, service);
        return; // Skip this service
      }
      
      // Validar se unit_value é um número válido
      const unitValue = parseFloat(service.unit_value) || 0;
      
      if (serviceMap.has(serviceId)) {
        // Serviço já existe, incrementar quantidade e somar valores
        const existing = serviceMap.get(serviceId);
        existing.quantity += 1;
        existing.total_value += unitValue;
        // Usar a média dos unit_values ou manter o menor (sua escolha)
        existing.unit_value = Math.min(existing.unit_value, unitValue);
        
        console.log(`📊 [Model] Serviço consolidado - ID: ${serviceId}, Nova quantidade: ${existing.quantity}, Valor total: ${existing.total_value}`);
      } else {
        // Novo serviço
        serviceMap.set(serviceId, {
          service_id: serviceId,
          unit_value: unitValue,
          total_value: unitValue,
          quantity: 1,
          status: service.status || 'not_started'
        });
        
        console.log(`✅ [Model] Novo serviço adicionado - ID: ${serviceId}, Valor: ${unitValue}`);
      }
    });
    
    const consolidated = Array.from(serviceMap.values());
    console.log('📤 [Model] Serviços consolidados:', JSON.stringify(consolidated, null, 2));
    
    return consolidated;
  }

  transformClientData(contracts) {
    return contracts.map(contract => {
      if (contract.client) {
        // All clients are now PJ only
        const isPJ = contract.client.clients_pj && (contract.client.clients_pj.company_name || contract.client.clients_pj.trade_name);

        if (isPJ) {
          const pjName = contract.client.clients_pj.trade_name || contract.client.clients_pj.company_name;
          contract.client.name = pjName;
          contract.client.document = contract.client.clients_pj.cnpj || null;
          contract.client.type = 'PJ';
        } else {
          contract.client.name = 'Cliente sem nome';
          contract.client.document = null;
          contract.client.type = null;
        }

        // Ensure email is available - use existing email field
        if (!contract.client.email) {
          contract.client.email = null;
        }
      } else {
        console.log('❌ No client object found for contract:', contract.contract_number);
      }
      return contract;
    });
  }

  async create(contractData, userId) {

    const {
      contract_number,
      client_id,
      type,
      start_date,
      end_date,
      services,
      total_value,
      notes,
      assigned_users = [],
      payment_method,
      first_installment_date,
      payment_status = 'pendente',
      installment_count = 1,
      installments = [],
      barter_type,
      barter_value,
      barter_percentage,
      secondary_payment_method
    } = contractData;

    // Calcular total value diretamente dos serviços recebidos FORA do loop
    let calculatedTotalValue = 0;

    if (services && services.length > 0) {
      calculatedTotalValue = services.reduce((sum, s) => sum + (parseFloat(s.unit_value) || 0), 0);
    }

    const finalTotalValue = total_value !== undefined ? total_value : calculatedTotalValue;

    // Implementar retry para resolver race condition em números de contrato
    let finalContract = null;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        console.log(`🔢 [Model] Tentativa ${attempt + 1} - Gerando/verificando número do contrato...`);

        // Generate contract number if not provided
        const finalContractNumber = contract_number || await this.generateContractNumber();
        console.log('📝 [Model] Número do contrato:', finalContractNumber);
        
        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .insert([{
            contract_number: finalContractNumber, client_id, type, start_date,
            end_date: end_date || null,
            status: 'active',
            total_value: finalTotalValue,
            notes: notes || null,
            payment_method: payment_method || null,
            payment_status: payment_status,
            installment_count: installment_count,
            barter_type: barter_type || null,
            barter_value: barter_value || null
          }])
          .select('*').single();

        if (contractError) {
          // Se é erro de constraint de número duplicado, tentar novamente
          if (contractError.code === '23505' && contractError.constraint === 'contracts_contract_number_key') {
            console.warn(`⚠️ [Model] Número ${finalContractNumber} já existe na tentativa ${attempt + 1}, gerando novo número...`);
            if (attempt === maxAttempts - 1) {
              console.error('❌ [Model] Excedido número máximo de tentativas para gerar número único');
              throw new Error('Não foi possível gerar número único de contrato');
            }
            // Tentar novamente com novo número
            continue;
          }
          // Outros erros, falhar imediatamente
          throw contractError;
        }

        finalContract = contract;
        console.log('✅ [Model] Contrato criado com sucesso:', contract.id, contract.contract_number);
        break; // Sair do loop se bem-sucedido
        
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'contracts_contract_number_key') {
          console.warn(`⚠️ [Model] Race condition na tentativa ${attempt + 1}`);
          if (attempt === maxAttempts - 1) {
            throw new Error('Número máximo de tentativas excedido para criar contrato');
          }
          // Tentar novamente
          continue;
        }
        // Outros erros, re-throw imediatamente
        throw error;
      }
    }

    const contract = finalContract;

    try {
      // Buscar TODOS os serviços internos e adicionar automaticamente
      const { data: internalServices, error: internalServicesError } = await supabase
        .from('services')
        .select('id, name')
        .eq('category', 'Interno')
        .eq('is_active', true);

      if (internalServices && !internalServicesError && internalServices.length > 0) {
        console.log(`📝 [Model] Adicionando ${internalServices.length} serviços internos automaticamente...`);
        
        const internalContractServices = internalServices.map(service => ({
          contract_id: contract.id,
          service_id: service.id,
          unit_value: 0,
          total_value: 0,
          status: 'not_started'
        }));

        const { error: internalInsertError } = await supabase
          .from('contract_services')
          .insert(internalContractServices);

        if (internalInsertError) {
          console.warn('⚠️ [Model] Erro ao inserir serviços internos:', internalInsertError);
        } else {
          console.log(`✅ [Model] ${internalServices.length} serviços internos adicionados com sucesso`);
          internalServices.forEach((service, index) => {
            console.log(`   ${index + 1}. ${service.name}`);
          });
        }
      } else {
        console.warn('⚠️ [Model] Nenhum serviço interno encontrado - pode precisar executar a migração');
      }

      if (services && services.length > 0) {
        console.log('📝 [Model] Criando registros de contract_services individuais...');

        const contractServices = services.map(service => ({
          contract_id: contract.id,
          service_id: service.service_id,
          unit_value: parseFloat(service.unit_value) || 0,
          total_value: parseFloat(service.unit_value) || 0,
          status: service.status || 'not_started'
        }));

        console.log('📋 [Model] Serviços para inserir:', JSON.stringify(contractServices, null, 2));

        try {
          const { data: insertedServices, error: servicesError } = await supabase
            .from('contract_services')
            .insert(contractServices)
            .select('*');
          
          if (servicesError) {
            console.error('❌ [Model] Erro detalhado ao inserir contract_services:', {
              error: servicesError,
              message: servicesError.message,
              code: servicesError.code,
              details: servicesError.details,
              hint: servicesError.hint,
              contractServices: contractServices
            });
            throw servicesError;
          }
          
          console.log('✅ [Model] Contract_services inseridos com sucesso:');
          insertedServices.forEach((service, index) => {
            console.log(`   ${index + 1}. ID: ${service.id}, Service ID: ${service.service_id}, Valor: ${service.total_value}, Status: ${service.status}`);
          });

          if (insertedServices.length !== contractServices.length) {
            console.warn(`⚠️ [Model] Esperado ${contractServices.length} serviços, inseridos ${insertedServices.length}`);
          }

          // Salvar percentuais de recrutamento para serviços de Recrutamento & Seleção
          console.log('📊 [Model] Verificando se há percentuais de recrutamento para salvar...');
          for (let i = 0; i < services.length; i++) {
            const service = services[i];
            const insertedService = insertedServices[i];

            if (service.recruitmentPercentages && insertedService) {
              console.log(`📊 [Model] Salvando percentuais para contract_service_id: ${insertedService.id}`, service.recruitmentPercentages);

              const { error: percError } = await supabase
                .from('contract_recruitment_percentages')
                .insert([{
                  contract_service_id: insertedService.id,
                  administrativo_gestao: service.recruitmentPercentages.administrativo_gestao || 100,
                  comercial: service.recruitmentPercentages.comercial || 100,
                  operacional: service.recruitmentPercentages.operacional || 100,
                  estagio_jovem: service.recruitmentPercentages.estagio_jovem || 50
                }]);

              if (percError) {
                console.error('❌ [Model] Erro ao salvar percentuais de recrutamento:', percError);
                // Não lançar erro para não bloquear a criação do contrato
              } else {
                console.log(`✅ [Model] Percentuais salvos com sucesso para contract_service_id: ${insertedService.id}`);
              }
            }
          }
        } catch (insertError) {
          console.error('❌ [Model] Erro crítico na inserção de services:', insertError);
          
          // Rollback: deletar o contrato criado se a inserção de serviços falhou
          try {
            console.log('🔄 [Model] Realizando rollback - removendo contrato sem serviços...');
            const { error: deleteError } = await supabase
              .from('contracts')
              .delete()
              .eq('id', contract.id);
            
            if (deleteError) {
              console.error('❌ [Model] Erro no rollback:', deleteError);
            } else {
              console.log('✅ [Model] Rollback concluído - contrato removido');
            }
          } catch (rollbackError) {
            console.error('❌ [Model] Erro crítico no rollback:', rollbackError);
          }
          
          throw insertError;
        }
        
        // Calcular valor da parcela se for parcelado
        const installmentValue = installment_count > 1 ? finalTotalValue / installment_count : null;
        
        // Atualizar apenas o installment_value se necessário
        if (installmentValue !== null) {
          await supabase.from('contracts').update({ 
            installment_value: installmentValue
          }).eq('id', contract.id);
        }

        // Criar parcelas se necessário
        if (installments && installments.length > 0) {
          await ContractInstallment.createInstallments(contract.id, installments);
        }
      }

      const usersToAssign = [{ userId: userId, role: 'owner' }];
      assigned_users.forEach(selectedUserId => {
        if (selectedUserId !== userId) {
          usersToAssign.push({ userId: selectedUserId, role: 'viewer' });
        }
      });

      console.log('👥 [Model] Atribuindo usuários ao contrato:', {
        contractId: contract.id,
        usersToAssign,
        assignedBy: userId
      });

      try {
        const assignmentResult = await this.assignUsers(contract.id, usersToAssign, userId);
        console.log('✅ [Model] Usuários atribuídos com sucesso:', assignmentResult);
      } catch (assignError) {
        console.error('❌ [Model] ERRO CRÍTICO ao atribuir usuários - contrato criado mas sem equipe!', {
          contractId: contract.id,
          error: assignError.message,
          stack: assignError.stack
        });
        // Re-throw para que o erro não seja silencioso
        throw new Error(`Contrato criado mas falha ao atribuir equipe: ${assignError.message}`);
      }

      return await this.findById(contract.id);
    } catch (error) {
      console.error('❌ [Model] Erro detalhado no método create do contrato:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stack: error.stack
      });
      throw error;
    }
  }

  async userHasAccess(contractId, userId) {
    const { data, error } = await supabase
      .from('contract_assignments')
      .select('id')
      .match({
        contract_id: contractId,
        user_id: userId,
        is_active: true
      })
      .single();
    
    return !error && !!data;
  }

  async assignUsers(contractId, usersToAssign, assignedBy) {
    if (!usersToAssign || usersToAssign.length === 0) {
      console.warn('⚠️ [Model] assignUsers chamado com array vazio. Adicionando assignedBy como owner por segurança.');
      // Se o array estiver vazio, pelo menos adicionar quem está atribuindo como owner
      usersToAssign = [{ userId: assignedBy, role: 'owner' }];
    }

    // Primeiro, verificar se existem registros anteriores (incluindo inativos)
    const userIds = usersToAssign.map(u => u.userId);
    const { data: existingAssignments } = await supabase
      .from('contract_assignments')
      .select('user_id')
      .eq('contract_id', contractId)
      .in('user_id', userIds);

    const existingUserIds = existingAssignments ? existingAssignments.map(a => a.user_id) : [];

    // Separar em novos e existentes
    const newAssignments = [];
    const updatePromises = [];

    for (const user of usersToAssign) {
      if (existingUserIds.includes(user.userId)) {
        // Atualizar registro existente
        updatePromises.push(
          supabase
            .from('contract_assignments')
            .update({
              role: user.role || 'viewer',
              assigned_by: assignedBy,
              is_active: true
            })
            .match({
              contract_id: contractId,
              user_id: user.userId
            })
            .select()
        );
      } else {
        // Criar novo registro
        newAssignments.push({
          contract_id: contractId,
          user_id: user.userId,
          role: user.role || 'viewer',
          assigned_by: assignedBy,
          is_active: true
        });
      }
    }

    const results = [];

    // Executar atualizações
    for (const promise of updatePromises) {
      const { data, error } = await promise;
      if (error) {
        console.error('❌ Erro ao atualizar atribuição de usuário:', error);
        throw error;
      }
      if (data) results.push(...data);
    }

    // Inserir novos registros
    if (newAssignments.length > 0) {
      const { data, error } = await supabase
        .from('contract_assignments')
        .insert(newAssignments)
        .select();

      if (error) {
        console.error('❌ Erro ao inserir novas atribuições:', error);
        throw error;
      }
      if (data) results.push(...data);
    }

    return results;
  }

  async findAllForUser(userId, filters = {}) {
    const { data: assignments, error: assignError } = await supabase
      .from('contract_assignments')
      .select('contract_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (assignError) throw assignError;

    const contractIds = assignments.map(a => a.contract_id);
    if (contractIds.length === 0) return [];

    let query = supabase
      .from('contracts')
      .select(`
        id, contract_number, client_id, type, start_date, end_date, status,
        total_value, payment_method, payment_status,
        installment_count, notes, created_at, updated_at,
        client:clients!inner(
          id, email, phone, street, number, complement,
          neighborhood, city, state, zipcode,
          clients_pj(company_name, trade_name, cnpj)
        )
      `)
      .in('id', contractIds)
      .order('created_at', { ascending: false });

    // Aplicar filtros básicos
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.start_date) query = query.gte('start_date', filters.start_date);
    if (filters.end_date) query = query.lte('end_date', filters.end_date);

    const { data, error } = await query;
    if (error) {
      console.error('❌ Erro na query de contratos do usuário:', error);
      throw error;
    }
    
    let contracts = this.transformClientData(data || []);
    
    // Aplicar busca após transformação dos dados (mais confiável)
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase().trim();
      contracts = contracts.filter(contract => {
        return (
          contract.contract_number.toLowerCase().includes(searchTerm) ||
          (contract.client?.name && contract.client.name.toLowerCase().includes(searchTerm))
        );
      });
    }

    // Aplicar filtro de mês e ano com base no tipo de data selecionado
    if ((filters.month || filters.year) && filters.dateType) {
      contracts = contracts.filter(contract => {
        // Determinar qual data usar baseado no dateType
        let dateToFilter;
        if (filters.dateType === 'created_at') {
          dateToFilter = contract.created_at;
        } else if (filters.dateType === 'start_date') {
          dateToFilter = contract.start_date;
        } else if (filters.dateType === 'end_date') {
          dateToFilter = contract.end_date;
        }

        // Se não houver data, não incluir no filtro
        if (!dateToFilter) return false;

        const contractDate = new Date(dateToFilter);

        // Filtrar por mês
        if (filters.month) {
          const contractMonth = contractDate.getMonth() + 1; // getMonth() retorna 0-11
          if (contractMonth !== parseInt(filters.month)) return false;
        }

        // Filtrar por ano
        if (filters.year) {
          const contractYear = contractDate.getFullYear();
          if (contractYear !== parseInt(filters.year)) return false;
        }

        return true;
      });
    }
    
    // Ordenar alfabeticamente por nome do cliente (padrão)
    contracts = contracts.sort((a, b) => {
      const nameA = a.client?.name || '';
      const nameB = b.client?.name || '';
      return nameA.localeCompare(nameB);
    });
    
    // Carregar services separadamente apenas quando necessário
    if (contracts.length > 0) {
      await this.loadContractServices(contracts);
    }
    
    return contracts;
  }

  async findAll(filters = {}) {
    // Query otimizada com busca nativa no PostgreSQL
    let query = supabase
      .from('contracts')
      .select(`
        id, contract_number, client_id, type, start_date, end_date, status,
        total_value, payment_method, payment_status,
        installment_count, notes, created_at, updated_at,
        client:clients!inner(
          id, email, phone, street, number, complement,
          neighborhood, city, state, zipcode,
          clients_pj(company_name, trade_name, cnpj)
        )
      `)
      .order('created_at', { ascending: false });

    // Aplicar filtros básicos
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.start_date) query = query.gte('start_date', filters.start_date);
    if (filters.end_date) query = query.lte('end_date', filters.end_date);

    const { data, error } = await query;
    if (error) {
      console.error('❌ Erro na query de contratos:', error);
      throw error;
    }
    
    let contracts = this.transformClientData(data || []);
    
    // Aplicar busca após transformação dos dados (mais confiável)
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase().trim();
      contracts = contracts.filter(contract => {
        return (
          contract.contract_number.toLowerCase().includes(searchTerm) ||
          (contract.client?.name && contract.client.name.toLowerCase().includes(searchTerm))
        );
      });
    }

    // Aplicar filtro de mês e ano com base no tipo de data selecionado
    if ((filters.month || filters.year) && filters.dateType) {
      contracts = contracts.filter(contract => {
        // Determinar qual data usar baseado no dateType
        let dateToFilter;
        if (filters.dateType === 'created_at') {
          dateToFilter = contract.created_at;
        } else if (filters.dateType === 'start_date') {
          dateToFilter = contract.start_date;
        } else if (filters.dateType === 'end_date') {
          dateToFilter = contract.end_date;
        }

        // Se não houver data, não incluir no filtro
        if (!dateToFilter) return false;

        const contractDate = new Date(dateToFilter);

        // Filtrar por mês
        if (filters.month) {
          const contractMonth = contractDate.getMonth() + 1; // getMonth() retorna 0-11
          if (contractMonth !== parseInt(filters.month)) return false;
        }

        // Filtrar por ano
        if (filters.year) {
          const contractYear = contractDate.getFullYear();
          if (contractYear !== parseInt(filters.year)) return false;
        }

        return true;
      });
    }
    
    // Ordenar alfabeticamente por nome do cliente (padrão)
    contracts = contracts.sort((a, b) => {
      const nameA = a.client?.name || '';
      const nameB = b.client?.name || '';
      return nameA.localeCompare(nameB);
    });
    
    // Carregar services separadamente apenas quando necessário
    if (contracts.length > 0) {
      await this.loadContractServices(contracts);
    }
    
    return contracts;
  }

  /**
   * Carrega serviços dos contratos de forma otimizada
   */
  async loadContractServices(contracts) {
    const contractIds = contracts.map(c => c.id);

    const { data: services, error } = await supabase
      .from('contract_services')
      .select(`
        id,
        contract_id,
        total_value,
        status,
        service:services!inner(
          id, name, category,
          service_stages(
            id, name, category, status, sort_order, is_active
          )
        )
      `)
      .in('contract_id', contractIds);

    if (error) {
      console.warn('⚠️ Erro ao carregar serviços:', error);
      return;
    }

    // Buscar etapas específicas de cada contract_service (contract_service_stages)
    const contractServiceIds = services?.map(s => s.id) || [];


    let contractServiceStages = [];
    if (contractServiceIds.length > 0) {
      // Fazer a query em lotes para evitar limite de 1000 registros
      const batchSize = 50; // Processar 50 contract_services por vez
      const batches = [];

      for (let i = 0; i < contractServiceIds.length; i += batchSize) {
        const batch = contractServiceIds.slice(i, i + batchSize);
        batches.push(batch);
      }


      for (const batch of batches) {
        const { data: batchStages, error: stagesError } = await supabase
          .from('contract_service_stages')
          .select('contract_service_id, status, is_not_applicable')
          .in('contract_service_id', batch);

        if (!stagesError && batchStages) {
          contractServiceStages.push(...batchStages);
        } else if (stagesError) {
          console.error('❌ Erro ao buscar etapas do lote:', stagesError);
        }
      }


    }

    // Calcular progresso para cada serviço
    services?.forEach(service => {
      const serviceStages = contractServiceStages.filter(
        stage => stage.contract_service_id === service.id
      );

      // Filtrar etapas aplicáveis (não marcadas como N/A)
      const applicableStages = serviceStages.filter(stage => !stage.is_not_applicable);
      const totalStages = applicableStages.length;
      const completedStages = applicableStages.filter(stage => stage.status === 'completed').length;

      service.progress = {
        totalStages,
        completedStages,
        percentage: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0
      };

    });

    // Associar serviços aos contratos
    contracts.forEach(contract => {
      contract.contract_services = services?.filter(s => s.contract_id === contract.id) || [];
    });
  }

  async findById(id) {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        client:clients(
          id, email, phone, street, number, complement,
          neighborhood, city, state, zipcode,
          clients_pj(*)
        ),
        contract_services(
          *,
          service:services!inner(id, name, description, category, duration_amount, duration_unit),
          service_routines(id, status, notes, created_at, updated_at)
        )
      `)
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    
    const transformedData = this.transformClientData([data])[0];

    // Buscar parcelas se existirem
    if (transformedData.installment_count > 1) {
      transformedData.installments = await ContractInstallment.findByContractId(id);
    }

    // Buscar formas de pagamento flexíveis
    transformedData.payment_methods = await ContractPaymentMethod.findByContractId(id);

    // Buscar percentuais de recrutamento para cada contract_service
    if (transformedData.contract_services && transformedData.contract_services.length > 0) {
      console.log('📊 [Model] Buscando percentuais de recrutamento para os serviços do contrato...');

      for (const contractService of transformedData.contract_services) {
        const { data: percentages } = await supabase
          .from('contract_recruitment_percentages')
          .select('*')
          .eq('contract_service_id', contractService.id)
          .single();

        if (percentages) {
          contractService.recruitmentPercentages = {
            administrativo_gestao: percentages.administrativo_gestao,
            comercial: percentages.comercial,
            operacional: percentages.operacional,
            estagio_jovem: percentages.estagio_jovem
          };
          console.log(`✅ [Model] Percentuais carregados para contract_service_id: ${contractService.id}`);
        }
      }
    }

    return transformedData;
  }

  async findAllByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          client:clients(
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('client_id', clientId)
        .order('start_date', { ascending: false });

      if (error) {
        console.error('❌ Erro ao buscar contratos do cliente:', error);
        throw error;
      }

      return this.transformClientData(data || []);
    } catch (error) {
      console.error('❌ Erro no findAllByClientId:', error);
      throw error;
    }
  }

  async findAllServicesByServiceId(serviceId) {
    try {
      const { data, error } = await supabase
        .from('contract_services')
        .select(`
          unit_value,
          total_value,
          contract:contracts(
            contract_number,
            start_date,
            client:clients(
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .eq('service_id', serviceId);

      if (error) {
        console.error('❌ Erro ao buscar serviços por ID de serviço:', error);
        throw error;
      }
      
      return (data || []).map(item => {
        const clientData = item.contract?.client;
        if (clientData) {
            item.contract.client.name = clientData.clients_pj?.trade_name || clientData.clients_pj?.company_name || 'Cliente';
        }
        return item;
      });

    } catch (error) {
      console.error('❌ Erro no findAllServicesByServiceId:', error);
      throw error;
    }
  }

  async getAssignedUsers(contractId) {
    const { data, error } = await supabase
      .from('contract_assignments')
      .select(`
        id,
        user:users!contract_assignments_user_id_fkey(id, name, email),
        role,
        assigned_by_user:users!contract_assignments_assigned_by_fkey(name)
      `)
      .eq('contract_id', contractId)
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  }

  async hardDelete(id) {
    try {
      console.log('🗑️ Iniciando exclusão permanente do contrato:', id);

      // 1. Limpar referência da proposta convertida (se houver)
      console.log('🔄 Removendo referência da proposta...');
      const { error: proposalError } = await supabase
        .from('proposals')
        .update({
          converted_to_contract_id: null
        })
        .eq('converted_to_contract_id', id);

      if (proposalError) {
        console.warn('⚠️ Erro ao limpar referência da proposta:', proposalError);
        // Continuar mesmo com erro, pois pode não existir proposta vinculada
      } else {
        console.log('✅ Referência da proposta removida');
      }

      // 2. Deletar percentuais de recrutamento dos serviços
      console.log('🗑️ Deletando percentuais de recrutamento...');
      const { data: contractServices } = await supabase
        .from('contract_services')
        .select('id')
        .eq('contract_id', id);

      if (contractServices && contractServices.length > 0) {
        const contractServiceIds = contractServices.map(cs => cs.id);
        await supabase
          .from('contract_recruitment_percentages')
          .delete()
          .in('contract_service_id', contractServiceIds);
      }

      // 3. Deletar serviços do contrato
      console.log('🗑️ Deletando serviços do contrato...');
      await supabase.from('contract_services').delete().eq('contract_id', id);

      // 4. Deletar atribuições de usuários
      console.log('🗑️ Deletando atribuições de usuários...');
      await supabase.from('contract_assignments').delete().eq('contract_id', id);

      // 5. Deletar parcelas (se existirem)
      console.log('🗑️ Deletando parcelas...');
      await supabase.from('contract_installments').delete().eq('contract_id', id);

      // 6. Deletar métodos de pagamento flexíveis (se existirem)
      console.log('🗑️ Deletando métodos de pagamento...');
      await supabase.from('contract_payment_methods').delete().eq('contract_id', id);

      // 7. Finalmente, deletar o contrato
      console.log('🗑️ Deletando contrato principal...');
      await supabase.from('contracts').delete().eq('id', id);

      console.log('✅ Contrato deletado permanentemente com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete do contrato:', error);
      throw error;
    }
  }

  async update(id, contractData, userId) {
    try {
      console.log('🔄 [Model] Atualizando contrato:', id);

      const {
        contract_number,
        client_id,
        type,
        start_date,
        end_date,
        status,
        services,
        notes,
        assigned_users,
        payment_method,
        first_installment_date,
        payment_status,
        installment_count,
        installments,
        barter_type,
        barter_value,
        barter_percentage,
        secondary_payment_method
      } = contractData;

      console.log('📅 [Model] first_installment_date extraído:', first_installment_date);

      const updateData = {};

      if (contract_number !== undefined) updateData.contract_number = contract_number;
      if (client_id !== undefined) updateData.client_id = client_id;
      if (type !== undefined) updateData.type = type;
      if (start_date !== undefined) updateData.start_date = start_date;
      if (end_date !== undefined) updateData.end_date = end_date;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (payment_method !== undefined) updateData.payment_method = payment_method;
      if (payment_status !== undefined) updateData.payment_status = payment_status;
      if (installment_count !== undefined) updateData.installment_count = installment_count;
      if (barter_type !== undefined) updateData.barter_type = barter_type;
      if (barter_value !== undefined) updateData.barter_value = barter_value;

      console.log('📤 [Model] Salvando no banco...');

      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (contractError) {
        console.error('❌ Erro ao atualizar contrato:', contractError);
        throw contractError;
      }

      if (services !== undefined) {
        // Buscar serviços existentes para comparação
        const { data: existingServices } = await supabase
          .from('contract_services')
          .select('id, service_id')
          .eq('contract_id', id);

        const existingServiceIds = existingServices ? existingServices.map(s => s.service_id) : [];
        const newServiceIds = services.map(s => s.service_id);
        
        // Identificar serviços a remover (não estão mais na lista)
        const servicesToRemove = existingServices?.filter(s => !newServiceIds.includes(s.service_id)) || [];
        
        // Identificar serviços novos (aditivos)
        const servicesToAdd = services.filter(s => !existingServiceIds.includes(s.service_id));
        
        // Identificar serviços que permanecem (para atualizar se necessário)
        const servicesToUpdate = services.filter(s => existingServiceIds.includes(s.service_id));

        // Remover serviços que não estão mais na lista
        if (servicesToRemove.length > 0) {
          const idsToRemove = servicesToRemove.map(s => s.id);

          // Remover percentuais de recrutamento associados antes de deletar os serviços
          await supabase
            .from('contract_recruitment_percentages')
            .delete()
            .in('contract_service_id', idsToRemove);

          await supabase
            .from('contract_services')
            .delete()
            .in('id', idsToRemove);
        }

        // Adicionar novos serviços
        if (servicesToAdd.length > 0) {
          const newServices = servicesToAdd.map(service => ({
            contract_id: id,
            service_id: service.service_id,
            unit_value: service.unit_value,
            total_value: service.unit_value,
            status: service.status || 'not_started'
          }));

          const { data: insertedServices, error: addError } = await supabase
            .from('contract_services')
            .insert(newServices)
            .select('*');

          if (addError) {
            console.error('❌ Erro ao adicionar serviços aditivos:', addError);
            throw addError;
          }

          // Salvar percentuais de recrutamento para novos serviços de Recrutamento & Seleção
          if (insertedServices && insertedServices.length > 0) {
            console.log('📊 [Model] Verificando percentuais de recrutamento para novos serviços...');
            for (let i = 0; i < servicesToAdd.length; i++) {
              const service = servicesToAdd[i];
              const insertedService = insertedServices[i];

              if (service.recruitmentPercentages && insertedService) {
                console.log(`📊 [Model] Salvando percentuais para contract_service_id: ${insertedService.id}`, service.recruitmentPercentages);

                const { error: percError } = await supabase
                  .from('contract_recruitment_percentages')
                  .insert([{
                    contract_service_id: insertedService.id,
                    administrativo_gestao: service.recruitmentPercentages.administrativo_gestao || 100,
                    comercial: service.recruitmentPercentages.comercial || 100,
                    operacional: service.recruitmentPercentages.operacional || 100,
                    estagio_jovem: service.recruitmentPercentages.estagio_jovem || 50
                  }]);

                if (percError) {
                  console.error('❌ [Model] Erro ao salvar percentuais de recrutamento:', percError);
                } else {
                  console.log(`✅ [Model] Percentuais salvos com sucesso para contract_service_id: ${insertedService.id}`);
                }
              }
            }
          }
        }

        // Atualizar serviços existentes (sem marcar como aditivo)
        for (const service of servicesToUpdate) {
          const existingService = existingServices.find(s => s.service_id === service.service_id);
          if (existingService) {
            await supabase
              .from('contract_services')
              .update({
                unit_value: service.unit_value,
                total_value: service.unit_value,
                status: service.status || 'not_started'
                // NÃO atualizar is_addendum para manter o status original
              })
              .eq('id', existingService.id);

            // Atualizar percentuais de recrutamento se fornecidos
            if (service.recruitmentPercentages) {
              console.log(`📊 [Model] Atualizando percentuais para contract_service_id: ${existingService.id}`, service.recruitmentPercentages);

              // Verificar se já existem percentuais
              const { data: existingPerc } = await supabase
                .from('contract_recruitment_percentages')
                .select('id')
                .eq('contract_service_id', existingService.id)
                .single();

              const percData = {
                administrativo_gestao: service.recruitmentPercentages.administrativo_gestao || 100,
                comercial: service.recruitmentPercentages.comercial || 100,
                operacional: service.recruitmentPercentages.operacional || 100,
                estagio_jovem: service.recruitmentPercentages.estagio_jovem || 50
              };

              if (existingPerc) {
                // Atualizar percentuais existentes
                const { error: percError } = await supabase
                  .from('contract_recruitment_percentages')
                  .update(percData)
                  .eq('contract_service_id', existingService.id);

                if (percError) {
                  console.error('❌ [Model] Erro ao atualizar percentuais:', percError);
                } else {
                  console.log(`✅ [Model] Percentuais atualizados para contract_service_id: ${existingService.id}`);
                }
              } else {
                // Criar novos percentuais
                const { error: percError } = await supabase
                  .from('contract_recruitment_percentages')
                  .insert([{
                    contract_service_id: existingService.id,
                    ...percData
                  }]);

                if (percError) {
                  console.error('❌ [Model] Erro ao criar percentuais:', percError);
                } else {
                  console.log(`✅ [Model] Percentuais criados para contract_service_id: ${existingService.id}`);
                }
              }
            }
          }
        }

        // Recalcular valor total do contrato
        const allServices = [...servicesToUpdate, ...servicesToAdd];
        const totalValue = allServices.reduce((sum, service) => sum + service.unit_value, 0);
        const newInstallmentCount = installment_count || updateData.installment_count || 1;
        const installmentValue = newInstallmentCount > 1 ? totalValue / newInstallmentCount : null;
        
        await supabase
          .from('contracts')
          .update({ 
            total_value: totalValue,
            installment_value: installmentValue
          })
          .eq('id', id);
      }

      // REMOVIDO: As parcelas devem ser atualizadas através do endpoint dedicado
      // PUT /contracts/:contractId/installments
      // Manter este comentário para documentação

      if (assigned_users !== undefined) {
        // Validação: não permitir array vazio acidentalmente
        if (Array.isArray(assigned_users) && assigned_users.length === 0) {
          console.warn('⚠️ Tentativa de remover todos os usuários do contrato. Operação ignorada por segurança.');
          console.warn('Se realmente deseja remover todos os usuários, use um endpoint específico.');
        } else {
          const { data: currentAssignments } = await supabase
            .from('contract_assignments')
            .select('user_id, role')
            .match({
              contract_id: id,
              is_active: true
            });

          const currentUserIds = currentAssignments ? currentAssignments.map(a => a.user_id) : [];
          const newUserIds = assigned_users || [];

          // Verificar se há pelo menos um owner após as mudanças
          const currentOwners = currentAssignments ?
            currentAssignments.filter(a => a.role === 'owner').map(a => a.user_id) : [];
          const remainingOwners = currentOwners.filter(uid => newUserIds.includes(uid));

          if (remainingOwners.length === 0 && newUserIds.length > 0) {
            console.warn('⚠️ Nenhum owner restante. Mantendo o usuário atual como owner.');
            // Garantir que o usuário que está fazendo a edição seja owner
            if (!newUserIds.includes(userId)) {
              newUserIds.push(userId);
            }
          }

          // Remover usuários que não estão mais na lista
          const usersToRemove = currentUserIds.filter(uid => !newUserIds.includes(uid));
          for (const uid of usersToRemove) {
            await this.unassignUser(id, uid);
          }

          // Adicionar novos usuários
          const usersToAdd = newUserIds.filter(uid => !currentUserIds.includes(uid));
          if (usersToAdd.length > 0) {
            const usersToAssign = usersToAdd.map(uid => ({
              userId: uid,
              role: uid === userId ? 'owner' : 'viewer'
            }));
            await this.assignUsers(id, usersToAssign, userId);
          }
        }
      }

      return await this.findById(id);
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  async updateStatus(id, status, userId) {
    const { data, error } = await supabase
      .from('contracts')
      .update({ status })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async updateContractService(contractServiceId, updateData) {
    try {
      const allowedFields = ['status'];
      const filteredData = {};
      
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      }

      const { data, error } = await supabase
        .from('contract_services')
        .update(filteredData)
        .eq('id', contractServiceId)
        .select(`
          *,
          service:services!inner(id, name, category, duration_amount, duration_unit)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar serviço do contrato:', error);
      throw error;
    }
  }

  async getContractServiceById(contractServiceId) {
    try {
      console.log('🔍 [DEBUG] Buscando contract service ID:', contractServiceId);
      
      // Primeiro, tentar query simples para ver se o record existe
      const { data: simpleData, error: simpleError } = await supabase
        .from('contract_services')
        .select('*')
        .eq('id', contractServiceId)
        .single();

      console.log('🔍 Query simples result:', { simpleData, simpleError });

      if (simpleError) {
        console.log('❌ Service não existe na tabela contract_services');
        return null;
      }

      // Tentar com LEFT JOINs ao invés de INNER JOINs para ser mais tolerante
      const { data, error } = await supabase
        .from('contract_services')
        .select(`
          *,
          service:services(id, name, description, category, duration_amount, duration_unit),
          contract:contracts(id, contract_number)
        `)
        .eq('id', contractServiceId)
        .single();

      console.log('🔍 Supabase query with joins result:', { data, error });

      if (error) {
        console.log('❌ Supabase error with joins:', error);
        // Se é erro de não encontrado, retornar null ao invés de lançar erro
        if (error.code === 'PGRST116') {
          console.log('🔍 Service não encontrado com joins (PGRST116)');
          return null;
        }
        throw error;
      }
      
      // Adicionar contract_id para facilitar o acesso
      if (data && data.contract) {
        data.contract_id = data.contract.id;
      }
      
      return data;
    } catch (error) {
      console.error('❌ Erro ao buscar serviço do contrato:', error);
      throw error;
    }
  }
  
  /**
   * Criar rotinas para todos os contract_services de um contrato
   */
  async createRoutinesForContract(contractId) {
    try {
      console.log('🚀 Criando rotinas para contrato:', contractId);

      // Buscar todos os contract_services deste contrato que não têm rotina
      const { data: contractServices, error: queryError } = await supabase
        .from('contract_services')
        .select('id, service_id, status')
        .eq('contract_id', contractId);

      if (queryError) throw queryError;

      if (!contractServices || contractServices.length === 0) {
        console.log('⚠️ Nenhum contract_service encontrado para o contrato:', contractId);
        return;
      }

      // Criar rotinas para cada contract_service
      const routinesToCreate = contractServices.map(cs => ({
        contract_service_id: cs.id,
        status: cs.status || 'not_started'
      }));

      const { data: createdRoutines, error: insertError } = await supabase
        .from('service_routines')
        .insert(routinesToCreate)
        .select();

      if (insertError) throw insertError;

      // Sincronizar etapas do serviço para cada contract_service
      const ServiceStage = require('./ServiceStage');
      const uniqueServiceIds = [...new Set(contractServices.map(cs => cs.service_id))];

      console.log('🔄 Sincronizando etapas para os serviços:', uniqueServiceIds);

      for (const serviceId of uniqueServiceIds) {
        try {
          await ServiceStage.syncStagesToContractServices(serviceId);
        } catch (syncError) {
          console.error(`⚠️ Erro ao sincronizar etapas do serviço ${serviceId}:`, syncError);
          // Não lançar erro para não interromper a criação do contrato
        }
      }

      return createdRoutines;

    } catch (error) {
      console.error('❌ Erro ao criar rotinas para contrato:', error);
      throw error;
    }
  }

  async unassignUser(contractId, userId) {
    const { error } = await supabase
      .from('contract_assignments')
      .update({ is_active: false })
      .match({
        contract_id: contractId,
        user_id: userId
      });
    
    if (error) throw error;
    return true;
  }

  async updateUserRole(contractId, userId, role) {
    const { data, error } = await supabase
      .from('contract_assignments')
      .update({ role })
      .match({
        contract_id: contractId,
        user_id: userId,
        is_active: true
      })
      .select();

    if (error) {
      console.error('❌ Erro ao atualizar a role do usuário:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(`⚠️ Nenhuma atribuição encontrada para contractId=${contractId}, userId=${userId}. Nenhuma role foi atualizada.`);
      return null;
    }
    
    return data[0]; 
  }

  async softDelete(id, userId) {
    try {
      console.log('🗑️ Iniciando soft delete do contrato:', id);

      // 1. Limpar referência da proposta convertida (se houver)
      console.log('🔄 Removendo referência da proposta...');
      const { error: proposalError } = await supabase
        .from('proposals')
        .update({
          converted_to_contract_id: null
        })
        .eq('converted_to_contract_id', id);

      if (proposalError) {
        console.warn('⚠️ Erro ao limpar referência da proposta:', proposalError);
        // Continuar mesmo com erro
      } else {
        console.log('✅ Referência da proposta removida');
      }

      // 2. Marcar contrato como cancelado
      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'cancelled'
        })
        .eq('id', id);

      if (error) throw error;

      console.log('✅ Contrato marcado como cancelado');
      return true;
    } catch (error) {
      console.error('❌ Erro no softDelete do contrato:', error);
      throw error;
    }
  }

  async generateContractNumber() {
    const year = new Date().getFullYear();
    const prefix = `TOP-${year}-`;
    
    // Tentar até 10 vezes para encontrar um número único
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        // Buscar o maior número existente a cada tentativa
        const { data, error } = await supabase
          .from('contracts')
          .select('contract_number')
          .like('contract_number', `${prefix}%`)
          .order('contract_number', { ascending: false })
          .limit(1);
        
        if (error) throw error;
        
        let nextNumber = 1;
        if (data && data.length > 0) {
          const lastNumberMatch = data[0].contract_number.match(/TOP-\d{4}-(\d+)/);
          if (lastNumberMatch) nextNumber = parseInt(lastNumberMatch[1]) + 1;
        }
        
        const candidateNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
        
        // Verificar se o número já existe (double-check)
        const { data: existingContract, error: checkError } = await supabase
          .from('contracts')
          .select('id')
          .eq('contract_number', candidateNumber)
          .single();
        
        if (checkError && checkError.code === 'PGRST116') {
          // Não encontrou - número está disponível
          return candidateNumber;
        }
        
        if (existingContract) {
          // Número já existe, tentar novamente
          console.warn(`⚠️ [Model] Número de contrato ${candidateNumber} já existe, tentativa ${attempt + 1}`);
          continue;
        }
        
        // Se chegou aqui sem erro, o número está disponível
        return candidateNumber;
        
      } catch (error) {
        console.error(`❌ [Model] Erro na tentativa ${attempt + 1} de gerar número:`, error);
        if (attempt === 9) throw error; // Re-throw no último attempt
        
        // Esperar um pouco antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
      }
    }
    
    // Fallback: usar timestamp para garantir unicidade
    const timestamp = Date.now().toString().slice(-4);
    const fallbackNumber = `${prefix}${timestamp}`;
    console.warn(`⚠️ [Model] Usando número de fallback: ${fallbackNumber}`);
    return fallbackNumber;
  }
  
  async getAllWithDetails() {
    const { data, error } = await supabase
      .from('contracts').select(`*, client:clients(
        id, email, phone, street, number, complement,
        neighborhood, city, state, zipcode,
        clients_pj(company_name, trade_name, cnpj)
      )`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return this.transformClientData(data || []);
  }

  async getByUserId(userId) {
    const { data: assignments, error: assignError } = await supabase
      .from('contract_assignments').select('contract_id').eq('user_id', userId).eq('is_active', true);
    if (assignError) throw assignError;
    if (!assignments || assignments.length === 0) return [];
    const contractIds = assignments.map(a => a.contract_id);
    const { data, error } = await supabase
      .from('contracts').select(`*, client:clients(
        id, email, phone, street, number, complement,
        neighborhood, city, state, zipcode,
        clients_pj(company_name, trade_name, cnpj)
      )`)
      .in('id', contractIds).order('created_at', { ascending: false });
    if (error) throw error;
    return this.transformClientData(data || []);
  }

  async findAllByMonth(year, month) {
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
      const endDate = new Date(year, month, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          client:clients(
            id, email, phone,
            clients_pj(company_name, trade_name, cnpj)
          )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate.toISOString());

      if (error) {
        console.error('❌ Erro ao buscar contratos por mês:', error);
        throw error;
      }

      return this.transformClientData(data || []);
    } catch (error) {
      console.error('❌ Erro no findAllByMonth:', error);
      throw error;
    }
  }

  /**
   * Obter detalhes completos de um serviço de contrato incluindo contrato e serviço
   */
  async getContractServiceWithDetails(contractServiceId) {
    try {
      const { data, error } = await supabase
        .from('contract_services')
        .select(`
          id,
          contract_id,
          service_id,
          status,
          contract:contracts!contract_services_contract_id_fkey(
            id,
            contract_number
          ),
          service:services!contract_services_service_id_fkey(
            id,
            name
          )
        `)
        .eq('id', contractServiceId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes do serviço do contrato:', error);
      throw error;
    }
  }

  /**
   * Buscar atividades recentes dos serviços nos contratos
   */
  async getRecentServiceActivities(userId = null, limit = 10) {
    try {
      let query = supabase
        .from('contract_services')
        .select(`
          id,
          status,
          updated_at,
          total_value,
          contract:contracts!contract_services_contract_id_fkey(
            id,
            contract_number,
            client:clients(
              clients_pj(company_name, trade_name)
            )
          ),
          service:services!contract_services_service_id_fkey(
            id,
            name,
            category,
            duration_amount,
            duration_unit
          )
        `)
        .order('updated_at', { ascending: false })
        .limit(limit);

      // Se userId for fornecido, filtrar por contratos atribuídos ao usuário
      if (userId) {
        const { data: assignments, error: assignError } = await supabase
          .from('contract_assignments')
          .select('contract_id')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (assignError) throw assignError;
        
        if (assignments && assignments.length > 0) {
          const contractIds = assignments.map(a => a.contract_id);
          query = query.in('contract_id', contractIds);
        } else {
          // Se não tem contratos atribuídos, retorna array vazio
          return [];
        }
      }

      const { data, error } = await query;
      
      if (error) throw error;

      // Transformar dados para formato da atividade
      return (data || []).map(item => {
        const clientName = this.getClientNameFromData(item.contract.client);
        
        return {
          id: item.id,
          type: 'service',
          status: item.status,
          title: item.service.name,
          description: `${item.contract.contract_number} - ${clientName}`,
          time: this.formatRelativeTime(item.updated_at),
          value: item.total_value,
          category: item.service.category,
          duration: item.service.duration_amount && item.service.duration_unit
            ? `${item.service.duration_amount} ${item.service.duration_unit}`
            : null,
          contractId: item.contract.id,
          serviceId: item.service.id
        };
      });
    } catch (error) {
      console.error('❌ Erro ao buscar atividades recentes dos serviços:', error);
      throw error;
    }
  }

  /**
   * Método auxiliar para extrair nome do cliente dos dados
   */
  getClientNameFromData(clientData) {
    if (!clientData) return 'Cliente não identificado';

    if (clientData.clients_pj) {
      return clientData.clients_pj.trade_name || clientData.clients_pj.company_name || 'Empresa não identificada';
    }

    return 'Cliente não identificado';
  }

  /**
   * Método auxiliar para formatar tempo relativo
   */
  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMilliseconds = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) return 'Agora mesmo';
    if (diffInMinutes < 60) return `Há ${diffInMinutes} minuto${diffInMinutes > 1 ? 's' : ''}`;
    if (diffInHours < 24) return `Há ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`;
    if (diffInDays < 7) return `Há ${diffInDays} dia${diffInDays > 1 ? 's' : ''}`;
    
    return date.toLocaleDateString('pt-BR');
  }

  /**
   * Buscar contratos por intervalo de datas
   */
  async findByDateRange(startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          client:clients(
            id, email, phone,
            clients_pj(company_name, trade_name, cnpj)
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return this.transformClientData(data || []);
    } catch (error) {
      console.error('❌ Erro ao buscar contratos por data:', error);
      throw error;
    }
  }

  /**
   * Buscar todos os serviços de contratos por ID do serviço
   */
  async findAllServicesByServiceId(serviceId) {
    try {
      const { data, error } = await supabase
        .from('contract_services')
        .select(`
          *,
          contract:contracts(
            id,
            contract_number,
            type,
            status,
            start_date,
            client:clients(
              id, email, phone,
              clients_pj(company_name, trade_name, cnpj)
            )
          )
        `)
        .eq('service_id', serviceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transformar dados do cliente
      return (data || []).map(item => {
        if (item.contract && item.contract.client) {
          item.contract.client.name = this.getClientNameFromData(item.contract.client);
          // Add document field (PJ only)
          if (item.contract.client.clients_pj && item.contract.client.clients_pj.cnpj) {
            item.contract.client.document = item.contract.client.clients_pj.cnpj;
          }
        }
        return item;
      });
    } catch (error) {
      console.error('❌ Erro ao buscar serviços do contrato:', error);
      throw error;
    }
  }

  /**
   * Buscar parcelas por intervalo de datas
   */
  async getInstallmentsByDateRange(startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('contract_installments')
        .select(`
          *,
          contract:contracts(
            contract_number
          )
        `)
        .gte('due_date', startDate.toISOString().split('T')[0])
        .lte('due_date', endDate.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        contract_number: item.contract?.contract_number || 'N/A'
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar parcelas por data:', error);
      throw error;
    }
  }

  /**
   * Buscar serviços por ID do contrato
   */
  async findServicesByContractId(contractId) {
    try {
      const { data, error } = await supabase
        .from('contract_services')
        .select(`
          *,
          service:services(
            id,
            name,
            category,
            duration_amount,
            duration_unit
          )
        `)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        id: item.id,
        name: item.service?.name || 'Serviço não identificado',
        category: item.service?.category || 'Geral',
        status: item.status,
        unit_value: item.unit_value,
        total_value: item.total_value,
        duration_amount: item.service?.duration_amount,
        duration_unit: item.service?.duration_unit
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar serviços do contrato:', error);
      throw error;
    }
  }

  /**
   * Buscar comentários de um serviço
   */
  async getServiceComments(serviceId) {
    try {
      const { data, error } = await supabase
        .from('contract_service_comments')
        .select(`
          *,
          user:users(
            id,
            name,
            email
          )
        `)
        .eq('contract_service_id', serviceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar comentários do serviço:', error);
      throw error;
    }
  }

  /**
   * Endpoint otimizado para página de rotinas
   * Busca apenas dados necessários em uma única query
   */
  async findAllForRoutines(userId = null) {
    try {
      let contractIds = null;

      // Se userId foi fornecido, buscar apenas contratos do usuário
      if (userId) {
        const { data: assignments, error: assignError } = await supabase
          .from('contract_assignments')
          .select('contract_id')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (assignError) throw assignError;

        contractIds = assignments?.map(a => a.contract_id) || [];
        if (contractIds.length === 0) return [];
      }

      // Query otimizada: apenas campos necessários para a listagem
      let query = supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          type,
          status,
          client:clients!inner(
            id,
            clients_pj(company_name, trade_name)
          ),
          contract_services(
            id,
            status,
            service:services(name)
          )
        `)
        .eq('status', 'active')
        .neq('type', 'Recrutamento & Seleção')
        .order('created_at', { ascending: false });

      // Filtrar por contratos do usuário se necessário
      if (contractIds) {
        query = query.in('id', contractIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro na query de rotinas:', error);
        throw error;
      }

      // Transformar dados para formato otimizado
      const routines = (data || []).map(contract => {
        // Extrair nome do cliente (PJ only)
        let clientName = 'Cliente não identificado';
        if (contract.client && contract.client.clients_pj) {
          clientName = contract.client.clients_pj.trade_name ||
                       contract.client.clients_pj.company_name ||
                       'Empresa não identificada';
        }

        // Calcular progresso baseado no status dos serviços
        const services = contract.contract_services || [];
        const total = services.length;
        const completed = services.filter(s => s.status === 'completed').length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          id: contract.id,
          contractNumber: contract.contract_number,
          clientName,
          clientId: contract.client?.id,
          type: contract.type,
          status: contract.status,
          servicesCount: total,
          progress: {
            completed,
            total,
            percentage
          }
        };
      });

      // Ordenar por nome do cliente A-Z
      routines.sort((a, b) => a.clientName.localeCompare(b.clientName, 'pt-BR'));

      return routines;
    } catch (error) {
      console.error('❌ Erro ao buscar rotinas:', error);
      throw error;
    }
  }
}

module.exports = new ContractModel();