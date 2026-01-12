const ContractPaymentMethod = require('../models/ContractPaymentMethod');
const Joi = require('joi');

// Validações
const validatePaymentMethod = (data) => {
  const schema = Joi.object({
    payment_method: Joi.string().min(1).max(100).required(),
    value_type: Joi.string().valid('percentage', 'fixed_value').default('percentage'),
    percentage: Joi.when('value_type', {
      is: 'percentage',
      then: Joi.number().min(0).max(100).required(),
      otherwise: Joi.forbidden()
    }),
    fixed_value: Joi.when('value_type', {
      is: 'fixed_value', 
      then: Joi.number().min(0).required(),
      otherwise: Joi.forbidden()
    }),
    sort_order: Joi.number().integer().min(1).default(1)
  });

  return schema.validate(data);
};

class PaymentMethodController {
  /**
   * Listar formas de pagamento de um contrato
   */
  async listContractPaymentMethods(req, res, next) {
    try {
      const contractId = parseInt(req.params.contractId);
      if (!contractId) {
        return res.status(400).json({ error: 'ID do contrato inválido' });
      }

      const paymentMethods = await ContractPaymentMethod.findByContractId(contractId);
      
      res.json({ 
        payment_methods: paymentMethods,
        total: paymentMethods.length 
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar nova forma de pagamento para contrato
   */
  async createContractPaymentMethod(req, res, next) {
    try {
      const contractId = parseInt(req.params.contractId);
      if (!contractId) {
        return res.status(400).json({ error: 'ID do contrato inválido' });
      }

      const { error, value } = validatePaymentMethod(req.body);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const paymentMethod = await ContractPaymentMethod.create({
        ...value,
        contract_id: contractId
      }, req.user.id);

      // Validar percentuais se necessário
      if (value.value_type === 'percentage') {
        const validation = await ContractPaymentMethod.validatePercentages(contractId);
        if (!validation.isValid) {
          console.warn(`⚠️ Percentuais não somam 100%: ${validation.total}% (diferença: ${validation.difference}%)`);
        }
      }

      res.status(201).json({
        message: 'Forma de pagamento criada com sucesso',
        payment_method: paymentMethod
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar forma de pagamento do contrato
   */
  async updateContractPaymentMethod(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'ID da forma de pagamento inválido' });
      }

      const { error, value } = validatePaymentMethod(req.body);
      if (error) {
        return res.status(400).json({ 
          error: error.details[0].message 
        });
      }

      const paymentMethod = await ContractPaymentMethod.update(id, value, req.user.id);

      res.json({
        message: 'Forma de pagamento atualizada com sucesso',
        payment_method: paymentMethod
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar forma de pagamento do contrato
   */
  async deleteContractPaymentMethod(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'ID da forma de pagamento inválido' });
      }

      await ContractPaymentMethod.delete(id);

      res.json({ message: 'Forma de pagamento removida com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reordenar formas de pagamento
   */
  async reorderContractPaymentMethods(req, res, next) {
    try {
      const contractId = parseInt(req.params.contractId);
      const { payment_method_ids } = req.body;

      if (!contractId || !Array.isArray(payment_method_ids)) {
        return res.status(400).json({ 
          error: 'ID do contrato e lista de IDs das formas de pagamento são obrigatórios' 
        });
      }

      await ContractPaymentMethod.reorder(contractId, payment_method_ids);

      res.json({ message: 'Formas de pagamento reordenadas com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validar percentuais de um contrato
   */
  async validateContractPercentages(req, res, next) {
    try {
      const contractId = parseInt(req.params.contractId);
      if (!contractId) {
        return res.status(400).json({ error: 'ID do contrato inválido' });
      }

      const validation = await ContractPaymentMethod.validatePercentages(contractId);

      res.json({
        validation,
        message: validation.isValid 
          ? 'Percentuais válidos' 
          : `Percentuais somam ${validation.total}%. Diferença: ${validation.difference}%`
      });
    } catch (error) {
      next(error);
    }
  }

  // Proposals now use single payment method only - no multiple payment methods
}

module.exports = new PaymentMethodController();