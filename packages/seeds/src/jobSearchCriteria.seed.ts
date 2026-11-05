import { DataSource } from 'typeorm';
import { Employee, JobSearchCriterion } from '@packages/entities';

/**
 * Seed job search criteria for employees.
 * These define the search parameters used by the crawler to find jobs via Ever Jobs API.
 * Each employee can have multiple criteria with different keywords, locations, and countries.
 */
export const createJobSearchCriteria = async (
	connection: DataSource,
): Promise<JobSearchCriterion[]> => {
	const criteria = new Array<JobSearchCriterion>();
	const employees = await connection.getRepository(Employee).find();

	console.log(`Seeding job search criteria for ${employees.length} employees`);

	/**
	 * Build a mapping from employee name → criteria definitions.
	 * Fields:
	 *   keyword    — the search term sent to Ever Jobs API
	 *   location   — geographic filter (city/region)
	 *   country    — country enum value matching Ever Jobs Country enum
	 *   jobType    — 'hourly' or 'fixed'
	 *   isRemote   — true to only include remote positions
	 *   hoursOld   — max listing age in hours
	 *   category / categoryId / occupation / occupationId — legacy Upwork fields
	 */
	const criteriaMap: Record<string, Partial<JobSearchCriterion>[]> = {
		'Ruslan Konviser': [
			{ keyword: 'Software Architect', location: 'Sofia', country: 'BULGARIA', jobType: 'hourly' },
			{ keyword: 'CTO', location: 'Sofia', country: 'BULGARIA', jobType: 'hourly' },
			{ keyword: 'DevOps Engineer', country: 'BULGARIA', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Technical Project Manager', isRemote: true, jobType: 'hourly', hoursOld: 48 },
			{ keyword: 'Project Lead', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Development Lead', isRemote: true, jobType: 'hourly' },
		],
		'Yavor Grancharov': [
			{ keyword: 'Angular Developer', location: 'Plovdiv', country: 'BULGARIA', jobType: 'hourly' },
			{ keyword: 'Frontend Engineer', country: 'BULGARIA', isRemote: true, jobType: 'hourly' },
			{ keyword: 'TypeScript Developer', isRemote: true, jobType: 'hourly', hoursOld: 72 },
		],
		'Alish Meklyov': [
			{ keyword: 'Mobile Developer', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Ionic Developer', isRemote: true, jobType: 'hourly' },
			{ keyword: 'React Native Developer', isRemote: true, jobType: 'hourly', hoursOld: 48 },
		],
		'Yordan Genovski': [
			{ keyword: 'UX Designer', location: 'Sofia', country: 'BULGARIA', jobType: 'hourly' },
			{ keyword: 'UI Designer', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Product Designer', isRemote: true, jobType: 'hourly', hoursOld: 72 },
		],
		'Sarah Chen': [
			{ keyword: 'React Developer', location: 'San Francisco', country: 'USA', jobType: 'hourly' },
			{ keyword: 'Full Stack Engineer', location: 'San Francisco', country: 'USA', jobType: 'hourly' },
			{ keyword: 'Node.js Developer', country: 'USA', isRemote: true, jobType: 'hourly', hoursOld: 24 },
		],
		'Marcus Weber': [
			{ keyword: 'Machine Learning Engineer', location: 'Berlin', country: 'GERMANY', jobType: 'hourly' },
			{ keyword: 'Data Scientist', location: 'Berlin', country: 'GERMANY', jobType: 'hourly' },
			{ keyword: 'Python Developer', country: 'GERMANY', isRemote: true, jobType: 'hourly', hoursOld: 48 },
		],
		'Priya Patel': [
			{ keyword: 'QA Engineer', location: 'Bangalore', country: 'INDIA', jobType: 'hourly' },
			{ keyword: 'Test Automation Engineer', country: 'INDIA', isRemote: true, jobType: 'hourly' },
			{ keyword: 'SDET', isRemote: true, jobType: 'hourly', hoursOld: 72 },
		],
		'James Wilson': [
			{ keyword: 'Product Manager', location: 'London', country: 'UK', jobType: 'hourly' },
			{ keyword: 'Technical Product Manager', country: 'UK', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Product Owner', isRemote: true, jobType: 'hourly', hoursOld: 48 },
		],
		'Rahul Rathor': [
			{ keyword: 'Java Developer', location: 'New York', country: 'USA', jobType: 'hourly' },
			{ keyword: 'Backend Engineer', location: 'New York', country: 'USA', jobType: 'hourly' },
			{ keyword: 'Spring Boot Developer', country: 'USA', isRemote: true, jobType: 'hourly', hoursOld: 48 },
		],
		'Hristo Hristov': [
			{ keyword: 'Go Developer', location: 'Sofia', country: 'BULGARIA', jobType: 'hourly' },
			{ keyword: 'Golang Engineer', country: 'BULGARIA', isRemote: true, jobType: 'hourly' },
			{ keyword: 'Microservices Engineer', isRemote: true, jobType: 'hourly', hoursOld: 48 },
		],
	};

	for (const employee of employees) {
		const name = `${employee.firstName} ${employee.lastName}`;
		const defs = criteriaMap[name];
		if (!defs) continue;

		for (const def of defs) {
			const cr = Object.assign(new JobSearchCriterion(), {
				employeeId: employee.id,
				...def,
			});
			criteria.push(cr);
		}
	}

	return await insertJobSearchCriteria(connection, criteria);
};

const insertJobSearchCriteria = async (
	connection: DataSource,
	criteria: JobSearchCriterion[],
) => {
	console.log(`Inserting ${criteria.length} job search criteria`);

	const repo = connection.getRepository(JobSearchCriterion);

	await Promise.all(
		criteria.map(async (cr) => {
			const existed = await repo.findOne({
				where: {
					employeeId: cr.employeeId,
					keyword: cr.keyword,
					location: cr.location ?? undefined,
					country: cr.country ?? undefined,
					jobType: cr.jobType,
				},
			});

			if (existed) {
				cr.id = existed.id;
			}
		}),
	);

	return await repo.save(criteria);
};
