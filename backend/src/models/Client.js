const { supabase } = require('../config/database');
const ClientEmailModel = require('./ClientEmail');

class ClientModel {
  /**
   * Criar novo cliente
   */
  async create(clientData, userId) {
    const { 
      type,
      email,
      emails, // Array de emails para clientes PJ
      phone,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipcode,
      // Optional fields
      employee_count,
      business_segment,
      // PF fields
      cpf,
      full_name,
      // PJ fields
      cnpj,
      company_name,
      trade_name
    } = clientData;

    // Validate that we have the type and corresponding required fields
    if (!type || (type !== 'PF' && type !== 'PJ')) {
      throw new Error('Tipo de cliente inválido. Use "PF" ou "PJ"');
    }

    // Validar emails para clientes PJ
    let emailsToCreate = [];
    if (type === 'PJ') {
      if (emails && Array.isArray(emails) && emails.length > 0) {
        emailsToCreate = emails.filter(e => e && e.trim());
        if (emailsToCreate.length === 0) {
          throw new Error('Clientes PJ devem ter pelo menos um email válido');
        }
      } else if (email && email.trim()) {
        emailsToCreate = [email.trim()];
      } else {
        throw new Error('Clientes PJ devem ter pelo menos um email');
      }
    } else if (type === 'PF') {
      // Para PF, usar o email único tradicional
      if (email && email.trim()) {
        emailsToCreate = [email.trim()];
      }
    }

    try {
      // Iniciar transação
      const { data: clientBasic, error: clientError } = await supabase
        .from('clients')
        .insert([{
          email: emailsToCreate[0] || null, // Manter compatibilidade - usar o primeiro email
          phone: phone || null,
          street,
          number,
          complement: complement || null,
          neighborhood,
          city,
          state,
          zipcode,
          created_by: userId,
          updated_by: userId
        }])
        .select('*')
        .single();

      if (clientError) {
        console.error('❌ Erro ao criar cliente base:', clientError);
        throw clientError;
      }

      // Inserir dados específicos de PF ou PJ
      if (type === 'PF') {
        const { error: pfError } = await supabase
          .from('clients_pf')
          .insert([{
            client_id: clientBasic.id,
            cpf: cpf ? cpf.replace(/\D/g, '') : null, // Remove formatação
            full_name
          }]);

        if (pfError) {
          // Rollback - deletar cliente base
          await supabase.from('clients').delete().eq('id', clientBasic.id);
          console.error('❌ Erro ao criar cliente PF:', pfError);
          throw pfError;
        }
      } else if (type === 'PJ') {
        const { error: pjError } = await supabase
          .from('clients_pj')
          .insert([{
            client_id: clientBasic.id,
            cnpj: cnpj ? cnpj.replace(/\D/g, '') : null, // Remove formatação
            company_name,
            trade_name: trade_name || null,
            employee_count: employee_count || null,
            business_segment: business_segment || null
          }]);

        if (pjError) {
          // Rollback - deletar cliente base
          await supabase.from('clients').delete().eq('id', clientBasic.id);
          console.error('❌ Erro ao criar cliente PJ:', pjError);
          throw pjError;
        }
      }

      // Criar emails na tabela client_emails
      if (emailsToCreate.length > 0) {
        try {
          await ClientEmailModel.addMultipleEmails(clientBasic.id, emailsToCreate);
        } catch (emailError) {
          // Rollback - deletar cliente base
          await supabase.from('clients').delete().eq('id', clientBasic.id);
          console.error('❌ Erro ao criar emails do cliente:', emailError);
          throw emailError;
        }
      }

      // Buscar cliente completo
      const client = await this.findById(clientBasic.id);
      return client;
    } catch (error) {
      console.error('❌ Erro no create:', error);
      throw error;
    }
  }

  /**
   * Buscar todos os clientes
   */
  async findAll(filters = {}) {
    try {
      let query = supabase
        .from('clients')
        .select(`
          id, email, phone, street, number, complement,
          neighborhood, city, state, zipcode,
          created_at, updated_at,
          clients_pf(cpf, full_name),
          clients_pj(cnpj, company_name, trade_name, employee_count, business_segment),
          client_emails(id, email, is_primary)
        `)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters.type) {
        if (filters.type === 'PF') {
          query = query.not('clients_pf', 'is', null);
        } else if (filters.type === 'PJ') {
          query = query.not('clients_pj', 'is', null);
        }
      }

      if (filters.city) {
        query = query.eq('city', filters.city);
      }

      if (filters.state) {
        query = query.eq('state', filters.state);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar clientes:', error);
        throw error;
      }

      // Filtrar por search (feito em JS para suportar busca por CPF/CNPJ sem formatação)
      let filteredData = data || [];
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const searchDigitsOnly = filters.search.replace(/\D/g, ''); // Remove tudo que não é dígito

        filteredData = filteredData.filter(client => {
          // Buscar em email
          if (client.email && client.email.toLowerCase().includes(searchTerm)) return true;

          // Buscar em cidade
          if (client.city && client.city.toLowerCase().includes(searchTerm)) return true;

          // Buscar em dados de PF
          if (client.clients_pf) {
            if (client.clients_pf.full_name && client.clients_pf.full_name.toLowerCase().includes(searchTerm)) return true;
            // Buscar por CPF (comparar apenas números - normaliza ambos os lados)
            if (searchDigitsOnly && client.clients_pf.cpf) {
              const cpfDigitsOnly = client.clients_pf.cpf.replace(/\D/g, '');
              if (cpfDigitsOnly.includes(searchDigitsOnly)) return true;
            }
          }

          // Buscar em dados de PJ
          if (client.clients_pj) {
            if (client.clients_pj.company_name && client.clients_pj.company_name.toLowerCase().includes(searchTerm)) return true;
            if (client.clients_pj.trade_name && client.clients_pj.trade_name.toLowerCase().includes(searchTerm)) return true;
            // Buscar por CNPJ (comparar apenas números - normaliza ambos os lados)
            if (searchDigitsOnly && client.clients_pj.cnpj) {
              const cnpjDigitsOnly = client.clients_pj.cnpj.replace(/\D/g, '');
              if (cnpjDigitsOnly.includes(searchDigitsOnly)) return true;
            }
          }

          return false;
        });
      }

      // Formatar dados
      const formattedData = filteredData.map(client => {
        const isPF = !!client.clients_pf;
        const type = isPF ? 'PF' : 'PJ';
        const name = isPF 
          ? (client.clients_pf?.full_name || '') 
          : (client.clients_pj?.trade_name || client.clients_pj?.company_name || '');
        
        // Processar emails
        const emails = (client.client_emails || [])
          .sort((a, b) => {
            // Primary emails first
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return 0;
          });
        
        const primaryEmail = emails.find(email => email.is_primary);
        
        return {
          ...client,
          type,
          name,
          emails: emails.map(e => ({ id: e.id, email: e.email, is_primary: e.is_primary })),
          primary_email: primaryEmail?.email || client.email, // Fallback para compatibilidade
          // Flatten PF/PJ data
          ...(isPF && client.clients_pf ? client.clients_pf : {}),
          ...(!isPF && client.clients_pj ? client.clients_pj : {}),
          // Remove nested objects
          clients_pf: undefined,
          clients_pj: undefined,
          client_emails: undefined
        };
      });

      return formattedData;
    } catch (error) {
      console.error('❌ Erro no findAll:', error);
      throw error;
    }
  }

  /**
   * Buscar cliente por ID
   */
  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id, email, phone, street, number, complement,
          neighborhood, city, state, zipcode,
          created_at, updated_at,
          clients_pf(cpf, full_name),
          clients_pj(cnpj, company_name, trade_name, employee_count, business_segment),
          client_emails(id, email, is_primary)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('❌ Erro ao buscar cliente por ID:', error);
        throw error;
      }

      // Formatar dados
      const isPF = !!data.clients_pf;
      const type = isPF ? 'PF' : 'PJ';
      const name = isPF 
        ? (data.clients_pf ? data.clients_pf.full_name : '') 
        : (data.clients_pj ? (data.clients_pj.trade_name || data.clients_pj.company_name) : '');
      
      // Processar emails
      const emails = (data.client_emails || [])
        .sort((a, b) => {
          // Primary emails first
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return 0;
        });
      
      const primaryEmail = emails.find(email => email.is_primary);
      
      return {
        ...data,
        type,
        name,
        emails: emails.map(e => ({ id: e.id, email: e.email, is_primary: e.is_primary })),
        primary_email: primaryEmail?.email || data.email, // Fallback para compatibilidade
        // Flatten PF/PJ data
        ...(isPF && data.clients_pf ? data.clients_pf : {}),
        ...(!isPF && data.clients_pj ? data.clients_pj : {}),
        // Remove nested objects
        clients_pf: undefined,
        clients_pj: undefined,
        client_emails: undefined
      };
    } catch (error) {
      console.error('❌ Erro no findById:', error);
      throw error;
    }
  }

  /**
   * Atualizar cliente
   */
  async update(id, clientData, userId) {
    try {
      const { 
        email,
        emails, // Array de emails para clientes PJ
        phone,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipcode,
        // Optional fields
        employee_count,
        business_segment,
        // PF fields
        cpf,
        full_name,
        // PJ fields
        cnpj,
        company_name,
        trade_name
      } = clientData;

      // Buscar cliente atual para determinar tipo
      const currentClient = await this.findById(id);
      if (!currentClient) {
        throw new Error('Cliente não encontrado');
      }

      // Preparar emails para atualização
      let emailsToUpdate = [];
      if (currentClient.type === 'PJ') {
        if (emails && Array.isArray(emails) && emails.length > 0) {
          emailsToUpdate = emails.filter(e => e && e.trim());
          if (emailsToUpdate.length === 0) {
            throw new Error('Clientes PJ devem ter pelo menos um email válido');
          }
        } else if (email && email.trim()) {
          emailsToUpdate = [email.trim()];
        } else {
          throw new Error('Clientes PJ devem ter pelo menos um email');
        }
      } else if (currentClient.type === 'PF') {
        // Para PF, usar o email único tradicional
        if (email && email.trim()) {
          emailsToUpdate = [email.trim()];
        }
      }

      // Atualizar dados básicos (manter o primeiro email para compatibilidade)
      const { error: clientError } = await supabase
        .from('clients')
        .update({
          email: emailsToUpdate[0] || email,
          phone: phone || null,
          street,
          number,
          complement: complement || null,
          neighborhood,
          city,
          state,
          zipcode,
          updated_by: userId
        })
        .eq('id', id);

      if (clientError) {
        console.error('❌ Erro ao atualizar cliente base:', clientError);
        throw clientError;
      }

      // Atualizar dados específicos
      if (currentClient.type === 'PF') {
        const { error: pfError } = await supabase
          .from('clients_pf')
          .update({
            cpf: cpf ? cpf.replace(/\D/g, '') : cpf,
            full_name
          })
          .eq('client_id', id);

        if (pfError) {
          console.error('❌ Erro ao atualizar cliente PF:', pfError);
          throw pfError;
        }
      } else if (currentClient.type === 'PJ') {
        const { error: pjError } = await supabase
          .from('clients_pj')
          .update({
            cnpj: cnpj ? cnpj.replace(/\D/g, '') : cnpj,
            company_name,
            trade_name: trade_name || null,
            employee_count: employee_count || null,
            business_segment: business_segment || null
          })
          .eq('client_id', id);

        if (pjError) {
          console.error('❌ Erro ao atualizar cliente PJ:', pjError);
          throw pjError;
        }
      }

      // Atualizar emails se fornecidos
      if (emailsToUpdate.length > 0) {
        try {
          await ClientEmailModel.replaceAllEmails(id, emailsToUpdate);
        } catch (emailError) {
          console.error('❌ Erro ao atualizar emails do cliente:', emailError);
          throw emailError;
        }
      }

      // Buscar cliente atualizado
      const updatedClient = await this.findById(id);
      return updatedClient;
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  /**
   * Excluir cliente (soft delete - marca como inativo)
   */
  async softDelete(id) {
    try {
      // Por enquanto, vamos apenas verificar se existe
      const client = await this.findById(id);
      if (!client) {
        throw new Error('Cliente não encontrado');
      }

      // TODO: Implementar soft delete quando adicionar campo is_active
      console.log('⚠️ Soft delete ainda não implementado para clientes');
      return true;
    } catch (error) {
      console.error('❌ Erro no softDelete:', error);
      throw error;
    }
  }

  /**
   * Excluir cliente permanentemente (apenas admin)
   */
  async hardDelete(id) {
    try {
      // Verificar se há contratos ou propostas associados
      const { data: contracts, error: contractError } = await supabase
        .from('contracts')
        .select('id')
        .eq('client_id', id)
        .limit(1);

      if (contractError) {
        console.error('❌ Erro ao verificar contratos:', contractError);
        throw contractError;
      }

      if (contracts && contracts.length > 0) {
        throw new Error('Não é possível excluir o cliente pois existem contratos associados. Por favor, exclua ou reassigne os contratos primeiro.');
      }

      const { data: proposals, error: proposalError } = await supabase
        .from('proposals')
        .select('id')
        .eq('client_id', id)
        .limit(1);

      if (proposalError) {
        console.error('❌ Erro ao verificar propostas:', proposalError);
        throw proposalError;
      }

      if (proposals && proposals.length > 0) {
        throw new Error('Não é possível excluir o cliente pois existem propostas associadas. Por favor, exclua ou reassigne as propostas primeiro.');
      }

      // Ordem correta de exclusão (respeitando constraints de foreign key)
      // 1. Deletar anexos do cliente
      await supabase.from('client_attachments').delete().eq('client_id', id);
      
      // 2. Deletar emails do cliente
      await supabase.from('client_emails').delete().eq('client_id', id);
      
      // 3. Deletar registros específicos de PF ou PJ
      await supabase.from('clients_pf').delete().eq('client_id', id);
      await supabase.from('clients_pj').delete().eq('client_id', id);

      // 4. Finalmente, deletar o cliente base
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir cliente permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete:', error);
      throw error;
    }
  }

  /**
   * Estatísticas dos clientes
   */
  async getStats() {
    try {
      const { data: clients, error } = await supabase
        .from('clients')
        .select(`
          id, city, state,
          clients_pf(client_id),
          clients_pj(client_id)
        `);

      if (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        throw error;
      }

      const total = clients?.length || 0;
      const totalPF = clients?.filter(c => c.clients_pf).length || 0;
      const totalPJ = clients?.filter(c => c.clients_pj).length || 0;
      
      // Agrupar por cidade
      const byCity = {};
      (clients || []).forEach(client => {
        if (client.city) {
          byCity[client.city] = (byCity[client.city] || 0) + 1;
        }
      });

      // Agrupar por estado
      const byState = {};
      (clients || []).forEach(client => {
        if (client.state) {
          byState[client.state] = (byState[client.state] || 0) + 1;
        }
      });

      return {
        total,
        totalPF,
        totalPJ,
        byCity,
        byState
      };
    } catch (error) {
      console.error('❌ Erro no getStats:', error);
      throw error;
    }
  }

  /**
   * Buscar cidades únicas
   */
  async getCities() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('city')
        .order('city');

      if (error) {
        console.error('❌ Erro ao buscar cidades:', error);
        throw error;
      }

      const uniqueCities = [...new Set((data || []).map(item => item.city))];
      return uniqueCities.filter(city => city && city.trim());
    } catch (error) {
      console.error('❌ Erro no getCities:', error);
      throw error;
    }
  }

  /**
   * Buscar estados únicos
   */
  async getStates() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('state')
        .order('state');

      if (error) {
        console.error('❌ Erro ao buscar estados:', error);
        throw error;
      }

      const uniqueStates = [...new Set((data || []).map(item => item.state))];
      return uniqueStates.filter(state => state && state.trim());
    } catch (error) {
      console.error('❌ Erro no getStates:', error);
      throw error;
    }
  }
}

module.exports = new ClientModel();