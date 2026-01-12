# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## Visão Geral do Projeto

Este é o **CRM TOP Construtora**, um sistema de gerenciamento de relacionamento com clientes composto por:
- **Frontend**: Aplicação Angular 20 (`frontend/`)
- **Backend**: API Node.js/Express com Supabase (`backend/`)

## Identidade Visual

### Cores do Sistema
- **Primary (Azul Esverdeado)**: `#1e6076`
- **Secondary (Verde Água)**: `#12b0a0`
- **Accent (Dourado)**: `#baa673`

Estas cores estão definidas em `/frontend/src/styles/variables.css` com as variáveis CSS:
- `--top-primary`, `--top-dark-blue`
- `--top-secondary`
- `--top-accent`

## Comandos de Desenvolvimento

### Frontend (Angular)
```bash
# Navegar para o diretório frontend
cd frontend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento (http://localhost:4200)
npm start
# ou
ng serve

# Build para produção
npm run build
# ou
npm run build:production

# Build para desenvolvimento
npm run build:development

# Executar testes unitários
npm test
# ou
ng test

# Gerar novos componentes/serviços
ng generate component component-name
ng generate service service-name
ng generate guard guard-name
```

### Backend (Node.js/Express)
```bash
# Navegar para o diretório backend
cd backend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento com hot reload (http://localhost:3000)
npm run dev

# Iniciar servidor de produção
npm start

# Executar testes
npm test

# Executar testes com watch
npm run test:watch

# Executar testes com coverage
npm run test:coverage

# Executar linter
npm run lint

# Gerar JWT secret
npm run generate-jwt
```

## Arquitetura

### Estrutura do Frontend
- **Angular 20** com componentes standalone
- **frontend/** - Diretório principal do frontend
  - **pages/** - Componentes de rotas (home, login, public-proposal-view)
  - **components/** - Componentes reutilizáveis da UI
  - **services/** - Serviços Angular para chamadas de API e lógica de negócio
  - **guards/** - Guards de rotas para autenticação/autorização
  - **interceptors/** - Interceptors HTTP
  - **directives/** - Diretivas Angular personalizadas
  - **types/** - Definições de tipos TypeScript
- **src/environments/** - Configurações de ambiente
  - `environment.ts` - Config de desenvolvimento (apiUrl: http://localhost:3000/api)
  - `environment.prod.ts` - Config de produção
- **Estilização**: CSS com layout responsivo (`responsive-layout.css`)
- **Bibliotecas Principais**: Chart.js, docx, jspdf, file-saver, ngx-toastr

### Estrutura do Backend
- **Express 5** API com arquitetura modular
- **backend/** - Diretório principal do backend
  - **app.js** - Configuração da aplicação Express
  - **config/** - Arquivos de configuração (database.js para Supabase)
  - **controllers/** - Handlers de requisições
  - **routes/** - Definições de rotas da API
  - **middleware/** - Middlewares Express
  - **models/** - Modelos de dados
  - **services/** - Lógica de negócio
  - **utils/** - Funções utilitárias
  - **reportGenerators/** - Lógica de geração de relatórios
  - **jobs/** - Jobs em background
- **Database**: Supabase (PostgreSQL)
- **Autenticação**: Baseada em JWT
- **Bibliotecas Principais**: @supabase/supabase-js, bcryptjs, helmet, joi, jsonwebtoken, nodemailer, pdfkit, exceljs

### Rotas da API
Os principais endpoints da API são organizados por recurso:
- `/api/auth` - Endpoints de autenticação
- `/api/analytics` - Dados de analytics
- `/api/attachments` - Anexos de arquivos
- `/api/clients` - Gestão de clientes
- `/api/contracts` - Gestão de contratos
- `/api/installments` - Parcelas de pagamento
- `/api/companies` - Gestão de empresas
- `/api/proposals` - Gestão de propostas
- `/api/routines` - Gestão de rotinas
- `/api/services` - Gestão de serviços
- `/api/planejamento-estrategico` - Planejamento estratégico

## Variáveis de Ambiente

O backend requer as seguintes variáveis de ambiente:
- `SUPABASE_URL` - URL do projeto Supabase
- `SUPABASE_SERVICE_KEY` - Chave de serviço do Supabase
- `PORT` - Porta do servidor (padrão: 3000)
- `NODE_ENV` - Ambiente (development/production)
- JWT e outras variáveis relacionadas à autenticação

## Notas Importantes de Desenvolvimento

1. **Comunicação API**: O frontend usa serviços Angular para se comunicar com a API backend em `http://localhost:3000/api` (desenvolvimento)

2. **Fluxo de Autenticação**: Autenticação baseada em JWT com tokens armazenados no lado do cliente

3. **Database**: Todas as operações de banco de dados passam pelo cliente Supabase configurado em `src/config/database.js`

4. **Testes**:
   - Frontend: Karma/Jasmine para testes unitários
   - Backend: Jest para testes unitários com suporte a coverage

5. **Processo de Build**:
   - Frontend compila para o diretório `dist/`
   - Backend usa Node.js padrão (sem etapa de build necessária)

6. **Recursos do Servidor de Desenvolvimento**:
   - Frontend: Auto-reload ao mudar arquivos
   - Backend: Nodemon para auto-restart ao mudar (monitora src/ e server.js)

## Módulos do Sistema

### Gestão de Clientes (PF/PJ)
O sistema suporta dois tipos de clientes:
- **Pessoa Física (PF)**: CPF, nome completo
- **Pessoa Jurídica (PJ)**: CNPJ, razão social, nome fantasia, segmento, número de funcionários

Ambos os tipos compartilham: email, telefone, endereço, logo, anexos.

### Sistema de Propostas → Contratos
1. **Proposta** é criada com serviços e termos
2. Cliente visualiza via link público único
3. Após aprovação, proposta é convertida em **Contrato**
4. Contrato inclui: serviços, parcelas, responsáveis, datas

### Serviços e Etapas
Cada serviço pode ter múltiplas etapas (stages):
- Status por etapa: pendente, agendado, em progresso, concluído, cancelado
- Comentários e anexos por etapa
- Rotinas associadas aos serviços

### Planejamento Estratégico
Módulo completo para gestão estratégica:
- Matriz SWOT (análise de forças, fraquezas, oportunidades, ameaças)
- OKRs (Objetivos e Resultados-Chave)
- Classificação de Riscos
- Árvore de Problemas
- Análise de Cenários

## Esquema de Database (Simplificado)

**Tabelas Principais:**

```sql
-- Usuários & Autenticação
users (id, email, password, name, role_id → roles, is_active, cargo, show_in_team)
roles (id, name, description)
permissions (id, name, description)
role_permissions (role_id → roles, permission_id → permissions)

-- Clientes (Padrão de Herança)
clients (id, email, phone, street, city, state, zipcode, logo_url, created_by → users)
  ├─ clients_pf (client_id → clients, cpf, full_name)  -- Pessoa Física
  └─ clients_pj (client_id → clients, cnpj, company_name, trade_name, employee_count, business_segment)  -- Pessoa Jurídica
client_emails (id, client_id → clients, email, is_primary)
client_phones (id, client_id → clients, phone, is_primary)
client_attachments (id, client_id → clients, file_path, uploaded_by → users)

-- Fluxo Propostas → Contratos
proposals (id, proposal_number, client_id → clients, type, status, total_value, unique_link,
  converted_to_contract_id → contracts, payment_type, installments, discount_applied)
  -- status: 'draft', 'sent', 'signed', 'rejected', 'expired', 'converted', 'contraproposta'
  -- type: 'Full', 'Pontual', 'Individual', 'Recrutamento & Seleção'
proposal_services (id, proposal_id → proposals, service_id → services, unit_value, total_value, selected_by_client)
proposal_terms (id, proposal_id → proposals, term_number, term_title, term_description)

contracts (id, contract_number, client_id → clients, type, status, start_date, end_date, total_value,
  payment_method, payment_status, installment_count, barter_type, barter_value)
  -- status: 'active', 'completed', 'cancelled', 'suspended'
contract_services (id, contract_id → contracts, service_id → services, status, unit_value, total_value, is_addendum)
  -- status: 'not_started', 'scheduled', 'in_progress', 'completed', 'cancelled'
contract_installments (id, contract_id → contracts, installment_number, due_date, amount, payment_status)
contract_payment_methods (id, contract_id → contracts, payment_method, value_type, percentage, fixed_value)
contract_assignments (id, contract_id → contracts, user_id → users, assigned_by → users, role)

-- Serviços & Etapas
services (id, name, category, description, is_active, duration_amount, duration_unit)
service_stages (id, service_id → services, name, description, sort_order, status, category, is_not_applicable)
  -- status: 'pending', 'completed'
contract_service_stages (id, contract_service_id → contract_services, service_stage_id → service_stages,
  status, is_not_applicable, completed_by → users)
service_routines (id, contract_service_id → contract_services, status, scheduled_date, notes)

-- Comentários & Anexos
contract_service_comments (id, contract_service_id → contract_services, user_id → users, comment, has_attachments)
service_comment_attachments (id, comment_id → contract_service_comments, file_path, uploaded_by → users)
routine_comments (id, routine_id → service_routines, user_id → users, comment, service_stage_id → service_stages)
routine_comment_attachments (id, comment_id → routine_comments, file_path, uploaded_by → users)

-- Logs & Notificações
contract_access_logs (id, contract_id → contracts, user_id → users, action, ip_address)
proposal_access_logs (id, proposal_id → proposals, action, ip_address)
notifications (id, user_id → users, type, title, message, link, is_read, priority, metadata)
```

## Guia de Estilo

1. **SEMPRE** prefira editar arquivos existentes no codebase. **NUNCA** crie novos arquivos a menos que seja absolutamente necessário.

2. **Não use emojis** a menos que o usuário solicite explicitamente.

3. Ao referenciar funções ou trechos de código específicos, inclua o padrão `file_path:line_number` para permitir que o usuário navegue facilmente até o local do código.

   Exemplo: "Os clientes são marcados como falhos na função `connectToServer` em src/services/process.ts:712."

4. **Segurança**: Tenha cuidado para não introduzir vulnerabilidades de segurança como injeção de comando, XSS, injeção SQL e outros problemas do OWASP top 10.

5. **Evite over-engineering**: Faça apenas as mudanças que são diretamente solicitadas ou claramente necessárias. Mantenha as soluções simples e focadas.

6. **Não adicione recursos extras**, refatoração de código ou "melhorias" além do que foi solicitado. Uma correção de bug não precisa de limpeza de código ao redor.

7. **Evite hacks de retrocompatibilidade** como renomear `_vars` não utilizadas, re-exportar tipos, adicionar comentários `// removed` para código removido, etc. Se algo não está sendo usado, delete completamente.

## Perfis de Usuário e Permissões

O sistema possui os seguintes perfis:

1. **Admin**: Acesso total ao sistema
2. **Admin Gerencial**: Acesso administrativo limitado (sem acesso a relatórios completos e gestão de usuários)
3. **Usuário**: Acesso básico a rotinas e serviços

## Importante: Módulos Removidos

Este sistema foi simplificado a partir de um sistema maior. Os seguintes módulos foram **removidos** e não devem ser referenciados:

- ❌ Sistema de Mentorias (mentoria, encontros)
- ❌ Recrutamento & Seleção (vagas, candidatos, entrevistas)
- ❌ Consultor R&S (perfil de usuário removido)

Se você encontrar referências a estes módulos no código, elas devem ser consideradas legado e podem ser removidas.
