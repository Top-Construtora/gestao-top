/**
 * Script para corrigir propostas assinadas onde todos os serviços deveriam estar selecionados
 * mas estão marcados como false
 */

// Carregar variáveis de ambiente
require('dotenv').config();

const { supabase } = require('../config/database');

async function fixSignedProposalsAllServices() {
  try {
    console.log('🔧 Iniciando correção de propostas assinadas...\n');

    // Buscar todas as propostas assinadas ou convertidas (não contrapropostas)
    const { data: proposals, error: proposalsError } = await supabase
      .from('proposals')
      .select('id, proposal_number, status, total_value')
      .in('status', ['signed', 'converted']);

    if (proposalsError) {
      console.error('❌ Erro ao buscar propostas:', proposalsError);
      throw proposalsError;
    }

    if (!proposals || proposals.length === 0) {
      console.log('ℹ️ Nenhuma proposta encontrada.');
      return;
    }

    console.log(`📊 Encontradas ${proposals.length} propostas\n`);

    let proposalsFixed = 0;
    let servicesFixed = 0;

    for (const proposal of proposals) {
      console.log(`\n📝 Analisando proposta ${proposal.proposal_number}...`);

      // Buscar todos os serviços da proposta
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select('id, service_name, total_value, selected_by_client')
        .eq('proposal_id', proposal.id);

      if (servicesError) {
        console.error(`   ❌ Erro ao buscar serviços:`, servicesError);
        continue;
      }

      if (!services || services.length === 0) {
        console.log(`   ⚠️ Nenhum serviço encontrado`);
        continue;
      }

      // Calcular valor total dos serviços
      const totalServicesValue = services.reduce((sum, s) => sum + (s.total_value || 0), 0);

      // Contar quantos estão selecionados e não selecionados
      const selectedCount = services.filter(s => s.selected_by_client === true).length;
      const notSelectedCount = services.filter(s => s.selected_by_client === false).length;

      console.log(`   Total de serviços: ${services.length}`);
      console.log(`   Selecionados: ${selectedCount}`);
      console.log(`   Não selecionados: ${notSelectedCount}`);
      console.log(`   Valor total da proposta: R$ ${proposal.total_value.toFixed(2)}`);
      console.log(`   Valor total dos serviços: R$ ${totalServicesValue.toFixed(2)}`);

      // Verificar se o valor total da proposta bate com o valor total dos serviços
      // E se todos os serviços estão marcados como false
      // Isso indica que todos deveriam estar selecionados
      const valueMatches = Math.abs(totalServicesValue - proposal.total_value) < 0.02; // tolerância de 2 centavos
      const allNotSelected = notSelectedCount === services.length;

      if (valueMatches && allNotSelected) {
        console.log(`   🔄 CORRIGINDO: Todos os serviços serão marcados como selecionados...`);

        for (const service of services) {
          const { error: updateError } = await supabase
            .from('proposal_services')
            .update({ selected_by_client: true })
            .eq('id', service.id);

          if (updateError) {
            console.error(`      ❌ Erro ao atualizar serviço ${service.id}:`, updateError);
          } else {
            console.log(`      ✓ ${service.service_name}`);
            servicesFixed++;
          }
        }

        proposalsFixed++;
        console.log(`   ✅ Proposta corrigida!`);
      } else if (valueMatches && selectedCount === services.length) {
        console.log(`   ✅ Proposta já está correta (todos selecionados)`);
      } else {
        console.log(`   ℹ️ Proposta não precisa de correção (contraproposta ou valores diferentes)`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Correção concluída!');
    console.log(`📊 Resumo:`);
    console.log(`   - Propostas analisadas: ${proposals.length}`);
    console.log(`   - Propostas corrigidas: ${proposalsFixed}`);
    console.log(`   - Total de serviços atualizados: ${servicesFixed}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Erro durante a execução do script:', error);
    throw error;
  }
}

// Executar o script
if (require.main === module) {
  fixSignedProposalsAllServices()
    .then(() => {
      console.log('\n✅ Script executado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = { fixSignedProposalsAllServices };
