import { Controller, Get, Req } from '@nestjs/common';
import { CsrfService, CsrfTokenResponse } from '../../common/security/csrf.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Generates a tamper-proof HMAC-SHA256 CSRF token for web/browser clients bound to client identity.
   * Exposes token value and validity duration.
   */
  @Get('csrf-token')
  getCsrfToken(@Req() req: any): CsrfTokenResponse {
    const clientIdentifier = this.extractClientIdentifier(req);
    return this.csrfService.generateToken(clientIdentifier);
  }

  private extractClientIdentifier(req: any): string {
    if (typeof req?.ip === 'string' && req.ip.trim().length > 0) {
      return req.ip.trim();
    }
    const cfIp = req?.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim().length > 0) {
      return cfIp.trim();
    }
    const rawForwarded = req?.headers?.['x-forwarded-for'];
    if (typeof rawForwarded === 'string' && rawForwarded.length > 0) {
      const first = rawForwarded.split(',')[0].trim();
      if (first) return first;
    }
    return req?.socket?.remoteAddress || '127.0.0.1';
  }
}
