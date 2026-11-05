import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { EmployeeJobPost } from '@packages/entities';
import { EmployeeJobPostService } from './employeeJobPost.service';
import { EmployeeJobPostDTO } from '@packages/dto/employeeJobPost.dto';

@Crud({
	model: {
		type: EmployeeJobPost,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
	dto: {
		create: EmployeeJobPostDTO,
		update: EmployeeJobPostDTO,
		replace: EmployeeJobPostDTO
	}
})
@Controller('api/employee/job')
export class EmployeeJobPostController implements CrudController<EmployeeJobPost> {

	constructor(
		public readonly service: EmployeeJobPostService
	) { }
}
