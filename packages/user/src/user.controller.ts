import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { User } from '@packages/entities';
import { UserService } from './user.service';
import { UserDTO } from '@packages/dto/user.dto';

@Crud({
	model: {
		type: User,
	},
	params: {
		id: {
			field: 'id',
			primary: true,
			type: 'uuid',
		},
	},
	dto: {
		create: UserDTO,
		update: UserDTO,
		replace: UserDTO
	}
})
@Controller('api/user')
export class UserController implements CrudController<User> {

	constructor(
		public readonly service: UserService
	) { }
}
