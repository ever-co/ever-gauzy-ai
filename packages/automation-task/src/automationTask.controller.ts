import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { AutomationTask } from '@packages/entities';
import { AutomationTaskService } from './automationTask.service';
import { AutomationTaskDTO } from '@packages/dto/automationTask.dto';

@Crud({
	model: {
		type: AutomationTask,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
	dto: {
		create: AutomationTaskDTO,
		update: AutomationTaskDTO,
		replace: AutomationTaskDTO
	}
})
@Controller('api/automation/task')
export class AutomationTaskController implements CrudController<AutomationTask> {

	constructor(
		public readonly service: AutomationTaskService
	) { }
}
