import { ArgsType, Field, Int, ID, registerEnumType } from '@nestjs/graphql';
import { IsOptional, IsString, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export enum BrowseJobsSortBy {
	SCORE_DESC = 'SCORE_DESC',
	SCORE_ASC = 'SCORE_ASC',
	DATE_DESC = 'DATE_DESC',
	DATE_ASC = 'DATE_ASC',
}

registerEnumType(BrowseJobsSortBy, {
	name: 'BrowseJobsSortBy',
	description: 'Sorting options for browse job matches',
});

@ArgsType()
export class BrowseJobMatchesArgs {
	@Field(() => ID, { description: 'Filter by employee ID' })
	employeeId: string;

	@Field(() => Int, { nullable: true, defaultValue: 0, description: 'Minimum match score (0-100)' })
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(100)
	minScore?: number;

	@Field(() => Int, { nullable: true, description: 'Maximum match score (0-100)' })
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(100)
	maxScore?: number;

	@Field(() => String, { nullable: true, description: 'Filter by budget fit (good_fit, over_budget, under_budget, unclear)' })
	@IsOptional()
	@IsString()
	budgetFit?: string;

	@Field(() => String, { nullable: true, description: 'Filter by recommended action (apply_now, review, skip)' })
	@IsOptional()
	@IsString()
	recommendedAction?: string;

	@Field(() => String, { nullable: true, description: 'Filter by provider code (e.g. upwork, linkedin)' })
	@IsOptional()
	@IsString()
	providerCode?: string;

	@Field(() => Boolean, { nullable: true, description: 'Filter by applied status' })
	@IsOptional()
	@IsBoolean()
	isApplied?: boolean;

	@Field(() => Int, { nullable: true, defaultValue: 20, description: 'Number of results to return' })
	@IsOptional()
	@IsNumber()
	@Min(1)
	@Max(100)
	first?: number;

	@Field(() => Int, { nullable: true, defaultValue: 0, description: 'Number of results to skip' })
	@IsOptional()
	@IsNumber()
	@Min(0)
	offset?: number;

	@Field(() => BrowseJobsSortBy, { nullable: true, defaultValue: BrowseJobsSortBy.SCORE_DESC, description: 'Sort order' })
	@IsOptional()
	sortBy?: BrowseJobsSortBy;
}
