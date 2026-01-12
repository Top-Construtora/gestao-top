const { supabase } = require('../config/database');

class ContractInstallmentModel {
  /**
   * Criar parcelas para um contrato
   */
  async createInstallments(contractId, installments) {
    try {
      const installmentsData = installments.map((installment, index) => ({
        contract_id: contractId,
        installment_number: index + 1,
        due_date: installment.due_date,
        amount: installment.amount,
        payment_status: 'pendente',
        notes: installment.notes || null
      }));

      const { data, error } = await supabase
        .from('contract_installments')
        .insert(installmentsData)
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao criar parcelas:', error);
      throw error;
    }
  }

  /**
   * Buscar parcelas de um contrato
   */
  async findByContractId(contractId) {
    try {
      const { data, error } = await supabase
        .from('contract_installments')
        .select('*')
        .eq('contract_id', contractId)
        .order('installment_number');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar parcelas:', error);
      throw error;
    }
  }

  /**
   * Atualizar status de uma parcela
   */
  async updateInstallmentStatus(installmentId, statusData) {
    try {
      const updateData = {
        ...statusData,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('contract_installments')
        .update(updateData)
        .eq('id', installmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar parcela:', error);
      throw error;
    }
  }

  /**
   * Marcar parcela como paga
   */
  async markAsPaid(installmentId, paidAmount, paidDate = null) {
    try {
      const updateData = {
        payment_status: 'pago',
        paid_amount: paidAmount,
        paid_date: paidDate || new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('contract_installments')
        .update(updateData)
        .eq('id', installmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao marcar parcela como paga:', error);
      throw error;
    }
  }

  /**
   * Buscar parcelas vencidas
   */
  async findOverdueInstallments() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('contract_installments')
        .select(`
          *,
          contract:contracts(
            contract_number,
            client:clients(
              clients_pf(full_name),
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .eq('payment_status', 'pendente')
        .lt('due_date', today)
        .order('due_date');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar parcelas vencidas:', error);
      throw error;
    }
  }

  /**
   * Buscar parcelas por período
   */
  async findByDateRange(startDate, endDate, status = null) {
    try {
      let query = supabase
        .from('contract_installments')
        .select(`
          *,
          contract:contracts(
            contract_number,
            client:clients(
              clients_pf(full_name),
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date');

      if (status) {
        query = query.eq('payment_status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar parcelas por período:', error);
      throw error;
    }
  }

  /**
   * Remover todas as parcelas de um contrato
   */
  async deleteByContractId(contractId) {
    try {
      const { error } = await supabase
        .from('contract_installments')
        .delete()
        .eq('contract_id', contractId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('❌ Erro ao remover parcelas:', error);
      throw error;
    }
  }

  /**
   * Estatísticas de parcelas
   */
  async getInstallmentStats(contractId = null) {
    try {
      let query = supabase
        .from('contract_installments')
        .select('payment_status, amount');

      if (contractId) {
        query = query.eq('contract_id', contractId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const stats = {
        total: data.length,
        pending: data.filter(i => i.payment_status === 'pendente').length,
        paid: data.filter(i => i.payment_status === 'pago').length,
        overdue: data.filter(i => i.payment_status === 'atrasado').length,
        totalAmount: data.reduce((sum, i) => sum + (i.amount || 0), 0),
        pendingAmount: data.filter(i => i.payment_status === 'pendente').reduce((sum, i) => sum + (i.amount || 0), 0),
        paidAmount: data.filter(i => i.payment_status === 'pago').reduce((sum, i) => sum + (i.amount || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('❌ Erro ao calcular estatísticas de parcelas:', error);
      throw error;
    }
  }

  /**
   * Atualizar status de parcelas vencidas
   */
  async updateOverdueStatus() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('contract_installments')
        .update({ 
          payment_status: 'atrasado',
          updated_at: new Date().toISOString()
        })
        .eq('payment_status', 'pendente')
        .lt('due_date', today)
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao atualizar parcelas vencidas:', error);
      throw error;
    }
  }

  /**
   * Gerar parcelas automaticamente baseado em parâmetros
   */
  generateInstallments(totalValue, installmentCount, firstDueDate, intervalDays = 30) {
    const installments = [];
    const installmentValue = totalValue / installmentCount;
    let currentDate = new Date(firstDueDate);

    for (let i = 0; i < installmentCount; i++) {
      installments.push({
        due_date: currentDate.toISOString().split('T')[0],
        amount: installmentValue,
        notes: `Parcela ${i + 1} de ${installmentCount}`
      });

      // Próxima data (soma intervalDays)
      currentDate = new Date(currentDate.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
    }

    return installments;
  }

  /**
   * Atualizar parcelas em lote (bulk update)
   */
  async updateBulk(contractId, installments) {
    try {
      // Primeiro, deletar todas as parcelas existentes do contrato
      await this.deleteByContractId(contractId);

      // Criar novas parcelas
      const installmentsData = installments.map((installment, index) => ({
        contract_id: contractId,
        installment_number: index + 1,
        due_date: installment.due_date,
        amount: installment.amount,
        payment_status: installment.payment_status || 'pendente',
        paid_date: installment.paid_date || null,
        paid_amount: installment.paid_amount || null,
        notes: installment.notes || null
      }));

      const { data, error } = await supabase
        .from('contract_installments')
        .insert(installmentsData)
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar parcelas em lote:', error);
      throw error;
    }
  }
}

module.exports = new ContractInstallmentModel();