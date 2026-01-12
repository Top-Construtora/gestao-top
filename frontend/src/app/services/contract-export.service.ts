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
                size: 32,
                font: 'Arial'
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
                size: 24,
                font: 'Arial'
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
                bold: section.bold || false,
                font: 'Arial'
              })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 }
            });
          } else if (section.type === 'paragraph-bold') {
            return new Paragraph({
              children: [new TextRun({
                text: section.text,
                size: 20,
                bold: true,
                font: 'Arial'
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
                  bold: part.bold || false,
                  italic: part.italic || false,
                  underline: part.underline ? {} : undefined,
                  font: 'Arial'
                })),
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120 }
              });
            } else {
              return new Paragraph({
                children: [new TextRun({
                  text: section.text,
                  size: 20,
                  font: 'Arial'
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
    const clientAddress = this.getClientAddress(contract.client);
    const clientEmail = this.getClientEmail(contract.client);
    const clientRepresentative = this.getClientRepresentative(contract.client);

    const contractNumber = contract.contract_number || '[NUMERO_CONTRATO]';
    const totalValue = this.formatCurrency(contract.total_value || 0);
    const startDate = this.formatDate(contract.start_date);
    const endDate = this.formatDate(contract.end_date);

    // Formatar serviços com descrições, excluindo os internos
    const services = this.formatServicesWithDescriptions(contract.contract_services);
    
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
        return this.getConsultoriaPJContent(clientName, clientDocument, contractNumber, totalValue, startDate, endDate, services, paymentText, clientAddress, clientEmail, clientRepresentative, contract.contract_services);
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

  private getConsultoriaPJContent(clientName: string, clientDocument: string, contractNumber: string, totalValue: string, startDate: string, endDate: string, services: string, paymentText: string, clientAddress: string, clientEmail: string, clientRepresentative: string, contractServices?: any[]): any[] {
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
        { text: `, ${this.getClientType(clientDocument)}, inscrita no ${this.getDocumentType(clientDocument)} sob o nº ${clientDocument}, com sede a ${clientAddress}, cujo endereço eletrônico é ${clientEmail}, neste ato representado por ${clientRepresentative}, na forma de seu Contrato Social, doravante designada simplesmente como `, bold: false },
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

    // CLÁUSULA 1 - OBJETO
    {
      type: 'heading',
      text: '1. OBJETO'
    },
    {
      type: 'paragraph',
      text: '1.1. As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços em Consultoria Corporativa, considerando as disposições do Código Civil Brasileiro, que se regerá com fundamento nos artigos 421, 422, 425, 594 e 598 do Código Civil Brasileiro, bem como no princípio do pacta sunt servanda e na Lei 13.429/17 (Lei da Terceirização), pelas cláusulas, condições de preço, forma e termo de pagamento descritas no presente contrato.'
    },
    {
      type: 'paragraph',
      text: '1.2. O objeto do presente contrato e demais serviços serão prestados sem exclusividade pela Contratada;'
    },
    {
      type: 'paragraph',
      text: '1.3. Todos os serviços elencados no presente Contrato serão executados por pessoal devidamente habilitado pela CONTRATADA, a quem compete com exclusividade o pagamento pelos trabalhos realizados, a fiscalização e o cumprimento do ora pactuado, bem como todas as demais obrigações legais, ficando desta forma, expressamente excluída a responsabilidade da CONTRATANTE sobre qualquer matéria trabalhista e/ou tributária disposta neste Contrato.'
    },
    {
      type: 'paragraph',
      text: '1.4. Inexistirá qualquer vínculo empregatício entre a CONTRATADA e a CONTRATANTE, sem prejuízo da obrigação da CONTRATADA de respeitar as políticas internas da Contratante e demais obrigações e limitações previstas no presente Contrato e na legislação vigente.'
    },

    // CLÁUSULA 2 - LOCAL DA PRESTAÇÃO DE SERVIÇO
    {
      type: 'heading',
      text: '2. LOCAL DA PRESTAÇÃO DE SERVIÇO'
    },
    {
      type: 'paragraph',
      text: '2.1. O objeto deste Contrato será prestado na sede da empresa da CONTRATANTE, que arcará com todas as despesas relacionadas com a execução dos serviços ora contratados, podendo ser realizado na sede da Contratada, de forma remota/online ou em local diverso acordado previamente entre as partes.'
    },

    // CLÁUSULA 3 - DO ESCOPO DA PRESTAÇÃO DE SERVIÇOS
    {
      type: 'heading',
      text: '3. DO ESCOPO DA PRESTAÇÃO DE SERVIÇOS'
    },
    {
      type: 'paragraph',
      text: `3.1. O escopo de entregas previstas neste contrato inclui:`
    },
    // Adicionar serviços detalhados
    ...(contractServices ? this.formatServicesDetailed(contractServices) : [{ type: 'paragraph', text: `Os serviços contratados são: ${services}` }]),

    // CLÁUSULA 4 - DAS OBRIGAÇÕES DA CONTRATANTE
    {
      type: 'heading',
      text: '4. DAS OBRIGAÇÕES DA CONTRATANTE'
    },
    {
      type: 'paragraph',
      text: '4.1. Realizar o pagamento, conforme disposto na cláusula 6 deste contrato;'
    },
    {
      type: 'paragraph',
      text: '4.2. É dever da CONTRATANTE zelar para que a CONTRATADA tenha à sua disposição todas as informações necessárias para as elaborações dos materiais, inclusive documentações financeiras, fiscais e/ou de colaboradores, que serão utilizados para construção dos materiais necessários;'
    },
    {
      type: 'paragraph',
      text: '4.3. Fica vedado à CONTRATANTE negociar abatimentos, descontos ou dilações de prazo para o pagamento ou execução dos serviços, sem o prévio conhecimento e autorização da contratada;'
    },
    {
      type: 'paragraph',
      text: '4.4. Tratar o profissional com respeito, discrição, profissionalismo, lhe dando todo o suporte e liberdade dispostos nesse instrumento contratual;'
    },
    {
      type: 'paragraph',
      text: '4.5. É dever da CONTRATANTE informar previamente à CONTRATADA sobre toda e qualquer anormalidade que possa influir nos resultados do projeto;'
    },
    {
      type: 'paragraph',
      text: '4.6. Caso a CONTRATANTE, a seu exclusivo critério, contrate os serviços de softwares de terceiros para sua plataforma, que não façam parte do escopo da prestação de serviços DA CONTRATADA, esta não assumirá qualquer responsabilidade pelos serviços executados, bem como pelo bom funcionamento do software, não se responsabilizando pelo pagamento de despesas operacionais, contratação de software de terceiros, traslados ou eventuais despesas com produção de material e veiculação de mídia, as quais são encargos da CONTRATANTE.'
    },

    // CLÁUSULA 5 - DAS OBRIGAÇÕES DA CONTRATADA
    {
      type: 'heading',
      text: '5. DAS OBRIGAÇÕES DA CONTRATADA'
    },
    {
      type: 'paragraph',
      text: '5.1. Cumprir integralmente o disposto neste contrato;'
    },
    {
      type: 'paragraph',
      text: '5.2. Fornecer à CONTRATANTE informações sobre as especificidades dos serviços necessários ao bom andamento das atividades desenvolvidas pela CONTRATANTE;'
    },
    {
      type: 'paragraph',
      text: '5.3. Prestar contas, quando julgar necessário, à CONTRATANTE sobre suas atividades realizadas ou quando for solicitado pela CONTRATADA;'
    },
    {
      type: 'paragraph',
      text: '5.4. Compromete-se, outrossim, a CONTRATADA, ao exercer suas atividades profissionais, executá-las com zelo, cordialidade, simpatia, profissionalismo e da melhor maneira possível, a fim de que não seja denegrido o bom nome do estabelecimento.'
    },
    {
      type: 'paragraph',
      text: '5.5. Deverá a CONTRATADA no convívio com os demais profissionais do estabelecimento, comportar-se de forma respeitosa (moral, social e profissional), não dando margem a reclamações, bem como se responsabilizando por seus auxiliares particulares, isto é, contratados por ela e que não fazem parte do corpo de funcionários da CONTRATANTE.'
    },
    {
      type: 'paragraph',
      text: '5.6. Prestar os serviços levando em consideração os critérios técnicos necessários para cada uma das atividades do escopo estabelecido como objeto do contrato, sob pena de ser responsabilizada por qualquer ação ou omissão que represente ato ilícito, nos termos da lei vigente.'
    },

    // CLÁUSULA 6 - DOS HONORÁRIOS
    {
      type: 'heading',
      text: '6. DOS HONORÁRIOS'
    },
    {
      type: 'paragraph',
      text: `6.1. Pelo efetivo desempenho das atividades dispostas neste contrato, a CONTRATADA receberá o valor total de ${totalValue}.`
    },
    {
      type: 'paragraph',
      text: `6.2. ${paymentText}`
    },
    {
      type: 'paragraph',
      text: '6.3. Correm por conta da CONTRATADA a responsabilidade pelos encargos tributários e previdenciários sobre os seus honorários, vez que não autoriza o desconto dos tributos pela CONTRATANTE.'
    },
    {
      type: 'paragraph',
      text: '6.4. As notas fiscais serão emitidas no prazo mínimo de 15 dias anteriores ao vencimento das parcelas.'
    },
    {
      type: 'paragraph',
      text: '6.5. A CONTRATADA poderá, a seu exclusivo critério e sem prejuízo à CONTRATANTE, direcionar a emissão das Notas Fiscais referentes aos serviços prestados em nome de terceiros, utilizando CNPJ distinto daquele pertencente à CONTRATADA, ainda que o referido CNPJ não faça parte do mesmo grupo econômico. A emissão da Nota Fiscal por terceiros não implicará em alteração das responsabilidades da CONTRATADA perante a CONTRATANTE, que se manterão inalteradas nos termos deste contrato. A CONTRATADA se compromete a garantir que todos os tributos e demais obrigações fiscais decorrentes da emissão sejam devidamente cumpridas conforme a legislação aplicável.'
    },
    {
      type: 'paragraph',
      text: '6.6. No valor acima previsto estão inclusos todos os custos diretos da CONTRATADA (mão de obra, instalação/configuração, administração, encargos sociais, trabalhistas e tributários etc.), não sendo admitida, a qualquer título, a cobrança de valores adicionais.'
    },
    {
      type: 'paragraph',
      text: '6.7. Os custos indiretos cuja titular seja a parte CONTRATANTE (taxas, seguros, tributos, despesas cartorárias e emolumentos etc.), bem como qualquer insumo que possa influir sobre a execução das atividades descritas na cláusula 3ª não estão inclusos no valor acima descrito, podendo haver cobranças adicionais, desde que previamente avaliado pelas Partes.'
    },
    {
      type: 'paragraph',
      text: '6.8. Todas as despesas em viagens fora da região metropolitana de Goiânia-GO (raio de 25 km) necessárias para a execução dos serviços dos trabalhos, incluindo, mas não se limitando a transporte aéreo, transporte terrestre, hospedagem em hotel igual ou acima a 3 estrelas em quarto single, alimentação, deverão ser aprovadas pela CONTRATANTE previamente e serão cobertas por ela.'
    },

    // CLÁUSULA 7 - DA MORA
    {
      type: 'heading',
      text: '7. DA MORA'
    },
    {
      type: 'paragraph',
      text: '7.1. A mora da CONTRATANTE no descumprimento de qualquer uma das parcelas assumidas neste Contrato, desde que referido descumprimento não seja sanado no prazo de 3 (três) dias contados do envio de notificação pela CONTRATADA nesse sentido, acarretará as seguintes penalidades:'
    },
    {
      type: 'paragraph',
      text: '7.2. Correção monetária, de acordo com os critérios de atualização monetária previstos neste Contrato e calculada pro rata die;'
    },
    {
      type: 'paragraph',
      text: '7.3. Juros de mora de 1% (um por cento) ao mês, ou fração, calculados pro rata die, que incidirão sobre o valor do principal;'
    },
    {
      type: 'paragraph',
      text: '7.4. Multa moratória de 2% (dois por cento) sobre o valor da prestação;'
    },
    {
      type: 'paragraph',
      text: '7.5. Honorários na base de 10% (dez por cento) sobre o valor do débito atualizado, e despesas extrajudiciais, se necessária a intervenção de terceirizada de cobrança extrajudicial, sendo que em sede de cobrança via judicial, incidirão honorários advocatícios no importe de 20% (vinte por cento) sobre o valor do débito atualizado, acrescidos das custas judiciais.'
    },
    {
      type: 'paragraph',
      text: '7.6. Outras despesas incidentes sobre o débito e decorrentes de possíveis cobranças (notificações, publicação em edital, entre outras).'
    },
    {
      type: 'paragraph',
      text: '7.7. Caso alguma parcela não seja quitada em até 30 (trinta) dias após o seu vencimento, a CONTRATADA terá o direito de encaminhá-lo para protesto, bem como inserir o(s) nome(s) do(s) CONTRATANTE(s) no cadastro dos Órgãos de Proteção ao Consumidor SPC e SERASA.'
    },

    // CLÁUSULA 8 - DO PRAZO E DA RESCISÃO
    {
      type: 'heading',
      text: '8. DO PRAZO E DA RESCISÃO'
    },
    {
      type: 'paragraph',
      text: `8.1. O presente contrato vigorará de ${startDate} até ${endDate}, podendo, no entanto, ser rescindido antecipadamente por qualquer das Partes, mediante envio de notificação a outra Parte com 30 (trinta) dias de antecedência.`
    },
    {
      type: 'paragraph',
      text: '8.2. O presente Contrato poderá ser rescindido antecipadamente com efeito imediato, sem ônus ou penalidades às Partes, nos seguintes casos:'
    },
    {
      type: 'paragraph',
      text: 'a) Por mútuo acordo entre as Partes;'
    },
    {
      type: 'paragraph',
      text: 'b) Ocorrer homologação ou decretação de falência, insolvência, liquidação judicial ou extrajudicial ou ocorrer pedido de recuperação judicial ou extrajudicial de qualquer das Partes;'
    },
    {
      type: 'paragraph',
      text: 'c) Unilateralmente, por qualquer das Partes, em caso de descumprimento pela outra Parte das obrigações impostas por este Contrato, ou dos seus deveres fiduciários previstos em lei, desde que referido descumprimento não seja sanado no prazo de 3 (três) dias contados do envio de notificação pela outra Parte nesse sentido; e'
    },
    {
      type: 'paragraph',
      text: 'd) Unilateralmente, por qualquer das Partes, caso não haja interesse na continuidade da relação contratual, observando o aviso prévio de 30 (trinta) dias.'
    },
    {
      type: 'paragraph',
      text: '8.3. Na hipótese de rescisão antecipada, as Partes realizarão encontro de contas entre a parcela do preço já paga pela CONTRATANTE e a parte dos serviços efetivamente prestados pela CONTRATADA, sendo assegurado à CONTRATADA o recebimento proporcional aos serviços executados, com devolução pela CONTRATADA de eventual valor recebido em excesso.'
    },
    {
      type: 'paragraph',
      text: '8.4. Em caso de rescisão antecipada imotivada por iniciativa da CONTRATANTE, sem a observância do disposto no item 8.2, alínea "d", esta ficará sujeita, além das disposições do item 8.3, ao pagamento de multa compensatória correspondente a 10% (dez por cento) do valor remanescente do contrato à época da rescisão.'
    },

    // CLÁUSULA 9 - DO SIGILO
    {
      type: 'heading',
      text: '9. DO SIGILO'
    },
    {
      type: 'paragraph',
      text: '9.1. As Partes se obrigam a manter o mais completo e absoluto sigilo sobre toda "Informação Confidencial", que para os fins do presente Contrato significa quaisquer dados de clientes, colaboradores, materiais ou conteúdos eletrônicos ou físicos, artigos, estratégias, pormenores, informações escritas ou verbais, documentos, especificações técnicas ou comerciais, listas de clientes, material publicitário, planos e projetos destinados aos clientes, inovações e aperfeiçoamentos da outra Parte, ou qualquer informação não disponível ao público ou que não tenha sido permitida sua divulgação, que venha a ter conhecimento ou acesso, em razão desta relação contratual, sejam eles de interesse da Parte violada ou de terceiros, bem como qualquer outro material ou documento, que a CONTRATANTE, seus acionistas, controladoras ou sociedades sob controle comum, bem como clientes presentes e passados identifiquem ou tratem como sendo confidencial, não podendo, sob qualquer pretexto, divulgar, revelar, reproduzir, utilizar ou deles dar conhecimento a terceiros, estranhos ao presente Contrato.'
    },
    {
      type: 'paragraph',
      text: '9.2. A CONTRATADA obriga-se a não transmitir, direta ou indiretamente, a quem quer que seja, na vigência do contrato ou, posteriormente a ele, quaisquer informações confidenciais, mantendo sigilo absoluto quanto a tais conhecimentos, por qualquer meio e a qualquer tempo, sob pena de responsabilização civil e penal. Frise-se que esse compromisso assumido pela CONTRATADA se estende a seus prepostos, empregados, subcontratados ou a qualquer indivíduo que lhe preste serviços e tenha acesso, por qualquer meio, às Informações Confidenciais.'
    },
    {
      type: 'paragraph',
      text: '9.3. A CONTRATADA se obriga a utilizar a Informação Confidencial única e exclusivamente no interesse da CONTRATANTE, visando a cumprir com seus deveres e funções nos termos deste Contrato.'
    },
    {
      type: 'paragraph',
      text: '9.4. A CONTRATADA concorda que toda e qualquer documentação compilada durante o curso deste Contrato, seja por escrito ou em meios eletrônicos, deverá ser entregue à CONTRATANTE ao final do presente Contrato ou mediante solicitação da CONTRATANTE.'
    },
    {
      type: 'paragraph',
      text: '9.5. As obrigações de sigilo e confidencialidade previstas nesta Cláusula persistirão mesmo após a cessação do presente Contrato (seja qual for a causa ou forma de cessação) e enquanto tal informação não for do conhecimento público.'
    },

    // CLÁUSULA 10 - CONDIÇÕES GERAIS
    {
      type: 'heading',
      text: '10. CONDIÇÕES GERAIS'
    },
    {
      type: 'paragraph',
      text: '10.1. Legislação Aplicável: O presente Contrato será regido e interpretado de acordo com as leis da República Federativa do Brasil.'
    },
    {
      type: 'paragraph',
      text: '10.2. Acordo entre as partes: O presente Contrato representa a integralidade das disposições contratadas entre as Partes, e substitui todos os acordos anteriores, quer expressos ou tácitos, bem como qualquer minuta ou acordo verbal anterior entre as Partes, sendo que qualquer acerto não previsto neste Contrato não tem validade por ele presumida.'
    },
    {
      type: 'paragraph',
      text: '10.3. Invalidade Parcial: Se qualquer das cláusulas deste Contrato for considerada nula ou ineficaz, tal decisão não afetará a validade e eficácia das demais cláusulas, que subsistirão e serão consideradas plenamente válidas e eficazes como se a cláusula nula ou ineficaz tivesse sido eliminada.'
    },
    {
      type: 'paragraph',
      text: '10.4. Sucessores: O presente Contrato vincula e obriga as Partes e seus respectivos sucessores a qualquer título.'
    },
    {
      type: 'paragraph',
      text: '10.5. Alteração: Este Contrato só poderá ser modificado, nem haverá renúncia de suas disposições, exceto por meio de aditamento e consentimento, por escrito, de todas as Partes signatárias, observando o disposto na legislação aplicável.'
    },
    {
      type: 'paragraph',
      text: '10.6. Proporcionalidade: As obrigações assumidas pelas Partes são reconhecidas por todas como manifestamente proporcionais, estando cientes de todas as circunstâncias e regras que norteiam os presentes negócios jurídicos, não se verificando neste ajuste qualquer fato ou obrigação que possa vir a ser caracterizado como lesão, para efeitos do Artigo 157 do Código Civil Brasileiro.'
    },
    {
      type: 'paragraph',
      text: '10.7. Tolerância ou Novação: Caso qualquer das Partes deixe de exigir o cumprimento pontual ou integral das obrigações decorrentes deste Contrato, ou deixe de exercer qualquer direito ou faculdade que lhe seja atribuído, tal fato será interpretado como mera tolerância, a título de liberalidade e não importará em renúncia aos direitos e faculdades não exercidos, nem em precedente, novação ou revogação de qualquer premissa ou condição do presente Contrato.'
    },
    {
      type: 'paragraph',
      text: '10.8. Compliance: As Partes se comprometem a praticarem, celebrarem ou formalizarem todos e quaisquer atos, ações e/ou documentos necessários ou adicionais ao presente Contrato, com o intuito de melhor evidenciar, aperfeiçoar ou executar qualquer dos termos e disposição ora avençadas, se comprometendo a observarem as boas práticas e de integridade (Compliance), zelando pelo pleno atendimento às normas legais.'
    },
    {
      type: 'paragraph',
      text: '10.9. Exequibilidade: Todas as obrigações previstas neste Contrato são passíveis de execução específica, nos termos da legislação processual em vigor, servindo este Contrato como título executivo extrajudicial, nos termos do Artigo 784, inciso III, do Código de Processo Civil.'
    },
    {
      type: 'paragraph',
      text: '10.10. Anticorrupção: As Partes declaram conhecer as normas de prevenção à corrupção previstas na legislação brasileira, dentre elas o Código Penal Brasileiro, a Lei de Improbidade Administrativa (Lei nº 8.429/1992) e a Lei nº 12.846/2013 (em conjunto, "Leis Anticorrupção") e, se comprometem a cumpri-las fielmente, por si e por seus representantes, administradores, diretores, conselheiros, sócios ou acionistas, assessores, consultores, empregados e quaisquer outros que estejam vinculados direta ou indiretamente ao presente Contrato, bem como exigir o seu cumprimento pelos terceiros por ela contratados.'
    },
    {
      type: 'paragraph',
      text: '10.11. Notificações: Todas as notificações e comunicações relacionadas a este Contrato deverão ser encaminhadas por escrito, via e-mail com comprovação de envio e recebimento, dirigidos e/ou entregues às Partes signatárias nos endereços indicados na qualificação das Partes acima, as quais obrigam-se, desde já, a informarem por escrito, quaisquer alterações.'
    },
    {
      type: 'paragraph',
      text: '10.12. Assinatura Eletrônica: As Partes afirmam e declaram que o presente Contrato, bem como àqueles instrumentos a ele coligados, poderão ser assinados por meio eletrônico, sendo consideradas válidas as referidas assinaturas, reconhecendo como válidas as assinaturas enviadas para o(s) endereço(s) eletrônico(s) previstos neste Contrato, inclusive àqueles do(s) seu(s) representante(s) aqui qualificados, nos termos do art. 10, parágrafo 2º, da MP2200-2/2001.'
    },
    {
      type: 'paragraph',
      text: '10.13. Hierarquia e Subordinação: Não haverá hierarquia nem subordinação entre Contratante e Contratada, devendo tratar-se com consideração e respeito recíprocos, observando sempre o regimento Interno.'
    },
    {
      type: 'paragraph',
      text: '10.14. Relação Empregatícia: Tal contrato não possui condão de relação empregatícia, não incorrendo em habitualidade, subordinação e onerosidade, excluindo-se de qualquer fundamentação da Consolidação das Leis Trabalhistas, uma vez que se trata de Prestação de Serviço Terceirizado conforme preceitua a Lei 13.429/17 (Lei da Terceirização).'
    },
    {
      type: 'paragraph',
      text: '10.15. Relacionamento entre as partes: Aplicam-se ao relacionamento entre Contratada e Contratante, além das normas dispostas pelo código civil, também o código de defesa do consumidor, no que couber a Lei das terceirizações nº 13429/2017, as normas éticas do respectivo conselho profissional.'
    },
    {
      type: 'paragraph',
      text: '10.16. Rescisão: A rescisão do presente Contrato, não extingue os direitos e obrigações que as Partes tenham entre si e para com terceiros.'
    },
    {
      type: 'paragraph',
      text: '10.17. Infração: Eventual infração a qualquer das cláusulas aqui estabelecidas ensejará a Parte inocente a promover as medidas judiciais cabíveis.'
    },

    // CLÁUSULA 11 - DO FORO
    {
      type: 'heading',
      text: '11. DO FORO'
    },
    {
      type: 'paragraph',
      text: 'As Partes elegem irrevogavelmente o Foro da Cidade de Goiânia, Estado de Goiás, para dirimir quaisquer dúvidas oriundas do presente Contrato, com renúncia a qualquer outro, por mais privilegiado que seja.'
    },
    {
      type: 'paragraph',
      text: 'E, POR ESTAREM ASSIM JUSTAS E CONTRATADAS, as Partes assinam o presente Contrato em via única, em formato digital, por meio dos seus representantes legais devidamente autorizados, juntamente com 2 (duas) testemunhas.'
    },
    {
      type: 'paragraph',
      text: 'O Contrato passa a ter validade a partir da assinatura por ambos.'
    },
    {
      type: 'paragraph',
      text: `Número do contrato: ${contractNumber}`
    },
    {
      type: 'paragraph',
      text: `Goiânia-GO, ${this.getCurrentDate()}`
    },

    // Espaçamento para assinaturas
    {
      type: 'spacing',
      text: ''
    },
    {
      type: 'spacing',
      text: ''
    },
    {
      type: 'spacing',
      text: ''
    },

    // Assinatura TOP
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
      text: 'Fundadora Administradora'
    },
    {
      type: 'signature',
      text: 'Francisca Mariana Ferreira de Sousa TOP Lopes'
    },

    {
      type: 'spacing',
      text: ''
    },
    {
      type: 'spacing',
      text: ''
    },

    // Assinatura CONTRATANTE
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
      text: 'Sócio(a) Administrador(a)'
    },
    {
      type: 'signature',
      text: clientRepresentative
    },

    {
      type: 'spacing',
      text: ''
    },
    {
      type: 'spacing',
      text: ''
    },

    // Testemunhas
    {
      type: 'heading',
      text: 'Testemunhas:'
    },
    {
      type: 'spacing',
      text: ''
    },
    {
      type: 'signature',
      text: 'Testemunha 1: ________________________    Testemunha 2: ________________________'
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

  private getClientAddress(client: any): string {
    if (!client) return '[ENDEREÇO DO CLIENTE]';

    const street = client.street || '';
    const number = client.number || '';
    const complement = client.complement ? `, ${client.complement}` : '';
    const neighborhood = client.neighborhood || '';
    const city = client.city || '';
    const state = client.state || '';
    const zipcode = client.zipcode || '';

    if (!street || !number || !neighborhood || !city || !state || !zipcode) {
      return '[ENDEREÇO DO CLIENTE]';
    }

    return `${street}, ${number}${complement}, ${neighborhood}, ${city}-${state}, CEP ${zipcode}`;
  }

  private getClientEmail(client: any): string {
    if (!client) return '[EMAIL DO CLIENTE]';

    return client.email || '[EMAIL DO CLIENTE]';
  }

  private getClientRepresentative(client: any): string {
    if (!client) return '[REPRESENTANTE DO CLIENTE]';

    // Para PJ (Pessoa Jurídica)
    if (client.clients_pj && client.clients_pj.length > 0) {
      return client.clients_pj[0].legal_representative || '[REPRESENTANTE DO CLIENTE]';
    }

    return '[REPRESENTANTE DO CLIENTE]';
  }

  private formatServicesWithDescriptions(contractServices: any[]): string {
    if (!contractServices || contractServices.length === 0) {
      return '[SERVIÇOS]';
    }

    // Filtrar serviços internos e formatar com nome e descrição
    const formattedServices = contractServices
      .filter(cs => {
        // Filtrar serviços do tipo "Interno" ou com categoria "Interno"
        const service = cs.service;
        if (!service) return false;

        // Verificar se o serviço não é interno
        const isInternal = service.category?.toLowerCase() === 'interno' ||
                          service.name?.toLowerCase().includes('interno');
        return !isInternal;
      })
      .map(cs => {
        const service = cs.service;
        if (!service) return '';

        // Formatar: Nome do Serviço - Descrição (sem tags HTML)
        let formatted = service.name || 'Serviço';
        if (service.description) {
          const cleanDescription = this.stripHtmlTags(service.description);
          formatted += `: ${cleanDescription}`;
        }
        return formatted;
      })
      .filter(s => s); // Remover strings vazias

    return formattedServices.length > 0 ? formattedServices.join('; ') : '[SERVIÇOS]';
  }

  private stripHtmlTags(html: string): string {
    if (!html) return '';

    // Remove todas as tags HTML
    let text = html.replace(/<[^>]*>/g, '');

    // Decodifica entidades HTML comuns
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—');

    // Remove espaços múltiplos e trim
    return text.replace(/\s+/g, ' ').trim();
  }

  private formatServicesDetailed(contractServices: any[]): any[] {
    if (!contractServices || contractServices.length === 0) {
      return [{ type: 'paragraph', text: '[SERVIÇOS]' }];
    }

    // Filtrar serviços internos
    const validServices = contractServices.filter(cs => {
      const service = cs.service;
      if (!service) return false;

      const isInternal = service.category?.toLowerCase() === 'interno' ||
                        service.name?.toLowerCase().includes('interno');
      return !isInternal;
    });

    if (validServices.length === 0) {
      return [{ type: 'paragraph', text: '[SERVIÇOS]' }];
    }

    // Criar parágrafos para cada serviço
    const servicesParagraphs: any[] = [];

    validServices.forEach((cs, index) => {
      const service = cs.service;
      if (!service) return;

      const serviceName = service.name || 'Serviço';
      const serviceDescription = service.description || '';

      // Adicionar nome do serviço em negrito
      servicesParagraphs.push({
        type: 'paragraph',
        parts: [
          { text: `• `, bold: false },
          { text: serviceName, bold: true }
        ]
      });

      // Se tiver descrição, adicionar como texto simples
      if (serviceDescription) {
        const cleanDescription = this.stripHtmlTags(serviceDescription);

        if (cleanDescription) {
          servicesParagraphs.push({
            type: 'paragraph',
            text: `  ${cleanDescription}`
          });
        }
      }
    });

    return servicesParagraphs;
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