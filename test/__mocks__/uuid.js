// CJS mock for uuid (ESM-only package not compatible with ts-jest)
const crypto = require('crypto');

function v4() {
	return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

function v1() {
	return v4(); // simplified stub
}

module.exports = {
	v4,
	v1,
	NIL: '00000000-0000-0000-0000-000000000000',
	MAX: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
	validate: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
	version: (s) => parseInt(s.charAt(14), 16),
	default: { v4, v1 },
};
