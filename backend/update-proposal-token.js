require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function updateProposalToken() {
  const newToken = 'prop_aeda89ed55c166ea44c1dfb55a7c936dc8c31e73dbccabc7';
  const proposalId = 34; // ID da proposta PROP-${new Date().getFullYear()}-0001
  
  console.log('🔄 Atualizando token da proposta ID:', proposalId);
  console.log('Novo token:', newToken);
  
  const { data, error } = await supabase
    .from('proposals')
    .update({ unique_link: newToken })
    .eq('id', proposalId)
    .select();
    
  if (error) {
    console.log('❌ Erro ao atualizar token:', error.message);
  } else {
    console.log('✅ Token atualizado com sucesso!');
  }
  
  process.exit(0);
}

updateProposalToken().catch(console.error);