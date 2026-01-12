const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// Rota de teste temporária para debug
router.get('/debug-proposal/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Buscar direto do banco sem transformações
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('unique_link', token)
      .single();

    if (error) {
      return res.json({ error: error.message });
    }

    // Retornar dados brutos
    res.json({
      raw_data: {
        id: proposal.id,
        proposal_number: proposal.proposal_number,
        vista_discount_percentage: proposal.vista_discount_percentage,
        prazo_discount_percentage: proposal.prazo_discount_percentage,
        discount_applied: proposal.discount_applied,
        type_of_vista: typeof proposal.vista_discount_percentage,
        type_of_prazo: typeof proposal.prazo_discount_percentage,
        vista_is_null: proposal.vista_discount_percentage === null,
        prazo_is_null: proposal.prazo_discount_percentage === null,
        full_proposal: proposal
      }
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = router;