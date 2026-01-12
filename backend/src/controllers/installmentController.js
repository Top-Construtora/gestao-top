const ContractInstallment = require('../models/ContractInstallment');
const Contract = require('../models/Contract');
const NotificationService = require('../services/notificationService');
const Joi = require('joi');

class InstallmentController {
  /**
   * Listar parcelas de um contrato
   */
  async listByContract(req, res) {
    try {
      const { contractId } = req.params;

      // Verificar se o usuário tem acesso ao contrato
      const contract = await Contract.findById(contractId, req.user);
      if (!contract) {
        return res.status(404).json({
          error: 'Contrato não encontrado ou sem permissão de acesso'
        });
      }

      const installments = await ContractInstallment.findByContractId(contractId);

      res.json({
        installments,
        stats: await ContractInstallment.getInstallmentStats(contractId)
      });
    } catch (error) {
      console.error('❌ Erro ao listar parcelas:', error);
      res.status(500).json({
        error: 'Erro ao listar parcelas'
      });
    }
  }

  /**
   * Criar parcelas para um contrato
   */
  async create(req, res) {
    try {
      const { contractId } = req.params;
      const { installments } = req.body;

      // Validar dados
      const schema = Joi.object({
        installments: Joi.array().items(
          Joi.object({
            due_date: Joi.date().required(),
            amount: Joi.number().positive().required(),
            payment_status: Joi.string().valid('pago', 'pendente').default('pendente'),
            paid_date: Joi.date().allow(null),
            paid_amount: Joi.number().positive().allow(null),
            notes: Joi.string().allow('', null)
          })
        ).min(1).required()
      });

      const { error, value } = schema.validate({ installments });
      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      // Verificar se o usuário tem acesso ao contrato
      const contract = await Contract.findById(contractId, req.user);
      if (!contract) {
        return res.status(404).json({
          error: 'Contrato não encontrado ou sem permissão de acesso'
        });
      }

      // Remover parcelas antigas se existirem
      await ContractInstallment.deleteByContractId(contractId);

      // Criar novas parcelas
      const createdInstallments = await ContractInstallment.createInstallments(
        contractId,
        value.installments
      );

      res.status(201).json({
        message: 'Parcelas criadas com sucesso',
        installments: createdInstallments
      });
    } catch (error) {
      console.error('❌ Erro ao criar parcelas:', error);
      res.status(500).json({
        error: 'Erro ao criar parcelas'
      });
    }
  }

  /**
   * Atualizar status de uma parcela
   */
  async updateStatus(req, res) {
    try {
      const { installmentId } = req.params;
      const { payment_status, paid_date, paid_amount, notes } = req.body;

      // Validar dados
      const schema = Joi.object({
        payment_status: Joi.string().valid('pago', 'pendente', 'atrasado').required(),
        paid_date: Joi.date().when('payment_status', {
          is: 'pago',
          then: Joi.required(),
          otherwise: Joi.allow(null)
        }),
        paid_amount: Joi.number().positive().when('payment_status', {
          is: 'pago',
          then: Joi.required(),
          otherwise: Joi.allow(null)
        }),
        notes: Joi.string().allow('', null)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      // Buscar parcela para verificar permissão
      const { data: installment, error: fetchError } = await require('../config/database').supabase
        .from('contract_installments')
        .select('*, contract:contracts(*)')
        .eq('id', installmentId)
        .single();

      if (fetchError || !installment) {
        return res.status(404).json({
          error: 'Parcela não encontrada'
        });
      }

      // Verificar permissão através do contrato
      const contract = await Contract.findById(installment.contract_id, req.user);
      if (!contract) {
        return res.status(403).json({
          error: 'Sem permissão para atualizar esta parcela'
        });
      }

      // Atualizar status
      const updatedInstallment = await ContractInstallment.updateInstallmentStatus(
        installmentId,
        value
      );

      // Se marcou como paga, notificar
      if (value.payment_status === 'pago') {
        await NotificationService.notifyInstallmentPaid(
          installment.contract_id,
          installmentId,
          req.user.id
        );
      }

      res.json({
        message: 'Status da parcela atualizado com sucesso',
        installment: updatedInstallment
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar status da parcela:', error);
      res.status(500).json({
        error: 'Erro ao atualizar status da parcela'
      });
    }
  }

  /**
   * Marcar parcela como paga
   */
  async markAsPaid(req, res) {
    try {
      const { installmentId } = req.params;
      const { paid_amount, paid_date } = req.body;

      // Validar dados
      const schema = Joi.object({
        paid_amount: Joi.number().positive().required(),
        paid_date: Joi.date().default(() => new Date())
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      // Buscar parcela para verificar permissão
      const { data: installment, error: fetchError } = await require('../config/database').supabase
        .from('contract_installments')
        .select('*, contract:contracts(*)')
        .eq('id', installmentId)
        .single();

      if (fetchError || !installment) {
        return res.status(404).json({
          error: 'Parcela não encontrada'
        });
      }

      // Verificar permissão
      const contract = await Contract.findById(installment.contract_id, req.user);
      if (!contract) {
        return res.status(403).json({
          error: 'Sem permissão para atualizar esta parcela'
        });
      }

      // Marcar como paga
      const updatedInstallment = await ContractInstallment.markAsPaid(
        installmentId,
        value.paid_amount,
        value.paid_date
      );

      // Notificar sobre pagamento
      await NotificationService.notifyInstallmentPaid(
        installment.contract_id,
        installmentId,
        req.user.id
      );

      res.json({
        message: 'Parcela marcada como paga com sucesso',
        installment: updatedInstallment
      });
    } catch (error) {
      console.error('❌ Erro ao marcar parcela como paga:', error);
      res.status(500).json({
        error: 'Erro ao marcar parcela como paga'
      });
    }
  }

  /**
   * Gerar parcelas automaticamente
   */
  async generateInstallments(req, res) {
    try {
      const { contractId } = req.params;
      const { total_value, installment_count, first_due_date, interval_days } = req.body;

      // Validar dados
      const schema = Joi.object({
        total_value: Joi.number().positive().required(),
        installment_count: Joi.number().integer().min(1).max(60).required(),
        first_due_date: Joi.date().required(),
        interval_days: Joi.number().integer().min(1).default(30)
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: error.details[0].message
        });
      }

      // Verificar permissão
      const contract = await Contract.findById(contractId, req.user);
      if (!contract) {
        return res.status(404).json({
          error: 'Contrato não encontrado ou sem permissão de acesso'
        });
      }

      // Gerar parcelas
      const installments = ContractInstallment.generateInstallments(
        value.total_value,
        value.installment_count,
        value.first_due_date,
        value.interval_days
      );

      // Remover parcelas antigas
      await ContractInstallment.deleteByContractId(contractId);

      // Criar novas parcelas
      const createdInstallments = await ContractInstallment.createInstallments(
        contractId,
        installments
      );

      res.json({
        message: 'Parcelas geradas com sucesso',
        installments: createdInstallments
      });
    } catch (error) {
      console.error('❌ Erro ao gerar parcelas:', error);
      res.status(500).json({
        error: 'Erro ao gerar parcelas'
      });
    }
  }

  /**
   * Buscar parcelas vencidas
   */
  async getOverdue(req, res) {
    try {
      const overdueInstallments = await ContractInstallment.findOverdueInstallments();

      res.json({
        installments: overdueInstallments,
        count: overdueInstallments.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar parcelas vencidas:', error);
      res.status(500).json({
        error: 'Erro ao buscar parcelas vencidas'
      });
    }
  }

  /**
   * Estatísticas de parcelas
   */
  async getStats(req, res) {
    try {
      const { contractId } = req.query;
      const stats = await ContractInstallment.getInstallmentStats(contractId);

      res.json(stats);
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      res.status(500).json({
        error: 'Erro ao buscar estatísticas'
      });
    }
  }

  /**
   * Atualizar parcelas vencidas
   */
  async updateOverdueStatus(req, res) {
    try {
      const updatedInstallments = await ContractInstallment.updateOverdueStatus();

      res.json({
        message: 'Status das parcelas vencidas atualizado',
        updated: updatedInstallments.length,
        installments: updatedInstallments
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar parcelas vencidas:', error);
      res.status(500).json({
        error: 'Erro ao atualizar parcelas vencidas'
      });
    }
  }
}

module.exports = new InstallmentController();