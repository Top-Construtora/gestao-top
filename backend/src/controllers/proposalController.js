const ProposalModel = require('../models/Proposal');
const ClientModel = require('../models/Client');
const ServiceModel = require('../models/Service');
const proposalService = require('../services/proposalService');
const { validateCreateProposal, validateUpdateProposal } = require('../utils/validators');
const Joi = require('joi');

class ProposalController {
  /**
   * Listar propostas
   */
  async index(req, res) {
    try {
      const filters = {
        is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
        status: req.query.status,
        client_id: req.query.client_id,
        search: req.query.search,
        expired_only: req.query.expired_only === 'true'
      };

      // Remover filtros vazios
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === '') {
          delete filters[key];
        }
      });

      const proposals = await ProposalModel.findAll(filters);

      res.json({
        success: true,
        data: proposals,
        total: proposals.length
      });
    } catch (error) {
      console.error('❌ Erro ao listar propostas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Buscar proposta por ID
   */
  async show(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      const proposal = await ProposalModel.findById(parseInt(id));

      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      res.json({
        success: true,
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao buscar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Criar nova proposta
   */
  async store(req, res) {
    try {
      console.log('📝 Recebendo dados para criar proposta:', req.body);
      console.log('👤 Usuário:', req.user);

      // Validação dos dados
      const { error, value } = validateCreateProposal(req.body);

      if (error) {
        console.error('❌ Erro de validação Joi:', error.details);
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        });
      }

      const client = await ClientModel.findById(value.client_id);
      if (!client) {
        console.error('❌ Cliente não encontrado:', { client_id: value.client_id, client });
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }

      for (const service of value.services) {
        const serviceData = await ServiceModel.findById(service.service_id);
        if (!serviceData || !serviceData.is_active) {
          console.error('❌ Serviço não encontrado ou inativo:', { service_id: service.service_id, serviceData });
          return res.status(404).json({
            success: false,
            message: `Serviço com ID ${service.service_id} não encontrado ou inativo`
          });
        }
      }

      const userId = req.user.id;
      console.log('👤 Criando proposta com userId:', userId);
      const proposal = await ProposalModel.create(value, userId);

      res.status(201).json({
        success: true,
        message: 'Proposta criada com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao criar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Atualizar proposta
   */
  async update(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Verificar se a proposta existe
      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      // Validação dos dados
      const { error, value } = validateUpdateProposal(req.body);

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

      // Verificar se todos os serviços existem (se fornecidos)
      if (value.services) {
        for (const service of value.services) {
          const serviceData = await ServiceModel.findById(service.service_id);
          if (!serviceData || !serviceData.is_active) {
            return res.status(404).json({
              success: false,
              message: `Serviço com ID ${service.service_id} não encontrado ou inativo`
            });
          }
        }
      }

      const userId = req.user.id;
      const proposal = await ProposalModel.update(parseInt(id), value, userId);

      res.json({
        success: true,
        message: 'Proposta atualizada com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Alterar status da proposta
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      const schema = Joi.object({
        status: Joi.string().valid('draft', 'sent', 'signed', 'rejected', 'expired', 'converted').required()
      });

      const { error } = schema.validate({ status });

      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Status inválido',
          validStatuses: ['draft', 'sent', 'signed', 'rejected', 'expired', 'converted']
        });
      }

      // Verificar se a proposta existe
      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;
      const proposal = await ProposalModel.updateStatus(parseInt(id), status, userId);

      res.json({
        success: true,
        message: 'Status da proposta atualizado com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Duplicar proposta
   */
  async duplicate(req, res) {
    try {
      const { id } = req.params;
      const duplicateData = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Validação dos dados de duplicação
      const schema = Joi.object({
        client_id: Joi.number().integer().positive().required(),
        type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção').required(),
        end_date: Joi.date().iso().optional(),
        max_installments: Joi.number().integer().min(1).max(24).optional(),
        vista_discount_percentage: Joi.number().min(0).max(100).optional(),
        prazo_discount_percentage: Joi.number().min(0).max(100).optional(),
        solicitante_name: Joi.string().max(255).optional().allow(''),
        solicitante_email: Joi.string().email().optional().allow(''),
        solicitante_phone: Joi.string().max(50).optional().allow(''),
        duplicate_services: Joi.boolean().optional(),
        duplicate_terms: Joi.boolean().optional(),
        duplicate_recruitment_percentages: Joi.boolean().optional()
      });

      const { error, value } = schema.validate(duplicateData);

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

      const userId = req.user.id;
      const proposal = await ProposalModel.duplicate(parseInt(id), value, userId);

      res.status(201).json({
        success: true,
        message: 'Proposta duplicada com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao duplicar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Excluir proposta permanentemente
   */
  async destroy(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Verificar se a proposta existe
      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;
      await ProposalModel.softDelete(parseInt(id), userId);

      res.json({
        success: true,
        message: 'Proposta excluída permanentemente com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao excluir proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Estatísticas das propostas
   */
  async stats(req, res) {
    try {
      const stats = await ProposalModel.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Enviar proposta por email
   */
  async sendProposal(req, res) {
    try {
      const { id } = req.params;
      const { email, subject, message } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Validação dos dados do email
      const schema = Joi.object({
        email: Joi.string().email().required()
          .messages({
            'string.email': 'Email deve ter um formato válido',
            'any.required': 'Email é obrigatório'
          }),
        subject: Joi.string().max(255).optional(),
        message: Joi.string().max(1000).optional()
      });

      const { error, value } = schema.validate({ email, subject, message });

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

      // Verificar se a proposta existe
      const proposal = await ProposalModel.findById(parseInt(id));
      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;
      const result = await proposalService.sendProposal(parseInt(id), value, userId);

      res.json({
        success: true,
        message: result.message,
        data: { sentTo: result.sentTo }
      });
    } catch (error) {
      console.error('❌ Erro ao enviar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Gerar PDF da proposta
   */
  async generatePDF(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Verificar se a proposta existe
      const proposal = await ProposalModel.findById(parseInt(id));
      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const pdfDoc = await proposalService.generateProposalPDF(parseInt(id));
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="proposta-${proposal.client_name.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
      
      pdfDoc.pipe(res);
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Preparar proposta para envio (gerar link público)
   */
  async prepareForSending(req, res) {
    try {
      console.log('🚀 [Controller] Iniciando prepareForSending');
      const { id } = req.params;
      console.log('📨 [Controller] ID recebido:', id);
      console.log('👤 [Controller] Usuário:', req.user?.id);

      if (!id || isNaN(parseInt(id))) {
        console.log('❌ [Controller] ID inválido');
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        console.log('❌ [Controller] Proposta não encontrada');
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;
      const proposal = await proposalService.prepareProposalForSending(parseInt(id), {}, userId);

      res.json({
        success: true,
        message: 'Link público gerado com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ [Controller] Erro ao preparar proposta:', error);
      console.error('❌ [Controller] Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Corrigir propostas sem link único (endpoint temporário)
   */
  async fixProposalsWithoutLinks(req, res) {
    try {
      const count = await ProposalModel.updateProposalsWithoutLinks();
      
      res.json({
        success: true,
        message: `${count} propostas foram atualizadas com links únicos`,
        count
      });
    } catch (error) {
      console.error('❌ Erro ao corrigir propostas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Gerar novo token público para a proposta
   */
  async regeneratePublicToken(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Verificar se a proposta existe
      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;
      const proposal = await proposalService.regeneratePublicToken(parseInt(id), userId);

      res.json({
        success: true,
        message: 'Token público regenerado com sucesso',
        data: { public_token: proposal.public_token }
      });
    } catch (error) {
      console.error('❌ Erro ao regenerar token:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Marcar proposta como convertida
   */
  async markConverted(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID da proposta é obrigatório e deve ser um número'
        });
      }

      // Verificar se a proposta existe
      const existingProposal = await ProposalModel.findById(parseInt(id));
      if (!existingProposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada'
        });
      }

      const userId = req.user.id;

      // Sempre marcar como 'converted' quando uma proposta é convertida em contrato
      // Independente do status anterior (signed ou contraproposta)
      const proposal = await ProposalModel.updateStatus(parseInt(id), 'converted', userId);

      // Adicionar o ID do contrato convertido se fornecido
      if (req.body.converted_to_contract_id) {
        await ProposalModel.updateConvertedContract(parseInt(id), req.body.converted_to_contract_id);
      }

      res.json({
        success: true,
        message: 'Proposta marcada como convertida com sucesso',
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao marcar proposta como convertida:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * ENDPOINTS PÚBLICOS - Não requerem autenticação
   */

  /**
   * Buscar proposta por token público (acesso do cliente)
   */
  async getPublicProposal(req, res) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Token é obrigatório'
        });
      }

      const proposal = await ProposalModel.findByPublicTokenComplete(token);

      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada ou expirada'
        });
      }

      // Registrar visualização
      await ProposalModel.recordView(proposal.id, {
        viewed_at: new Date(),
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        metadata: {
          referer: req.headers.referer,
          language: req.headers['accept-language']
        }
      });

      res.json({
        success: true,
        data: proposal
      });
    } catch (error) {
      console.error('❌ Erro ao buscar proposta pública:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Atualizar seleção de serviços pelo cliente
   */
  async updateServiceSelection(req, res) {
    try {
      const { token } = req.params;
      const { selected_services, client_info } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Token é obrigatório'
        });
      }

      // Validação
      const schema = Joi.object({
        selected_services: Joi.array().items(
          Joi.object({
            service_id: Joi.number().integer().positive().required(),
            selected: Joi.boolean().required(),
            client_notes: Joi.string().max(500).optional().allow('')
          })
        ).min(1).required(),
        client_info: Joi.object({
          name: Joi.string().min(2).max(255).optional(),
          notes: Joi.string().max(1000).optional().allow('')
        }).optional()
      });

      const { error, value } = schema.validate({ selected_services, client_info });

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

      // Verificar se a proposta existe
      const proposal = await ProposalModel.findByPublicToken(token);
      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada ou expirada'
        });
      }

      // Atualizar seleção de serviços
      const updatedServices = await ProposalModel.updateServiceSelection(
        proposal.id, 
        value.selected_services, 
        value.client_info
      );

      res.json({
        success: true,
        message: 'Seleção de serviços atualizada com sucesso',
        data: { services: updatedServices }
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar seleção:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Assinar proposta digitalmente
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
        accepted_value 
      } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Token é obrigatório'
        });
      }

      // Validação
      const schema = Joi.object({
        signature_data: Joi.string().required()
          .messages({
            'any.required': 'Assinatura é obrigatória'
          }),
        client_name: Joi.string().min(2).max(255).required()
          .messages({
            'any.required': 'Nome é obrigatório'
          }),
        client_email: Joi.string().email().required()
          .messages({
            'string.email': 'Email deve ter formato válido',
            'any.required': 'Email é obrigatório'
          }),
        client_phone: Joi.string().min(10).max(50).optional().allow(''),
        client_document: Joi.string().min(11).max(50).optional().allow(''),
        client_observations: Joi.string().max(1000).optional().allow(''),
        accepted_value: Joi.number().integer().min(0).required()
          .messages({
            'any.required': 'Valor aceito é obrigatório'
          })
      });

      const { error, value } = schema.validate({
        signature_data, client_name, client_email, client_phone, 
        client_document, client_observations, accepted_value
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

      // Verificar se a proposta existe
      const proposal = await ProposalModel.findByPublicToken(token);
      if (!proposal) {
        return res.status(404).json({
          success: false,
          message: 'Proposta não encontrada ou expirada'
        });
      }

      if (proposal.status !== 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Proposta não está disponível para assinatura'
        });
      }

      // Mapear os dados do signatário para o formato esperado
      const signatureDataWithSigner = {
        signature_data: value.signature_data,
        signer_name: value.client_name,
        signer_email: value.client_email,
        signer_phone: value.client_phone,
        signer_document: value.client_document,
        signer_observations: value.client_observations || '',
        signed_ip: req.ip || req.connection.remoteAddress
      };

      // Assinar a proposta
      const signedProposal = await ProposalModel.signProposal(proposal.id, signatureDataWithSigner);

      res.json({
        success: true,
        message: 'Proposta assinada com sucesso',
        data: signedProposal
      });
    } catch (error) {
      console.error('❌ Erro ao assinar proposta:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new ProposalController();