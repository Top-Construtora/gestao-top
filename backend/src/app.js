const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const companyRoutes = require('./routes/companyRoutes');
const clientRoutes = require('./routes/clientRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const serviceStageRoutes = require('./routes/serviceStageRoutes');
const contractServiceStageRoutes = require('./routes/contractServiceStageRoutes');
const contractRoutes = require('./routes/contractRoutes');
const installmentRoutes = require('./routes/installmentRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const publicProposalRoutes = require('./routes/publicProposalRoutes');
const attachmentRoutes = require('./routes/attachmentRoutes');
const clientAttachmentRoutes = require('./routes/clientAttachmentRoutes');
const clientLogoRoutes = require('./routes/clientLogoRoutes');
const userProfilePictureRoutes = require('./routes/userProfilePictureRoutes');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/authMiddleware');
const activityTracker = require('./middleware/activityTracker');
const rateLimiters = require('./config/rateLimiter');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const clientEmailRoutes = require('./routes/clientEmailRoutes');
const clientPhoneRoutes = require('./routes/clientPhoneRoutes');
const routineRoutes = require('./routes/routineRoutes');
const habitoRoutes = require('./routes/habitoRoutes');
const planejamentoEstrategicoRoutes = require('./routes/planejamentoEstrategicoRoutes');
const http = require('http');
const websocket = require('./config/websocket');
const ProposalModel = require('./models/Proposal');
const NotificationJobs = require('./jobs/notificationJobs');

const app = express();

// Trust proxy - importante para Render
app.set('trust proxy', 1);

// CORS configurado para produção
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:4200',
      'http://localhost:4201',
      'http://localhost:4000',
      process.env.FRONTEND_URL,
      // Adicionar domínios comuns para frontend em produção
      'https://your-frontend-domain.com',
      'https://gestao-contratos.vercel.app',
      'https://gestao-contratos-naue.netlify.app',
    ].filter(Boolean);

    // Permitir requests sem origin (Postman, mobile apps, etc)
    if (!origin) return callback(null, true);

    // Em desenvolvimento, permitir qualquer localhost
    if (process.env.NODE_ENV !== 'production' && origin && origin.includes('localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS bloqueou origem: ${origin}`);
      console.log('Origens permitidas:', allowedOrigins);
      console.log('FRONTEND_URL env:', process.env.FRONTEND_URL);
      // Em produção, temporariamente permitir todas as origens para debug
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ CORS temporariamente liberado em produção para debug');
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // Cache de preflight por 24 horas
};

app.use(cors(corsOptions));

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:*"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Body parsing - DEVE VIR ANTES do rate limiting
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos da pasta uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rate limiting global - DEPOIS do body parsing
app.use('/api/', rateLimiters.general);
app.use('/api/', rateLimiters.apiSlowDown);

// Rotas com rate limiting específico
app.use('/api/auth/login', rateLimiters.auth);
app.use('/api/auth/forgot-password', rateLimiters.passwordReset);
app.use('/api/users', rateLimiters.create);

// Rotas públicas (sem tracking)
app.use('/api/auth', authRoutes);
app.use('/api/public/proposals', publicProposalRoutes);
app.use('/api/users', userRoutes); // User routes públicas ANTES do middleware de auth
app.use('/api/planejamento-estrategico', planejamentoEstrategicoRoutes); // Rotas de planejamento estratégico (contém rotas públicas e privadas)

// Rotas protegidas com middleware de tracking
// app.use('/api/users', authMiddleware, activityTracker, userRoutes); // Removido pois já incluído acima
app.use('/api/users', userProfilePictureRoutes); // Profile picture routes (auth já incluído nas rotas)
app.use('/api/companies', authMiddleware, activityTracker, companyRoutes);
app.use('/api/clients', authMiddleware, activityTracker, clientRoutes);
app.use('/api/services', authMiddleware, activityTracker, serviceRoutes);
app.use('/api', authMiddleware, activityTracker, serviceStageRoutes);
app.use('/api', authMiddleware, activityTracker, contractServiceStageRoutes);
app.use('/api/contracts', authMiddleware, activityTracker, contractRoutes);
app.use('/api', authMiddleware, activityTracker, installmentRoutes);
app.use('/api/proposals', authMiddleware, activityTracker, proposalRoutes);
app.use('/api/attachments', authMiddleware, activityTracker, attachmentRoutes);
app.use('/api/client-attachments', authMiddleware, activityTracker, clientAttachmentRoutes);
app.use('/api', clientLogoRoutes); // Logo routes com auth interno
app.use('/api/reports', authMiddleware, activityTracker, reportRoutes);
app.use('/api/notifications', authMiddleware, activityTracker, notificationRoutes);
app.use('/api/analytics', authMiddleware, activityTracker, analyticsRoutes);
app.use('/api', authMiddleware, activityTracker, clientEmailRoutes);
app.use('/api', authMiddleware, activityTracker, clientPhoneRoutes);
app.use('/api/routines', authMiddleware, activityTracker, routineRoutes);
app.use('/api/habitos', authMiddleware, activityTracker, habitoRoutes);
app.use('/api', authMiddleware, activityTracker, require('./routes/paymentMethodRoutes'));


// Health check - importante para Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'API de Gestão de Contratos',
    version: '1.0.0',
    docs: '/api-docs', // Se tiver documentação
    health: '/health'
  });
});

// Rota 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Criar servidor HTTP para WebSocket
const server = http.createServer(app);

// Inicializar WebSocket
websocket.init(server);

// Função para inicializar jobs e outras tarefas
async function initializeApp() {
  // Verificar conexão com banco antes de executar operações
  const { testConnection } = require('./config/database');
  const isConnected = await testConnection();

  if (!isConnected) {
    console.warn('⚠️ Banco de dados não conectado. Operações de inicialização foram puladas.');
    console.warn('📋 Verifique sua conexão com internet e credenciais do Supabase.');
    return;
  }


  // Corrigir propostas sem unique_link na inicialização
  try {
    const count = await ProposalModel.updateProposalsWithoutLinks();
    if (count > 0) {
    }
  } catch (error) {
    console.error('⚠️ Erro ao corrigir propostas na inicialização:', error.message);
  }

  // Configurar jobs de notificação
  try {

    // Não executar jobs na inicialização para evitar spam durante desenvolvimento
    // await NotificationJobs.runAll();

    // Executar diariamente às 9:00 AM
    const runDailyJobs = async () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Executar às 9:00 AM (somente quando os minutos estão entre 0-2 para evitar múltiplas execuções)
      if (hour === 9 && minute >= 0 && minute <= 2) {
        // Verificar conexão antes de executar jobs
        const isConnected = await testConnection();
        if (isConnected) {
          console.log('🕘 Executando jobs diários de notificação...');
          await NotificationJobs.runAll();
        } else {
          console.warn('⚠️ Jobs de notificação pulados - banco desconectado');
        }
      }
    };

    // Verificar a cada 5 minutos se é hora de executar os jobs (reduzindo frequência)
    setInterval(runDailyJobs, 5 * 60 * 1000); // 5 minutos

  } catch (error) {
    console.error('⚠️ Erro ao configurar jobs de notificação:', error.message);
  }
}

// Exportar servidor e função de inicialização
app.server = server;
app.initializeApp = initializeApp;

module.exports = app;