const { supabase } = require('../config/database');

class ClientEmailModel {
  /**
   * Criar novo email para cliente
   */
  async create(emailData) {
    const { client_id, email, is_primary = false } = emailData;

    try {
      // Se for definido como primary, primeiro remover primary de outros emails
      if (is_primary) {
        await this.clearPrimaryEmails(client_id);
      }

      const { data, error } = await supabase
        .from('client_emails')
        .insert([{
          client_id,
          email: email.toLowerCase().trim(),
          is_primary,
          is_active: true
        }])
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao criar email do cliente:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no create:', error);
      throw error;
    }
  }

  /**
   * Buscar todos os emails de um cliente
   */
  async findByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from('client_emails')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao buscar emails do cliente:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Erro no findByClientId:', error);
      throw error;
    }
  }

  /**
   * Buscar email primário de um cliente
   */
  async findPrimaryByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from('client_emails')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Erro ao buscar email primário:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Erro no findPrimaryByClientId:', error);
      throw error;
    }
  }

  /**
   * Atualizar email
   */
  async update(id, emailData) {
    const { email, is_primary } = emailData;

    try {
      // Se estiver definindo como primary, primeiro remover primary de outros
      if (is_primary) {
        const currentEmail = await this.findById(id);
        if (currentEmail) {
          await this.clearPrimaryEmails(currentEmail.client_id, id);
        }
      }

      const updateData = {};
      if (email !== undefined) {
        updateData.email = email.toLowerCase().trim();
      }
      if (is_primary !== undefined) {
        updateData.is_primary = is_primary;
      }
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('client_emails')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar email:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  /**
   * Buscar email por ID
   */
  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('client_emails')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Erro ao buscar email por ID:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Erro no findById:', error);
      throw error;
    }
  }

  /**
   * Definir email como primário
   */
  async setPrimary(id) {
    try {
      const email = await this.findById(id);
      if (!email) {
        throw new Error('Email não encontrado');
      }

      // Remover primary de outros emails do mesmo cliente
      await this.clearPrimaryEmails(email.client_id, id);

      // Definir este email como primary
      const { data, error } = await supabase
        .from('client_emails')
        .update({ 
          is_primary: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao definir email como primário:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no setPrimary:', error);
      throw error;
    }
  }

  /**
   * Remover status primário de todos os emails de um cliente (exceto um específico)
   */
  async clearPrimaryEmails(clientId, excludeId = null) {
    try {
      let query = supabase
        .from('client_emails')
        .update({ 
          is_primary: false,
          updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId)
        .eq('is_primary', true);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { error } = await query;

      if (error) {
        console.error('❌ Erro ao limpar emails primários:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no clearPrimaryEmails:', error);
      throw error;
    }
  }

  /**
   * Desativar email (soft delete)
   */
  async softDelete(id) {
    try {
      const email = await this.findById(id);
      if (!email) {
        throw new Error('Email não encontrado');
      }

      // Verificar se é um cliente PJ e se tem outros emails ativos
      const { data: clientType } = await supabase
        .from('clients_pj')
        .select('client_id')
        .eq('client_id', email.client_id)
        .single();

      if (clientType) {
        // É um cliente PJ, verificar se tem outros emails ativos
        const activeEmails = await this.findByClientId(email.client_id);
        if (activeEmails.length <= 1) {
          throw new Error('Clientes PJ devem ter pelo menos um email ativo');
        }

        // Se for o email primário, definir outro como primário
        if (email.is_primary) {
          const otherEmails = activeEmails.filter(e => e.id !== id);
          if (otherEmails.length > 0) {
            await this.setPrimary(otherEmails[0].id);
          }
        }
      }

      const { data, error } = await supabase
        .from('client_emails')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao desativar email:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no softDelete:', error);
      throw error;
    }
  }

  /**
   * Excluir email permanentemente
   */
  async hardDelete(id) {
    try {
      const email = await this.findById(id);
      if (!email) {
        throw new Error('Email não encontrado');
      }

      // Verificar se é um cliente PJ e se tem outros emails
      const { data: clientType } = await supabase
        .from('clients_pj')
        .select('client_id')
        .eq('client_id', email.client_id)
        .single();

      if (clientType) {
        const activeEmails = await this.findByClientId(email.client_id);
        if (activeEmails.length <= 1) {
          throw new Error('Clientes PJ devem ter pelo menos um email');
        }
      }

      const { error } = await supabase
        .from('client_emails')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir email permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete:', error);
      throw error;
    }
  }

  /**
   * Adicionar múltiplos emails para um cliente
   */
  async addMultipleEmails(clientId, emails) {
    try {
      const emailsData = emails.map((email, index) => ({
        client_id: clientId,
        email: email.toLowerCase().trim(),
        is_primary: index === 0, // Primeiro email é primário
        is_active: true
      }));

      // Se há emails sendo adicionados e o primeiro é primário, limpar outros primários
      if (emailsData.length > 0 && emailsData[0].is_primary) {
        await this.clearPrimaryEmails(clientId);
      }

      const { data, error } = await supabase
        .from('client_emails')
        .insert(emailsData)
        .select('*');

      if (error) {
        console.error('❌ Erro ao adicionar múltiplos emails:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no addMultipleEmails:', error);
      throw error;
    }
  }

  /**
   * Substituir todos os emails de um cliente
   */
  async replaceAllEmails(clientId, emails) {
    try {
      // Primeiro, desativar todos os emails existentes
      await supabase
        .from('client_emails')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId);

      // Depois, adicionar os novos emails
      if (emails && emails.length > 0) {
        return await this.addMultipleEmails(clientId, emails);
      }

      return [];
    } catch (error) {
      console.error('❌ Erro no replaceAllEmails:', error);
      throw error;
    }
  }
}

module.exports = new ClientEmailModel();