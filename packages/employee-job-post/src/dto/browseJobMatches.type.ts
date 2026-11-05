import { ObjectType, Field, Int } from '@nestjs/graphql';
import { EmployeeJobPostDTO } from '@packages/dto';

@ObjectType({ description: 'Paginated browse job matches result' })
export class BrowseJobMatchesResult {
	@Field(() => [EmployeeJobPostDTO], { description: 'Matching employee job posts' })
	items: EmployeeJobPostDTO[];

	@Field(() => Int, { description: 'Total count of matching records' })
	totalCount: number;

	@Field(() => Boolean, { description: 'Whether there are more results beyond current page' })
	hasMore: boolean;
}
