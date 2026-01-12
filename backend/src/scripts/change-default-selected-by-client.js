/**
 * Script para alterar o valor padrão de selected_by_client de false para null
 * Isso permite diferenciar entre:
 * - null: cliente ainda não interagiu
 * - true: cliente selecionou o serviço
 * - false: cliente explicitamente não selecionou o serviço
 */

// Carregar variáveis de ambiente
require('dotenv').config();

const { supabase } = require('../config/database');

async function changeDefaultValue() {
  try {
    console.log('🔧 Alterando valor padrão de selected_by_client...\n');

    // Executar SQL para alterar o valor padrão
    const { error } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE proposal_services
            ALTER COLUMN selected_by_client DROP DEFAULT;`
    });

    if (error) {
      console.error('❌ Erro ao alterar valor padrão:', error);
      console.log('\n⚠️ Você precisará executar este SQL manualmente no Supabase:');
      console.log('\nALTER TABLE proposal_services ALTER COLUMN selected_by_client DROP DEFAULT;');
      console.log('\nIsso remove o valor padrão FALSE, fazendo com que novos registros tenham NULL por padrão.');
    } else {
      console.log('✅ Valor padrão alterado com sucesso!');
      console.log('   selected_by_client agora será NULL por padrão em novos registros');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('\n❌ Erro durante a execução:', error);
    console.log('\n⚠️ Execute este SQL manualmente no Supabase SQL Editor:');
    console.log('\nALTER TABLE proposal_services ALTER COLUMN selected_by_client DROP DEFAULT;');
  }
}

// Executar
if (require.main === module) {
  changeDefaultValue()
    .then(() => {
      console.log('\n✅ Script finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro:', error);
      process.exit(1);
    });
}

module.exports = { changeDefaultValue };
