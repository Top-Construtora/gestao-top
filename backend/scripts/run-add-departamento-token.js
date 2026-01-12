const { supabase } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔧 Adicionando campo unique_token na tabela pe_departamentos...');

    const sqlPath = path.join(__dirname, 'add-departamento-unique-token.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('\n⚠️  Este script precisa ser executado manualmente no Dashboard do Supabase.');
    console.log('📋 Copie e execute o SQL abaixo no SQL Editor do Supabase:\n');
    console.log('='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80));
    console.log('\n✅ Após executar o SQL no Supabase, pressione CTRL+C para sair.');

    // Nota: Supabase não permite execução direta de DDL via API por questões de segurança
    // O SQL precisa ser executado manualmente no Dashboard

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

runMigration();
