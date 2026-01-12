const ProposalModel = require('../models/Proposal');
const proposalService = require('../services/proposalService');
const { isValidProposalToken } = require('../utils/tokenGenerator');
const Joi = require('joi');

class PublicProposalController {
  /**
   * Visualizar proposta por token público
   * Endpoint público - não requer autenticação
   */
  async viewByToken(req, res) {
    try {
      const { token } = req.params;
      console.log('🔍 PublicProposal Controller - viewByToken chamado');
      console.log('🔍 Token recebido:', token);
      console.log('🔍 Token length:', token ? token.length : 0);
      console.log('🔍 URL completa:', req.originalUrl);
      console.log('🔍 Method:', req.method);

      // Validar formato do token
      if (!isValidProposalToken(token)) {
        console.log('❌ Token inválido - formato:', token);
        console.log('❌ Token pattern test:', /^prop_[a-f0-9]{32,}$/.test(token));
        return res.status(400).json({
          success: false,
          message: 'Token inválido'
        });
      }

      // Registrar visualização
      const clientInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent'),
        viewed_at: new Date()
      };

      // Buscar proposta pelo token
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      
      // Registrar visualização (ignorar erros)
      if (proposal) {
        try {
          await ProposalModel.recordView(proposal.id, clientInfo);
        } catch (viewError) {
          console.log('⚠️ Erro ao registrar visualização (ignorado):', viewError.message);
        }
      }

      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada ou expirada'
        });
      }

      // Verificar se a proposta está em status que permite visualização
      const allowedStatuses = ['draft', 'sent', 'signed', 'rejected', 'contraproposta'];
      if (!allowedStatuses.includes(proposal.status)) {
        return res.status(403).json({
          success: false,
          message: 'Esta proposta não está disponível para visualização'
        });
      }

      // Remover informações sensíveis antes de enviar
      const publicProposal = {
        id: proposal.id,
        proposal_number: proposal.proposal_number,
        type: proposal.type,
        status: proposal.status,
        total_value: proposal.total_value,
        valor_global: proposal.valor_global, // Adicionar valor global
        usar_valor_global: proposal.usar_valor_global || false, // Adicionar flag de uso
        end_date: proposal.end_date,
        signed_at: proposal.updated_at, // Using updated_at as signed_at is not in DB
        signature_data: proposal.signature_data,
        created_at: proposal.created_at,
        max_installments: proposal.max_installments || 12,
        vista_discount_percentage: proposal.vista_discount_percentage || 0,
        prazo_discount_percentage: proposal.prazo_discount_percentage || 0,
        vista_discount_value: proposal.vista_discount_value || 0,
        prazo_discount_value: proposal.prazo_discount_value || 0,
        solicitante_name: proposal.solicitante_name,
        solicitante_email: proposal.solicitante_email,
        client: proposal.client,
        services: proposal.services.map(service => ({
          id: service.id,
          service_id: service.service_id,
          service_name: service.service_name,
          service_description: service.service_description,
          unit_value: service.unit_value,
          total_value: service.total_value,
          selected_by_client: service.selected_by_client,
          client_notes: service.client_notes,
          recruitmentPercentages: service.recruitmentPercentages,
          service: service.service
        }))
      };

      res.json({
        success: true,
        data: publicProposal
      });
    } catch (error) {
      console.error('❌ Erro ao visualizar proposta pública:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao carregar proposta'
      });
    }
  }

  /**
   * Selecionar serviços da proposta
   * Endpoint público - não requer autenticação JWT
   */
  async selectServices(req, res) {
    try {
      const { token } = req.params;
      const { selectedServices, client_observations } = req.body;

      // Validar formato do token
      if (!isValidProposalToken(token)) {
        return res.status(400).json({
          success: false,
          message: 'Token inválido'
        });
      }

      // Validação dos dados
      const schema = Joi.object({
        selectedServices: Joi.array().items(
          Joi.object({
            service_id: Joi.number().integer().positive().required(),
            selected: Joi.boolean().required(),
            client_notes: Joi.string().max(500).optional().allow('')
          })
        ).min(1).required(),
        client_observations: Joi.string().max(1000).optional().allow('')
      });

      const { error, value } = schema.validate({ selectedServices, client_observations });

      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }

      const clientInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent')
      };

      const result = await proposalService.updateServiceSelection(token, value, clientInfo);

      res.json({
        success: true,
        message: 'Seleção de serviços atualizada com sucesso',
        data: result
      });
    } catch (error) {
      console.error('❌ Erro ao selecionar serviços:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao processar seleção de serviços'
      });
    }
  }

  /**
   * Assinar proposta eletronicamente
   * Endpoint público - não requer autenticação JWT
   */
  async signProposal(req, res) {
    try {
      const { token } = req.params;
      const { 
        signature_data, 
        client_name, 
        client_email, 
        client_phone, 
        client_document,
        client_observations,
        payment_type,
        payment_method,
        installments,
        final_value,
        discount_applied,
        is_counterproposal,
        selected_services
      } = req.body;

      // Validar formato do token
      if (!isValidProposalToken(token)) {
        return res.status(400).json({
          success: false,
          message: 'Token inválido'
        });
      }

      // Primeiro, buscar a proposta para obter max_installments
      const proposal = await ProposalModel.findByPublicToken(token);
      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada ou token inválido'
        });
      }

      // Usar max_installments da proposta (padrão 12 se não definido)
      const maxInstallments = proposal.max_installments || 12;

      // Para propostas de R&S, final_value pode ser 0 (será calculado após aprovação do candidato)
      const isRecruitment = proposal.type === 'Recrutamento & Seleção';

      // Validação dos dados
      const schema = Joi.object({
        signature_data: Joi.string().required()
          .messages({
            'any.required': 'Assinatura é obrigatória'
          }),
        client_name: Joi.string().min(2).max(255).required()
          .messages({
            'string.min': 'Nome deve ter pelo menos 2 caracteres',
            'any.required': 'Nome é obrigatório'
          }),
        client_email: Joi.string().email().required()
          .messages({
            'string.email': 'Email deve ter um formato válido',
            'any.required': 'Email é obrigatório'
          }),
        client_phone: Joi.string().min(10).max(50).optional().allow(''),
        client_document: Joi.string().min(11).max(50).optional().allow(''),
        client_observations: Joi.string().max(1000).optional().allow(''),
        payment_type: Joi.string().valid('vista', 'prazo').optional(),
        payment_method: Joi.string().valid('PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Pix Parcelado').optional(),
        installments: Joi.number().integer().min(1).max(maxInstallments).optional()
          .messages({
            'number.max': `Número máximo de parcelas para esta proposta é ${maxInstallments}`
          }),
        // Para R&S, permitir valor 0 ou positivo. Para outros tipos, apenas positivo
        final_value: isRecruitment
          ? Joi.number().min(0).optional()
          : Joi.number().positive().optional(),
        discount_applied: Joi.number().min(0).optional()
      });

      const { error, value } = schema.validate({ 
        signature_data, 
        client_name, 
        client_email, 
        client_phone, 
        client_document,
        client_observations,
        payment_type,
        payment_method,
        installments,
        final_value,
        discount_applied
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }

      const clientInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent')
      };

      // Mapear os dados do signatário para o formato esperado pelo modelo
      const signatureDataWithSigner = {
        signature_data: value.signature_data,
        signer_name: value.client_name,
        signer_email: value.client_email,
        signer_phone: value.client_phone || '',
        signer_document: value.client_document || '',
        signer_observations: value.client_observations || '',
        payment_type: value.payment_type || null,
        payment_method: value.payment_method || null,
        installments: value.installments && value.installments >= 1 ? value.installments : 1,
        final_value: value.final_value || null,
        discount_applied: value.discount_applied || 0
      };

      const result = await proposalService.signProposal(token, signatureDataWithSigner, clientInfo, is_counterproposal, selected_services);

      res.json({
        success: true,
        message: 'Proposta assinada com sucesso',
        data: result
      });
    } catch (error) {
      console.error('❌ Erro ao assinar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao processar assinatura da proposta'
      });
    }
  }

  /**
   * Confirmar e finalizar proposta
   * Endpoint público - não requer autenticação JWT
   */
  async confirmProposal(req, res) {
    try {
      const { token } = req.params;
      const { client_observations } = req.body;

      // Validar formato do token
      if (!isValidProposalToken(token)) {
        return res.status(400).json({
          success: false,
          message: 'Token inválido'
        });
      }

      const clientInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent'),
        confirmed_at: new Date()
      };

      const result = await proposalService.confirmProposal(token, { client_observations }, clientInfo);

      res.json({
        success: true,
        message: 'Proposta confirmada com sucesso! Em breve entraremos em contato.',
        data: result
      });
    } catch (error) {
      console.error('❌ Erro ao confirmar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao confirmar proposta'
      });
    }
  }

  /**
   * Rejeitar proposta
   * Endpoint público - não requer autenticação JWT
   */
  async rejectProposal(req, res) {
    try {
      const { token } = req.params;
      const { rejection_reason } = req.body;

      // Validar formato do token
      if (!isValidProposalToken(token)) {
        return res.status(400).json({
          success: false,
          message: 'Token inválido'
        });
      }

      const clientInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent'),
        rejected_at: new Date()
      };

      const result = await proposalService.rejectProposal(token, { rejection_reason }, clientInfo);

      res.json({
        success: true,
        message: 'Proposta rejeitada. Obrigado pelo seu tempo.',
        data: result
      });
    } catch (error) {
      console.error('❌ Erro ao rejeitar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao processar rejeição da proposta'
      });
    }
  }
}

module.exports = new PublicProposalController();