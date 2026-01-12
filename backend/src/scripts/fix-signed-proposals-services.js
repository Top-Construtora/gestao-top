/**
 * Script para corrigir serviços de propostas já assinadas
 * Marca todos os serviços como selected_by_client = true para propostas
 * com status 'signed' ou 'converted' onde os serviços não têm seleção definida
 */

// Carregar variáveis de ambiente
require('dotenv').config();

const { supabase } = require('../config/database');

async function fixSignedProposalsServices() {
  try {
    console.log('🔧 Iniciando correção de serviços de propostas assinadas...');

    // 1. Buscar todas as propostas assinadas ou convertidas
    const { data: signedProposals, error: proposalsError } = await supabase
      .from('proposals')
      .select('id, proposal_number, status')
      .in('status', ['signed', 'converted']);

    if (proposalsError) {
      console.error('❌ Erro ao buscar propostas:', proposalsError);
      throw proposalsError;
    }

    if (!signedProposals || signedProposals.length === 0) {
      console.log('ℹ️ Nenhuma proposta assinada ou convertida encontrada.');
      return;
    }

    console.log(`📊 Encontradas ${signedProposals.length} propostas assinadas/convertidas`);

    let totalServicesUpdated = 0;
    let proposalsProcessed = 0;

    // 2. Para cada proposta, buscar seus serviços e atualizar
    for (const proposal of signedProposals) {
      console.log(`\n📝 Processando proposta ${proposal.proposal_number} (${proposal.status})...`);

      // Buscar serviços da proposta onde selected_by_client é null ou undefined
      const { data: services, error: servicesError } = await supabase
        .from('proposal_services')
        .select('id, service_id, service_name, selected_by_client')
        .eq('proposal_id', proposal.id);

      if (servicesError) {
        console.error(`❌ Erro ao buscar serviços da proposta ${proposal.proposal_number}:`, servicesError);
        continue;
      }

      if (!services || services.length === 0) {
        console.log(`⚠️ Proposta ${proposal.proposal_number} não possui serviços`);
        continue;
      }

      // Filtrar apenas serviços que não têm selected_by_client definido (null ou undefined)
      const servicesToUpdate = services.filter(s => s.selected_by_client === null || s.selected_by_client === undefined);

      if (servicesToUpdate.length === 0) {
        console.log(`✅ Proposta ${proposal.proposal_number} já tem todos os serviços marcados corretamente`);
        proposalsProcessed++;
        continue;
      }

      console.log(`🔄 Atualizando ${servicesToUpdate.length} serviços da proposta ${proposal.proposal_number}...`);

      // Atualizar cada serviço para selected_by_client = true
      for (const service of servicesToUpdate) {
        const { error: updateError } = await supabase
          .from('proposal_services')
          .update({ selected_by_client: true })
          .eq('id', service.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar serviço ${service.id}:`, updateError);
        } else {
          console.log(`  ✓ Serviço "${service.service_name}" atualizado`);
          totalServicesUpdated++;
        }
      }

      proposalsProcessed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Correção concluída!');
    console.log(`📊 Resumo:`);
    console.log(`   - Propostas processadas: ${proposalsProcessed}/${signedProposals.length}`);
    console.log(`   - Total de serviços atualizados: ${totalServicesUpdated}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Erro durante a execução do script:', error);
    throw error;
  }
}

// Executar o script
if (require.main === module) {
  fixSignedProposalsServices()
    .then(() => {
      console.log('\n✅ Script executado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = { fixSignedProposalsServices };
