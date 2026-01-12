const crypto = require('crypto');

/**
 * Gera um token único e seguro
 * @param {number} length - Tamanho do token em bytes (padrão: 32)
 * @returns {string} Token hexadecimal
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Gera um token de proposta com prefixo para identificação
 * @returns {string} Token formatado para proposta
 */
function generateProposalToken() {
  // Prefixo para identificar tokens de proposta + token aleatório
  const prefix = 'prop';
  const token = generateSecureToken(24); // 48 caracteres hexadecimais
  return `${prefix}_${token}`;
}

/**
 * Valida se um token tem o formato correto de proposta
 * @param {string} token - Token a ser validado
 * @returns {boolean} True se o token é válido
 */
function isValidProposalToken(token) {
  if (!token || typeof token !== 'string') return false;
  
  // Verifica formato: prop_[caracteres hexadecimais com tamanho mínimo de 32]
  // Aceita tokens com comprimento variável para compatibilidade
  const pattern = /^prop_[a-f0-9]{32,}$/;
  return pattern.test(token);
}

module.exports = {
  generateSecureToken,
  generateProposalToken,
  isValidProposalToken
};