const { format } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const Contract = require('../models/Contract');
const Client = require('../models/Client');
const Service = require('../models/Service');
const pdfGenerator = require('../reportGenerators/pdfGenerator');
const excelGenerator = require('../reportGenerators/excelGenerator');

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (dateString) => dateString ? format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A';

// Função para remover tags HTML
const stripHtmlTags = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
};

const translateContractStatus = (status) => {
    const statusMap = {
        'active': 'Ativo',
        'completed': 'Concluído',
        'cancelled': 'Cancelado',
        'suspended': 'Suspenso'
    };
    return statusMap[status] || status;
};

const translatePaymentStatus = (status) => {
    const paymentMap = {
        'pago': 'Pago',
        'pendente': 'Pendente'
    };
    return paymentMap[status] || status;
};

class ReportService {

    async generateMonthlyReportPDF() {
        const now = new Date();
        const contracts = await Contract.findAllByMonth(now.getFullYear(), now.getMonth() + 1);
        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const averageValue = contracts.length > 0 ? totalValue / contracts.length : 0;

        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, `Relatório Mensal - ${format(now, 'MMMM/yyyy', { locale: ptBR })}`);
        
        // Resumo Executivo
        doc.fontSize(16).font('Helvetica-Bold').text('Resumo Executivo', 50, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Período: ${format(now, 'MMMM/yyyy', { locale: ptBR })}`);
        doc.text(`Novos Contratos Criados: ${contracts.length}`);
        doc.text(`Receita Total Gerada: ${formatCurrency(totalValue)}`);
        doc.text(`Valor Médio por Contrato: ${formatCurrency(averageValue)}`);
        
        // Análise por Tipo
        const contractsByType = {
            'Full': contracts.filter(c => c.type === 'Full').length,
            'Pontual': contracts.filter(c => c.type === 'Pontual').length,
            'Individual': contracts.filter(c => c.type === 'Individual').length,
            'Recrutamento & Seleção': contracts.filter(c => c.type === 'Recrutamento & Seleção').length
        };
        
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica-Bold').text('Distribuição por Tipo de Contrato');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Contratos Full: ${contractsByType.Full}`);
        doc.text(`Contratos Pontuais: ${contractsByType.Pontual}`);
        doc.text(`Contratos Individuais: ${contractsByType.Individual}`);
        doc.moveDown(2);

        // Agrupar contratos por cliente
        const contractsByClient = {};
        contracts.forEach(c => {
            const clientKey = `${c.client.name}_${c.client.document}_${c.client.email}`;
            if (!contractsByClient[clientKey]) {
                contractsByClient[clientKey] = {
                    client: c.client,
                    contracts: []
                };
            }
            contractsByClient[clientKey].contracts.push(c);
        });

        // Detalhamento por Cliente
        doc.fontSize(16).font('Helvetica-Bold').text('Novos Contratos por Cliente');
        doc.moveDown(1);
        
        Object.keys(contractsByClient).forEach(clientKey => {
            const clientGroup = contractsByClient[clientKey];
            const client = clientGroup.client;
            const clientTotal = clientGroup.contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
            
            // Cabeçalho do Cliente com resumo
            doc.fontSize(14).font('Helvetica-Bold').text(`${client.name}`, 50, doc.y);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Documento: ${client.document} | Email: ${client.email}`, 60);
            doc.text(`Total de Contratos: ${clientGroup.contracts.length} | Valor Total: ${formatCurrency(clientTotal)}`, 60);
            doc.moveDown(0.5);
            
            // Tabela de contratos do cliente
            pdfGenerator.addTable(doc, {
                headers: [
                    { label: 'Nº Contrato', x: 70, width: 85 },
                    { label: 'Tipo', x: 155, width: 50 },
                    { label: 'Criação', x: 205, width: 70 },
                    { label: 'Vencimento', x: 275, width: 75 },
                    { label: 'Status', x: 350, width: 65 },
                    { label: 'Valor', x: 415, width: 130, align: 'right' },
                ],
                rows: clientGroup.contracts.map(c => [
                    c.contract_number,
                    c.type,
                    formatDate(c.created_at),
                    formatDate(c.expected_payment_date),
                    translateContractStatus(c.status),
                    formatCurrency(c.total_value)
                ])
            });
            
            doc.moveDown(1.5);
        });

        doc.end();
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }

    async generateClientReportPDF(clientId) {
        const client = await Client.findById(clientId);
        if (!client) throw new Error('Cliente não encontrado');
        const contracts = await Contract.findAllByClientId(clientId);

        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, `Relatório do Cliente`);

        // Informações do Cliente no cabeçalho
        doc.fontSize(14).font('Helvetica-Bold').text('Dados do Cliente').moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Nome: ${client.name}`);
        doc.text(`Documento: ${client.type === 'PF' ? client.cpf : client.cnpj}`);
        doc.text(`Email: ${client.email}`).moveDown(2);

        // Resumo estatístico do cliente
        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const activeContracts = contracts.filter(c => c.status === 'active').length;
        const completedContracts = contracts.filter(c => c.status === 'completed').length;
        const paidContracts = contracts.filter(c => c.payment_status === 'pago').length;

        doc.fontSize(14).font('Helvetica-Bold').text('Resumo de Contratos');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Total de Contratos: ${contracts.length}`);
        doc.text(`Contratos Ativos: ${activeContracts}`);
        doc.text(`Contratos Concluídos: ${completedContracts}`);
        doc.text(`Contratos Pagos: ${paidContracts}`);
        doc.text(`Valor Total Contratado: ${formatCurrency(totalValue)}`);
        doc.moveDown(2);

        // Detalhamento de contratos
        doc.fontSize(14).font('Helvetica-Bold').text('Detalhamento dos Contratos');
        doc.moveDown(0.5);

        // Buscar parcelas para cada contrato
        const { supabase } = require('../config/database');

        for (const contract of contracts) {
            // Adicionar informações do contrato
            doc.fontSize(12).font('Helvetica-Bold').text(`Contrato: ${contract.contract_number}`, 50);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Tipo: ${contract.type} | Status: ${translateContractStatus(contract.status)}`, 60);
            doc.text(`Início: ${formatDate(contract.start_date)} | Valor Total: ${formatCurrency(contract.total_value)}`, 60);
            doc.moveDown(0.5);

            // Verificar se o contrato é parcelado (installment_count > 1)
            if (contract.installment_count && contract.installment_count > 1) {
                // Buscar parcelas do contrato
                const { data: installments } = await supabase
                    .from('contract_installments')
                    .select('*')
                    .eq('contract_id', contract.id)
                    .order('installment_number', { ascending: true });

                if (installments && installments.length > 0) {
                    // Calcular totais
                    const totalPaid = installments.reduce((sum, i) => sum + (Number(i.paid_amount) || 0), 0);
                    const openBalance = contract.total_value - totalPaid;

                    doc.fontSize(11).font('Helvetica-Bold').text('Parcelas:', 60);
                    doc.fontSize(9).font('Helvetica');

                    // Cabeçalho da tabela de parcelas
                    const startY = doc.y + 5;
                    doc.text('Nº', 70, startY);
                    doc.text('Vencimento', 100, startY);
                    doc.text('Valor', 170, startY);
                    doc.text('Status', 240, startY);
                    doc.text('Pago em', 300, startY);
                    doc.text('Valor Pago', 370, startY);
                    doc.moveTo(70, startY + 12).lineTo(450, startY + 12).stroke();

                    let currentY = startY + 18;

                    // Linhas de parcelas
                    installments.forEach(inst => {
                        if (currentY > 720) {
                            doc.addPage();
                            currentY = 50;
                        }

                        doc.text(inst.installment_number.toString(), 70, currentY);
                        doc.text(formatDate(inst.due_date), 100, currentY);
                        doc.text(formatCurrency(inst.amount), 170, currentY);
                        doc.text(translatePaymentStatus(inst.payment_status), 240, currentY);
                        doc.text(inst.paid_date ? formatDate(inst.paid_date) : '-', 300, currentY);
                        doc.text(inst.paid_amount ? formatCurrency(inst.paid_amount) : '-', 370, currentY);
                        currentY += 15;
                    });

                    doc.moveDown(0.5);
                    doc.fontSize(10).font('Helvetica-Bold');
                    doc.text(`Total Pago: ${formatCurrency(totalPaid)}`, 60);
                    doc.text(`Saldo em Aberto: ${formatCurrency(openBalance)}`, 60);
                    doc.moveDown(1);
                } else {
                    doc.fontSize(10).font('Helvetica');
                    doc.text('Pagamento Parcelado (sem parcelas registradas)', 60);
                    doc.moveDown(0.5);
                }
            } else {
                // Contrato à vista
                doc.fontSize(10).font('Helvetica');
                doc.text(`Forma de Pagamento: À Vista | Status: ${translatePaymentStatus(contract.payment_status)}`, 60);
                if (contract.expected_payment_date) {
                    doc.text(`Data de Pagamento: ${formatDate(contract.expected_payment_date)}`, 60);
                }
                doc.moveDown(1);
            }

            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1);
        }

        doc.end();
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }
    
    async generateServicesReportPDF(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) throw new Error('Serviço não encontrado');
        const contractServices = await Contract.findAllServicesByServiceId(serviceId);
        
        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, `Relatório de Serviço`);
        
        // Informações do Serviço
        doc.fontSize(16).font('Helvetica-Bold').text('Informações do Serviço');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Nome: ${service.name}`);
        doc.text(`Categoria: ${service.category || 'Geral'}`);
        if (service.description) {
            doc.text(`Descrição: ${stripHtmlTags(service.description)}`);
        }
        doc.moveDown(1);
        
        // Estatísticas do Serviço
        const totalValue = contractServices.reduce((sum, s) => sum + s.total_value, 0);
        const averageValue = contractServices.length > 0 ? totalValue / contractServices.length : 0;
        const uniqueClients = [...new Set(contractServices.map(cs => cs.contract.client.name))].length;
        
        doc.fontSize(16).font('Helvetica-Bold').text('Estatísticas de Contratação');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Total de Contratações: ${contractServices.length}`);
        doc.text(`Clientes únicos: ${uniqueClients}`);
        doc.text(`Receita Total Gerada: ${formatCurrency(totalValue)}`);
        doc.text(`Valor Médio por Contratação: ${formatCurrency(averageValue)}`);
        doc.moveDown(2);

        // Agrupar por cliente para mostrar informações do cliente antes dos contratos
        const clientGroups = {};
        contractServices.forEach(cs => {
            const client = cs.contract.client;
            const clientKey = `${client.name}_${client.document}_${client.email}`;
            if (!clientGroups[clientKey]) {
                clientGroups[clientKey] = {
                    client: client,
                    services: []
                };
            }
            clientGroups[clientKey].services.push(cs);
        });

        Object.keys(clientGroups).forEach(clientKey => {
            const clientGroup = clientGroups[clientKey];
            const client = clientGroup.client;
            
            doc.fontSize(12).font('Helvetica-Bold').text('Cliente:', 50, doc.y);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Nome: ${client.name}`);
            doc.text(`Documento: ${client.document}`);
            doc.text(`Email: ${client.email}`).moveDown(0.5);
            
            pdfGenerator.addTable(doc, {
                headers: [
                    { label: 'Contrato', x: 50, width: 200 },
                    { label: 'Qtd.', x: 250, width: 80, align: 'center' },
                    { label: 'Valor', x: 330, width: 220, align: 'right' },
                ],
                rows: clientGroup.services.map(cs => [cs.contract.contract_number, 1, formatCurrency(cs.total_value)])
            });
            
            doc.moveDown(1);
        });

        doc.end();
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }

    // --- MÉTODOS PARA EXCEL (JÁ REFATORADOS) ---
    async generateMonthlyReportExcel() {
        const now = new Date();
        const contracts = await Contract.findAllByMonth(now.getFullYear(), now.getMonth() + 1);

        const workbook = new (require('exceljs').Workbook)();
        const sheet = workbook.addWorksheet('Relatório Mensal');

        // Header
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'RELATÓRIO MENSAL DE CONTRATOS';
        sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF003b2b' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:G2');
        sheet.getCell('A2').value = `Período: ${format(now, 'MMMM/yyyy', { locale: ptBR })} - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 11 };

        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const averageValue = contracts.length > 0 ? totalValue / contracts.length : 0;

        const contractsByType = {
            'Full': contracts.filter(c => c.type === 'Full').length,
            'Pontual': contracts.filter(c => c.type === 'Pontual').length,
            'Individual': contracts.filter(c => c.type === 'Individual').length,
            'Recrutamento & Seleção': contracts.filter(c => c.type === 'Recrutamento & Seleção').length
        };

        // Métricas
        sheet.addRow([]);
        const resumoRow = sheet.addRow(['RESUMO GERAL']);
        resumoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Total de Novos Contratos:', contracts.length]);
        sheet.addRow(['Receita Total Gerada:', totalValue]);
        sheet.getCell('B6').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Médio por Contrato:', averageValue]);
        sheet.getCell('B7').numFmt = 'R$ #,##0.00';
        sheet.addRow([]);

        const tipoRow = sheet.addRow(['DISTRIBUIÇÃO POR TIPO']);
        tipoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Contratos Full:', contractsByType.Full]);
        sheet.addRow(['Contratos Pontuais:', contractsByType.Pontual]);
        sheet.addRow(['Contratos Individuais:', contractsByType.Individual]);
        sheet.addRow(['Recrutamento & Seleção:', contractsByType['Recrutamento & Seleção']]);

        // Detalhamento de contratos
        sheet.addRow([]);
        sheet.addRow([]);
        const detalhamentoRow = sheet.addRow(['DETALHAMENTO DOS CONTRATOS']);
        detalhamentoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow([]);

        const headerRow = sheet.addRow(['Cliente', 'Documento', 'Email', 'Nº Contrato', 'Tipo', 'Data Criação', 'Data Vencimento', 'Status', 'Pagamento', 'Valor']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        contracts.forEach(c => {
            const row = sheet.addRow([
                c.client.name,
                c.client.document,
                c.client.email,
                c.contract_number,
                c.type,
                c.created_at ? new Date(c.created_at) : null,
                c.expected_payment_date ? new Date(c.expected_payment_date) : null,
                translateContractStatus(c.status),
                translatePaymentStatus(c.payment_status),
                c.total_value || 0
            ]);
            // Formatar coluna de valor
            row.getCell(10).numFmt = 'R$ #,##0.00';
            // Formatar datas
            row.getCell(6).numFmt = 'dd/mm/yyyy';
            row.getCell(7).numFmt = 'dd/mm/yyyy';
        });

        // Ajustar largura das colunas
        sheet.columns = [
            { width: 35 }, // Cliente
            { width: 18 }, // Documento
            { width: 35 }, // Email
            { width: 20 }, // Nº Contrato
            { width: 12 }, // Tipo
            { width: 15 }, // Data Criação
            { width: 15 }, // Data Vencimento
            { width: 15 }, // Status
            { width: 15 }, // Pagamento
            { width: 18 }  // Valor
        ];

        return await workbook.xlsx.writeBuffer();
    }

    async generateClientReportExcel(clientId) {
        const client = await Client.findById(clientId);
        if (!client) throw new Error('Cliente não encontrado');
        const contracts = await Contract.findAllByClientId(clientId);

        const workbook = new (require('exceljs').Workbook)();
        const sheet = workbook.addWorksheet('Relatório do Cliente');

        // Header
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'RELATÓRIO DO CLIENTE';
        sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF003b2b' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:G2');
        sheet.getCell('A2').value = `Cliente: ${client.name} - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 11 };

        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const activeContracts = contracts.filter(c => c.status === 'active').length;
        const completedContracts = contracts.filter(c => c.status === 'completed').length;
        const paidValue = contracts.filter(c => c.payment_status === 'pago').reduce((sum, c) => sum + (c.total_value || 0), 0);

        // Dados do Cliente
        sheet.addRow([]);
        const dadosRow = sheet.addRow(['DADOS DO CLIENTE']);
        dadosRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Nome:', client.name]);
        sheet.addRow(['Documento:', client.type === 'PF' ? client.cpf : client.cnpj]);
        sheet.addRow(['Email:', client.email]);

        // Resumo
        sheet.addRow([]);
        const resumoRow = sheet.addRow(['RESUMO DE CONTRATOS']);
        resumoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Total de Contratos:', contracts.length]);
        sheet.addRow(['Contratos Ativos:', activeContracts]);
        sheet.addRow(['Contratos Concluídos:', completedContracts]);
        sheet.addRow(['Valor Total Contratado:', totalValue]);
        sheet.getCell('B12').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Total Pago:', paidValue]);
        sheet.getCell('B13').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Pendente:', totalValue - paidValue]);
        sheet.getCell('B14').numFmt = 'R$ #,##0.00';

        // Detalhamento de contratos
        sheet.addRow([]);
        sheet.addRow([]);
        const detalhamentoRow = sheet.addRow(['DETALHAMENTO DOS CONTRATOS']);
        detalhamentoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow([]);

        const headerRow = sheet.addRow(['Nº Contrato', 'Tipo', 'Status', 'Data Início', 'Data Vencimento', 'Pagamento', 'Valor']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        contracts.forEach(c => {
            const row = sheet.addRow([
                c.contract_number,
                c.type,
                translateContractStatus(c.status),
                c.start_date ? new Date(c.start_date) : null,
                c.expected_payment_date ? new Date(c.expected_payment_date) : null,
                translatePaymentStatus(c.payment_status),
                c.total_value || 0
            ]);
            // Formatar valor
            row.getCell(7).numFmt = 'R$ #,##0.00';
            // Formatar datas
            row.getCell(4).numFmt = 'dd/mm/yyyy';
            row.getCell(5).numFmt = 'dd/mm/yyyy';
        });

        // Ajustar largura das colunas
        sheet.columns = [
            { width: 20 }, // Nº Contrato
            { width: 15 }, // Tipo
            { width: 15 }, // Status
            { width: 15 }, // Data Início
            { width: 15 }, // Data Vencimento
            { width: 15 }, // Pagamento
            { width: 18 }  // Valor
        ];

        return await workbook.xlsx.writeBuffer();
    }
    
    async generateServicesReportExcel(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) throw new Error('Serviço não encontrado');
        const contractServices = await Contract.findAllServicesByServiceId(serviceId);

        const workbook = new (require('exceljs').Workbook)();
        const sheet = workbook.addWorksheet('Relatório de Serviço');

        // Header
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'RELATÓRIO DE SERVIÇO';
        sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF003b2b' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:G2');
        sheet.getCell('A2').value = `Serviço: ${service.name} - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 11 };

        const totalValue = contractServices.reduce((sum, s) => sum + s.total_value, 0);
        const averageValue = contractServices.length > 0 ? totalValue / contractServices.length : 0;
        const uniqueClients = [...new Set(contractServices.map(cs => cs.contract.client.name))].length;

        // Informações do Serviço
        sheet.addRow([]);
        const infoRow = sheet.addRow(['INFORMAÇÕES DO SERVIÇO']);
        infoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Nome:', service.name]);
        sheet.addRow(['Categoria:', service.category || 'Geral']);

        const descRow = sheet.addRow(['Descrição:', stripHtmlTags(service.description) || 'N/A']);
        descRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        descRow.height = 60; // Altura maior para acomodar texto longo

        // Estatísticas
        sheet.addRow([]);
        const estatRow = sheet.addRow(['ESTATÍSTICAS']);
        estatRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Total de Contratações:', contractServices.length]);
        sheet.addRow(['Clientes Únicos:', uniqueClients]);
        sheet.addRow(['Receita Total Gerada:', totalValue]);
        sheet.getCell('B12').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Médio por Contratação:', averageValue]);
        sheet.getCell('B13').numFmt = 'R$ #,##0.00';

        // Detalhamento por contratação
        sheet.addRow([]);
        sheet.addRow([]);
        const detRow = sheet.addRow(['DETALHAMENTO POR CONTRATAÇÃO']);
        detRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow([]);

        const headerRow = sheet.addRow(['Cliente', 'Documento', 'Email', 'Nº Contrato', 'Tipo', 'Status', 'Data', 'Valor Unitário', 'Valor Total']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        contractServices.forEach(cs => {
            const client = cs.contract.client;
            const contract = cs.contract;
            const row = sheet.addRow([
                client.name,
                client.document,
                client.email,
                contract.contract_number,
                contract.type || 'N/A',
                translateContractStatus(contract.status) || 'N/A',
                contract.start_date ? new Date(contract.start_date) : null,
                cs.unit_value || 0,
                cs.total_value || 0
            ]);
            row.getCell(7).numFmt = 'dd/mm/yyyy';
            row.getCell(8).numFmt = 'R$ #,##0.00';
            row.getCell(9).numFmt = 'R$ #,##0.00';
        });

        // Ajustar largura das colunas
        sheet.columns = [
            { width: 20 },  // Coluna A - Labels
            { width: 80 },  // Coluna B - Valores (incluindo descrição longa)
            { width: 35 },  // Cliente
            { width: 18 },  // Documento
            { width: 20 },  // Nº Contrato
            { width: 15 },  // Tipo
            { width: 15 },  // Status
            { width: 15 },  // Data
            { width: 18 },  // Valor Unitário
            { width: 18 }   // Valor Total
        ];

        return await workbook.xlsx.writeBuffer();
    }

    // Relatório Financeiro Completo
    async generateFinancialReportPDF(startDate = null, endDate = null) {
        const now = new Date();
        const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
        const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const contracts = await Contract.findByDateRange(start, end);
        const activeContracts = contracts.filter(c => c.status === 'active');
        const completedContracts = contracts.filter(c => c.status === 'completed');
        
        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const paidValue = contracts.filter(c => c.payment_status === 'pago').reduce((sum, c) => sum + (c.total_value || 0), 0);
        const pendingValue = totalValue - paidValue;

        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, `Relatório Financeiro`);
        
        // Período do Relatório
        doc.fontSize(14).font('Helvetica-Bold').text('Período Analisado', 50, doc.y);
        doc.fontSize(11).font('Helvetica');
        doc.text(`De: ${format(start, 'dd/MM/yyyy', { locale: ptBR })} até ${format(end, 'dd/MM/yyyy', { locale: ptBR })}`);
        doc.moveDown(1);
        
        // Resumo Financeiro
        doc.fontSize(16).font('Helvetica-Bold').text('Resumo Financeiro', 50, doc.y);
        doc.moveDown(0.5);
        
        doc.fontSize(11).font('Helvetica');
        doc.text(`Total de Contratos: ${contracts.length}`);
        doc.text(`Contratos Ativos: ${activeContracts.length}`);
        doc.text(`Contratos Concluídos: ${completedContracts.length}`);
        doc.moveDown();
        
        doc.text(`Valor Total Contratado: ${formatCurrency(totalValue)}`);
        doc.text(`Valor Já Recebido: ${formatCurrency(paidValue)}`);
        doc.text(`Valor Pendente de Recebimento: ${formatCurrency(pendingValue)}`);
        doc.moveDown(2);
        
        // Análise por Status de Pagamento
        doc.fontSize(16).font('Helvetica-Bold').text('Análise de Pagamentos', 50, doc.y);
        doc.moveDown(0.5);
        
        const paidContracts = contracts.filter(c => c.payment_status === 'pago');
        const pendingContracts = contracts.filter(c => c.payment_status === 'pendente');
        
        doc.fontSize(11).font('Helvetica');
        doc.text(`Contratos Pagos: ${paidContracts.length} (${formatCurrency(paidValue)})`);
        doc.text(`Contratos Pendentes: ${pendingContracts.length} (${formatCurrency(pendingValue)})`);
        doc.moveDown(2);
        
        // Detalhamento por Cliente
        doc.fontSize(16).font('Helvetica-Bold').text('Detalhamento Financeiro por Cliente');
        doc.moveDown(1);
        
        // Agrupar contratos por cliente
        const contractsByClient = {};
        contracts.forEach(c => {
            const clientKey = `${c.client.name}_${c.client.document}_${c.client.email}`;
            if (!contractsByClient[clientKey]) {
                contractsByClient[clientKey] = {
                    client: c.client,
                    contracts: [],
                    totalValue: 0,
                    paidValue: 0,
                    pendingValue: 0
                };
            }
            contractsByClient[clientKey].contracts.push(c);
            contractsByClient[clientKey].totalValue += (c.total_value || 0);
            if (c.payment_status === 'pago') {
                contractsByClient[clientKey].paidValue += (c.total_value || 0);
            } else {
                contractsByClient[clientKey].pendingValue += (c.total_value || 0);
            }
        });

        Object.keys(contractsByClient).forEach(clientKey => {
            const clientGroup = contractsByClient[clientKey];
            const client = clientGroup.client;
            
            // Cabeçalho do Cliente
            doc.fontSize(14).font('Helvetica-Bold').text('Cliente', 50, doc.y);
            doc.fontSize(11).font('Helvetica');
            doc.text(`Nome: ${client.name}`, 60);
            doc.text(`Documento: ${client.document}`, 60);
            doc.text(`Email: ${client.email}`, 60);
            
            // Resumo financeiro do cliente
            doc.fontSize(12).font('Helvetica-Bold').text('Resumo Financeiro:', 60, doc.y);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Total Contratado: ${formatCurrency(clientGroup.totalValue)}`, 70);
            doc.text(`Valor Pago: ${formatCurrency(clientGroup.paidValue)}`, 70);
            doc.text(`Valor Pendente: ${formatCurrency(clientGroup.pendingValue)}`, 70);
            doc.moveDown(0.5);
            
            // Tabela de contratos do cliente
            pdfGenerator.addTable(doc, {
                headers: [
                    { label: 'Contrato', x: 70, width: 105 },
                    { label: 'Tipo', x: 175, width: 70 },
                    { label: 'Status', x: 245, width: 75 },
                    { label: 'Pagamento', x: 320, width: 95 },
                    { label: 'Valor', x: 415, width: 130, align: 'right' },
                ],
                rows: clientGroup.contracts.map(c => [
                    c.contract_number,
                    c.type,
                    translateContractStatus(c.status),
                    translatePaymentStatus(c.payment_status),
                    formatCurrency(c.total_value)
                ])
            });
            
            doc.moveDown(1.5);
        });

        doc.end();
        
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }

    async generateFinancialReportExcel(startDate = null, endDate = null) {
        const now = new Date();
        const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
        const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const contracts = await Contract.findByDateRange(start, end);
        const installments = await Contract.getInstallmentsByDateRange(start, end);

        const workbook = new (require('exceljs').Workbook)();
        const sheet = workbook.addWorksheet('Relatório Financeiro');

        // Header
        sheet.mergeCells('A1:H1');
        sheet.getCell('A1').value = 'RELATÓRIO FINANCEIRO';
        sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF003b2b' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:H2');
        sheet.getCell('A2').value = `Período: ${format(start, 'dd/MM/yyyy', { locale: ptBR })} até ${format(end, 'dd/MM/yyyy', { locale: ptBR })} - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 11 };

        const totalValue = contracts.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const paidValue = contracts.filter(c => c.payment_status === 'pago').reduce((sum, c) => sum + (c.total_value || 0), 0);
        const activeContracts = contracts.filter(c => c.status === 'active').length;
        const completedContracts = contracts.filter(c => c.status === 'completed').length;

        // Resumo Financeiro
        sheet.addRow([]);
        const resumoRow = sheet.addRow(['RESUMO FINANCEIRO']);
        resumoRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Total de Contratos:', contracts.length]);
        sheet.addRow(['Contratos Ativos:', activeContracts]);
        sheet.addRow(['Contratos Concluídos:', completedContracts]);
        sheet.addRow(['Valor Total:', totalValue]);
        sheet.getCell('B7').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Recebido:', paidValue]);
        sheet.getCell('B8').numFmt = 'R$ #,##0.00';
        sheet.addRow(['Valor Pendente:', totalValue - paidValue]);
        sheet.getCell('B9').numFmt = 'R$ #,##0.00';

        // Detalhamento Financeiro por Contrato
        sheet.addRow([]);
        sheet.addRow([]);
        const detRow = sheet.addRow(['DETALHAMENTO FINANCEIRO POR CONTRATO']);
        detRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow([]);

        const headerRow = sheet.addRow(['Cliente', 'Documento', 'Nº Contrato', 'Tipo', 'Status', 'Data Início', 'Pagamento', 'Valor']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        contracts.forEach(c => {
            const row = sheet.addRow([
                c.client.name,
                c.client.document,
                c.contract_number,
                c.type,
                translateContractStatus(c.status),
                c.start_date ? new Date(c.start_date) : null,
                translatePaymentStatus(c.payment_status),
                c.total_value || 0
            ]);
            row.getCell(6).numFmt = 'dd/mm/yyyy';
            row.getCell(8).numFmt = 'R$ #,##0.00';
        });

        // Ajustar largura das colunas
        sheet.columns = [
            { width: 35 }, // Cliente
            { width: 18 }, // Documento
            { width: 20 }, // Nº Contrato
            { width: 15 }, // Tipo
            { width: 15 }, // Status
            { width: 15 }, // Data Início
            { width: 15 }, // Pagamento
            { width: 18 }  // Valor
        ];

        return await workbook.xlsx.writeBuffer();
    }

    // Relatório de Rotinas de Serviços por Cliente
    async generateServiceRoutinesReportPDF(clientId, contractId = null) {
        const client = await Client.findById(clientId);
        if (!client) throw new Error('Cliente não encontrado');
        
        // Buscar contratos do cliente (filtrar por contrato específico se fornecido)
        let contracts;
        if (contractId) {
            const contract = await Contract.findById(contractId);
            if (!contract || contract.client_id !== parseInt(clientId)) {
                throw new Error('Contrato não encontrado ou não pertence ao cliente');
            }
            contracts = [contract];
        } else {
            contracts = await Contract.findAllByClientId(clientId);
        }
        
        // Buscar serviços de cada contrato com status das rotinas
        const servicesData = [];
        for (const contract of contracts) {
            const services = await Contract.findServicesByContractId(contract.id);
            for (const service of services) {
                servicesData.push({
                    contract_number: contract.contract_number,
                    contract_type: contract.type,
                    service_name: service.name,
                    service_status: service.status || 'not_started',
                    scheduled_date: service.scheduled_start_date,
                    unit_value: service.unit_value,
                    total_value: service.total_value
                });
            }
        }

        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, `Relatório de Rotinas`, client.name);

        // Informações do Cliente em caixa
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#003b2b').text('Dados do Cliente');
        doc.moveDown(0.5);

        const infoBoxY = doc.y;
        doc.roundedRect(50, infoBoxY, doc.page.width - 100, 90, 5)
           .lineWidth(1)
           .strokeColor('#003b2b')
           .fillAndStroke('#f9f9f9', '#003b2b');

        doc.fillColor('#333333');
        doc.fontSize(10).font('Helvetica');
        let yPos = infoBoxY + 15;
        doc.text(`Nome: ${client.name}`, 70, yPos); yPos += 15;
        doc.text(`Documento: ${client.type === 'PF' ? client.cpf : client.cnpj}`, 70, yPos); yPos += 15;
        doc.text(`Email: ${client.email}`, 70, yPos); yPos += 15;
        doc.text(`Total de Contratos: ${contracts.length}`, 70, yPos); yPos += 15;
        doc.text(`Total de Serviços: ${servicesData.length}`, 70, yPos);

        doc.y = infoBoxY + 105;
        doc.moveDown(1.5);

        // Análise de Status dos Serviços
        const statusSummary = {
            'not_started': servicesData.filter(s => s.service_status === 'not_started').length,
            'scheduled': servicesData.filter(s => s.service_status === 'scheduled').length,
            'in_progress': servicesData.filter(s => s.service_status === 'in_progress').length,
            'completed': servicesData.filter(s => s.service_status === 'completed').length
        };

        // Detalhamento dos Serviços por Status
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#003b2b').text('Detalhamento das Rotinas de Serviço');
        doc.moveDown(1);

        // Agrupar por status para melhor organização
        const servicesByStatus = {
            'not_started': servicesData.filter(s => s.service_status === 'not_started'),
            'scheduled': servicesData.filter(s => s.service_status === 'scheduled'),
            'in_progress': servicesData.filter(s => s.service_status === 'in_progress'),
            'completed': servicesData.filter(s => s.service_status === 'completed')
        };

        const statusOrder = ['not_started', 'scheduled', 'in_progress', 'completed'];
        const statusLabels = {
            'not_started': 'Não Iniciados',
            'scheduled': 'Agendados',
            'in_progress': 'Em Andamento',
            'completed': 'Concluídos'
        };

        statusOrder.forEach(status => {
            const services = servicesByStatus[status];
            if (services.length > 0) {
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#003b2b').text(`${statusLabels[status]} (${services.length})`, 50, doc.y, { align: 'left' });
                doc.moveDown(0.5);

                pdfGenerator.addTable(doc, {
                    headers: [
                        { label: 'Contrato', x: 50, width: 90 },
                        { label: 'Serviço', x: 140, width: 200 },
                        { label: 'Tipo', x: 340, width: 80 },
                        { label: 'Data Agendada', x: 420, width: 125 },
                    ],
                    rows: services.map(s => [
                        s.contract_number,
                        s.service_name,
                        s.contract_type,
                        formatDate(s.scheduled_date)
                    ])
                });

                doc.moveDown(1.5);
            }
        });

        doc.end();
        
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }

    async generateServiceRoutinesReportExcel(clientId, contractId = null) {
        const client = await Client.findById(clientId);
        if (!client) throw new Error('Cliente não encontrado');
        
        // Buscar contratos do cliente (filtrar por contrato específico se fornecido)
        let contracts;
        if (contractId) {
            const contract = await Contract.findById(contractId);
            if (!contract || contract.client_id !== parseInt(clientId)) {
                throw new Error('Contrato não encontrado ou não pertence ao cliente');
            }
            contracts = [contract];
        } else {
            contracts = await Contract.findAllByClientId(clientId);
        }
        
        // Buscar serviços de cada contrato com status das rotinas
        const servicesData = [];
        for (const contract of contracts) {
            const services = await Contract.findServicesByContractId(contract.id);
            for (const service of services) {
                // Buscar comentários/atualizações do serviço
                const comments = await Contract.getServiceComments(service.id);
                const lastUpdate = comments.length > 0 ? comments[0].created_at : null;
                
                servicesData.push({
                    contract_number: contract.contract_number,
                    contract_type: contract.type,
                    contract_status: translateContractStatus(contract.status),
                    service_name: service.name,
                    service_category: service.category || 'Geral',
                    service_status: service.status || 'not_started',
                    scheduled_date: service.scheduled_start_date,
                    last_update: lastUpdate,
                    comments_count: comments.length
                });
            }
        }

        const workbook = new (require('exceljs').Workbook)();
        const sheet = workbook.addWorksheet('Relatório de Rotinas');

        // Header
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'RELATÓRIO DE ROTINAS DE SERVIÇO';
        sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF003b2b' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:G2');
        sheet.getCell('A2').value = `Cliente: ${client.name} - Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 11 };

        // Dados do Cliente
        sheet.addRow([]);
        const dadosRow = sheet.addRow(['DADOS DO CLIENTE']);
        dadosRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow(['Nome:', client.name]);
        sheet.addRow(['Documento:', client.type === 'PF' ? client.cpf : client.cnpj]);
        sheet.addRow(['Email:', client.email]);
        sheet.addRow(['Total de Contratos:', contracts.length]);
        sheet.addRow(['Total de Serviços:', servicesData.length]);

        // Detalhamento das Rotinas
        sheet.addRow([]);
        sheet.addRow([]);
        const detRow = sheet.addRow(['DETALHAMENTO DAS ROTINAS DE SERVIÇO']);
        detRow.font = { bold: true, size: 12, color: { argb: 'FF003b2b' } };
        sheet.addRow([]);

        const headerRow = sheet.addRow(['Nº Contrato', 'Tipo', 'Nome do Serviço', 'Categoria', 'Status da Rotina', 'Data Agendamento', 'Comentários']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 20;

        servicesData.forEach(s => {
            const comments = s.comments_count || 0;
            const row = sheet.addRow([
                s.contract_number,
                s.contract_type,
                s.service_name,
                s.service_category,
                this.translateStatus(s.service_status),
                s.scheduled_date ? new Date(s.scheduled_date) : null,
                comments
            ]);
            row.getCell(6).numFmt = 'dd/mm/yyyy';
        });

        // Ajustar largura das colunas
        sheet.columns = [
            { width: 20 }, // Nº Contrato
            { width: 15 }, // Tipo
            { width: 40 }, // Nome do Serviço
            { width: 18 }, // Categoria
            { width: 18 }, // Status da Rotina
            { width: 18 }, // Data Agendamento
            { width: 15 }  // Comentários
        ];

        return await workbook.xlsx.writeBuffer();
    }

    translateStatus(status) {
        const statusMap = {
            'not_started': 'Não Iniciado',
            'scheduled': 'Agendado',
            'in_progress': 'Em Andamento',
            'completed': 'Concluído'
        };
        return statusMap[status] || status;
    }

    // R&S Report Methods (delegating to rsReportService)
    async generateRsGeneralReportPDF(startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsGeneralReportPDF(startDate, endDate);
    }

    async generateRsGeneralReportExcel(startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsGeneralReportExcel(startDate, endDate);
    }

    async generateRsClientReportPDF(clientId, startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsClientReportPDF(clientId, startDate, endDate);
    }

    async generateRsClientReportExcel(clientId, startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsClientReportExcel(clientId, startDate, endDate);
    }

    async generateRsConsultoraReportPDF(userId, startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsConsultoraReportPDF(userId, startDate, endDate);
    }

    async generateRsConsultoraReportExcel(userId, startDate, endDate) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsConsultoraReportExcel(userId, startDate, endDate);
    }

    async generateRsOpenVacanciesReportPDF() {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsOpenVacanciesReportPDF();
    }

    async generateRsOpenVacanciesReportExcel() {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsOpenVacanciesReportExcel();
    }

    async generateRsIndividualReportPDF(vagaId) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsIndividualReportPDF(vagaId);
    }

    async generateRsIndividualReportExcel(vagaId) {
        const rsReportService = require('./rsReportService');
        return await rsReportService.generateRsIndividualReportExcel(vagaId);
    }

    // Relatório Comercial
    async generateCommercialReportPDF(startDate, endDate, clientId) {
        const { supabase } = require('../config/database');

        // Build query for proposals with filters
        let query = supabase
            .from('proposals')
            .select(`
                id,
                proposal_number,
                status,
                type,
                total_value,
                created_at,
                updated_at,
                client:clients(
                    id,
                    email,
                    clients_pf(full_name, cpf),
                    clients_pj(company_name, trade_name, cnpj)
                )
            `)
            .order('created_at', { ascending: false });

        // Apply date filters if provided
        if (startDate) {
            query = query.gte('created_at', new Date(startDate).toISOString());
        }
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endDateTime.toISOString());
        }
        // Apply client filter if provided
        if (clientId) {
            query = query.eq('client_id', clientId);
        }

        const { data: proposals, error } = await query;

        if (error) {
            console.error('Erro ao buscar propostas:', error);
            throw error;
        }

        // Calculate statistics
        const totalProposals = proposals.length;
        const sentProposals = proposals.filter(p => p.status === 'sent');
        const signedProposals = proposals.filter(p => p.status === 'signed' || p.status === 'converted');
        const rejectedProposals = proposals.filter(p => p.status === 'rejected');
        const draftProposals = proposals.filter(p => p.status === 'draft');

        const totalSentCount = sentProposals.length;
        const totalSignedCount = signedProposals.length;
        const totalRejectedCount = rejectedProposals.length;
        const totalDraftCount = draftProposals.length;

        const totalSentValue = sentProposals.reduce((sum, p) => sum + (p.total_value || 0), 0);
        const totalSignedValue = signedProposals.reduce((sum, p) => sum + (p.total_value || 0), 0);
        const totalProposalsValue = proposals.reduce((sum, p) => sum + (p.total_value || 0), 0);

        // Taxa de conversão = Assinadas / (Enviadas + Assinadas + Rejeitadas)
        const totalDenominator = totalSentCount + totalSignedCount + totalRejectedCount;
        const conversionRate = totalDenominator > 0 ? (totalSignedCount / totalDenominator * 100).toFixed(2) : 0;

        // Create PDF
        const doc = pdfGenerator.createDocument();

        // Header
        const dateRange = startDate && endDate
            ? `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`
            : 'Todos os Períodos';
        pdfGenerator.addHeader(doc, `Relatório Comercial\n${dateRange}`);

        // Resumo Executivo
        doc.fontSize(16).font('Helvetica-Bold').text('Resumo Executivo');
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Total de Propostas: ${totalProposals}`);
        doc.text(`Propostas Enviadas: ${totalSentCount}`);
        doc.text(`Propostas Assinadas: ${totalSignedCount}`);
        doc.text(`Taxa de Conversão: ${conversionRate}%`);
        doc.moveDown(1);

        // Análise Financeira
        doc.fontSize(14).font('Helvetica-Bold').text('Análise Financeira');
        doc.fontSize(11).font('Helvetica');
        doc.text(`Valor Total: ${formatCurrency(totalProposalsValue)}`);
        doc.text(`Valor Enviado: ${formatCurrency(totalSentValue)}`);
        doc.text(`Valor Assinado: ${formatCurrency(totalSignedValue)}`);
        doc.moveDown(2);

        // Tabela única com todas as propostas
        doc.fontSize(16).font('Helvetica-Bold').text('Todas as Propostas');
        doc.moveDown(1);

        // Renderização customizada da tabela com indicadores coloridos
        const headers = [
            { label: 'Cliente', x: 50, width: 185 },
            { label: 'Nº Proposta', x: 235, width: 75 },
            { label: 'Status', x: 310, width: 85 },
            { label: 'Data', x: 395, width: 55 },
            { label: 'Valor', x: 450, width: 95, align: 'right' }
        ];

        const headerHeight = 25;
        const rowHeight = 20;

        // Desenhar cabeçalho
        const headerY = doc.y;
        doc.rect(50, headerY, doc.page.width - 100, headerHeight)
           .fillAndStroke('#003b2b', '#003b2b');

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
        headers.forEach(header => {
            doc.text(header.label, header.x, headerY + 7, {
                width: header.width,
                align: header.align || 'left',
                ellipsis: true,
                lineBreak: false
            });
        });

        doc.y = headerY + headerHeight + 5;

        // Desenhar linhas da tabela
        doc.font('Helvetica').fontSize(8).fillColor('#333333');
        proposals.forEach((p, rowIndex) => {
            // Verificar se precisa de nova página
            if (doc.y > doc.page.height - 80) {
                doc.addPage();
                doc.y = 50;

                // Redesenhar cabeçalho
                const newHeaderY = doc.y;
                doc.rect(50, newHeaderY, doc.page.width - 100, headerHeight)
                   .fillAndStroke('#003b2b', '#003b2b');

                doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
                headers.forEach(header => {
                    doc.text(header.label, header.x, newHeaderY + 7, {
                        width: header.width,
                        align: header.align || 'left',
                        ellipsis: true,
                        lineBreak: false
                    });
                });
                doc.y = newHeaderY + headerHeight + 5;
                doc.font('Helvetica').fontSize(8).fillColor('#333333');
            }

            const rowY = doc.y;

            // Fundo alternado
            if (rowIndex % 2 === 0) {
                doc.rect(50, rowY - 2, doc.page.width - 100, rowHeight)
                   .fillAndStroke('#f9f9f9', '#f9f9f9');
            }

            // Desenhar círculo colorido antes do status
            const statusColor = this.getProposalStatusColor(p.status);
            doc.circle(315, rowY + 7, 4)
               .fillColor(statusColor)
               .fill();

            // Resetar cor e fonte para texto normal
            doc.fillColor('#333333').font('Helvetica').fontSize(8);

            // Renderizar células
            doc.text(this.getClientNameFromProposal(p), 50, rowY + 3, {
                width: 185,
                ellipsis: true,
                lineBreak: false
            });

            doc.text(p.proposal_number, 235, rowY + 3, {
                width: 75,
                ellipsis: true,
                lineBreak: false
            });

            // Status com espaço para o círculo
            doc.text(this.translateProposalStatus(p.status), 325, rowY + 3, {
                width: 70,
                ellipsis: true,
                lineBreak: false
            });

            doc.text(formatDate(p.created_at), 395, rowY + 3, {
                width: 55,
                ellipsis: true,
                lineBreak: false
            });

            doc.text(formatCurrency(p.total_value || 0), 450, rowY + 3, {
                width: 95,
                align: 'right',
                ellipsis: true,
                lineBreak: false
            });

            doc.y = rowY + rowHeight;
        });

        // Legenda das cores
        doc.moveDown(2);

        // Verificar se há espaço para a legenda, senão adicionar nova página
        if (doc.y > doc.page.height - 150) {
            doc.addPage();
        }

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Legenda de Status:', 50);
        doc.moveDown(0.5);

        const legendItems = [
            { color: '#10b981', label: 'Assinada' },
            { color: '#3b82f6', label: 'Convertida' },
            { color: '#f59e0b', label: 'Enviada' },
            { color: '#ef4444', label: 'Rejeitada' },
            { color: '#6b7280', label: 'Rascunho' },
            { color: '#f97316', label: 'Expirada' },
            { color: '#8b5cf6', label: 'Assinada Parcialmente' }
        ];

        const legendStartY = doc.y;
        doc.font('Helvetica').fontSize(9);
        legendItems.forEach((item, index) => {
            const xPos = 50 + Math.floor(index / 4) * 150;
            const yPos = legendStartY + (index % 4) * 15;

            doc.circle(xPos, yPos + 5, 4)
               .fillColor(item.color)
               .fill();

            doc.fillColor('#333333').text(item.label, xPos + 10, yPos, {
                width: 130
            });
        });

        doc.end();

        return new Promise((resolve, reject) => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });
    }

    async generateCommercialReportExcel(startDate, endDate, clientId) {
        const { supabase } = require('../config/database');
        const ExcelJS = require('exceljs');

        // Build query for proposals with filters
        let query = supabase
            .from('proposals')
            .select(`
                id,
                proposal_number,
                status,
                type,
                total_value,
                created_at,
                updated_at,
                client:clients(
                    id,
                    email,
                    clients_pf(full_name, cpf),
                    clients_pj(company_name, trade_name, cnpj)
                )
            `)
            .order('created_at', { ascending: false });

        // Apply date filters if provided
        if (startDate) {
            query = query.gte('created_at', new Date(startDate).toISOString());
        }
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endDateTime.toISOString());
        }
        // Apply client filter if provided
        if (clientId) {
            query = query.eq('client_id', clientId);
        }

        const { data: proposals, error } = await query;

        if (error) {
            console.error('Erro ao buscar propostas:', error);
            throw error;
        }

        // Calculate statistics
        const totalProposals = proposals.length;
        const sentProposals = proposals.filter(p => p.status === 'sent');
        const signedProposals = proposals.filter(p => p.status === 'signed' || p.status === 'converted');
        const rejectedProposals = proposals.filter(p => p.status === 'rejected');
        const draftProposals = proposals.filter(p => p.status === 'draft');

        const totalSentCount = sentProposals.length;
        const totalSignedCount = signedProposals.length;
        const totalRejectedCount = rejectedProposals.length;
        const totalDraftCount = draftProposals.length;

        const totalSentValue = sentProposals.reduce((sum, p) => sum + (p.total_value || 0), 0);
        const totalSignedValue = signedProposals.reduce((sum, p) => sum + (p.total_value || 0), 0);
        const totalProposalsValue = proposals.reduce((sum, p) => sum + (p.total_value || 0), 0);

        // Taxa de conversão = Assinadas / (Enviadas + Assinadas + Rejeitadas)
        const totalDenominator = totalSentCount + totalSignedCount + totalRejectedCount;
        const conversionRate = totalDenominator > 0 ? (totalSignedCount / totalDenominator * 100).toFixed(2) : 0;

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Relatório Comercial');

        // Title
        const dateRange = startDate && endDate
            ? `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`
            : 'Todos os Períodos';

        sheet.mergeCells('A1:E1');
        const titleRow = sheet.getCell('A1');
        titleRow.value = 'RELATÓRIO COMERCIAL';
        titleRow.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:E2');
        const dateRangeCell = sheet.getCell('A2');
        dateRangeCell.value = dateRange;
        dateRangeCell.font = { size: 11, italic: true };
        dateRangeCell.alignment = { horizontal: 'center' };
        sheet.addRow([]);

        // Summary section - Formatted as a nice table
        sheet.mergeCells('A4:E4');
        const summaryTitleCell = sheet.getCell('A4');
        summaryTitleCell.value = 'RESUMO EXECUTIVO';
        summaryTitleCell.font = { bold: true, size: 14, color: { argb: 'FF003b2b' } };
        summaryTitleCell.alignment = { horizontal: 'left' };
        sheet.getRow(4).height = 25;

        const summaryData = [
            ['Total de Propostas:', totalProposals, 'Taxa de Conversão:', `${conversionRate}%`],
            ['Propostas Enviadas:', totalSentCount, 'Valor Total:', totalProposalsValue],
            ['Propostas Assinadas:', totalSignedCount, 'Valor Enviado:', totalSentValue],
            ['Propostas Rejeitadas:', totalRejectedCount, 'Valor Assinado:', totalSignedValue]
        ];

        summaryData.forEach((rowData, idx) => {
            const row = sheet.addRow(rowData);
            row.getCell(1).font = { bold: true };
            row.getCell(3).font = { bold: true };
            row.getCell(2).alignment = { horizontal: 'left' };
            row.getCell(4).alignment = { horizontal: 'left' };

            if (idx > 0) {
                row.getCell(4).numFmt = 'R$ #,##0.00';
            }

            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE1E8ED' } },
                    bottom: { style: 'thin', color: { argb: 'FFE1E8ED' } }
                };
            });
        });

        sheet.addRow([]);
        sheet.addRow([]);

        // All Proposals Table
        sheet.mergeCells(`A${sheet.lastRow.number + 1}:E${sheet.lastRow.number + 1}`);
        const tableTitleCell = sheet.getCell(`A${sheet.lastRow.number + 1}`);
        tableTitleCell.value = 'TODAS AS PROPOSTAS';
        tableTitleCell.font = { bold: true, size: 14, color: { argb: 'FF003b2b' } };
        tableTitleCell.alignment = { horizontal: 'left' };
        sheet.getRow(sheet.lastRow.number + 1).height = 25;
        sheet.addRow([]);

        // Table Header
        const headerRow = sheet.addRow(['Cliente', 'Nº Proposta', 'Status', 'Data', 'Valor']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        headerRow.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF003b2b' } },
                left: { style: 'thin', color: { argb: 'FF003b2b' } },
                bottom: { style: 'thin', color: { argb: 'FF003b2b' } },
                right: { style: 'thin', color: { argb: 'FF003b2b' } }
            };
        });

        // Table Rows
        proposals.forEach((proposal, idx) => {
            const row = sheet.addRow([
                this.getClientNameFromProposal(proposal).toUpperCase(),
                proposal.proposal_number,
                this.translateProposalStatus(proposal.status),
                proposal.created_at ? new Date(proposal.created_at) : null,
                proposal.total_value || 0
            ]);

            // Formatting
            row.getCell(4).numFmt = 'dd/mm/yyyy';
            row.getCell(5).numFmt = 'R$ #,##0.00';
            row.getCell(5).alignment = { horizontal: 'right' };

            // Alternating row colors
            if (idx % 2 === 0) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
            }

            // Borders
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE1E8ED' } },
                    left: { style: 'thin', color: { argb: 'FFE1E8ED' } },
                    bottom: { style: 'thin', color: { argb: 'FFE1E8ED' } },
                    right: { style: 'thin', color: { argb: 'FFE1E8ED' } }
                };
            });
        });

        // Adjust column widths
        sheet.columns = [
            { width: 35 },  // Cliente
            { width: 18 },  // Nº Proposta
            { width: 15 },  // Status
            { width: 12 },  // Data
            { width: 15 }   // Valor
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }

    getClientNameFromProposal(proposal) {
        if (!proposal.client) return 'Cliente não identificado';

        const client = proposal.client;
        if (client.clients_pf && client.clients_pf.full_name) {
            return client.clients_pf.full_name;
        } else if (client.clients_pj) {
            return client.clients_pj.trade_name || client.clients_pj.company_name || 'Empresa não identificada';
        }
        return 'Cliente não identificado';
    }

    translateProposalStatus(status) {
        const statusMap = {
            'draft': 'Rascunho',
            'sent': 'Enviada',
            'signed': 'Assinada',
            'rejected': 'Rejeitada',
            'expired': 'Expirada',
            'converted': 'Convertida',
            'contraproposta': 'Assinada Parcialmente'
        };
        return statusMap[status] || status;
    }

    getProposalStatusColor(status) {
        const colorMap = {
            'draft': '#6b7280',      // Cinza
            'sent': '#f59e0b',       // Amarelo
            'signed': '#10b981',     // Verde
            'rejected': '#ef4444',   // Vermelho
            'expired': '#f97316',    // Laranja
            'converted': '#3b82f6',  // Azul
            'contraproposta': '#8b5cf6' // Roxo
        };
        return colorMap[status] || '#6b7280';
    }

    /**
     * Relatório de Clientes Ativos - PDF
     * Lista todos os clientes que possuem contratos ativos
     */
    async generateActiveClientsReportPDF() {
        const { supabase } = require('../config/database');

        // Buscar todos os contratos ativos com informações do cliente
        const { data: contracts, error } = await supabase
            .from('contracts')
            .select(`
                id,
                contract_number,
                type,
                status,
                total_value,
                start_date,
                end_date,
                client_id,
                clients:client_id (
                    id,
                    email,
                    phone,
                    city,
                    state,
                    clients_pf (full_name, cpf),
                    clients_pj (company_name, trade_name, cnpj)
                )
            `)
            .eq('is_active', true)
            .eq('status', 'active')
            .order('client_id');

        if (error) throw error;

        // Agrupar contratos por cliente
        const clientsMap = new Map();
        contracts.forEach(contract => {
            const clientId = contract.client_id;
            if (!clientsMap.has(clientId)) {
                const client = contract.clients;
                let clientName = 'Cliente não identificado';
                let clientDocument = '';
                let clientType = '';

                if (client.clients_pf && client.clients_pf.full_name) {
                    clientName = client.clients_pf.full_name;
                    clientDocument = client.clients_pf.cpf || '';
                    clientType = 'PF';
                } else if (client.clients_pj) {
                    clientName = client.clients_pj.trade_name || client.clients_pj.company_name || '';
                    clientDocument = client.clients_pj.cnpj || '';
                    clientType = 'PJ';
                }

                clientsMap.set(clientId, {
                    id: clientId,
                    name: clientName,
                    document: clientDocument,
                    type: clientType,
                    email: client.email || '',
                    phone: client.phone || '',
                    city: client.city || '',
                    state: client.state || '',
                    contracts: [],
                    totalValue: 0
                });
            }

            const clientData = clientsMap.get(clientId);
            clientData.contracts.push(contract);
            clientData.totalValue += parseFloat(contract.total_value) || 0;
        });

        const clientsList = Array.from(clientsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        const doc = pdfGenerator.createDocument();
        pdfGenerator.addHeader(doc, 'Relatório de Clientes Ativos');

        // Resumo
        doc.fontSize(16).font('Helvetica-Bold').text('Resumo', 50, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
        doc.text(`Data de Geração: ${formatDate(new Date().toISOString())}`);
        doc.text(`Total de Clientes Ativos: ${clientsList.length}`);
        doc.text(`Total de Contratos Ativos: ${contracts.length}`);
        const totalGeral = clientsList.reduce((sum, c) => sum + c.totalValue, 0);
        doc.text(`Valor Total em Contratos: ${formatCurrency(totalGeral)}`);
        doc.moveDown(2);

        // Lista de Clientes
        doc.fontSize(16).font('Helvetica-Bold').text('Clientes com Contratos Ativos');
        doc.moveDown(1);

        clientsList.forEach((client, index) => {
            // Verificar se precisa de nova página
            if (doc.y > 680) {
                doc.addPage();
            }

            doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${client.name}`, 50, doc.y);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Tipo: ${client.type} | Documento: ${client.document || 'N/A'}`, 60);
            doc.text(`Email: ${client.email || 'N/A'} | Telefone: ${client.phone || 'N/A'}`, 60);
            doc.text(`Localização: ${client.city || 'N/A'}${client.state ? ' - ' + client.state : ''}`, 60);
            doc.text(`Contratos Ativos: ${client.contracts.length} | Valor Total: ${formatCurrency(client.totalValue)}`, 60);
            doc.moveDown(0.5);

            // Tabela de contratos do cliente
            pdfGenerator.addTable(doc, {
                headers: [
                    { label: 'Nº Contrato', x: 70, width: 100 },
                    { label: 'Tipo', x: 170, width: 80 },
                    { label: 'Início', x: 250, width: 80 },
                    { label: 'Fim', x: 330, width: 80 },
                    { label: 'Valor', x: 410, width: 100, align: 'right' }
                ],
                rows: client.contracts.map(c => [
                    c.contract_number,
                    c.type,
                    formatDate(c.start_date),
                    formatDate(c.end_date),
                    formatCurrency(c.total_value)
                ])
            });

            doc.moveDown(1.5);
        });

        doc.end();
        return new Promise(resolve => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
        });
    }

    /**
     * Relatório de Clientes Ativos - Excel
     */
    async generateActiveClientsReportExcel() {
        const ExcelJS = require('exceljs');
        const { supabase } = require('../config/database');

        // Buscar todos os contratos ativos com informações do cliente
        const { data: contracts, error } = await supabase
            .from('contracts')
            .select(`
                id,
                contract_number,
                type,
                status,
                total_value,
                start_date,
                end_date,
                client_id,
                clients:client_id (
                    id,
                    email,
                    phone,
                    city,
                    state,
                    clients_pf (full_name, cpf),
                    clients_pj (company_name, trade_name, cnpj)
                )
            `)
            .eq('is_active', true)
            .eq('status', 'active')
            .order('client_id');

        if (error) throw error;

        // Agrupar contratos por cliente
        const clientsMap = new Map();
        contracts.forEach(contract => {
            const clientId = contract.client_id;
            if (!clientsMap.has(clientId)) {
                const client = contract.clients;
                let clientName = 'Cliente não identificado';
                let clientDocument = '';
                let clientType = '';

                if (client.clients_pf && client.clients_pf.full_name) {
                    clientName = client.clients_pf.full_name;
                    clientDocument = client.clients_pf.cpf || '';
                    clientType = 'PF';
                } else if (client.clients_pj) {
                    clientName = client.clients_pj.trade_name || client.clients_pj.company_name || '';
                    clientDocument = client.clients_pj.cnpj || '';
                    clientType = 'PJ';
                }

                clientsMap.set(clientId, {
                    id: clientId,
                    name: clientName,
                    document: clientDocument,
                    type: clientType,
                    email: client.email || '',
                    phone: client.phone || '',
                    city: client.city || '',
                    state: client.state || '',
                    contracts: [],
                    totalValue: 0
                });
            }

            const clientData = clientsMap.get(clientId);
            clientData.contracts.push(contract);
            clientData.totalValue += parseFloat(contract.total_value) || 0;
        });

        const clientsList = Array.from(clientsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'TOP Gestão';
        workbook.created = new Date();

        // Aba de Resumo
        const summarySheet = workbook.addWorksheet('Resumo');
        summarySheet.addRow(['Relatório de Clientes Ativos']);
        summarySheet.addRow([`Gerado em: ${formatDate(new Date().toISOString())}`]);
        summarySheet.addRow([]);
        summarySheet.addRow(['Total de Clientes Ativos', clientsList.length]);
        summarySheet.addRow(['Total de Contratos Ativos', contracts.length]);
        const totalGeral = clientsList.reduce((sum, c) => sum + c.totalValue, 0);
        summarySheet.addRow(['Valor Total em Contratos', formatCurrency(totalGeral)]);

        // Estilo do título
        summarySheet.getRow(1).font = { bold: true, size: 16 };
        summarySheet.getColumn(1).width = 30;
        summarySheet.getColumn(2).width = 25;

        // Aba de Clientes
        const clientsSheet = workbook.addWorksheet('Clientes Ativos');

        // Cabeçalho
        const headerRow = clientsSheet.addRow([
            'Cliente',
            'Tipo',
            'Documento',
            'Email',
            'Telefone',
            'Cidade',
            'Estado',
            'Qtd. Contratos',
            'Valor Total'
        ]);

        // Estilo do cabeçalho
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF065F46' }
            };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Dados dos clientes
        clientsList.forEach(client => {
            const row = clientsSheet.addRow([
                client.name,
                client.type,
                client.document,
                client.email,
                client.phone,
                client.city,
                client.state,
                client.contracts.length,
                client.totalValue
            ]);

            // Formatação do valor
            row.getCell(9).numFmt = '"R$" #,##0.00';
        });

        // Ajustar larguras das colunas
        clientsSheet.columns = [
            { width: 35 },  // Cliente
            { width: 8 },   // Tipo
            { width: 18 },  // Documento
            { width: 30 },  // Email
            { width: 15 },  // Telefone
            { width: 15 },  // Cidade
            { width: 8 },   // Estado
            { width: 15 },  // Qtd. Contratos
            { width: 18 }   // Valor Total
        ];

        // Aba de Contratos Detalhados
        const contractsSheet = workbook.addWorksheet('Contratos Detalhados');

        // Cabeçalho
        const contractsHeaderRow = contractsSheet.addRow([
            'Cliente',
            'Nº Contrato',
            'Tipo',
            'Data Início',
            'Data Fim',
            'Valor'
        ]);

        // Estilo do cabeçalho
        contractsHeaderRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF065F46' }
            };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Dados dos contratos
        clientsList.forEach(client => {
            client.contracts.forEach(contract => {
                const row = contractsSheet.addRow([
                    client.name,
                    contract.contract_number,
                    contract.type,
                    formatDate(contract.start_date),
                    formatDate(contract.end_date),
                    parseFloat(contract.total_value) || 0
                ]);

                row.getCell(6).numFmt = '"R$" #,##0.00';
            });
        });

        // Ajustar larguras das colunas
        contractsSheet.columns = [
            { width: 35 },  // Cliente
            { width: 15 },  // Nº Contrato
            { width: 12 },  // Tipo
            { width: 12 },  // Data Início
            { width: 12 },  // Data Fim
            { width: 18 }   // Valor
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }
}

module.exports = new ReportService();