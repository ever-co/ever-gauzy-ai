import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class EmployeeJobApplicationFinalizeDto {
	@IsOptional()
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	appliedDate?: Date;

	@IsString()
	@IsOptional()
	@ApiPropertyOptional({ type: String })
	appliedStatus?: string;

	/** The job platform's own id for the submitted application (any string: platforms do not use UUIDs). */
	@IsString()
	@IsOptional()
	@ApiPropertyOptional({ type: String })
	providerJobApplicationId?: string;
}
