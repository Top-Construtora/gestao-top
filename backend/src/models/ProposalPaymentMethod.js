const { supabase } = require('../config/database');

class ProposalPaymentMethodModel {
  /**
   * Criar nova forma de pagamento para proposta
   */
  async create(paymentData) {
    const { 
      proposal_id,
      payment_method,
      value_type = 'percentage',
      percentage,
      fixed_value,
      sort_order = 1
    } = paymentData;

    try {
      const { data, error } = await supabase
        .from('proposal_payment_methods')
        .insert([{
          proposal_id,
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
      console.error('❌ Erro ao criar forma de pagamento da proposta:', error);
      throw error;
    }
  }

  /**
   * Buscar todas as formas de pagamento de uma proposta
   */
  async findByProposalId(proposalId) {
    try {
      const { data, error } = await supabase
        .from('proposal_payment_methods')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar formas de pagamento da proposta:', error);
      throw error;
    }
  }

  /**
   * Atualizar forma de pagamento
   */
  async update(id, paymentData) {
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
        .from('proposal_payment_methods')
        .update(updateObject)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar forma de pagamento da proposta:', error);
      throw error;
    }
  }

  /**
   * Deletar forma de pagamento
   */
  async delete(id) {
    try {
      const { error } = await supabase
        .from('proposal_payment_methods')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao deletar forma de pagamento da proposta:', error);
      throw error;
    }
  }

  /**
   * Validar se percentuais somam 100% para uma proposta
   */
  async validatePercentages(proposalId) {
    try {
      const { data, error } = await supabase
        .from('proposal_payment_methods')
        .select('percentage')
        .eq('proposal_id', proposalId)
        .eq('value_type', 'percentage')
        .eq('is_active', true);

      if (error) throw error;

      const total = (data || []).reduce((sum, pm) => sum + (pm.percentage || 0), 0);
      
      return {
        isValid: Math.abs(total - 100) < 0.01,
        total,
        difference: 100 - total
      };
    } catch (error) {
      console.error('❌ Erro ao validar percentuais da proposta:', error);
      throw error;
    }
  }
}

module.exports = new ProposalPaymentMethodModel();