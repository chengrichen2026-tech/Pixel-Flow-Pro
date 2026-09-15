import assert from 'node:assert/strict';
import test from 'node:test';
import { readBackgroundSource } from './helpers/background-source.mjs';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readBackgroundSource();
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function runtime(overrides = {}) {
  const calls = [];
  const context = vm.createContext({
    Map, Promise, Date, JSON, TextDecoder, TextEncoder, Uint8Array,
    activeTeamWebJob: { job: { id: 'job-a', resultDelivery: 'chunks' }, startedAt: Date.now() },
    teamWebDeliveries: new Map(), teamResultDownloads: new Map(),
    TEAM_WEB_SAFE_BUNDLE_BYTES: 8e6,
    estimatedTeamWebBundleBytes: images => {
      let bytes = '{"version":1,"images":['.length + 2;
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        bytes += '{"mimeType":"","base64":""}'.length + (image.mimeType || 'image/png').length + image.base64.length;
        if (index > 0) bytes += 1;
      }
      return bytes;
    },
    teamWebWorkerRequest: async (path) => { calls.push(path); return {}; },
    saveActiveTeamWebJob: async () => {},
    createTeamPreview: async () => null,
    uploadTeamWebImage: async (id, _image, endpoint) => { calls.push(`${id}/${endpoint}`); },
    clearActiveTeamWebJob: async (_close, expected) => { if (context.activeTeamWebJob === expected) context.activeTeamWebJob = undefined; },
    failActiveTeamWebJob: async (_reason, _detail, expected) => { if (context.activeTeamWebJob === expected) { calls.push('fail'); context.activeTeamWebJob = undefined; } },
    scheduleBrowserResultRecoveryAlarm: () => calls.push('schedule-recovery'),
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

test('original result delivery completes before best-effort preview upload', () => {
  const deliver = source.slice(source.indexOf('async function deliverTeamWebJob'), source.indexOf('async function handleTeamWebPageTaskMessage'));
  assert.ok(deliver.indexOf('/result-bundle') < deliver.indexOf('createTeamPreview'));
  assert.match(deliver, /uploadTeamWebImage\(active\.job\.id, preview, "preview-chunks"[\s\S]*\.catch\(\(\) => void 0\)/);
});

test('team submitter keeps polling an existing job across a transient gateway outage', async () => {
  const progress = [];
  let attempts = 0;
  const context = vm.createContext({
    Error, Promise,
    setTimeout: callback => callback(),
    teamGatewayRequest: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('无法连接团队生图服务，请检查网关地址、网络和服务状态');
      return { status: 'completed', images: [{ mimeType: 'image/png', base64: 'done' }] };
    },
    downloadTeamGatewayImages: async job => job.images,
  });
  vm.runInContext(section('async function waitForTeamGatewayJob(', 'async function recoverTeamTaskResult('), context);
  const images = await context.waitForTeamGatewayJob('job-a', detail => progress.push(detail));
  assert.equal(attempts, 2);
  assert.deepEqual(progress, ['团队服务暂时不可达，正在自动重连', '图片已生成，正在写回画布']);
  assert.equal(images[0].base64, 'done');
});

test('finishing a remote web job immediately advances queued local browser work', () => {
  assert.match(source, /await clearActiveTeamWebJob\(true, active\);\s*await updateScheduler\(async \(\) => void 0\);/);
});

test('worker reconciliation clears a terminal persisted remote job before claiming more work', () => {
  assert.match(source, /teamWebWorkerRequest\(`\/jobs\/\$\{expected\.job\.id\}\/status`\)/);
  assert.match(source, /\["completed", "failed", "canceled"\]\.includes\(remote\.status\)[\s\S]*await clearActiveTeamWebJob\(true, expected\);[\s\S]*await updateScheduler\(async \(\) => void 0\);/);
});

test('an active remote job without a concrete conversation resumes instead of only extending its lease', () => {
  assert.match(source, /if \(!concreteChatGptConversationUrl\(activeTeamWebJob\.conversationUrl\)\) \{[\s\S]*await startActiveTeamWebJob\(\)/);
  assert.match(source, /failActiveTeamWebJob\("start_error"/);
});
test('duplicate non-retryable delivery failure reports failure once and stale result does not affect next job', async () => {
  const invalid = Object.assign(new Error('invalid bundle'), { status: 400 });
  const { context, calls } = runtime({ teamWebWorkerRequest: async () => { throw invalid; } });
  await Promise.all([context.completeActiveTeamWebJob(message), context.completeActiveTeamWebJob(message)]);
  assert.deepEqual(calls, ['fail']);
  context.activeTeamWebJob = { job: { id: 'job-b' } };
  await context.completeActiveTeamWebJob(message);
  assert.equal(context.activeTeamWebJob.job.id, 'job-b');
});
test('transient delivery failure preserves the active conversation and schedules result recovery', async () => {
  const unavailable = Object.assign(new Error('relay unavailable'), { status: 503 });
  const { context, calls } = runtime({ teamWebWorkerRequest: async () => { throw unavailable; } });
  await context.completeActiveTeamWebJob(message);
  assert.equal(context.activeTeamWebJob.job.id, 'job-a');
  assert.equal(context.activeTeamWebJob.phase, 'delivering');
  assert.equal(context.activeTeamWebJob.deliveryError, 'relay unavailable');
  assert.equal(context.teamWebDeliveries.has('job-a'), false);
  assert.deepEqual(calls, ['schedule-recovery']);
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
test('worker request retries thrown network errors as well as HTTP 503 responses', async () => {
  let networkAttempts = 0;
  const context = vm.createContext({
    Error, Promise, Number, JSON, Response,
    setTimeout: callback => callback(),
    teamWebWorkerSettings: async () => ({ enabled: true, relayUrl: 'https://relay.example', deviceToken: 'pfw_token', workerId: 'web-a' }),
    fetch: async () => {
      networkAttempts += 1;
      if (networkAttempts === 1) throw new TypeError('failed to fetch');
      return Response.json({ ok: true });
    },
  });
  vm.runInContext(section('async function teamWebWorkerRequest(', 'async function saveActiveTeamWebJob('), context);
  assert.deepEqual(await context.teamWebWorkerRequest('/claim'), { ok: true });
  assert.equal(networkAttempts, 2);

  let unavailableAttempts = 0;
  context.fetch = async () => {
    unavailableAttempts += 1;
    return Response.json({ error: 'unavailable' }, { status: 503 });
  };
  await assert.rejects(context.teamWebWorkerRequest('/claim'), error => error.status === 503);
  assert.equal(unavailableAttempts, 5);
});
test('oversize multi-image bundle falls back to legacy chunks without losing images', async () => {
  const { context, calls } = runtime();
  context.activeTeamWebJob.job.resultDelivery = 'bundle';
  await context.completeActiveTeamWebJob({ ...message, images: [{ mimeType: 'image/png', base64: 'a'.repeat(18_000_004) }] });
  assert.equal(calls.filter(x => x.endsWith('/use-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-bundle')).length, 0);
});
test('large multi-image results choose chunks before serializing a combined bundle', async () => {
  const { context, calls } = runtime();
  context.activeTeamWebJob.job.resultDelivery = 'bundle';
  const images = Array.from({ length: 5 }, () => ({ mimeType: 'image/png', base64: 'a'.repeat(2_000_000) }));
  await context.completeActiveTeamWebJob({ ...message, images });
  assert.equal(calls.filter(x => x.endsWith('/use-chunks')).length, 1);
  assert.equal(calls.filter(x => x.endsWith('/result-bundle')).length, 0);
  assert.equal(calls.filter(x => x.endsWith('/result-chunks')).length, 5);
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

test('signed result prefers the authenticated taskbox proxy over the workers.dev URL', async () => {
  const bundle = { version: 1, images: [message.images[0]] };
  const calls = [];
  const { context } = runtime({
    teamGatewayResultRequest: async path => { calls.push(path); return new Response(JSON.stringify(bundle)); },
    fetch: async url => { calls.push(url); throw new Error('direct workers.dev fetch must not run'); },
    sha256Hex: async () => 'verified',
  });
  vm.runInContext(section('async function downloadTeamGatewayImages(', 'async function createTeamPreview('), context);
  const images = await context.downloadTeamGatewayImages({ id: 'proxy-a', images: [{ mimeType: 'application/vnd.pixel-flow.images+json', downloadUrl: 'https://relay.example/results/a', proxyPath: '/jobs/proxy-a/result-file', sha256: 'verified' }] });
  assert.equal(images.length, 1);
  assert.deepEqual(calls, ['/jobs/proxy-a/result-file']);
});

test('signed result falls back to the still-valid workers.dev URL when the taskbox proxy is unavailable', async () => {
  const calls = [];
  const { context } = runtime({
    teamGatewayResultRequest: async path => { calls.push(path); const error = new Error('proxy unavailable'); error.status = 502; throw error; },
    fetch: async url => { calls.push(url); return new Response('image-bytes', { headers: { 'Content-Type': 'image/png' } }); },
    sha256Hex: async () => 'verified',
    bytesToBase64: () => 'aW1hZ2UtYnl0ZXM=',
  });
  vm.runInContext(section('async function downloadTeamGatewayImages(', 'async function createTeamPreview('), context);
  const images = await context.downloadTeamGatewayImages({ id: 'proxy-fallback', images: [{ mimeType: 'image/png', downloadUrl: 'https://relay.example/results/a', proxyPath: '/jobs/proxy-fallback/result-file', sha256: 'verified' }] });
  assert.equal(images.length, 1);
  assert.deepEqual(calls, ['/jobs/proxy-fallback/result-file', 'https://relay.example/results/a']);
});

test('signed result does not bypass a taskbox authorization failure', async () => {
  let directRequests = 0;
  const { context } = runtime({
    teamGatewayResultRequest: async () => { const error = new Error('unauthorized'); error.status = 401; throw error; },
    fetch: async () => { directRequests++; return new Response('unexpected'); },
    sha256Hex: async () => 'verified',
  });
  vm.runInContext(section('async function downloadTeamGatewayImages(', 'async function createTeamPreview('), context);
  await assert.rejects(context.downloadTeamGatewayImages({ id: 'proxy-auth', images: [{ mimeType: 'image/png', downloadUrl: 'https://relay.example/results/a', proxyPath: '/jobs/proxy-auth/result-file', sha256: 'verified' }] }), /unauthorized/);
  assert.equal(directRequests, 0);
});
