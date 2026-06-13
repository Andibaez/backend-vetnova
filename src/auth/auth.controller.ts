import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from './constants/auth-cookies.constant';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ global: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.register(dto);
    const csrfToken = this.setAuthCookies(res, token);
    return { user, csrfToken };
  }

  @Public()
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    if (!result.token) return result;
    const csrfToken = this.setAuthCookies(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Public()
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  @Post('google')
  async googleAuth(@Body() dto: GoogleAuthDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.googleAuth(dto);
    if (!result.token) return result;
    const csrfToken = this.setAuthCookies(res, result.token);
    return { user: result.user, csrfToken };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, this.cookieOptions());
    res.clearCookie(CSRF_COOKIE_NAME, this.cookieOptions(false));
    return { ok: true };
  }

  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = this.setCsrfCookie(res);
    return { csrfToken };
  }

  @Public()
  @Throttle({ global: { limit: 3, ttl: 900000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ global: { limit: 5, ttl: 900000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @ApiCookieAuth('vetnova-token')
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  private setAuthCookies(res: Response, token: string) {
    res.cookie(AUTH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: this.authCookieMaxAgeMs(),
    });
    return this.setCsrfCookie(res);
  }

  private setCsrfCookie(res: Response) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      ...this.cookieOptions(false),
      maxAge: this.authCookieMaxAgeMs(),
    });
    return csrfToken;
  }

  private cookieOptions(httpOnly = true): CookieOptions {
    const sameSite = (this.config.get<string>('AUTH_COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    const secureConfig = this.config.get<string>('AUTH_COOKIE_SECURE');
    const secure =
      secureConfig === undefined
        ? process.env.NODE_ENV === 'production' || sameSite === 'none'
        : secureConfig === 'true';
    const domain = this.config.get<string>('AUTH_COOKIE_DOMAIN') || undefined;

    return {
      httpOnly,
      secure,
      sameSite: this.normalizeSameSite(sameSite),
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private authCookieMaxAgeMs() {
    const days = Number(this.config.get<string>('AUTH_COOKIE_MAX_AGE_DAYS') ?? '10');
    return days * 24 * 60 * 60 * 1000;
  }

  private normalizeSameSite(value: string): CookieOptions['sameSite'] {
    if (value === 'none' || value === 'strict' || value === 'lax') return value;
    return 'lax';
  }
}
