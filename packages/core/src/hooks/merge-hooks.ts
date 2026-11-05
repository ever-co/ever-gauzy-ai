import { Injectable } from '@nestjs/common';
import { Class } from '@ptc-org/nestjs-query-core';
import { GqlContext } from '../context/gql-context';

/**
 * Merge multiple hooks into a single interceptor.
 * @param hooks - An array of hook classes to be merged.
 * @returns A new class that serves as a merged interceptor.
 */
export function MergeHooks(...hooks: Class<any>[]): any {
	// Injectable decorator indicates that the class can be injected as a dependency.
	@Injectable()
	class MergeInterceptor {
		/**
		 * Run method to execute the merged hooks on an instance.
		 * @param instance - The instance on which the hooks will be executed.
		 * @param context - The GraphQL context.
		 * @returns A Promise resolving to the modified instance after running all hooks.
		 */
		async run(instance: any, context: GqlContext): Promise<any> {
			// Iterate through each hook class and execute its run method on the instance.
			for (let index = 0; index < hooks.length; index++) {
				const hook = hooks[index];
				instance = await (new hook()).run(instance, context);
			}
			// Return the modified instance after running all hooks.
			return instance;
		}
	}

	// Return the merged interceptor class.
	return MergeInterceptor;
}
