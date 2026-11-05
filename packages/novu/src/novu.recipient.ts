/** The employee argument of the `NovuService.send…()` methods. */
export interface NovuEmployeeRecipient {
	id: string;
	firstName?: string;
	lastName?: string;
	userId?: string;
}

/**
 * The recipient for a notification about `employeeId`, from the loaded employee when there is one:
 * NovuService addresses the employee's user (`userId`) when known, otherwise the employee id.
 */
export const employeeRecipient = (
	employeeId: string,
	employee?: { firstName?: string; lastName?: string; userId?: string } | null
): NovuEmployeeRecipient => ({
	id: employeeId,
	firstName: employee?.firstName,
	lastName: employee?.lastName,
	userId: employee?.userId,
});
