const { supabase } = require('../config/database');

class ContractPaymentMethodModel {
  /**
   * Criar nova forma de pagamento para contrato
   */
  async create(paymentData, userId) {
    const { 
      contract_id,
      payment_method,
      value_type = 'percentage',
      percentage,
      fixed_value,
      sort_order = 1
    } = paymentData;

    try {
      const { data, error } = await supabase
        .from('contract_payment_methods')
        .insert([{
          contract_id,
          payment_method,
          value_type,
          percentage: value_type === 'percentage' ? percentage : null,
          fixed_value: value_type === 'fixed_value' ? fixed_value : null,
          sort_order,
          is_active: true
        }])
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao criar forma de pagamento:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as formas de pagamento de um contrato
   */
  async findByContractId(contractId) {
    try {
      const { data, error } = await supabase
        .from('contract_payment_methods')
        .select('*')
        .eq('contract_id', contractId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar formas de pagamento:', error);
      throw error;
    }
  }

  /**
   * Atualizar forma de pagamento
   */
  async update(id, paymentData, userId) {
    try {
      const { 
        payment_method,
        value_type,
        percentage,
        fixed_value,
        sort_order,
        is_active
      } = paymentData;

      const updateObject = {};

      if (payment_method !== undefined) updateObject.payment_method = payment_method;
      if (value_type !== undefined) updateObject.value_type = value_type;
      if (sort_order !== undefined) updateObject.sort_order = sort_order;
      if (is_active !== undefined) updateObject.is_active = is_active;

      // Configurar valores baseado no tipo
      if (value_type === 'percentage') {
        updateObject.percentage = percentage;
        updateObject.fixed_value = null;
      } else if (value_type === 'fixed_value') {
        updateObject.fixed_value = fixed_value;
        updateObject.percentage = null;
      }

      const { data, error } = await supabase
        .from('contract_payment_methods')
        .update(updateObject)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar forma de pagamento:', error);
      throw error;
    }
  }

  /**
   * Deletar forma de pagamento
   */
  async delete(id) {
    try {
      const { error } = await supabase
        .from('contract_payment_methods')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao deletar forma de pagamento:', error);
      throw error;
    }
  }

  /**
   * Reordenar formas de pagamento
   */
  async reorder(contractId, paymentMethodIds) {
    try {
      for (let i = 0; i < paymentMethodIds.length; i++) {
        const { error } = await supabase
          .from('contract_payment_methods')
          .update({ sort_order: i + 1 })
          .eq('id', paymentMethodIds[i])
          .eq('contract_id', contractId);

        if (error) throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao reordenar formas de pagamento:', error);
      throw error;
    }
  }

  /**
   * Validar se percentuais somam 100% para um contrato
   */
  async validatePercentages(contractId) {
    try {
      const { data, error } = await supabase
        .from('contract_payment_methods')
        .select('percentage')
        .eq('contract_id', contractId)
        .eq('value_type', 'percentage')
        .eq('is_active', true);

      if (error) throw error;

      const total = (data || []).reduce((sum, pm) => sum + (pm.percentage || 0), 0);
      
      return {
        isValid: Math.abs(total - 100) < 0.01, // Permite pequenas diferenças de arredondamento
        total,
        difference: 100 - total
      };
    } catch (error) {
      console.error('❌ Erro ao validar percentuais:', error);
      throw error;
    }
  }
}

module.exports = new ContractPaymentMethodModel();