import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './help-page.html',
  styleUrls: ['./help-page.css']
})
export class HelpPageComponent {
  
  helpCards = [
    {
      icon: 'fas fa-book-open',
      title: 'Documentação',
      description: 'Acesse o manual completo do sistema com guias detalhados e instruções passo a passo.',
      buttonText: 'Acessar Documentação',
      buttonIcon: 'fas fa-external-link-alt',
      features: [
        'Manual de usuário completo',
        'Guias de funcionalidades',
        'Perguntas frequentes',
        'Glossário de termos'
      ]
    },
    {
      icon: 'fas fa-play-circle',
      title: 'Tutoriais em Vídeo',
      description: 'Aprenda a usar o sistema com nossos tutoriais em vídeo explicativos e práticos.',
      buttonText: 'Ver Tutoriais',
      buttonIcon: 'fas fa-video',
      features: [
        'Vídeos passo a passo',
        'Casos práticos de uso',
        'Dicas e truques',
        'Atualizações semanais'
      ]
    },
    {
      icon: 'fas fa-headset',
      title: 'Suporte Técnico',
      description: 'Nossa equipe especializada está pronta para ajudar você com qualquer dúvida técnica.',
      buttonText: 'Abrir Chamado',
      buttonIcon: 'fas fa-ticket-alt',
      features: [
        'Suporte especializado',
        'Resposta em até 2h',
        'Acompanhamento de chamados',
        'Relatórios de resolução'
      ]
    }
  ];
  
  onHelpAction(action: string) {
    console.log('Help action:', action);
    
    switch(action) {
      case 'Documentação':
        this.openDocumentation();
        break;
      case 'Tutoriais em Vídeo':
        this.openTutorials();
        break;
      case 'Suporte Técnico':
        this.openSupportTicket();
        break;
      case 'Sugestões':
        this.openSuggestionPortal();
        break;
    }
  }

  openEmailSupport() {
    const subject = encodeURIComponent('Solicitação de Suporte - Sistema de Gestão de Contratos');
    const body = encodeURIComponent(
      'Olá equipe de suporte,\n\n' +
      'Preciso de ajuda com:\n' +
      '- [Descreva sua dúvida ou problema aqui]\n\n' +
      'Informações adicionais:\n' +
      '- Usuário: [Seu nome]\n' +
      '- Empresa: [Nome da empresa]\n' +
      '- Funcionalidade: [Área do sistema relacionada]\n\n' +
      'Obrigado!'
    );
    
    window.open(`mailto:suporte@naueconsultoria.com.br?subject=${subject}&body=${body}`, '_self');
  }

  openWhatsAppSupport() {
    const message = encodeURIComponent(
      'Olá! Preciso de ajuda com o Sistema de Gestão de Contratos da TOP Construtora. ' +
      'Pode me auxiliar?'
    );
    
    // Número do WhatsApp da TOP Construtora (exemplo)
    const phoneNumber = '5511999999999';
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  }

  private openDocumentation() {
    // Abrir documentação online ou PDF
    window.open('https://docs.naueconsultoria.com.br/contratos', '_blank');
  }

  private openTutorials() {
    // Abrir canal do YouTube ou plataforma de vídeos
    window.open('https://www.youtube.com/c/TOPConsultoria', '_blank');
  }

  private openSupportTicket() {
    // Abrir sistema de tickets ou formulário
    window.open('https://suporte.naueconsultoria.com.br/novo-chamado', '_blank');
  }


  private openSuggestionPortal() {
    // Abrir portal de sugestões
    window.open('https://ideias.naueconsultoria.com.br', '_blank');
  }
}