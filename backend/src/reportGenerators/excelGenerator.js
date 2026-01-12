const ExcelJS = require('exceljs');
const { format } = require('date-fns');
const { ptBR } = require('date-fns/locale');

const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 12 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003B2B' } },
  alignment: { vertical: 'middle', horizontal: 'center' }
};

const TITLE_STYLE = {
  font: { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF003B2B' } },
  alignment: { vertical: 'middle', horizontal: 'center' }
};

/**
 * Cria e estiliza uma planilha com título e cabeçalhos.
 * @param {ExcelJS.Workbook} workbook - A instância do Workbook.
 * @param {string} sheetName - O nome da planilha.
 * @param {string} title - O título principal do relatório.
 * @param {Array<object>} columns - A definição das colunas.
 * @returns {ExcelJS.Worksheet} A planilha criada.
 */
function createSheet(workbook, sheetName, title, columns) {
  const worksheet = workbook.addWorksheet(sheetName);
  
  // Título
  worksheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.style = TITLE_STYLE;
  worksheet.getRow(1).height = 30;

  // Subtítulo
  worksheet.mergeCells(2, 1, 2, columns.length);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = `Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`;
  subtitleCell.alignment = { horizontal: 'center' };
  
  // Cabeçalhos da tabela
  worksheet.getRow(4).values = columns.map(c => c.header);
  worksheet.getRow(4).style = HEADER_STYLE;

  // Define as propriedades das colunas (incluindo largura)
  worksheet.columns = columns;
  
  return worksheet;
}

module.exports = { createSheet };