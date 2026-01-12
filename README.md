# CRM TOP Construtora

Sistema de gerenciamento de relacionamento com clientes (CRM) desenvolvido para TOP Construtora.

## Visão Geral

Este é um CRM completo com funcionalidades de gestão de clientes, propostas e contratos. O sistema é composto por:

- **Frontend**: Aplicação Angular 20 com componentes standalone
- **Backend**: API Node.js/Express com Supabase (PostgreSQL)

## Identidade Visual

### Cores
- **Primary (Azul Esverdeado)**: `#1e6076`
- **Secondary (Verde Água)**: `#12b0a0`
- **Accent (Dourado)**: `#baa673`

## Módulos Principais

### 1. Gestão de Clientes
- Cadastro de clientes Pessoa Física (PF) e Pessoa Jurídica (PJ)
- Múltiplos emails e telefones por cliente
- Upload de documentos e anexos
- Logo da empresa (para PJ)

### 2. Propostas
- Criação de propostas comerciais
- Seleção de serviços com preços personalizados
- Termos e condições customizados
- Link público para visualização e assinatura do cliente
- Conversão automática em contratos

### 3. Contratos
- Contratos gerados a partir de propostas aprovadas
- Múltiplos serviços por contrato
- Gestão de parcelas e pagamentos
- Acompanhamento de status (ativo, concluído, cancelado, suspenso)
- Atribuição de responsáveis

### 4. Serviços e Etapas
- Biblioteca de serviços reutilizáveis
- Etapas configuráveis por serviço
- Acompanhamento de progresso
- Comentários e anexos por etapa

### 5. Rotinas
- Agendamento de tarefas e serviços recorrentes
- Notificações de prazos
- Status de execução

### 6. Planejamento Estratégico
- Matriz SWOT
- OKRs (Objetivos e Resultados-Chave)
- Classificação de Riscos
- Análise de Cenários

## Estrutura do Projeto

```
gestao-top/
├── frontend/              # Aplicação Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── pages/           # Páginas de rotas
│   │   │   ├── components/      # Componentes reutilizáveis
│   │   │   ├── services/        # Serviços Angular
│   │   │   ├── guards/          # Guards de autenticação
│   │   │   ├── interceptors/    # HTTP interceptors
│   │   │   └── types/           # Definições TypeScript
│   │   ├── styles/              # Estilos globais
│   │   └── environments/        # Configurações de ambiente
│   └── package.json
│
└── backend/               # API Node.js/Express
    ├── src/
    │   ├── controllers/         # Controladores de rotas
    │   ├── routes/              # Definições de rotas
    │   ├── models/              # Modelos de dados
    │   ├── services/            # Lógica de negócio
    │   ├── middleware/          # Middlewares Express
    │   ├── config/              # Configurações
    │   └── utils/               # Utilitários
    ├── database/                # Scripts de banco de dados
    ├── migrations/              # Migrações de schema
    └── package.json
```

## Instalação e Configuração

### Pré-requisitos
- Node.js >= 18.0.0
- npm >= 8.0.0
- Conta no Supabase (PostgreSQL)

### Frontend

```bash
cd gestao-top/frontend
npm install
npm start  # Inicia em http://localhost:4200
```

### Backend

```bash
cd gestao-top/backend
npm install

# Configurar variáveis de ambiente
# Criar arquivo .env com:
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
# - PORT=3000
# - NODE_ENV=development
# - JWT_SECRET

npm run dev  # Inicia com nodemon em http://localhost:3000
```

## Comandos Principais

### Frontend
```bash
npm start                    # Servidor de desenvolvimento
npm run build               # Build de produção
npm run build:development   # Build de desenvolvimento
npm test                    # Testes unitários
```

### Backend
```bash
npm start                 # Servidor de produção
npm run dev              # Servidor de desenvolvimento (hot reload)
npm test                 # Testes unitários
npm run test:coverage    # Cobertura de testes
npm run lint             # Verificar código
```

## Tecnologias Utilizadas

### Frontend
- Angular 20
- TypeScript
- Chart.js (gráficos)
- jsPDF (geração de PDFs)
- docx (geração de documentos Word)
- Toastr (notificações)

### Backend
- Express 5
- Supabase (PostgreSQL)
- JWT (autenticação)
- Bcrypt (criptografia de senhas)
- Helmet (segurança)
- Nodemailer (emails)
- PDFKit (geração de PDFs)
- ExcelJS (geração de planilhas)

## Roles e Permissões

O sistema possui os seguintes perfis de usuário:

1. **Admin**: Acesso total ao sistema
2. **Admin Gerencial**: Acesso administrativo limitado (sem acesso a relatórios completos e gestão de usuários)
3. **Usuário**: Acesso básico a rotinas e serviços

## API Endpoints

Principais endpoints da API:

- `/api/auth` - Autenticação (login, recuperação de senha)
- `/api/users` - Gestão de usuários
- `/api/clients` - Gestão de clientes
- `/api/proposals` - Gestão de propostas
- `/api/contracts` - Gestão de contratos
- `/api/services` - Gestão de serviços
- `/api/routines` - Gestão de rotinas
- `/api/analytics` - Análises e métricas
- `/api/planejamento-estrategico` - Planejamento estratégico

## Segurança

- Autenticação via JWT
- Senhas criptografadas com Bcrypt
- Rate limiting em endpoints sensíveis
- Helmet para headers de segurança
- CORS configurado
- Validação de entrada com Joi

## Contribuindo

Este é um projeto privado para TOP Construtora.

## Licença

Propriedade de TOP Construtora - Todos os direitos reservados.
