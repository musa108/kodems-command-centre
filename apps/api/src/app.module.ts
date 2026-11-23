import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UsersModule } from './users/users.module';
import { GeographyModule } from './geography/geography.module';
import { ReportsModule } from './reports/reports.module';
import { IncidentsModule } from './incidents/incidents.module';
import { TeamsModule } from './teams/teams.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { PopulationModule } from './population/population.module';
import { ReliefModule } from './relief/relief.module';
import { SheltersModule } from './shelters/shelters.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: process.env.NODE_ENV === 'test' ? 100000 : 600 }]), CommonModule, UsersModule, GeographyModule, ReportsModule, IncidentsModule, TeamsModule, DeploymentsModule, PopulationModule, ReliefModule, SheltersModule, NotificationsModule, AnalyticsModule, DashboardModule, AdminModule, RealtimeModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
