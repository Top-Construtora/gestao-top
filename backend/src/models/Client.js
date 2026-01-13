const { supabase } = require('../config/database');
const ClientEmailModel = require('./ClientEmail');

class ClientModel {
  /**
   * Criar novo cliente (apenas PJ)
   */
  async create(clientData, userId) {
    const {
      email,
      emails,
      phone,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipcode,
      employee_count,
      business_segment,
      cnpj,
      company_name,
      trade_name
    } = clientData;

    // Validar emails
    let emailsToCreate = [];
    if (emails && Array.isArray(emails) && emails.length > 0) {
      emailsToCreate = emails.filter(e => e && e.trim());
      if (emailsToCreate.length === 0) {
        throw new Error('Cliente deve ter pelo menos um email válido');
      }
    } else if (email && email.trim()) {
      emailsToCreate = [email.trim()];
    } else {
      throw new Error('Cliente deve ter pelo menos um email');
    }

    try {
      // Criar cliente base
      const { data: clientBasic, error: clientError } = await supabase
        .from('clients')
        .insert([{
          email: emailsToCreate[0] || null,
          phone: phone || null,
          street,
          number,
          complement: complement || null,
          neighborhood,
          city,
          state,
          zipcode
        }])
        .select('*')
        .single();

      if (clientError) {
        console.error('Erro ao criar cliente base:', clientError);
        throw clientError;
      }

      // Inserir dados PJ
      const { error: pjError } = await supabase
        .from('clients_pj')
        .insert([{
          client_id: clientBasic.id,
          cnpj: cnpj ? cnpj.replace(/\D/g, '') : null,
          company_name,
          trade_name: trade_name || null,
          employee_count: employee_count || null,
          business_segment: business_segment || null
        }]);

      if (pjError) {
        await supabase.from('clients').delete().eq('id', clientBasic.id);
        console.error('Erro ao criar cliente PJ:', pjError);
        throw pjError;
      }

      // Criar emails na tabela client_emails
      if (emailsToCreate.length > 0) {
        try {
          await ClientEmailModel.addMultipleEmails(clientBasic.id, emailsToCreate);
        } catch (emailError) {
          await supabase.from('clients').delete().eq('id', clientBasic.id);
          console.error('Erro ao criar emails do cliente:', emailError);
          throw emailError;
        }
      }

      const client = await this.findById(clientBasic.id);
      return client;
    } catch (error) {
      console.error('Erro no create:', error);
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
          clients_pj(cnpj, company_name, trade_name, employee_count, business_segment),
          client_emails(id, email, is_primary)
        `)
        .order('created_at', { ascending: false });

      if (filters.city) {
        query = query.eq('city', filters.city);
      }

      if (filters.state) {
        query = query.eq('state', filters.state);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar clientes:', error);
        throw error;
      }

      // Filtrar por search
      let filteredData = data || [];
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const searchDigitsOnly = filters.search.replace(/\D/g, '');

        filteredData = filteredData.filter(client => {
          if (client.email && client.email.toLowerCase().includes(searchTerm)) return true;
          if (client.city && client.city.toLowerCase().includes(searchTerm)) return true;

          if (client.clients_pj) {
            if (client.clients_pj.company_name && client.clients_pj.company_name.toLowerCase().includes(searchTerm)) return true;
            if (client.clients_pj.trade_name && client.clients_pj.trade_name.toLowerCase().includes(searchTerm)) return true;
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
        const name = client.clients_pj
          ? (client.clients_pj.trade_name || client.clients_pj.company_name || '')
          : '';

        const emails = (client.client_emails || [])
          .sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return 0;
          });

        const primaryEmail = emails.find(email => email.is_primary);

        return {
          ...client,
          type: 'PJ',
          name,
          emails: emails.map(e => ({ id: e.id, email: e.email, is_primary: e.is_primary })),
          primary_email: primaryEmail?.email || client.email,
          ...(client.clients_pj || {}),
          clients_pj: undefined,
          client_emails: undefined
        };
      });

      return formattedData;
    } catch (error) {
      console.error('Erro no findAll:', error);
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
          clients_pj(cnpj, company_name, trade_name, employee_count, business_segment),
          client_emails(id, email, is_primary)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Erro ao buscar cliente por ID:', error);
        throw error;
      }

      const name = data.clients_pj
        ? (data.clients_pj.trade_name || data.clients_pj.company_name || '')
        : '';

      const emails = (data.client_emails || [])
        .sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return 0;
        });

      const primaryEmail = emails.find(email => email.is_primary);

      return {
        ...data,
        type: 'PJ',
        name,
        emails: emails.map(e => ({ id: e.id, email: e.email, is_primary: e.is_primary })),
        primary_email: primaryEmail?.email || data.email,
        ...(data.clients_pj || {}),
        clients_pj: undefined,
        client_emails: undefined
      };
    } catch (error) {
      console.error('Erro no findById:', error);
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
        emails,
        phone,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipcode,
        employee_count,
        business_segment,
        cnpj,
        company_name,
        trade_name
      } = clientData;

      const currentClient = await this.findById(id);
      if (!currentClient) {
        throw new Error('Cliente não encontrado');
      }

      // Preparar emails para atualização
      let emailsToUpdate = [];
      if (emails && Array.isArray(emails) && emails.length > 0) {
        emailsToUpdate = emails.filter(e => e && e.trim());
        if (emailsToUpdate.length === 0) {
          throw new Error('Cliente deve ter pelo menos um email válido');
        }
      } else if (email && email.trim()) {
        emailsToUpdate = [email.trim()];
      } else {
        throw new Error('Cliente deve ter pelo menos um email');
      }

      // Atualizar dados básicos
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
          zipcode
        })
        .eq('id', id);

      if (clientError) {
        console.error('Erro ao atualizar cliente base:', clientError);
        throw clientError;
      }

      // Atualizar dados PJ
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
        console.error('Erro ao atualizar cliente PJ:', pjError);
        throw pjError;
      }

      // Atualizar emails
      if (emailsToUpdate.length > 0) {
        try {
          await ClientEmailModel.replaceAllEmails(id, emailsToUpdate);
        } catch (emailError) {
          console.error('Erro ao atualizar emails do cliente:', emailError);
          throw emailError;
        }
      }

      const updatedClient = await this.findById(id);
      return updatedClient;
    } catch (error) {
      console.error('Erro no update:', error);
      throw error;
    }
  }

  /**
   * Excluir cliente (soft delete)
   */
  async softDelete(id) {
    try {
      const client = await this.findById(id);
      if (!client) {
        throw new Error('Cliente não encontrado');
      }
      console.log('Soft delete ainda não implementado para clientes');
      return true;
    } catch (error) {
      console.error('Erro no softDelete:', error);
      throw error;
    }
  }

  /**
   * Excluir cliente permanentemente
   */
  async hardDelete(id) {
    try {
      const { data: contracts, error: contractError } = await supabase
        .from('contracts')
        .select('id')
        .eq('client_id', id)
        .limit(1);

      if (contractError) {
        console.error('Erro ao verificar contratos:', contractError);
        throw contractError;
      }

      if (contracts && contracts.length > 0) {
        throw new Error('Não é possível excluir o cliente pois existem contratos associados.');
      }

      const { data: proposals, error: proposalError } = await supabase
        .from('proposals')
        .select('id')
        .eq('client_id', id)
        .limit(1);

      if (proposalError) {
        console.error('Erro ao verificar propostas:', proposalError);
        throw proposalError;
      }

      if (proposals && proposals.length > 0) {
        throw new Error('Não é possível excluir o cliente pois existem propostas associadas.');
      }

      // Ordem correta de exclusão
      await supabase.from('client_attachments').delete().eq('client_id', id);
      await supabase.from('client_emails').delete().eq('client_id', id);
      await supabase.from('clients_pj').delete().eq('client_id', id);

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao excluir cliente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Erro no hardDelete:', error);
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
          clients_pj(client_id)
        `);

      if (error) {
        console.error('Erro ao buscar estatísticas:', error);
        throw error;
      }

      const total = clients?.length || 0;

      const byCity = {};
      (clients || []).forEach(client => {
        if (client.city) {
          byCity[client.city] = (byCity[client.city] || 0) + 1;
        }
      });

      const byState = {};
      (clients || []).forEach(client => {
        if (client.state) {
          byState[client.state] = (byState[client.state] || 0) + 1;
        }
      });

      return {
        total,
        byCity,
        byState
      };
    } catch (error) {
      console.error('Erro no getStats:', error);
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
        console.error('Erro ao buscar cidades:', error);
        throw error;
      }

      const uniqueCities = [...new Set((data || []).map(item => item.city))];
      return uniqueCities.filter(city => city && city.trim());
    } catch (error) {
      console.error('Erro no getCities:', error);
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
        console.error('Erro ao buscar estados:', error);
        throw error;
      }

      const uniqueStates = [...new Set((data || []).map(item => item.state))];
      return uniqueStates.filter(state => state && state.trim());
    } catch (error) {
      console.error('Erro no getStates:', error);
      throw error;
    }
  }
}

module.exports = new ClientModel();
