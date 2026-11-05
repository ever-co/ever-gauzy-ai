import { InputType, Field, Float } from '@nestjs/graphql';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

@InputType({ description: 'Input for updating employee profile enrichment fields' })
export class UpdateEmployeeProfileInput {
	@Field(() => String, { nullable: true, description: 'Professional bio / summary' })
	@IsOptional()
	@IsString()
	bio?: string;

	@Field(() => String, { nullable: true, description: 'Comma-separated skills summary' })
	@IsOptional()
	@IsString()
	skillsSummary?: string;

	@Field(() => Float, { nullable: true, description: 'Preferred hourly rate (USD)' })
	@IsOptional()
	@IsNumber()
	@Min(0)
	preferredRate?: number;

	@Field(() => String, { nullable: true, description: 'Work history / experience summary' })
	@IsOptional()
	@IsString()
	experienceSummary?: string;
}
