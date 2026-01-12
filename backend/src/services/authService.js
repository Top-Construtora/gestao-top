const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authConfig = require('../config/auth');
const { User } = require('../models');
const emailService = require('./emailService');

class AuthService {
  async login(email, password) {
    // Buscar usuário com todos os campos necessários
    const user = await User.findByEmail(email);
    if (!user) {
      throw new Error('Credenciais inválidas');
    }

    // Verificar se usuário está ativo
    if (!user.is_active) {
      throw new Error('Usuário inativo. Entre em contato com o administrador.');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Credenciais inválidas');
    }

    // *** ATUALIZAR ÚLTIMO LOGIN ***
    try {
      await User.updateLastLogin(user.id);
    } catch (error) {
      console.warn('⚠️ Erro ao atualizar tracking de login:', error.message);
      // Não falhar o login por causa do tracking
    }

    // Buscar permissões do usuário
    const permissions = await User.getUserPermissions(user.id);

    // Verificar se precisa trocar senha
    const mustChangePassword = user.must_change_password === true;
    
    console.log('🔍 Login - must_change_password:', mustChangePassword);
    console.log('🔍 Login - user.must_change_password raw:', user.must_change_password);

    // Remover senha do objeto retornado
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role_name,
      role_id: user.role_id,
      permissions,
      must_change_password: mustChangePassword,
      first_login: !user.first_login_at,
      last_login_at: user.last_login_at,
      login_count: user.login_count
    };

    // Gerar token
    const token = this.generateToken(user.id, user.role_name, permissions);

    return { 
      user: userResponse, 
      token,
      must_change_password: mustChangePassword
    };
  }

  async changePassword(userId, currentPassword, newPassword) {
    // Buscar usuário com senha
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Verificar senha atual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new Error('Senha atual incorreta');
    }

    // Verificar se a nova senha é diferente da atual
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new Error('A nova senha deve ser diferente da senha atual');
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcrypt.saltRounds);

    // Atualizar senha e flags
    await User.updatePassword(userId, hashedPassword);
    await User.update(userId, {
      must_change_password: false,
      last_password_change: new Date().toISOString()
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async changePasswordFirstLogin(userId, newPassword) {
    // Buscar usuário
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Verificar se realmente precisa trocar a senha
    if (!user.must_change_password) {
      throw new Error('Usuário não precisa trocar a senha');
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcrypt.saltRounds);

    // Atualizar senha e flags
    await User.updatePassword(userId, hashedPassword);
    await User.update(userId, {
      must_change_password: false,
      last_password_change: new Date().toISOString(),
      first_login_at: user.first_login_at || new Date().toISOString()
    });

    // Gerar novo token
    const permissions = await User.getUserPermissions(userId);
    const token = this.generateToken(userId, user.role_name, permissions);

    return {
      message: 'Senha alterada com sucesso',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role_name,
        role_id: user.role_id,
        permissions,
        must_change_password: false
      }
    };
  }

  async forgotPassword(email) {
    const user = await User.findByEmail(email);
    if (!user) {
      // Não revelar se o email existe ou não (segurança)
      return { message: 'Se o email existir no sistema, você receberá instruções de recuperação' };
    }

    // Verificar se usuário está ativo
    if (!user.is_active) {
      return { message: 'Se o email existir no sistema, você receberá instruções de recuperação' };
    }

    // Gerar código de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash do código para armazenar no banco
    const hashedToken = crypto.createHash('sha256').update(resetCode).digest('hex');
    const expires = new Date(Date.now() + 60 * 15 * 1000); // 15 minutos

    // Salvar token no banco
    await User.setResetToken(email, hashedToken, expires);

    // Enviar email com o código
    await emailService.sendPasswordResetCode(email, user.name, resetCode);

    return { message: 'Se o email existir no sistema, você receberá instruções de recuperação' };
  }

  async resetPassword(token, newPassword) {
    // Hash do token recebido (que é o código de 6 dígitos)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Buscar usuário pelo token
    const user = await User.findByResetToken(hashedToken);
    if (!user) {
      throw new Error('Código inválido ou expirado');
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcrypt.saltRounds);

    // Atualizar senha
    await User.updatePassword(user.id, hashedPassword);

    return { message: 'Senha alterada com sucesso' };
  }

  async validateResetToken(token) {
    // Hash do token recebido
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Verificar se o token existe e não expirou
    const user = await User.findByResetToken(hashedToken);
    if (!user) {
      throw new Error('Código inválido ou expirado');
    }

    return { valid: true, email: user.email };
  }

  generateToken(userId, role, permissions = []) {
    return jwt.sign(
      { userId, role, permissions },
      authConfig.jwt.secret,
      { expiresIn: authConfig.jwt.expiresIn }
    );
  }

  verifyToken(token) {
    return jwt.verify(token, authConfig.jwt.secret);
  }
}

module.exports = new AuthService();