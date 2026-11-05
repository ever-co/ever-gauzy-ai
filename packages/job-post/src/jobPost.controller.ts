import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { JobPost } from '@packages/entities';
import { JobPostService } from './jobPost.service';

@Crud({
	model: {
		type: JobPost,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
})
@Controller('api/job')
export class JobPostController implements CrudController<JobPost> {
	constructor(
		public readonly service: JobPostService
	) { }
}
