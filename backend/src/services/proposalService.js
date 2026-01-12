const ProposalModel = require('../models/Proposal');
const CompanyModel = require('../models/Company');
const ServiceModel = require('../models/Service');
const emailService = require('./emailService');
const { generateProposalToken } = require('../utils/tokenGenerator');
const { supabase } = require('../config/database');
const path = require('path');
const fs = require('fs');

class ProposalService {
  /**
   * Remove tags HTML de uma string
   * @param {string} html - String com tags HTML
   * @returns {string} String sem tags HTML
   */
  stripHtmlTags(html) {
    if (!html) return '';
    // Remove todas as tags HTML mas mantém o conteúdo
    return html
      .replace(/<br\s*\/?>/gi, '\n')  // Converte <br> em quebra de linha
      .replace(/<\/p>/gi, '\n\n')      // Converte </p> em duas quebras de linha
      .replace(/<\/li>/gi, '\n')       // Converte </li> em quebra de linha
      .replace(/<li>/gi, '• ')         // Converte <li> em bullet point
      .replace(/<[^>]*>/g, '')         // Remove todas as outras tags
      .replace(/&nbsp;/g, ' ')         // Converte &nbsp; em espaço
      .replace(/&amp;/g, '&')          // Converte &amp; em &
      .replace(/&lt;/g, '<')           // Converte &lt; em <
      .replace(/&gt;/g, '>')           // Converte &gt; em >
      .replace(/&quot;/g, '"')         // Converte &quot; em "
      .replace(/&#39;/g, "'")          // Converte &#39; em '
      .trim();
  }
  /**
   * Enviar proposta por email
   */
  async sendProposal(proposalId, emailData, userId) {
    try {
      // Buscar proposta completa
      const proposal = await ProposalModel.findById(proposalId);
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      // Note: Sistema agora trabalha com clientes, não empresas
      // O email será enviado para o cliente ou email especificado

      // Atualizar status da proposta para 'sent' e gerar token
      const updatedProposal = await ProposalModel.updateStatus(proposalId, 'sent', userId);

      // Construir URL pública da proposta
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const proposalPublicUrl = `${frontendUrl}/proposal/view/${updatedProposal.public_token}`;

      // Preparar dados do email
      const emailOptions = {
        to: emailData.email || proposal.client.email,
        subject: emailData.subject || `Proposta Comercial - ${proposal.client.name}`,
        template: 'proposal',
        data: {
          proposalTitle: `Proposta para ${proposal.client.name}`,
          clientName: proposal.client.name,
          totalValue: this.formatCurrency(proposal.total_value),
          validUntil: proposal.end_date ? new Date(proposal.end_date).toLocaleDateString('pt-BR') : null,
          services: proposal.services.map(s => ({
            name: s.service.name,
            quantity: s.quantity,
            value: this.formatCurrency(s.custom_value || s.service.value),
            total: this.formatCurrency((s.custom_value || s.service.value) * s.quantity)
          })),
          observations: proposal.observations,
          customMessage: emailData.message || '',
          proposalUrl: proposalPublicUrl
        }
      };

      // Enviar email
      await emailService.sendEmail(emailOptions);

      return {
        success: true,
        message: 'Proposta enviada com sucesso',
        sentTo: emailOptions.to,
        publicUrl: proposalPublicUrl
      };
    } catch (error) {
      console.error('❌ Erro ao enviar proposta:', error);
      throw error;
    }
  }

  /**
   * Gerar PDF da proposta
   */
  async generateProposalPDF(proposalId) {
    try {
      const proposal = await ProposalModel.findById(proposalId);
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true,
        info: {
          Title: `Proposta Comercial - ${proposal.client_name}`,
          Author: 'TOP Construtora',
          Subject: 'Proposta Comercial',
          Keywords: 'proposta, consultoria, serviços'
        }
      });

      // Cores e estilos
      const colors = {
        primary: '#003b2b',
        secondary: '#666666',
        text: '#333333',
        lightGray: '#f5f5f5',
        border: '#cccccc'
      };

      // Adicionar logo
      const logoPath = path.join(__dirname, '../../public/logoTOP.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, { width: 100 });
      }

      // Título da proposta
      doc.fillColor(colors.primary)
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PROPOSTA COMERCIAL', 170, 50);

      // Número da proposta
      doc.fillColor(colors.secondary)
         .fontSize(10)
         .font('Helvetica')
         .text(`Proposta Nº ${proposal.proposal_number}`, 170, 80);

      // Data
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 170, 95);

      // Validade
      if (proposal.end_date) {
        doc.text(`Válida até: ${new Date(proposal.end_date).toLocaleDateString('pt-BR')}`, 170, 110);
      }

      // Linha divisora
      doc.moveTo(50, 140)
         .lineTo(doc.page.width - 50, 140)
         .lineWidth(2)
         .strokeColor(colors.primary)
         .stroke();

      // Informações do Cliente
      doc.fillColor(colors.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('DADOS DO CLIENTE', 50, 160);

      doc.fillColor(colors.text)
         .fontSize(11)
         .font('Helvetica');

      // Box com informações do cliente
      const clientBoxY = 185;
      doc.rect(50, clientBoxY, doc.page.width - 100, 60)
         .fillAndStroke(colors.lightGray, colors.border);

      doc.fillColor(colors.text)
         .text(`Cliente: ${proposal.client_name}`, 60, clientBoxY + 10);

      if (proposal.company && proposal.company.name) {
        doc.text(`Empresa: ${proposal.company.name}`, 60, clientBoxY + 25);
      }

      if (proposal.type) {
        doc.text(`Tipo de Proposta: ${proposal.type}`, 60, clientBoxY + 40);
      }

      // Descrição da proposta (se houver)
      let yPosition = 270;
      if (proposal.description) {
        doc.fillColor(colors.primary)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('APRESENTAÇÃO', 50, yPosition);

        yPosition += 25;

        const cleanDescription = this.stripHtmlTags(proposal.description);
        doc.fillColor(colors.text)
           .fontSize(10)
           .font('Helvetica')
           .text(cleanDescription, 50, yPosition, {
             width: doc.page.width - 100,
             align: 'justify'
           });

        yPosition = doc.y + 30;
      }

      // Serviços
      doc.fillColor(colors.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('SERVIÇOS INCLUSOS', 50, yPosition);

      yPosition += 25;

      // Cabeçalho da tabela de serviços
      const tableHeaderY = yPosition;
      doc.rect(50, tableHeaderY, doc.page.width - 100, 25)
         .fillAndStroke(colors.primary, colors.primary);

      doc.fillColor('#FFFFFF')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('#', 55, tableHeaderY + 8, { width: 30 })
         .text('Serviço', 85, tableHeaderY + 8, { width: 250 })
         .text('Qtd', 335, tableHeaderY + 8, { width: 40, align: 'center' })
         .text('Valor Unit.', 375, tableHeaderY + 8, { width: 80, align: 'right' })
         .text('Total', 455, tableHeaderY + 8, { width: 80, align: 'right' });

      yPosition = tableHeaderY + 30;

      // Listagem dos serviços
      doc.fillColor(colors.text)
         .font('Helvetica');

      proposal.services.forEach((service, index) => {
        // Verificar se precisa de nova página
        if (yPosition > doc.page.height - 150) {
          doc.addPage();
          yPosition = 50;

          // Adicionar cabeçalho na nova página
          doc.fillColor(colors.primary)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text('SERVIÇOS INCLUSOS (continuação)', 50, yPosition);

          yPosition += 30;
        }

        const value = service.unit_value || service.custom_value || service.service.value || 0;
        const total = service.total_value || (value * (service.quantity || 1));

        // Linha alternada com cor de fundo
        if (index % 2 === 0) {
          doc.rect(50, yPosition - 5, doc.page.width - 100, 25)
             .fill(colors.lightGray)
             .stroke();
        }

        // Número do item
        doc.fillColor(colors.text)
           .fontSize(9)
           .text(`${index + 1}`, 55, yPosition);

        // Nome do serviço
        doc.font('Helvetica-Bold')
           .text(service.service_name || service.service.name || 'Serviço', 85, yPosition, { width: 250 });

        // Quantidade
        doc.font('Helvetica')
           .text(String(service.quantity || 1), 335, yPosition, { width: 40, align: 'center' });

        // Valor unitário
        doc.text(this.formatCurrency(value), 375, yPosition, { width: 80, align: 'right' });

        // Total
        doc.font('Helvetica-Bold')
           .text(this.formatCurrency(total), 455, yPosition, { width: 80, align: 'right' });

        yPosition += 25;

        // Descrição do serviço (se houver)
        const serviceDescription = service.service_description || (service.service && service.service.description);
        if (serviceDescription) {
          const cleanServiceDescription = this.stripHtmlTags(serviceDescription);
          if (cleanServiceDescription) {
            doc.fillColor(colors.secondary)
               .fontSize(8)
               .font('Helvetica-Oblique')
               .text(cleanServiceDescription, 85, yPosition, {
                 width: doc.page.width - 135,
                 align: 'justify'
               });

            yPosition = doc.y + 15;
          }
        }
      });

      // Linha de total
      yPosition += 10;
      doc.moveTo(50, yPosition)
         .lineTo(doc.page.width - 50, yPosition)
         .lineWidth(1)
         .strokeColor(colors.border)
         .stroke();

      yPosition += 15;

      // Valor total
      doc.rect(350, yPosition - 5, 185, 30)
         .fillAndStroke(colors.primary, colors.primary);

      doc.fillColor('#FFFFFF')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('VALOR TOTAL:', 360, yPosition + 5)
         .text(this.formatCurrency(proposal.total_value || 0), 455, yPosition + 5, { width: 80, align: 'right' });

      // Condições de pagamento (se houver)
      yPosition += 50;
      if (yPosition > doc.page.height - 150) {
        doc.addPage();
        yPosition = 50;
      }

      if (proposal.payment_method || proposal.installment_count > 1) {
        doc.fillColor(colors.primary)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('CONDIÇÕES DE PAGAMENTO', 50, yPosition);

        yPosition += 25;
        doc.fillColor(colors.text)
           .fontSize(10)
           .font('Helvetica');

        if (proposal.payment_method) {
          doc.text(`Forma de Pagamento: ${proposal.payment_method}`, 50, yPosition);
          yPosition += 15;
        }

        if (proposal.installment_count && proposal.installment_count > 1) {
          doc.text(`Parcelamento: ${proposal.installment_count}x de ${this.formatCurrency((proposal.total_value || 0) / proposal.installment_count)}`, 50, yPosition);
          yPosition += 15;
        }
      }

      // Observações
      if (proposal.observations) {
        yPosition += 20;
        if (yPosition > doc.page.height - 150) {
          doc.addPage();
          yPosition = 50;
        }

        doc.fillColor(colors.primary)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('OBSERVAÇÕES', 50, yPosition);

        yPosition += 25;

        const cleanObservations = this.stripHtmlTags(proposal.observations);
        doc.fillColor(colors.text)
           .fontSize(10)
           .font('Helvetica')
           .text(cleanObservations, 50, yPosition, {
             width: doc.page.width - 100,
             align: 'justify'
           });
      }

      // Rodapé em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Linha divisora do rodapé
        doc.moveTo(50, doc.page.height - 70)
           .lineTo(doc.page.width - 50, doc.page.height - 70)
           .lineWidth(1)
           .strokeColor(colors.border)
           .stroke();

        // Informações de contato
        doc.fillColor(colors.secondary)
           .fontSize(8)
           .font('Helvetica')
           .text('TOP Construtora em RH', 50, doc.page.height - 60)
           .text('contato@naueconsultoria.com.br | www.naueconsultoria.com.br', 50, doc.page.height - 50)
           .text(`Página ${i + 1} de ${range.count}`, 50, doc.page.height - 40, {
             width: doc.page.width - 100,
             align: 'right'
           });
      }

      // Finalizar documento
      doc.end();

      return doc;
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      throw error;
    }
  }

  /**
   * Verificar propostas expiradas e atualizar status
   */
  async checkExpiredProposals() {
    try {
      const proposals = await ProposalModel.findAll({
        status: 'sent',
        is_active: true
      });

      const now = new Date();
      let expiredCount = 0;

      for (const proposal of proposals) {
        if (proposal.end_date && new Date(proposal.end_date) < now) {
          await ProposalModel.updateStatus(proposal.id, 'expired', 1); // Sistema
          expiredCount++;
        }
      }

      return expiredCount;
    } catch (error) {
      console.error('❌ Erro ao verificar propostas expiradas:', error);
      throw error;
    }
  }

  /**
   * Calcular estatísticas avançadas
   */
  async calculateAdvancedStats(filters = {}) {
    try {
      const proposals = await ProposalModel.findAll({
        is_active: true,
        ...filters
      });

      const stats = {
        total: proposals.length,
        byStatus: {
          draft: 0,
          sent: 0,
          accepted: 0,
          rejected: 0,
          expired: 0
        },
        revenue: {
          potential: 0,
          confirmed: 0,
          lost: 0
        },
        averageValue: 0,
        conversionRate: 0,
        timeToConversion: 0 // em dias
      };

      let totalConversionTime = 0;
      let conversionsCount = 0;

      proposals.forEach(proposal => {
        stats.byStatus[proposal.status]++;
        const value = proposal.total_value || 0;

        switch (proposal.status) {
          case 'accepted':
            stats.revenue.confirmed += value;
            // Como sent_at não existe, vamos usar uma estimativa baseada no created_at e updated_at
            if (proposal.created_at && proposal.updated_at) {
              const createdDate = new Date(proposal.created_at);
              const acceptedDate = new Date(proposal.updated_at);
              const timeDiff = Math.ceil((acceptedDate - createdDate) / (1000 * 60 * 60 * 24));
              totalConversionTime += timeDiff;
              conversionsCount++;
            }
            break;
          case 'rejected':
          case 'expired':
            stats.revenue.lost += value;
            break;
          default:
            stats.revenue.potential += value;
        }
      });

      stats.averageValue = stats.total > 0 ? Math.round(proposals.reduce((sum, p) => sum + (p.total_value || 0), 0) / stats.total) : 0;
      stats.conversionRate = stats.byStatus.sent > 0 ? ((stats.byStatus.accepted / stats.byStatus.sent) * 100).toFixed(2) : 0;
      stats.timeToConversion = conversionsCount > 0 ? Math.round(totalConversionTime / conversionsCount) : 0;

      return stats;
    } catch (error) {
      console.error('❌ Erro ao calcular estatísticas avançadas:', error);
      throw error;
    }
  }

  /**
   * Validar dados da proposta
   */
  validateProposalData(proposalData) {
    const errors = [];

    if (!proposalData.client_id) {
      errors.push('ID do cliente é obrigatório');
    }

    if (!proposalData.client_name || proposalData.client_name.trim().length < 2) {
      errors.push('Nome do cliente deve ter pelo menos 2 caracteres');
    }
    
    if (!proposalData.client_email || !proposalData.client_email.includes('@')) {
      errors.push('Email do cliente é obrigatório e deve ser válido');
    }

    if (!proposalData.services || !Array.isArray(proposalData.services) || proposalData.services.length === 0) {
      errors.push('Pelo menos um serviço deve ser incluído');
    }

    if (proposalData.services) {
      proposalData.services.forEach((service, index) => {
        if (!service.service_id) {
          errors.push(`Serviço ${index + 1}: ID do serviço é obrigatório`);
        }
        if (service.quantity && (service.quantity < 1 || !Number.isInteger(service.quantity))) {
          errors.push(`Serviço ${index + 1}: Quantidade deve ser um número inteiro positivo`);
        }
        if (service.custom_value && service.custom_value < 0) {
          errors.push(`Serviço ${index + 1}: Valor personalizado não pode ser negativo`);
        }
      });
    }

    if (proposalData.end_date) {
      const validDate = new Date(proposalData.end_date);
      if (validDate <= new Date()) {
        errors.push('Data de validade deve ser futura');
      }
    }

    return errors;
  }

  /**
   * Formatar valor monetário
   */
  formatCurrency(value) {
    if (typeof value !== 'number') return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value); // Valor já está em reais
  }

  /**
   * Buscar propostas por cliente
   */
  async getProposalsByClient(clientId, options = {}) {
    try {
      const filters = {
        client_id: clientId,
        is_active: options.includeInactive ? undefined : true,
        ...options.filters
      };

      return await ProposalModel.findAll(filters);
    } catch (error) {
      console.error('❌ Erro ao buscar propostas por cliente:', error);
      throw error;
    }
  }

  /**
   * Relatório de propostas por período
   */
  async getProposalReport(startDate, endDate) {
    try {
      const proposals = await ProposalModel.findAll({ is_active: true });
      
      const filtered = proposals.filter(p => {
        const createdAt = new Date(p.created_at);
        return createdAt >= new Date(startDate) && createdAt <= new Date(endDate);
      });

      return {
        period: { startDate, endDate },
        total: filtered.length,
        byStatus: filtered.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {}),
        totalValue: filtered.reduce((sum, p) => sum + (p.total_value || 0), 0),
        proposals: filtered
      };
    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      throw error;
    }
  }

  /**
   * Preparar proposta para envio (adicionar dados do cliente e gerar token)
   */
  async prepareProposalForSending(proposalId, clientData, userId) {
    try {
      console.log('🔍 Iniciando prepareProposalForSending:', { proposalId, userId });
      
      const proposal = await ProposalModel.findById(proposalId);
      console.log('📄 Proposta encontrada:', proposal ? 'SIM' : 'NÃO');
      
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      console.log('📊 Status atual da proposta:', proposal.status);

      // Se a proposta está em draft, atualizar para sent diretamente no banco
      let updatedProposal = proposal;
      if (proposal.status === 'draft') {
        console.log('🔄 Atualizando status de draft para sent diretamente');
        
        const { data, error } = await supabase
          .from('proposals')
          .update({
            status: 'sent',
            updated_by: userId
          })
          .eq('id', proposalId)
          .select('*')
          .single();

        if (error) {
          console.error('❌ Erro ao atualizar status:', error);
          throw error;
        }

        updatedProposal = data;
      } else {
        console.log('ℹ️ Status não precisa ser atualizado:', proposal.status);
      }

      // Usar o unique_link da proposta
      const unique_link = updatedProposal.unique_link || proposal.unique_link;
      
      if (!unique_link) {
        throw new Error('Erro: proposta não possui link único');
      }

      const result = {
        ...updatedProposal,
        unique_link,
        public_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/public/proposal/${unique_link}`
      };

      return result;
    } catch (error) {
      console.error('❌ Erro ao preparar proposta para envio:', error);
      console.error('❌ Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Regenerar token público da proposta
   */
  async regeneratePublicToken(proposalId, userId) {
    try {
      const proposal = await ProposalModel.findById(proposalId);
      if (!proposal) {
        throw new Error('Proposta não encontrada');
      }

      const newToken = generateProposalToken();
      const updateData = { public_token: newToken };

      return await ProposalModel.update(proposalId, updateData, userId);
    } catch (error) {
      console.error('❌ Erro ao regenerar token:', error);
      throw error;
    }
  }

  /**
   * Visualizar proposta por token e registrar view
   */
  async viewProposalByToken(token, clientInfo) {
    try {
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      if (!proposal) {
        return null;
      }

      // Registrar visualização
      await ProposalModel.recordView(proposal.id, clientInfo);

      return proposal;
    } catch (error) {
      console.error('❌ Erro ao visualizar proposta por token:', error);
      throw error;
    }
  }

  /**
   * Atualizar seleção de serviços pelo cliente
   */
  async updateServiceSelection(token, selectionData, clientInfo) {
    try {
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      if (!proposal) {
        throw new Error('Proposta não encontrada ou expirada');
      }

      if (proposal.status !== 'sent') {
        throw new Error('Esta proposta não pode mais ser modificada');
      }

      // Atualizar seleção de serviços
      const updatedServices = await ProposalModel.updateServiceSelection(
        proposal.id,
        selectionData.selectedServices,
        clientInfo
      );

      // Calcular novo valor total baseado nos serviços selecionados
      const selectedTotal = updatedServices
        .filter(s => s.selected_by_client)
        .reduce((total, service) => {
          return total + service.total_value;
        }, 0);

      // Atualizar observações do cliente na proposta
      if (selectionData.client_observations) {
        await ProposalModel.update(proposal.id, {
          client_observations: selectionData.client_observations,
          accepted_value: selectedTotal
        });
      }

      return {
        proposal_id: proposal.id,
        selected_services: updatedServices.filter(s => s.selected_by_client),
        total_selected_value: selectedTotal,
        formatted_total: this.formatCurrency(selectedTotal)
      };
    } catch (error) {
      console.error('❌ Erro ao atualizar seleção de serviços:', error);
      throw error;
    }
  }

  /**
   * Assinar proposta eletronicamente
   */
  async signProposal(token, signatureData, clientInfo, isCounterproposal = false, selectedServices = null) {
    try {
      // Buscar proposta pelo token
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      if (!proposal) {
        throw new Error('Proposta não encontrada ou expirada');
      }

      // Usar o método do modelo para assinar a proposta
      const signedProposal = await ProposalModel.signProposal(proposal.id, signatureData, isCounterproposal, selectedServices);

      // Notificar admin por email sobre proposta aceita
      try {
        await this.notifyProposalAccepted(signedProposal);
      } catch (emailError) {
        console.error('❌ Erro ao enviar notificação:', emailError);
      }

      return {
        proposal_id: signedProposal.id,
        client_name: signedProposal.client_name,
        signed_at: signedProposal.updated_at,
        accepted_value: signedProposal.accepted_value,
        formatted_value: this.formatCurrency(signedProposal.accepted_value)
      };
    } catch (error) {
      console.error('❌ Erro ao assinar proposta:', error);
      throw error;
    }
  }


  /**
   * Regenerar token usando método do modelo
   */
  async regeneratePublicToken(proposalId, userId) {
    try {
      const result = await ProposalModel.regenerateToken(proposalId, userId);
      
      return {
        public_token: result.public_token,
        public_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/public/proposal/${result.public_token}`
      };
    } catch (error) {
      console.error('❌ Erro ao regenerar token:', error);
      throw error;
    }
  }

  /**
   * Confirmar proposta (finalizar processo)
   */
  async confirmProposal(token, confirmationData, clientInfo) {
    try {
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      if (!proposal) {
        throw new Error('Proposta não encontrada ou expirada');
      }

      if (proposal.status !== 'sent') {
        throw new Error('Esta proposta não pode mais ser confirmada');
      }

      if (proposal.status !== 'signed' && proposal.status !== 'contraproposta') {
        throw new Error('A proposta deve ser assinada antes de ser confirmada');
      }

      // Atualizar status para aceita
      const updateData = {
        status: 'accepted',
        client_observations: confirmationData.client_observations || proposal.client_observations
      };

      const updatedProposal = await ProposalModel.update(proposal.id, updateData);

      // Notificar admin por email
      try {
        await this.notifyProposalAccepted(proposal);
      } catch (emailError) {
        console.error('❌ Erro ao enviar notificação:', emailError);
        // Não falhar a confirmação por erro de email
      }

      return {
        proposal_id: proposal.id,
        status: 'accepted',
        client_name: proposal.client_name,
        accepted_value: proposal.accepted_value,
        confirmed_at: new Date()
      };
    } catch (error) {
      console.error('❌ Erro ao confirmar proposta:', error);
      throw error;
    }
  }

  /**
   * Rejeitar proposta
   */
  async rejectProposal(token, rejectionData, clientInfo) {
    try {
      const proposal = await ProposalModel.findByPublicTokenComplete(token);
      if (!proposal) {
        throw new Error('Proposta não encontrada ou expirada');
      }

      if (proposal.status !== 'sent') {
        throw new Error('Esta proposta não pode mais ser rejeitada');
      }

      // Atualizar status para rejeitada
      const updateData = {
        status: 'rejected',
        client_observations: rejectionData.rejection_reason || 'Proposta rejeitada pelo cliente'
      };

      const updatedProposal = await ProposalModel.update(proposal.id, updateData);

      // Notificar admin por email
      try {
        await this.notifyProposalRejected(proposal, rejectionData.rejection_reason);
      } catch (emailError) {
        console.error('❌ Erro ao enviar notificação:', emailError);
        // Não falhar a rejeição por erro de email
      }

      return {
        proposal_id: proposal.id,
        status: 'rejected',
        rejected_at: new Date()
      };
    } catch (error) {
      console.error('❌ Erro ao rejeitar proposta:', error);
      throw error;
    }
  }

  /**
   * Notificar admin sobre proposta aceita
   */
  async notifyProposalAccepted(proposal) {
    try {
      const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@naue.com.br'];
      
      const emailOptions = {
        to: adminEmails,
        subject: `Proposta Aceita: ${proposal.client_name}`,
        template: 'proposal-accepted',
        data: {
          proposalTitle: `Proposta para ${proposal.client_name}`,
          clientName: proposal.client_name,
          clientEmail: proposal.client_email,
          companyName: proposal.company?.name,
          acceptedValue: this.formatCurrency(proposal.accepted_value),
          signedAt: new Date(proposal.updated_at).toLocaleDateString('pt-BR'),
          adminUrl: `${process.env.FRONTEND_URL}/admin/proposals/${proposal.id}`
        }
      };

      await emailService.sendEmail(emailOptions);
    } catch (error) {
      console.error('❌ Erro ao notificar proposta aceita:', error);
      throw error;
    }
  }

  /**
   * Notificar admin sobre proposta rejeitada
   */
  async notifyProposalRejected(proposal, reason) {
    try {
      const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@naue.com.br'];
      
      const emailOptions = {
        to: adminEmails,
        subject: `Proposta Rejeitada: ${proposal.client_name}`,
        template: 'proposal-rejected',
        data: {
          proposalTitle: `Proposta para ${proposal.client_name}`,
          clientName: proposal.client_name || 'Cliente não identificado',
          clientEmail: proposal.client_email,
          companyName: proposal.company?.name,
          rejectionReason: reason || 'Não informado',
          rejectedAt: new Date().toLocaleDateString('pt-BR'),
          adminUrl: `${process.env.FRONTEND_URL}/admin/proposals/${proposal.id}`
        }
      };

      await emailService.sendEmail(emailOptions);
    } catch (error) {
      console.error('❌ Erro ao notificar proposta rejeitada:', error);
      throw error;
    }
  }
}

module.exports = new ProposalService();