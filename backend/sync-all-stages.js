require('dotenv').config();
const { supabase } = require('./src/config/database');
const ServiceStage = require('./src/models/ServiceStage');

async function syncAllStages() {
  try {
    console.log('🔄 Iniciando sincronização de etapas para todos os contratos...\n');

    // Buscar todos os serviços únicos que estão em contract_services
    const { data: contractServices, error } = await supabase
      .from('contract_services')
      .select('service_id')
      .order('service_id');

    if (error) {
      console.error('❌ Erro ao buscar contract_services:', error);
      return;
    }

    // Obter IDs únicos de serviços
    const uniqueServiceIds = [...new Set(contractServices.map(cs => cs.service_id))];
    console.log(`📊 Total de serviços únicos encontrados: ${uniqueServiceIds.length}\n`);

    let totalCreated = 0;
    let totalUpdated = 0;

    // Sincronizar etapas para cada serviço
    for (const serviceId of uniqueServiceIds) {
      console.log(`\n🔄 Sincronizando serviço ID: ${serviceId}`);
      
      try {
        const result = await ServiceStage.syncStagesToContractServices(serviceId);
        totalCreated += result.created || 0;
        totalUpdated += result.updated || 0;
        
        console.log(`✅ Serviço ${serviceId}: ${result.created} criadas, ${result.updated} atualizadas`);
      } catch (syncError) {
        console.error(`❌ Erro ao sincronizar serviço ${serviceId}:`, syncError.message);
      }
    }

    console.log(`\n✅ Sincronização concluída!`);
    console.log(`📊 Total de etapas criadas: ${totalCreated}`);
    console.log(`📊 Total de etapas atualizadas: ${totalUpdated}`);

  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    process.exit(0);
  }
}

syncAllStages();
