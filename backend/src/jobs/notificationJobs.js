const Contract = require('../models/Contract');
const NotificationService = require('../services/notificationService');

class NotificationJobs {
  /**
   * Verificar contratos que estão próximos do vencimento
   */
  async checkExpiringContracts() {
    try {
      
      const today = new Date();
      const in30Days = new Date();
      in30Days.setDate(today.getDate() + 30);
      
      const in7Days = new Date();
      in7Days.setDate(today.getDate() + 7);

      // Buscar contratos que expiram nos próximos 30 dias
      const { data: expiringContracts, error } = await require('../config/database').supabase
        .from('contracts')
        .select('id, contract_number, end_date')
        .not('end_date', 'is', null)
        .lte('end_date', in30Days.toISOString().split('T')[0])
        .gte('end_date', today.toISOString().split('T')[0])
        .eq('status', 'active')
        .eq('is_active', true);

      if (error) {
        console.error('❌ Erro ao buscar contratos expirando:', error);
        return;
      }

      if (!expiringContracts || expiringContracts.length === 0) {
        return;
      }


      for (const contract of expiringContracts) {
        const endDate = new Date(contract.end_date);
        const daysUntilExpiration = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        
        // Só notificar em marcos específicos: 30, 15, 7, 3, 1 dias
        if ([30, 15, 7, 3, 1].includes(daysUntilExpiration)) {
          console.log(`📅 Notificando vencimento do contrato ${contract.contract_number} em ${daysUntilExpiration} dias`);
          await NotificationService.notifyContractExpiring(contract.id, daysUntilExpiration);
        }
      }

      console.log('✅ Verificação de contratos expirando concluída');
    } catch (error) {
      console.error('❌ Erro ao verificar contratos expirando:', error);
    }
  }

  /**
   * Verificar pagamentos em atraso
   */
  async checkOverduePayments() {
    try {
      
      const today = new Date();

      // Buscar contratos com pagamentos em atraso
      const { data: overdueContracts, error } = await require('../config/database').supabase
        .from('contracts')
        .select('id, contract_number, expected_payment_date')
        .not('expected_payment_date', 'is', null)
        .lt('expected_payment_date', today.toISOString().split('T')[0])
        .eq('payment_status', 'pendente')
        .eq('status', 'active')
        .eq('is_active', true);

      if (error) {
        console.error('❌ Erro ao buscar pagamentos em atraso:', error);
        return;
      }

      if (!overdueContracts || overdueContracts.length === 0) {
        return;
      }

      console.log(`📊 Encontrados ${overdueContracts.length} pagamentos em atraso`);

      for (const contract of overdueContracts) {
        const expectedDate = new Date(contract.expected_payment_date);
        const daysOverdue = Math.ceil((today - expectedDate) / (1000 * 60 * 60 * 24));
        
        // Notificar a cada 7 dias de atraso
        if (daysOverdue % 7 === 0) {
          console.log(`💰 Notificando pagamento em atraso do contrato ${contract.contract_number} há ${daysOverdue} dias`);
          await NotificationService.notifyPaymentOverdue(contract.id, daysOverdue);
        }
      }

      console.log('✅ Verificação de pagamentos em atraso concluída');
    } catch (error) {
      console.error('❌ Erro ao verificar pagamentos em atraso:', error);
    }
  }

  /**
   * Executar todos os jobs de notificação
   */
  async runAll() {
    await this.checkExpiringContracts();
    await this.checkOverduePayments();
  }
}

module.exports = new NotificationJobs();