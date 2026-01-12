import { Injectable } from '@angular/core';
// Lazy load heavy dependencies

@Injectable({
  providedIn: 'root'
})
export class ContractExportService {

  async exportToDocx(contract: any, templateId: string): Promise<void> {
    try {
      console.log('🔄 Iniciando exportação DOCX...');
      
      // Carregar módulo DOCX sem dependência do Buffer
      const docxModule = await this.loadDocxModuleForBrowser();
      console.log('✅ Módulo DOCX carregado');
      
      // Criar documento DOCX
      const doc = await this.createDocxDocument(contract, templateId, docxModule);
      console.log('✅ Documento DOCX criado');
      
      // Converter para Blob usando API nativa do navegador
      const blob = await this.convertDocxToBlob(doc, docxModule);
      console.log('✅ Blob gerado com sucesso');
      
      // Download do arquivo
      const fileName = this.generateFileName(contract, templateId, 'docx');
      await this.downloadBlob(blob, fileName);
      console.log('✅ Exportação DOCX concluída');
      
    } catch (error) {
      console.error('❌ Erro na exportação DOCX:', error);
      
      // Fallback para PDF se DOCX falhar
      console.log('🔄 Tentando fallback para PDF...');
      try {
        await this.exportToPdf(contract, templateId);
        this.showUserNotification('Não foi possível exportar como DOCX. O arquivo foi exportado como PDF.');
      } catch (pdfError) {
        console.error('❌ Erro no fallback PDF:', pdfError);
        this.showUserNotification('Erro ao exportar documento. Tente novamente ou atualize a página.');
        throw new Error('Falha completa na exportação de documentos');
      }
    }
  }

  /**
   * Carrega módulo DOCX sem dependências do Node.js/Buffer
   */
  private async loadDocxModuleForBrowser(): Promise<any> {
    try {
      console.log('🔄 Carregando módulo DOCX para navegador...');
      
      const module = await import('docx');
      
      // Verificar se os componentes necessários estão disponíveis
      const requiredComponents = ['Document', 'Packer', 'Paragraph', 'TextRun', 'HeadingLevel', 'AlignmentType'];
      const missingComponents = requiredComponents.filter(comp => !(module as any)[comp]);
      
      if (missingComponents.length > 0) {
        throw new Error(`Componentes DOCX faltando: ${missingComponents.join(', ')}`);
      }
      
      console.log('✅ Módulo DOCX carregado para navegador');
      return module;
      
    } catch (error) {
      console.error('❌ Erro ao carregar módulo DOCX:', error);
      throw new Error('Não foi possível carregar a biblioteca de exportação DOCX');
    }
  }

  /**
   * Converte documento DOCX para Blob usando APIs nativas do navegador
   */
  private async convertDocxToBlob(doc: any, docxModule: any): Promise<Blob> {
    try {
      console.log('🔄 Convertendo documento para Blob...');
      
      // Usar Packer.toBlob que é uma API nativa do navegador
      const blob = await docxModule.Packer.toBlob(doc);
      
      if (!(blob instanceof Blob)) {
        throw new Error('Falha ao gerar Blob do documento DOCX');
      }
      
      console.log('✅ Conversão para Blob bem-sucedida, tamanho:', blob.size, 'bytes');
      return blob;
      
    } catch (error) {
      console.error('❌ Erro na conversão para Blob:', error);
      
      // Fallback: tentar usar toBase64 e converter para Blob
      try {
        console.log('🔄 Tentando fallback com base64...');
        const base64String = await docxModule.Packer.toBase64String(doc);
        
        // Converter base64 para Uint8Array
        const binaryString = atob(base64String);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Criar Blob a partir do Uint8Array
        const blob = new Blob([bytes], { 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        });
        
        console.log('✅ Fallback base64 bem-sucedido, tamanho:', blob.size, 'bytes');
        return blob;
        
      } catch (fallbackError) {
        console.error('❌ Fallback base64 também falhou:', fallbackError);
        throw new Error('Não foi possível converter documento para formato de download');
      }
    }
  }

  /**
   * Faz download do Blob usando APIs nativas do navegador
   */
  private async downloadBlob(blob: Blob, fileName: string): Promise<void> {
    try {
      console.log('🔄 Iniciando download:', fileName);
      
      // Primeira tentativa: usar file-saver se disponível
      try {
        const fileSaver = await import('file-saver');
        if (fileSaver.saveAs) {
          fileSaver.saveAs(blob, fileName);
          console.log('✅ Download via file-saver');
          return;
        }
      } catch (fileSaverError) {
        console.log('⚠️ file-saver não disponível, usando método nativo');
      }
      
      // Fallback: usar APIs nativas do navegador
      this.downloadBlobNative(blob, fileName);
      console.log('✅ Download via API nativa');
      
    } catch (error) {
      console.error('❌ Erro no download:', error);
      throw new Error('Não foi possível fazer download do arquivo');
    }
  }

  /**
   * Download usando APIs nativas do navegador (sem dependências externas)
   */
  private downloadBlobNative(blob: Blob, fileName: string): void {
    try {
      // Criar URL do Blob
      const url = URL.createObjectURL(blob);
      
      // Criar elemento de link temporário
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      
      // Adicionar ao DOM, clicar e remover
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpar URL após um pequeno delay
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      console.error('❌ Erro no download nativo:', error);
      
      // Último recurso: abrir em nova aba
      try {
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
          throw new Error('Popup bloqueado');
        }
        console.log('✅ Arquivo aberto em nova aba');
      } catch (finalError) {
        console.error('❌ Todas as tentativas falharam:', finalError);
        throw new Error('Não foi possível fazer download. Verifique se popups estão habilitados.');
      }
    }
  }

  /**
   * Mostra notificação para o usuário
   */
  private showUserNotification(message: string): void {
    // Usar alert simples por enquanto - pode ser substituído por toast/modal
    alert(message);
  }



  async exportToPdf(contract: any, templateId: string): Promise<void> {
    try {
      console.log('🔄 Iniciando exportação PDF...');
      
      // Lazy load jsPDF dependency with error handling
      const jsPDFModule = await this.loadJsPDFModule();
      const jsPDF = jsPDFModule.jsPDF;
      
      const content = this.generatePdfContent(contract, templateId);
      const pdf = new jsPDF('p', 'mm', 'a4');
    
      // Configurações da página
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const lineHeight = 7;
      let currentY = margin;
    
      // Função para adicionar texto com quebra de linha
      const addText = (text: string, fontSize: number = 10, isBold: boolean = false) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        
        const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
        
        for (const line of lines) {
          if (currentY > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          
          pdf.text(line, margin, currentY);
          currentY += lineHeight;
        }
        
        currentY += lineHeight * 0.5; // Espaçamento extra entre parágrafos
      };
      
      // Função para adicionar texto com partes em negrito
      const addTextWithParts = (parts: any[], fontSize: number = 10) => {
        pdf.setFontSize(fontSize);
        
        // Converter as partes em texto simples e usar a função addText que já funciona corretamente
        const fullText = parts.map(part => part.text).join('');
        addText(fullText, fontSize, false);
      };
      
      // Gerar conteúdo
      for (const section of content) {
        if (section.type === 'title') {
          currentY += lineHeight;
          addText(section.text, 16, true);
          currentY += lineHeight;
        } else if (section.type === 'heading') {
          currentY += lineHeight * 0.5;
          addText(section.text, 12, true);
        } else if (section.type === 'spacing') {
          currentY += lineHeight;
        } else if (section.type === 'signature') {
          addText(section.text, 10, section.bold || false);
        } else if (section.type === 'paragraph' && section.parts) {
          addTextWithParts(section.parts, 10);
        } else {
          addText(section.text, 10, false);
        }
      }
    
      const fileName = this.generateFileName(contract, templateId, 'pdf');
      pdf.save(fileName);
      console.log('✅ Exportação PDF concluída');
      
    } catch (error) {
      console.error('❌ Erro na exportação PDF:', error);
      throw new Error('Erro ao exportar PDF. Tente novamente.');
    }
  }

  private async loadJsPDFModule(): Promise<any> {
    try {
      console.log('🔄 Carregando módulo jsPDF...');
      
      const module = await import('jspdf');
      
      if (!module.jsPDF) {
        console.error('❌ jsPDF não encontrado no módulo');
        throw new Error('Módulo jsPDF incompleto');
      }
      
      console.log('✅ Módulo jsPDF carregado com sucesso');
      return module;
      
    } catch (error) {
      console.error('❌ Erro ao carregar módulo jsPDF:', error);
      throw new Error('Não foi possível carregar o módulo de exportação PDF');
    }
  }

  private async createDocxDocument(contract: any, templateId: string, docxModule: any): Promise<any> {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docxModule;
    const content = this.generateDocumentContent(contract, templateId);
    
    return new Document({
      sections: [{
        children: content.map(section => {
          if (section.type === 'title') {
            return new Paragraph({
              children: [new TextRun({
                text: section.text,
                bold: true,
                size: 32
              })],
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 }
            });
          } else if (section.type === 'heading') {
            return new Paragraph({
              children: [new TextRun({
                text: section.text,
                bold: true,
                size: 24
              })],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 300, after: 200 }
            });
          } else if (section.type === 'spacing') {
            return new Paragraph({
              children: [new TextRun({ text: '', size: 20 })],
              spacing: { after: 240 }
            });
          } else if (section.type === 'signature') {
            return new Paragraph({
              children: [new TextRun({
                text: section.text,
                size: 20,
                bold: section.bold || false
              })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 }
            });
          } else if (section.type === 'paragraph-bold') {
            return new Paragraph({
              children: [new TextRun({
                text: section.text,
                size: 20,
                bold: true
              })],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 120 }
            });
          } else {
            // Para parágrafos normais, verificar se há partes em negrito
            if (section.parts) {
              return new Paragraph({
                children: section.parts.map((part: any) => new TextRun({
                  text: part.text,
                  size: 20,
                  bold: part.bold || false
                })),
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120 }
              });
            } else {
              return new Paragraph({
                children: [new TextRun({
                  text: section.text,
                  size: 20
                })],
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120 }
              });
            }
          }
        })
      }]
    });
  }

  private generateDocumentContent(contract: any, templateId: string): any[] {
    // Usar métodos auxiliares para extrair dados do cliente
    const clientName = this.getClientName(contract.client);
    const clientDocument = this.getClientDocument(contract.client);
    
    const contractNumber = contract.contract_number || '[NUMERO_CONTRATO]';
    const totalValue = this.formatCurrency(contract.total_value || 0);
    const startDate = this.formatDate(contract.start_date);
    const endDate = this.formatDate(contract.end_date);
    
    const services = contract.contract_services?.map((cs: any) => cs.service?.name || 'Serviço').join(', ') || '[SERVICOS]';
    
    // Verificar forma de pagamento e formatar adequadamente
    let paymentText = '';
    if (this.hasBarterPayment(contract)) {
      // Se tem permuta, usar formatação especial
      paymentText = this.formatBarterInfo(contract);
    } else {
      // Forma de pagamento tradicional
      const isInstallment = this.isContractInstallment(contract);
      paymentText = isInstallment ? this.formatInstallments(contract) : '';
    }
    
    // Log para debug
    console.log('📊 Dados do contrato:', {
      clientName,
      clientDocument,
      contractNumber,
      totalValue,
      startDate,
      endDate,
      services,
      paymentMethod: contract.payment_method,
      hasBarterPayment: this.hasBarterPayment(contract),
      barterInfo: this.hasBarterPayment(contract) ? {
        type: contract.barter_type,
        value: contract.barter_value,
        percentage: contract.barter_percentage,
        secondaryMethod: contract.secondary_payment_method
      } : null
    });
    
    switch (templateId) {
      case 'consultoria-pj':
        return this.getConsultoriaPJContent(clientName, clientDocument, contractNumber, totalValue, startDate, endDate, services, paymentText);
      case 'consultoria-pf':
        return this.getConsultoriaPFContent(clientName, clientDocument, contractNumber, totalValue, startDate, endDate, services, paymentText);
      case 'recrutamento':
        return this.getRecrutamentoContent(clientName, clientDocument, contractNumber, totalValue, startDate, endDate, services, paymentText);
      default:
        return [];
    }
  }

  private generatePdfContent(contract: any, templateId: string): any[] {
    return this.generateDocumentContent(contract, templateId);
  }

  private getConsultoriaPJContent(clientName: string, clientDocument: string, contractNumber: string, totalValue: string, startDate: string, endDate: string, services: string, paymentText: string): any[] {
    return [
      {
        type: 'title',
        text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA CORPORATIVA'
      },
      {
        type: 'paragraph',
        text: `Pelo presente contrato particular de prestação de serviços de Consultoria Corporativa ("Contrato"), as partes:`
      },
      {
        type: 'paragraph',
        parts: [
          { text: '1. ', bold: false },
          { text: clientName.toUpperCase(), bold: true },
          { text: `, ${this.getClientType(clientDocument)}, inscrita no ${this.getDocumentType(clientDocument)} sob o nº ${clientDocument}, doravante designada simplesmente como `, bold: false },
          { text: 'CONTRATANTE', bold: true },
          { text: '; e', bold: false }
        ]
      },
      {
        type: 'paragraph',
        parts: [
          { text: '2. ', bold: false },
          { text: 'TOP CONSULTORIA LTDA.', bold: true },
          { text: ', sociedade empresária limitada, inscrita no CNPJ sob o n. 46.259.049/0001-64, com sede a Avenida Dep. Jamel Cecílio e Rua 14 e Rua 14-A, quadra c-9, lote 02/05-15, Ed. Flamboyant Park Business, sala 409, Jardim Goiás, Goiânia-GO, cujo endereço eletrônico é mariana@naueconsultoria.com.br, neste ato representado por sua sócia administradora Francisca Mariana Ferreira de Sousa TOP Lopes, na forma de seu Contrato Social, doravante designada simplesmente como ', bold: false },
          { text: 'CONTRATADA', bold: true },
          { text: '.', bold: false }
        ]
      },
      {
        type: 'paragraph',
        text: 'A CONTRATANTE e a CONTRATADA serão conjuntamente designados como "PARTES" e individualmente como "PARTE".'
      },
      {
        type: 'paragraph',
        text: 'ASSIM, as Partes resolvem, de comum acordo, celebrar o presente Contrato, de acordo com as condições abaixo descritas:'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA PRIMEIRA – OBJETO'
      },
      {
        type: 'paragraph',
        text: '1.1. As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços em Consultoria Corporativa, considerando as disposições do Código Civil Brasileiro, que se regerá com fundamento nos artigos 421, 422, 425, 594 e 598 do Código Civil Brasileiro, bem como no princípio do pacta sunt servanda e na Lei 13.429/17 (Lei da Terceirização), pelas cláusulas, condições de preço, forma e termo de pagamento descritas no presente contrato.'
      },
      {
        type: 'paragraph',
        text: '1.2. O objeto do presente contrato e demais serviços serão prestados sem exclusividade pela CONTRATADA.'
      },
      {
        type: 'paragraph',
        text: '1.3. Todos os serviços elencados no presente Contrato serão executados por pessoal devidamente habilitado pela CONTRATADA, a quem compete com exclusividade o pagamento pelos trabalhos realizados, a fiscalização e o cumprimento do ora pactuado, bem como todas as demais obrigações legais, ficando desta forma, expressamente excluída a responsabilidade da CONTRATANTE sobre qualquer matéria trabalhista e/ou tributária disposta neste Contrato.'
      },
      {
        type: 'paragraph',
        text: '1.4. Inexistirá qualquer vínculo empregatício entre a CONTRATADA e a CONTRATANTE, sem prejuízo da obrigação da CONTRATADA de respeitar as políticas internas da Contratante e demais obrigações e limitações previstas no presente Contrato e na legislação vigente.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEGUNDA – DO ESCOPO DA PRESTAÇÃO DE SERVIÇOS'
      },
      {
        type: 'paragraph',
        text: `2.1. O escopo de entregas previstas neste contrato inclui: ${services}`
      },
      {
        type: 'paragraph',
        text: '2.2. Os serviços serão executados conforme cronograma e metodologia estabelecidos pela CONTRATADA, sempre em consonância com as necessidades e objetivos da CONTRATANTE.'
      },
      {
        type: 'paragraph',
        text: '2.3. A CONTRATADA compromete-se a entregar relatórios periódicos sobre o andamento dos trabalhos, bem como apresentar os resultados obtidos ao final de cada etapa.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA TERCEIRA – DOS HONORÁRIOS E FORMA DE PAGAMENTO'
      },
      {
        type: 'paragraph',
        text: `3.1. Pelo efetivo desempenho das atividades dispostas neste contrato, a CONTRATADA receberá o valor total de ${totalValue}.`
      },
      {
        type: 'paragraph',
        text: `3.2. O pagamento será efetuado conforme cronograma financeiro acordado entre as partes, mediante apresentação de nota fiscal de serviços.${paymentText}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUARTA – DA VIGÊNCIA'
      },
      {
        type: 'paragraph',
        text: `4.1. O presente contrato vigorará de ${startDate} até ${endDate}, podendo ser prorrogado mediante acordo entre as partes.`
      },
      {
        type: 'paragraph',
        text: `4.2. Número do contrato: ${contractNumber}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUINTA – DAS OBRIGAÇÕES DAS PARTES'
      },
      {
        type: 'paragraph',
        text: '5.1. Obrigações da CONTRATADA:'
      },
      {
        type: 'paragraph',
        text: 'a) Executar os serviços com qualidade e dentro dos prazos estabelecidos;'
      },
      {
        type: 'paragraph',
        text: 'b) Manter sigilo absoluto sobre informações confidenciais da CONTRATANTE;'
      },
      {
        type: 'paragraph',
        text: 'c) Disponibilizar profissionais qualificados para execução dos serviços.'
      },
      {
        type: 'paragraph',
        text: '5.2. Obrigações da CONTRATANTE:'
      },
      {
        type: 'paragraph',
        text: 'a) Efetuar os pagamentos nos prazos acordados;'
      },
      {
        type: 'paragraph',
        text: 'b) Fornecer informações necessárias para execução dos serviços;'
      },
      {
        type: 'paragraph',
        text: 'c) Disponibilizar acesso às dependências e sistemas quando necessário.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEXTA – DA CONFIDENCIALIDADE'
      },
      {
        type: 'paragraph',
        text: '6.1. As partes comprometem-se a manter sigilo sobre todas as informações confidenciais trocadas durante a vigência deste contrato.'
      },
      {
        type: 'paragraph',
        text: '6.2. A obrigação de confidencialidade permanecerá válida mesmo após o término do contrato.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SÉTIMA – DA RESCISÃO'
      },
      {
        type: 'paragraph',
        text: '7.1. O presente contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio de 30 (trinta) dias.'
      },
      {
        type: 'paragraph',
        text: '7.2. Em caso de inadimplemento de qualquer das partes, o contrato poderá ser rescindido imediatamente.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA OITAVA – DO FORO'
      },
      {
        type: 'paragraph',
        text: '8.1. As PARTES elegem irrevogavelmente o Foro da Cidade de Goiânia, Estado de Goiás, para dirimir quaisquer dúvidas oriundas do presente Contrato, com renúncia a qualquer outro, por mais privilegiado que seja.'
      },
      {
        type: 'paragraph',
        text: 'E, POR ESTAREM ASSIM JUSTAS E CONTRATADAS, as PARTES assinam o presente Contrato em via única, em formato digital, por meio dos seus representantes legais devidamente autorizados.'
      },
      {
        type: 'paragraph',
        text: `Goiânia-GO, ${this.getCurrentDate()}`
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: 'TOP CONSULTORIA LTDA.',
        bold: true
      },
      {
        type: 'signature',
        text: 'CNPJ: 46.259.049/0001-64'
      },
      {
        type: 'signature',
        text: 'Francisca Mariana Ferreira de Sousa TOP Lopes'
      },
      {
        type: 'signature',
        text: 'Sócia Administradora'
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: clientName.toUpperCase(),
        bold: true
      },
      {
        type: 'signature',
        text: `${this.getDocumentType(clientDocument)}: ${clientDocument}`
      },
      {
        type: 'signature',
        text: 'CONTRATANTE',
        bold: true
      }
    ];
  }

  private getConsultoriaPFContent(clientName: string, clientDocument: string, contractNumber: string, totalValue: string, startDate: string, endDate: string, services: string, paymentText: string): any[] {
    return [
      {
        type: 'title',
        text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA CORPORATIVA'
      },
      {
        type: 'paragraph',
        text: `Pelo presente contrato particular de prestação de serviços de Consultoria Corporativa ("Contrato"), as partes:`
      },
      {
        type: 'paragraph',
        parts: [
          { text: '1. ', bold: false },
          { text: clientName.toUpperCase(), bold: true },
          { text: `, inscrito no CPF sob o nº ${clientDocument}, doravante designado simplesmente como `, bold: false },
          { text: 'CONTRATANTE', bold: true },
          { text: '; e', bold: false }
        ]
      },
      {
        type: 'paragraph',
        parts: [
          { text: '2. ', bold: false },
          { text: 'TOP CONSULTORIA LTDA.', bold: true },
          { text: ', sociedade empresária limitada, inscrita no CNPJ sob o n. 46.259.049/0001-64, com sede a Avenida Dep. Jamel Cecílio e Rua 14 e Rua 14-A, quadra c-9, lote 02/05-15, Ed. Flamboyant Park Business, sala 409, Jardim Goiás, Goiânia-GO, cujo endereço eletrônico é mariana@naueconsultoria.com.br, neste ato representado por sua sócia administradora Francisca Mariana Ferreira de Sousa TOP Lopes, na forma de seu Contrato Social, doravante designada simplesmente como ', bold: false },
          { text: 'CONTRATADA', bold: true },
          { text: '.', bold: false }
        ]
      },
      {
        type: 'paragraph',
        text: 'A CONTRATANTE e a CONTRATADA serão conjuntamente designados como "PARTES" e individualmente como "PARTE".'
      },
      {
        type: 'paragraph',
        text: 'ASSIM, as Partes resolvem, de comum acordo, celebrar o presente Contrato, de acordo com as condições abaixo descritas:'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA PRIMEIRA – OBJETO'
      },
      {
        type: 'paragraph',
        text: '1.1. O presente contrato tem por objeto a prestação de serviços de consultoria corporativa individual e mentoria executiva, incluindo avaliações psicológicas, testes comportamentais e desenvolvimento profissional.'
      },
      {
        type: 'paragraph',
        text: '1.2. Os serviços serão prestados sem exclusividade pela CONTRATADA, de forma individualizada e personalizada conforme as necessidades específicas do CONTRATANTE.'
      },
      {
        type: 'paragraph',
        text: '1.3. Inexistirá qualquer vínculo empregatício entre a CONTRATADA e o CONTRATANTE, sendo esta uma relação puramente comercial de prestação de serviços.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEGUNDA – DO ESCOPO DA PRESTAÇÃO DE SERVIÇOS'
      },
      {
        type: 'paragraph',
        text: `2.1. O escopo de entregas previstas neste contrato de mentoria e consultoria individual inclui: ${services}`
      },
      {
        type: 'paragraph',
        text: '2.2. As sessões de mentoria serão realizadas conforme cronograma acordado entre as partes, podendo ser presenciais ou remotas, conforme disponibilidade e conveniência mútua.'
      },
      {
        type: 'paragraph',
        text: '2.3. A CONTRATADA fornecerá relatórios e materiais de apoio ao desenvolvimento profissional do CONTRATANTE, incluindo ferramentas de autoavaliação e planos de desenvolvimento individual.'
      },
      {
        type: 'paragraph',
        text: '2.4. Serão aplicados testes psicológicos e comportamentais específicos, com emissão de laudos técnicos quando necessário.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA TERCEIRA – DOS HONORÁRIOS E FORMA DE PAGAMENTO'
      },
      {
        type: 'paragraph',
        text: `3.1. Pelo efetivo desempenho das atividades dispostas neste contrato, a CONTRATADA receberá o valor total de ${totalValue}.`
      },
      {
        type: 'paragraph',
        text: `3.2. O pagamento será efetuado mediante transferência bancária ou PIX, conforme dados bancários fornecidos pela CONTRATADA.${paymentText}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUARTA – DA VIGÊNCIA'
      },
      {
        type: 'paragraph',
        text: `4.1. O presente contrato vigorará de ${startDate} até ${endDate}, podendo ser prorrogado mediante acordo entre as partes.`
      },
      {
        type: 'paragraph',
        text: `4.2. Número do contrato: ${contractNumber}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUINTA – DA CONFIDENCIALIDADE'
      },
      {
        type: 'paragraph',
        text: '5.1. As partes comprometem-se a manter absoluto sigilo sobre todas as informações pessoais e profissionais compartilhadas durante as sessões de mentoria e consultoria.'
      },
      {
        type: 'paragraph',
        text: '5.2. A CONTRATADA obriga-se a manter confidencialidade sobre os resultados dos testes aplicados e avaliações realizadas, utilizando-os exclusivamente para os fins deste contrato.'
      },
      {
        type: 'paragraph',
        text: '5.3. A obrigação de confidencialidade permanecerá válida mesmo após o término do contrato.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEXTA – DA RESCISÃO'
      },
      {
        type: 'paragraph',
        text: '6.1. O presente contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio de 15 (quinze) dias.'
      },
      {
        type: 'paragraph',
        text: '6.2. Em caso de inadimplemento de qualquer das partes, o contrato poderá ser rescindido imediatamente.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SÉTIMA – DO FORO'
      },
      {
        type: 'paragraph',
        text: '7.1. As PARTES elegem irrevogavelmente o Foro da Cidade de Goiânia, Estado de Goiás, para dirimir quaisquer dúvidas oriundas do presente Contrato, com renúncia a qualquer outro, por mais privilegiado que seja.'
      },
      {
        type: 'paragraph',
        text: 'E, POR ESTAREM ASSIM JUSTAS E CONTRATADAS, as PARTES assinam o presente Contrato em via única, em formato digital.'
      },
      {
        type: 'paragraph',
        text: `Goiânia-GO, ${this.getCurrentDate()}`
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: 'TOP CONSULTORIA LTDA.',
        bold: true
      },
      {
        type: 'signature',
        text: 'CNPJ: 46.259.049/0001-64'
      },
      {
        type: 'signature',
        text: 'Francisca Mariana Ferreira de Sousa TOP Lopes'
      },
      {
        type: 'signature',
        text: 'Sócia Administradora'
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: clientName.toUpperCase(),
        bold: true
      },
      {
        type: 'signature',
        text: `CPF: ${clientDocument}`
      },
      {
        type: 'signature',
        text: 'CONTRATANTE',
        bold: true
      }
    ];
  }

  private getRecrutamentoContent(clientName: string, clientDocument: string, contractNumber: string, totalValue: string, startDate: string, endDate: string, services: string, paymentText: string): any[] {
    return [
      {
        type: 'title',
        text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE RECRUTAMENTO E SELEÇÃO (R&S)'
      },
      {
        type: 'paragraph',
        text: `Pelo presente contrato particular de prestação de serviços de Recrutamento e Seleção ("Contrato"), as partes:`
      },
      {
        type: 'paragraph',
        parts: [
          { text: '1. ', bold: false },
          { text: clientName.toUpperCase(), bold: true },
          { text: `, ${this.getClientType(clientDocument)}, inscrita no ${this.getDocumentType(clientDocument)} sob o nº ${clientDocument}, doravante designada simplesmente como `, bold: false },
          { text: 'CONTRATANTE', bold: true },
          { text: '; e', bold: false }
        ]
      },
      {
        type: 'paragraph',
        parts: [
          { text: '2. ', bold: false },
          { text: 'TOP CONSULTORIA LTDA.', bold: true },
          { text: ', sociedade empresária limitada, inscrita no CNPJ sob o n. 46.259.049/0001-64, com sede a Avenida Dep. Jamel Cecílio e Rua 14 e Rua 14-A, quadra c-9, lote 02/05-15, Ed. Flamboyant Park Business, sala 409, setor Jardim Goiás, Goiânia-GO, cujo endereço eletrônico é mariana@naueconsultoria.com.br, neste ato representado por sua sócia administradora Francisca Mariana Ferreira de Souza TOP Lopes, na forma de seu Contrato Social, doravante designada simplesmente como ', bold: false },
          { text: 'CONTRATADA', bold: true },
          { text: '.', bold: false }
        ]
      },
      {
        type: 'paragraph',
        text: 'A CONTRATANTE e a CONTRATADA serão conjuntamente designados como "PARTES" e individualmente como "PARTE".'
      },
      {
        type: 'paragraph',
        text: 'ASSIM, as Partes resolvem, de comum acordo, celebrar o presente Contrato, de acordo com as condições abaixo descritas:'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA PRIMEIRA – OBJETO'
      },
      {
        type: 'paragraph',
        text: '1.1. O presente contrato tem por objeto a prestação de serviços especializados de recrutamento e seleção de pessoal, incluindo todo o processo seletivo desde o levantamento de necessidades até a apresentação dos candidatos finais.'
      },
      {
        type: 'paragraph',
        text: '1.2. Os serviços serão prestados sem exclusividade pela CONTRATADA, seguindo metodologia própria e melhores práticas do mercado de recursos humanos.'
      },
      {
        type: 'paragraph',
        text: '1.3. Inexistirá qualquer vínculo empregatício entre a CONTRATADA e a CONTRATANTE, sendo esta uma relação puramente comercial de prestação de serviços.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEGUNDA – DO ESCOPO DA PRESTAÇÃO DE SERVIÇOS'
      },
      {
        type: 'paragraph',
        text: '2.1. O escopo de entregas previstas neste contrato inclui as seguintes etapas:'
      },
      {
        type: 'paragraph',
        text: '**1ª Etapa - Levantamento de Necessidades:**'
      },
      {
        type: 'paragraph',
        text: '- Conhecimento do negócio, da empresa e suas verdadeiras necessidades;'
      },
      {
        type: 'paragraph',
        text: '- Levantamento detalhado do perfil do cargo junto ao cliente;'
      },
      {
        type: 'paragraph',
        text: '- Definição de competências técnicas e comportamentais desejadas;'
      },
      {
        type: 'paragraph',
        text: '- Análise do ambiente organizacional e cultura empresarial.'
      },
      {
        type: 'paragraph',
        text: '**2ª Etapa - Divulgação e Captação de Currículos:**'
      },
      {
        type: 'paragraph',
        text: '- Realização de anúncios da vaga nas redes sociais e canais de divulgação;'
      },
      {
        type: 'paragraph',
        text: '- Utilização de banco de dados próprio de candidatos;'
      },
      {
        type: 'paragraph',
        text: '- Headhunting direcionado quando necessário;'
      },
      {
        type: 'paragraph',
        text: '- Divulgação em plataformas especializadas de recrutamento.'
      },
      {
        type: 'paragraph',
        text: '**3ª Etapa - Recrutamento:**'
      },
      {
        type: 'paragraph',
        text: '- Realização de triagem dos currículos de acordo com as exigências da empresa;'
      },
      {
        type: 'paragraph',
        text: '- Entrevista de seleção elaborada e planejada;'
      },
      {
        type: 'paragraph',
        text: '- Análise preliminar de adequação ao perfil;'
      },
      {
        type: 'paragraph',
        text: '- Verificação de referências profissionais.'
      },
      {
        type: 'paragraph',
        text: '**4ª Etapa - Seleção:**'
      },
      {
        type: 'paragraph',
        text: '- Aplicação de testes situacionais, conhecimentos específicos ou técnicos;'
      },
      {
        type: 'paragraph',
        text: '- Avaliação Psicológica com confecção de Laudo técnico;'
      },
      {
        type: 'paragraph',
        text: '- Entrevista técnica com o supervisor imediato;'
      },
      {
        type: 'paragraph',
        text: '- Apresentação de relatório final com recomendações.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA TERCEIRA – DOS HONORÁRIOS E FORMA DE PAGAMENTO'
      },
      {
        type: 'paragraph',
        text: `3.1. Pelo efetivo desempenho das atividades dispostas neste contrato, a CONTRATADA receberá o valor total de ${totalValue}.`
      },
      {
        type: 'paragraph',
        text: `3.2. O pagamento será efetuado conforme cronograma acordado entre as partes, mediante apresentação de nota fiscal de serviços.${paymentText}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUARTA – DA VIGÊNCIA E PRAZO DE EXECUÇÃO'
      },
      {
        type: 'paragraph',
        text: `4.1. O presente contrato vigorará de ${startDate} até ${endDate}.`
      },
      {
        type: 'paragraph',
        text: '4.2. O prazo para conclusão do processo seletivo será de até 45 (quarenta e cinco) dias corridos, contados a partir da assinatura deste contrato, podendo ser prorrogado mediante acordo entre as partes.'
      },
      {
        type: 'paragraph',
        text: `4.3. Número do contrato: ${contractNumber}`
      },
      {
        type: 'heading',
        text: 'CLÁUSULA QUINTA – DAS OBRIGAÇÕES DAS PARTES'
      },
      {
        type: 'paragraph',
        text: '5.1. Obrigações da CONTRATADA:'
      },
      {
        type: 'paragraph',
        text: 'a) Executar o processo seletivo com qualidade e dentro dos prazos estabelecidos;'
      },
      {
        type: 'paragraph',
        text: 'b) Manter sigilo absoluto sobre informações da empresa e candidatos;'
      },
      {
        type: 'paragraph',
        text: 'c) Apresentar no mínimo 3 (três) candidatos finalistas;'
      },
      {
        type: 'paragraph',
        text: 'd) Fornecer relatórios detalhados sobre cada candidato.'
      },
      {
        type: 'paragraph',
        text: '5.2. Obrigações da CONTRATANTE:'
      },
      {
        type: 'paragraph',
        text: 'a) Efetuar os pagamentos nos prazos acordados;'
      },
      {
        type: 'paragraph',
        text: 'b) Fornecer informações completas sobre o cargo e perfil desejado;'
      },
      {
        type: 'paragraph',
        text: 'c) Disponibilizar pessoa responsável para acompanhamento do processo;'
      },
      {
        type: 'paragraph',
        text: 'd) Dar retorno sobre os candidatos apresentados em até 5 dias úteis.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SEXTA – DA CONFIDENCIALIDADE'
      },
      {
        type: 'paragraph',
        text: '6.1. As partes comprometem-se a manter sigilo sobre todas as informações trocadas durante o processo seletivo.'
      },
      {
        type: 'paragraph',
        text: '6.2. A CONTRATADA obriga-se a manter confidencialidade sobre os dados dos candidatos e resultados das avaliações.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA SÉTIMA – DA GARANTIA'
      },
      {
        type: 'paragraph',
        text: '7.1. A CONTRATADA oferece garantia de 90 (noventa) dias sobre o profissional contratado, comprometendo-se a realizar novo processo seletivo sem custos adicionais caso o candidato contratado seja desligado por inadequação ao cargo neste período.'
      },
      {
        type: 'heading',
        text: 'CLÁUSULA OITAVA – DO FORO'
      },
      {
        type: 'paragraph',
        text: '8.1. As PARTES elegem irrevogavelmente o Foro da Cidade de Goiânia, Estado de Goiás, para dirimir quaisquer dúvidas oriundas do presente Contrato, com renúncia a qualquer outro, por mais privilegiado que seja.'
      },
      {
        type: 'paragraph',
        text: 'E, POR ESTAREM ASSIM JUSTAS E CONTRATADAS, as PARTES assinam o presente Contrato em via única, em formato digital.'
      },
      {
        type: 'paragraph',
        text: `Goiânia-GO, ${this.getCurrentDate()}`
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: 'TOP CONSULTORIA LTDA.',
        bold: true
      },
      {
        type: 'signature',
        text: 'CNPJ: 46.259.049/0001-64'
      },
      {
        type: 'signature',
        text: 'Francisca Mariana Ferreira de Souza TOP Lopes'
      },
      {
        type: 'signature',
        text: 'Sócia Administradora'
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'spacing',
        text: ''
      },
      {
        type: 'signature',
        text: '___________________________________________________'
      },
      {
        type: 'signature',
        text: clientName.toUpperCase(),
        bold: true
      },
      {
        type: 'signature',
        text: `${this.getDocumentType(clientDocument)}: ${clientDocument}`
      },
      {
        type: 'signature',
        text: 'CONTRATANTE',
        bold: true
      }
    ];
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '[DATA]';
    
    // Se a data está no formato YYYY-MM-DD, adicionar T00:00:00 para garantir que seja interpretada como local
    const normalizedDateString = dateString.includes('T') ? dateString : `${dateString}T00:00:00`;
    const date = new Date(normalizedDateString);
    return date.toLocaleDateString('pt-BR');
  }

  private generateFileName(contract: any, templateId: string, extension: string): string {
    const clientName = this.getClientName(contract.client);
    const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const contractNumber = contract.contract_number || 'Contrato';
    const templateName = this.getTemplateName(templateId);
    
    return `${contractNumber}_${sanitizedClientName}_${templateName}.${extension}`;
  }

  private getTemplateName(templateId: string): string {
    switch (templateId) {
      case 'consultoria-pj': return 'Consultoria_PJ';
      case 'consultoria-pf': return 'Consultoria_PF';
      case 'recrutamento': return 'Recrutamento';
      default: return 'Contrato';
    }
  }

  private getClientType(document: string): string {
    // Detecta se é CPF (11 dígitos) ou CNPJ (14 dígitos)
    const numbersOnly = document.replace(/\D/g, '');
    return numbersOnly.length === 11 ? 'pessoa física' : 'sociedade empresária limitada';
  }

  private getDocumentType(document: string): string {
    const numbersOnly = document.replace(/\D/g, '');
    return numbersOnly.length === 11 ? 'CPF' : 'CNPJ';
  }

  private getCurrentDate(): string {
    const now = new Date();
    return now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  private getClientDocument(client: any): string {
    if (!client) return '000.000.000-00';
    
    // Para PF (Pessoa Física)
    if (client.clients_pf && client.clients_pf.length > 0) {
      return client.clients_pf[0].cpf || '000.000.000-00';
    }
    
    // Para PJ (Pessoa Jurídica)
    if (client.clients_pj && client.clients_pj.length > 0) {
      return client.clients_pj[0].cnpj || '00.000.000/0000-00';
    }
    
    // Campos diretos do cliente
    if (client.cpf) return client.cpf;
    if (client.cnpj) return client.cnpj;
    if (client.document) return client.document;
    
    // Fallback padrão
    return '000.000.000-00';
  }

  private getClientName(client: any): string {
    if (!client) return 'Cliente não informado';
    
    // Se já tem nome processado
    if (client.name) return client.name;
    
    // Para PF (Pessoa Física)
    if (client.clients_pf && client.clients_pf.length > 0) {
      return client.clients_pf[0].full_name || 'Nome não informado';
    }
    
    // Para PJ (Pessoa Jurídica)
    if (client.clients_pj && client.clients_pj.length > 0) {
      return client.clients_pj[0].company_name || client.clients_pj[0].trade_name || 'Empresa não informada';
    }
    
    return 'Cliente não identificado';
  }

  private isContractInstallment(contract: any): boolean {
    return contract.installment_count > 1 || (contract.installments && contract.installments.length > 0);
  }

  private formatInstallments(contract: any): string {
    if (!this.isContractInstallment(contract) || !contract.installments) {
      return '';
    }

    const installments = contract.installments;
    if (!Array.isArray(installments) || installments.length === 0) {
      return '';
    }

    // Formatar as parcelas
    const formattedInstallments = installments.map((installment: any, index: number) => {
      const dueDate = this.formatDate(installment.due_date);
      const amount = this.formatCurrency(installment.amount || 0);
      const installmentNumber = installment.installment_number || (index + 1);
      
      return `${installmentNumber}ª parcela: ${amount} - Vencimento: ${dueDate}`;
    }).join('\n');

    return `\n\nPARCELAMENTO:\n${formattedInstallments}`;
  }

  // Métodos para lidar com informações de permuta
  private hasBarterPayment(contract: any): boolean {
    return contract.payment_method === 'Permuta' && contract.barter_type;
  }

  private getBarterAmount(contract: any): number {
    if (!this.hasBarterPayment(contract)) return 0;
    
    if (contract.barter_type === 'percentage' && contract.barter_percentage) {
      return (contract.total_value * contract.barter_percentage) / 100;
    } else if (contract.barter_type === 'value' && contract.barter_value) {
      return Math.min(contract.barter_value, contract.total_value);
    }
    
    return 0;
  }

  private getRemainingValueAfterBarter(contract: any): number {
    if (!this.hasBarterPayment(contract)) return contract.total_value;
    
    const barterAmount = this.getBarterAmount(contract);
    return Math.max(0, contract.total_value - barterAmount);
  }

  private formatBarterInfo(contract: any): string {
    if (!this.hasBarterPayment(contract)) return '';

    const barterAmount = this.getBarterAmount(contract);
    const remainingValue = this.getRemainingValueAfterBarter(contract);
    
    let barterDetails = '';
    if (contract.barter_type === 'percentage') {
      barterDetails = `${contract.barter_percentage}% do valor total`;
    } else if (contract.barter_type === 'value') {
      barterDetails = `valor fixo de ${this.formatCurrency(contract.barter_value)}`;
    }

    let paymentInfo = `\n\nDETALHES DO PAGAMENTO:\n`;
    paymentInfo += `• Forma de pagamento principal: Permuta (${barterDetails})\n`;
    paymentInfo += `• Valor total do contrato: ${this.formatCurrency(contract.total_value)}\n`;
    paymentInfo += `• Valor abatido por permuta: ${this.formatCurrency(barterAmount)}`;

    if (remainingValue > 0) {
      paymentInfo += `\n• Valor restante a pagar: ${this.formatCurrency(remainingValue)}`;
      
      if (contract.secondary_payment_method) {
        paymentInfo += `\n• Forma de pagamento do valor restante: ${contract.secondary_payment_method}`;
        
        // Se o valor restante for parcelado
        if (contract.installment_count > 1 && contract.installments) {
          const installmentsText = this.formatInstallments(contract);
          paymentInfo += installmentsText.replace('PARCELAMENTO:', '\nPARCELAMENTO DO VALOR RESTANTE:');
        }
      }
    } else {
      paymentInfo += `\n• O valor total será pago integralmente através de permuta.`;
    }

    return paymentInfo;
  }
}