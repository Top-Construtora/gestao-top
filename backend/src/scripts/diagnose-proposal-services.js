/**
 * Script para diagnosticar o estado dos serviços de propostas assinadas
 */

// Carregar variáveis de ambiente
require('dotenv').config();

const { supabase } = require('../config/database');

async function diagnoseProposalServices() {
  try {
    console.log('🔍 Diagnosticando serviços de propostas assinadas...\n');

    // Buscar todas as propostas assinadas ou convertidas
    const { data: proposals, error: proposalsError } = await supabase
      .from('proposals')
      .select('id, proposal_number, status, total_value')
      .in('status', ['signed', 'converted', 'contraproposta']);

    if (proposalsError) {
      console.error('❌ Erro ao buscar propostas:', proposalsError);
      throw proposalsError;
    }

    if (!proposals || proposals.length === 0) {
      console.log('ℹ️ Nenhuma proposta encontrada.');
      return;
    }

    console.log(`📊 Encontradas ${proposals.length} propostas\n`);
    console.log('='.repeat(80));

    for (const proposal of proposals) {
      console.log(`\n📝 Proposta: ${proposal.proposal_number}`);
      console.log(`   Status: ${proposal.status}`);
      console.log(`   Valor Total: R$ ${(proposal.total_value || 0).toFixed(2)}`);

      // Buscar serviços
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select('id, service_id, service_name, total_value, selected_by_client')
        .eq('proposal_id', proposal.id)
        .order('sort_order');

      if (servicesError) {
        console.error(`   ❌ Erro ao buscar serviços:`, servicesError);
        continue;
      }

      if (!services || services.length === 0) {
        console.log(`   ⚠️ Nenhum serviço encontrado`);
        continue;
      }

      console.log(`   Total de serviços: ${services.length}`);
      console.log(`\n   Detalhes dos serviços:`);

      let allSelected = true;
      let allNotSelected = true;
      let someNull = false;
      let totalSelectedValue = 0;

      services.forEach((service, index) => {
        const selectionStatus =
          service.selected_by_client === true ? '✅ SELECIONADO' :
          service.selected_by_client === false ? '❌ NÃO SELECIONADO' :
          '⚠️ NULL/UNDEFINED';

        console.log(`   ${index + 1}. ${service.service_name}`);
        console.log(`      - Valor: R$ ${(service.total_value || 0).toFixed(2)}`);
        console.log(`      - Status: ${selectionStatus}`);
        console.log(`      - Campo: selected_by_client = ${service.selected_by_client}`);

        if (service.selected_by_client === true) {
          allNotSelected = false;
          totalSelectedValue += service.total_value || 0;
        } else if (service.selected_by_client === false) {
          allSelected = false;
        } else {
          someNull = true;
          allSelected = false;
          allNotSelected = false;
        }
      });

      console.log(`\n   📊 Resumo da seleção:`);
      console.log(`      - Todos selecionados: ${allSelected ? 'SIM' : 'NÃO'}`);
      console.log(`      - Todos não selecionados: ${allNotSelected ? 'SIM' : 'NÃO'}`);
      console.log(`      - Algum NULL: ${someNull ? 'SIM' : 'NÃO'}`);
      console.log(`      - Valor total dos selecionados: R$ ${totalSelectedValue.toFixed(2)}`);
      console.log(`      - Valor total da proposta: R$ ${(proposal.total_value || 0).toFixed(2)}`);

      if (totalSelectedValue !== proposal.total_value) {
        console.log(`      ⚠️ DIVERGÊNCIA: Valor dos serviços selecionados diferente do total da proposta!`);
      }

      console.log('\n' + '-'.repeat(80));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Diagnóstico concluído!');

  } catch (error) {
    console.error('\n❌ Erro durante a execução do script:', error);
    throw error;
  }
}

// Executar o script
if (require.main === module) {
  diagnoseProposalServices()
    .then(() => {
      console.log('\n✅ Script executado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = { diagnoseProposalServices };
