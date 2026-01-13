const { User, Role } = require('../models');
const bcrypt = require('bcryptjs');
const authConfig = require('../config/auth');
const emailService = require('./emailService');
const NotificationService = require('./notificationService');

const generateSecurePassword = () => {
  const length = 8;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const charset = lowercase + uppercase + numbers + special;
  
  let password = '';
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));

  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

class UserService {
  async createUser(userData, creatorRole, creatorId) {
    if (creatorRole !== 'admin') {
      throw new Error('Sem permissão para criar usuários');
    }

    const temporaryPassword = generateSecurePassword(); 
    const { email, name, role = 'user', cargo } = userData;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new Error('Email já cadastrado');
    }

    const roleData = await Role.findByName(role);
    if (!roleData) {
      throw new Error('Role inválida');
    }
    
    const user = await User.create({
      email,
      password: temporaryPassword,
      name,
      roleId: roleData.id,
      must_change_password: true,
      cargo
    });

    // Enviar email de boas-vindas de forma assíncrona (não bloqueia a resposta)
    emailService.sendWelcomeEmailWithCredentials(email, name, temporaryPassword)
      .then(() => console.log('✅ Email de boas-vindas enviado para:', email))
      .catch(emailError => console.error('❌ Erro ao enviar email de boas-vindas:', emailError.message));

    // Notificar administradores sobre novo usuário criado de forma assíncrona
    if (creatorId) {
      NotificationService.notifyAdminsNewUser(user.id, creatorId)
        .catch(notifyError => console.error('❌ Erro ao notificar admins:', notifyError.message));
    }

    return {
      ...user,
      role_name: role,
      temporary_password: temporaryPassword,
      must_change_password: true
    };
  }

  async listUsers(userRole, filters = {}) {
    if (userRole !== 'admin' && userRole !== 'admin_gerencial' && userRole !== 'consultor_rs') {
      throw new Error('Sem permissão para listar usuários');
    }

    return await User.findAll(filters);
  }

  async updateUser(id, data, updaterRole) {
    // Apenas admins podem atualizar usuários
    if (updaterRole !== 'admin') {
      throw new Error('Sem permissão para atualizar usuários');
    }

    // Se está atualizando senha, fazer hash
    if (data.password) {
      data.password = await bcrypt.hash(data.password, authConfig.bcrypt.saltRounds);
      data.must_change_password = true;
      data.last_password_change = null;
    }

    // Se está atualizando role, buscar o ID
    if (data.role) {
      const roleData = await Role.findByName(data.role);
      if (!roleData) {
        throw new Error('Role inválida');
      }
      data.role_id = roleData.id;
      delete data.role;
    }

    const updatedUser = await User.update(id, data);
    if (!updatedUser) {
      throw new Error('Usuário não encontrado');
    }

    return updatedUser;
  }

  async softDeleteUser(id, deleterRole) {
    if (deleterRole !== 'admin') {
      throw new Error('Apenas administradores podem realizar esta ação.');
    }
    const user = await User.findById(id);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }
    return await User.softDelete(id); // Assumes softDelete exists in the model
  }

  async hardDeleteUser(id, deleterRole) {
    if (deleterRole !== 'admin') {
      throw new Error('Apenas administradores podem excluir usuários permanentemente.');
    }
    const user = await User.findById(id);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }
    return await User.hardDelete(id);
  }

  async toggleUserStatus(id, updaterRole) {
    if (updaterRole !== 'admin') {
      throw new Error('Sem permissão para alterar status de usuários');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    return await User.update(id, { is_active: !user.is_active });
  }

  async resetPasswordForUser(userIdToReset) {
    const user = await User.findById(userIdToReset);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const temporaryPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, authConfig.bcrypt.saltRounds);

    await User.update(userIdToReset, {
      password: hashedPassword,
      must_change_password: true,
      last_password_change: null
    });

    // Enviar email de forma assíncrona (não bloqueia a resposta)
    emailService.sendAdminPasswordResetEmail(user.email, user.name, temporaryPassword)
      .then(() => console.log('✅ Email de reset de senha enviado para:', user.email))
      .catch(err => console.error('❌ Erro ao enviar email de reset:', err.message));

    return { success: true };
  }

  async updateTeamVisibility(id, showInTeam, updaterRole) {
    if (updaterRole !== 'admin') {
      throw new Error('Sem permissão para alterar visibilidade na equipe');
    }

    const user = await User.findById(id);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    return await User.update(id, { show_in_team: showInTeam });
  }

  async getTeamMembers() {
    // Buscar usuários ativos marcados para aparecer na equipe
    const teamMembers = await User.findTeamMembers();
    
    // Sempre incluir Mariana TOP como CEO & Founder (fixa)
    const marianaFixed = {
      id: 'ceo-founder',
      name: 'Mariana TOP',
      cargo: 'CEO & Founder',
      profile_picture_path: null,
      profile_picture_url: '/naue2.jpg', // Imagem fixa
      is_fixed: true
    };
    
    return [marianaFixed, ...teamMembers];
  }
}

module.exports = new UserService();