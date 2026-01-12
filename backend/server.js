require('dotenv').config();
const app = require('./src/app');

// Porta padrão 3000 para desenvolvimento local
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0'; // Importante para Render

async function startServer() {
  try {
    // Usar o servidor criado no app.js
    const server = app.server;

    // Iniciar servidor
    server.listen(PORT, HOST, async () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);

      // Executar inicialização da aplicação
      if (app.initializeApp) {
        await app.initializeApp();
      }
    });

    // Timeout mais longo para Render
    server.timeout = 120000; // 2 minutos

    // Testar conexão com Supabase após servidor iniciar
    setTimeout(async () => {
      try {
        const { testConnection } = require('./src/config/database');
        const isConnected = await testConnection();
        if (isConnected) {
          console.log('✅ Banco de dados conectado com sucesso');
        } else {
          console.warn('⚠️ Banco de dados não conectado, mas servidor está rodando');
        }
      } catch (error) {
        console.error('⚠️ Erro ao testar banco:', error.message);
      }
    }, 2000); // Aguarda 2 segundos antes de testar

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} recebido, iniciando shutdown gracioso...`);

      server.close(() => {
        console.log('📊 Servidor fechado com sucesso');
      });

      // Tentar fechar conexões do banco se existirem
      try {
        const { pool } = require('./src/config/database');
        if (pool && pool.end) {
          await pool.end();
          console.log('📊 Conexões do banco fechadas');
        }
      } catch (error) {
        console.error('⚠️ Erro ao fechar banco:', error.message);
      }

      process.exit(0);
    };

    // Listeners para sinais de shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Tratamento de erros não capturados
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      // Não fechar o processo em produção, apenas logar
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      // Fechar o processo pois o estado pode estar corrompido
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Iniciar servidor
startServer().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
