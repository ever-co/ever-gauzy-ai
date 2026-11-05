import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAwareCrudService } from '@packages/core/crud';
import { AutomationTask } from '@packages/entities';

@Injectable()
export class AutomationTaskService extends TenantAwareCrudService<AutomationTask> {

	constructor(
		@InjectRepository(AutomationTask)
		protected readonly repo: Repository<AutomationTask>
	) {
		super(repo);
	}
}
