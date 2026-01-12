/**
 * Script para atualizar serviços de propostas não assinadas
 * Altera selected_by_client de false para null em propostas que ainda não foram assinadas
 */

// Carregar variáveis de ambiente
require('dotenv').config();

const { supabase } = require('../config/database');

async function updateDraftProposalsToNull() {
  try {
    console.log('🔧 Atualizando serviços de propostas não assinadas...\n');

    // Buscar propostas que não foram assinadas (draft, sent, rejected, expired)
    const { data: proposals, error: proposalsError } = await supabase
      .from('proposals')
      .select('id, proposal_number, status')
      .in('status', ['draft', 'sent', 'rejected', 'expired']);

    if (proposalsError) {
      console.error('❌ Erro ao buscar propostas:', proposalsError);
      throw proposalsError;
    }

    if (!proposals || proposals.length === 0) {
      console.log('ℹ️ Nenhuma proposta não assinada encontrada.');
      return;
    }

    console.log(`📊 Encontradas ${proposals.length} propostas não assinadas\n`);

    let servicesUpdated = 0;

    for (const proposal of proposals) {
      console.log(`📝 Processando ${proposal.proposal_number} (${proposal.status})...`);

      // Atualizar serviços desta proposta que estão com selected_by_client = false
      const { data: updated, error: updateError } = await supabase
        .from('proposal_services')
        .update({ selected_by_client: null })
        .eq('proposal_id', proposal.id)
        .eq('selected_by_client', false)
        .select('id');

      if (updateError) {
        console.error(`   ❌ Erro ao atualizar serviços:`, updateError);
        continue;
      }

      const count = updated?.length || 0;
      if (count > 0) {
        console.log(`   ✅ ${count} serviço(s) atualizado(s)`);
        servicesUpdated += count;
      } else {
        console.log(`   ℹ️ Nenhum serviço precisava de atualização`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Atualização concluída!');
    console.log(`📊 Resumo:`);
    console.log(`   - Propostas processadas: ${proposals.length}`);
    console.log(`   - Total de serviços atualizados: ${servicesUpdated}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Erro durante a execução:', error);
    throw error;
  }
}

// Executar
if (require.main === module) {
  updateDraftProposalsToNull()
    .then(() => {
      console.log('\n✅ Script executado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = { updateDraftProposalsToNull };
