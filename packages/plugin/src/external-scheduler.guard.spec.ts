import { ConflictException } from '@nestjs/common';
import { ExternalSchedulerGuard } from './external-scheduler.guard';

const ctx = (headers: Record<string, string>): any => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) });

describe('ExternalSchedulerGuard', () => {
	it('refuses Trigger.dev callbacks when the trigger-dev plugin is off, admits everything else', () => {
		const off = new ExternalSchedulerGuard({ isEnabled: (n) => n !== 'trigger-dev' });
		expect(() => off.canActivate(ctx({ 'x-scheduler': 'trigger-dev' }))).toThrow(ConflictException);
		expect(off.canActivate(ctx({}))).toBe(true);
		expect(off.canActivate(ctx({ 'x-scheduler': 'kubernetes-cronjob' }))).toBe(true);
		const on = new ExternalSchedulerGuard({ isEnabled: () => true });
		expect(on.canActivate(ctx({ 'x-scheduler': 'trigger-dev' }))).toBe(true);
		expect(new ExternalSchedulerGuard().canActivate(ctx({ 'x-scheduler': 'trigger-dev' }))).toBe(true); // no registry = everything on
	});
});
