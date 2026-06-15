import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CSRF_COOKIE, clearAuthCookies, setAuthCookie } from './auth-cookies.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Si la respuesta incluye un token, lo guarda en una cookie httpOnly y lo retira del cuerpo. */
  private withAuthCookie<T extends { token?: string }>(
    res: Response,
    result: T,
  ): Omit<T, 'token'> {
    if (result.token) {
      setAuthCookie(res, result.token, this.config.get<string>('JWT_EXPIRES_IN') ?? '10d');
    }
    const { token: _token, ...rest } = result;
    return rest;
  }

  @Public()
  @Throttle({ global: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    return this.withAuthCookie(res, result);
  }

  @Public()
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    return this.withAuthCookie(res, result);
  }

  @Public()
  @Throttle({ global: { limit: 10, ttl: 60000 } })
  @Post('google')
  async googleAuth(@Body() dto: GoogleAuthDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.googleAuth(dto);
    return this.withAuthCookie(res, result);
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

  /** Emite el token CSRF (doble-submit cookie) que el frontend debe enviar en peticiones mutantes. */
  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return { csrfToken };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { message: 'Sesión cerrada correctamente.' };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }
}
