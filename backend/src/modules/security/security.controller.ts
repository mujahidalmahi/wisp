import { Controller, Get, Req, Res } from '@nestjs/common';
import { CsrfService, CsrfTokenResponse } from '../../common/security/csrf.service';
import { resolveOrCreateCsrfSessionId } from '../../common/security/csrf-session.util';

@Controller('security')
export class SecurityController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Generates a tamper-proof HMAC-SHA256 CSRF token for web/browser clients bound to client identity.
   * Sets a stable HttpOnly session cookie if absent, protecting against IP rotation disconnects.
   */
  @Get('csrf-token')
  getCsrfToken(@Req() req: any, @Res({ passthrough: true }) res: any): CsrfTokenResponse {
    const sessionId = resolveOrCreateCsrfSessionId(req, res);
    return this.csrfService.generateToken(`session:${sessionId}`);
  }
}
