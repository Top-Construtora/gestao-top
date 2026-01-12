const PDFDocument = require('pdfkit');
const { format } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const path = require('path');
const fs = require('fs');

// Estilos padronizados para todos os relatórios
const STYLES = {
    FONT_NORMAL: 'Helvetica',
    FONT_BOLD: 'Helvetica-Bold',
    COLOR_PRIMARY: '#003b2b',
    COLOR_TEXT: '#333333',
    COLOR_HEADER: '#666666',
    COLOR_STROKE: '#cccccc',
};

function addHeader(doc, title, subtitle = null) {
    const logoPath = path.join(__dirname, '../../public/logoTOP.png');

    // Adicionar logo se existir
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, { width: 80 });
    }

    // Título ao lado do logo
    doc.fontSize(20)
       .font(STYLES.FONT_BOLD)
       .text(title, 140, 50, { align: 'left' });

    // Subtítulo se fornecido
    if (subtitle) {
        doc.fontSize(12)
           .font(STYLES.FONT_NORMAL)
           .text(subtitle, 140, 75, { align: 'left' });
    }

    // Data de geração
    doc.fontSize(10)
       .font(STYLES.FONT_NORMAL)
       .text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 50, 100, { align: 'right' });

    doc.moveDown(3);
}

function addFooter(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(STYLES.COLOR_HEADER).text(`Página ${i + 1} de ${range.count}`, 50, doc.page.height - 40, { align: 'center' });
    }
}

function addTable(doc, table) {
  const { headers, rows } = table;
  let tableTop = doc.y;
  const rowHeight = 22;
  const headerHeight = 25;

  // Cabeçalho da Tabela com fundo colorido
  const headerY = doc.y;
  doc.rect(50, headerY, doc.page.width - 100, headerHeight)
     .fillAndStroke(STYLES.COLOR_PRIMARY, STYLES.COLOR_PRIMARY);

  doc.font(STYLES.FONT_BOLD).fontSize(10).fillColor('#FFFFFF');
  headers.forEach(header => {
    doc.text(header.label, header.x, headerY + 7, {
      width: header.width,
      align: header.align || 'left',
      ellipsis: true,
      lineBreak: false
    });
  });

  doc.y = headerY + headerHeight + 5;

  // Linhas da Tabela com alternância de cores
  doc.font(STYLES.FONT_NORMAL).fontSize(9).fillColor(STYLES.COLOR_TEXT);
  rows.forEach((row, rowIndex) => {
    if (doc.y > doc.page.height - 80) {
        doc.addPage();
        tableTop = 50;
        doc.y = tableTop;

        // Redesenha o cabeçalho
        const newHeaderY = doc.y;
        doc.rect(50, newHeaderY, doc.page.width - 100, headerHeight)
           .fillAndStroke(STYLES.COLOR_PRIMARY, STYLES.COLOR_PRIMARY);

        doc.font(STYLES.FONT_BOLD).fontSize(10).fillColor('#FFFFFF');
        headers.forEach(header => {
            doc.text(header.label, header.x, newHeaderY + 7, {
              width: header.width,
              align: header.align || 'left',
              ellipsis: true,
              lineBreak: false
            });
        });
        doc.y = newHeaderY + headerHeight + 5;
    }

    const rowY = doc.y;

    // Calcular altura necessária para a linha baseado no texto da primeira coluna (cliente)
    const firstCellText = String(row[0]);
    const textHeight = doc.heightOfString(firstCellText, {
      width: headers[0].width,
      align: headers[0].align || 'left'
    });
    const calculatedRowHeight = Math.max(rowHeight, textHeight + 10); // +10 para padding

    // Fundo alternado para linhas
    if (rowIndex % 2 === 0) {
        doc.rect(50, rowY, doc.page.width - 100, calculatedRowHeight)
           .fillAndStroke('#F5F5F5', '#F5F5F5');
    }

    // Garantir que a fonte seja normal (não negrito) para as células
    doc.font(STYLES.FONT_NORMAL).fontSize(9).fillColor(STYLES.COLOR_TEXT);
    row.forEach((cell, i) => {
      doc.text(String(cell), headers[i].x, rowY + 5, {
        width: headers[i].width,
        align: headers[i].align || 'left'
      });
    });
    doc.y = rowY + calculatedRowHeight;
  });
}

module.exports = {
  createDocument: () => new PDFDocument({ size: 'A4', margin: 50, bufferPages: true }),
  addHeader,
  addFooter,
  addTable,
  STYLES: STYLES
};