const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

/**
 * @route GET /api/mentoria/termometro-gestao/publico/:token
 * @desc Obter Termômetro de Gestão por token público
 * @access Public
 */
router.get('/publico/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Buscar encontro pelo token
    const { data: encontro, error: encontroError } = await supabase
      .from('mentoria_encontros')
      .select('id')
      .eq('unique_token', token)
      .single();

    if (encontroError || !encontro) {
      return res.status(404).json({
        success: false,
        message: 'Encontro não encontrado'
      });
    }

    // Buscar Termômetro de Gestão
    const { data, error } = await supabase
      .from('termometro_gestao')
      .select('*')
      .eq('encontro_id', encontro.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Não encontrado - retornar null mas success true
        return res.json({ success: true, data: null });
      }
      throw error;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao obter Termômetro de Gestão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar dados',
      error: error.message
    });
  }
});

/**
 * @route POST /api/mentoria/termometro-gestao/publico/:token
 * @desc Salvar ou atualizar Termômetro de Gestão por token público
 * @access Public
 */
router.post('/publico/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const {
      atividades,
      perfil_comparacao,
      percentual_estrategico,
      percentual_tatico,
      percentual_operacional
    } = req.body;

    // Validações básicas
    if (!atividades) {
      return res.status(400).json({
        success: false,
        message: 'Atividades são obrigatórias'
      });
    }

    if (!perfil_comparacao || !['direção', 'gerencial', 'profissional'].includes(perfil_comparacao)) {
      return res.status(400).json({
        success: false,
        message: 'Perfil de comparação inválido'
      });
    }

    // Buscar encontro pelo token
    const { data: encontro, error: encontroError } = await supabase
      .from('mentoria_encontros')
      .select('id')
      .eq('unique_token', token)
      .single();

    if (encontroError || !encontro) {
      return res.status(404).json({
        success: false,
        message: 'Encontro não encontrado'
      });
    }

    // Verificar se já existe registro
    const { data: existente } = await supabase
      .from('termometro_gestao')
      .select('id')
      .eq('encontro_id', encontro.id)
      .single();

    let result;

    if (existente) {
      // Atualizar registro existente
      const { data, error } = await supabase
        .from('termometro_gestao')
        .update({
          atividades: typeof atividades === 'string' ? atividades : JSON.stringify(atividades),
          perfil_comparacao,
          percentual_estrategico: Number(percentual_estrategico) || 0,
          percentual_tatico: Number(percentual_tatico) || 0,
          percentual_operacional: Number(percentual_operacional) || 0,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', existente.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar Termômetro de Gestão:', error);
        throw error;
      }
      result = data;
    } else {
      // Criar novo registro
      const { data, error } = await supabase
        .from('termometro_gestao')
        .insert([{
          encontro_id: encontro.id,
          atividades: typeof atividades === 'string' ? atividades : JSON.stringify(atividades),
          perfil_comparacao,
          percentual_estrategico: Number(percentual_estrategico) || 0,
          percentual_tatico: Number(percentual_tatico) || 0,
          percentual_operacional: Number(percentual_operacional) || 0
        }])
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar Termômetro de Gestão:', error);
        throw error;
      }
      result = data;
    }

    res.json({
      success: true,
      data: result,
      message: existente ? 'Dados atualizados com sucesso' : 'Dados salvos com sucesso'
    });
  } catch (error) {
    console.error('Erro ao salvar Termômetro de Gestão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar dados',
      error: error.message
    });
  }
});

module.exports = router;
