import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaIndicator: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.prismaIndicator.pingCheck('database', this.prisma)]);
  }
}
