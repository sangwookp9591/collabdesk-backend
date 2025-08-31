import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface WorkspaceInviteEmailData {
  to: string;
  inviterName: string;
  workspaceName: string;
  code: string;
  expiresAt: Date;
}

export interface ChannelInviteEmailData {
  to: string;
  inviterName: string;
  channelName: string;
  workspaceName: string;
  code: string;
  expiresAt: Date;
  isGuestInvite: boolean;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: this.configService.get('SMTP_PORT') === 465, // true for 465, false for other ports
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    this.setupMailService();
  }

  private setupMailService() {
    this.transporter
      .verify()
      .then(() => {
        this.logger.log('MailService  successfully');
      })
      .catch((error) => {
        this.logger.error('MailService connection error:', error);
      });
  }

  // 워크스페이스 초대 이메일 발송
  async sendWorkspaceInvite(data: WorkspaceInviteEmailData): Promise<void> {
    const { to, inviterName, workspaceName, code, expiresAt } = data;

    const inviteUrl = `${this.configService.get('FRONTEND_URL')}/onboarding/invite?type=workspace&code=${code}`;
    const expiresAtFormatted = expiresAt.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = this.generateWorkspaceInviteTemplate({
      inviterName,
      workspaceName,
      inviteUrl,
      expiresAt: expiresAtFormatted,
      recipientEmail: to,
    });

    const mailOptions = {
      from: `"CollabDesk Team" <${this.configService.get('SMTP_USER')}>`,
      to,
      subject: `${inviterName}님이 ${workspaceName} 워크스페이스로 초대했습니다`,
      html,
      // 텍스트 버전 (HTML을 지원하지 않는 클라이언트용)
      text: `
        ${inviterName}님이 당신을 ${workspaceName} 워크스페이스로 초대했습니다.
        
        아래 링크를 클릭하여 초대를 수락하세요:
        ${inviteUrl}
        
        이 초대는 ${expiresAtFormatted}까지 유효합니다.
        
        CollabDesk 팀 드림
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Workspace invite email sent to ${to}`);
    } catch (error) {
      this.logger.error('Failed to send workspace invite email:', error);
      throw error;
    }
  }

  // 채널 초대 이메일 발송
  async sendChannelInvite(data: ChannelInviteEmailData): Promise<void> {
    const {
      to,
      inviterName,
      channelName,
      workspaceName,
      code,
      expiresAt,
      isGuestInvite,
    } = data;

    const inviteUrl = `${this.configService.get('FRONTEND_URL')}/onboarding/invite?type=channel&code=${code}`;
    const expiresAtFormatted = expiresAt.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = this.generateChannelInviteTemplate({
      inviterName,
      channelName,
      workspaceName,
      inviteUrl,
      expiresAt: expiresAtFormatted,
      isGuestInvite,
      recipientEmail: to,
    });

    const guestText = isGuestInvite ? ' 게스트로' : '';
    const mailOptions = {
      from: `"CollabDesk Team" <${this.configService.get('SMTP_USER')}>`,
      to,
      subject: `${inviterName}님이 #${channelName} 채널로${guestText} 초대했습니다`,
      html,
      text: `
        ${inviterName}님이 당신을 ${workspaceName}의 #${channelName} 채널로${guestText} 초대했습니다.
        
        아래 링크를 클릭하여 초대를 수락하세요:
        ${inviteUrl}
        
        이 초대는 ${expiresAtFormatted}까지 유효합니다.
        
        CollabDesk 팀 드림
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Channel invite email sent to ${to}`);
    } catch (error) {
      this.logger.error('Failed to send channel invite email:', error);
      throw error;
    }
  }

  // 워크스페이스 초대 HTML 템플릿 생성
  private generateWorkspaceInviteTemplate(data: {
    inviterName: string;
    workspaceName: string;
    inviteUrl: string;
    expiresAt: string;
    recipientEmail: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>워크스페이스 초대</title>
        <style>
          ${this.getEmailStyles()}
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header">
            <div class="logo">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#6366F1"/>
                <path d="M8 12h16v2H8v-2zm0 4h16v2H8v-2zm0 4h12v2H8v-2z" fill="white"/>
              </svg>
              <h1>CollabDesk</h1>
            </div>
          </div>

          <!-- Main Content -->
          <div class="content">
            <div class="invite-card">
              <div class="invite-header">
                <div class="workspace-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="48" height="48" rx="12" fill="#F3F4F6"/>
                    <path d="M16 20h16v2H16v-2zm0 4h16v2H16v-2zm0 4h12v2H16v-2z" fill="#6B7280"/>
                  </svg>
                </div>
                <h2>워크스페이스 초대</h2>
              </div>

              <div class="invite-body">
                <p class="greeting">안녕하세요,</p>
                <p class="main-text">
                  <strong>${data.inviterName}</strong>님이 당신을 
                  <strong class="workspace-name">${data.workspaceName}</strong> 워크스페이스로 초대했습니다.
                </p>
                <p class="description">
                  이 워크스페이스에서 팀과 함께 협업하고, 프로젝트를 관리하며, 
                  실시간으로 소통할 수 있습니다.
                </p>

                <div class="cta-section">
                  <a href="${data.inviteUrl}" class="cta-button">초대 수락하기</a>
                  <p class="cta-text">또는 아래 링크를 복사하여 브라우저에 붙여넣으세요:</p>
                  <div class="link-box">
                    <code>${data.inviteUrl}</code>
                  </div>
                </div>

                <div class="info-box">
                  <div class="info-item">
                    <span class="info-label">초대자:</span>
                    <span class="info-value">${data.inviterName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">워크스페이스:</span>
                    <span class="info-value">${data.workspaceName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">만료일:</span>
                    <span class="info-value">${data.expiresAt}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="features">
              <h3>CollabDesk와 함께 할 수 있는 일들</h3>
              <div class="feature-list">
                <div class="feature-item">
                  <div class="feature-icon">💬</div>
                  <div class="feature-text">
                    <h4>실시간 채팅</h4>
                    <p>팀과 실시간으로 소통하고 아이디어를 공유하세요</p>
                  </div>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">📋</div>
                  <div class="feature-text">
                    <h4>프로젝트 관리</h4>
                    <p>작업을 체계적으로 관리하고 진행상황을 추적하세요</p>
                  </div>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">📁</div>
                  <div class="feature-text">
                    <h4>파일 공유</h4>
                    <p>문서와 파일을 안전하게 공유하고 관리하세요</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>이 초대를 요청하지 않으셨나요? 이 이메일을 무시하셔도 됩니다.</p>
            <div class="footer-links">
              <a href="#">개인정보처리방침</a>
              <span>•</span>
              <a href="#">서비스 약관</a>
              <span>•</span>
              <a href="#">고객지원</a>
            </div>
            <p class="copyright">© 2025 CollabDesk. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
      `;
  }

  // 채널 초대 HTML 템플릿 생성
  private generateChannelInviteTemplate(data: {
    inviterName: string;
    channelName: string;
    workspaceName: string;
    inviteUrl: string;
    expiresAt: string;
    isGuestInvite: boolean;
    recipientEmail: string;
  }): string {
    const guestBadge = data.isGuestInvite
      ? '<span class="guest-badge">게스트</span>'
      : '';
    const guestText = data.isGuestInvite ? '게스트로 ' : '';
    const guestDescription = data.isGuestInvite
      ? '게스트로 참여하여 이 채널에서만 활동할 수 있습니다.'
      : '채널의 정식 멤버로 참여하여 다양한 기능을 사용할 수 있습니다.';

    return `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>채널 초대</title>
        <style>
          ${this.getEmailStyles()}
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header">
            <div class="logo">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#6366F1"/>
                <path d="M8 12h16v2H8v-2zm0 4h16v2H8v-2zm0 4h12v2H8v-2z" fill="white"/>
              </svg>
              <h1>CollabDesk</h1>
            </div>
          </div>

          <!-- Main Content -->
          <div class="content">
            <div class="invite-card">
              <div class="invite-header">
                <div class="channel-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="48" height="48" rx="12" fill="#10B981" fill-opacity="0.1"/>
                    <path d="M18 18h12v2H18v-2zm0 4h12v2H18v-2zm0 4h8v2H18v-2z" fill="#10B981"/>
                  </svg>
                </div>
                <h2>채널 초대 ${guestBadge}</h2>
              </div>

              <div class="invite-body">
                <p class="greeting">안녕하세요,</p>
                <p class="main-text">
                  <strong>${data.inviterName}</strong>님이 당신을 
                  <strong class="workspace-name">${data.workspaceName}</strong>의
                  <strong class="channel-name">#${data.channelName}</strong> 채널로 ${guestText}초대했습니다.
                </p>
                <p class="description">
                  ${guestDescription}
                </p>

                <div class="cta-section">
                  <a href="${data.inviteUrl}" class="cta-button">초대 수락하기</a>
                  <p class="cta-text">또는 아래 링크를 복사하여 브라우저에 붙여넣으세요:</p>
                  <div class="link-box">
                    <code>${data.inviteUrl}</code>
                  </div>
                </div>

                <div class="info-box">
                  <div class="info-item">
                    <span class="info-label">초대자:</span>
                    <span class="info-value">${data.inviterName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">워크스페이스:</span>
                    <span class="info-value">${data.workspaceName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">채널:</span>
                    <span class="info-value">#${data.channelName}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">참여 방식:</span>
                    <span class="info-value">${data.isGuestInvite ? '게스트' : '정식 멤버'}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">만료일:</span>
                    <span class="info-value">${data.expiresAt}</span>
                  </div>
                </div>
              </div>
            </div>

            ${
              data.isGuestInvite
                ? `
            <div class="guest-info">
              <h3>게스트 참여란?</h3>
              <ul>
                <li>이 채널에서만 활동할 수 있습니다</li>
                <li>채널 내 메시지 읽기 및 작성이 가능합니다</li>
                <li>파일 공유 및 다운로드가 가능합니다</li>
                <li>다른 워크스페이스 기능은 제한됩니다</li>
              </ul>
            </div>
            `
                : ''
            }

            <div class="features">
              <h3>이 채널에서 할 수 있는 일들</h3>
              <div class="feature-list">
                <div class="feature-item">
                  <div class="feature-icon">💬</div>
                  <div class="feature-text">
                    <h4>팀 채팅</h4>
                    <p>채널 멤버들과 실시간으로 소통하세요</p>
                  </div>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">📎</div>
                  <div class="feature-text">
                    <h4>파일 공유</h4>
                    <p>문서, 이미지, 파일을 쉽게 공유하세요</p>
                  </div>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">🔔</div>
                  <div class="feature-text">
                    <h4>알림 설정</h4>
                    <p>중요한 메시지를 놓치지 마세요</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>이 초대를 요청하지 않으셨나요? 이 이메일을 무시하셔도 됩니다.</p>
            <div class="footer-links">
              <a href="#">개인정보처리방침</a>
              <span>•</span>
              <a href="#">서비스 약관</a>
              <span>•</span>
              <a href="#">고객지원</a>
            </div>
            <p class="copyright">© 2025 CollabDesk. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  // CSS 스타일 반환 메서드
  private getEmailStyles(): string {
    return `
      /* Reset and Base Styles */
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background-color: #f9fafb;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Container */
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }

      /* Header */
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 24px;
        text-align: center;
      }

      .logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }

      .logo h1 {
        color: #ffffff;
        font-size: 24px;
        font-weight: 700;
        margin: 0;
      }

      /* Main Content */
      .content {
        padding: 32px 24px;
      }

      /* Invite Card */
      .invite-card {
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        overflow: hidden;
        margin-bottom: 32px;
      }

      .invite-header {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        padding: 24px;
        text-align: center;
        border-bottom: 1px solid #e5e7eb;
      }

      .workspace-icon,
      .channel-icon {
        margin: 0 auto 16px;
      }

      .invite-header h2 {
        color: #1f2937;
        font-size: 24px;
        font-weight: 700;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .guest-badge {
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: #ffffff;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .invite-body {
        padding: 24px;
      }

      .greeting {
        font-size: 16px;
        color: #374151;
        margin-bottom: 16px;
      }

      .main-text {
        font-size: 18px;
        color: #1f2937;
        margin-bottom: 16px;
        line-height: 1.7;
      }

      .workspace-name,
      .channel-name {
        color: #6366f1;
        font-weight: 600;
      }

      .description {
        font-size: 16px;
        color: #6b7280;
        margin-bottom: 32px;
        line-height: 1.6;
      }

      /* CTA Section */
      .cta-section {
        text-align: center;
        margin-bottom: 32px;
      }

      .cta-button {
        display: inline-block;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: #ffffff !important;
        text-decoration: none;
        padding: 16px 32px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.3s ease;
        box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.3);
        margin-bottom: 24px;
      }

      .cta-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px 0 rgba(99, 102, 241, 0.4);
      }

      .cta-text {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 12px;
      }

      .link-box {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 12px 16px;
        margin: 0 auto;
        max-width: 100%;
        word-break: break-all;
      }

      .link-box code {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 14px;
        color: #6366f1;
        background: none;
      }

      /* Info Box */
      .info-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 20px;
      }

      .info-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #e2e8f0;
      }

      .info-item:last-child {
        border-bottom: none;
      }

      .info-label {
        font-size: 14px;
        color: #6b7280;
        font-weight: 500;
      }

      .info-value {
        font-size: 14px;
        color: #1f2937;
        font-weight: 600;
        text-align: right;
      }

      /* Guest Info */
      .guest-info {
        background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%);
        border: 1px solid #fbbf24;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 32px;
      }

      .guest-info h3 {
        color: #92400e;
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .guest-info h3:before {
        content: "ℹ️";
        font-size: 20px;
      }

      .guest-info ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .guest-info li {
        color: #92400e;
        font-size: 14px;
        padding: 8px 0;
        padding-left: 24px;
        position: relative;
      }

      .guest-info li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #d97706;
        font-weight: bold;
      }

      /* Features Section */
      .features {
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        padding: 24px;
        margin-bottom: 32px;
      }

      .features h3 {
        color: #1f2937;
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 20px;
        text-align: center;
      }

      .feature-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .feature-item {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 16px;
        background: #f8fafc;
        border-radius: 8px;
        transition: all 0.3s ease;
      }

      .feature-item:hover {
        background: #f1f5f9;
        transform: translateY(-1px);
      }

      .feature-icon {
        font-size: 24px;
        min-width: 32px;
        text-align: center;
      }

      .feature-text h4 {
        color: #1f2937;
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
      }

      .feature-text p {
        color: #6b7280;
        font-size: 14px;
        line-height: 1.5;
      }

      /* Footer */
      .footer {
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
        padding: 32px 24px;
        text-align: center;
      }

      .footer p {
        color: #6b7280;
        font-size: 14px;
        margin-bottom: 16px;
      }

      .footer-links {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .footer-links a {
        color: #6366f1;
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
      }

      .footer-links a:hover {
        text-decoration: underline;
      }

      .footer-links span {
        color: #d1d5db;
      }

      .copyright {
        color: #9ca3af;
        font-size: 12px;
        margin: 0;
      }

      /* Responsive Design */
      @media only screen and (max-width: 600px) {
        .email-container {
          margin: 0;
          box-shadow: none;
        }
        
        .content {
          padding: 20px 16px;
        }
        
        .header {
          padding: 20px 16px;
        }
        
        .logo {
          flex-direction: column;
          gap: 8px;
        }
        
        .logo h1 {
          font-size: 20px;
        }
        
        .invite-header h2 {
          font-size: 20px;
          flex-direction: column;
          gap: 12px;
        }
        
        .invite-body {
          padding: 20px 16px;
        }
        
        .main-text {
          font-size: 16px;
        }
        
        .cta-button {
          padding: 14px 24px;
          font-size: 15px;
          width: 100%;
          max-width: 280px;
        }
        
        .info-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        
        .info-value {
          text-align: left;
        }
        
        .feature-list {
          gap: 12px;
        }
        
        .feature-item {
          flex-direction: column;
          text-align: center;
          gap: 12px;
        }
        
        .footer-links {
          flex-direction: column;
          gap: 8px;
        }
        
        .footer-links span {
          display: none;
        }
      }
    `;
  }
}
