const { supabase } = require('../config/database');

class ClientPhoneModel {
  /**
   * Criar novo telefone para cliente
   */
  async create(phoneData) {
    const { client_id, phone, is_primary = false } = phoneData;

    try {
      // Se for definido como primary, primeiro remover primary de outros telefones
      if (is_primary) {
        await this.clearPrimaryPhones(client_id);
      }

      const { data, error } = await supabase
        .from('client_phones')
        .insert([{
          client_id,
          phone: phone.trim(),
          is_primary,
          is_active: true
        }])
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao criar telefone do cliente:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no create:', error);
      throw error;
    }
  }

  /**
   * Buscar todos os telefones de um cliente
   */
  async findByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from('client_phones')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao buscar telefones do cliente:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Erro no findByClientId:', error);
      throw error;
    }
  }

  /**
   * Buscar telefone primário de um cliente
   */
  async findPrimaryByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from('client_phones')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Erro ao buscar telefone primário:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Erro no findPrimaryByClientId:', error);
      throw error;
    }
  }

  /**
   * Atualizar telefone
   */
  async update(id, phoneData) {
    const { phone, is_primary } = phoneData;

    try {
      // Se estiver definindo como primary, primeiro remover primary de outros
      if (is_primary) {
        const currentPhone = await this.findById(id);
        if (currentPhone) {
          await this.clearPrimaryPhones(currentPhone.client_id, id);
        }
      }

      const updateData = {};
      if (phone !== undefined) {
        updateData.phone = phone.trim();
      }
      if (is_primary !== undefined) {
        updateData.is_primary = is_primary;
      }
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('client_phones')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar telefone:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no update:', error);
      throw error;
    }
  }

  /**
   * Buscar telefone por ID
   */
  async findById(id) {
    try {
      const { data, error } = await supabase
        .from('client_phones')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Erro ao buscar telefone por ID:', error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Erro no findById:', error);
      throw error;
    }
  }

  /**
   * Definir telefone como primário
   */
  async setPrimary(id) {
    try {
      const phone = await this.findById(id);
      if (!phone) {
        throw new Error('Telefone não encontrado');
      }

      // Remover primary de outros telefones do mesmo cliente
      await this.clearPrimaryPhones(phone.client_id, id);

      // Definir este telefone como primary
      const { data, error } = await supabase
        .from('client_phones')
        .update({ 
          is_primary: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao definir telefone como primário:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no setPrimary:', error);
      throw error;
    }
  }

  /**
   * Remover status primário de todos os telefones de um cliente (exceto um específico)
   */
  async clearPrimaryPhones(clientId, excludeId = null) {
    try {
      let query = supabase
        .from('client_phones')
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
        console.error('❌ Erro ao limpar telefones primários:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no clearPrimaryPhones:', error);
      throw error;
    }
  }

  /**
   * Desativar telefone (soft delete)
   */
  async softDelete(id) {
    try {
      const phone = await this.findById(id);
      if (!phone) {
        throw new Error('Telefone não encontrado');
      }

      // Verificar se é o último telefone ativo do cliente
      const activePhones = await this.findByClientId(phone.client_id);
      if (activePhones.length <= 1) {
        throw new Error('Cliente deve ter pelo menos um telefone ativo');
      }

      // Se for o telefone primário, definir outro como primário
      if (phone.is_primary) {
        const otherPhones = activePhones.filter(p => p.id !== id);
        if (otherPhones.length > 0) {
          await this.setPrimary(otherPhones[0].id);
        }
      }

      const { data, error } = await supabase
        .from('client_phones')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao desativar telefone:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no softDelete:', error);
      throw error;
    }
  }

  /**
   * Excluir telefone permanentemente
   */
  async hardDelete(id) {
    try {
      const phone = await this.findById(id);
      if (!phone) {
        throw new Error('Telefone não encontrado');
      }

      // Verificar se é o último telefone do cliente
      const activePhones = await this.findByClientId(phone.client_id);
      if (activePhones.length <= 1) {
        throw new Error('Cliente deve ter pelo menos um telefone');
      }

      const { error } = await supabase
        .from('client_phones')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Erro ao excluir telefone permanentemente:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Erro no hardDelete:', error);
      throw error;
    }
  }

  /**
   * Adicionar múltiplos telefones para um cliente
   */
  async addMultiplePhones(clientId, phones) {
    try {
      const phonesData = phones.map((phone, index) => ({
        client_id: clientId,
        phone: phone.trim(),
        is_primary: index === 0, // Primeiro telefone é primário
        is_active: true
      }));

      // Se há telefones sendo adicionados e o primeiro é primário, limpar outros primários
      if (phonesData.length > 0 && phonesData[0].is_primary) {
        await this.clearPrimaryPhones(clientId);
      }

      const { data, error } = await supabase
        .from('client_phones')
        .insert(phonesData)
        .select('*');

      if (error) {
        console.error('❌ Erro ao adicionar múltiplos telefones:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Erro no addMultiplePhones:', error);
      throw error;
    }
  }

  /**
   * Substituir todos os telefones de um cliente
   */
  async replaceAllPhones(clientId, phones) {
    try {
      // Primeiro, desativar todos os telefones existentes
      await supabase
        .from('client_phones')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('client_id', clientId);

      // Depois, adicionar os novos telefones
      if (phones && phones.length > 0) {
        return await this.addMultiplePhones(clientId, phones);
      }

      return [];
    } catch (error) {
      console.error('❌ Erro no replaceAllPhones:', error);
      throw error;
    }
  }
}

module.exports = new ClientPhoneModel();