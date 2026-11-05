import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext } from './request-context';

/** Establishes the `RequestContext` for every HTTP request (see also `RequestContextInterceptor`). */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
	async use(request: Request, response: Response, next: NextFunction) {
		RequestContext.run(new RequestContext(request, response), () => next());
	}
}
