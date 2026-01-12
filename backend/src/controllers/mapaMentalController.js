const { supabase } = require('../config/database');

/**
 * Controller para gerenciar o Mapa Mental Estratégico das mentorias
 * Implementa CRUD completo para mapa mental, colunas, cards e conexões
 */
class MapaMentalController {
  // ===== MAPA MENTAL (Entidade Principal) =====

  /**
   * Obter ou criar mapa mental para um encontro
   * GET /api/mentoria/encontros/:encontroId/mapa-mental
   */
  async obterMapaMental(req, res) {
    try {
      const { encontroId } = req.params;

      console.log(`📥 Buscando mapa mental para encontro ${encontroId}`);

      // Verificar se o encontro existe
      const { data: encontro, error: encontroError } = await supabase
        .from('mentoria_encontros')
        .select('id, contract_id')
        .eq('id', encontroId)
        .single();

      if (encontroError || !encontro) {
        return res.status(404).json({
          success: false,
          message: 'Encontro não encontrado'
        });
      }

      // Buscar ou criar mapa mental
      let { data: mapaMental, error: mapaError } = await supabase
        .from('mentoria_mapa_mental')
        .select(`
          id,
          encontro_id,
          ativo,
          created_at,
          updated_at,
          colunas:mentoria_mapa_colunas(
            id,
            coluna_id,
            nome,
            cor,
            cor_bg,
            cor_borda,
            sort_order
          ),
          cards:mentoria_mapa_cards(
            id,
            card_id,
            coluna_id,
            meta,
            indicador,
            prazo,
            created_at,
            updated_at
          ),
          conexoes:mentoria_mapa_conexoes(
            id,
            card_origem_id,
            card_destino_id
          )
        `)
        .eq('encontro_id', encontroId)
        .single();

      // Se não existir, criar um novo mapa mental com colunas padrão
      if (mapaError || !mapaMental) {
        console.log('📝 Criando novo mapa mental para este encontro');

        const { data: novoMapa, error: createError } = await supabase
          .from('mentoria_mapa_mental')
          .insert({
            encontro_id: encontroId,
            ativo: true
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ Erro ao criar mapa mental:', createError);
          throw createError;
        }

        // As colunas padrão são criadas automaticamente pelo trigger
        // Agora buscar o mapa mental completo
        const { data: mapaCompleto, error: fetchError } = await supabase
          .from('mentoria_mapa_mental')
          .select(`
            id,
            encontro_id,
            ativo,
            created_at,
            updated_at,
            colunas:mentoria_mapa_colunas(
              id,
              coluna_id,
              nome,
              cor,
              cor_bg,
              cor_borda,
              sort_order
            ),
            cards:mentoria_mapa_cards(
              id,
              card_id,
              coluna_id,
              meta,
              indicador,
              prazo
            ),
            conexoes:mentoria_mapa_conexoes(
              id,
              card_origem_id,
              card_destino_id
            )
          `)
          .eq('id', novoMapa.id)
          .single();

        if (fetchError) {
          console.error('❌ Erro ao buscar mapa mental criado:', fetchError);
          throw fetchError;
        }

        mapaMental = mapaCompleto;
      }

      // Ordenar colunas por sort_order
      if (mapaMental.colunas) {
        mapaMental.colunas.sort((a, b) => a.sort_order - b.sort_order);
      }

      // Organizar cards por coluna
      const cardsPorColuna = {};
      if (mapaMental.cards) {
        mapaMental.cards.forEach(card => {
          if (!cardsPorColuna[card.coluna_id]) {
            cardsPorColuna[card.coluna_id] = [];
          }
          cardsPorColuna[card.coluna_id].push(card);
        });
      }

      // Formatar resposta no formato esperado pelo frontend
      const resposta = {
        id: mapaMental.id,
        encontro_id: mapaMental.encontro_id,
        ativo: mapaMental.ativo,
        data: {
          colunas: mapaMental.colunas || [],
          cards: cardsPorColuna,
          conexoes: (mapaMental.conexoes || []).map(c => ({
            de: c.card_origem_id,
            para: c.card_destino_id
          }))
        }
      };

      console.log(`✅ Mapa mental obtido: ${resposta.data.colunas.length} colunas, ${mapaMental.cards?.length || 0} cards`);

      res.json({
        success: true,
        data: resposta
      });
    } catch (error) {
      console.error('❌ Erro ao obter mapa mental:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mapa mental',
        error: error.message
      });
    }
  }

  /**
   * Obter mapa mental via token público (para mentorado)
   * GET /api/mentoria/publico/:token/mapa-mental
   */
  async obterMapaMentalPublico(req, res) {
    try {
      const { token } = req.params;

      console.log(`📥 Buscando mapa mental público via token`);

      // Buscar encontro pelo token
      const { data: encontro, error: encontroError } = await supabase
        .from('mentoria_encontros')
        .select('id')
        .eq('unique_token', token)
        .eq('status', 'published')
        .single();

      if (encontroError || !encontro) {
        return res.status(404).json({
          success: false,
          message: 'Encontro não encontrado ou não publicado'
        });
      }

      // Buscar ou criar mapa mental
      let { data: mapaMental, error: mapaError } = await supabase
        .from('mentoria_mapa_mental')
        .select(`
          id,
          encontro_id,
          ativo,
          colunas:mentoria_mapa_colunas(
            id,
            coluna_id,
            nome,
            cor,
            cor_bg,
            cor_borda,
            sort_order
          ),
          cards:mentoria_mapa_cards(
            id,
            card_id,
            coluna_id,
            meta,
            indicador,
            prazo
          ),
          conexoes:mentoria_mapa_conexoes(
            id,
            card_origem_id,
            card_destino_id
          )
        `)
        .eq('encontro_id', encontro.id)
        .single();

      // Se não existir, criar um novo mapa mental com colunas padrão
      if (mapaError || !mapaMental) {
        console.log('📝 Criando novo mapa mental público para este encontro');

        const { data: novoMapa, error: createError } = await supabase
          .from('mentoria_mapa_mental')
          .insert({
            encontro_id: encontro.id,
            ativo: true
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ Erro ao criar mapa mental:', createError);
          throw createError;
        }

        // As colunas padrão são criadas automaticamente pelo trigger
        // Agora buscar o mapa mental completo
        const { data: mapaCompleto, error: fetchError } = await supabase
          .from('mentoria_mapa_mental')
          .select(`
            id,
            encontro_id,
            ativo,
            colunas:mentoria_mapa_colunas(
              id,
              coluna_id,
              nome,
              cor,
              cor_bg,
              cor_borda,
              sort_order
            ),
            cards:mentoria_mapa_cards(
              id,
              card_id,
              coluna_id,
              meta,
              indicador,
              prazo
            ),
            conexoes:mentoria_mapa_conexoes(
              id,
              card_origem_id,
              card_destino_id
            )
          `)
          .eq('id', novoMapa.id)
          .single();

        if (fetchError) {
          console.error('❌ Erro ao buscar mapa mental criado:', fetchError);
          throw fetchError;
        }

        mapaMental = mapaCompleto;
      }

      // Verificar se o mapa mental está ativo
      if (!mapaMental.ativo) {
        return res.status(404).json({
          success: false,
          message: 'Mapa mental não está ativo'
        });
      }

      // Ordenar colunas
      if (mapaMental.colunas) {
        mapaMental.colunas.sort((a, b) => a.sort_order - b.sort_order);
      }

      // Organizar cards por coluna
      const cardsPorColuna = {};
      if (mapaMental.cards) {
        mapaMental.cards.forEach(card => {
          if (!cardsPorColuna[card.coluna_id]) {
            cardsPorColuna[card.coluna_id] = [];
          }
          cardsPorColuna[card.coluna_id].push(card);
        });
      }

      const resposta = {
        id: mapaMental.id,
        encontro_id: mapaMental.encontro_id,
        ativo: mapaMental.ativo,
        data: {
          colunas: mapaMental.colunas || [],
          cards: cardsPorColuna,
          conexoes: (mapaMental.conexoes || []).map(c => ({
            de: c.card_origem_id,
            para: c.card_destino_id
          }))
        }
      };

      res.json({
        success: true,
        data: resposta
      });
    } catch (error) {
      console.error('❌ Erro ao obter mapa mental público:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mapa mental',
        error: error.message
      });
    }
  }

  /**
   * Ativar/desativar mapa mental
   * PATCH /api/mentoria/encontros/:encontroId/mapa-mental/ativo
   */
  async toggleMapaMentalAtivo(req, res) {
    try {
      const { encontroId } = req.params;
      const { ativo } = req.body;

      const { data: mapaMental, error } = await supabase
        .from('mentoria_mapa_mental')
        .update({ ativo })
        .eq('encontro_id', encontroId)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: `Mapa mental ${ativo ? 'ativado' : 'desativado'} com sucesso`,
        data: mapaMental
      });
    } catch (error) {
      console.error('❌ Erro ao alterar status do mapa mental:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao alterar status do mapa mental',
        error: error.message
      });
    }
  }

  // ===== COLUNAS =====

  /**
   * Adicionar nova coluna (nível)
   * POST /api/mentoria/mapa-mental/:mapaId/colunas
   */
  async adicionarColuna(req, res) {
    try {
      const { mapaId } = req.params;
      const { coluna_id, nome, cor, cor_bg, cor_borda, sort_order } = req.body;

      const { data: coluna, error } = await supabase
        .from('mentoria_mapa_colunas')
        .insert({
          mapa_mental_id: mapaId,
          coluna_id,
          nome,
          cor,
          cor_bg,
          cor_borda,
          sort_order: sort_order || 0
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Coluna adicionada com sucesso',
        data: coluna
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar coluna:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar coluna',
        error: error.message
      });
    }
  }

  /**
   * Remover coluna
   * DELETE /api/mentoria/mapa-mental/colunas/:colunaId
   */
  async removerColuna(req, res) {
    try {
      const { colunaId } = req.params;

      // Buscar coluna para obter o coluna_id
      const { data: coluna, error: fetchError } = await supabase
        .from('mentoria_mapa_colunas')
        .select('id, coluna_id, mapa_mental_id')
        .eq('id', colunaId)
        .single();

      if (fetchError || !coluna) {
        return res.status(404).json({
          success: false,
          message: 'Coluna não encontrada'
        });
      }

      // Deletar cards dessa coluna
      await supabase
        .from('mentoria_mapa_cards')
        .delete()
        .eq('mapa_mental_id', coluna.mapa_mental_id)
        .eq('coluna_id', coluna.coluna_id);

      // Deletar coluna
      const { error } = await supabase
        .from('mentoria_mapa_colunas')
        .delete()
        .eq('id', colunaId);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Coluna removida com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover coluna:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao remover coluna',
        error: error.message
      });
    }
  }

  // ===== CARDS =====

  /**
   * Adicionar novo card
   * POST /api/mentoria/mapa-mental/:mapaId/cards
   */
  async adicionarCard(req, res) {
    try {
      const { mapaId } = req.params;
      const { card_id, coluna_id, meta, indicador, prazo } = req.body;

      const { data: card, error } = await supabase
        .from('mentoria_mapa_cards')
        .insert({
          mapa_mental_id: mapaId,
          card_id,
          coluna_id,
          meta: meta || null,
          indicador: indicador || null,
          prazo: prazo || null
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Card adicionado: ${card_id} na coluna ${coluna_id}`);

      res.status(201).json({
        success: true,
        message: 'Card adicionado com sucesso',
        data: card
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar card:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar card',
        error: error.message
      });
    }
  }

  /**
   * Atualizar card
   * PUT /api/mentoria/mapa-mental/cards/:cardIdDb
   */
  async atualizarCard(req, res) {
    try {
      const { cardIdDb } = req.params;
      const { meta, indicador, prazo, coluna_id } = req.body;

      const updateData = {};
      if (meta !== undefined) updateData.meta = meta;
      if (indicador !== undefined) updateData.indicador = indicador;
      if (prazo !== undefined) updateData.prazo = prazo;
      if (coluna_id !== undefined) updateData.coluna_id = coluna_id;

      const { data: card, error } = await supabase
        .from('mentoria_mapa_cards')
        .update(updateData)
        .eq('id', cardIdDb)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: 'Card atualizado com sucesso',
        data: card
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar card:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar card',
        error: error.message
      });
    }
  }

  /**
   * Remover card
   * DELETE /api/mentoria/mapa-mental/cards/:cardId
   */
  async removerCard(req, res) {
    try {
      const { cardId } = req.params; // Este é o card_id gerado pelo frontend

      // Buscar o card para obter o ID do banco e mapa_mental_id
      const { data: card, error: fetchError } = await supabase
        .from('mentoria_mapa_cards')
        .select('id, mapa_mental_id')
        .eq('card_id', cardId)
        .single();

      if (fetchError || !card) {
        return res.status(404).json({
          success: false,
          message: 'Card não encontrado'
        });
      }

      // Deletar conexões relacionadas
      await supabase
        .from('mentoria_mapa_conexoes')
        .delete()
        .eq('mapa_mental_id', card.mapa_mental_id)
        .or(`card_origem_id.eq.${cardId},card_destino_id.eq.${cardId}`);

      // Deletar card
      const { error } = await supabase
        .from('mentoria_mapa_cards')
        .delete()
        .eq('card_id', cardId);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Card removido com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover card:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao remover card',
        error: error.message
      });
    }
  }

  // ===== CONEXÕES =====

  /**
   * Adicionar conexão entre cards
   * POST /api/mentoria/mapa-mental/:mapaId/conexoes
   */
  async adicionarConexao(req, res) {
    try {
      const { mapaId } = req.params;
      const { card_origem_id, card_destino_id } = req.body;

      const { data: conexao, error } = await supabase
        .from('mentoria_mapa_conexoes')
        .insert({
          mapa_mental_id: mapaId,
          card_origem_id,
          card_destino_id
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Conexão criada com sucesso',
        data: conexao
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar conexão:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar conexão',
        error: error.message
      });
    }
  }

  /**
   * Remover conexão
   * DELETE /api/mentoria/mapa-mental/:mapaId/conexoes
   */
  async removerConexao(req, res) {
    try {
      const { mapaId } = req.params;
      const { card_origem_id, card_destino_id } = req.body;

      const { error } = await supabase
        .from('mentoria_mapa_conexoes')
        .delete()
        .eq('mapa_mental_id', mapaId)
        .eq('card_origem_id', card_origem_id)
        .eq('card_destino_id', card_destino_id);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Conexão removida com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao remover conexão:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao remover conexão',
        error: error.message
      });
    }
  }

  /**
   * Salvar estado completo do mapa mental (operação em lote)
   * PUT /api/mentoria/mapa-mental/:mapaId/salvar-completo
   */
  async salvarMapaCompleto(req, res) {
    try {
      const { mapaId } = req.params;
      const { colunas, cards, conexoes } = req.body;

      console.log(`📥 Salvando mapa mental completo ${mapaId}`);
      console.log(`  - ${colunas?.length || 0} colunas`);
      console.log(`  - ${Object.keys(cards || {}).length} colunas com cards`);
      console.log(`  - ${conexoes?.length || 0} conexões`);

      // 1. Atualizar colunas (delete + insert)
      if (colunas && Array.isArray(colunas)) {
        // Deletar colunas antigas
        await supabase
          .from('mentoria_mapa_colunas')
          .delete()
          .eq('mapa_mental_id', mapaId);

        // Inserir novas colunas
        if (colunas.length > 0) {
          const colunasParaInserir = colunas.map((col, index) => ({
            mapa_mental_id: mapaId,
            coluna_id: col.id || col.coluna_id,
            nome: col.nome,
            cor: col.cor,
            cor_bg: col.corBg || col.cor_bg,
            cor_borda: col.corBorda || col.cor_borda,
            sort_order: col.sort_order !== undefined ? col.sort_order : index
          }));

          await supabase
            .from('mentoria_mapa_colunas')
            .insert(colunasParaInserir);
        }
      }

      // 2. Atualizar cards (delete + insert)
      if (cards) {
        // Deletar cards antigos
        await supabase
          .from('mentoria_mapa_cards')
          .delete()
          .eq('mapa_mental_id', mapaId);

        // Inserir novos cards
        const cardsParaInserir = [];
        Object.keys(cards).forEach(colunaId => {
          if (Array.isArray(cards[colunaId])) {
            cards[colunaId].forEach(card => {
              cardsParaInserir.push({
                mapa_mental_id: mapaId,
                card_id: card.id || card.card_id,
                coluna_id: card.colunaId || card.coluna_id || colunaId,
                meta: card.meta || null,
                indicador: card.indicador || null,
                prazo: card.prazo || null
              });
            });
          }
        });

        if (cardsParaInserir.length > 0) {
          await supabase
            .from('mentoria_mapa_cards')
            .insert(cardsParaInserir);
        }
      }

      // 3. Atualizar conexões (delete + insert)
      if (conexoes && Array.isArray(conexoes)) {
        // Deletar conexões antigas
        await supabase
          .from('mentoria_mapa_conexoes')
          .delete()
          .eq('mapa_mental_id', mapaId);

        // Inserir novas conexões
        if (conexoes.length > 0) {
          const conexoesParaInserir = conexoes.map(conn => ({
            mapa_mental_id: mapaId,
            card_origem_id: conn.de || conn.card_origem_id,
            card_destino_id: conn.para || conn.card_destino_id
          }));

          await supabase
            .from('mentoria_mapa_conexoes')
            .insert(conexoesParaInserir);
        }
      }

      console.log('✅ Mapa mental salvo com sucesso');

      res.json({
        success: true,
        message: 'Mapa mental salvo com sucesso'
      });
    } catch (error) {
      console.error('❌ Erro ao salvar mapa mental completo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao salvar mapa mental',
        error: error.message
      });
    }
  }
}

module.exports = new MapaMentalController();
