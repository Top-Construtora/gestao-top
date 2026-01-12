const getTransporter = require('../config/email');

class EmailService {
  async sendPasswordResetCode(email, name, code) {
    const transporter = await getTransporter();
    
    if (!transporter) {
      console.log('📧 Email simulado (transporter não configurado):');
      console.log(`Para: ${email}`);
      console.log(`Nome: ${name}`);
      console.log(`Código de recuperação: ${code}`);
      return;
    }

    const mailOptions = {
      from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
      to: email,
      subject: 'Código de Recuperação de Senha - TOP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0A8060; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .code-box { background-color: #fff; border: 2px solid #0A8060; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .code { font-size: 32px; font-weight: bold; color: #0A8060; letter-spacing: 8px; }
            .button { display: inline-block; padding: 12px 30px; background-color: #0A8060; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>TOP Construtora</h1>
              <p>Recuperação de Senha</p>
            </div>
            <div class="content">
              <h2>Olá ${name},</h2>
              <p>Recebemos uma solicitação para recuperar a senha da sua conta.</p>
              <p>Use o código abaixo para criar uma nova senha:</p>
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              <p><strong>Este código é válido por 15 minutos.</strong></p>
              <div class="warning">
                <p><strong>⚠️ Importante:</strong></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                  <li>Não compartilhe este código com ninguém</li>
                  <li>Nossa equipe nunca solicitará este código</li>
                  <li>Se você não solicitou a recuperação de senha, ignore este email</li>
                </ul>
              </div>
              <p style="margin-top: 30px;">Se você continuar com problemas, entre em contato com o suporte.</p>
            </div>
            <div class="footer">
              <p>Este é um email automático, por favor não responda.</p>
              <p>&copy; ${new Date().getFullYear()} TOP Construtora. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('❌ Erro ao enviar código:', error);
      throw new Error('Erro ao enviar email de recuperação');
    }
  }
   
  async sendWelcomeEmailWithCredentials(email, name, temporaryPassword) {
    const transporter = await getTransporter();
    
    if (!transporter) {
      console.log('📧 Welcome email simulated (transporter not configured):');
      console.log(`To: ${email}`);
      console.log(`Name: ${name}`);
      console.log(`Password: ${temporaryPassword}`);
      return;
    }

    const mailOptions = {
      from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
      to: email,
      subject: 'Bem-vindo à TOP Construtora!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            /* Add your email styles here */
            body { font-family: Arial, sans-serif; color: #333; }
            .container { padding: 20px; }
            .header { background-color: #0A8060; color: white; padding: 20px; text-align: center; }
            .content p { line-height: 1.6; }
            .credentials { background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 25px; background-color: #0A8060; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Bem-vindo, ${name}!</h1>
            </div>
            <div class="content">
              <p>Sua conta na plataforma de Gestão de Contratos da TOP Construtora foi criada com sucesso.</p>
              <p>Aqui estão suas credenciais de acesso temporárias:</p>
              <div class="credentials">
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Senha Temporária:</strong> ${temporaryPassword}</p>
              </div>
              <p>Por segurança, você será solicitado a criar uma nova senha em seu primeiro login.</p>
              <a href="${process.env.FRONTEND_URL}/login" 
                style="display: inline-block; padding: 12px 25px; background-color: #0A8060; text-decoration: none; border-radius: 5px; font-weight: bold; color: #ffffff !important;">
                Acessar Plataforma
              </a>
              <p style="margin-top: 30px;">Atenciosamente,<br>Equipe TOP Construtora</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      throw new Error('Error sending welcome email');
    }
  }

  /**
   * Envia email com proposta comercial
   */
  async sendEmail(options) {
    const transporter = await getTransporter();
    
    if (!transporter) {
      console.log('📧 Email simulado (transporter não configurado):');
      console.log(`Para: ${options.to}`);
      console.log(`Assunto: ${options.subject}`);
      console.log('Dados:', options.data);
      return;
    }

    // Template de proposta
    if (options.template === 'proposal') {
      const { data } = options;
      const mailOptions = {
        from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
        to: options.to,
        subject: options.subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 700px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0A8060; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
              .services-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              .services-table th, .services-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              .services-table th { background-color: #e9ecef; font-weight: bold; }
              .total-row { font-weight: bold; background-color: #e9ecef; }
              .button { display: inline-block; padding: 15px 40px; background-color: #0A8060; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 16px; }
              .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
              .info-box { background-color: #e8f5e9; border: 1px solid #4caf50; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>TOP Construtora</h1>
                <p>Proposta Comercial</p>
              </div>
              <div class="content">
                <h2>Prezado(a) ${data.companyName},</h2>
                ${data.customMessage ? `<p>${data.customMessage}</p>` : '<p>Temos o prazer de apresentar nossa proposta comercial conforme solicitado.</p>'}
                
                <h3>${data.proposalTitle}</h3>
                
                <div class="info-box">
                  <p><strong>Valor Total:</strong> ${data.totalValue}</p>
                  ${data.validUntil ? `<p><strong>Validade:</strong> ${data.validUntil}</p>` : ''}
                </div>

                <h4>Serviços Inclusos:</h4>
                <table class="services-table">
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th>Quantidade</th>
                      <th>Valor Unitário</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.services.map(service => `
                      <tr>
                        <td>${service.name}</td>
                        <td>${service.quantity}</td>
                        <td>${service.value}</td>
                        <td>${service.total}</td>
                      </tr>
                    `).join('')}
                    <tr class="total-row">
                      <td colspan="3">VALOR TOTAL</td>
                      <td>${data.totalValue}</td>
                    </tr>
                  </tbody>
                </table>

                ${data.observations ? `
                  <h4>Observações:</h4>
                  <p>${data.observations}</p>
                ` : ''}

                <div style="text-align: center;">
                  <p><strong>Para visualizar e aceitar esta proposta, clique no botão abaixo:</strong></p>
                  <a href="${data.proposalUrl}" class="button">Visualizar Proposta Completa</a>
                </div>

                <p style="margin-top: 30px;">Estamos à disposição para esclarecer quaisquer dúvidas.</p>
                <p>Atenciosamente,<br>Equipe TOP Construtora</p>
              </div>
              <div class="footer">
                <p>Este é um email automático. Para dúvidas, entre em contato conosco.</p>
                <p>&copy; ${new Date().getFullYear()} TOP Construtora. Todos os direitos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
      } catch (error) {
        console.error('❌ Erro ao enviar proposta:', error);
        throw new Error('Erro ao enviar email da proposta');
      }
    }
  }

  /**
   * ADDED: Sends an email notifying a user they've been assigned to a contract.
   */
  async sendContractAssignmentEmail(email, name, details) {
    const transporter = await getTransporter();
    if (!transporter) {
      console.log('📧 Email de atribuição simulado:', { email, name, details });
      return;
    }
    const mailOptions = {
      from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
      to: email,
      subject: `Você foi atribuído a um novo contrato: ${details.contractNumber}`,
      html: `
        <h2>Olá ${name},</h2>
        <p>Você foi atribuído ao contrato <strong>${details.contractNumber}</strong> da empresa <strong>${details.companyName}</strong> por ${details.assignedByName}.</p>
        <p>Você pode visualizar o contrato no link abaixo:</p>
        <a href="${details.contractLink}" style="padding: 10px 20px; background-color: #0A8060; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Ver Contrato</a>
        <p>Atenciosamente,<br>Equipe TOP Construtora</p>
      `
    };
    await transporter.sendMail(mailOptions);
  }

  /**
   * ADDED: Sends an email notifying a user their role on a contract has changed.
   */
  async notifyRoleChangeEmail(email, name, details) {
    const transporter = await getTransporter();
    if (!transporter) {
      console.log('📧 Email de mudança de permissão simulado:', { email, name, details });
      return;
    }
    const mailOptions = {
      from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
      to: email,
      subject: `Sua permissão no contrato ${details.contractNumber} foi alterada`,
      html: `
        <h2>Olá ${name},</h2>
        <p>Sua permissão no contrato <strong>${details.contractNumber}</strong> foi alterada para <strong>${details.newRole}</strong> por ${details.changedBy}.</p>
        <p>Atenciosamente,<br>Equipe TOP Construtora</p>
      `
    };
    await transporter.sendMail(mailOptions);
  }

  async sendAdminPasswordResetEmail(email, name, temporaryPassword) {
    const transporter = await getTransporter();
    
    if (!transporter) {
      console.log('📧 Admin password reset email simulated:');
      console.log(`To: ${email}, Name: ${name}, New Temp Password: ${temporaryPassword}`);
      return;
    }

    const mailOptions = {
      from: `"TOP Construtora" <${process.env.EMAIL_FROM || 'noreply@naue.com.br'}>`,
      to: email,
      subject: 'Sua senha na plataforma TOP foi resetada',
      html: `
        <p>Olá ${name},</p>
        <p>Sua senha na plataforma TOP Construtora foi resetada por um administrador.</p>
        <p>Sua nova senha temporária é: <strong>${temporaryPassword}</strong></p>
        <p>Por segurança, você será solicitado a criar uma nova senha em seu próximo login.</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/login">Clique aqui para fazer login</a></p>
        <br>
        <p>Atenciosamente,<br>Equipe TOP Construtora</p>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('❌ Error sending admin password reset email:', error);
      throw new Error('Error sending password reset email');
    }
  }
}

module.exports = new EmailService();