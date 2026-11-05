import type { FindOptionsRelations } from 'typeorm';

/** A relation name: an identifier, never one that reaches into the object prototype chain. */
const RELATION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const isRelationName = (name: string): boolean => RELATION_NAME.test(name) && !FORBIDDEN.has(name);

/**
 * TypeORM 1.x accepts `relations` only in object form (`{ employee: { user: true } }`); the string-array
 * form (`['employee', 'employee.user']`) — still produced by older call sites and by `@dataui/crud`
 * request extras — now throws "String-array relations syntax has been removed", which turned every REST
 * get-by-id into a 500. This converts either form; an empty or missing value means "no relations".
 *
 * The input can come from the request (`@dataui/crud` extras), so every segment must be a plain
 * identifier: `__proto__`, `prototype` and `constructor` are refused (no prototype pollution while the
 * tree is built), as is anything that is not an identifier. TypeORM still validates the names themselves.
 */
export function toFindRelations<T>(relations: unknown): FindOptionsRelations<T> | undefined {
	if (relations === undefined || relations === null) return undefined;
	if (Array.isArray(relations)) {
		const tree: Record<string, unknown> = {};
		for (const path of relations) {
			if (typeof path !== 'string' || !path.trim()) continue;
			const parts = path.split('.').map((part) => part.trim());
			if (!parts.every(isRelationName)) continue;
			let node = tree;
			parts.forEach((part, index) => {
				const existing = Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined;
				if (index === parts.length - 1) {
					if (existing === undefined) node[part] = true;
				} else {
					if (typeof existing !== 'object' || existing === null) node[part] = {};
					node = node[part] as Record<string, unknown>;
				}
			});
		}
		return Object.keys(tree).length ? (tree as FindOptionsRelations<T>) : undefined;
	}
	if (typeof relations === 'object') {
		const copy = copyRelations(relations as Record<string, unknown>);
		return copy ? (copy as FindOptionsRelations<T>) : undefined;
	}
	return undefined;
}

/** A sanitized copy of the object form (same identifier rule, values `true` or nested objects). */
function copyRelations(source: Record<string, unknown>): Record<string, unknown> | undefined {
	const copy: Record<string, unknown> = {};
	for (const key of Object.keys(source)) {
		if (!isRelationName(key)) continue;
		const value = source[key];
		if (value === true) {
			copy[key] = true;
		} else if (value && typeof value === 'object' && !Array.isArray(value)) {
			const nested = copyRelations(value as Record<string, unknown>);
			copy[key] = nested ?? true;
		}
	}
	return Object.keys(copy).length ? copy : undefined;
}
