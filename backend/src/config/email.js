// Nodemailer 7.x usa ES modules, então precisamos de uma abordagem diferente
let transporter = null;

// Função para inicializar o transporter
async function initializeTransporter() {
  try {
    // Import dinâmico para Nodemailer 7
    const { createTransport } = await import('nodemailer');
    
    // Verificar se as variáveis de ambiente existem
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Credenciais de email não configuradas');
      console.warn('⚠️ Configure EMAIL_USER e EMAIL_PASS no .env para habilitar envio de emails');
      return null;
    }

    const emailConfig = {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true para 465, false para outras portas
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    transporter = createTransport(emailConfig);
    
    console.log('📧 Email configurado com sucesso');
    console.log(`📤 Enviando como: ${process.env.EMAIL_FROM}`);
    console.log(`🔐 Autenticando com: ${process.env.EMAIL_USER}`);
    
    return transporter;
  } catch (error) {
    console.error('⚠️ Erro ao configurar email:', error.message);
    console.warn('⚠️ Funcionalidade de email desabilitada');
    return null;
  }
}

// Exportar uma função que retorna o transporter
module.exports = async function getTransporter() {
  if (!transporter) {
    transporter = await initializeTransporter();
  }
  return transporter;
};