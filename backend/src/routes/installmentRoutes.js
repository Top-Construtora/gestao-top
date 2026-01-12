const express = require('express');
const router = express.Router();
const ContractInstallment = require('../models/ContractInstallment');
const authMiddleware = require('../middleware/authMiddleware');
const Contract = require('../models/Contract');

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);

/**
 * GET /contracts/:contractId/installments
 * Buscar parcelas de um contrato
 */
router.get('/contracts/:contractId/installments', async (req, res) => {
  try {
    const contractId = parseInt(req.params.contractId);

    // Verificar se o usuário tem acesso ao contrato
    const contract = await Contract.findById(contractId, req.user);
    if (!contract) {
      return res.status(404).json({
        error: 'Contrato não encontrado ou sem permissão de acesso'
      });
    }

    const installments = await ContractInstallment.findByContractId(contractId);
    const stats = await ContractInstallment.getInstallmentStats(contractId);

    res.json({
      installments,
      total: installments.length,
      stats
    });
  } catch (error) {
    console.error('Erro ao buscar parcelas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * PUT /installments/:id/status
 * Atualizar status de uma parcela
 */
router.put('/installments/:id/status', async (req, res) => {
  try {
    const installmentId = parseInt(req.params.id);
    const { payment_status, paid_amount, paid_date, notes } = req.body;

    // Validar dados
    if (!['pago', 'pendente', 'atrasado'].includes(payment_status)) {
      return res.status(400).json({
        error: 'Status deve ser: pago, pendente ou atrasado'
      });
    }

    const updateData = { payment_status };
    
    if (payment_status === 'pago') {
      if (!paid_amount) {
        return res.status(400).json({
          error: 'Valor pago é obrigatório quando status for "pago"'
        });
      }
      updateData.paid_amount = paid_amount;
      updateData.paid_date = paid_date || new Date().toISOString().split('T')[0];
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updatedInstallment = await ContractInstallment.updateInstallmentStatus(
      installmentId,
      updateData
    );

    res.json({
      message: 'Status da parcela atualizado com sucesso',
      installment: updatedInstallment
    });
  } catch (error) {
    console.error('Erro ao atualizar status da parcela:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * PUT /installments/:id/pay
 * Marcar parcela como paga
 */
router.put('/installments/:id/pay', async (req, res) => {
  try {
    const installmentId = parseInt(req.params.id);
    const { paid_amount, paid_date } = req.body;

    if (!paid_amount || paid_amount <= 0) {
      return res.status(400).json({
        error: 'Valor pago deve ser maior que zero'
      });
    }

    const updatedInstallment = await ContractInstallment.markAsPaid(
      installmentId,
      paid_amount,
      paid_date
    );

    res.json({
      message: 'Parcela marcada como paga',
      installment: updatedInstallment
    });
  } catch (error) {
    console.error('Erro ao marcar parcela como paga:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /installments/overdue
 * Buscar parcelas vencidas
 */
router.get('/installments/overdue', async (req, res) => {
  try {
    const overdueInstallments = await ContractInstallment.findOverdueInstallments();
    
    res.json({
      installments: overdueInstallments,
      total: overdueInstallments.length
    });
  } catch (error) {
    console.error('Erro ao buscar parcelas vencidas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /installments/date-range
 * Buscar parcelas por período
 */
router.get('/installments/date-range', async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Data de início e fim são obrigatórias'
      });
    }

    const installments = await ContractInstallment.findByDateRange(
      start_date,
      end_date,
      status
    );

    res.json({
      installments,
      total: installments.length,
      filters: { start_date, end_date, status }
    });
  } catch (error) {
    console.error('Erro ao buscar parcelas por período:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /installments/stats
 * Estatísticas de parcelas
 */
router.get('/installments/stats', async (req, res) => {
  try {
    const { contract_id } = req.query;
    const contractId = contract_id ? parseInt(contract_id) : null;
    
    const stats = await ContractInstallment.getInstallmentStats(contractId);
    
    res.json({ stats });
  } catch (error) {
    console.error('Erro ao obter estatísticas de parcelas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * POST /installments/update-overdue
 * Atualizar status de parcelas vencidas para "atrasado"
 */
router.post('/installments/update-overdue', async (req, res) => {
  try {
    const updatedInstallments = await ContractInstallment.updateOverdueStatus();

    res.json({
      message: `${updatedInstallments.length} parcelas marcadas como atrasadas`,
      updated: updatedInstallments.length
    });
  } catch (error) {
    console.error('Erro ao atualizar parcelas vencidas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * PUT /contracts/:contractId/installments
 * Atualizar todas as parcelas de um contrato
 */
router.put('/contracts/:contractId/installments', async (req, res) => {
  try {
    const contractId = parseInt(req.params.contractId);
    const { installments } = req.body;

    // Verificar se o usuário tem acesso ao contrato
    const contract = await Contract.findById(contractId, req.user);
    if (!contract) {
      return res.status(404).json({
        error: 'Contrato não encontrado ou sem permissão de acesso'
      });
    }

    // Validar dados
    if (!installments || !Array.isArray(installments)) {
      return res.status(400).json({
        error: 'Lista de parcelas é obrigatória'
      });
    }

    // Atualizar todas as parcelas
    const updatedInstallments = await ContractInstallment.updateBulk(contractId, installments);

    res.json({
      message: 'Parcelas atualizadas com sucesso',
      installments: updatedInstallments
    });
  } catch (error) {
    console.error('Erro ao atualizar parcelas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;