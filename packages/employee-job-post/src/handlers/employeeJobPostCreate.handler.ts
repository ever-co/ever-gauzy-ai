import { randomUUID } from 'node:crypto';
import { ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { EmployeeJobPostCreateCommand } from '../commands/employeeJobPostCreate.command';
import { EmployeeJobPost } from '@packages/entities';
import { EmployeeJobPostCreatedEvent } from '../events/employeeJobPostCreated.event';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

/** Rows per INSERT statement (`employee_job_post` has ~30 columns; far below the bind-parameter limit). */
const INSERT_CHUNK = 200;

@CommandHandler(EmployeeJobPostCreateCommand)
export class EmployeeJobPostCreateCommandHandler implements ICommandHandler<EmployeeJobPostCreateCommand> {

	constructor(
		@InjectRepository(EmployeeJobPost)
		private readonly repo: Repository<EmployeeJobPost>,
		private readonly eventBus: EventBus,
	) { }

	/**
	 * Stores new matches, at most one per employee ↔ job post pair: a pair that is already stored
	 * (by a concurrent matching pass, or twice in this batch) is skipped instead of failing the whole
	 * batch (`ON CONFLICT DO NOTHING` on the unique index of employeeId + jobPostId).
	 *
	 * @returns the matches really stored; only those are announced with EmployeeJobPostCreatedEvent
	 */
	async execute(command: EmployeeJobPostCreateCommand): Promise<EmployeeJobPost[]> {
		const rows = uniquePairs(command.employeeJobPosts);
		if (rows.length === 0) {
			return [];
		}

		// client-side ids tell which rows the database kept (portable: no RETURNING needed)
		for (const row of rows) {
			row.id ??= randomUUID();
		}
		// one transaction: either every chunk is stored and announced, or none is (a pair stored but never
		// announced would be skipped by later passes and its notification lost)
		const stored = await this.repo.manager.transaction(async (manager) => {
			for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
				await manager
					.createQueryBuilder()
					.insert()
					.into(EmployeeJobPost)
					.values(rows.slice(i, i + INSERT_CHUNK))
					.orIgnore()
					// TypeORM would merge the RETURNING rows into the entities by position, which is wrong as
					// soon as a row in the middle was skipped; the stored values are read back by id below
					.updateEntity(false)
					.execute();
			}

			// the rows the database kept, with the values it generated (as `save()` used to set them)
			const kept = new Map<string, Pick<EmployeeJobPost, 'createdAt' | 'updatedAt' | 'scoringAttempts'>>();
			for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
				const found = await manager.find(EmployeeJobPost, {
					where: { id: In(rows.slice(i, i + INSERT_CHUNK).map((row) => row.id)) },
					select: { id: true, createdAt: true, updatedAt: true, scoringAttempts: true },
				});
				found.forEach(({ id, createdAt, updatedAt, scoringAttempts }) => kept.set(id, { createdAt, updatedAt, scoringAttempts }));
			}
			return kept;
		});
		const created = rows.filter((row) => stored.has(row.id)).map((row) => Object.assign(row, stored.get(row.id)));

		if (created.length > 0) {
			await this.eventBus.publish(new EmployeeJobPostCreatedEvent(created));
		}
		return created;
	}
}

/** The first row of each employee ↔ job post pair (rows without a job post cannot collide and are kept). */
function uniquePairs(rows: EmployeeJobPost[]): EmployeeJobPost[] {
	const seen = new Set<string>();
	return rows.filter((row) => {
		if (!row.jobPostId) return true;
		const key = `${row.employeeId}|${row.jobPostId}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
