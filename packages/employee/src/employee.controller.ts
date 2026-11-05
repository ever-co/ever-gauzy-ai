import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { Employee } from '@packages/entities';
import { EmployeeService } from './employee.service';
import { EmployeeDTO } from '@packages/dto/employee.dto';

@Crud({
	model: {
		type: Employee,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
	dto: {
		create: EmployeeDTO,
		update: EmployeeDTO,
		replace: EmployeeDTO,
	}
})
@Controller('api/employee')
export class EmployeeController implements CrudController<Employee> {

	constructor(
		public readonly service: EmployeeService
	) { }
}
