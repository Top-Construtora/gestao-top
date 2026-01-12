const { supabase } = require('../config/database');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Controller para gerenciar Planejamento Estratégico e Matriz de Evolução Consciente
 */
class PlanejamentoEstrategicoController {

  // ===== PLANEJAMENTOS ESTRATÉGICOS =====

  /**
   * Listar todos os planejamentos estratégicos
   * GET /api/planejamento-estrategico
   */
  async listarPlanejamentos(req, res) {
    try {
      const { client_id, status, contract_id } = req.query;

      let query = supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients!inner(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          ),
          contract:contracts!inner(
            id,
            contract_number
          ),
          criador:users!planejamentos_estrategicos_created_by_fkey(
            id,
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (client_id) query = query.eq('client_id', client_id);
      if (status) query = query.eq('status', status);
      if (contract_id) query = query.eq('contract_id', contract_id);

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao listar planejamentos estratégicos:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} planejamentos encontrados`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar planejamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar planejamentos estratégicos',
        error: error.message
      });
    }
  }

  /**
   * Obter detalhes de um planejamento com departamentos
   * GET /api/planejamento-estrategico/:id
   */
  async obterPlanejamento(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          ),
          contract:contracts(
            id,
            contract_number
          ),
          criador:users!planejamentos_estrategicos_created_by_fkey(
            id,
            name,
            email
          )
        `)
        .eq('id', id)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento estratégico não encontrado'
        });
      }

      // Buscar departamentos com suas matrizes
      const { data: departamentos, error: departamentosError } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (departamentosError) throw departamentosError;

      planejamento.departamentos = departamentos || [];

      console.log(`✅ Planejamento ${id} encontrado com ${departamentos?.length || 0} departamentos`);

      res.json({
        success: true,
        data: planejamento
      });
    } catch (error) {
      console.error('Erro ao obter planejamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter planejamento estratégico',
        error: error.message
      });
    }
  }

  /**
   * Criar novo planejamento estratégico com departamentos
   * POST /api/planejamento-estrategico/com-departamentos
   */
  async criarPlanejamentoComDepartamentos(req, res) {
    try {
      const { planejamento, departamentos } = req.body;

      const userId = req.user?.id;

      // Validações
      if (!planejamento || !planejamento.client_id || !planejamento.contract_id || !planejamento.titulo) {
        return res.status(400).json({
          success: false,
          message: 'Cliente, contrato e título são obrigatórios'
        });
      }

      if (!departamentos || departamentos.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'É necessário adicionar pelo menos um departamento'
        });
      }

      // Gerar token único
      const unique_token = crypto.randomBytes(32).toString('hex');

      // Criar planejamento
      const { data: planejamentoData, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .insert({
          client_id: planejamento.client_id,
          contract_id: planejamento.contract_id,
          titulo: planejamento.titulo,
          descricao: planejamento.descricao || null,
          data_inicio: planejamento.data_inicio || null,
          data_fim: planejamento.data_fim || null,
          prazo_preenchimento: planejamento.prazo_preenchimento || null,
          unique_token,
          status: 'ativo',
          created_by: userId
        })
        .select()
        .single();

      if (planejamentoError) {
        console.error('❌ Erro ao criar planejamento:', planejamentoError);
        throw planejamentoError;
      }

      console.log(`✅ Planejamento estratégico criado: ${planejamentoData.id}`);

      // Criar departamentos com tokens únicos
      const departamentosToInsert = departamentos.map((dep, index) => ({
        planejamento_id: planejamentoData.id,
        nome_departamento: dep.nome_departamento,
        responsavel_nome: dep.responsavel_nome || null,
        responsavel_email: dep.responsavel_email || null,
        ordem: index,
        unique_token: crypto.randomBytes(32).toString('hex')
      }));

      const { data: departamentosData, error: departamentosError } = await supabase
        .from('pe_departamentos')
        .insert(departamentosToInsert)
        .select();

      if (departamentosError) {
        console.error('❌ Erro ao criar departamentos:', departamentosError);
        // Reverter criação do planejamento em caso de erro
        await supabase
          .from('planejamentos_estrategicos')
          .delete()
          .eq('id', planejamentoData.id);
        throw departamentosError;
      }

      console.log(`✅ ${departamentosData.length} departamentos criados`);

      res.status(201).json({
        success: true,
        message: 'Planejamento estratégico criado com sucesso',
        data: {
          ...planejamentoData,
          departamentos: departamentosData
        }
      });
    } catch (error) {
      console.error('Erro ao criar planejamento com departamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar planejamento estratégico',
        error: error.message
      });
    }
  }

  /**
   * Criar novo planejamento estratégico (sem departamentos)
   * POST /api/planejamento-estrategico
   */
  async criarPlanejamento(req, res) {
    try {
      const {
        client_id,
        contract_id,
        titulo,
        descricao,
        data_inicio,
        data_fim,
        prazo_preenchimento
      } = req.body;

      const userId = req.user?.id;

      // Validações
      if (!client_id || !contract_id || !titulo) {
        return res.status(400).json({
          success: false,
          message: 'Cliente, contrato e título são obrigatórios'
        });
      }

      // Gerar token único
      const unique_token = crypto.randomBytes(32).toString('hex');

      const { data, error } = await supabase
        .from('planejamentos_estrategicos')
        .insert({
          client_id,
          contract_id,
          titulo,
          descricao: descricao || null,
          data_inicio: data_inicio || null,
          data_fim: data_fim || null,
          prazo_preenchimento: prazo_preenchimento || null,
          unique_token,
          status: 'ativo',
          created_by: userId
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao criar planejamento:', error);
        throw error;
      }

      console.log(`✅ Planejamento estratégico criado: ${data.id}`);

      res.status(201).json({
        success: true,
        message: 'Planejamento estratégico criado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao criar planejamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar planejamento estratégico',
        error: error.message
      });
    }
  }

  /**
   * Atualizar planejamento estratégico
   * PUT /api/planejamento-estrategico/:id
   */
  async atualizarPlanejamento(req, res) {
    try {
      const { id } = req.params;
      const {
        titulo,
        descricao,
        status,
        data_inicio,
        data_fim,
        prazo_preenchimento
      } = req.body;

      const updateData = {};
      if (titulo !== undefined) updateData.titulo = titulo;
      if (descricao !== undefined) updateData.descricao = descricao;
      if (status !== undefined) updateData.status = status;
      if (data_inicio !== undefined) updateData.data_inicio = data_inicio;
      if (data_fim !== undefined) updateData.data_fim = data_fim;
      if (prazo_preenchimento !== undefined) updateData.prazo_preenchimento = prazo_preenchimento;

      const { data, error } = await supabase
        .from('planejamentos_estrategicos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      console.log(`✅ Planejamento ${id} atualizado`);

      res.json({
        success: true,
        message: 'Planejamento atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar planejamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar planejamento',
        error: error.message
      });
    }
  }

  /**
   * Deletar planejamento estratégico
   * DELETE /api/planejamento-estrategico/:id
   */
  async deletarPlanejamento(req, res) {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from('planejamentos_estrategicos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log(`✅ Planejamento ${id} deletado (cascade para departamentos e matrizes)`);

      res.json({
        success: true,
        message: 'Planejamento deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar planejamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar planejamento',
        error: error.message
      });
    }
  }

  // ===== DEPARTAMENTOS =====

  /**
   * Listar departamentos de um planejamento
   * GET /api/planejamento-estrategico/:id/departamentos
   */
  async listarDepartamentos(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      console.log(`✅ ${data?.length || 0} departamentos encontrados`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar departamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar departamentos',
        error: error.message
      });
    }
  }

  /**
   * Adicionar departamento a um planejamento
   * POST /api/planejamento-estrategico/:id/departamentos
   */
  async adicionarDepartamento(req, res) {
    try {
      const { id } = req.params;
      const { nome_departamento, responsavel_nome, responsavel_email, ordem } = req.body;

      if (!nome_departamento) {
        return res.status(400).json({
          success: false,
          message: 'Nome do departamento é obrigatório'
        });
      }

      // Se ordem não foi fornecida, buscar a última ordem + 1
      let ordemFinal = ordem;
      if (ordemFinal === undefined) {
        const { data: ultimoDep } = await supabase
          .from('pe_departamentos')
          .select('ordem')
          .eq('planejamento_id', id)
          .order('ordem', { ascending: false })
          .limit(1)
          .single();

        ordemFinal = ultimoDep ? ultimoDep.ordem + 1 : 0;
      }

      // Gerar token único para o departamento
      const unique_token = crypto.randomBytes(32).toString('hex');

      const { data, error } = await supabase
        .from('pe_departamentos')
        .insert({
          planejamento_id: id,
          nome_departamento,
          responsavel_nome: responsavel_nome || null,
          responsavel_email: responsavel_email || null,
          ordem: ordemFinal,
          unique_token
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Departamento adicionado ao planejamento ${id} com token ${unique_token}`);

      res.status(201).json({
        success: true,
        message: 'Departamento adicionado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao adicionar departamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar departamento',
        error: error.message
      });
    }
  }

  /**
   * Atualizar departamento
   * PUT /api/planejamento-estrategico/departamentos/:departamentoId
   */
  async atualizarDepartamento(req, res) {
    try {
      const { departamentoId } = req.params;
      const { nome_departamento, responsavel_nome, responsavel_email } = req.body;

      const updateData = {};
      if (nome_departamento !== undefined) updateData.nome_departamento = nome_departamento;
      if (responsavel_nome !== undefined) updateData.responsavel_nome = responsavel_nome;
      if (responsavel_email !== undefined) updateData.responsavel_email = responsavel_email;

      const { data, error } = await supabase
        .from('pe_departamentos')
        .update(updateData)
        .eq('id', departamentoId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      console.log(`✅ Departamento ${departamentoId} atualizado`);

      res.json({
        success: true,
        message: 'Departamento atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar departamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar departamento',
        error: error.message
      });
    }
  }

  /**
   * Deletar departamento
   * DELETE /api/planejamento-estrategico/departamentos/:departamentoId
   */
  async deletarDepartamento(req, res) {
    try {
      const { departamentoId } = req.params;

      const { error } = await supabase
        .from('pe_departamentos')
        .delete()
        .eq('id', departamentoId);

      if (error) throw error;

      console.log(`✅ Departamento ${departamentoId} deletado (cascade para matriz)`);

      res.json({
        success: true,
        message: 'Departamento deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar departamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar departamento',
        error: error.message
      });
    }
  }

  /**
   * Atualizar ordem de exibição do departamento
   * PUT /api/planejamento-estrategico/departamentos/:departamentoId/ordem
   */
  async atualizarOrdemDepartamento(req, res) {
    try {
      const { departamentoId } = req.params;
      const { ordem } = req.body;

      if (ordem === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Ordem é obrigatória'
        });
      }

      const { data, error } = await supabase
        .from('pe_departamentos')
        .update({ ordem })
        .eq('id', departamentoId)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Ordem do departamento ${departamentoId} atualizada para ${ordem}`);

      res.json({
        success: true,
        message: 'Ordem atualizada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar ordem:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar ordem do departamento',
        error: error.message
      });
    }
  }

  // ===== MATRIZ DE EVOLUÇÃO CONSCIENTE =====

  /**
   * Obter todas as matrizes de um planejamento
   * GET /api/planejamento-estrategico/:id/matriz
   */
  async obterTodasMatrizes(req, res) {
    try {
      const { id } = req.params;

      const { data: departamentos, error } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      res.json({
        success: true,
        data: departamentos || []
      });
    } catch (error) {
      console.error('Erro ao obter matrizes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter matrizes',
        error: error.message
      });
    }
  }

  /**
   * Obter matriz de um departamento específico
   * GET /api/planejamento-estrategico/matriz/:departamentoId
   */
  async obterMatriz(req, res) {
    try {
      const { departamentoId } = req.params;

      const { data, error } = await supabase
        .from('pe_matriz_evolucao')
        .select('*')
        .eq('departamento_id', departamentoId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      res.json({
        success: true,
        data: data || null
      });
    } catch (error) {
      console.error('Erro ao obter matriz:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter matriz',
        error: error.message
      });
    }
  }

  /**
   * Atualizar matriz (acesso admin)
   * PUT /api/planejamento-estrategico/matriz/:departamentoId
   */
  async atualizarMatriz(req, res) {
    try {
      const { departamentoId } = req.params;
      const { vulnerabilidades, conquistas, licoes_aprendidas, compromissos } = req.body;

      // Verificar se já existe matriz para este departamento
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_evolucao')
        .select('id')
        .eq('departamento_id', departamentoId)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar matriz existente
        const result = await supabase
          .from('pe_matriz_evolucao')
          .update({
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos
          })
          .eq('departamento_id', departamentoId)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar nova matriz
        const result = await supabase
          .from('pe_matriz_evolucao')
          .insert({
            departamento_id: departamentoId,
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos,
            preenchido_em: new Date().toISOString()
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz do departamento ${departamentoId} atualizada`);

      res.json({
        success: true,
        message: 'Matriz atualizada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar matriz:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar matriz',
        error: error.message
      });
    }
  }

  // ===== ROTAS PÚBLICAS =====

  /**
   * Obter planejamento via token público (para departamentos preencherem)
   * GET /api/planejamento-estrategico/publico/:token
   */
  async obterPlanejamentoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            logo_path,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Gerar URL pública da logo do cliente
      if (planejamento.client?.logo_path) {
        const { data: publicUrlData } = supabase.storage
          .from('client-logos')
          .getPublicUrl(planejamento.client.logo_path);

        planejamento.client.logo_url = publicUrlData?.publicUrl || null;
      }

      // Buscar departamentos com matrizes
      const { data: departamentos, error: departamentosError } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*)
        `)
        .eq('planejamento_id', planejamento.id)
        .order('created_at', { ascending: true });

      if (departamentosError) throw departamentosError;

      planejamento.departamentos = departamentos || [];

      // Registrar acesso
      await supabase
        .from('pe_access_logs')
        .insert({
          planejamento_id: planejamento.id,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers['user-agent']
        });

      console.log(`✅ Acesso público ao planejamento ${planejamento.id}`);

      res.json({
        success: true,
        data: planejamento
      });
    } catch (error) {
      console.error('Erro ao obter planejamento público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao acessar planejamento',
        error: error.message
      });
    }
  }

  /**
   * Obter departamento específico via token público
   * GET /api/planejamento-estrategico/publico/departamento/:token
   */
  async obterDepartamentoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar departamento pelo token
      const { data: departamento, error: departamentoError } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*),
          planejamento:planejamentos_estrategicos(
            id,
            titulo,
            prazo_preenchimento,
            data_inicio,
            data_fim,
            descricao,
            client:clients(
              id,
              email,
              clients_pf(cpf, full_name),
              clients_pj(cnpj, company_name, trade_name),
              logo_path
            )
          )
        `)
        .eq('unique_token', token)
        .single();

      if (departamentoError) throw departamentoError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Gerar URL pública da logo do cliente
      if (departamento.planejamento?.client?.logo_path) {
        const { data: publicUrlData } = supabase.storage
          .from('client-logos')
          .getPublicUrl(departamento.planejamento.client.logo_path);

        departamento.planejamento.client.logo_url = publicUrlData?.publicUrl || null;
      }

      // Registrar acesso
      await supabase
        .from('pe_access_logs')
        .insert({
          planejamento_id: departamento.planejamento.id,
          departamento_id: departamento.id,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers['user-agent']
        });

      console.log(`✅ Acesso público ao departamento ${departamento.id} via token`);

      res.json({
        success: true,
        data: departamento
      });
    } catch (error) {
      console.error('Erro ao obter departamento público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao acessar departamento',
        error: error.message
      });
    }
  }

  /**
   * Atualizar matriz via link público
   * PUT /api/planejamento-estrategico/publico/matriz/:departamentoId
   */
  async atualizarMatrizPublico(req, res) {
    try {
      const { departamentoId } = req.params;
      const { vulnerabilidades, conquistas, licoes_aprendidas, compromissos } = req.body;

      // Verificar se o departamento existe e buscar o planejamento
      const { data: departamento, error: depError } = await supabase
        .from('pe_departamentos')
        .select('*, planejamento:planejamentos_estrategicos(*)')
        .eq('id', departamentoId)
        .single();

      if (depError) throw depError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Verificar se o prazo de preenchimento ainda está válido
      const planejamento = departamento.planejamento;
      if (planejamento.prazo_preenchimento) {
        const prazo = new Date(planejamento.prazo_preenchimento);
        const agora = new Date();

        if (agora > prazo) {
          return res.status(403).json({
            success: false,
            message: 'Prazo para edição expirado'
          });
        }
      }

      // Verificar se já existe matriz
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_evolucao')
        .select('id')
        .eq('departamento_id', departamentoId)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_evolucao')
          .update({
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos
          })
          .eq('departamento_id', departamentoId)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_evolucao')
          .insert({
            departamento_id: departamentoId,
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos,
            preenchido_em: new Date().toISOString()
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz do departamento ${departamentoId} atualizada (acesso público)`);

      res.json({
        success: true,
        message: 'Matriz salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar matriz (público):', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar matriz',
        error: error.message
      });
    }
  }

  /**
   * Atualizar matriz de um departamento via token único
   * PUT /api/planejamento-estrategico/publico/departamento/:token/matriz
   */
  async atualizarMatrizDepartamentoPublico(req, res) {
    try {
      const { token } = req.params;
      const { vulnerabilidades, conquistas, licoes_aprendidas, compromissos } = req.body;

      // Buscar departamento pelo token e verificar planejamento
      const { data: departamento, error: depError } = await supabase
        .from('pe_departamentos')
        .select('*, planejamento:planejamentos_estrategicos(*)')
        .eq('unique_token', token)
        .single();

      if (depError) throw depError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Verificar se o prazo de preenchimento ainda está válido
      const planejamento = departamento.planejamento;
      if (planejamento.prazo_preenchimento) {
        const prazo = new Date(planejamento.prazo_preenchimento);
        const agora = new Date();

        if (agora > prazo) {
          return res.status(403).json({
            success: false,
            message: 'Prazo para edição expirado'
          });
        }
      }

      // Verificar se já existe matriz
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_evolucao')
        .select('id')
        .eq('departamento_id', departamento.id)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_evolucao')
          .update({
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos
          })
          .eq('departamento_id', departamento.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_evolucao')
          .insert({
            departamento_id: departamento.id,
            vulnerabilidades,
            conquistas,
            licoes_aprendidas,
            compromissos,
            preenchido_em: new Date().toISOString()
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz do departamento ${departamento.id} atualizada via token público`);

      res.json({
        success: true,
        message: 'Matriz salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar matriz via token:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar matriz',
        error: error.message
      });
    }
  }

  /**
   * Exportar matriz de um departamento para PDF
   * GET /api/planejamento-estrategico/publico/matriz/:departamentoId/pdf
   */
  async exportarMatrizPDF(req, res) {
    try {
      const { departamentoId } = req.params;

      // Buscar departamento com matriz e planejamento
      const { data: departamento, error: depError } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*),
          planejamento:planejamentos_estrategicos(
            titulo,
            client:clients(
              clients_pf(full_name),
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .eq('id', departamentoId)
        .single();

      if (depError) throw depError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Criar documento PDF em modo paisagem
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=matriz-evolucao-${departamento.nome_departamento.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 150)
         .fill('#003b2b');

      // Logo TOP (canto superior direito) - adicionar ANTES do texto
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 120;
          const logoX = doc.page.width - logoWidth - 30; // 30px de margem direita
          doc.image(logoPath, logoX, 45, {
            width: logoWidth
          });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      } else {
        console.log('Logo não encontrada em:', logoPath);
      }

      // Título principal
      doc.fontSize(32)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Matriz de Evolução Consciente', 50, 60, { align: 'left' });

      // Informações do departamento e cliente
      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(departamento.nome_departamento, 50, 105, { align: 'left' });

      // Espaço após header
      doc.y = 170;

      // Cores das colunas (corrigidas para match com o sistema)
      const colors = {
        vulnerabilidades: '#4a5568',
        conquistas: '#18723c',
        licoes: '#a9a9a9',
        compromissos: '#18723c'
      };

      const textColors = {
        vulnerabilidades: '#ffffff',
        conquistas: '#ffffff',
        licoes: '#ffffff',
        compromissos: '#ffffff'
      };

      // Calcular dimensões
      const pageWidth = doc.page.width - 100;
      const columnWidth = pageWidth / 4;
      const startX = 50;
      const headerHeight = 50;
      const marginBottom = 50;

      // Preparar colunas com seus itens
      const columns = [
        {
          title: 'VULNERABILIDADE',
          icon: '🛡️',
          content: departamento.matriz?.vulnerabilidades || '',
          color: colors.vulnerabilidades,
          textColor: textColors.vulnerabilidades
        },
        {
          title: 'CONQUISTAS',
          icon: '⭐',
          content: departamento.matriz?.conquistas || '',
          color: colors.conquistas,
          textColor: textColors.conquistas
        },
        {
          title: 'LIÇÕES APRENDIDAS',
          icon: '📖',
          content: departamento.matriz?.licoes_aprendidas || '',
          color: colors.licoes,
          textColor: textColors.licoes
        },
        {
          title: 'COMPROMISSOS',
          icon: '🤝',
          content: departamento.matriz?.compromissos || '',
          color: colors.compromissos,
          textColor: textColors.compromissos
        }
      ];

      // Processar itens de cada coluna
      columns.forEach((col, idx) => {
        col.items = col.content.split('\n').filter(item => item.trim());
        col.x = startX + (columnWidth * idx);
      });

      // Função para desenhar uma página de colunas
      const drawPage = (startItemIndex) => {
        const startY = doc.y;
        const availableHeight = doc.page.height - startY - marginBottom;

        // Desenhar headers
        columns.forEach(column => {
          doc.rect(column.x, startY, columnWidth, headerHeight)
             .fill(column.color);

          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor(column.textColor)
             .text(column.title, column.x + 10, startY + 18, {
               width: columnWidth - 20,
               align: 'center'
             });
        });

        // Desenhar bordas das colunas
        columns.forEach(column => {
          doc.rect(column.x, startY + headerHeight, columnWidth, availableHeight - headerHeight)
             .stroke('#e2e8f0');
        });

        // Desenhar conteúdo de cada coluna
        let maxItemsDrawn = 0;
        columns.forEach(column => {
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#2d3748');

          let textY = startY + headerHeight + 12;
          let itemsDrawn = 0;

          for (let i = startItemIndex; i < column.items.length; i++) {
            const item = column.items[i];
            const itemHeight = doc.heightOfString(`• ${item}`, {
              width: columnWidth - 30,
              lineGap: 2
            }) + 8;

            // Verificar se cabe na página
            if (textY + itemHeight > startY + availableHeight - 10) {
              break;
            }

            doc.text(`• ${item}`, column.x + 15, textY, {
              width: columnWidth - 30,
              align: 'left',
              lineGap: 2
            });

            textY += itemHeight;
            itemsDrawn++;
          }

          maxItemsDrawn = Math.max(maxItemsDrawn, itemsDrawn);
        });

        return startItemIndex + maxItemsDrawn;
      };

      // Desenhar primeira página
      let currentItemIndex = 0;
      currentItemIndex = drawPage(currentItemIndex);

      // Verificar se precisa de mais páginas
      const maxItems = Math.max(...columns.map(col => col.items.length));
      while (currentItemIndex < maxItems) {
        doc.addPage();
        doc.y = 50;
        currentItemIndex = drawPage(currentItemIndex);
      }

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF da matriz do departamento ${departamentoId} gerado`);
    } catch (error) {
      console.error('Erro ao gerar PDF da matriz:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar PDF',
        error: error.message
      });
    }
  }

  /**
   * Exportar todas as matrizes de um planejamento para PDF
   * GET /api/planejamento-estrategico/:id/matrizes/pdf
   */
  async exportarTodasMatrizesPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar todos os departamentos com suas matrizes
      const { data: departamentos, error: depError } = await supabase
        .from('pe_departamentos')
        .select(`
          *,
          matriz:pe_matriz_evolucao(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (depError) throw depError;

      // Filtrar apenas departamentos com matriz preenchida
      const departamentosComMatriz = departamentos.filter(dep => dep.matriz);

      if (departamentosComMatriz.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nenhuma matriz encontrada'
        });
      }

      // Criar documento PDF em modo paisagem
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      const clientName = planejamento.client?.clients_pj?.trade_name ||
                         planejamento.client?.clients_pj?.company_name ||
                         planejamento.client?.clients_pf?.full_name ||
                         'Cliente';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=matrizes-evolucao-${clientName.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Cores das colunas
      const colors = {
        vulnerabilidades: '#4a5568',
        conquistas: '#18723c',
        licoes: '#a9a9a9',
        compromissos: '#18723c'
      };

      const textColors = {
        vulnerabilidades: '#ffffff',
        conquistas: '#ffffff',
        licoes: '#ffffff',
        compromissos: '#ffffff'
      };

      // Função para desenhar header
      const drawHeader = (departamentoNome) => {
        // Background verde do header
        doc.rect(0, 0, doc.page.width, 150)
           .fill('#003b2b');

        // Logo TOP
        if (fs.existsSync(logoPath)) {
          try {
            const logoWidth = 120;
            const logoX = doc.page.width - logoWidth - 30;
            doc.image(logoPath, logoX, 45, { width: logoWidth });
          } catch (err) {
            console.error('Erro ao adicionar logo:', err);
          }
        }

        // Título principal
        doc.fontSize(32)
           .font('Helvetica-Bold')
           .fillColor('#ffffff')
           .text('Matriz de Evolução Consciente', 50, 60, { align: 'left' });

        // Nome do departamento
        doc.fontSize(14)
           .font('Helvetica')
           .fillColor('#ffffff')
           .text(departamentoNome, 50, 105, { align: 'left' });
      };

      // Função para desenhar uma página de colunas
      const drawMatrizPage = (columns, startItemIndex, isFirstPage) => {
        const startY = doc.y;
        const availableHeight = doc.page.height - startY - 50;
        const pageWidth = doc.page.width - 100;
        const columnWidth = pageWidth / 4;
        const startX = 50;
        const headerHeight = 50;

        // Desenhar headers apenas na primeira página de cada matriz
        if (isFirstPage) {
          columns.forEach(column => {
            doc.rect(column.x, startY, columnWidth, headerHeight)
               .fill(column.color);

            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor(column.textColor)
               .text(column.title, column.x + 10, startY + 18, {
                 width: columnWidth - 20,
                 align: 'center'
               });
          });
        }

        const contentStartY = isFirstPage ? startY + headerHeight : startY;
        const contentHeight = isFirstPage ? availableHeight - headerHeight : availableHeight;

        // Desenhar bordas das colunas
        columns.forEach(column => {
          doc.rect(column.x, contentStartY, columnWidth, contentHeight)
             .stroke('#e2e8f0');
        });

        // Desenhar conteúdo de cada coluna
        let maxItemsDrawn = 0;
        columns.forEach(column => {
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#2d3748');

          let textY = contentStartY + 12;
          let itemsDrawn = 0;

          for (let i = startItemIndex; i < column.items.length; i++) {
            const item = column.items[i];
            const itemHeight = doc.heightOfString(`• ${item}`, {
              width: columnWidth - 30,
              lineGap: 2
            }) + 8;

            if (textY + itemHeight > contentStartY + contentHeight - 10) {
              break;
            }

            doc.text(`• ${item}`, column.x + 15, textY, {
              width: columnWidth - 30,
              align: 'left',
              lineGap: 2
            });

            textY += itemHeight;
            itemsDrawn++;
          }

          maxItemsDrawn = Math.max(maxItemsDrawn, itemsDrawn);
        });

        return startItemIndex + maxItemsDrawn;
      };

      // Processar cada departamento
      departamentosComMatriz.forEach((departamento, deptIndex) => {
        // Adicionar nova página para cada departamento (exceto o primeiro)
        if (deptIndex > 0) {
          doc.addPage();
        }

        // Desenhar header do departamento
        drawHeader(departamento.nome_departamento);
        doc.y = 170;

        // Preparar colunas
        const pageWidth = doc.page.width - 100;
        const columnWidth = pageWidth / 4;
        const startX = 50;

        const columns = [
          {
            title: 'VULNERABILIDADE',
            content: departamento.matriz?.vulnerabilidades || '',
            color: colors.vulnerabilidades,
            textColor: textColors.vulnerabilidades
          },
          {
            title: 'CONQUISTAS',
            content: departamento.matriz?.conquistas || '',
            color: colors.conquistas,
            textColor: textColors.conquistas
          },
          {
            title: 'LIÇÕES APRENDIDAS',
            content: departamento.matriz?.licoes_aprendidas || '',
            color: colors.licoes,
            textColor: textColors.licoes
          },
          {
            title: 'COMPROMISSOS',
            content: departamento.matriz?.compromissos || '',
            color: colors.compromissos,
            textColor: textColors.compromissos
          }
        ];

        // Processar itens de cada coluna
        columns.forEach((col, idx) => {
          col.items = col.content.split('\n').filter(item => item.trim());
          col.x = startX + (columnWidth * idx);
        });

        // Desenhar primeira página da matriz
        let currentItemIndex = 0;
        currentItemIndex = drawMatrizPage(columns, currentItemIndex, true);

        // Verificar se precisa de mais páginas
        const maxItems = Math.max(...columns.map(col => col.items.length));
        while (currentItemIndex < maxItems) {
          doc.addPage();
          doc.y = 50;
          currentItemIndex = drawMatrizPage(columns, currentItemIndex, false);
        }
      });

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de todas as matrizes gerado com sucesso`);
    } catch (error) {
      console.error('Erro ao gerar PDF de todas as matrizes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar PDF',
        error: error.message
      });
    }
  }

  // ===== GRUPOS (MATRIZ SWOT) =====

  /**
   * Listar grupos de um planejamento
   * GET /api/planejamento-estrategico/:id/grupos
   */
  async listarGrupos(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          matriz_swot:pe_matriz_swot(*),
          classificacao_riscos:pe_classificacao_riscos_grupos(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      console.log(`✅ ${data?.length || 0} grupos encontrados`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar grupos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar grupos',
        error: error.message
      });
    }
  }

  /**
   * Adicionar grupo a um planejamento
   * POST /api/planejamento-estrategico/:id/grupos
   */
  async adicionarGrupo(req, res) {
    try {
      const { id } = req.params;
      const { nome_grupo, integrantes } = req.body;

      if (!nome_grupo) {
        return res.status(400).json({
          success: false,
          message: 'Nome do grupo é obrigatório'
        });
      }

      // Gerar token único para o grupo
      const unique_token = crypto.randomBytes(32).toString('hex');

      const { data, error } = await supabase
        .from('pe_grupos')
        .insert({
          planejamento_id: id,
          nome_grupo,
          integrantes: integrantes || null,
          unique_token
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Grupo adicionado ao planejamento ${id} com token ${unique_token}`);

      res.status(201).json({
        success: true,
        message: 'Grupo adicionado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao adicionar grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar grupo',
        error: error.message
      });
    }
  }

  /**
   * Atualizar grupo
   * PUT /api/planejamento-estrategico/grupos/:grupoId
   */
  async atualizarGrupo(req, res) {
    try {
      const { grupoId } = req.params;
      const { nome_grupo, integrantes } = req.body;

      const updateData = {};
      if (nome_grupo !== undefined) updateData.nome_grupo = nome_grupo;
      if (integrantes !== undefined) updateData.integrantes = integrantes;

      const { data, error } = await supabase
        .from('pe_grupos')
        .update(updateData)
        .eq('id', grupoId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      console.log(`✅ Grupo ${grupoId} atualizado`);

      res.json({
        success: true,
        message: 'Grupo atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar grupo',
        error: error.message
      });
    }
  }

  /**
   * Deletar grupo
   * DELETE /api/planejamento-estrategico/grupos/:grupoId
   */
  async deletarGrupo(req, res) {
    try {
      const { grupoId } = req.params;

      const { error } = await supabase
        .from('pe_grupos')
        .delete()
        .eq('id', grupoId);

      if (error) throw error;

      console.log(`✅ Grupo ${grupoId} deletado (cascade para matriz SWOT)`);

      res.json({
        success: true,
        message: 'Grupo deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar grupo',
        error: error.message
      });
    }
  }

  /**
   * Atualizar matriz SWOT via link público
   * PUT /api/planejamento-estrategico/publico/matriz-swot/:grupoId
   */
  async atualizarMatrizSwotPublico(req, res) {
    try {
      const { grupoId } = req.params;
      const {
        forcas,
        fraquezas,
        oportunidades,
        ameacas,
        forcas_classificacao,
        fraquezas_classificacao,
        oportunidades_classificacao,
        ameacas_classificacao
      } = req.body;

      // Verificar se o grupo existe e buscar o planejamento
      const { data: grupo, error: grupoError } = await supabase
        .from('pe_grupos')
        .select('*, planejamento:planejamentos_estrategicos(*)')
        .eq('id', grupoId)
        .single();

      if (grupoError) throw grupoError;
      if (!grupo) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      // Verificar se o prazo de preenchimento ainda está válido
      const planejamento = grupo.planejamento;
      if (planejamento.prazo_preenchimento) {
        const prazo = new Date(planejamento.prazo_preenchimento);
        const agora = new Date();

        if (agora > prazo) {
          return res.status(403).json({
            success: false,
            message: 'Prazo para edição expirado'
          });
        }
      }

      // Verificar se já existe matriz
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_swot')
        .select('id')
        .eq('grupo_id', grupoId)
        .single();

      let data, error;

      // Preparar dados de atualização
      const updateData = {
        forcas,
        fraquezas,
        oportunidades,
        ameacas
      };

      // Adicionar classificações se fornecidas
      if (forcas_classificacao !== undefined) updateData.forcas_classificacao = forcas_classificacao;
      if (fraquezas_classificacao !== undefined) updateData.fraquezas_classificacao = fraquezas_classificacao;
      if (oportunidades_classificacao !== undefined) updateData.oportunidades_classificacao = oportunidades_classificacao;
      if (ameacas_classificacao !== undefined) updateData.ameacas_classificacao = ameacas_classificacao;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_swot')
          .update(updateData)
          .eq('grupo_id', grupoId)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_swot')
          .insert({
            grupo_id: grupoId,
            ...updateData,
            preenchido_em: new Date().toISOString()
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz SWOT do grupo ${grupoId} atualizada (acesso público)`);

      res.json({
        success: true,
        message: 'Matriz SWOT salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar matriz SWOT (público):', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar matriz SWOT',
        error: error.message
      });
    }
  }

  /**
   * Obter planejamento com grupos (para página de SWOT)
   * GET /api/planejamento-estrategico/:id/swot
   */
  async obterPlanejamentoComSwot(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name),
            logo_path
          ),
          contract:contracts(
            id,
            contract_number
          )
        `)
        .eq('id', id)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar grupos com suas matrizes SWOT
      const { data: grupos, error: gruposError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          matriz_swot:pe_matriz_swot(*)
        `)
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (gruposError) throw gruposError;

      planejamento.grupos = grupos || [];

      res.json({
        success: true,
        data: planejamento
      });
    } catch (error) {
      console.error('Erro ao obter planejamento com SWOT:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter planejamento',
        error: error.message
      });
    }
  }

  /**
   * Obter grupo via token público (para página pública de SWOT)
   * GET /api/planejamento-estrategico/publico/grupo/:token
   */
  async obterGrupoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar grupo pelo token
      const { data: grupo, error: grupoError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          matriz_swot:pe_matriz_swot(*),
          planejamento:planejamentos_estrategicos(
            id,
            titulo,
            prazo_preenchimento,
            data_inicio,
            data_fim,
            descricao,
            client:clients(
              id,
              email,
              clients_pf(cpf, full_name),
              clients_pj(cnpj, company_name, trade_name),
              logo_path
            )
          )
        `)
        .eq('unique_token', token)
        .single();

      if (grupoError) throw grupoError;
      if (!grupo) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      // Gerar URL pública da logo do cliente
      if (grupo.planejamento?.client?.logo_path) {
        const { data: publicUrlData } = supabase.storage
          .from('client-logos')
          .getPublicUrl(grupo.planejamento.client.logo_path);

        grupo.planejamento.client.logo_url = publicUrlData?.publicUrl || null;
      }

      console.log(`✅ Acesso público ao grupo ${grupo.id} via token`);

      res.json({
        success: true,
        data: grupo
      });
    } catch (error) {
      console.error('Erro ao obter grupo público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao acessar grupo',
        error: error.message
      });
    }
  }

  /**
   * Exportar matriz SWOT de um grupo para PDF
   * GET /api/planejamento-estrategico/publico/matriz-swot/:grupoId/pdf
   */
  async exportarMatrizSwotPDF(req, res) {
    try {
      const { grupoId } = req.params;

      // Buscar grupo com matriz e planejamento
      const { data: grupo, error: grupoError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          matriz_swot:pe_matriz_swot(*),
          planejamento:planejamentos_estrategicos(
            titulo,
            client:clients(
              clients_pf(full_name),
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .eq('id', grupoId)
        .single();

      if (grupoError) throw grupoError;
      if (!grupo) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      // Criar documento PDF em modo paisagem
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=matriz-swot-${grupo.nome_grupo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde escuro do header
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 30, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Matriz SWOT', 40, 45, { align: 'left' });

      // Nome do grupo
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(grupo.nome_grupo, 40, 85, { align: 'left' });

      doc.y = 150;

      // Função auxiliar para converter texto em array
      const stringToArray = (text) => {
        if (!text || !text.trim()) return [];
        return text.split('\n').filter(item => item.trim() !== '');
      };

      // Função auxiliar para obter label da classificação (só a letra)
      const getClassificacaoLabel = (valor) => {
        if (valor === 'C' || valor === 'D' || valor === 'S' || valor === 'N/A') {
          return valor;
        }
        return '';
      };

      // Configuração da matriz SWOT (2x2)
      const pageWidth = doc.page.width - 80;
      const pageHeight = doc.page.height - doc.y - 40;
      const quadranteWidth = pageWidth / 2;
      const quadranteHeight = pageHeight / 2;
      const startX = 40;
      const startY = doc.y;

      // Cores dos quadrantes (igual ao consolidado)
      const cores = {
        forcas: { bg: '#d4edda', text: '#155724', border: '#28a745' },
        fraquezas: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
        oportunidades: { bg: '#d1ecf1', text: '#0c5460', border: '#17a2b8' },
        ameacas: { bg: '#f8d7da', text: '#721c24', border: '#dc3545' }
      };

      // Função para desenhar quadrante
      const desenharQuadrante = (titulo, itens, classificacoes, x, y, cor) => {
        // Borda do quadrante
        doc.rect(x, y, quadranteWidth, quadranteHeight)
           .lineWidth(2)
           .stroke(cor.border);

        // Header do quadrante
        doc.rect(x, y, quadranteWidth, 35)
           .fill(cor.bg);

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(cor.text)
           .text(titulo, x + 10, y + 10, { width: quadranteWidth - 20, align: 'center' });

        // Itens
        let currentY = y + 45;

        if (itens.length > 0) {
          itens.forEach((item, index) => {
            // Obter classificação do item
            const classificacao = classificacoes && classificacoes[index.toString()] ? classificacoes[index.toString()] : '';
            const classificacaoLabel = getClassificacaoLabel(classificacao);

            // Montar texto do item
            const itemText = `• ${item}`;
            const fullText = classificacaoLabel ? `• ${item} ${classificacaoLabel}` : itemText;
            const itemHeight = Math.ceil(doc.heightOfString(fullText, { width: quadranteWidth - 30 }));

            // Verificar se o item cabe no quadrante
            if (currentY + itemHeight + 5 <= y + quadranteHeight - 10) {
              // Texto do item
              doc.fontSize(9)
                 .font('Helvetica')
                 .fillColor('#2d3748')
                 .text(itemText, x + 15, currentY, {
                   width: quadranteWidth - 30,
                   align: 'left',
                   continued: !!classificacaoLabel
                 });

              // Se tiver classificação, adicionar em destaque (negrito e cor do quadrante)
              if (classificacaoLabel) {
                doc.font('Helvetica-Bold')
                   .fillColor(cor.border)
                   .text(`    ${classificacaoLabel}`, { continued: false });
              }

              currentY += itemHeight + 5;
            }
          });
        } else {
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#6c757d')
             .text('-', x + 15, currentY, { width: quadranteWidth - 30, align: 'left' });
        }
      };

      // Desenhar os 4 quadrantes
      // Superior esquerdo - Forças
      desenharQuadrante(
        'FORÇAS',
        stringToArray(grupo.matriz_swot?.forcas),
        grupo.matriz_swot?.forcas_classificacao || {},
        startX,
        startY,
        cores.forcas
      );

      // Superior direito - Fraquezas
      desenharQuadrante(
        'FRAQUEZAS',
        stringToArray(grupo.matriz_swot?.fraquezas),
        grupo.matriz_swot?.fraquezas_classificacao || {},
        startX + quadranteWidth,
        startY,
        cores.fraquezas
      );

      // Inferior esquerdo - Oportunidades
      desenharQuadrante(
        'OPORTUNIDADES',
        stringToArray(grupo.matriz_swot?.oportunidades),
        grupo.matriz_swot?.oportunidades_classificacao || {},
        startX,
        startY + quadranteHeight,
        cores.oportunidades
      );

      // Inferior direito - Ameaças
      desenharQuadrante(
        'AMEAÇAS',
        stringToArray(grupo.matriz_swot?.ameacas),
        grupo.matriz_swot?.ameacas_classificacao || {},
        startX + quadranteWidth,
        startY + quadranteHeight,
        cores.ameacas
      );

      // Labels laterais
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2d3748');

      // Label "INTERNO" (lado esquerdo, vertical)
      doc.save()
         .translate(20, startY + quadranteHeight)
         .rotate(-90)
         .text('INTERNO', 0, 0)
         .restore();

      // Label "EXTERNO" (lado esquerdo, vertical)
      doc.save()
         .translate(20, startY + quadranteHeight * 2)
         .rotate(-90)
         .text('EXTERNO', 0, 0)
         .restore();

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF da matriz SWOT do grupo ${grupoId} gerado`);
    } catch (error) {
      console.error('Erro ao gerar PDF da matriz SWOT:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar PDF',
        error: error.message
      });
    }
  }

  // ===== MATRIZ SWOT FINAL (CONSOLIDADA) =====

  /**
   * Obter matriz SWOT consolidada via token público
   * GET /api/planejamento-estrategico/publico/swot-consolidado/:token
   */
  async obterSwotConsolidadoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          ),
          contract:contracts(
            id,
            contract_number
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar grupos com suas matrizes SWOT
      const { data: grupos, error: gruposError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          matriz_swot:pe_matriz_swot(*)
        `)
        .eq('planejamento_id', planejamento.id)
        .order('created_at', { ascending: true });

      if (gruposError) throw gruposError;

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      if (matrizError && matrizError.code !== 'PGRST116') throw matrizError;

      console.log(`✅ SWOT consolidado obtido via token público`);

      res.json({
        success: true,
        data: {
          planejamento,
          grupos: grupos || [],
          matrizFinal: matrizFinal || null
        }
      });
    } catch (error) {
      console.error('Erro ao obter SWOT consolidado público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter SWOT consolidado',
        error: error.message
      });
    }
  }

  /**
   * Salvar matriz SWOT consolidada via token público
   * PUT /api/planejamento-estrategico/publico/swot-consolidado/:token
   */
  async salvarSwotConsolidadoPublico(req, res) {
    try {
      const { token } = req.params;
      const { forcas, fraquezas, oportunidades, ameacas, observacoes } = req.body;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select('id')
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Verificar se já existe matriz final
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_swot_final')
        .select('id')
        .eq('planejamento_id', planejamento.id)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_swot_final')
          .update({
            forcas,
            fraquezas,
            oportunidades,
            ameacas,
            observacoes
          })
          .eq('planejamento_id', planejamento.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_swot_final')
          .insert({
            planejamento_id: planejamento.id,
            forcas,
            fraquezas,
            oportunidades,
            ameacas,
            observacoes
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz SWOT consolidada salva via token público`);

      res.json({
        success: true,
        message: 'Matriz SWOT consolidada salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar SWOT consolidado público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar SWOT consolidado',
        error: error.message
      });
    }
  }

  /**
   * Obter classificação de riscos via token público
   * GET /api/planejamento-estrategico/publico/classificacao-riscos/:token
   */
  async obterClassificacaoRiscosPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final (para extrair oportunidades e ameaças)
      const { data: matrizFinal } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      // Buscar classificação de riscos existente
      const { data: classificacao } = await supabase
        .from('pe_classificacao_riscos')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      console.log(`✅ Classificação de riscos obtida via token público`);

      res.json({
        success: true,
        data: {
          planejamento,
          matrizFinal,
          classificacao
        }
      });
    } catch (error) {
      console.error('Erro ao obter classificação de riscos público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter classificação de riscos',
        error: error.message
      });
    }
  }

  /**
   * Salvar classificação de riscos via token público
   * PUT /api/planejamento-estrategico/publico/classificacao-riscos/:token
   */
  async salvarClassificacaoRiscosPublico(req, res) {
    try {
      const { token } = req.params;
      const { oportunidades, ameacas } = req.body;

      // Validação básica
      if (!oportunidades || !ameacas) {
        return res.status(400).json({
          success: false,
          message: 'Dados incompletos'
        });
      }

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select('id')
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Verificar se já existe classificação
      const { data: classificacaoExistente } = await supabase
        .from('pe_classificacao_riscos')
        .select('id')
        .eq('planejamento_id', planejamento.id)
        .single();

      let data, error;

      if (classificacaoExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .update({
            oportunidades,
            ameacas,
            updated_at: new Date().toISOString()
          })
          .eq('planejamento_id', planejamento.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .insert({
            planejamento_id: planejamento.id,
            oportunidades,
            ameacas
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Classificação de riscos salva via token público`);

      res.json({
        success: true,
        message: 'Classificação de riscos salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar classificação de riscos público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar classificação de riscos',
        error: error.message
      });
    }
  }

  /**
   * Obter classificação de riscos de um grupo via token público
   * GET /api/planejamento-estrategico/publico/grupo/:token/classificacao-riscos
   */
  async obterClassificacaoRiscosGrupoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar grupo pelo token
      const { data: grupo, error: grupoError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          planejamento:planejamentos_estrategicos(
            id,
            titulo,
            prazo_preenchimento,
            client:clients(
              clients_pf(full_name),
              clients_pj(company_name, trade_name)
            )
          )
        `)
        .eq('unique_token', token)
        .single();

      if (grupoError || !grupo) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      // Buscar matriz SWOT final (para extrair oportunidades e ameaças)
      const { data: matrizFinal } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', grupo.planejamento_id)
        .single();

      // Buscar classificação de riscos do grupo
      const { data: classificacao } = await supabase
        .from('pe_classificacao_riscos_grupos')
        .select('*')
        .eq('grupo_id', grupo.id)
        .single();

      console.log(`✅ Classificação de riscos do grupo ${grupo.id} obtida via token público`);

      res.json({
        success: true,
        data: {
          grupo,
          planejamento: grupo.planejamento,
          matrizFinal,
          classificacao
        }
      });
    } catch (error) {
      console.error('Erro ao obter classificação de riscos do grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter classificação de riscos do grupo',
        error: error.message
      });
    }
  }

  /**
   * Salvar classificação de riscos de um grupo via token público
   * PUT /api/planejamento-estrategico/publico/grupo/:token/classificacao-riscos
   */
  async salvarClassificacaoRiscosGrupoPublico(req, res) {
    try {
      const { token } = req.params;
      const { oportunidades, ameacas } = req.body;

      // Validação básica
      if (!oportunidades || !ameacas) {
        return res.status(400).json({
          success: false,
          message: 'Dados incompletos'
        });
      }

      // Buscar grupo pelo token
      const { data: grupo, error: grupoError } = await supabase
        .from('pe_grupos')
        .select('id, planejamento_id')
        .eq('unique_token', token)
        .single();

      if (grupoError || !grupo) {
        return res.status(404).json({
          success: false,
          message: 'Grupo não encontrado'
        });
      }

      // Verificar se já existe classificação para o grupo
      const { data: classificacaoExistente } = await supabase
        .from('pe_classificacao_riscos_grupos')
        .select('id')
        .eq('grupo_id', grupo.id)
        .single();

      let data, error;

      if (classificacaoExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_classificacao_riscos_grupos')
          .update({
            oportunidades,
            ameacas,
            preenchido_em: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('grupo_id', grupo.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_classificacao_riscos_grupos')
          .insert({
            grupo_id: grupo.id,
            oportunidades,
            ameacas,
            preenchido_em: new Date().toISOString()
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Classificação de riscos do grupo ${grupo.id} salva via token público`);

      res.json({
        success: true,
        message: 'Classificação de riscos salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar classificação de riscos do grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar classificação de riscos do grupo',
        error: error.message
      });
    }
  }

  /**
   * Obter classificação de riscos consolidada via token do planejamento
   * GET /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token
   */
  async obterClassificacaoRiscosConsolidadoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name),
            logo_url
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final (para extrair oportunidades e ameaças)
      const { data: matrizFinal } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      // Buscar todos os grupos com suas classificações
      const { data: grupos, error: gruposError } = await supabase
        .from('pe_grupos')
        .select(`
          *,
          classificacao_riscos:pe_classificacao_riscos_grupos(*)
        `)
        .eq('planejamento_id', planejamento.id)
        .order('created_at', { ascending: true });

      if (gruposError) throw gruposError;

      // Buscar classificação consolidada (final)
      const { data: classificacaoFinal } = await supabase
        .from('pe_classificacao_riscos')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      console.log(`✅ Classificação de riscos consolidada obtida via token público`);

      res.json({
        success: true,
        data: {
          planejamento,
          matrizFinal,
          grupos: grupos || [],
          classificacaoFinal
        }
      });
    } catch (error) {
      console.error('Erro ao obter classificação de riscos consolidada:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter classificação de riscos consolidada',
        error: error.message
      });
    }
  }

  /**
   * Salvar classificação de riscos consolidada via token do planejamento
   * PUT /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token
   */
  async salvarClassificacaoRiscosConsolidadoPublico(req, res) {
    try {
      const { token } = req.params;
      const { oportunidades, ameacas } = req.body;

      // Validação básica
      if (!oportunidades || !ameacas) {
        return res.status(400).json({
          success: false,
          message: 'Dados incompletos'
        });
      }

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select('id')
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Verificar se já existe classificação consolidada
      const { data: classificacaoExistente } = await supabase
        .from('pe_classificacao_riscos')
        .select('id')
        .eq('planejamento_id', planejamento.id)
        .single();

      let data, error;

      if (classificacaoExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .update({
            oportunidades,
            ameacas,
            updated_at: new Date().toISOString()
          })
          .eq('planejamento_id', planejamento.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .insert({
            planejamento_id: planejamento.id,
            oportunidades,
            ameacas
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Classificação de riscos consolidada salva via token público`);

      res.json({
        success: true,
        message: 'Classificação de riscos consolidada salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar classificação de riscos consolidada:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar classificação de riscos consolidada',
        error: error.message
      });
    }
  }

  /**
   * Obter classificação de riscos de um planejamento (rota protegida)
   * GET /api/planejamento-estrategico/:id/classificacao-riscos
   */
  async obterClassificacaoRiscos(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('pe_classificacao_riscos')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      res.json({
        success: true,
        data: data || null
      });
    } catch (error) {
      console.error('Erro ao obter classificação de riscos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter classificação de riscos',
        error: error.message
      });
    }
  }

  /**
   * Salvar classificação de riscos (rota protegida)
   * PUT /api/planejamento-estrategico/:id/classificacao-riscos
   */
  async salvarClassificacaoRiscos(req, res) {
    try {
      const { id } = req.params;
      const { oportunidades, ameacas } = req.body;

      // Validação básica
      if (!oportunidades || !ameacas) {
        return res.status(400).json({
          success: false,
          message: 'Dados incompletos'
        });
      }

      // Verificar se já existe classificação
      const { data: classificacaoExistente } = await supabase
        .from('pe_classificacao_riscos')
        .select('id')
        .eq('planejamento_id', id)
        .single();

      let data, error;

      if (classificacaoExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .update({
            oportunidades,
            ameacas,
            updated_by: req.user.id,
            updated_at: new Date().toISOString()
          })
          .eq('planejamento_id', id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_classificacao_riscos')
          .insert({
            planejamento_id: id,
            oportunidades,
            ameacas,
            created_by: req.user.id
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Classificação de riscos salva pelo usuário ${req.user.id}`);

      res.json({
        success: true,
        message: 'Classificação de riscos salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar classificação de riscos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar classificação de riscos',
        error: error.message
      });
    }
  }

  /**
   * Obter matriz SWOT final de um planejamento
   * GET /api/planejamento-estrategico/:id/swot-final
   */
  async obterMatrizSwotFinal(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('pe_matriz_swot_final')
        .select(`
          *,
          criador:users!pe_matriz_swot_final_created_by_fkey(id, name, email),
          atualizador:users!pe_matriz_swot_final_updated_by_fkey(id, name, email)
        `)
        .eq('planejamento_id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      res.json({
        success: true,
        data: data || null
      });
    } catch (error) {
      console.error('Erro ao obter matriz SWOT final:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter matriz SWOT final',
        error: error.message
      });
    }
  }

  /**
   * Criar ou atualizar matriz SWOT final
   * PUT /api/planejamento-estrategico/:id/swot-final
   */
  async salvarMatrizSwotFinal(req, res) {
    try {
      const { id } = req.params;
      const { forcas, fraquezas, oportunidades, ameacas, observacoes } = req.body;
      const userId = req.user?.id;

      // Verificar se já existe matriz final
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_swot_final')
        .select('id')
        .eq('planejamento_id', id)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_swot_final')
          .update({
            forcas,
            fraquezas,
            oportunidades,
            ameacas,
            observacoes,
            updated_by: userId
          })
          .eq('planejamento_id', id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_swot_final')
          .insert({
            planejamento_id: id,
            forcas,
            fraquezas,
            oportunidades,
            ameacas,
            observacoes,
            created_by: userId,
            updated_by: userId
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz SWOT final do planejamento ${id} salva`);

      res.json({
        success: true,
        message: 'Matriz SWOT final salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar matriz SWOT final:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar matriz SWOT final',
        error: error.message
      });
    }
  }

  /**
   * Exportar matriz SWOT consolidada para PDF
   * GET /api/planejamento-estrategico/:id/swot-final/pdf
   */
  async exportarMatrizConsolidadaPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizError) throw matrizError;
      if (!matrizFinal) {
        return res.status(404).json({
          success: false,
          message: 'Matriz SWOT consolidada não encontrada'
        });
      }

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=matriz-swot-consolidada-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 30, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Matriz SWOT Consolidada', 40, 45, { align: 'left' });

      // Nome do cliente
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(clientName, 40, 85, { align: 'left' });

      doc.y = 150;

      // Função auxiliar para converter texto em array
      const stringToArray = (text) => {
        if (!text || !text.trim()) return [];
        return text.split('\n').filter(item => item.trim() !== '');
      };

      // Configuração da matriz SWOT (2x2)
      const pageWidth = doc.page.width - 80;
      const pageHeight = doc.page.height - doc.y - 40;
      const quadranteWidth = pageWidth / 2;
      const quadranteHeight = pageHeight / 2;
      const startX = 40;
      const startY = doc.y;

      // Cores dos quadrantes
      const cores = {
        forcas: { bg: '#d4edda', text: '#155724', border: '#28a745' },        // Verde
        fraquezas: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },     // Amarelo
        oportunidades: { bg: '#d1ecf1', text: '#0c5460', border: '#17a2b8' }, // Azul
        ameacas: { bg: '#f8d7da', text: '#721c24', border: '#dc3545' }        // Vermelho
      };

      // Função para desenhar quadrante
      const desenharQuadrante = (titulo, itens, x, y, cor) => {
        // Borda do quadrante
        doc.rect(x, y, quadranteWidth, quadranteHeight)
           .lineWidth(2)
           .stroke(cor.border);

        // Header do quadrante
        doc.rect(x, y, quadranteWidth, 35)
           .fill(cor.bg);

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(cor.text)
           .text(titulo, x + 10, y + 10, { width: quadranteWidth - 20, align: 'center' });

        // Itens
        let currentY = y + 45;
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#2d3748');

        if (itens.length > 0) {
          for (const item of itens) {
            const itemHeight = Math.ceil(doc.heightOfString(item, { width: quadranteWidth - 30 }));

            // Verificar se o item cabe no quadrante
            if (currentY + itemHeight + 5 <= y + quadranteHeight - 10) {
              doc.text(`• ${item}`, x + 15, currentY, {
                width: quadranteWidth - 30,
                align: 'left'
              });
              currentY += itemHeight + 5;
            }
          }
        } else {
          doc.fillColor('#6c757d')
             .text('-', x + 15, currentY, { width: quadranteWidth - 30, align: 'left' });
        }
      };

      // Desenhar os 4 quadrantes
      // Superior esquerdo - Forças
      desenharQuadrante(
        'FORÇAS',
        stringToArray(matrizFinal.forcas),
        startX,
        startY,
        cores.forcas
      );

      // Superior direito - Fraquezas
      desenharQuadrante(
        'FRAQUEZAS',
        stringToArray(matrizFinal.fraquezas),
        startX + quadranteWidth,
        startY,
        cores.fraquezas
      );

      // Inferior esquerdo - Oportunidades
      desenharQuadrante(
        'OPORTUNIDADES',
        stringToArray(matrizFinal.oportunidades),
        startX,
        startY + quadranteHeight,
        cores.oportunidades
      );

      // Inferior direito - Ameaças
      desenharQuadrante(
        'AMEAÇAS',
        stringToArray(matrizFinal.ameacas),
        startX + quadranteWidth,
        startY + quadranteHeight,
        cores.ameacas
      );

      // Labels laterais
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#2d3748');

      // Label "INTERNO" (lado esquerdo, vertical)
      doc.save()
         .translate(20, startY + quadranteHeight)
         .rotate(-90)
         .text('INTERNO', 0, 0)
         .restore();

      // Label "EXTERNO" (lado esquerdo, vertical)
      doc.save()
         .translate(20, startY + quadranteHeight * 2)
         .rotate(-90)
         .text('EXTERNO', 0, 0)
         .restore();

      // Observações (se houver)
      if (matrizFinal.observacoes && matrizFinal.observacoes.trim()) {
        doc.addPage();
        doc.y = 40;

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#003b2b')
           .text('Observações', 40, doc.y);

        doc.y += 20;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(matrizFinal.observacoes, 40, doc.y, {
             width: doc.page.width - 80,
             align: 'left'
           });
      }

      // Finalizar PDF
      doc.end();

      console.log('✅ PDF da Matriz SWOT Consolidada gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF da Matriz SWOT:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  // ===== MATRIZ DE CRUZAMENTO SWOT =====

  /**
   * Obter matriz de cruzamento SWOT de um planejamento
   * GET /api/planejamento-estrategico/:id/swot-cruzamento
   */
  async obterMatrizCruzamento(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select(`
          *,
          criador:users!pe_matriz_swot_cruzamento_created_by_fkey(id, name, email),
          atualizador:users!pe_matriz_swot_cruzamento_updated_by_fkey(id, name, email)
        `)
        .eq('planejamento_id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      res.json({
        success: true,
        data: data || null
      });
    } catch (error) {
      console.error('Erro ao obter matriz de cruzamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter matriz de cruzamento',
        error: error.message
      });
    }
  }

  /**
   * Criar ou atualizar matriz de cruzamento SWOT
   * PUT /api/planejamento-estrategico/:id/swot-cruzamento
   */
  async salvarMatrizCruzamento(req, res) {
    try {
      const { id } = req.params;
      const { alavancas, defesas, restricoes, problemas } = req.body;
      const userId = req.user?.id;

      // Validar estrutura dos arrays 2D (cada valor deve ser 0-50, múltiplo de 10)
      const validarArray2D = (arr) => {
        if (!Array.isArray(arr)) return false;
        return arr.every(linha =>
          Array.isArray(linha) &&
          linha.every(valor =>
            Number.isInteger(valor) && valor >= 0 && valor <= 50 && valor % 10 === 0
          )
        );
      };

      if (!validarArray2D(alavancas) || !validarArray2D(defesas) ||
          !validarArray2D(restricoes) || !validarArray2D(problemas)) {
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos. Cada célula deve ter valor entre 0 e 50 (múltiplos de 10)'
        });
      }

      // Verificar se já existe matriz de cruzamento
      const { data: matrizExistente } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('id')
        .eq('planejamento_id', id)
        .single();

      let data, error;

      if (matrizExistente) {
        // Atualizar
        const result = await supabase
          .from('pe_matriz_swot_cruzamento')
          .update({
            alavancas,
            defesas,
            restricoes,
            problemas,
            updated_by: userId
          })
          .eq('planejamento_id', id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Criar
        const result = await supabase
          .from('pe_matriz_swot_cruzamento')
          .insert({
            planejamento_id: id,
            alavancas,
            defesas,
            restricoes,
            problemas,
            created_by: userId,
            updated_by: userId
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      console.log(`✅ Matriz de cruzamento SWOT do planejamento ${id} salva`);

      res.json({
        success: true,
        message: 'Matriz de cruzamento salva com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao salvar matriz de cruzamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar matriz de cruzamento',
        error: error.message
      });
    }
  }

  /**
   * Exportar Definição de Impacto (Matriz de Cruzamento SWOT) para PDF
   * GET /api/planejamento-estrategico/:id/swot-cruzamento/pdf
   */
  async exportarDefinicaoImpactoPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizError) throw matrizError;
      if (!matrizFinal) {
        return res.status(404).json({
          success: false,
          message: 'Matriz SWOT consolidada não encontrada'
        });
      }

      // Buscar matriz de cruzamento
      const { data: matrizCruzamento, error: cruzError } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (cruzError) throw cruzError;
      if (!matrizCruzamento) {
        return res.status(404).json({
          success: false,
          message: 'Definição de Impacto não encontrada'
        });
      }

      // Função auxiliar para converter texto em array
      const stringToArray = (text) => {
        if (!text || !text.trim()) return [];
        return text.split('\n').filter(item => item.trim() !== '');
      };

      const oportunidades = stringToArray(matrizFinal.oportunidades);
      const ameacas = stringToArray(matrizFinal.ameacas);
      const forcas = stringToArray(matrizFinal.forcas);
      const fraquezas = stringToArray(matrizFinal.fraquezas);

      // Criar documento PDF com tamanho A3 landscape - bom equilíbrio entre espaço e visualização
      const doc = new PDFDocument({
        size: 'A3',
        layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=definicao-impacto-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header (otimizado para A3)
      doc.rect(0, 0, doc.page.width, 80)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 80;
          const logoX = doc.page.width - logoWidth - 25;
          doc.image(logoPath, logoX, 15, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Definição de Impacto', 30, 22, { align: 'left' });

      // Nome do cliente
      doc.fontSize(11)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(clientName, 30, 52, { align: 'left' });

      // Função para calcular a soma de um quadrante
      const somarQuadrante = (matriz) => {
        return matriz.reduce((total, linha) => {
          return total + linha.reduce((sum, val) => sum + val, 0);
        }, 0);
      };

      // Calcular totais
      const totalAlavancas = somarQuadrante(matrizCruzamento.alavancas || []);
      const totalDefesas = somarQuadrante(matrizCruzamento.defesas || []);
      const totalRestricoes = somarQuadrante(matrizCruzamento.restricoes || []);
      const totalProblemas = somarQuadrante(matrizCruzamento.problemas || []);

      // Configurações da página (A3 landscape - bom equilíbrio)
      // Manter na mesma página do header
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 30;
      const usableWidth = pageWidth - (margin * 2);

      // Calcular espaço disponível após o header
      const pdfHeaderHeight = 80;
      const startY = pdfHeaderHeight + 15; // Começar 15px após o header
      const availableHeight = pageHeight - startY - margin;

      // Layout em 2x2: dividir página em 4 quadrantes
      const colWidth = (usableWidth - 25) / 2; // 25px de espaço entre colunas
      const rowHeight = (availableHeight - 25) / 2; // 25px de espaço entre linhas

      const leftX = margin;
      const rightX = margin + colWidth + 25;
      const topY = startY;
      const bottomY = startY + rowHeight + 25;

      // Função simplificada para desenhar quadrante
      const desenharQuadrante = (titulo, linhasLabels, colunasLabels, matriz, x, y, maxW, maxH) => {
        // Título
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#003b2b');
        doc.text(titulo, x, y);

        let currentY = y + 20;

        // Calcular dimensões (células adaptativas) - otimizadas para A3
        const numLinhas = linhasLabels.length;
        const numCols = colunasLabels.length;
        const labelW = 220; // Largura para os labels das linhas
        const cellW = Math.max(70, Math.min(100, (maxW - labelW - 5) / numCols)); // Células otimizadas
        const minCellH = 22; // Altura mínima

        // Calcular altura necessária para o header baseado nas colunas (sem limite para caber todo o texto)
        let headerHeight = minCellH;
        doc.fontSize(7).font('Helvetica-Bold');
        for (let i = 0; i < numCols; i++) {
          const textHeight = doc.heightOfString(colunasLabels[i], {
            width: cellW - 6,
            lineBreak: true
          });
          headerHeight = Math.max(headerHeight, textHeight + 10); // Sem limite máximo, texto completo
        }

        // Header
        doc.rect(x, currentY, labelW, headerHeight).stroke('#ccc');

        for (let i = 0; i < numCols; i++) {
          const cellX = x + labelW + (i * cellW);
          doc.rect(cellX, currentY, cellW, headerHeight).fillAndStroke('#f0f0f0', '#ccc');
          doc.fillColor('#000').fontSize(7).text(colunasLabels[i], cellX + 3, currentY + 5, {
            width: cellW - 6,
            align: 'center',
            lineBreak: true
          });
        }

        currentY += headerHeight;

        // Linhas de dados - calcular altura real necessária para cada linha
        doc.fontSize(7).font('Helvetica');
        for (let i = 0; i < numLinhas; i++) {
          // Calcular altura necessária para o texto da linha (sem limite para caber todo o texto)
          const textHeight = doc.heightOfString(linhasLabels[i], {
            width: labelW - 8,
            lineBreak: true
          });
          const rowHeight = Math.max(minCellH, textHeight + 10); // Sem limite máximo, texto completo

          // Label da linha com quebra de linha
          doc.rect(x, currentY, labelW, rowHeight).fillAndStroke('#f0f0f0', '#ccc');
          doc.fillColor('#000').fontSize(7).text(linhasLabels[i], x + 4, currentY + 5, {
            width: labelW - 8,
            align: 'left',
            lineBreak: true
          });

          // Células
          for (let j = 0; j < numCols; j++) {
            const cellX = x + labelW + (j * cellW);
            const valor = (matriz[i] && matriz[i][j] !== undefined) ? matriz[i][j] : 0;

            let bgColor = '#ffffff';
            if (valor >= 40) bgColor = '#ffcccc';
            else if (valor >= 30) bgColor = '#ffffcc';
            else if (valor >= 20) bgColor = '#fff9cc';
            else if (valor >= 10) bgColor = '#cce5ff';

            doc.rect(cellX, currentY, cellW, rowHeight).fillAndStroke(bgColor, '#ccc');
            doc.fillColor('#000').fontSize(8).text(valor.toString(), cellX, currentY + (rowHeight / 2) - 4, {
              width: cellW,
              align: 'center',
              lineBreak: false
            });
          }

          currentY += rowHeight;
        }
      };

      // Desenhar os 4 quadrantes
      desenharQuadrante(
        `ALAVANCAS (${totalAlavancas}pts)`,
        oportunidades,
        forcas,
        matrizCruzamento.alavancas || [],
        leftX, topY, colWidth, rowHeight
      );

      desenharQuadrante(
        `DEFESAS (${totalDefesas}pts)`,
        ameacas,
        forcas,
        matrizCruzamento.defesas || [],
        rightX, topY, colWidth, rowHeight
      );

      desenharQuadrante(
        `RESTRIÇÕES (${totalRestricoes}pts)`,
        oportunidades,
        fraquezas,
        matrizCruzamento.restricoes || [],
        leftX, bottomY, colWidth, rowHeight
      );

      desenharQuadrante(
        `PROBLEMAS (${totalProblemas}pts)`,
        ameacas,
        fraquezas,
        matrizCruzamento.problemas || [],
        rightX, bottomY, colWidth, rowHeight
      );

      // Finalizar PDF (sem legenda e sem resumo)
      doc.end();

      console.log('✅ PDF da Definição de Impacto gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF da Definição de Impacto:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  /**
   * Exportar Definição de Impacto (Matriz de Cruzamento SWOT) para Excel
   * GET /api/planejamento-estrategico/:id/swot-cruzamento/excel
   */
  async exportarDefinicaoImpactoExcel(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizError) throw matrizError;
      if (!matrizFinal) {
        return res.status(404).json({
          success: false,
          message: 'Matriz SWOT consolidada não encontrada'
        });
      }

      // Buscar matriz de cruzamento
      const { data: matrizCruzamento, error: cruzError } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (cruzError) throw cruzError;
      if (!matrizCruzamento) {
        return res.status(404).json({
          success: false,
          message: 'Definição de Impacto não encontrada'
        });
      }

      // Função auxiliar para converter texto em array
      const stringToArray = (text) => {
        if (!text || !text.trim()) return [];
        return text.split('\n').filter(item => item.trim() !== '');
      };

      const oportunidades = stringToArray(matrizFinal.oportunidades);
      const ameacas = stringToArray(matrizFinal.ameacas);
      const forcas = stringToArray(matrizFinal.forcas);
      const fraquezas = stringToArray(matrizFinal.fraquezas);

      // Criar workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TOP Construtora';
      workbook.created = new Date();

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Função para calcular a soma de um quadrante
      const somarQuadrante = (matriz) => {
        return matriz.reduce((total, linha) => {
          return total + linha.reduce((sum, val) => sum + val, 0);
        }, 0);
      };

      // Calcular totais
      const totalAlavancas = somarQuadrante(matrizCruzamento.alavancas || []);
      const totalDefesas = somarQuadrante(matrizCruzamento.defesas || []);
      const totalRestricoes = somarQuadrante(matrizCruzamento.restricoes || []);
      const totalProblemas = somarQuadrante(matrizCruzamento.problemas || []);

      // Função para criar sheet de um quadrante
      const criarSheetQuadrante = (nome, linhasLabels, colunasLabels, matriz, total) => {
        const sheet = workbook.addWorksheet(nome);

        // Header
        sheet.mergeCells('A1:' + String.fromCharCode(65 + colunasLabels.length) + '1');
        sheet.getCell('A1').value = `${nome} (Total: ${total} pontos)`;
        sheet.getCell('A1').font = { size: 14, bold: true };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
        sheet.getCell('A1').font = { ...sheet.getCell('A1').font, color: { argb: 'FFFFFFFF' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        // Cliente
        sheet.mergeCells('A2:' + String.fromCharCode(65 + colunasLabels.length) + '2');
        sheet.getCell('A2').value = clientName;
        sheet.getCell('A2').alignment = { horizontal: 'center' };

        // Espaço
        sheet.addRow([]);

        // Header da tabela
        const headerRow = sheet.addRow(['', ...colunasLabels]);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        sheet.getRow(headerRow.number).height = 40;

        // Dados
        linhasLabels.forEach((rowLabel, i) => {
          const rowData = [rowLabel];
          colunasLabels.forEach((col, j) => {
            const valor = matriz[i] && matriz[i][j] !== undefined ? matriz[i][j] : 0;
            rowData.push(valor);
          });

          const row = sheet.addRow(rowData);
          row.alignment = { vertical: 'middle', wrapText: true };

          // Aplicar cores baseadas no valor
          colunasLabels.forEach((col, j) => {
            const cellIndex = j + 2; // +2 porque começa em B (A é o label)
            const valor = matriz[i] && matriz[i][j] !== undefined ? matriz[i][j] : 0;
            const cell = row.getCell(cellIndex);

            let bgColor = 'FFFFFFFF';
            if (valor >= 40) bgColor = 'FFFEE2E2'; // Vermelho claro
            else if (valor >= 30) bgColor = 'FFFEF3C7'; // Amarelo claro
            else if (valor >= 20) bgColor = 'FFFEF9C3'; // Amarelo muito claro
            else if (valor >= 10) bgColor = 'FFDBEAFE'; // Azul claro

            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          });
        });

        // Ajustar largura das colunas
        sheet.getColumn(1).width = 40;
        for (let i = 2; i <= colunasLabels.length + 1; i++) {
          sheet.getColumn(i).width = 20;
        }
      };

      // Criar sheets para cada quadrante
      criarSheetQuadrante('Alavancas', oportunidades, forcas, matrizCruzamento.alavancas || [], totalAlavancas);
      criarSheetQuadrante('Defesas', ameacas, forcas, matrizCruzamento.defesas || [], totalDefesas);
      criarSheetQuadrante('Restrições', oportunidades, fraquezas, matrizCruzamento.restricoes || [], totalRestricoes);
      criarSheetQuadrante('Problemas', ameacas, fraquezas, matrizCruzamento.problemas || [], totalProblemas);

      // Sheet de resumo
      const resumoSheet = workbook.addWorksheet('Resumo');
      resumoSheet.mergeCells('A1:B1');
      resumoSheet.getCell('A1').value = 'Resumo dos Impactos';
      resumoSheet.getCell('A1').font = { size: 14, bold: true };
      resumoSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003b2b' } };
      resumoSheet.getCell('A1').font = { ...resumoSheet.getCell('A1').font, color: { argb: 'FFFFFFFF' } };
      resumoSheet.getCell('A1').alignment = { horizontal: 'center' };

      resumoSheet.addRow([]);
      resumoSheet.addRow(['Quadrante', 'Total de Pontos']);
      resumoSheet.addRow(['Alavancas', totalAlavancas]);
      resumoSheet.addRow(['Defesas', totalDefesas]);
      resumoSheet.addRow(['Restrições', totalRestricoes]);
      resumoSheet.addRow(['Problemas', totalProblemas]);

      resumoSheet.getColumn(1).width = 20;
      resumoSheet.getColumn(2).width = 20;

      // Headers para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=definicao-impacto-${planejamento.titulo.replace(/\s+/g, '-')}.xlsx`);

      // Escrever para response
      await workbook.xlsx.write(res);
      res.end();

      console.log('✅ Excel da Definição de Impacto gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar Excel da Definição de Impacto:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar Excel',
        error: error.message
      });
    }
  }

  // ===== OBJETIVOS ESTRATÉGICOS =====

  /**
   * Listar todos os objetivos estratégicos de um planejamento (com hierarquia)
   * GET /api/planejamento-estrategico/:id/okrs
   */
  async listarOkrs(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('planejamento_okrs')
        .select('*')
        .eq('planejamento_id', id)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar objetivos estratégicos:', error);
        throw error;
      }

      // Organizar em hierarquia: objetivos principais (parent_id = null) com seus sub-objetivos
      const objetivosPrincipais = (data || []).filter(obj => !obj.parent_id);
      const subObjetivos = (data || []).filter(obj => obj.parent_id);

      // Adicionar sub-objetivos a cada objetivo principal
      const objetivosComHierarquia = objetivosPrincipais.map(obj => ({
        ...obj,
        sub_objetivos: subObjetivos.filter(sub => sub.parent_id === obj.id)
      }));

      console.log(`✅ ${objetivosPrincipais.length} objetivos principais e ${subObjetivos.length} sub-objetivos encontrados`);

      res.json({
        success: true,
        data: objetivosComHierarquia
      });
    } catch (error) {
      console.error('Erro ao listar objetivos estratégicos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar objetivos estratégicos',
        error: error.message
      });
    }
  }

  /**
   * Adicionar objetivo estratégico a um planejamento
   * POST /api/planejamento-estrategico/:id/okrs
   * Body: { objetivo: string, parent_id?: number (para sub-objetivos) }
   */
  async adicionarOkr(req, res) {
    try {
      const { id } = req.params;
      const { objetivo, parent_id } = req.body;

      if (!objetivo || !objetivo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O objetivo é obrigatório'
        });
      }

      // Se tem parent_id, validar que o objetivo pai existe e pertence ao mesmo planejamento
      if (parent_id) {
        const { data: objetivoPai, error: paiError } = await supabase
          .from('planejamento_okrs')
          .select('id, planejamento_id')
          .eq('id', parent_id)
          .single();

        if (paiError || !objetivoPai) {
          return res.status(400).json({
            success: false,
            message: 'Objetivo pai não encontrado'
          });
        }

        if (objetivoPai.planejamento_id != id) {
          return res.status(400).json({
            success: false,
            message: 'Objetivo pai não pertence a este planejamento'
          });
        }
      }

      // Obter próxima ordem
      const { data: ultimoOkr } = await supabase
        .from('planejamento_okrs')
        .select('ordem')
        .eq('planejamento_id', id)
        .eq('parent_id', parent_id || null)
        .order('ordem', { ascending: false })
        .limit(1)
        .single();

      const proximaOrdem = ultimoOkr ? (ultimoOkr.ordem || 0) + 1 : 0;

      const { data, error } = await supabase
        .from('planejamento_okrs')
        .insert({
          planejamento_id: id,
          objetivo: objetivo.trim(),
          parent_id: parent_id || null,
          ordem: proximaOrdem
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao adicionar objetivo estratégico:', error);
        throw error;
      }

      const tipo = parent_id ? 'Sub-objetivo' : 'Objetivo';
      console.log(`✅ ${tipo} estratégico adicionado com sucesso:`, data.id);

      res.status(201).json({
        success: true,
        message: `${tipo} estratégico adicionado com sucesso`,
        data
      });
    } catch (error) {
      console.error('Erro ao adicionar objetivo estratégico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar objetivo estratégico',
        error: error.message
      });
    }
  }

  /**
   * Atualizar um objetivo estratégico
   * PUT /api/planejamento-estrategico/okrs/:okrId
   */
  async atualizarOkr(req, res) {
    try {
      const { okrId } = req.params;
      const { objetivo } = req.body;

      if (!objetivo || !objetivo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O objetivo é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('planejamento_okrs')
        .update({
          objetivo: objetivo.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', okrId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar objetivo estratégico:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Objetivo estratégico não encontrado'
        });
      }

      console.log('✅ Objetivo estratégico atualizado com sucesso:', data.id);

      res.json({
        success: true,
        message: 'Objetivo estratégico atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar objetivo estratégico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar objetivo estratégico',
        error: error.message
      });
    }
  }

  /**
   * Deletar um objetivo estratégico
   * DELETE /api/planejamento-estrategico/okrs/:okrId
   */
  async deletarOkr(req, res) {
    try {
      const { okrId } = req.params;

      const { error } = await supabase
        .from('planejamento_okrs')
        .delete()
        .eq('id', okrId);

      if (error) {
        console.error('❌ Erro ao deletar objetivo estratégico:', error);
        throw error;
      }

      console.log('✅ Objetivo estratégico deletado com sucesso:', okrId);

      res.json({
        success: true,
        message: 'Objetivo estratégico deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar objetivo estratégico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar objetivo estratégico',
        error: error.message
      });
    }
  }

  /**
   * Exportar objetivos estratégicos para PDF
   * GET /api/planejamento-estrategico/:id/okrs/pdf
   */
  async exportarOkrsPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar OKRs com ordenação
      const { data: okrs, error: okrsError } = await supabase
        .from('planejamento_okrs')
        .select('*')
        .eq('planejamento_id', id)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (okrsError) throw okrsError;

      // Organizar em hierarquia: objetivos principais e sub-objetivos
      const objetivosPrincipais = (okrs || []).filter(obj => !obj.parent_id);
      const subObjetivos = (okrs || []).filter(obj => obj.parent_id);

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=objetivos-estrategicos-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 100)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 80;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 20, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Objetivos Estratégicos', 40, 30, { align: 'left' });

      // Nome do cliente e título do planejamento
      doc.fontSize(11)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(`${clientName} - ${planejamento.titulo}`, 40, 65, { align: 'left' });

      doc.y = 120;

      // Cores para os cards de objetivos
      const corPrimaria = '#003b2b';
      const corSecundaria = '#e8f5e9';
      const corBorda = '#c8e6c9';

      // Listar objetivos com hierarquia
      if (objetivosPrincipais && objetivosPrincipais.length > 0) {
        for (let i = 0; i < objetivosPrincipais.length; i++) {
          const okr = objetivosPrincipais[i];
          const subs = subObjetivos.filter(sub => sub.parent_id === okr.id);

          // Verificar se precisa de nova página
          const alturaEstimada = 50 + (subs.length * 30);
          if (doc.y + alturaEstimada > doc.page.height - 60) {
            doc.addPage();
            doc.y = 40;
          }

          // Card do objetivo principal
          const cardX = 40;
          const cardWidth = doc.page.width - 80;
          const cardY = doc.y;

          // Calcular altura do texto do objetivo (sem limite, texto completo)
          doc.fontSize(13).font('Helvetica-Bold');
          const textoAltura = doc.heightOfString(okr.objetivo, {
            width: cardWidth - 60,
            lineBreak: true
          });
          const cardHeight = Math.max(50, textoAltura + 26); // Margem extra para texto completo

          // Fundo do card principal
          doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 5)
             .fillAndStroke(corSecundaria, corPrimaria);

          // Número do objetivo (círculo)
          doc.circle(cardX + 22, cardY + 25, 14)
             .fill(corPrimaria);
          doc.fontSize(12)
             .font('Helvetica-Bold')
             .fillColor('#ffffff')
             .text(`${i + 1}`, cardX + 15, cardY + 20, { width: 14, align: 'center' });

          // Texto do objetivo (sem corte, quebra automática)
          doc.fontSize(13)
             .font('Helvetica-Bold')
             .fillColor(corPrimaria)
             .text(okr.objetivo, cardX + 45, cardY + 13, {
               width: cardWidth - 60,
               align: 'left',
               lineBreak: true
             });

          doc.y = cardY + cardHeight + 10;

          // Sub-objetivos
          if (subs.length > 0) {
            for (let j = 0; j < subs.length; j++) {
              const sub = subs[j];

              // Calcular altura do texto do sub-objetivo antes de verificar página
              doc.fontSize(11).font('Helvetica');
              const subTextoAltura = doc.heightOfString(sub.objetivo, {
                width: doc.page.width - 155,
                lineBreak: true
              });
              const subCardHeight = Math.max(35, subTextoAltura + 18); // Margem extra

              // Verificar se precisa de nova página
              if (doc.y + subCardHeight > doc.page.height - 50) {
                doc.addPage();
                doc.y = 40;
              }

              const subCardX = 60;
              const subCardWidth = doc.page.width - 100;
              const subCardY = doc.y;

              // Linha conectora
              doc.moveTo(cardX + 22, subCardY - 6)
                 .lineTo(cardX + 22, subCardY + subCardHeight / 2)
                 .lineTo(subCardX, subCardY + subCardHeight / 2)
                 .stroke(corBorda);

              // Fundo do sub-objetivo
              doc.roundedRect(subCardX, subCardY, subCardWidth, subCardHeight, 4)
                 .fillAndStroke('#ffffff', corBorda);

              // Marcador do sub-objetivo
              doc.fontSize(10)
                 .font('Helvetica-Bold')
                 .fillColor('#888888')
                 .text(`${i + 1}.${j + 1}`, subCardX + 10, subCardY + 10);

              // Texto do sub-objetivo (sem corte, quebra automática)
              doc.fontSize(11)
                 .font('Helvetica')
                 .fillColor('#333333')
                 .text(sub.objetivo, subCardX + 40, subCardY + 10, {
                   width: subCardWidth - 55,
                   align: 'left',
                   lineBreak: true
                 });

              doc.y = subCardY + subCardHeight + 6;
            }
          }

          doc.y += 15; // Espaço entre objetivos principais
        }

        // Rodapé com resumo
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.y = 40;
        }

        doc.y += 10;
        doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke('#e0e0e0');
        doc.y += 15;

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text(`Total: ${objetivosPrincipais.length} objetivo${objetivosPrincipais.length > 1 ? 's' : ''} principal${objetivosPrincipais.length > 1 ? 'is' : ''} e ${subObjetivos.length} sub-objetivo${subObjetivos.length !== 1 ? 's' : ''}`, 40, doc.y, {
             width: doc.page.width - 80,
             align: 'center'
           });

      } else {
        doc.fontSize(12)
           .font('Helvetica')
           .fillColor('#6c757d')
           .text('Nenhum objetivo cadastrado', 40, doc.y, {
             width: doc.page.width - 80,
             align: 'center'
           });
      }

      // Finalizar PDF
      doc.end();

      console.log('✅ PDF de objetivos estratégicos gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF de OKRs:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  /**
   * Exportar OKRs por Departamento para PDF
   * GET /api/planejamento-estrategico/:id/okr-departamentos/pdf
   */
  async exportarOkrDepartamentosPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar departamentos
      const { data: departamentos, error: depError } = await supabase
        .from('pe_departamentos')
        .select('*')
        .eq('planejamento_id', id)
        .order('ordem', { ascending: true });

      if (depError) throw depError;

      // Para cada departamento, buscar seus OKRs completos
      const departamentosComOkrs = await Promise.all(
        (departamentos || []).map(async (dep) => {
          const { data: objetivos, error: objError } = await supabase
            .from('okr_objetivos')
            .select(`
              *,
              key_results:okr_key_results(
                *,
                tarefas:okr_tarefas(*)
              ),
              objetivo_estrategico:planejamento_okrs!objetivo_estrategico_id(id, objetivo, parent_id)
            `)
            .eq('departamento_id', dep.id)
            .order('created_at', { ascending: true });

          if (objError) {
            console.error(`❌ Erro ao buscar objetivos do departamento ${dep.id}:`, objError);
            return { ...dep, objetivos: [] };
          }

          return {
            ...dep,
            objetivos: objetivos || []
          };
        })
      );

      // Filtrar apenas departamentos com objetivos
      const depsComObjetivos = departamentosComOkrs.filter(d => d.objetivos.length > 0);

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=okr-departamentos-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      doc.pipe(res);

      // Configurações
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Estatísticas
      const totalObjetivos = departamentosComOkrs.reduce((sum, dep) => sum + dep.objetivos.length, 0);
      const totalKRs = departamentosComOkrs.reduce((sum, dep) =>
        sum + dep.objetivos.reduce((ksum, obj) => ksum + (obj.key_results?.length || 0), 0), 0);

      // Função para adicionar header
      const addPageHeader = () => {
        // Header verde
        doc.rect(0, 0, pageWidth, 70).fill('#003b2b');

        doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff')
           .text('OKRs por Departamento', margin, 20);

        doc.fontSize(11).font('Helvetica').fillColor('#a5d6a7')
           .text(`${clientName} - ${planejamento.titulo}`, margin, 45);

        doc.fontSize(9).font('Helvetica').fillColor('#ffffff')
           .text(new Date().toLocaleDateString('pt-BR'), pageWidth - margin - 80, 28, { width: 80, align: 'right' });

        doc.y = 85;
      };

      // Função para verificar nova página
      const checkNewPage = (neededSpace) => {
        if (doc.y > pageHeight - neededSpace - 40) {
          doc.addPage();
          addPageHeader();
          return true;
        }
        return false;
      };

      // ==================== CONTEÚDO ====================
      addPageHeader();

      // Resumo em cards
      const cardWidth = (contentWidth - 20) / 3;
      const cardY = doc.y;

      // Card Departamentos
      doc.roundedRect(margin, cardY, cardWidth, 45, 5).fill('#f0f9f4');
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003b2b')
         .text(depsComObjetivos.length.toString(), margin, cardY + 8, { width: cardWidth, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
         .text('Departamentos', margin, cardY + 30, { width: cardWidth, align: 'center' });

      // Card Objetivos
      doc.roundedRect(margin + cardWidth + 10, cardY, cardWidth, 45, 5).fill('#f0f9f4');
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003b2b')
         .text(totalObjetivos.toString(), margin + cardWidth + 10, cardY + 8, { width: cardWidth, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
         .text('Objetivos', margin + cardWidth + 10, cardY + 30, { width: cardWidth, align: 'center' });

      // Card KRs
      doc.roundedRect(margin + (cardWidth + 10) * 2, cardY, cardWidth, 45, 5).fill('#f0f9f4');
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003b2b')
         .text(totalKRs.toString(), margin + (cardWidth + 10) * 2, cardY + 8, { width: cardWidth, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
         .text('Key Results', margin + (cardWidth + 10) * 2, cardY + 30, { width: cardWidth, align: 'center' });

      doc.y = cardY + 60;

      // Departamentos
      for (let depIndex = 0; depIndex < depsComObjetivos.length; depIndex++) {
        const dep = depsComObjetivos[depIndex];

        checkNewPage(100);

        // Header do departamento
        const depHeaderY = doc.y;
        doc.roundedRect(margin, depHeaderY, contentWidth, 35, 5).fill('#003b2b');
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#ffffff')
           .text(dep.nome_departamento, margin + 15, depHeaderY + 10);

        const numKRs = dep.objetivos.reduce((sum, obj) => sum + (obj.key_results?.length || 0), 0);
        doc.fontSize(9).font('Helvetica').fillColor('#a5d6a7')
           .text(`${dep.objetivos.length} objetivos • ${numKRs} KRs`, pageWidth - margin - 120, depHeaderY + 13, { width: 105, align: 'right' });

        doc.y = depHeaderY + 45;

        // Objetivos do departamento
        for (let objIndex = 0; objIndex < dep.objetivos.length; objIndex++) {
          const objetivo = dep.objetivos[objIndex];

          checkNewPage(80);

          // Card do Objetivo
          const objY = doc.y;
          const objTitleHeight = doc.heightOfString(objetivo.titulo, { width: contentWidth - 70, font: 'Helvetica-Bold', fontSize: 11 });
          let objCardHeight = 35 + objTitleHeight;

          // Calcular altura para KRs
          if (objetivo.key_results && objetivo.key_results.length > 0) {
            objetivo.key_results.forEach(kr => {
              objCardHeight += 25;
              if (kr.tarefas && kr.tarefas.length > 0) {
                objCardHeight += kr.tarefas.length * 18;
              }
            });
          }

          // Vínculo
          if (objetivo.objetivo_estrategico) {
            objCardHeight += 15;
          }

          // Fundo do card
          doc.roundedRect(margin, objY, contentWidth, Math.min(objCardHeight, 300), 5)
             .fillAndStroke('#fafafa', '#e8e8e8');

          // Badge O1, O2...
          doc.roundedRect(margin + 10, objY + 10, 30, 20, 3).fill('#003b2b');
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
             .text(`O${objIndex + 1}`, margin + 10, objY + 14, { width: 30, align: 'center' });

          // Título do objetivo
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a')
             .text(objetivo.titulo, margin + 50, objY + 14, { width: contentWidth - 70 });

          let currentY = objY + 20 + objTitleHeight;

          // Vínculo com objetivo estratégico
          if (objetivo.objetivo_estrategico) {
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888888')
               .text(`↳ Vinculado a: ${objetivo.objetivo_estrategico.objetivo}`, margin + 50, currentY, { width: contentWidth - 70 });
            currentY += 15;
          }

          // Key Results
          if (objetivo.key_results && objetivo.key_results.length > 0) {
            for (let krIndex = 0; krIndex < objetivo.key_results.length; krIndex++) {
              const kr = objetivo.key_results[krIndex];

              // Status badge
              let statusText = 'Pendente';
              let statusBg = '#9e9e9e';
              if (kr.status === 'concluido') {
                statusText = 'Concluído';
                statusBg = '#4caf50';
              } else if (kr.status === 'em_progresso') {
                statusText = 'Em Progresso';
                statusBg = '#ff9800';
              } else if (kr.status === 'cancelado') {
                statusText = 'Cancelado';
                statusBg = '#f44336';
              }

              // KR line
              doc.fontSize(9).font('Helvetica-Bold').fillColor('#003b2b')
                 .text(`KR${krIndex + 1}`, margin + 20, currentY + 5);

              doc.fontSize(9).font('Helvetica').fillColor('#333333')
                 .text(kr.titulo, margin + 50, currentY + 5, { width: contentWidth - 150 });

              // Status badge
              const badgeWidth = doc.widthOfString(statusText, { font: 'Helvetica', fontSize: 7 }) + 10;
              doc.roundedRect(pageWidth - margin - badgeWidth - 15, currentY + 4, badgeWidth, 14, 3).fill(statusBg);
              doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff')
                 .text(statusText, pageWidth - margin - badgeWidth - 15, currentY + 7, { width: badgeWidth, align: 'center' });

              currentY += 22;

              // Tarefas
              if (kr.tarefas && kr.tarefas.length > 0) {
                for (const tarefa of kr.tarefas) {
                  const checkColor = tarefa.concluida ? '#4caf50' : '#bdbdbd';
                  const textColor = tarefa.concluida ? '#888888' : '#555555';

                  // Checkbox
                  doc.roundedRect(margin + 50, currentY + 2, 10, 10, 2).fillAndStroke(tarefa.concluida ? '#4caf50' : '#ffffff', checkColor);
                  if (tarefa.concluida) {
                    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
                       .text('✓', margin + 51, currentY + 2);
                  }

                  let tarefaText = tarefa.titulo;
                  if (tarefa.responsavel) {
                    tarefaText += ` (${tarefa.responsavel})`;
                  }

                  doc.fontSize(8).font('Helvetica').fillColor(textColor)
                     .text(tarefaText, margin + 65, currentY + 3, { width: contentWidth - 100 });

                  currentY += 16;
                }
              }
            }
          }

          doc.y = objY + Math.min(objCardHeight, 300) + 10;
        }

        doc.y += 10;
      }

      doc.end();

      console.log('✅ PDF de OKRs por Departamento gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF de OKRs por Departamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  // ===== ÁRVORE DE PROBLEMAS =====

  /**
   * Listar todas as árvores de um planejamento
   * GET /api/planejamento-estrategico/:id/arvores
   */
  async listarArvores(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('planejamento_arvores')
        .select('*')
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar árvores:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} árvores encontradas`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar árvores:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar árvores',
        error: error.message
      });
    }
  }

  /**
   * Criar nova árvore de problemas
   * POST /api/planejamento-estrategico/:id/arvores
   */
  async criarArvore(req, res) {
    try {
      const { id } = req.params;
      const { nome_arvore } = req.body;

      if (!nome_arvore || !nome_arvore.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O nome da árvore é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('planejamento_arvores')
        .insert({
          planejamento_id: id,
          nome_arvore: nome_arvore.trim()
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao criar árvore:', error);
        throw error;
      }

      console.log('✅ Árvore criada:', data.id);

      res.status(201).json({
        success: true,
        message: 'Árvore criada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao criar árvore:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar árvore',
        error: error.message
      });
    }
  }

  /**
   * Criar árvores padrão (Cliente, Pessoas, Regulamentação, Financeiro)
   * POST /api/planejamento-estrategico/:id/arvores/criar-padrao
   */
  async criarArvoresPadrao(req, res) {
    try {
      const { id } = req.params;

      // Definição das árvores padrão com seus tópicos
      const arvoresPadrao = [
        {
          nome_arvore: "Cliente",
          topicos: [
            { topico: "Confiabilidade", pergunta_norteadora: "A marca é bem reconhecida e referendada no mercado? Boa avaliação no GOOGLE? reclame aqui? Procon?" },
            { topico: "Transparência", pergunta_norteadora: "Canais de comunicação com o cliente status obra? periodicidade? app? medições transparentes? comunicação?" },
            { topico: "Preço justo", pergunta_norteadora: "Custo benefício?" },
            { topico: "Jornada do cliente", pergunta_norteadora: "Conhecimento? reconhecimento? Consideração? decisão de compra? pós-vendas?" },
            { topico: "Qualidade do produto", pergunta_norteadora: "público-alvo bem definido? alinhamento expectativas? qualidade?" }
          ]
        },
        {
          nome_arvore: "Pessoas",
          topicos: [
            { topico: "Remuneração justa", pergunta_norteadora: "Há planos de cargos e salários? benefícios atrativos?" },
            { topico: "Ambiente positivo", pergunta_norteadora: "pesquisa de satisfação colaborador? bom relacionamento? Processos mapeados? Diretrizes claras?" },
            { topico: "Oportunidade de crescimento", pergunta_norteadora: "Custo benefício? metas claras? treinamentos?" },
            { topico: "Reconhecimento", pergunta_norteadora: "Feedbacks? eventos de premiação? sentimento de união?" },
            { topico: "Infraestrutura", pergunta_norteadora: "infra estrutura física (ambiente limpo e confortável, flexibilidade)? Infra estrutura digital (bons computadores, redes de sistema, bom software)?" }
          ]
        },
        {
          nome_arvore: "Regulamentação",
          topicos: [
            { topico: "Normas ambientais", pergunta_norteadora: "Processo de licenciamento ambiental? ISO 14001 (práticas sustentáveis)? LEED (construção sustentável)? fontes renovaveis de energia? sistema captação água?" },
            { topico: "Segurança do trabalho", pergunta_norteadora: "Equipamentos boa qualidade? auditorias e inspeção obra?" },
            { topico: "Sistema de qualidade", pergunta_norteadora: "ABNT, NBR 15575? NBR 9050?" },
            { topico: "Contabilidade", pergunta_norteadora: "registro colaboradores? aputação impostos? obrigações acesórias? registros contábeis?" },
            { topico: "Compliance", pergunta_norteadora: "Avaliação de riscos? controles internos? canais de denúncia? due dilligence? LGPD? ESG?" },
            { topico: "Certificações", pergunta_norteadora: "ISO 9001? PBQP-H? GREAT PLACE TO WORK?" }
          ]
        },
        {
          nome_arvore: "Financeiro",
          topicos: [
            { topico: "Caixa", pergunta_norteadora: "Fluxo de caixa estruturado? caixa líquido gerado pela operação positivo?" },
            { topico: "Lucratividade", pergunta_norteadora: "Equilíbrio entre receita x custos x despesas? Registros e alocações?" },
            { topico: "Endividamento", pergunta_norteadora: "Alta dependência de capital de terceiros?" },
            { topico: "Remuneração aos Sócios", pergunta_norteadora: "Remuneração satisfatória? Pró-labore? Distribuição de lucros?" },
            { topico: "Inadimplência", pergunta_norteadora: "Inadimplência clientes alta?" },
            { topico: "Outras fontes de receita", pergunta_norteadora: "Fontes de receita alternativa?" },
            { topico: "KPIS", pergunta_norteadora: "KPIs definidos, medidos e monitorados?" }
          ]
        }
      ];

      const arvoresCriadas = [];

      // Criar cada árvore com seus tópicos
      for (const arvorePadrao of arvoresPadrao) {
        // Criar a árvore
        const { data: arvore, error: arvoreError } = await supabase
          .from('planejamento_arvores')
          .insert({
            planejamento_id: id,
            nome_arvore: arvorePadrao.nome_arvore
          })
          .select()
          .single();

        if (arvoreError) {
          console.error('❌ Erro ao criar árvore padrão:', arvoreError);
          throw arvoreError;
        }

        console.log('✅ Árvore padrão criada:', arvore.nome_arvore);

        // Criar os tópicos da árvore
        const topicosToInsert = arvorePadrao.topicos.map(t => ({
          arvore_id: arvore.id,
          topico: t.topico,
          pergunta_norteadora: t.pergunta_norteadora
        }));

        const { error: topicosError } = await supabase
          .from('planejamento_arvore_problemas')
          .insert(topicosToInsert);

        if (topicosError) {
          console.error('❌ Erro ao criar tópicos da árvore padrão:', topicosError);
          throw topicosError;
        }

        console.log(`✅ ${topicosToInsert.length} tópicos criados para ${arvore.nome_arvore}`);
        arvoresCriadas.push(arvore);
      }

      res.status(201).json({
        success: true,
        message: `${arvoresCriadas.length} árvores padrão criadas com sucesso`,
        data: arvoresCriadas
      });
    } catch (error) {
      console.error('Erro ao criar árvores padrão:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar árvores padrão',
        error: error.message
      });
    }
  }

  /**
   * Atualizar nome de uma árvore
   * PUT /api/planejamento-estrategico/arvores/:arvoreId
   */
  async atualizarArvore(req, res) {
    try {
      const { arvoreId } = req.params;
      const { nome_arvore } = req.body;

      if (!nome_arvore || !nome_arvore.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O nome da árvore é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('planejamento_arvores')
        .update({
          nome_arvore: nome_arvore.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', arvoreId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar árvore:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Árvore não encontrada'
        });
      }

      console.log('✅ Árvore atualizada:', data.id);

      res.json({
        success: true,
        message: 'Árvore atualizada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar árvore:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar árvore',
        error: error.message
      });
    }
  }

  /**
   * Deletar uma árvore e todos seus itens
   * DELETE /api/planejamento-estrategico/arvores/:arvoreId
   */
  async deletarArvore(req, res) {
    try {
      const { arvoreId } = req.params;

      const { error } = await supabase
        .from('planejamento_arvores')
        .delete()
        .eq('id', arvoreId);

      if (error) {
        console.error('❌ Erro ao deletar árvore:', error);
        throw error;
      }

      console.log('✅ Árvore deletada:', arvoreId);

      res.json({
        success: true,
        message: 'Árvore deletada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar árvore:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar árvore',
        error: error.message
      });
    }
  }

  /**
   * Obter árvores de problemas via token público (para visualização pública)
   * GET /api/planejamento-estrategico/publico/arvores/:token
   */
  async obterArvoresPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            id,
            email,
            clients_pf(cpf, full_name),
            clients_pj(cnpj, company_name, trade_name)
          ),
          contract:contracts(
            id,
            contract_number
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar árvores
      const { data: arvores, error: arvoresError } = await supabase
        .from('planejamento_arvores')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .order('created_at', { ascending: true });

      if (arvoresError) throw arvoresError;

      // Buscar itens de cada árvore
      const arvoresComItens = [];
      for (const arvore of arvores || []) {
        const { data: itens, error: itensError } = await supabase
          .from('planejamento_arvore_problemas')
          .select('*')
          .eq('arvore_id', arvore.id)
          .order('created_at', { ascending: true });

        if (itensError) throw itensError;

        arvoresComItens.push({
          ...arvore,
          itens: itens || []
        });
      }

      console.log(`✅ Árvores públicas obtidas - Planejamento: ${planejamento.id}`);

      res.json({
        success: true,
        data: {
          planejamento,
          arvores: arvoresComItens
        }
      });
    } catch (error) {
      console.error('Erro ao obter árvores públicas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter árvores',
        error: error.message
      });
    }
  }

  /**
   * Salvar itens de uma árvore via token público
   * PUT /api/planejamento-estrategico/publico/arvores/:token/itens
   */
  async salvarItensArvorePublico(req, res) {
    try {
      const { token } = req.params;
      const { arvores } = req.body;

      if (!arvores || !Array.isArray(arvores)) {
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos'
        });
      }

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select('id')
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Processar cada árvore
      for (const arvore of arvores) {
        // Se a árvore tem um ID, verificar se pertence ao planejamento
        if (arvore.id) {
          const { data: arvoreExistente } = await supabase
            .from('planejamento_arvores')
            .select('id')
            .eq('id', arvore.id)
            .eq('planejamento_id', planejamento.id)
            .single();

          if (!arvoreExistente) {
            return res.status(403).json({
              success: false,
              message: 'Acesso negado a esta árvore'
            });
          }

          // Deletar todos os itens existentes desta árvore
          await supabase
            .from('planejamento_arvore_problemas')
            .delete()
            .eq('arvore_id', arvore.id);

          // Inserir novos itens
          if (arvore.itens && arvore.itens.length > 0) {
            const itensToInsert = arvore.itens.map(item => {
              const gravidade = item.gravidade ? parseFloat(String(item.gravidade).replace(',', '.')) : null;
              const urgencia = item.urgencia ? parseFloat(String(item.urgencia).replace(',', '.')) : null;
              const tendencia = item.tendencia ? parseFloat(String(item.tendencia).replace(',', '.')) : null;

              let nota = null;
              if (gravidade && urgencia && tendencia) {
                nota = gravidade * urgencia * tendencia;
              }

              return {
                arvore_id: arvore.id,
                topico: item.topico,
                pergunta_norteadora: item.pergunta_norteadora || null,
                gravidade,
                urgencia,
                tendencia,
                nota
              };
            });

            const { error: insertError } = await supabase
              .from('planejamento_arvore_problemas')
              .insert(itensToInsert);

            if (insertError) throw insertError;
          }
        } else {
          // Criar nova árvore
          const { data: novaArvore, error: arvoreError } = await supabase
            .from('planejamento_arvores')
            .insert({
              planejamento_id: planejamento.id,
              nome_arvore: arvore.nome_arvore
            })
            .select()
            .single();

          if (arvoreError) throw arvoreError;

          // Inserir itens da nova árvore
          if (arvore.itens && arvore.itens.length > 0) {
            const itensToInsert = arvore.itens.map(item => {
              const gravidade = item.gravidade ? parseFloat(String(item.gravidade).replace(',', '.')) : null;
              const urgencia = item.urgencia ? parseFloat(String(item.urgencia).replace(',', '.')) : null;
              const tendencia = item.tendencia ? parseFloat(String(item.tendencia).replace(',', '.')) : null;

              let nota = null;
              if (gravidade && urgencia && tendencia) {
                nota = gravidade * urgencia * tendencia;
              }

              return {
                arvore_id: novaArvore.id,
                topico: item.topico,
                pergunta_norteadora: item.pergunta_norteadora || null,
                gravidade,
                urgencia,
                tendencia,
                nota
              };
            });

            const { error: insertError } = await supabase
              .from('planejamento_arvore_problemas')
              .insert(itensToInsert);

            if (insertError) throw insertError;
          }
        }
      }

      console.log('✅ Árvores salvas via acesso público');

      res.json({
        success: true,
        message: 'Árvores salvas com sucesso'
      });
    } catch (error) {
      console.error('Erro ao salvar árvores:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar árvores',
        error: error.message
      });
    }
  }

  /**
   * Listar itens de uma árvore específica
   * GET /api/planejamento-estrategico/arvores/:arvoreId/itens
   */
  async listarItensArvore(req, res) {
    try {
      const { arvoreId } = req.params;

      const { data, error } = await supabase
        .from('planejamento_arvore_problemas')
        .select('*')
        .eq('arvore_id', arvoreId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar itens:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} itens encontrados`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar itens:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar itens',
        error: error.message
      });
    }
  }

  /**
   * Adicionar item à árvore de problemas
   * POST /api/planejamento-estrategico/arvores/:arvoreId/itens
   */
  async adicionarItemArvore(req, res) {
    try {
      const { arvoreId } = req.params;
      const { topico, pergunta_norteadora, gravidade, urgencia, tendencia } = req.body;

      if (!topico || !topico.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O tópico é obrigatório'
        });
      }

      // Calcular nota automaticamente
      let nota = null;
      if (gravidade && urgencia && tendencia) {
        nota = gravidade * urgencia * tendencia;
      }

      const { data, error } = await supabase
        .from('planejamento_arvore_problemas')
        .insert({
          arvore_id: arvoreId,
          topico: topico.trim(),
          pergunta_norteadora: pergunta_norteadora ? pergunta_norteadora.trim() : null,
          gravidade: gravidade || null,
          urgencia: urgencia || null,
          tendencia: tendencia || null,
          nota: nota
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao adicionar item à árvore:', error);
        throw error;
      }

      console.log('✅ Item adicionado à árvore de problemas:', data.id);

      res.status(201).json({
        success: true,
        message: 'Item adicionado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao adicionar item:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar item',
        error: error.message
      });
    }
  }

  /**
   * Atualizar item da árvore de problemas
   * PUT /api/planejamento-estrategico/arvore-problemas/:itemId
   */
  async atualizarItemArvore(req, res) {
    try {
      const { itemId } = req.params;
      const { topico, pergunta_norteadora, gravidade, urgencia, tendencia } = req.body;

      if (!topico || !topico.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O tópico é obrigatório'
        });
      }

      // Calcular nota automaticamente
      let nota = null;
      if (gravidade && urgencia && tendencia) {
        nota = gravidade * urgencia * tendencia;
      }

      const { data, error } = await supabase
        .from('planejamento_arvore_problemas')
        .update({
          topico: topico.trim(),
          pergunta_norteadora: pergunta_norteadora ? pergunta_norteadora.trim() : null,
          gravidade: gravidade || null,
          urgencia: urgencia || null,
          tendencia: tendencia || null,
          nota: nota,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar item:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Item não encontrado'
        });
      }

      console.log('✅ Item atualizado:', data.id);

      res.json({
        success: true,
        message: 'Item atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar item',
        error: error.message
      });
    }
  }

  /**
   * Deletar item da árvore de problemas
   * DELETE /api/planejamento-estrategico/arvore-problemas/:itemId
   */
  async deletarItemArvore(req, res) {
    try {
      const { itemId } = req.params;

      const { error } = await supabase
        .from('planejamento_arvore_problemas')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('❌ Erro ao deletar item:', error);
        throw error;
      }

      console.log('✅ Item deletado:', itemId);

      res.json({
        success: true,
        message: 'Item deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar item:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar item',
        error: error.message
      });
    }
  }

  /**
   * Exportar árvores de problemas para PDF
   * GET /api/planejamento-estrategico/:id/arvores/pdf
   */
  async exportarArvoresPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planError) throw planError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar árvores
      const { data: arvores, error: arvoresError } = await supabase
        .from('planejamento_arvores')
        .select('*')
        .eq('planejamento_id', id)
        .order('created_at', { ascending: true });

      if (arvoresError) throw arvoresError;

      // Buscar itens de todas as árvores
      const arvoresComItens = [];
      for (const arvore of arvores || []) {
        const { data: itens } = await supabase
          .from('planejamento_arvore_problemas')
          .select('*')
          .eq('arvore_id', arvore.id)
          .order('created_at', { ascending: true });

        arvoresComItens.push({
          ...arvore,
          itens: itens || []
        });
      }

      // Criar documento PDF (sem restrições de tamanho)
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=arvore-problemas-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 30, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Árvore de Problemas', 40, 45, { align: 'left' });

      // Nome do cliente
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(clientName, 40, 85, { align: 'left' });

      doc.y = 140;

      // Para cada árvore, criar uma tabela
      for (let i = 0; i < arvoresComItens.length; i++) {
        const arvore = arvoresComItens[i];

        // Adicionar nova página para cada árvore (exceto a primeira)
        if (i > 0) {
          doc.addPage();
          doc.y = 40; // Resetar Y para o topo da nova página
        }

        // Título da árvore
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#003b2b')
           .text(arvore.nome_arvore, 40, doc.y);

        doc.y += 25;

        if (arvore.itens.length === 0) {
          doc.fontSize(10)
             .font('Helvetica')
             .fillColor('#6c757d')
             .text('Nenhum item cadastrado', 40, doc.y);
          doc.y += 30;
          continue;
        }

        // Configuração da tabela
        const startX = 40;
        const startY = doc.y;
        const tableWidth = doc.page.width - 80;

        const colWidths = {
          topico: tableWidth * 0.25,
          pergunta: tableWidth * 0.35,
          gravidade: tableWidth * 0.10,
          urgencia: tableWidth * 0.10,
          tendencia: tableWidth * 0.10,
          nota: tableWidth * 0.10
        };

        // Header da tabela
        const headerHeight = 30;
        let currentX = startX;

        // Background do header
        doc.rect(startX, startY, tableWidth, headerHeight)
           .fill('#003b2b');

        // Texto do header
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#ffffff');

        currentX = startX;
        doc.text('Tópico', currentX + 5, startY + 10, { width: colWidths.topico - 10, align: 'left' });
        currentX += colWidths.topico;
        doc.text('Pergunta Norteadora', currentX + 5, startY + 10, { width: colWidths.pergunta - 10, align: 'left' });
        currentX += colWidths.pergunta;
        doc.text('Grav.', currentX + 5, startY + 10, { width: colWidths.gravidade - 10, align: 'center' });
        currentX += colWidths.gravidade;
        doc.text('Urg.', currentX + 5, startY + 10, { width: colWidths.urgencia - 10, align: 'center' });
        currentX += colWidths.urgencia;
        doc.text('Tend.', currentX + 5, startY + 10, { width: colWidths.tendencia - 10, align: 'center' });
        currentX += colWidths.tendencia;
        doc.text('Nota', currentX + 5, startY + 10, { width: colWidths.nota - 10, align: 'center' });

        let currentY = startY + headerHeight;

        // Linhas da tabela
        for (const item of arvore.itens) {
          const rowHeight = 25;

          // Background alternado
          const bgColor = arvore.itens.indexOf(item) % 2 === 0 ? '#f8f9fa' : '#ffffff';
          doc.rect(startX, currentY, tableWidth, rowHeight).fill(bgColor);

          // Texto das células
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#2d3748');

          currentX = startX;
          doc.text(item.topico || '-', currentX + 5, currentY + 8, { width: colWidths.topico - 10, align: 'left' });
          currentX += colWidths.topico;
          doc.text(item.pergunta_norteadora || '-', currentX + 5, currentY + 8, { width: colWidths.pergunta - 10, align: 'left' });
          currentX += colWidths.pergunta;

          const formatNum = (val) => val ? String(val).replace('.', ',') : '-';

          doc.text(formatNum(item.gravidade), currentX + 5, currentY + 8, { width: colWidths.gravidade - 10, align: 'center' });
          currentX += colWidths.gravidade;
          doc.text(formatNum(item.urgencia), currentX + 5, currentY + 8, { width: colWidths.urgencia - 10, align: 'center' });
          currentX += colWidths.urgencia;
          doc.text(formatNum(item.tendencia), currentX + 5, currentY + 8, { width: colWidths.tendencia - 10, align: 'center' });
          currentX += colWidths.tendencia;

          // Nota em amarelo se > 20
          if (item.nota && item.nota > 20) {
            doc.fillColor('#f59e0b').font('Helvetica-Bold');
          }
          doc.text(formatNum(item.nota), currentX + 5, currentY + 8, { width: colWidths.nota - 10, align: 'center' });
          doc.fillColor('#2d3748').font('Helvetica');

          currentY += rowHeight;
        }

        doc.y = currentY + 30;
      }

      // ===== PILARES DE DOR =====
      // Coletar todos os itens com nota > 20 de todas as árvores
      const pilaresDeDor = [];
      for (const arvore of arvoresComItens) {
        for (const item of arvore.itens) {
          if (item.nota && item.nota > 20) {
            pilaresDeDor.push({
              ...item,
              arvore_nome: arvore.nome_arvore
            });
          }
        }
      }

      // Ordenar por nota decrescente
      pilaresDeDor.sort((a, b) => (b.nota || 0) - (a.nota || 0));

      // Se houver pilares de dor, adicionar seção
      if (pilaresDeDor.length > 0) {
        // Adicionar nova página para os pilares de dor
        doc.addPage();
        doc.y = 40;

        // Título da seção
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .fillColor('#18723c')
           .text('Pilares de Dor', 40, doc.y);

        doc.y += 15;

        // Subtítulo
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#4a5568')
           .text('Principais desafios organizacionais que requerem atenção prioritária.', 40, doc.y, {
             width: doc.page.width - 80,
             align: 'left'
           });

        doc.y += 25;

        // Renderizar cada pilar de dor
        for (const pilar of pilaresDeDor) {
          // Verificar se há espaço na página (altura mínima de 80)
          if (doc.y > doc.page.height - 120) {
            doc.addPage();
            doc.y = 40;
          }

          const cardHeight = 70;
          const cardWidth = doc.page.width - 80;
          const cardX = 40;
          const cardY = doc.y;

          // Desenhar card do pilar
          doc.rect(cardX, cardY, cardWidth, cardHeight)
             .fill('#ffffff');

          // Borda esquerda verde
          doc.rect(cardX, cardY, 5, cardHeight)
             .fill('#18723c');

          // Header do card (nome da árvore e nota)
          doc.fontSize(8)
             .font('Helvetica-Bold')
             .fillColor('#2d3748')
             .text(pilar.arvore_nome.toUpperCase(), cardX + 15, cardY + 10, {
               width: cardWidth - 80,
               align: 'left'
             });

          // Nota em destaque
          const formatNum = (val) => val ? String(val).replace('.', ',') : '-';
          doc.fontSize(14)
             .font('Helvetica-Bold')
             .fillColor('#18723c')
             .text(formatNum(pilar.nota), cardX + cardWidth - 50, cardY + 8, {
               width: 40,
               align: 'right'
             });

          // Tópico
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#1a202c')
             .text(pilar.topico || 'N/A', cardX + 15, cardY + 25, {
               width: cardWidth - 30,
               align: 'left'
             });

          // Pergunta norteadora (se houver)
          if (pilar.pergunta_norteadora) {
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#4a5568')
               .text(pilar.pergunta_norteadora, cardX + 15, cardY + 42, {
                 width: cardWidth - 30,
                 align: 'left',
                 height: 20,
                 ellipsis: true
               });
          }

          doc.y = cardY + cardHeight + 15;
        }
      }

      // Finalizar PDF
      doc.end();

      console.log('✅ PDF de árvores gerado com sucesso');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  // =====================================================
  // OKR - OBJECTIVES AND KEY RESULTS
  // =====================================================

  // --- OBJETIVOS ---

  /**
   * Listar todos os objetivos OKR de um departamento
   * GET /api/planejamento-estrategico/departamentos/:departamentoId/okr-objetivos
   */
  async listarOkrObjetivos(req, res) {
    try {
      const { departamentoId } = req.params;

      const { data, error } = await supabase
        .from('okr_objetivos')
        .select(`
          *,
          key_results:okr_key_results(
            *,
            tarefas:okr_tarefas(*)
          ),
          objetivo_estrategico:planejamento_okrs!objetivo_estrategico_id(id, objetivo, parent_id)
        `)
        .eq('departamento_id', departamentoId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar objetivos OKR:', error);
        throw error;
      }

      console.log(`✅ ${(data || []).length} objetivos OKR encontrados para departamento ${departamentoId}`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar objetivos OKR:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar objetivos OKR',
        error: error.message
      });
    }
  }

  /**
   * Criar novo objetivo OKR
   * POST /api/planejamento-estrategico/departamentos/:departamentoId/okr-objetivos
   * Body: { titulo: string, descricao?: string, objetivo_estrategico_id?: number }
   */
  async criarOkrObjetivo(req, res) {
    try {
      const { departamentoId } = req.params;
      const { titulo, descricao, objetivo_estrategico_id } = req.body;

      if (!titulo || !titulo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O título do objetivo é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('okr_objetivos')
        .insert({
          departamento_id: departamentoId,
          titulo: titulo.trim(),
          descricao: descricao?.trim() || null,
          objetivo_estrategico_id: objetivo_estrategico_id || null
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao criar objetivo OKR:', error);
        throw error;
      }

      console.log('✅ Objetivo OKR criado com sucesso:', data.id);

      res.status(201).json({
        success: true,
        message: 'Objetivo criado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao criar objetivo OKR:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar objetivo OKR',
        error: error.message
      });
    }
  }

  /**
   * Atualizar objetivo OKR
   * PUT /api/planejamento-estrategico/okr-objetivos/:objetivoId
   * Body: { titulo?: string, descricao?: string, objetivo_estrategico_id?: number | null }
   */
  async atualizarOkrObjetivo(req, res) {
    try {
      const { objetivoId } = req.params;
      const { titulo, descricao, objetivo_estrategico_id } = req.body;

      const updateData = {};
      if (titulo !== undefined) updateData.titulo = titulo.trim();
      if (descricao !== undefined) updateData.descricao = descricao?.trim() || null;
      if (objetivo_estrategico_id !== undefined) updateData.objetivo_estrategico_id = objetivo_estrategico_id || null;

      const { data, error } = await supabase
        .from('okr_objetivos')
        .update(updateData)
        .eq('id', objetivoId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar objetivo OKR:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Objetivo não encontrado'
        });
      }

      console.log('✅ Objetivo OKR atualizado com sucesso:', data.id);

      res.json({
        success: true,
        message: 'Objetivo atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar objetivo OKR:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar objetivo OKR',
        error: error.message
      });
    }
  }

  /**
   * Deletar objetivo OKR
   * DELETE /api/planejamento-estrategico/okr-objetivos/:objetivoId
   */
  async deletarOkrObjetivo(req, res) {
    try {
      const { objetivoId } = req.params;

      const { error } = await supabase
        .from('okr_objetivos')
        .delete()
        .eq('id', objetivoId);

      if (error) {
        console.error('❌ Erro ao deletar objetivo OKR:', error);
        throw error;
      }

      console.log('✅ Objetivo OKR deletado com sucesso:', objetivoId);

      res.json({
        success: true,
        message: 'Objetivo deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar objetivo OKR:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar objetivo OKR',
        error: error.message
      });
    }
  }

  // --- KEY RESULTS ---

  /**
   * Listar Key Results de um objetivo
   * GET /api/planejamento-estrategico/okr-objetivos/:objetivoId/key-results
   */
  async listarKeyResults(req, res) {
    try {
      const { objetivoId } = req.params;

      const { data, error } = await supabase
        .from('okr_key_results')
        .select(`
          *,
          tarefas:okr_tarefas(*)
        `)
        .eq('objetivo_id', objetivoId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar Key Results:', error);
        throw error;
      }

      console.log(`✅ ${(data || []).length} Key Results encontrados para objetivo ${objetivoId}`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar Key Results:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar Key Results',
        error: error.message
      });
    }
  }

  /**
   * Criar novo Key Result
   * POST /api/planejamento-estrategico/okr-objetivos/:objetivoId/key-results
   */
  async criarKeyResult(req, res) {
    try {
      const { objetivoId } = req.params;
      const { titulo, descricao, status } = req.body;

      if (!titulo || !titulo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O título do Key Result é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('okr_key_results')
        .insert({
          objetivo_id: objetivoId,
          titulo: titulo.trim(),
          descricao: descricao?.trim() || null,
          status: status || 'pendente'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao criar Key Result:', error);
        throw error;
      }

      console.log('✅ Key Result criado com sucesso:', data.id);

      res.status(201).json({
        success: true,
        message: 'Key Result criado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao criar Key Result:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar Key Result',
        error: error.message
      });
    }
  }

  /**
   * Atualizar Key Result
   * PUT /api/planejamento-estrategico/key-results/:keyResultId
   */
  async atualizarKeyResult(req, res) {
    try {
      const { keyResultId } = req.params;
      const { titulo, descricao, status } = req.body;

      const updateData = {};
      if (titulo !== undefined) updateData.titulo = titulo.trim();
      if (descricao !== undefined) updateData.descricao = descricao?.trim() || null;
      if (status !== undefined) updateData.status = status;

      const { data, error } = await supabase
        .from('okr_key_results')
        .update(updateData)
        .eq('id', keyResultId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar Key Result:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Key Result não encontrado'
        });
      }

      console.log('✅ Key Result atualizado com sucesso:', data.id);

      res.json({
        success: true,
        message: 'Key Result atualizado com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar Key Result:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar Key Result',
        error: error.message
      });
    }
  }

  /**
   * Deletar Key Result
   * DELETE /api/planejamento-estrategico/key-results/:keyResultId
   */
  async deletarKeyResult(req, res) {
    try {
      const { keyResultId } = req.params;

      const { error } = await supabase
        .from('okr_key_results')
        .delete()
        .eq('id', keyResultId);

      if (error) {
        console.error('❌ Erro ao deletar Key Result:', error);
        throw error;
      }

      console.log('✅ Key Result deletado com sucesso:', keyResultId);

      res.json({
        success: true,
        message: 'Key Result deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar Key Result:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar Key Result',
        error: error.message
      });
    }
  }

  // --- TAREFAS ---

  /**
   * Listar tarefas de um Key Result
   * GET /api/planejamento-estrategico/key-results/:keyResultId/tarefas
   */
  async listarTarefas(req, res) {
    try {
      const { keyResultId } = req.params;

      const { data, error } = await supabase
        .from('okr_tarefas')
        .select('*')
        .eq('key_result_id', keyResultId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erro ao listar tarefas:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} tarefas encontradas para KR ${keyResultId}`);

      res.json({
        success: true,
        data: data || []
      });
    } catch (error) {
      console.error('Erro ao listar tarefas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar tarefas',
        error: error.message
      });
    }
  }

  /**
   * Criar nova tarefa
   * POST /api/planejamento-estrategico/key-results/:keyResultId/tarefas
   */
  async criarTarefa(req, res) {
    try {
      const { keyResultId } = req.params;
      const { titulo, descricao, data_limite, responsavel, concluida } = req.body;

      if (!titulo || !titulo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'O título da tarefa é obrigatório'
        });
      }

      const { data, error } = await supabase
        .from('okr_tarefas')
        .insert({
          key_result_id: keyResultId,
          titulo: titulo.trim(),
          descricao: descricao?.trim() || null,
          data_limite: data_limite || null,
          responsavel: responsavel?.trim() || null,
          concluida: concluida || false
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao criar tarefa:', error);
        throw error;
      }

      console.log('✅ Tarefa criada com sucesso:', data.id);

      res.status(201).json({
        success: true,
        message: 'Tarefa criada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar tarefa',
        error: error.message
      });
    }
  }

  /**
   * Atualizar tarefa
   * PUT /api/planejamento-estrategico/tarefas/:tarefaId
   */
  async atualizarTarefa(req, res) {
    try {
      const { tarefaId } = req.params;
      const { titulo, descricao, data_limite, responsavel, concluida } = req.body;

      const updateData = {};
      if (titulo !== undefined) updateData.titulo = titulo.trim();
      if (descricao !== undefined) updateData.descricao = descricao?.trim() || null;
      if (data_limite !== undefined) updateData.data_limite = data_limite || null;
      if (responsavel !== undefined) updateData.responsavel = responsavel?.trim() || null;
      if (concluida !== undefined) updateData.concluida = concluida;

      const { data, error } = await supabase
        .from('okr_tarefas')
        .update(updateData)
        .eq('id', tarefaId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar tarefa:', error);
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Tarefa não encontrada'
        });
      }

      console.log('✅ Tarefa atualizada com sucesso:', data.id);

      res.json({
        success: true,
        message: 'Tarefa atualizada com sucesso',
        data
      });
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar tarefa',
        error: error.message
      });
    }
  }

  /**
   * Deletar tarefa
   * DELETE /api/planejamento-estrategico/tarefas/:tarefaId
   */
  async deletarTarefa(req, res) {
    try {
      const { tarefaId } = req.params;

      const { error } = await supabase
        .from('okr_tarefas')
        .delete()
        .eq('id', tarefaId);

      if (error) {
        console.error('❌ Erro ao deletar tarefa:', error);
        throw error;
      }

      console.log('✅ Tarefa deletada com sucesso:', tarefaId);

      res.json({
        success: true,
        message: 'Tarefa deletada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar tarefa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar tarefa',
        error: error.message
      });
    }
  }

  /**
   * Alternar status de conclusão de uma tarefa
   * PUT /api/planejamento-estrategico/tarefas/:tarefaId/toggle
   */
  async toggleTarefa(req, res) {
    try {
      const { tarefaId } = req.params;

      // Buscar tarefa atual
      const { data: tarefa, error: fetchError } = await supabase
        .from('okr_tarefas')
        .select('concluida')
        .eq('id', tarefaId)
        .single();

      if (fetchError || !tarefa) {
        return res.status(404).json({
          success: false,
          message: 'Tarefa não encontrada'
        });
      }

      // Alternar status
      const { data, error } = await supabase
        .from('okr_tarefas')
        .update({ concluida: !tarefa.concluida })
        .eq('id', tarefaId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro ao alternar tarefa:', error);
        throw error;
      }

      console.log('✅ Status da tarefa alternado:', data.id, '→', data.concluida);

      res.json({
        success: true,
        message: data.concluida ? 'Tarefa marcada como concluída' : 'Tarefa marcada como pendente',
        data
      });
    } catch (error) {
      console.error('Erro ao alternar tarefa:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao alternar tarefa',
        error: error.message
      });
    }
  }

  // --- ESTRUTURA COMPLETA ---

  /**
   * Obter estrutura completa de OKRs de um planejamento
   * GET /api/planejamento-estrategico/:id/okr-completo
   */
  async obterOkrCompleto(req, res) {
    try {
      const { id } = req.params;

      // Buscar departamentos do planejamento
      const { data: departamentos, error: depError } = await supabase
        .from('pe_departamentos')
        .select('id, nome_departamento, ordem, unique_token')
        .eq('planejamento_id', id)
        .order('ordem', { ascending: true });

      if (depError) {
        console.error('❌ Erro ao buscar departamentos:', depError);
        throw depError;
      }

      // Para cada departamento, buscar seus OKRs
      const departamentosComOkrs = await Promise.all(
        (departamentos || []).map(async (dep) => {
          const { data: objetivos, error: objError } = await supabase
            .from('okr_objetivos')
            .select(`
              *,
              key_results:okr_key_results(
                *,
                tarefas:okr_tarefas(*)
              ),
              objetivo_estrategico:planejamento_okrs!objetivo_estrategico_id(id, objetivo, parent_id)
            `)
            .eq('departamento_id', dep.id)
            .order('created_at', { ascending: true });

          if (objError) {
            console.error(`❌ Erro ao buscar objetivos do departamento ${dep.id}:`, objError);
            return { ...dep, objetivos: [] };
          }

          return {
            ...dep,
            objetivos: objetivos || []
          };
        })
      );

      console.log(`✅ Estrutura OKR completa carregada para planejamento ${id}`);

      res.json({
        success: true,
        data: departamentosComOkrs
      });
    } catch (error) {
      console.error('Erro ao obter OKR completo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estrutura OKR completa',
        error: error.message
      });
    }
  }

  /**
   * Obter OKRs de um departamento via token público
   * GET /api/planejamento-estrategico/publico/departamento/:token/okr
   */
  async obterOkrDepartamentoPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar departamento pelo token
      const { data: departamento, error: departamentoError } = await supabase
        .from('pe_departamentos')
        .select(`
          id,
          nome_departamento,
          unique_token,
          planejamento:planejamentos_estrategicos(
            id,
            titulo,
            descricao,
            data_inicio,
            data_fim,
            client:clients(
              id,
              email,
              clients_pf(cpf, full_name),
              clients_pj(cnpj, company_name, trade_name),
              logo_path
            )
          )
        `)
        .eq('unique_token', token)
        .single();

      if (departamentoError) throw departamentoError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Gerar URL pública da logo do cliente
      if (departamento.planejamento?.client?.logo_path) {
        const { data: publicUrlData } = supabase.storage
          .from('client-logos')
          .getPublicUrl(departamento.planejamento.client.logo_path);

        departamento.planejamento.client.logo_url = publicUrlData?.publicUrl || null;
      }

      // Buscar objetivos OKR do departamento com seus KRs e tarefas
      const { data: objetivos, error: objError } = await supabase
        .from('okr_objetivos')
        .select(`
          *,
          key_results:okr_key_results(
            *,
            tarefas:okr_tarefas(*)
          ),
          objetivo_estrategico:planejamento_okrs!objetivo_estrategico_id(id, objetivo, parent_id)
        `)
        .eq('departamento_id', departamento.id)
        .order('created_at', { ascending: true });

      if (objError) {
        console.error('❌ Erro ao buscar objetivos OKR:', objError);
        throw objError;
      }

      // Registrar acesso
      await supabase
        .from('pe_access_logs')
        .insert({
          planejamento_id: departamento.planejamento.id,
          departamento_id: departamento.id,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers['user-agent']
        });

      console.log(`✅ Acesso público aos OKRs do departamento ${departamento.id} via token`);

      res.json({
        success: true,
        data: {
          departamento: {
            id: departamento.id,
            nome_departamento: departamento.nome_departamento,
            unique_token: departamento.unique_token
          },
          planejamento: departamento.planejamento,
          objetivos: objetivos || []
        }
      });
    } catch (error) {
      console.error('Erro ao obter OKR do departamento público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter OKRs do departamento',
        error: error.message
      });
    }
  }

  /**
   * Salvar OKRs de um departamento via token público
   * PUT /api/planejamento-estrategico/publico/departamento/:token/okr
   */
  async salvarOkrDepartamentoPublico(req, res) {
    try {
      const { token } = req.params;
      const { objetivos } = req.body;

      // Buscar departamento pelo token
      const { data: departamento, error: departamentoError } = await supabase
        .from('pe_departamentos')
        .select('id, nome_departamento, planejamento_id')
        .eq('unique_token', token)
        .single();

      if (departamentoError) throw departamentoError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      const departamentoId = departamento.id;

      // Buscar objetivos existentes para comparar
      const { data: objetivosExistentes } = await supabase
        .from('okr_objetivos')
        .select('id')
        .eq('departamento_id', departamentoId);

      const idsExistentes = new Set((objetivosExistentes || []).map(o => o.id));
      const idsRecebidos = new Set(objetivos.filter(o => o.id > 0).map(o => o.id));

      // Deletar objetivos que não estão mais na lista (e seus filhos em cascata)
      const objetivosParaDeletar = [...idsExistentes].filter(id => !idsRecebidos.has(id));
      if (objetivosParaDeletar.length > 0) {
        // Primeiro deletar tarefas dos KRs dos objetivos
        const { data: krsParaDeletar } = await supabase
          .from('okr_key_results')
          .select('id')
          .in('objetivo_id', objetivosParaDeletar);

        if (krsParaDeletar && krsParaDeletar.length > 0) {
          await supabase
            .from('okr_tarefas')
            .delete()
            .in('key_result_id', krsParaDeletar.map(kr => kr.id));

          await supabase
            .from('okr_key_results')
            .delete()
            .in('objetivo_id', objetivosParaDeletar);
        }

        await supabase
          .from('okr_objetivos')
          .delete()
          .in('id', objetivosParaDeletar);
      }

      // Processar cada objetivo
      const objetivosSalvos = [];
      for (let i = 0; i < objetivos.length; i++) {
        const objetivo = objetivos[i];
        let objetivoId;

        if (objetivo.id < 0) {
          // Novo objetivo - criar
          const { data: novoObjetivo, error: insertError } = await supabase
            .from('okr_objetivos')
            .insert({
              departamento_id: departamentoId,
              titulo: objetivo.titulo,
              descricao: objetivo.descricao || null,
              objetivo_estrategico_id: objetivo.objetivo_estrategico_id || null
            })
            .select()
            .single();

          if (insertError) throw insertError;
          objetivoId = novoObjetivo.id;
        } else {
          // Objetivo existente - atualizar
          const { error: updateError } = await supabase
            .from('okr_objetivos')
            .update({
              titulo: objetivo.titulo,
              descricao: objetivo.descricao || null,
              objetivo_estrategico_id: objetivo.objetivo_estrategico_id !== undefined ? objetivo.objetivo_estrategico_id : null,
              updated_at: new Date().toISOString()
            })
            .eq('id', objetivo.id);

          if (updateError) throw updateError;
          objetivoId = objetivo.id;
        }

        // Processar Key Results do objetivo
        const keyResults = objetivo.key_results || [];

        // Buscar KRs existentes
        const { data: krsExistentes } = await supabase
          .from('okr_key_results')
          .select('id')
          .eq('objetivo_id', objetivoId);

        const krIdsExistentes = new Set((krsExistentes || []).map(kr => kr.id));
        const krIdsRecebidos = new Set(keyResults.filter(kr => kr.id > 0).map(kr => kr.id));

        // Deletar KRs removidos
        const krsParaDeletar = [...krIdsExistentes].filter(id => !krIdsRecebidos.has(id));
        if (krsParaDeletar.length > 0) {
          await supabase
            .from('okr_tarefas')
            .delete()
            .in('key_result_id', krsParaDeletar);

          await supabase
            .from('okr_key_results')
            .delete()
            .in('id', krsParaDeletar);
        }

        // Processar cada KR
        const krsSalvos = [];
        for (let j = 0; j < keyResults.length; j++) {
          const kr = keyResults[j];
          let krId;

          if (kr.id < 0) {
            // Novo KR - criar
            const { data: novoKr, error: insertKrError } = await supabase
              .from('okr_key_results')
              .insert({
                objetivo_id: objetivoId,
                titulo: kr.titulo,
                descricao: kr.descricao || null,
                status: kr.status || 'pendente'
              })
              .select()
              .single();

            if (insertKrError) throw insertKrError;
            krId = novoKr.id;
          } else {
            // KR existente - atualizar
            const { error: updateKrError } = await supabase
              .from('okr_key_results')
              .update({
                titulo: kr.titulo,
                descricao: kr.descricao || null,
                status: kr.status || 'pendente',
                updated_at: new Date().toISOString()
              })
              .eq('id', kr.id);

            if (updateKrError) throw updateKrError;
            krId = kr.id;
          }

          // Processar Tarefas do KR
          const tarefas = kr.tarefas || [];

          // Buscar tarefas existentes
          const { data: tarefasExistentes } = await supabase
            .from('okr_tarefas')
            .select('id')
            .eq('key_result_id', krId);

          const tarefaIdsExistentes = new Set((tarefasExistentes || []).map(t => t.id));
          const tarefaIdsRecebidos = new Set(tarefas.filter(t => t.id > 0).map(t => t.id));

          // Deletar tarefas removidas
          const tarefasParaDeletar = [...tarefaIdsExistentes].filter(id => !tarefaIdsRecebidos.has(id));
          if (tarefasParaDeletar.length > 0) {
            await supabase
              .from('okr_tarefas')
              .delete()
              .in('id', tarefasParaDeletar);
          }

          // Processar cada tarefa
          const tarefasSalvas = [];
          for (const tarefa of tarefas) {
            let tarefaSalva;

            // Preparar data_limite (converter string vazia para null)
            const dataLimite = tarefa.data_limite && tarefa.data_limite.trim() !== '' ? tarefa.data_limite : null;
            const responsavel = tarefa.responsavel && tarefa.responsavel.trim() !== '' ? tarefa.responsavel : null;

            if (tarefa.id < 0) {
              // Nova tarefa - criar
              const { data: novaTarefa, error: insertTarefaError } = await supabase
                .from('okr_tarefas')
                .insert({
                  key_result_id: krId,
                  titulo: tarefa.titulo,
                  descricao: tarefa.descricao || null,
                  concluida: tarefa.concluida || false,
                  responsavel: responsavel,
                  data_limite: dataLimite
                })
                .select()
                .single();

              if (insertTarefaError) throw insertTarefaError;
              tarefaSalva = novaTarefa;
            } else {
              // Tarefa existente - atualizar
              const { error: updateTarefaError } = await supabase
                .from('okr_tarefas')
                .update({
                  titulo: tarefa.titulo,
                  descricao: tarefa.descricao || null,
                  concluida: tarefa.concluida || false,
                  responsavel: responsavel,
                  data_limite: dataLimite,
                  updated_at: new Date().toISOString()
                })
                .eq('id', tarefa.id);

              if (updateTarefaError) throw updateTarefaError;
              tarefaSalva = { ...tarefa, key_result_id: krId };
            }

            tarefasSalvas.push(tarefaSalva);
          }

          krsSalvos.push({
            id: krId,
            objetivo_id: objetivoId,
            titulo: kr.titulo,
            descricao: kr.descricao,
            status: kr.status,
            tarefas: tarefasSalvas
          });
        }

        objetivosSalvos.push({
          id: objetivoId,
          departamento_id: departamentoId,
          titulo: objetivo.titulo,
          descricao: objetivo.descricao,
          key_results: krsSalvos
        });
      }

      console.log(`✅ OKRs salvos para departamento ${departamentoId} via token público`);

      res.json({
        success: true,
        message: 'OKRs salvos com sucesso',
        data: {
          objetivos: objetivosSalvos
        }
      });
    } catch (error) {
      console.error('Erro ao salvar OKRs do departamento público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar OKRs do departamento',
        error: error.message
      });
    }
  }

  /**
   * Obter objetivos estratégicos (OKRs do planejamento) via token de departamento
   * GET /api/planejamento-estrategico/publico/departamento/:token/objetivos-estrategicos
   */
  async obterObjetivosEstrategicosPublico(req, res) {
    try {
      const { token } = req.params;

      // Buscar departamento pelo token para obter o planejamento_id
      const { data: departamento, error: departamentoError } = await supabase
        .from('pe_departamentos')
        .select('id, planejamento_id')
        .eq('unique_token', token)
        .single();

      if (departamentoError) throw departamentoError;
      if (!departamento) {
        return res.status(404).json({
          success: false,
          message: 'Departamento não encontrado'
        });
      }

      // Buscar objetivos estratégicos do planejamento (planejamento_okrs)
      const { data: objetivos, error: objError } = await supabase
        .from('planejamento_okrs')
        .select('id, objetivo, parent_id')
        .eq('planejamento_id', departamento.planejamento_id)
        .order('created_at', { ascending: true });

      if (objError) throw objError;

      // Organizar em estrutura hierárquica (objetivos principais e sub-objetivos)
      const objetivosFlat = [];
      const objetivosPrincipais = (objetivos || []).filter(o => !o.parent_id);
      const subObjetivos = (objetivos || []).filter(o => o.parent_id);

      for (const obj of objetivosPrincipais) {
        objetivosFlat.push({
          id: obj.id,
          objetivo: obj.objetivo,
          isSubObjetivo: false
        });

        // Adicionar sub-objetivos deste objetivo
        const subs = subObjetivos.filter(s => s.parent_id === obj.id);
        for (const sub of subs) {
          objetivosFlat.push({
            id: sub.id,
            objetivo: sub.objetivo,
            isSubObjetivo: true
          });
        }
      }

      console.log(`✅ Objetivos estratégicos carregados para departamento ${departamento.id} via token público`);

      res.json({
        success: true,
        data: objetivosFlat
      });
    } catch (error) {
      console.error('Erro ao obter objetivos estratégicos público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter objetivos estratégicos',
        error: error.message
      });
    }
  }

  /**
   * Exportar classificação de riscos para PDF (via token público)
   * GET /api/planejamento-estrategico/publico/classificacao-riscos/:token/pdf
   */
  async exportarClassificacaoRiscosPDF(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar classificação de riscos
      const { data: classificacao, error: classificacaoError } = await supabase
        .from('pe_classificacao_riscos')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      if (classificacaoError || !classificacao) {
        return res.status(404).json({
          success: false,
          message: 'Classificação de riscos não encontrada'
        });
      }

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=classificacao-riscos-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 30, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Classificação de Riscos', 50, 40);

      // Subtítulo
      doc.fontSize(12)
         .font('Helvetica')
         .text(`Planejamento Estratégico - ${clientName}`, 50, 75);

      doc.y = 150;

      // Função para obter label de classificação
      const getClassificacaoLabel = (tipo, valor) => {
        const labels = {
          oportunidades: {
            explorar: 'Explorar',
            melhorar: 'Melhorar',
            compartilhar: 'Compartilhar',
            aceitar: 'Aceitar'
          },
          ameacas: {
            evitar: 'Evitar',
            transferir: 'Transferir',
            mitigar: 'Mitigar',
            aceitar: 'Aceitar'
          }
        };
        return labels[tipo]?.[valor] || 'Não classificado';
      };

      // Função para desenhar seção
      const desenharSecao = (titulo, itens, cor, tipo, isUltima = false) => {
        // Verificar se precisa de nova página
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
        }

        // Header da seção com background colorido
        const headerY = doc.y;
        doc.rect(40, headerY, doc.page.width - 80, 40)
           .fill(cor);

        // Título da seção
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#ffffff')
           .text(titulo, 50, headerY + 12);

        doc.y = headerY + 50;
        doc.moveDown(0.5);

        if (!itens || itens.length === 0) {
          doc.fontSize(11)
             .font('Helvetica-Oblique')
             .fillColor('#999999')
             .text('Nenhum item registrado.', 50, doc.y);
          doc.moveDown(1.5);
          return;
        }

        // Iterar sobre os itens
        itens.forEach((item, index) => {
          const estimatedHeight = 100; // Estimativa de altura necessária

          // Verificar se precisa de nova página (reservando espaço para footer se for última seção)
          const bottomMargin = isUltima && index === itens.length - 1 ? 100 : 80;
          if (doc.y > doc.page.height - bottomMargin - estimatedHeight) {
            doc.addPage();
          }

          // Card do item com background
          const cardY = doc.y;

          // Número e título do item
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#2d3748')
             .text(`${index + 1}. `, 50, doc.y, { continued: true })
             .fontSize(10)
             .font('Helvetica')
             .text(item.item, { width: 490 });

          doc.moveDown(0.3);

          // Classificação
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(cor)
             .text('Estratégia: ', 65, doc.y, { continued: true })
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(getClassificacaoLabel(tipo, item.classificacao));

          doc.moveDown(0.3);

          // Tratativa
          if (item.tratativa && item.tratativa.trim() !== '') {
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor(cor)
               .text('Plano de Ação: ', 65, doc.y);

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#2d3748')
               .text(item.tratativa, 65, doc.y, { width: 475, align: 'justify' });
          } else {
            doc.fontSize(9)
               .font('Helvetica-Oblique')
               .fillColor('#999999')
               .text('Plano de Ação: Não definido', 65, doc.y);
          }

          // Linha separadora
          doc.moveDown(0.5);
          doc.strokeColor('#e2e8f0')
             .lineWidth(0.5)
             .moveTo(50, doc.y)
             .lineTo(doc.page.width - 50, doc.y)
             .stroke();

          doc.moveDown(0.8);
        });

        if (!isUltima) {
          doc.moveDown(0.5);
        }
      };

      // Desenhar seção de oportunidades
      desenharSecao(
        'Oportunidades (Riscos Positivos)',
        classificacao.oportunidades,
        '#28a745',
        'oportunidades',
        false
      );

      // Desenhar seção de ameaças
      desenharSecao(
        'Ameaças (Riscos Negativos)',
        classificacao.ameacas,
        '#dc3545',
        'ameacas',
        true
      );

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de classificação de riscos exportado via token`);
    } catch (error) {
      console.error('Erro ao exportar classificação de riscos para PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  /**
   * Exportar classificação de riscos CONSOLIDADA para PDF
   * GET /api/planejamento-estrategico/publico/classificacao-riscos-consolidado/:token/pdf
   */
  async exportarClassificacaoRiscosConsolidadoPDF(req, res) {
    try {
      const { token } = req.params;

      // Buscar planejamento pelo token
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('unique_token', token)
        .single();

      if (planejamentoError || !planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar classificação de riscos consolidada
      const { data: classificacao, error: classificacaoError } = await supabase
        .from('pe_classificacao_riscos')
        .select('*')
        .eq('planejamento_id', planejamento.id)
        .single();

      // Se não houver classificação consolidada, retornar erro amigável
      if (classificacaoError || !classificacao) {
        return res.status(404).json({
          success: false,
          message: 'Classificação de riscos consolidada não encontrada. Por favor, salve a classificação antes de exportar.'
        });
      }

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=classificacao-riscos-consolidada-${planejamento.titulo.replace(/\s+/g, '-')}.pdf`);

      // Pipe para response
      doc.pipe(res);

      // Nome do cliente
      let clientName = 'Cliente';
      if (planejamento.client) {
        const client = planejamento.client;
        if (client.clients_pj) {
          clientName = client.clients_pj.trade_name || client.clients_pj.company_name || clientName;
        } else if (client.clients_pf) {
          clientName = client.clients_pf.full_name || clientName;
        }
      }

      // Header do PDF
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background verde do header
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#003b2b');

      // Logo TOP (canto superior direito)
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const logoX = doc.page.width - logoWidth - 30;
          doc.image(logoPath, logoX, 30, { width: logoWidth });
        } catch (err) {
          console.error('Erro ao adicionar logo ao PDF:', err);
        }
      }

      // Título principal
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Classificação de Riscos', 50, 40);

      // Subtítulo
      doc.fontSize(12)
         .font('Helvetica')
         .text(`Planejamento Estratégico - ${clientName}`, 50, 75);

      // Indicação de consolidado
      doc.fontSize(10)
         .font('Helvetica-Oblique')
         .text('(Versão Consolidada)', 50, 95);

      doc.y = 150;

      // Função para obter label de classificação
      const getClassificacaoLabel = (tipo, valor) => {
        const labels = {
          oportunidades: {
            explorar: 'Explorar',
            melhorar: 'Melhorar',
            compartilhar: 'Compartilhar',
            aceitar: 'Aceitar'
          },
          ameacas: {
            evitar: 'Evitar',
            transferir: 'Transferir',
            mitigar: 'Mitigar',
            aceitar: 'Aceitar'
          }
        };
        return labels[tipo]?.[valor] || 'Não classificado';
      };

      // Função para desenhar seção
      const desenharSecao = (titulo, itens, cor, tipo, isUltima = false) => {
        // Verificar se precisa de nova página
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
        }

        // Header da seção com background colorido
        const headerY = doc.y;
        doc.rect(40, headerY, doc.page.width - 80, 40)
           .fill(cor);

        // Título da seção
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor('#ffffff')
           .text(titulo, 50, headerY + 12);

        doc.y = headerY + 50;
        doc.moveDown(0.5);

        if (!itens || itens.length === 0) {
          doc.fontSize(11)
             .font('Helvetica-Oblique')
             .fillColor('#999999')
             .text('Nenhum item registrado.', 50, doc.y);
          doc.moveDown(1.5);
          return;
        }

        // Iterar sobre os itens
        itens.forEach((item, index) => {
          const estimatedHeight = 100; // Estimativa de altura necessária

          // Verificar se precisa de nova página (reservando espaço para footer se for última seção)
          const bottomMargin = isUltima && index === itens.length - 1 ? 100 : 80;
          if (doc.y > doc.page.height - bottomMargin - estimatedHeight) {
            doc.addPage();
          }

          // Número e título do item
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#2d3748')
             .text(`${index + 1}. `, 50, doc.y, { continued: true })
             .fontSize(10)
             .font('Helvetica')
             .text(item.item, { width: 490 });

          doc.moveDown(0.3);

          // Classificação
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(cor)
             .text('Estratégia: ', 65, doc.y, { continued: true })
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(getClassificacaoLabel(tipo, item.classificacao));

          doc.moveDown(0.3);

          // Tratativa
          if (item.tratativa && item.tratativa.trim() !== '') {
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor(cor)
               .text('Plano de Ação: ', 65, doc.y);

            doc.fontSize(9)
               .font('Helvetica')
               .fillColor('#2d3748')
               .text(item.tratativa, 65, doc.y, { width: 475, align: 'justify' });
          } else {
            doc.fontSize(9)
               .font('Helvetica-Oblique')
               .fillColor('#999999')
               .text('Plano de Ação: Não definido', 65, doc.y);
          }

          // Linha separadora
          doc.moveDown(0.5);
          doc.strokeColor('#e2e8f0')
             .lineWidth(0.5)
             .moveTo(50, doc.y)
             .lineTo(doc.page.width - 50, doc.y)
             .stroke();

          doc.moveDown(0.8);
        });

        if (!isUltima) {
          doc.moveDown(0.5);
        }
      };

      // Desenhar seção de oportunidades
      desenharSecao(
        'Oportunidades (Riscos Positivos)',
        classificacao.oportunidades,
        '#28a745',
        'oportunidades',
        false
      );

      // Desenhar seção de ameaças
      desenharSecao(
        'Ameaças (Riscos Negativos)',
        classificacao.ameacas,
        '#dc3545',
        'ameacas',
        true
      );

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de classificação de riscos consolidada exportado via token`);
    } catch (error) {
      console.error('Erro ao exportar classificação de riscos consolidada para PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  // ===== ANÁLISE DE CENÁRIOS =====

  /**
   * Exportar análise de cenários para PDF
   * GET /api/planejamento-estrategico/:id/analise-cenarios/pdf
   */
  async exportarAnaliseCenariosPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizFinalError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizFinalError && matrizFinalError.code !== 'PGRST116') {
        throw matrizFinalError;
      }

      // Buscar matriz de cruzamento
      const { data: matrizCruzamento, error: cruzamentoError } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (cruzamentoError && cruzamentoError.code !== 'PGRST116') {
        throw cruzamentoError;
      }

      if (!matrizFinal || !matrizCruzamento) {
        return res.status(400).json({
          success: false,
          message: 'Matriz SWOT final ou matriz de cruzamento não encontrada'
        });
      }

      // Extrair itens da matriz final
      const extrairItens = (texto) => {
        if (!texto || !texto.trim()) return [];
        return texto.split('\n').filter(item => item.trim() !== '');
      };

      const oportunidades = extrairItens(matrizFinal.oportunidades);
      const ameacas = extrairItens(matrizFinal.ameacas);

      // Calcular análises
      const calcularAnalise = (items, gridFraqueza, gridForca) => {
        const resultado = [];
        let somaFraqueza = 0;
        let somaForca = 0;

        items.forEach((texto, index) => {
          const fraqueza = gridFraqueza && gridFraqueza[index]
            ? gridFraqueza[index].reduce((acc, val) => acc + val, 0)
            : 0;
          const forca = gridForca && gridForca[index]
            ? gridForca[index].reduce((acc, val) => acc + val, 0)
            : 0;

          somaFraqueza += fraqueza;
          somaForca += forca;

          resultado.push({ texto, fraqueza, forca, percentual: 0 });
        });

        const total = somaFraqueza + somaForca;
        if (total > 0) {
          resultado.forEach(item => {
            const somaItem = item.fraqueza + item.forca;
            item.percentual = Math.round((somaItem / total) * 100);
          });
        }

        return { items: resultado, somaFraqueza, somaForca };
      };

      const analiseOportunidades = calcularAnalise(
        oportunidades,
        matrizCruzamento.restricoes || [],
        matrizCruzamento.alavancas || []
      );

      const analiseAmeacas = calcularAnalise(
        ameacas,
        matrizCruzamento.problemas || [],
        matrizCruzamento.defesas || []
      );

      // Obter nome do cliente
      const getClientName = () => {
        const client = planejamento.client;
        if (!client) return 'N/A';
        if (client.clients_pj) {
          return client.clients_pj.trade_name || client.clients_pj.company_name || 'N/A';
        }
        if (client.clients_pf) {
          return client.clients_pf.full_name || 'N/A';
        }
        return 'N/A';
      };

      // Criar documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=analise-cenarios-${id}.pdf`);

      doc.pipe(res);

      // Logo e header
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background do header
      doc.rect(0, 0, doc.page.width, 100)
         .fill('#003b2b');

      // Logo TOP
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, doc.page.width - 130, 25, { width: 80 });
        } catch (err) {
          console.error('Erro ao adicionar logo:', err);
        }
      }

      // Título
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Análise de Cenários', 50, 35);

      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(getClientName(), 50, 65);

      doc.y = 120;

      // Função para desenhar tabela de análise
      const desenharTabelaAnalise = (titulo, analise, corHeader, corBorda) => {
        // Verificar se precisa de nova página (altura mínima para título + header + 1 linha)
        const alturaMinima = 100;
        if (doc.y + alturaMinima > doc.page.height - 80) {
          doc.addPage();
          doc.y = 50;
        }

        // Título da seção
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(corHeader)
           .text(titulo, 50, doc.y);

        doc.moveDown(0.5);

        // Configuração da tabela
        const tableX = 50;
        const tableWidth = doc.page.width - 100;
        const colWidths = [30, tableWidth - 30 - 70 - 70 - 70, 70, 70, 70]; // #, Descrição, Fraqueza, Força, %
        let currentY = doc.y;

        // Header da tabela
        doc.rect(tableX, currentY, tableWidth, 25)
           .fill(corHeader);

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#ffffff');

        let xPos = tableX + 5;
        doc.text('#', xPos, currentY + 8, { width: colWidths[0], align: 'center' });
        xPos += colWidths[0];
        doc.text('DESCRIÇÃO', xPos, currentY + 8, { width: colWidths[1], align: 'left' });
        xPos += colWidths[1];
        doc.text('FRAQUEZA', xPos, currentY + 8, { width: colWidths[2], align: 'center' });
        xPos += colWidths[2];
        doc.text('FORÇA', xPos, currentY + 8, { width: colWidths[3], align: 'center' });
        xPos += colWidths[3];
        doc.text('%', xPos, currentY + 8, { width: colWidths[4], align: 'center' });

        currentY += 25;

        // Linhas de dados
        analise.items.forEach((item, index) => {
          const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';

          // Calcular altura da linha baseada no texto
          const descricaoWidth = colWidths[1] - 10;
          doc.fontSize(8).font('Helvetica');
          const textHeight = doc.heightOfString(item.texto, { width: descricaoWidth });
          const rowHeight = Math.max(22, textHeight + 12);

          // Verificar se precisa de nova página
          if (currentY + rowHeight > doc.page.height - 80) {
            doc.addPage();
            currentY = 50;
          }

          doc.rect(tableX, currentY, tableWidth, rowHeight)
             .fill(bgColor);

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#2d3748');

          xPos = tableX + 5;
          doc.text(`${index + 1}`, xPos, currentY + 6, { width: colWidths[0], align: 'center' });
          xPos += colWidths[0];

          // Exibir descrição completa com quebra de linha
          doc.text(item.texto, xPos, currentY + 6, { width: descricaoWidth, align: 'left' });
          xPos += colWidths[1];
          doc.text(`${item.fraqueza}`, xPos, currentY + 6, { width: colWidths[2], align: 'center' });
          xPos += colWidths[2];
          doc.text(`${item.forca}`, xPos, currentY + 6, { width: colWidths[3], align: 'center' });
          xPos += colWidths[3];
          doc.text(`${item.percentual}%`, xPos, currentY + 6, { width: colWidths[4], align: 'center' });

          currentY += rowHeight;
        });

        // Linha de SOMA
        doc.rect(tableX, currentY, tableWidth, 25)
           .fill('#e9ecef');

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#2d3748');

        xPos = tableX + 5;
        doc.text('', xPos, currentY + 8, { width: colWidths[0], align: 'center' });
        xPos += colWidths[0];
        doc.text('SOMA', xPos, currentY + 8, { width: colWidths[1], align: 'left' });
        xPos += colWidths[1];
        doc.text(`${analise.somaFraqueza}`, xPos, currentY + 8, { width: colWidths[2], align: 'center' });
        xPos += colWidths[2];
        doc.text(`${analise.somaForca}`, xPos, currentY + 8, { width: colWidths[3], align: 'center' });
        xPos += colWidths[3];
        doc.text('100%', xPos, currentY + 8, { width: colWidths[4], align: 'center' });

        // Borda da tabela
        doc.rect(tableX, doc.y, tableWidth, currentY + 25 - doc.y)
           .stroke(corBorda);

        doc.y = currentY + 35;
      };

      // Função para desenhar gráfico de bolhas (igual ao Chart.js do frontend)
      const desenharGrafico = (titulo, analise, corBolha) => {
        // Verificar se precisa de nova página
        if (doc.y + 300 > doc.page.height - 50) {
          doc.addPage();
          doc.y = 50;
        }

        // Título
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text(titulo, 50, doc.y, { align: 'center', width: doc.page.width - 100 });

        doc.moveDown(0.5);

        // Área do gráfico (com margem para labels)
        const chartX = 80;
        const chartY = doc.y;
        const chartWidth = 380;
        const chartHeight = 220;

        // Calcular escalas dinâmicas (igual ao Chart.js)
        const valoresX = analise.items.map(i => i.fraqueza);
        const valoresY = analise.items.map(i => i.forca);
        const minX = Math.min(...valoresX);
        const maxX = Math.max(...valoresX);
        const minY = Math.min(...valoresY);
        const maxY = Math.max(...valoresY);
        const paddingX = (maxX - minX) * 0.2 || 20;
        const paddingY = (maxY - minY) * 0.2 || 20;

        const scaleMinX = Math.max(0, minX - paddingX);
        const scaleMaxX = maxX + paddingX;
        const scaleMinY = Math.max(0, minY - paddingY);
        const scaleMaxY = maxY + paddingY;

        const rangeX = scaleMaxX - scaleMinX;
        const rangeY = scaleMaxY - scaleMinY;

        // Background do gráfico
        doc.rect(chartX, chartY, chartWidth, chartHeight)
           .fill('#ffffff');

        doc.rect(chartX, chartY, chartWidth, chartHeight)
           .lineWidth(1)
           .stroke('#e5e7eb');

        // Grid lines
        doc.strokeColor('#e5e7eb')
           .lineWidth(0.5);

        // Calcular número de linhas de grid
        const numGridLines = 5;

        // Linhas horizontais do grid
        for (let i = 1; i < numGridLines; i++) {
          const gridY = chartY + (chartHeight / numGridLines) * i;
          doc.moveTo(chartX, gridY)
             .lineTo(chartX + chartWidth, gridY)
             .stroke();
        }

        // Linhas verticais do grid
        for (let i = 1; i < numGridLines; i++) {
          const gridX = chartX + (chartWidth / numGridLines) * i;
          doc.moveTo(gridX, chartY)
             .lineTo(gridX, chartY + chartHeight)
             .stroke();
        }

        // Labels dos eixos
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text('Impacto FRAQUEZAS', chartX, chartY + chartHeight + 20, { width: chartWidth, align: 'center' });

        // Label Y (rotacionado)
        doc.save()
           .translate(35, chartY + chartHeight / 2 + 50)
           .rotate(-90)
           .text('Impacto FORÇAS', 0, 0, { width: chartHeight, align: 'center' })
           .restore();

        // Escala do eixo X (valores)
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#6c757d');

        // Valores do eixo X
        for (let i = 0; i <= numGridLines; i++) {
          const valor = Math.round(scaleMinX + (rangeX / numGridLines) * i);
          const posX = chartX + (chartWidth / numGridLines) * i;
          doc.text(valor.toString(), posX - 10, chartY + chartHeight + 5, { width: 20, align: 'center' });
        }

        // Valores do eixo Y
        for (let i = 0; i <= numGridLines; i++) {
          const valor = Math.round(scaleMinY + (rangeY / numGridLines) * i);
          const posY = chartY + chartHeight - (chartHeight / numGridLines) * i;
          doc.text(valor.toString(), chartX - 25, posY - 4, { width: 20, align: 'right' });
        }

        // Desenhar bolhas (círculos) - do maior para o menor para não sobrepor números
        const sortedItems = analise.items
          .map((item, index) => ({ ...item, originalIndex: index }))
          .sort((a, b) => b.percentual - a.percentual);

        sortedItems.forEach((item) => {
          // Calcular posição X (fraqueza) e Y (força) - normalizado para área do gráfico
          const xNorm = (item.fraqueza - scaleMinX) / rangeX;
          const yNorm = (item.forca - scaleMinY) / rangeY;

          const x = chartX + xNorm * chartWidth;
          const y = chartY + chartHeight - yNorm * chartHeight;

          // Raio proporcional ao percentual (igual ao frontend: Math.max(15, percentual * 0.8))
          const radius = Math.max(12, item.percentual * 0.6);

          // Bolha com borda
          doc.circle(x, y, radius)
             .lineWidth(2)
             .fillAndStroke(corBolha, corBolha);

          // Número dentro da bolha (centralizado)
          const numStr = `${item.originalIndex + 1}`;
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#ffffff');

          const textWidth = doc.widthOfString(numStr);
          doc.text(numStr, x - textWidth / 2, y - 5, { lineBreak: false });
        });

        doc.y = chartY + chartHeight + 45;
      };

      // Análise de Oportunidades
      desenharGrafico('Gráfico de Oportunidades', analiseOportunidades, '#3b82f6');
      desenharTabelaAnalise('OPORTUNIDADES', analiseOportunidades, '#3b82f6', '#3b82f6');

      // Nova página para Ameaças
      doc.addPage();
      doc.y = 50;

      // Análise de Ameaças
      desenharGrafico('Gráfico de Ameaças', analiseAmeacas, '#ef4444');
      desenharTabelaAnalise('AMEAÇAS', analiseAmeacas, '#ef4444', '#ef4444');

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de análise de cenários gerado para planejamento ${id}`);
    } catch (error) {
      console.error('Erro ao exportar análise de cenários para PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  /**
   * Exportar análise de oportunidades para PDF
   * GET /api/planejamento-estrategico/:id/analise-oportunidades/pdf
   */
  async exportarAnaliseOportunidadesPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizFinalError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizFinalError && matrizFinalError.code !== 'PGRST116') {
        throw matrizFinalError;
      }

      // Buscar matriz de cruzamento
      const { data: matrizCruzamento, error: cruzamentoError } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (cruzamentoError && cruzamentoError.code !== 'PGRST116') {
        throw cruzamentoError;
      }

      if (!matrizFinal || !matrizCruzamento) {
        return res.status(400).json({
          success: false,
          message: 'Matriz SWOT final ou matriz de cruzamento não encontrada'
        });
      }

      // Extrair itens da matriz final
      const extrairItens = (texto) => {
        if (!texto || !texto.trim()) return [];
        return texto.split('\n').filter(item => item.trim() !== '');
      };

      const oportunidades = extrairItens(matrizFinal.oportunidades);
      const fraquezas = extrairItens(matrizFinal.fraquezas);
      const forcas = extrairItens(matrizFinal.forcas);

      // Calcular análise
      const gridFraqueza = matrizCruzamento.restricoes || [];
      const gridForca = matrizCruzamento.alavancas || [];

      let somaFraqueza = 0;
      let somaForca = 0;
      const analiseItems = [];

      oportunidades.forEach((texto, index) => {
        const fraqueza = gridFraqueza[index] ? gridFraqueza[index].reduce((acc, val) => acc + val, 0) : 0;
        const forca = gridForca[index] ? gridForca[index].reduce((acc, val) => acc + val, 0) : 0;

        somaFraqueza += fraqueza;
        somaForca += forca;

        analiseItems.push({ texto, fraqueza, forca, percentual: 0 });
      });

      const total = somaFraqueza + somaForca;
      if (total > 0) {
        analiseItems.forEach(item => {
          const somaItem = item.fraqueza + item.forca;
          item.percentual = parseFloat(((somaItem / total) * 100).toFixed(1));
        });
      }

      // Obter nome do cliente
      const getClientName = () => {
        const client = planejamento.client;
        if (!client) return 'N/A';
        if (client.clients_pj) {
          return client.clients_pj.trade_name || client.clients_pj.company_name || 'N/A';
        }
        if (client.clients_pf) {
          return client.clients_pf.full_name || 'N/A';
        }
        return 'N/A';
      };

      // Criar documento PDF em paisagem
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=analise-oportunidades-${id}.pdf`);

      doc.pipe(res);

      // Logo e header
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background do header
      doc.rect(0, 0, doc.page.width, 100)
         .fill('#003b2b');

      // Logo TOP
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, doc.page.width - 130, 25, { width: 80 });
        } catch (err) {
          console.error('Erro ao adicionar logo:', err);
        }
      }

      // Título
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Análise de Oportunidades', 50, 35);

      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(getClientName(), 50, 65);

      doc.y = 120;

      // Cores para os gráficos de pizza
      const coresFraquezas = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9'];
      const coresForcas = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

      // Função para desenhar gráfico de pizza
      const desenharPizza = (titulo, dados, cores, centerX, centerY, radius) => {
        const totalValor = dados.reduce((acc, d) => acc + d.valor, 0);
        if (totalValor === 0) return;

        let startAngle = -Math.PI / 2; // Começar do topo

        dados.forEach((item, index) => {
          if (item.valor <= 0) return;

          const sliceAngle = (item.valor / totalValor) * 2 * Math.PI;
          const endAngle = startAngle + sliceAngle;

          // Desenhar fatia
          doc.save();
          doc.moveTo(centerX, centerY);
          doc.arc(centerX, centerY, radius, startAngle, endAngle);
          doc.lineTo(centerX, centerY);
          doc.fillColor(cores[index % cores.length]);
          doc.fill();
          doc.restore();

          // Percentual no centro da fatia (se > 5%)
          const percentual = Math.round((item.valor / totalValor) * 100);
          if (percentual > 5) {
            const midAngle = startAngle + sliceAngle / 2;
            const labelRadius = radius * 0.65;
            const labelX = centerX + Math.cos(midAngle) * labelRadius;
            const labelY = centerY + Math.sin(midAngle) * labelRadius;

            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#ffffff')
               .text(`${percentual}%`, labelX - 12, labelY - 5, { width: 24, align: 'center' });
          }

          startAngle = endAngle;
        });

        // Título do gráfico
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text(titulo, centerX - 80, centerY + radius + 10, { width: 160, align: 'center' });
      };

      // Função para desenhar legenda
      const desenharLegenda = (dados, cores, startX, startY, maxWidth) => {
        let currentY = startY;
        const lineHeight = 14;

        dados.forEach((item, index) => {
          if (currentY > doc.page.height - 50) return;

          // Quadrado de cor
          doc.rect(startX, currentY, 10, 10)
             .fill(cores[index % cores.length]);

          // Texto truncado
          const texto = item.label.length > 35 ? item.label.substring(0, 32) + '...' : item.label;
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(texto, startX + 15, currentY + 1, { width: maxWidth - 20 });

          currentY += lineHeight;
        });

        return currentY;
      };

      // ===== GRÁFICOS PRINCIPAIS =====
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#2d3748')
         .text('Análise Gráfica Geral', 50, doc.y);

      doc.y += 20;

      // Preparar dados para gráficos principais
      const dadosFraquezasPrincipal = analiseItems.map((item, i) => ({
        label: `${i + 1}. ${item.texto}`,
        valor: item.fraqueza
      }));

      const dadosForcasPrincipal = analiseItems.map((item, i) => ({
        label: `${i + 1}. ${item.texto}`,
        valor: item.forca
      }));

      // Posição Y fixa para ambos os gráficos (lado a lado) - ajustado para paisagem
      const graficosY = doc.y + 60;

      // Gráfico de Fraquezas (esquerda) - posicionado mais à esquerda em paisagem
      desenharPizza('Distribuição por FRAQUEZA', dadosFraquezasPrincipal, coresFraquezas, 200, graficosY, 70);

      // Gráfico de Forças (direita) - cores verdes
      desenharPizza('Distribuição por FORÇA', dadosForcasPrincipal, coresForcas, 640, graficosY, 70);

      doc.y = graficosY + 100;

      // Legenda FRAQUEZAS (esquerda)
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#dc2626')
         .text('Legenda FRAQUEZAS:', 50, doc.y);

      doc.y += 10;

      // Desenhar legenda de fraquezas com espaçamento dinâmico
      let yFraquezas = doc.y;
      dadosFraquezasPrincipal.forEach((item, index) => {
        doc.rect(50, yFraquezas, 8, 8)
           .fill(coresFraquezas[index % coresFraquezas.length]);

        // Calcular linhas necessárias (aproximadamente 55 chars por linha na largura 330)
        const linhas = Math.ceil(item.label.length / 55);

        doc.fontSize(6.5)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(item.label, 62, yFraquezas, { width: 330 });

        yFraquezas += Math.max(linhas * 8, 10);
      });

      // Legenda FORÇAS (direita)
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#059669')
         .text('Legenda FORÇAS:', 430, graficosY + 100);

      // Desenhar legenda de forças com espaçamento dinâmico
      let yForcas = graficosY + 100 + 20;
      dadosForcasPrincipal.forEach((item, index) => {
        doc.rect(430, yForcas, 8, 8)
           .fill(coresForcas[index % coresForcas.length]);

        // Calcular linhas necessárias (aproximadamente 60 chars por linha na largura 350)
        const linhas = Math.ceil(item.label.length / 60);

        doc.fontSize(6.5)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(item.label, 442, yForcas, { width: 350 });

        yForcas += Math.max(linhas * 8, 10);
      });

      // ===== GRÁFICOS INDIVIDUAIS POR OPORTUNIDADE (2 por página = 4 gráficos) =====
      // Cores para gráficos individuais
      const coresIndividuaisFraquezas = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#fbbf24', '#fde047', '#facc15', '#fcd34d', '#fde68a', '#fef3c7'];
      const coresIndividuaisForcas = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

      // Função para desenhar uma oportunidade (gráficos + legendas) - ajustada para paisagem
      const desenharOportunidade = (oportunidade, index, startY) => {
        // Título da oportunidade - texto completo
        const titulo = `${index + 1}. ${oportunidade}`;

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#3b82f6')
           .text(titulo, 50, startY, { width: doc.page.width - 100 });

        // Calcular altura do título (aproximadamente 13px por linha)
        const tituloWidth = doc.page.width - 100;
        const charsPorLinha = Math.floor(tituloWidth / 5); // ~5px por caractere em fonte 10
        const linhasTitulo = Math.ceil(titulo.length / charsPorLinha);
        const alturaTitulo = Math.max(linhasTitulo * 13, 13);

        // Dados para gráficos individuais
        const restricoes = gridFraqueza[index] || [];
        const alavancas = gridForca[index] || [];

        const dadosFraquezasInd = fraquezas.map((f, i) => ({
          label: f,
          valor: restricoes[i] || 0
        }));

        const dadosForcasInd = forcas.map((f, i) => ({
          label: f,
          valor: alavancas[i] || 0
        }));

        const totalFraquezas = restricoes.reduce((acc, v) => acc + v, 0);
        const totalForcas = alavancas.reduce((acc, v) => acc + v, 0);

        // Posição Y para gráficos - ajustada com base na altura do título
        const grafIndY = startY + alturaTitulo + 55;

        // Gráfico de Fraquezas Individual (esquerda) - posição ajustada para paisagem
        if (totalFraquezas > 0) {
          desenharPizza('FRAQUEZAS', dadosFraquezasInd, coresIndividuaisFraquezas, 150, grafIndY, 50);
        } else {
          doc.fontSize(9)
             .font('Helvetica-Oblique')
             .fillColor('#6c757d')
             .text('Sem dados', 125, grafIndY);
        }

        // Gráfico de Forças Individual (direita) - posição ajustada para paisagem
        if (totalForcas > 0) {
          desenharPizza('FORÇAS', dadosForcasInd, coresIndividuaisForcas, 500, grafIndY, 50);
        } else {
          doc.fontSize(9)
             .font('Helvetica-Oblique')
             .fillColor('#6c757d')
             .text('Sem dados', 475, grafIndY);
        }

        // Legendas ao lado dos gráficos - texto completo com espaçamento adequado
        const legendaY = startY + alturaTitulo + 20;

        // Legenda Fraquezas (ao lado do gráfico esquerdo)
        let yFraq = legendaY;
        fraquezas.forEach((fraq, i) => {
          const valor = restricoes[i] || 0;
          const percentual = totalFraquezas > 0 ? Math.round((valor / totalFraquezas) * 100) : 0;

          doc.rect(210, yFraq, 6, 6)
             .fill(coresIndividuaisFraquezas[i % coresIndividuaisFraquezas.length]);

          const textoCompleto = `${fraq} ${percentual}%`;
          // Calcular linhas necessárias (aproximadamente 25 chars por linha na largura 140)
          const linhas = Math.ceil(textoCompleto.length / 25);

          doc.fontSize(5)
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(textoCompleto, 219, yFraq, { width: 140 });

          yFraq += Math.max(linhas * 6, 8);
        });

        // Legenda Forças (ao lado do gráfico direito)
        let yForc = legendaY;
        forcas.forEach((forca, i) => {
          const valor = alavancas[i] || 0;
          const percentual = totalForcas > 0 ? Math.round((valor / totalForcas) * 100) : 0;

          doc.rect(560, yForc, 6, 6)
             .fill(coresIndividuaisForcas[i % coresIndividuaisForcas.length]);

          const textoCompleto = `${forca} ${percentual}%`;
          // Calcular linhas necessárias (aproximadamente 40 chars por linha na largura 220)
          const linhas = Math.ceil(textoCompleto.length / 40);

          doc.fontSize(5)
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(textoCompleto, 569, yForc, { width: 220 });

          yForc += Math.max(linhas * 6, 8);
        });

        return startY + alturaTitulo + 160; // Retorna próxima posição Y
      };

      // Iterar sobre oportunidades (2 por página) - ajustado para paisagem
      oportunidades.forEach((oportunidade, index) => {
        const posicaoNaPagina = index % 2; // 0 = primeira, 1 = segunda

        if (posicaoNaPagina === 0) {
          // Nova página
          doc.addPage();

          // Título da página
          doc.fontSize(12)
             .font('Helvetica-Bold')
             .fillColor('#2d3748')
             .text('Análise Individual por Oportunidade', 50, 30);

          // Desenhar primeira oportunidade
          desenharOportunidade(oportunidade, index, 55);
        } else {
          // Linha separadora - ajustada para paisagem (altura menor)
          doc.strokeColor('#e5e7eb')
             .lineWidth(1)
             .moveTo(50, 300)
             .lineTo(doc.page.width - 50, 300)
             .stroke();

          // Desenhar segunda oportunidade - ajustada para paisagem
          desenharOportunidade(oportunidade, index, 315);
        }
      });

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de análise de oportunidades gerado para planejamento ${id}`);
    } catch (error) {
      console.error('Erro ao exportar análise de oportunidades para PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }

  // ==================== EXPORTAR ANÁLISE DE AMEAÇAS PARA PDF ====================
  async exportarAnaliseAmeacasPDF(req, res) {
    try {
      const { id } = req.params;

      // Buscar planejamento com cliente
      const { data: planejamento, error: planejamentoError } = await supabase
        .from('planejamentos_estrategicos')
        .select(`
          *,
          client:clients(
            clients_pf(full_name),
            clients_pj(company_name, trade_name)
          )
        `)
        .eq('id', id)
        .single();

      if (planejamentoError) throw planejamentoError;
      if (!planejamento) {
        return res.status(404).json({
          success: false,
          message: 'Planejamento não encontrado'
        });
      }

      // Buscar matriz SWOT final
      const { data: matrizFinal, error: matrizFinalError } = await supabase
        .from('pe_matriz_swot_final')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (matrizFinalError && matrizFinalError.code !== 'PGRST116') {
        throw matrizFinalError;
      }

      // Buscar matriz de cruzamento
      const { data: matrizCruzamento, error: cruzamentoError } = await supabase
        .from('pe_matriz_swot_cruzamento')
        .select('*')
        .eq('planejamento_id', id)
        .single();

      if (cruzamentoError && cruzamentoError.code !== 'PGRST116') {
        throw cruzamentoError;
      }

      if (!matrizFinal || !matrizCruzamento) {
        return res.status(400).json({
          success: false,
          message: 'Matriz SWOT final ou matriz de cruzamento não encontrada'
        });
      }

      // Extrair itens da matriz final
      const extrairItens = (texto) => {
        if (!texto || !texto.trim()) return [];
        return texto.split('\n').filter(item => item.trim() !== '');
      };

      const ameacas = extrairItens(matrizFinal.ameacas);
      const fraquezas = extrairItens(matrizFinal.fraquezas);
      const forcas = extrairItens(matrizFinal.forcas);

      // Calcular análise (usando problemas e defesas para ameaças)
      const gridFraqueza = matrizCruzamento.problemas || [];
      const gridForca = matrizCruzamento.defesas || [];

      let somaFraqueza = 0;
      let somaForca = 0;
      const analiseItems = [];

      ameacas.forEach((texto, index) => {
        const fraqueza = gridFraqueza[index] ? gridFraqueza[index].reduce((acc, val) => acc + val, 0) : 0;
        const forca = gridForca[index] ? gridForca[index].reduce((acc, val) => acc + val, 0) : 0;

        somaFraqueza += fraqueza;
        somaForca += forca;

        analiseItems.push({ texto, fraqueza, forca, percentual: 0 });
      });

      const total = somaFraqueza + somaForca;
      if (total > 0) {
        analiseItems.forEach(item => {
          const somaItem = item.fraqueza + item.forca;
          item.percentual = parseFloat(((somaItem / total) * 100).toFixed(1));
        });
      }

      // Obter nome do cliente
      const getClientName = () => {
        const client = planejamento.client;
        if (!client) return 'N/A';
        if (client.clients_pj) {
          return client.clients_pj.trade_name || client.clients_pj.company_name || 'N/A';
        }
        if (client.clients_pf) {
          return client.clients_pf.full_name || 'N/A';
        }
        return 'N/A';
      };

      // Criar documento PDF em paisagem
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Headers para download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=analise-ameacas-${id}.pdf`);

      doc.pipe(res);

      // Logo e header
      const logoPath = path.join(__dirname, '../../public/logoTOPNeg.png');

      // Background do header (vermelho para ameaças)
      doc.rect(0, 0, doc.page.width, 100)
         .fill('#7f1d1d');

      // Logo TOP
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, doc.page.width - 130, 25, { width: 80 });
        } catch (err) {
          console.error('Erro ao adicionar logo:', err);
        }
      }

      // Título
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Análise de Ameaças', 50, 35);

      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#ffffff')
         .text(getClientName(), 50, 65);

      doc.y = 120;

      // Cores para os gráficos de pizza
      const coresFraquezas = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9'];
      const coresForcas = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

      // Função para desenhar gráfico de pizza
      const desenharPizza = (titulo, dados, cores, centerX, centerY, radius) => {
        const totalValor = dados.reduce((acc, d) => acc + d.valor, 0);
        if (totalValor === 0) return;

        let startAngle = -Math.PI / 2; // Começar do topo

        dados.forEach((item, index) => {
          if (item.valor <= 0) return;

          const sliceAngle = (item.valor / totalValor) * 2 * Math.PI;
          const endAngle = startAngle + sliceAngle;

          // Desenhar fatia
          doc.save();
          doc.moveTo(centerX, centerY);
          doc.arc(centerX, centerY, radius, startAngle, endAngle);
          doc.lineTo(centerX, centerY);
          doc.fillColor(cores[index % cores.length]);
          doc.fill();
          doc.restore();

          // Percentual no centro da fatia (se > 5%)
          const percentual = Math.round((item.valor / totalValor) * 100);
          if (percentual > 5) {
            const midAngle = startAngle + sliceAngle / 2;
            const labelRadius = radius * 0.65;
            const labelX = centerX + Math.cos(midAngle) * labelRadius;
            const labelY = centerY + Math.sin(midAngle) * labelRadius;

            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor('#ffffff')
               .text(`${percentual}%`, labelX - 12, labelY - 5, { width: 24, align: 'center' });
          }

          startAngle = endAngle;
        });

        // Título do gráfico
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#2d3748')
           .text(titulo, centerX - 80, centerY + radius + 10, { width: 160, align: 'center' });
      };

      // ===== GRÁFICOS PRINCIPAIS =====
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#2d3748')
         .text('Análise Gráfica Geral', 50, doc.y);

      doc.y += 20;

      // Preparar dados para gráficos principais
      const dadosFraquezasPrincipal = analiseItems.map((item, i) => ({
        label: `${i + 1}. ${item.texto}`,
        valor: item.fraqueza
      }));

      const dadosForcasPrincipal = analiseItems.map((item, i) => ({
        label: `${i + 1}. ${item.texto}`,
        valor: item.forca
      }));

      // Posição Y fixa para ambos os gráficos (lado a lado) - ajustado para paisagem
      const graficosY = doc.y + 60;

      // Gráfico de Fraquezas (esquerda) - posicionado para paisagem
      desenharPizza('Distribuição por FRAQUEZA', dadosFraquezasPrincipal, coresFraquezas, 200, graficosY, 70);

      // Gráfico de Forças (direita) - posicionado para paisagem (cores verdes)
      desenharPizza('Distribuição por FORÇA', dadosForcasPrincipal, coresForcas, 640, graficosY, 70);

      doc.y = graficosY + 100;

      // Legenda FRAQUEZAS (esquerda)
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#dc2626')
         .text('Legenda FRAQUEZAS:', 50, doc.y);

      doc.y += 10;

      // Desenhar legenda de fraquezas com espaçamento dinâmico
      let yFraquezas = doc.y;
      dadosFraquezasPrincipal.forEach((item, index) => {
        doc.rect(50, yFraquezas, 8, 8)
           .fill(coresFraquezas[index % coresFraquezas.length]);

        // Calcular linhas necessárias (aproximadamente 55 chars por linha na largura 330)
        const linhas = Math.ceil(item.label.length / 55);

        doc.fontSize(6.5)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(item.label, 62, yFraquezas, { width: 330 });

        yFraquezas += Math.max(linhas * 8, 10);
      });

      // Legenda FORÇAS (direita)
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#059669')
         .text('Legenda FORÇAS:', 430, graficosY + 100);

      // Desenhar legenda de forças com espaçamento dinâmico
      let yForcas = graficosY + 100 + 20;
      dadosForcasPrincipal.forEach((item, index) => {
        doc.rect(430, yForcas, 8, 8)
           .fill(coresForcas[index % coresForcas.length]);

        // Calcular linhas necessárias (aproximadamente 60 chars por linha na largura 350)
        const linhas = Math.ceil(item.label.length / 60);

        doc.fontSize(6.5)
           .font('Helvetica')
           .fillColor('#2d3748')
           .text(item.label, 442, yForcas, { width: 350 });

        yForcas += Math.max(linhas * 8, 10);
      });

      // ===== GRÁFICOS INDIVIDUAIS POR AMEAÇA (2 por página = 4 gráficos) =====
      // Cores para gráficos individuais
      const coresIndividuaisFraquezas = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#fbbf24', '#fde047', '#facc15', '#fcd34d', '#fde68a', '#fef3c7'];
      const coresIndividuaisForcas = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'];

      // Função para desenhar uma ameaça (gráficos + legendas) - ajustada para paisagem
      const desenharAmeaca = (ameaca, index, startY) => {
        // Título da ameaça - texto completo
        const titulo = `${index + 1}. ${ameaca}`;

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#dc2626')
           .text(titulo, 50, startY, { width: doc.page.width - 100 });

        // Calcular altura do título (aproximadamente 13px por linha)
        const tituloWidth = doc.page.width - 100;
        const charsPorLinha = Math.floor(tituloWidth / 5); // ~5px por caractere em fonte 10
        const linhasTitulo = Math.ceil(titulo.length / charsPorLinha);
        const alturaTitulo = Math.max(linhasTitulo * 13, 13);

        // Dados para gráficos individuais
        const problemas = gridFraqueza[index] || [];
        const defesas = gridForca[index] || [];

        const dadosFraquezasInd = fraquezas.map((f, i) => ({
          label: f,
          valor: problemas[i] || 0
        }));

        const dadosForcasInd = forcas.map((f, i) => ({
          label: f,
          valor: defesas[i] || 0
        }));

        const totalFraquezas = problemas.reduce((acc, v) => acc + v, 0);
        const totalForcas = defesas.reduce((acc, v) => acc + v, 0);

        // Posição Y para gráficos - ajustada com base na altura do título
        const grafIndY = startY + alturaTitulo + 55;

        // Gráfico de Fraquezas Individual (esquerda) - posição ajustada para paisagem
        if (totalFraquezas > 0) {
          desenharPizza('FRAQUEZAS', dadosFraquezasInd, coresIndividuaisFraquezas, 150, grafIndY, 50);
        } else {
          doc.fontSize(9)
             .font('Helvetica-Oblique')
             .fillColor('#6c757d')
             .text('Sem dados', 125, grafIndY);
        }

        // Gráfico de Forças Individual (direita) - posição ajustada para paisagem
        if (totalForcas > 0) {
          desenharPizza('FORÇAS', dadosForcasInd, coresIndividuaisForcas, 500, grafIndY, 50);
        } else {
          doc.fontSize(9)
             .font('Helvetica-Oblique')
             .fillColor('#6c757d')
             .text('Sem dados', 475, grafIndY);
        }

        // Legendas ao lado dos gráficos - texto completo com espaçamento adequado
        const legendaY = startY + alturaTitulo + 20;

        // Legenda Fraquezas (ao lado do gráfico esquerdo)
        let yFraq = legendaY;
        fraquezas.forEach((fraq, i) => {
          const valor = problemas[i] || 0;
          const percentual = totalFraquezas > 0 ? Math.round((valor / totalFraquezas) * 100) : 0;

          doc.rect(210, yFraq, 6, 6)
             .fill(coresIndividuaisFraquezas[i % coresIndividuaisFraquezas.length]);

          const textoCompleto = `${fraq} ${percentual}%`;
          // Calcular linhas necessárias (aproximadamente 25 chars por linha na largura 140)
          const linhas = Math.ceil(textoCompleto.length / 25);

          doc.fontSize(5)
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(textoCompleto, 219, yFraq, { width: 140 });

          yFraq += Math.max(linhas * 6, 8);
        });

        // Legenda Forças (ao lado do gráfico direito)
        let yForc = legendaY;
        forcas.forEach((forca, i) => {
          const valor = defesas[i] || 0;
          const percentual = totalForcas > 0 ? Math.round((valor / totalForcas) * 100) : 0;

          doc.rect(560, yForc, 6, 6)
             .fill(coresIndividuaisForcas[i % coresIndividuaisForcas.length]);

          const textoCompleto = `${forca} ${percentual}%`;
          // Calcular linhas necessárias (aproximadamente 40 chars por linha na largura 220)
          const linhas = Math.ceil(textoCompleto.length / 40);

          doc.fontSize(5)
             .font('Helvetica')
             .fillColor('#2d3748')
             .text(textoCompleto, 569, yForc, { width: 220 });

          yForc += Math.max(linhas * 6, 8);
        });

        return startY + alturaTitulo + 160; // Retorna próxima posição Y
      };

      // Iterar sobre ameaças (2 por página) - ajustado para paisagem
      ameacas.forEach((ameaca, index) => {
        const posicaoNaPagina = index % 2; // 0 = primeira, 1 = segunda

        if (posicaoNaPagina === 0) {
          // Nova página
          doc.addPage();

          // Título da página
          doc.fontSize(12)
             .font('Helvetica-Bold')
             .fillColor('#2d3748')
             .text('Análise Individual por Ameaça', 50, 30);

          // Desenhar primeira ameaça
          desenharAmeaca(ameaca, index, 55);
        } else {
          // Linha separadora - ajustada para paisagem (altura menor)
          doc.strokeColor('#e5e7eb')
             .lineWidth(1)
             .moveTo(50, 300)
             .lineTo(doc.page.width - 50, 300)
             .stroke();

          // Desenhar segunda ameaça - ajustada para paisagem
          desenharAmeaca(ameaca, index, 315);
        }
      });

      // Finalizar PDF
      doc.end();

      console.log(`✅ PDF de análise de ameaças gerado para planejamento ${id}`);
    } catch (error) {
      console.error('Erro ao exportar análise de ameaças para PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao exportar PDF',
        error: error.message
      });
    }
  }
}

module.exports = new PlanejamentoEstrategicoController();
