const reportService = require('../services/reportService');
const Joi = require('joi');

const clientReportSchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

const monthlyReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

const servicesReportSchema = Joi.object({
  serviceId: Joi.number().integer().positive().required(),
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

const serviceRoutinesReportSchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  contractId: Joi.number().integer().positive().optional().allow(null, ''),
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

// R&S Report Schemas
const rsGeneralReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required(),
  startDate: Joi.date().optional().allow('', null),
  endDate: Joi.date().optional().allow('', null)
}).unknown(true);

const rsClientReportSchema = Joi.object({
  clientId: Joi.number().integer().positive().required(),
  format: Joi.string().valid('pdf', 'excel').required(),
  startDate: Joi.date().optional().allow('', null),
  endDate: Joi.date().optional().allow('', null)
}).unknown(true);

const rsConsultoraReportSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
  format: Joi.string().valid('pdf', 'excel').required(),
  startDate: Joi.date().optional().allow('', null),
  endDate: Joi.date().optional().allow('', null)
}).unknown(true);

const rsOpenVacanciesReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

const rsIndividualReportSchema = Joi.object({
  vagaId: Joi.number().integer().positive().required(),
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

const financialReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required(),
  startDate: Joi.date().optional().allow('', null),
  endDate: Joi.date().optional().allow('', null)
}).unknown(true);

const commercialReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required(),
  startDate: Joi.date().optional().allow('', null),
  endDate: Joi.date().optional().allow('', null),
  clientId: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().valid('').allow(null)
  ).optional()
}).unknown(true);

const activeClientsReportSchema = Joi.object({
  format: Joi.string().valid('pdf', 'excel').required()
}).unknown(true);

class ReportController {
  async generateMonthlyReport(req, res, next) {
    try {
      const { error, value } = monthlyReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateMonthlyReportPDF();
        filename = `relatorio_mensal_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateMonthlyReportExcel();
        filename = `relatorio_mensal_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório mensal:', error);
      next(error);
    }
  }

  async generateClientReport(req, res, next) {
    try {
      const { error, value } = clientReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { clientId, format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateClientReportPDF(clientId);
        filename = `relatorio_cliente_${clientId}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateClientReportExcel(clientId);
        filename = `relatorio_cliente_${clientId}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório por cliente:', error);
      next(error);
    }
  }

  async generateServicesReport(req, res, next) {
    try {
      const { error, value } = servicesReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { serviceId, format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateServicesReportPDF(serviceId);
        filename = `relatorio_servico_${serviceId}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateServicesReportExcel(serviceId);
        filename = `relatorio_servico_${serviceId}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
      
    } catch (error) {
      console.error('Erro ao gerar relatório de serviços:', error);
      next(error);
    }
  }

  async generateFinancialReport(req, res, next) {
    try {
      const { error, value } = financialReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let { format, startDate, endDate } = value;

      // Converter datas para formato ISO (YYYY-MM-DD) se não estiverem vazias
      if (startDate && startDate !== '') {
        startDate = new Date(startDate).toISOString().split('T')[0];
      } else {
        startDate = null;
      }

      if (endDate && endDate !== '') {
        endDate = new Date(endDate).toISOString().split('T')[0];
      } else {
        endDate = null;
      }

      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateFinancialReportPDF(startDate, endDate);
        filename = `relatorio_financeiro_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateFinancialReportExcel(startDate, endDate);
        filename = `relatorio_financeiro_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório financeiro:', error);
      next(error);
    }
  }

  async generateServiceRoutinesReport(req, res, next) {
    try {
      const { error, value } = serviceRoutinesReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { clientId, contractId, format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateServiceRoutinesReportPDF(clientId, contractId);
        filename = `relatorio_rotinas_cliente_${clientId}${contractId ? `_contrato_${contractId}` : ''}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateServiceRoutinesReportExcel(clientId, contractId);
        filename = `relatorio_rotinas_cliente_${clientId}${contractId ? `_contrato_${contractId}` : ''}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório de rotinas de serviços:', error);
      next(error);
    }
  }

  // R&S Reports
  async generateRsGeneralReport(req, res, next) {
    try {
      const { error, value } = rsGeneralReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let { format, startDate, endDate } = value;

      // Converter datas para formato ISO (YYYY-MM-DD) se não estiverem vazias
      if (startDate && startDate !== '') {
        startDate = new Date(startDate).toISOString().split('T')[0];
      } else {
        startDate = null;
      }

      if (endDate && endDate !== '') {
        endDate = new Date(endDate).toISOString().split('T')[0];
      } else {
        endDate = null;
      }

      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateRsGeneralReportPDF(startDate, endDate);
        filename = `relatorio_rs_geral_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateRsGeneralReportExcel(startDate, endDate);
        filename = `relatorio_rs_geral_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório geral R&S:', error);
      next(error);
    }
  }

  async generateRsClientReport(req, res, next) {
    try {
      const { error, value } = rsClientReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let { clientId, format, startDate, endDate } = value;

      // Converter datas para formato ISO (YYYY-MM-DD) se não estiverem vazias
      if (startDate && startDate !== '') {
        startDate = new Date(startDate).toISOString().split('T')[0];
      } else {
        startDate = null;
      }

      if (endDate && endDate !== '') {
        endDate = new Date(endDate).toISOString().split('T')[0];
      } else {
        endDate = null;
      }

      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateRsClientReportPDF(clientId, startDate, endDate);
        filename = `relatorio_rs_cliente_${clientId}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateRsClientReportExcel(clientId, startDate, endDate);
        filename = `relatorio_rs_cliente_${clientId}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório R&S por cliente:', error);
      next(error);
    }
  }

  async generateRsConsultoraReport(req, res, next) {
    try {
      const { error, value } = rsConsultoraReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let { userId, format, startDate, endDate } = value;

      // Converter datas para formato ISO (YYYY-MM-DD) se não estiverem vazias
      if (startDate && startDate !== '') {
        const date = new Date(startDate);
        startDate = date.toISOString().split('T')[0];
      } else {
        startDate = null;
      }

      if (endDate && endDate !== '') {
        const date = new Date(endDate);
        endDate = date.toISOString().split('T')[0];
      } else {
        endDate = null;
      }

      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateRsConsultoraReportPDF(userId, startDate, endDate);
        filename = `relatorio_rs_consultora_${userId}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateRsConsultoraReportExcel(userId, startDate, endDate);
        filename = `relatorio_rs_consultora_${userId}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório R&S por consultora:', error);
      next(error);
    }
  }

  async generateRsOpenVacanciesReport(req, res, next) {
    try {
      const { error, value } = rsOpenVacanciesReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateRsOpenVacanciesReportPDF();
        filename = `relatorio_rs_vagas_abertas_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateRsOpenVacanciesReportExcel();
        filename = `relatorio_rs_vagas_abertas_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório R&S de vagas abertas:', error);
      next(error);
    }
  }

  async generateRsIndividualReport(req, res, next) {
    try {
      const { error, value } = rsIndividualReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { vagaId, format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateRsIndividualReportPDF(vagaId);
        filename = `relatorio_rs_individual_${vagaId}_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateRsIndividualReportExcel(vagaId);
        filename = `relatorio_rs_individual_${vagaId}_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório R&S individual:', error);
      next(error);
    }
  }

  async generateCommercialReport(req, res, next) {
    try {
      const { error, value } = commercialReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let { format, startDate, endDate, clientId } = value;

      // Tratar clientId vazio
      if (!clientId || clientId === '' || clientId === 'null') {
        clientId = null;
      }

      // Converter datas para formato ISO (YYYY-MM-DD) se não estiverem vazias
      if (startDate && startDate !== '') {
        startDate = new Date(startDate).toISOString().split('T')[0];
      } else {
        startDate = null;
      }

      if (endDate && endDate !== '') {
        endDate = new Date(endDate).toISOString().split('T')[0];
      } else {
        endDate = null;
      }

      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateCommercialReportPDF(startDate, endDate, clientId);
        filename = `relatorio_comercial_${clientId ? `cliente_${clientId}_` : ''}${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateCommercialReportExcel(startDate, endDate, clientId);
        filename = `relatorio_comercial_${clientId ? `cliente_${clientId}_` : ''}${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório comercial:', error);
      next(error);
    }
  }

  async generateActiveClientsReport(req, res, next) {
    try {
      const { error, value } = activeClientsReportSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { format } = value;
      let buffer, filename, contentType;
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'pdf') {
        buffer = await reportService.generateActiveClientsReportPDF();
        filename = `relatorio_clientes_ativos_${dateStr}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'excel') {
        buffer = await reportService.generateActiveClientsReportExcel();
        filename = `relatorio_clientes_ativos_${dateStr}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return res.status(400).json({ error: 'Formato inválido.' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);

    } catch (error) {
      console.error('Erro ao gerar relatório de clientes ativos:', error);
      next(error);
    }
  }
}

module.exports = new ReportController();