const express = require('express');
const router = express.Router();
const planejamentoController = require('../controllers/planejamentoEstrategicoController');
const authMiddleware = require('../middleware/authMiddleware');

// ===== ROTAS PÚBLICAS (sem autenticação) =====

/**
 * @route GET /api/planejamento-estrategico/publico/:token
 * @desc Obter planejamento com todos os departamentos e matriz via token público (Matriz Consciente)
 * @access Public
 */
router.get('/publico/:token', planejamentoController.obterPlanejamentoPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/departamento/:token
 * @desc Obter departamento específico via token único para preenchimento da Matriz Consciente
 * @access Public
 */
router.get('/publico/departamento/:token', planejamentoController.obterDepartamentoPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/departamento/:token/okr
 * @desc Obter OKRs de um departamento específico via token único
 * @access Public
 */
router.get('/publico/departamento/:token/okr', planejamentoController.obterOkrDepartamentoPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/departamento/:token/okr
 * @desc Salvar OKRs de um departamento via token único
 * @access Public
 */
router.put('/publico/departamento/:token/okr', planejamentoController.salvarOkrDepartamentoPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/departamento/:token/objetivos-estrategicos
 * @desc Obter lista de objetivos estratégicos do planejamento via token de departamento
 * @access Public
 */
router.get('/publico/departamento/:token/objetivos-estrategicos', planejamentoController.obterObjetivosEstrategicosPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/departamento/:token/matriz
 * @desc Atualizar matriz de evolução consciente de um departamento via token único
 * @access Public
 */
router.put('/publico/departamento/:token/matriz', planejamentoController.atualizarMatrizDepartamentoPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/grupo/:token
 * @desc Obter grupo específico via token para preenchimento da Matriz SWOT
 * @access Public
 */
router.get('/publico/grupo/:token', planejamentoController.obterGrupoPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/matriz/:departamentoId
 * @desc Atualizar matriz de evolução consciente de um departamento (via link público)
 * @access Public
 */
router.put('/publico/matriz/:departamentoId', planejamentoController.atualizarMatrizPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/matriz/:departamentoId/pdf
 * @desc Exportar matriz de evolução consciente para PDF
 * @access Public
 */
router.get('/publico/matriz/:departamentoId/pdf', planejamentoController.exportarMatrizPDF);

/**
 * @route GET /api/planejamento-estrategico/:id/matrizes/pdf
 * @desc Exportar todas as matrizes de evolução consciente de um planejamento para PDF
 * @access Public
 */
router.get('/:id/matrizes/pdf', planejamentoController.exportarTodasMatrizesPDF);

// ===== ROTAS PROTEGIDAS (requerem autenticação) =====

/**
 * @route GET /api/planejamento-estrategico
 * @desc Listar todos os planejamentos estratégicos
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/', authMiddleware, planejamentoController.listarPlanejamentos);

/**
 * @route GET /api/planejamento-estrategico/:id
 * @desc Obter detalhes de um planejamento estratégico específico
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id', authMiddleware, planejamentoController.obterPlanejamento);

/**
 * @route POST /api/planejamento-estrategico/com-departamentos
 * @desc Criar novo planejamento estratégico com departamentos
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/com-departamentos', authMiddleware, planejamentoController.criarPlanejamentoComDepartamentos);

/**
 * @route POST /api/planejamento-estrategico
 * @desc Criar novo planejamento estratégico (sem departamentos)
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/', authMiddleware, planejamentoController.criarPlanejamento);

/**
 * @route PUT /api/planejamento-estrategico/:id
 * @desc Atualizar planejamento estratégico
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/:id', authMiddleware, planejamentoController.atualizarPlanejamento);

/**
 * @route DELETE /api/planejamento-estrategico/:id
 * @desc Deletar planejamento estratégico
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/:id', authMiddleware, planejamentoController.deletarPlanejamento);

// ===== ROTAS DE DEPARTAMENTOS =====

/**
 * @route GET /api/planejamento-estrategico/:id/departamentos
 * @desc Listar todos os departamentos de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/departamentos', authMiddleware, planejamentoController.listarDepartamentos);

/**
 * @route POST /api/planejamento-estrategico/:id/departamentos
 * @desc Adicionar departamento a um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/:id/departamentos', authMiddleware, planejamentoController.adicionarDepartamento);

/**
 * @route PUT /api/planejamento-estrategico/departamentos/:departamentoId
 * @desc Atualizar dados de um departamento
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/departamentos/:departamentoId', authMiddleware, planejamentoController.atualizarDepartamento);

/**
 * @route DELETE /api/planejamento-estrategico/departamentos/:departamentoId
 * @desc Deletar um departamento
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/departamentos/:departamentoId', authMiddleware, planejamentoController.deletarDepartamento);

/**
 * @route PUT /api/planejamento-estrategico/departamentos/:departamentoId/ordem
 * @desc Atualizar ordem de exibição do departamento
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/departamentos/:departamentoId/ordem', authMiddleware, planejamentoController.atualizarOrdemDepartamento);

// ===== ROTAS DE MATRIZ DE EVOLUÇÃO =====

/**
 * @route GET /api/planejamento-estrategico/:id/matriz
 * @desc Obter todas as matrizes de evolução consciente de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/matriz', authMiddleware, planejamentoController.obterTodasMatrizes);

/**
 * @route GET /api/planejamento-estrategico/matriz/:departamentoId
 * @desc Obter matriz de evolução consciente de um departamento específico
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/matriz/:departamentoId', authMiddleware, planejamentoController.obterMatriz);

/**
 * @route PUT /api/planejamento-estrategico/matriz/:departamentoId
 * @desc Atualizar matriz de evolução consciente (acesso admin)
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/matriz/:departamentoId', authMiddleware, planejamentoController.atualizarMatriz);

// ===== ROTAS DE GRUPOS (MATRIZ SWOT) =====

/**
 * @route GET /api/planejamento-estrategico/:id/grupos
 * @desc Listar todos os grupos de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/grupos', authMiddleware, planejamentoController.listarGrupos);

/**
 * @route POST /api/planejamento-estrategico/:id/grupos
 * @desc Adicionar grupo a um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/:id/grupos', authMiddleware, planejamentoController.adicionarGrupo);

/**
 * @route PUT /api/planejamento-estrategico/grupos/:grupoId
 * @desc Atualizar dados de um grupo
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/grupos/:grupoId', authMiddleware, planejamentoController.atualizarGrupo);

/**
 * @route DELETE /api/planejamento-estrategico/grupos/:grupoId
 * @desc Deletar um grupo
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/grupos/:grupoId', authMiddleware, planejamentoController.deletarGrupo);

/**
 * @route GET /api/planejamento-estrategico/:id/swot
 * @desc Obter planejamento com todos os grupos e matrizes SWOT
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/swot', authMiddleware, planejamentoController.obterPlanejamentoComSwot);

/**
 * @route PUT /api/planejamento-estrategico/publico/matriz-swot/:grupoId
 * @desc Atualizar matriz SWOT de um grupo (via link público)
 * @access Public
 */
router.put('/publico/matriz-swot/:grupoId', planejamentoController.atualizarMatrizSwotPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/matriz-swot/:grupoId/pdf
 * @desc Exportar matriz SWOT para PDF
 * @access Public
 */
router.get('/publico/matriz-swot/:grupoId/pdf', planejamentoController.exportarMatrizSwotPDF);

/**
 * @route GET /api/planejamento-estrategico/publico/arvores/:token
 * @desc Obter árvores de problemas via token público (para visualização pública)
 * @access Public
 */
router.get('/publico/arvores/:token', planejamentoController.obterArvoresPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/arvores/:token/itens
 * @desc Salvar itens das árvores via token público
 * @access Public
 */
router.put('/publico/arvores/:token/itens', planejamentoController.salvarItensArvorePublico);

/**
 * @route GET /api/planejamento-estrategico/publico/swot-consolidado/:token
 * @desc Obter matriz SWOT consolidada via token público
 * @access Public
 */
router.get('/publico/swot-consolidado/:token', planejamentoController.obterSwotConsolidadoPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/swot-consolidado/:token
 * @desc Salvar matriz SWOT consolidada via token público
 * @access Public
 */
router.put('/publico/swot-consolidado/:token', planejamentoController.salvarSwotConsolidadoPublico);

// ===== CLASSIFICAÇÃO DE RISCOS POR GRUPO (PÚBLICO) =====

/**
 * @route GET /api/planejamento-estrategico/publico/grupo/:token/classificacao-riscos
 * @desc Obter classificação de riscos de um grupo via token
 * @access Public
 */
router.get('/publico/grupo/:token/classificacao-riscos', planejamentoController.obterClassificacaoRiscosGrupoPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/grupo/:token/classificacao-riscos
 * @desc Salvar classificação de riscos de um grupo via token
 * @access Public
 */
router.put('/publico/grupo/:token/classificacao-riscos', planejamentoController.salvarClassificacaoRiscosGrupoPublico);

// ===== CLASSIFICAÇÃO DE RISCOS CONSOLIDADA (PÚBLICO) =====

/**
 * @route GET /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token
 * @desc Obter classificação de riscos consolidada de todos os grupos via token do planejamento
 * @access Public
 */
router.get('/publico/classificacao-riscos-consolidado/:token', planejamentoController.obterClassificacaoRiscosConsolidadoPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token
 * @desc Salvar classificação de riscos consolidada via token do planejamento
 * @access Public
 */
router.put('/publico/classificacao-riscos-consolidado/:token', planejamentoController.salvarClassificacaoRiscosConsolidadoPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token/pdf
 * @desc Exportar classificação de riscos consolidada para PDF via token
 * @access Public
 */
router.get('/publico/classificacao-riscos-consolidado/:token/pdf', planejamentoController.exportarClassificacaoRiscosConsolidadoPDF);

// ===== CLASSIFICAÇÃO DE RISCOS (PÚBLICO - LEGADO) =====

/**
 * @route GET /api/planejamento-estrategico/publico/classificacao-riscos/:token
 * @desc Obter classificação de riscos via token público (versão consolidada)
 * @access Public
 */
router.get('/publico/classificacao-riscos/:token', planejamentoController.obterClassificacaoRiscosPublico);

/**
 * @route PUT /api/planejamento-estrategico/publico/classificacao-riscos/:token
 * @desc Salvar classificação de riscos via token público (versão consolidada)
 * @access Public
 */
router.put('/publico/classificacao-riscos/:token', planejamentoController.salvarClassificacaoRiscosPublico);

/**
 * @route GET /api/planejamento-estrategico/publico/classificacao-riscos/:token/pdf
 * @desc Exportar classificação de riscos para PDF
 * @access Public
 */
router.get('/publico/classificacao-riscos/:token/pdf', planejamentoController.exportarClassificacaoRiscosPDF);

// ===== MATRIZ SWOT FINAL (CONSOLIDADA) =====

/**
 * @route GET /api/planejamento-estrategico/:id/swot-final
 * @desc Obter matriz SWOT final consolidada
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/swot-final', authMiddleware, planejamentoController.obterMatrizSwotFinal);

/**
 * @route PUT /api/planejamento-estrategico/:id/swot-final
 * @desc Criar ou atualizar matriz SWOT final consolidada
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/:id/swot-final', authMiddleware, planejamentoController.salvarMatrizSwotFinal);

/**
 * @route GET /api/planejamento-estrategico/:id/swot-final/pdf
 * @desc Exportar matriz SWOT consolidada para PDF
 * @access Public
 */
router.get('/:id/swot-final/pdf', planejamentoController.exportarMatrizConsolidadaPDF);

// ===== CLASSIFICAÇÃO DE RISCOS (PROTEGIDO) =====

/**
 * @route GET /api/planejamento-estrategico/:id/classificacao-riscos
 * @desc Obter classificação de riscos de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/classificacao-riscos', authMiddleware, planejamentoController.obterClassificacaoRiscos);

/**
 * @route PUT /api/planejamento-estrategico/:id/classificacao-riscos
 * @desc Salvar classificação de riscos
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/:id/classificacao-riscos', authMiddleware, planejamentoController.salvarClassificacaoRiscos);

// ===== MATRIZ DE CRUZAMENTO SWOT =====

/**
 * @route GET /api/planejamento-estrategico/:id/swot-cruzamento
 * @desc Obter matriz de cruzamento SWOT (FO, FA, DO, DA)
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/swot-cruzamento', authMiddleware, planejamentoController.obterMatrizCruzamento);

/**
 * @route PUT /api/planejamento-estrategico/:id/swot-cruzamento
 * @desc Criar ou atualizar matriz de cruzamento SWOT
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/:id/swot-cruzamento', authMiddleware, planejamentoController.salvarMatrizCruzamento);

/**
 * @route GET /api/planejamento-estrategico/:id/swot-cruzamento/pdf
 * @desc Exportar Definição de Impacto para PDF
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/swot-cruzamento/pdf', planejamentoController.exportarDefinicaoImpactoPDF);

/**
 * @route GET /api/planejamento-estrategico/:id/swot-cruzamento/excel
 * @desc Exportar Definição de Impacto para Excel
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/swot-cruzamento/excel', planejamentoController.exportarDefinicaoImpactoExcel);

/**
 * @route GET /api/planejamento-estrategico/:id/analise-cenarios/pdf
 * @desc Exportar Análise de Cenários para PDF (gráficos e tabelas)
 * @access Public
 */
router.get('/:id/analise-cenarios/pdf', planejamentoController.exportarAnaliseCenariosPDF);

/**
 * @route GET /api/planejamento-estrategico/:id/analise-oportunidades/pdf
 * @desc Exportar Análise de Oportunidades para PDF (gráficos de pizza)
 * @access Public
 */
router.get('/:id/analise-oportunidades/pdf', planejamentoController.exportarAnaliseOportunidadesPDF);

/**
 * @route GET /api/planejamento-estrategico/:id/analise-ameacas/pdf
 * @desc Exportar Análise de Ameaças para PDF (gráficos de pizza)
 * @access Public
 */
router.get('/:id/analise-ameacas/pdf', planejamentoController.exportarAnaliseAmeacasPDF);

// ===== ROTAS DE OBJETIVOS ESTRATÉGICOS =====

/**
 * @route GET /api/planejamento-estrategico/:id/okrs
 * @desc Listar todos os objetivos estratégicos de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/okrs', authMiddleware, planejamentoController.listarOkrs);

/**
 * @route POST /api/planejamento-estrategico/:id/okrs
 * @desc Adicionar objetivo estratégico a um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/:id/okrs', authMiddleware, planejamentoController.adicionarOkr);

/**
 * @route PUT /api/planejamento-estrategico/okrs/:okrId
 * @desc Atualizar um objetivo estratégico
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/okrs/:okrId', authMiddleware, planejamentoController.atualizarOkr);

/**
 * @route DELETE /api/planejamento-estrategico/okrs/:okrId
 * @desc Deletar um objetivo estratégico
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/okrs/:okrId', authMiddleware, planejamentoController.deletarOkr);

/**
 * @route GET /api/planejamento-estrategico/:id/okrs/pdf
 * @desc Exportar objetivos estratégicos para PDF
 * @access Public
 */
router.get('/:id/okrs/pdf', planejamentoController.exportarOkrsPDF);

/**
 * @route GET /api/planejamento-estrategico/:id/okr-departamentos/pdf
 * @desc Exportar OKRs por Departamento para PDF
 * @access Public
 */
router.get('/:id/okr-departamentos/pdf', planejamentoController.exportarOkrDepartamentosPDF);

// ===== ROTAS DE ÁRVORE DE PROBLEMAS =====

// Rotas de Árvores (container)
/**
 * @route GET /api/planejamento-estrategico/:id/arvores
 * @desc Listar todas as árvores de um planejamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/arvores', authMiddleware, planejamentoController.listarArvores);

/**
 * @route POST /api/planejamento-estrategico/:id/arvores
 * @desc Criar nova árvore de problemas
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/:id/arvores', authMiddleware, planejamentoController.criarArvore);

/**
 * @route POST /api/planejamento-estrategico/:id/arvores/criar-padrao
 * @desc Criar árvores padrão (Cliente, Pessoas, Regulamentação, Financeiro) com seus tópicos
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/:id/arvores/criar-padrao', authMiddleware, planejamentoController.criarArvoresPadrao);

/**
 * @route PUT /api/planejamento-estrategico/arvores/:arvoreId
 * @desc Atualizar nome de uma árvore
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/arvores/:arvoreId', authMiddleware, planejamentoController.atualizarArvore);

/**
 * @route DELETE /api/planejamento-estrategico/arvores/:arvoreId
 * @desc Deletar uma árvore e todos seus itens
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/arvores/:arvoreId', authMiddleware, planejamentoController.deletarArvore);

// Rotas de Itens (dentro de cada árvore)
/**
 * @route GET /api/planejamento-estrategico/arvores/:arvoreId/itens
 * @desc Listar todos os itens de uma árvore
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/arvores/:arvoreId/itens', authMiddleware, planejamentoController.listarItensArvore);

/**
 * @route POST /api/planejamento-estrategico/arvores/:arvoreId/itens
 * @desc Adicionar item à árvore de problemas
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/arvores/:arvoreId/itens', authMiddleware, planejamentoController.adicionarItemArvore);

/**
 * @route PUT /api/planejamento-estrategico/arvore-problemas/:itemId
 * @desc Atualizar um item da árvore de problemas
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/arvore-problemas/:itemId', authMiddleware, planejamentoController.atualizarItemArvore);

/**
 * @route DELETE /api/planejamento-estrategico/arvore-problemas/:itemId
 * @desc Deletar um item da árvore de problemas
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/arvore-problemas/:itemId', authMiddleware, planejamentoController.deletarItemArvore);

/**
 * @route GET /api/planejamento-estrategico/:id/arvores/pdf
 * @desc Exportar todas as árvores de problemas para PDF
 * @access Public
 */
router.get('/:id/arvores/pdf', planejamentoController.exportarArvoresPDF);

// ===== ROTAS DE OKR (Objectives and Key Results) =====

// --- OBJETIVOS ---

/**
 * @route GET /api/planejamento-estrategico/departamentos/:departamentoId/okr-objetivos
 * @desc Listar todos os objetivos OKR de um departamento
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/departamentos/:departamentoId/okr-objetivos', authMiddleware, planejamentoController.listarOkrObjetivos);

/**
 * @route POST /api/planejamento-estrategico/departamentos/:departamentoId/okr-objetivos
 * @desc Criar novo objetivo OKR em um departamento
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/departamentos/:departamentoId/okr-objetivos', authMiddleware, planejamentoController.criarOkrObjetivo);

/**
 * @route PUT /api/planejamento-estrategico/okr-objetivos/:objetivoId
 * @desc Atualizar um objetivo OKR
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/okr-objetivos/:objetivoId', authMiddleware, planejamentoController.atualizarOkrObjetivo);

/**
 * @route DELETE /api/planejamento-estrategico/okr-objetivos/:objetivoId
 * @desc Deletar um objetivo OKR
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/okr-objetivos/:objetivoId', authMiddleware, planejamentoController.deletarOkrObjetivo);

// --- KEY RESULTS ---

/**
 * @route GET /api/planejamento-estrategico/okr-objetivos/:objetivoId/key-results
 * @desc Listar todos os Key Results de um objetivo
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/okr-objetivos/:objetivoId/key-results', authMiddleware, planejamentoController.listarKeyResults);

/**
 * @route POST /api/planejamento-estrategico/okr-objetivos/:objetivoId/key-results
 * @desc Criar novo Key Result em um objetivo
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/okr-objetivos/:objetivoId/key-results', authMiddleware, planejamentoController.criarKeyResult);

/**
 * @route PUT /api/planejamento-estrategico/key-results/:keyResultId
 * @desc Atualizar um Key Result
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/key-results/:keyResultId', authMiddleware, planejamentoController.atualizarKeyResult);

/**
 * @route DELETE /api/planejamento-estrategico/key-results/:keyResultId
 * @desc Deletar um Key Result
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/key-results/:keyResultId', authMiddleware, planejamentoController.deletarKeyResult);

// --- TAREFAS ---

/**
 * @route GET /api/planejamento-estrategico/key-results/:keyResultId/tarefas
 * @desc Listar todas as tarefas de um Key Result
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/key-results/:keyResultId/tarefas', authMiddleware, planejamentoController.listarTarefas);

/**
 * @route POST /api/planejamento-estrategico/key-results/:keyResultId/tarefas
 * @desc Criar nova tarefa em um Key Result
 * @access Private (Admin/Admin Gerencial)
 */
router.post('/key-results/:keyResultId/tarefas', authMiddleware, planejamentoController.criarTarefa);

/**
 * @route PUT /api/planejamento-estrategico/tarefas/:tarefaId
 * @desc Atualizar uma tarefa
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/tarefas/:tarefaId', authMiddleware, planejamentoController.atualizarTarefa);

/**
 * @route DELETE /api/planejamento-estrategico/tarefas/:tarefaId
 * @desc Deletar uma tarefa
 * @access Private (Admin/Admin Gerencial)
 */
router.delete('/tarefas/:tarefaId', authMiddleware, planejamentoController.deletarTarefa);

/**
 * @route PUT /api/planejamento-estrategico/tarefas/:tarefaId/toggle
 * @desc Alternar status de conclusão de uma tarefa
 * @access Private (Admin/Admin Gerencial)
 */
router.put('/tarefas/:tarefaId/toggle', authMiddleware, planejamentoController.toggleTarefa);

// --- ROTA COMPLETA DE OKRs POR PLANEJAMENTO ---

/**
 * @route GET /api/planejamento-estrategico/:id/okr-completo
 * @desc Obter estrutura completa de OKRs de um planejamento (departamentos > objetivos > KRs > tarefas)
 * @access Private (Admin/Admin Gerencial)
 */
router.get('/:id/okr-completo', authMiddleware, planejamentoController.obterOkrCompleto);

module.exports = router;
