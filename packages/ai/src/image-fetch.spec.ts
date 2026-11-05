import { fetchImage, isPrivateAddress, normalizeAddress, TransportResponse } from './image-fetch';

const response = (body: Uint8Array | Uint8Array[], headers: Record<string, string>, status = 200): TransportResponse & { abort: jest.Mock } => ({
	status,
	headers,
	body: (async function* () {
		for (const part of Array.isArray(body) ? body : [body]) yield part;
	})(),
	abort: jest.fn(),
});

describe('fetchImage (image URLs for analysis)', () => {
	const resolve = jest.fn(async () => ['93.184.216.34']);
	const transport = jest.fn();
	beforeEach(() => {
		jest.resetAllMocks();
		resolve.mockResolvedValue(['93.184.216.34']);
	});

	it('normalizes IPv4-mapped IPv6 addresses, dotted and hex forms, before the private checks', () => {
		expect(normalizeAddress('[::ffff:7f00:1]')).toBe('127.0.0.1');
		expect(normalizeAddress('::ffff:10.0.0.5')).toBe('10.0.0.5');
		expect(normalizeAddress('0:0:0:0:0:ffff:c0a8:0101')).toBe('192.168.1.1');
		expect(normalizeAddress('93.184.216.34')).toBe('93.184.216.34');
	});

	// cspell:ignore febf
	it('knows private and local addresses', () => {
		for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.1.1', '0.0.0.0', '100.64.0.1', '::1', '[::1]', 'fd00::1', 'fc12::1', 'fe80::1', 'fe81::1', 'fe8f::1', 'feb0::1', 'febf::1', '::ffff:10.0.0.1', '[::ffff:7f00:1]', '::ffff:a9fe:a9fe', 'localhost', 'db.internal', 'nas.local']) {
			expect(isPrivateAddress(a)).toBe(true);
		}
		for (const a of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111', 'fec0::1', 'fe00::1', '::ffff:5db8:d822', 'example.com']) {
			expect(isPrivateAddress(a)).toBe(false);
		}
	});

	it('downloads a public image through a connection pinned to the validated address', async () => {
		transport.mockResolvedValue(response([new Uint8Array([1, 2]), new Uint8Array([3])], { 'content-type': 'image/png; charset=binary', 'content-length': '3' }));
		const image = await fetchImage('https://cdn.example.com/shots/screen%201.png?token=abc', { resolve, transport });
		expect(image).toMatchObject({ mimetype: 'image/png', originalname: 'screen 1.png', size: 3, url: 'https://cdn.example.com/shots/screen%201.png?token=abc' });
		// a basename that is not valid UTF-8 once unescaped is kept escaped, the download is still accepted
		const odd = await fetchImage('https://cdn.example.com/shots/shot%FF.png', { resolve, transport });
		expect(odd.originalname).toBe('shot%FF.png');
		expect(Array.from(image.buffer)).toEqual([1, 2, 3]);
		expect(resolve).toHaveBeenCalledWith('cdn.example.com');
		const [url, address, init] = transport.mock.calls[0];
		expect(url.hostname).toBe('cdn.example.com'); // TLS still verifies the hostname
		expect(address).toBe('93.184.216.34'); // what was validated is what is connected to
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('refuses private / local targets (including mapped IPv6), bad schemes, credentials and unresolvable hosts', async () => {
		await expect(fetchImage('http://127.0.0.1/a.png', { resolve, transport })).rejects.toThrow(/private or local/);
		await expect(fetchImage('http://[::ffff:127.0.0.1]/a.png', { resolve, transport })).rejects.toThrow(/private or local/);
		await expect(fetchImage('http://localhost:3005/a.png', { resolve, transport })).rejects.toThrow(/private or local/);
		resolve.mockResolvedValueOnce(['10.0.0.5']); // a public name resolving to the internal network
		await expect(fetchImage('https://internal.example.com/a.png', { resolve, transport })).rejects.toThrow(/private or local/);
		resolve.mockResolvedValueOnce(['93.184.216.34', '::ffff:7f00:1']); // one bad address is enough
		await expect(fetchImage('https://mixed.example.com/a.png', { resolve, transport })).rejects.toThrow(/private or local/);
		await expect(fetchImage('ftp://example.com/a.png', { resolve, transport })).rejects.toThrow(/http\(s\)/);
		await expect(fetchImage('https://user:pw@example.com/a.png', { resolve, transport })).rejects.toThrow(/Credentials/);
		resolve.mockRejectedValueOnce(new Error('ENOTFOUND'));
		await expect(fetchImage('https://nope.example.com/a.png', { resolve, transport })).rejects.toThrow(/cannot be resolved/);
		await expect(fetchImage('not a url', { resolve, transport })).rejects.toThrow(/valid URL/);
		expect(transport).not.toHaveBeenCalled();
	});

	it('drops the connection of every rejected response', async () => {
		const rejected = [
			response(new Uint8Array([1]), { location: 'https://elsewhere.example.com/x.png' }, 302),
			response(new Uint8Array([1]), { 'content-type': 'text/html' }),
			response(new Uint8Array([1]), { 'content-type': 'image/jpeg', 'content-length': '999999' }),
			response([new Uint8Array(600), new Uint8Array(600)], { 'content-type': 'image/jpeg' }),
			response(new Uint8Array([1]), { 'content-type': 'image/png' }, 403),
		];
		for (const r of rejected) {
			transport.mockResolvedValueOnce(r);
			await expect(fetchImage('https://example.com/a.png', { resolve, transport, maxBytes: 1000 })).rejects.toBeDefined();
			expect(r.abort).toHaveBeenCalled();
		}
		const ok = response(new Uint8Array([1]), { 'content-type': 'image/png' });
		transport.mockResolvedValueOnce(ok);
		await fetchImage('https://example.com/a.png', { resolve, transport });
		expect(ok.abort).not.toHaveBeenCalled();
	});

	it('refuses redirects, non-images, oversized downloads (declared or streamed) and failed responses', async () => {
		transport.mockResolvedValueOnce(response(new Uint8Array([1]), { location: 'https://elsewhere.example.com/x.png' }, 302));
		await expect(fetchImage('https://example.com/a', { resolve, transport })).rejects.toThrow(/Redirects/);
		transport.mockResolvedValueOnce(response(new Uint8Array([1]), { 'content-type': 'text/html' }));
		await expect(fetchImage('https://example.com/a', { resolve, transport })).rejects.toThrow(/Not an image/);
		transport.mockResolvedValueOnce(response(new Uint8Array([1]), { 'content-type': 'image/jpeg', 'content-length': '999999' }));
		await expect(fetchImage('https://example.com/a.jpg', { resolve, transport, maxBytes: 1000 })).rejects.toThrow(/larger than 1000/);
		transport.mockResolvedValueOnce(response([new Uint8Array(600), new Uint8Array(600)], { 'content-type': 'image/jpeg' }));
		await expect(fetchImage('https://example.com/a.jpg', { resolve, transport, maxBytes: 1000 })).rejects.toThrow(/larger than 1000/);
		transport.mockResolvedValueOnce(response(new Uint8Array([1]), { 'content-type': 'image/png' }, 403));
		await expect(fetchImage('https://example.com/a.png', { resolve, transport })).rejects.toThrow(/HTTP 403/);
	});

	it('one deadline covers name resolution as well as the download', async () => {
		resolve.mockImplementationOnce(() => new Promise(() => undefined)); // a resolver that never answers
		await expect(fetchImage('https://slow.example.com/a.png', { resolve, transport, timeoutMs: 50 })).rejects.toThrow(/cannot be resolved/);
		expect(transport).not.toHaveBeenCalled();
		transport.mockImplementationOnce(async (_url, _address, { signal }) => ({
			status: 200,
			headers: { 'content-type': 'image/png' },
			abort: jest.fn(),
			body: (async function* () {
				await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
				throw new Error('aborted');
			})(),
		}));
		await expect(fetchImage('https://stalled.example.com/a.png', { resolve, transport, timeoutMs: 50 })).rejects.toThrow(/timed out/);
	});
});
