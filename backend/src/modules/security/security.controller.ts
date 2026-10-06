import { Controller, Get, Query } from '@nestjs/common';
import { CsrfService, CsrfTokenResponse } from '../../common/security/csrf.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Generates a tamper-proof HMAC-SHA256 CSRF token for web/browser clients.
   * Exposes token value and validity duration.
   */
  @Get('csrf-token')
  getCsrfToken(): CsrfTokenResponse {
    return this.csrfService.generateToken();
  }
}
