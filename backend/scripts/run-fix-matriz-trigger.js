const { supabase } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔧 Executando correção do trigger da matriz...');

    const sqlPath = path.join(__dirname, '../migrations/fix_matriz_trigger.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Executar SQL via RPC ou diretamente se tiver acesso
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Erro ao executar migration:', error);
      console.log('\n⚠️  Você precisa executar este SQL manualmente no Dashboard do Supabase:');
      console.log(sql);
      process.exit(1);
    }

    console.log('✅ Trigger corrigido com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    console.log('\n⚠️  Execute este SQL manualmente no Dashboard do Supabase (SQL Editor):');

    const sqlPath = path.join(__dirname, '../migrations/fix_matriz_trigger.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(sql);

    process.exit(1);
  }
}

runMigration();
