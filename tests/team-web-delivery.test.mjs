import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/background.js', import.meta.url), 'utf8');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function runtime(overrides = {}) {
  const calls = [];
  const context = vm.createContext({
    Map, Promise, Date, JSON, TextDecoder, TextEncoder, Uint8Array,
    activeTeamWebJob: { job: { id: 'job-a', resultDelivery: 'chunks' }, startedAt: Date.now() },
    teamWebDeliveries: new Map(), teamResultDownloads: new Map(),
    teamWebWorkerRequest: async (path) => { calls.push(path); return {}; },
    saveActiveTeamWebJob: async () => {},
    createTeamPreview: async () => null,
    uploadTeamWebImage: async (id, _image, endpoint) => { calls.push(`${id}/${endpoint}`); },
    clearActiveTeamWebJob: async (_close, expected) => { if (context.activeTeamWebJob === expected) context.activeTeamWebJob = undefined; },
    failActiveTeamWebJob: async (_reason, _detail, expected) => { if (context.activeTeamWebJob === expected) { calls.push('fail'); context.activeTeamWebJob = undefined; } },
    chrome: { notifications: { create: async () => {} } },
    setTimeout: () => {},
    ...overrides,
  });
  vm.runInContext(section('function singleFlight(', 'var teamWebWorkerReady'), context);
  vm.runInContext(section('async function completeActiveTeamWebJob(', 'async function handleTeamWebPageTaskMessage('), context);
  return { context, calls };
}
const message = { taskId: 'job-a', images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }] };
test('simultaneous original and recovery results upload and complete only once', async () => {
  const { context, calls } = runtime();
  await Promise.all([context.completeActiveTeamWebJob(message), context.completeActiveTeamWebJob(message)]);
  assert.equal(calls.filter(x => x.endsWith('/generated')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/complete')).length, 1);
});
test('multi-image bundle makes one upload with no legacy complete call', async () => {
  const { context, calls } = runtime();
  context.activeTeamWebJob.job.resultDelivery = 'bundle';
  await context.completeActiveTeamWebJob({ ...message, images: [...message.images, ...message.images] });
  assert.equal(calls.filter(x => x.endsWith('/result-bundle')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-chunks') || x.endsWith('/complete')).length, 0);
});
test('duplicate failing delivery reports failure once and stale result does not affect next job', async () => {
  const { context, calls } = runtime({ teamWebWorkerRequest: async () => { throw new Error('offline'); } });
  await Promise.all([context.completeActiveTeamWebJob(message), context.completeActiveTeamWebJob(message)]);
  assert.deepEqual(calls, ['fail']);
  context.activeTeamWebJob = { job: { id: 'job-b' } };
  await context.completeActiveTeamWebJob(message);
  assert.equal(context.activeTeamWebJob.job.id, 'job-b');
});
test('late delivery failure cannot fail a new job', async () => {
  let reject;
  const { context, calls } = runtime({ teamWebWorkerRequest: () => new Promise((_resolve, fail) => { reject = fail; }) });
  const pending = context.completeActiveTeamWebJob(message);
  await Promise.resolve();
  context.activeTeamWebJob = { job: { id: 'job-b' } };
  reject(new Error('old upload failed'));
  await pending;
  assert.equal(context.activeTeamWebJob.job.id, 'job-b');
  assert.deepEqual(calls, []);
});
test('download single-flight shares successful result and permits retry after failure', async () => {
  const { context } = runtime();
  const map = new Map(); let count = 0;
  const a = context.singleFlight(map, 'x', async () => { count++; return 1; });
  const b = context.singleFlight(map, 'x', async () => { count++; return 2; });
  assert.equal(a, b); assert.equal(await a, 1); assert.equal(count, 1);
  await assert.rejects(context.singleFlight(map, 'y', async () => { throw new Error('fail'); }));
  assert.equal(await context.singleFlight(map, 'y', async () => 3), 3);
});
test('oversize multi-image bundle falls back to legacy chunks without losing images', async () => {
  const { context, calls } = runtime();
  context.activeTeamWebJob.job.resultDelivery = 'bundle';
  await context.completeActiveTeamWebJob({ ...message, images: [{ mimeType: 'image/png', base64: 'a'.repeat(18_000_004) }] });
  assert.equal(calls.filter(x => x.endsWith('/use-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-bundle')).length, 0);
});
test('real failure cleanup checks identity again after network await', async () => {
  let resolve;
  const { context, calls } = runtime({ teamWebWorkerRequest: () => new Promise(done => { resolve = done; }) });
  context.chrome.storage = { local: { set: async () => calls.push('disabled') } };
  vm.runInContext(section('async function failActiveTeamWebJob(', 'async function completeActiveTeamWebJob('), context);
  const pending = context.failActiveTeamWebJob('login_required', 'old error');
  context.activeTeamWebJob = { job: { id: 'job-b' } };
  resolve({}); await pending;
  assert.equal(context.activeTeamWebJob.job.id, 'job-b');
  assert.deepEqual(calls, []);
});
test('signed bundle download validates digest and expands multiple images once', async () => {
  const bundle = { version: 1, images: [...message.images, ...message.images] };
  let requests = 0;
  const { context } = runtime({ fetch: async () => { requests++; return new Response(JSON.stringify(bundle)); }, sha256Hex: async () => 'verified' });
  vm.runInContext(section('async function downloadTeamGatewayImages(', 'async function createTeamPreview('), context);
  const job = { id: 'download-a', images: [{ mimeType: 'application/vnd.pixel-flow.images+json', downloadUrl: 'https://relay.example/results/a', sha256: 'verified' }] };
  const [a, b] = await Promise.all([context.downloadTeamGatewayImages(job), context.downloadTeamGatewayImages(job)]);
  assert.equal(a.length, 2); assert.equal(a, b); assert.equal(requests, 1);
  await assert.rejects(context.downloadTeamGatewayImages({ ...job, id: 'bad', images: [{ ...job.images[0], sha256: 'tampered' }] }), /完整性/);
});
