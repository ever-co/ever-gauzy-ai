import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeJobPost } from '@packages/entities/employeeJobPost.entity';
import { DashboardService } from './dashboard.service';
import { DashboardResolver } from './dashboard.resolver';

@Module({
	imports: [
		TypeOrmModule.forFeature([EmployeeJobPost]),
	],
	providers: [DashboardService, DashboardResolver],
	exports: [DashboardService],
})
export class DashboardModule {}
