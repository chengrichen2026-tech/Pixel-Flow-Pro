//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region src/domain/queue.ts
var BROWSER_LAUNCH_GAP_MS = 6e3;
var emptyQueue = () => ({
	waiting: [],
	running: [],
	completed: [],
	failed: {}
});
function createQueueSnapshot(queue, pendingScopes) {
	return {
		queue: structuredClone(queue),
		pendingScopes: [...pendingScopes]
	};
}
function restoreQueueSnapshot(raw) {
	if (!raw || typeof raw !== "object") return {
		queue: emptyQueue(),
		pendingScopes: /* @__PURE__ */ new Map()
	};
	const snapshot = raw;
	const queue = snapshot.queue;
	if (!queue || !Array.isArray(queue.waiting) || !Array.isArray(queue.running) || !Array.isArray(queue.completed) || !queue.failed || typeof queue.failed !== "object") return {
		queue: emptyQueue(),
		pendingScopes: /* @__PURE__ */ new Map()
	};
	const pendingScopes = Array.isArray(snapshot.pendingScopes) ? snapshot.pendingScopes.filter((entry) => Array.isArray(entry) && entry.length === 2 && entry.every((value) => typeof value === "string")) : [];
	return {
		queue: structuredClone(queue),
		pendingScopes: new Map(pendingScopes)
	};
}
function enqueue(queue, taskIds) {
	const known = /* @__PURE__ */ new Set([...queue.waiting, ...queue.running]);
	const waiting = [...queue.waiting];
	const completed = queue.completed.filter((taskId) => !taskIds.includes(taskId));
	const failed = { ...queue.failed };
	for (const taskId of taskIds) {
		if (known.has(taskId)) continue;
		known.add(taskId);
		waiting.push(taskId);
		delete failed[taskId];
	}
	return {
		...queue,
		waiting,
		completed,
		failed
	};
}
function complete(queue, taskId) {
	if (!queue.running.includes(taskId)) return queue;
	return {
		...queue,
		running: queue.running.filter((id) => id !== taskId),
		completed: [...queue.completed, taskId]
	};
}
function fail(queue, taskId, reason) {
	if (!queue.running.includes(taskId)) return queue;
	return {
		...queue,
		running: queue.running.filter((id) => id !== taskId),
		failed: {
			...queue.failed,
			[taskId]: reason
		}
	};
}
function cancelTask(queue, taskId) {
	if (!queue.waiting.includes(taskId) && !queue.running.includes(taskId)) return queue;
	return {
		...queue,
		waiting: queue.waiting.filter((id) => id !== taskId),
		running: queue.running.filter((id) => id !== taskId)
	};
}
function reconcileQueue(queue, activeTaskKeys) {
	const liveUnique = (keys) => [...new Set(keys)].filter((key) => activeTaskKeys.has(key));
	return {
		waiting: liveUnique(queue.waiting),
		running: liveUnique(queue.running),
		completed: [],
		failed: {}
	};
}
//#endregion
//#region src/domain/aspect-ratio.ts
var ratioInstructions = {
	auto: "画面比例要求：请根据参考图、主体内容和使用场景，自动选择最合适的画面比例。",
	"1:1": "画面比例要求：请生成正方形 1:1 比例的图片。",
	"3:4": "画面比例要求：请生成竖向 3:4 比例的图片。",
	"4:3": "画面比例要求：请生成横向 4:3 比例的图片。",
	"4:5": "画面比例要求：请生成竖向 4:5 比例的图片。",
	"5:4": "画面比例要求：请生成横向 5:4 比例的图片。",
	"2:3": "画面比例要求：请生成竖向 2:3 比例的图片。",
	"3:2": "画面比例要求：请生成横向 3:2 比例的图片。",
	"9:16": "画面比例要求：请生成竖向 9:16 比例的图片。",
	"16:9": "画面比例要求：请生成横向 16:9 比例的图片。",
	"21:9": "画面比例要求：请生成超宽横向 21:9 比例的图片。"
};
function appendAspectRatioPrompt(prompt, ratio) {
	const instruction = ratioInstructions[ratio] ?? ratioInstructions.auto;
	const withoutExistingInstruction = prompt.replace(/(?:^|\r?\n+)画面比例要求：[^\r\n]*/g, "");
	const content = withoutExistingInstruction === prompt ? prompt : withoutExistingInstruction.trimEnd();
	return content ? `${content}\n\n${instruction}` : instruction;
}
//#endregion
//#region src/background/task-scope.ts
var createTaskScopeKey = (projectId, taskId) => JSON.stringify([projectId, taskId]);
function parseTaskScopeKey(key) {
	try {
		const value = JSON.parse(key);
		if (!Array.isArray(value) || value.length !== 2 || value.some((part) => typeof part !== "string")) return void 0;
		return {
			projectId: value[0],
			taskId: value[1]
		};
	} catch {
		return;
	}
}
//#endregion
//#region src/background/notification-target.ts
var PREFIX = "task:";
var createTaskNotificationId = (projectId, taskId) => `${PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(taskId)}`;
function readNotificationTarget(notificationId) {
	if (!notificationId.startsWith(PREFIX)) return void 0;
	const [projectId, taskId] = notificationId.slice(5).split(":");
	if (!projectId || !taskId) return void 0;
	return {
		projectId: decodeURIComponent(projectId),
		taskId: decodeURIComponent(taskId)
	};
}
function notificationIdToCanvasUrl(notificationId, canvasUrl) {
	const target = readNotificationTarget(notificationId);
	if (!target) return canvasUrl;
	const url = new URL(canvasUrl);
	url.searchParams.set("projectId", target.projectId);
	url.searchParams.set("taskId", target.taskId);
	return url.toString();
}
//#endregion
//#region src/domain/task-run.ts
var terminalRunStatuses = [
	"completed",
	"failed",
	"canceled"
];
var transitions = {
	queued: [
		"preparing",
		"failed",
		"canceled"
	],
	preparing: [
		"uploading",
		"sending",
		"submitted",
		"failed",
		"needs_action",
		"canceled"
	],
	uploading: [
		"sending",
		"failed",
		"needs_action",
		"canceled"
	],
	sending: [
		"submitted",
		"generating",
		"failed",
		"needs_action",
		"canceled"
	],
	submitted: [
		"generating",
		"delivering",
		"completed",
		"failed",
		"needs_action",
		"canceled"
	],
	generating: [
		"delivering",
		"completed",
		"failed",
		"needs_action",
		"canceled"
	],
	needs_action: [
		"submitted",
		"generating",
		"delivering",
		"completed",
		"failed",
		"canceled"
	],
	delivering: [
		"completed",
		"failed",
		"canceled"
	],
	completed: [],
	failed: [],
	canceled: []
};
var isTerminalRunStatus = (status) => terminalRunStatuses.includes(status);
var canTransitionRun = (current, next) => current === next || transitions[current].includes(next);
function transitionRunStatus(current, next) {
	if (!canTransitionRun(current, next)) throw new Error(`Invalid task run transition: ${current} -> ${next}`);
	return next;
}
function resolveRunTransition(current, target) {
	if (current === target) return [];
	const pending = [{
		status: current,
		path: []
	}];
	const visited = /* @__PURE__ */ new Set([current]);
	while (pending.length) {
		const candidate = pending.shift();
		for (const next of transitions[candidate.status]) {
			const path = [...candidate.path, next];
			if (next === target) return path;
			if (!visited.has(next)) {
				visited.add(next);
				pending.push({
					status: next,
					path
				});
			}
		}
	}
	throw new Error(`Invalid task run transition: ${current} -> ${target}`);
}
var legacyToRunStatus = {
	queued: "queued",
	waiting_page: "preparing",
	uploading: "uploading",
	sending: "sending",
	generating: "generating",
	manual_action: "needs_action",
	completed: "completed",
	failed: "failed"
};
function legacyTaskStatusToRunStatus(status) {
	return status === "idle" ? void 0 : legacyToRunStatus[status];
}
function runStatusToLegacyTaskStatus(status) {
	if (status === "preparing" || status === "submitted" || status === "delivering") return "generating";
	if (status === "needs_action") return "manual_action";
	if (status === "canceled") return "failed";
	return status;
}
//#endregion
//#region src/domain/run-projection.ts
var manualActionReasons = /* @__PURE__ */ new Set([
	"login_required",
	"verification_required",
	"usage_limited",
	"conversation_unavailable",
	"send_interaction_required"
]);
function runEventStatus(event) {
	if (event.type === "TASK_STATUS") return event.runStatus ?? legacyTaskStatusToRunStatus(event.status);
	if (event.type === "TASK_RESULT") return "completed";
	return manualActionReasons.has(event.reason) ? "needs_action" : "failed";
}
function runEventPatch(event) {
	if (event.type === "TASK_STATUS") return {
		providerJobId: event.clearApiJobId ? null : event.apiJobId,
		conversationUrl: event.conversationUrl,
		detail: event.detail ?? null
	};
	if (event.type === "TASK_RESULT") {
		const hasContent = event.images.length > 0 || Boolean(event.responseText?.trim());
		return {
			conversationUrl: event.conversationUrl,
			detail: hasContent ? null : "已完成，但没有生成内容"
		};
	}
	return {
		conversationUrl: event.conversationUrl,
		detail: event.detail ?? null
	};
}
function projectRunToLegacyTask(run) {
	return {
		status: runStatusToLegacyTaskStatus(run.status),
		runtimeStatus: run.status,
		recoverableResult: run.status === "failed" && Boolean(run.providerJobId),
		statusDetail: run.detail,
		apiJobId: isTerminalRunStatus(run.status) ? void 0 : run.providerJobId,
		conversationUrl: run.conversationUrl
	};
}
var isDuplicateTerminalRunEvent = (current, target) => current === target && isTerminalRunStatus(current);
function resolveTaskRuntime(task, run) {
	const status = run?.status ?? legacyTaskStatusToRunStatus(task.status);
	return {
		status,
		providerJobId: run ? run.providerJobId : task.apiJobId,
		conversationUrl: run?.conversationUrl ?? task.conversationUrl,
		detail: run ? run.detail : task.statusDetail,
		active: Boolean(status && !isTerminalRunStatus(status)),
		authoritative: Boolean(run)
	};
}
//#endregion
//#region src/storage/task-run-repository.ts
var runId = () => `run-${crypto.randomUUID()}`;
var isCurrentRecord = (run) => run.schemaVersion === 2 && Number.isInteger(run.attempt) && typeof run.status === "string";
var applyPatch = (record, patch) => {
	const next = { ...record };
	for (const [key, value] of Object.entries(patch)) {
		if (value === void 0) continue;
		if (value === null) delete next[key];
		else Object.assign(next, { [key]: value });
	}
	return next;
};
var TaskRunRepository = class {
	table;
	now;
	constructor(table, now = Date.now) {
		this.table = table;
		this.now = now;
	}
	async list(projectId, taskId) {
		return (await this.table.toArray()).filter((run) => isCurrentRecord(run) && run.projectId === projectId && run.taskId === taskId).sort((left, right) => left.attempt - right.attempt);
	}
	async latest(projectId, taskId) {
		return (await this.list(projectId, taskId)).at(-1);
	}
	async latestByProject(projectId) {
		const latest = /* @__PURE__ */ new Map();
		for (const run of await this.table.toArray()) {
			if (!isCurrentRecord(run) || run.projectId !== projectId) continue;
			const current = latest.get(run.taskId);
			if (!current || run.attempt > current.attempt) latest.set(run.taskId, structuredClone(run));
		}
		return latest;
	}
	async start(projectId, taskId, provider) {
		const latest = (await this.list(projectId, taskId)).at(-1);
		if (latest && !isTerminalRunStatus(latest.status)) return structuredClone(latest);
		const timestamp = this.now();
		const run = {
			schemaVersion: 2,
			id: runId(),
			projectId,
			taskId,
			attempt: (latest?.attempt ?? 0) + 1,
			provider,
			status: "queued",
			startedAt: timestamp,
			updatedAt: timestamp
		};
		await this.table.put(run);
		return structuredClone(run);
	}
	async transition(id, status, patch = {}) {
		const current = await this.table.get(id);
		if (!current) throw new Error(`Task run not found: ${id}`);
		const nextStatus = transitionRunStatus(current.status, status);
		const timestamp = this.now();
		const next = {
			...applyPatch(current, patch),
			status: nextStatus,
			updatedAt: timestamp,
			terminalAt: isTerminalRunStatus(nextStatus) ? current.terminalAt ?? timestamp : void 0
		};
		await this.table.put(next);
		return structuredClone(next);
	}
	async advance(id, status, patch = {}) {
		const current = await this.table.get(id);
		if (!current || !isCurrentRecord(current)) throw new Error(`Task run not found: ${id}`);
		resolveRunTransition(current.status, status);
		const timestamp = this.now();
		const next = {
			...applyPatch(current, patch),
			status,
			updatedAt: timestamp,
			terminalAt: isTerminalRunStatus(status) ? current.terminalAt ?? timestamp : void 0
		};
		await this.table.put(next);
		return structuredClone(next);
	}
};
//#endregion
//#region node_modules/dexie/import-wrapper-prod.mjs
var import_dexie_min = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	((e, t) => {
		"object" == typeof exports && "undefined" != typeof module ? module.exports = t() : "function" == typeof define && define.amd ? define(t) : (e = "undefined" != typeof globalThis ? globalThis : e || self).Dexie = t();
	})(exports, function() {
		var B = function(e, t) {
			return (B = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? function(e, t) {
				e.__proto__ = t;
			} : function(e, t) {
				for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
			}))(e, t);
		};
		var _ = function() {
			return (_ = Object.assign || function(e) {
				for (var t, n = 1, r = arguments.length; n < r; n++) for (var i in t = arguments[n]) Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
				return e;
			}).apply(this, arguments);
		};
		function R(e, t, n) {
			if (n || 2 === arguments.length) for (var r, i = 0, o = t.length; i < o; i++) !r && i in t || ((r = r || Array.prototype.slice.call(t, 0, i))[i] = t[i]);
			return e.concat(r || Array.prototype.slice.call(t));
		}
		var f = "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : "undefined" != typeof window ? window : global, O = Object.keys, x = Array.isArray;
		function a(t, n) {
			return "object" == typeof n && O(n).forEach(function(e) {
				t[e] = n[e];
			}), t;
		}
		"undefined" == typeof Promise || f.Promise || (f.Promise = Promise);
		var F = Object.getPrototypeOf, N = {}.hasOwnProperty;
		function m(e, t) {
			return N.call(e, t);
		}
		function M(t, n) {
			"function" == typeof n && (n = n(F(t))), ("undefined" == typeof Reflect ? O : Reflect.ownKeys)(n).forEach(function(e) {
				u(t, e, n[e]);
			});
		}
		var L = Object.defineProperty;
		function u(e, t, n, r) {
			L(e, t, a(n && m(n, "get") && "function" == typeof n.get ? {
				get: n.get,
				set: n.set,
				configurable: !0
			} : {
				value: n,
				configurable: !0,
				writable: !0
			}, r));
		}
		function U(t) {
			return { from: function(e) {
				return t.prototype = Object.create(e.prototype), u(t.prototype, "constructor", t), { extend: M.bind(null, t.prototype) };
			} };
		}
		var z = Object.getOwnPropertyDescriptor;
		var V = [].slice;
		function W(e, t, n) {
			return V.call(e, t, n);
		}
		function Y(e, t) {
			return t(e);
		}
		function $(e) {
			if (!e) throw new Error("Assertion Failed");
		}
		function Q(e) {
			f.setImmediate ? setImmediate(e) : setTimeout(e, 0);
		}
		function c(e, t) {
			if ("string" == typeof t && m(e, t)) return e[t];
			if (!t) return e;
			if ("string" != typeof t) {
				for (var n = [], r = 0, i = t.length; r < i; ++r) {
					var o = c(e, t[r]);
					n.push(o);
				}
				return n;
			}
			var a, u = t.indexOf(".");
			return -1 === u || null == (a = e[t.substr(0, u)]) ? void 0 : c(a, t.substr(u + 1));
		}
		function b(e, t, n) {
			if (e && void 0 !== t && !("isFrozen" in Object && Object.isFrozen(e))) if ("string" != typeof t && "length" in t) {
				$("string" != typeof n && "length" in n);
				for (var r = 0, i = t.length; r < i; ++r) b(e, t[r], n[r]);
			} else {
				var o = t.indexOf(".");
				if (-1 !== o) {
					var a = t.substr(0, o), o = t.substr(o + 1);
					if ("" === o) void 0 === n ? x(e) && !isNaN(parseInt(a)) ? e.splice(a, 1) : delete e[a] : e[a] = n;
					else {
						var u = e[a];
						if (!u || !m(e, a)) {
							if (void 0 === n) return;
							u = e[a] = {};
						}
						b(u, o, n);
					}
				} else void 0 === n ? x(e) && !isNaN(parseInt(t)) ? e.splice(t, 1) : delete e[t] : e[t] = n;
			}
		}
		function G(e) {
			var t, n = {};
			for (t in e) m(e, t) && (n[t] = e[t]);
			return n;
		}
		var X = [].concat;
		function H(e) {
			return X.apply([], e);
		}
		var e = "BigUint64Array,BigInt64Array,Array,Boolean,String,Date,RegExp,Blob,File,FileList,FileSystemFileHandle,FileSystemDirectoryHandle,ArrayBuffer,DataView,Uint8ClampedArray,ImageBitmap,ImageData,Map,Set,CryptoKey".split(",").concat(H([
			8,
			16,
			32,
			64
		].map(function(t) {
			return [
				"Int",
				"Uint",
				"Float"
			].map(function(e) {
				return e + t + "Array";
			});
		}))).filter(function(e) {
			return f[e];
		}), J = new Set(e.map(function(e) {
			return f[e];
		}));
		var Z = null;
		function ee(e) {
			Z = /* @__PURE__ */ new WeakMap();
			e = function e(t) {
				if (!t || "object" != typeof t) return t;
				var n = Z.get(t);
				if (n) return n;
				if (x(t)) {
					n = [], Z.set(t, n);
					for (var r = 0, i = t.length; r < i; ++r) n.push(e(t[r]));
				} else if (J.has(t.constructor)) n = t;
				else {
					var o, a = F(t);
					for (o in n = a === Object.prototype ? {} : Object.create(a), Z.set(t, n), t) m(t, o) && (n[o] = e(t[o]));
				}
				return n;
			}(e);
			return Z = null, e;
		}
		var te = {}.toString;
		function ne(e) {
			return te.call(e).slice(8, -1);
		}
		var re = "undefined" != typeof Symbol ? Symbol.iterator : "@@iterator", ie = "symbol" == typeof re ? function(e) {
			var t;
			return null != e && (t = e[re]) && t.apply(e);
		} : function() {
			return null;
		};
		function oe(e, t) {
			t = e.indexOf(t);
			0 <= t && e.splice(t, 1);
		}
		var ae = {};
		function n(e) {
			var t, n, r, i;
			if (1 === arguments.length) {
				if (x(e)) return e.slice();
				if (this === ae && "string" == typeof e) return [e];
				if (i = ie(e)) for (n = []; !(r = i.next()).done;) n.push(r.value);
				else {
					if (null == e) return [e];
					if ("number" != typeof (t = e.length)) return [e];
					for (n = new Array(t); t--;) n[t] = e[t];
				}
			} else for (t = arguments.length, n = new Array(t); t--;) n[t] = arguments[t];
			return n;
		}
		var ue = "undefined" != typeof Symbol ? function(e) {
			return "AsyncFunction" === e[Symbol.toStringTag];
		} : function() {
			return !1;
		}, e = [
			"Unknown",
			"Constraint",
			"Data",
			"TransactionInactive",
			"ReadOnly",
			"Version",
			"NotFound",
			"InvalidState",
			"InvalidAccess",
			"Abort",
			"Timeout",
			"QuotaExceeded",
			"Syntax",
			"DataClone"
		], t = [
			"Modify",
			"Bulk",
			"OpenFailed",
			"VersionChange",
			"Schema",
			"Upgrade",
			"InvalidTable",
			"MissingAPI",
			"NoSuchDatabase",
			"InvalidArgument",
			"SubTransaction",
			"Unsupported",
			"Internal",
			"DatabaseClosed",
			"PrematureCommit",
			"ForeignAwait"
		].concat(e), se = {
			VersionChanged: "Database version changed by other database connection",
			DatabaseClosed: "Database has been closed",
			Abort: "Transaction aborted",
			TransactionInactive: "Transaction has already completed or failed",
			MissingAPI: "IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb"
		};
		function ce(e, t) {
			this.name = e, this.message = t;
		}
		function le(e, t) {
			return e + ". Errors: " + Object.keys(t).map(function(e) {
				return t[e].toString();
			}).filter(function(e, t, n) {
				return n.indexOf(e) === t;
			}).join("\n");
		}
		function fe(e, t, n, r) {
			this.failures = t, this.failedKeys = r, this.successCount = n, this.message = le(e, t);
		}
		function he(e, t) {
			this.name = "BulkError", this.failures = Object.keys(t).map(function(e) {
				return t[e];
			}), this.failuresByPos = t, this.message = le(e, this.failures);
		}
		U(ce).from(Error).extend({ toString: function() {
			return this.name + ": " + this.message;
		} }), U(fe).from(ce), U(he).from(ce);
		var de = t.reduce(function(e, t) {
			return e[t] = t + "Error", e;
		}, {}), pe = ce, k = t.reduce(function(e, n) {
			var r = n + "Error";
			function t(e, t) {
				this.name = r, e ? "string" == typeof e ? (this.message = "".concat(e).concat(t ? "\n " + t : ""), this.inner = t || null) : "object" == typeof e && (this.message = "".concat(e.name, " ").concat(e.message), this.inner = e) : (this.message = se[n] || r, this.inner = null);
			}
			return U(t).from(pe), e[n] = t, e;
		}, {}), ye = (k.Syntax = SyntaxError, k.Type = TypeError, k.Range = RangeError, e.reduce(function(e, t) {
			return e[t + "Error"] = k[t], e;
		}, {}));
		e = t.reduce(function(e, t) {
			return -1 === [
				"Syntax",
				"Type",
				"Range"
			].indexOf(t) && (e[t + "Error"] = k[t]), e;
		}, {});
		function g() {}
		function ve(e) {
			return e;
		}
		function me(t, n) {
			return null == t || t === ve ? n : function(e) {
				return n(t(e));
			};
		}
		function be(e, t) {
			return function() {
				e.apply(this, arguments), t.apply(this, arguments);
			};
		}
		function ge(i, o) {
			return i === g ? o : function() {
				var e = i.apply(this, arguments), t = (void 0 !== e && (arguments[0] = e), this.onsuccess), n = this.onerror, r = (this.onsuccess = null, this.onerror = null, o.apply(this, arguments));
				return t && (this.onsuccess = this.onsuccess ? be(t, this.onsuccess) : t), n && (this.onerror = this.onerror ? be(n, this.onerror) : n), void 0 !== r ? r : e;
			};
		}
		function we(n, r) {
			return n === g ? r : function() {
				n.apply(this, arguments);
				var e = this.onsuccess, t = this.onerror;
				this.onsuccess = this.onerror = null, r.apply(this, arguments), e && (this.onsuccess = this.onsuccess ? be(e, this.onsuccess) : e), t && (this.onerror = this.onerror ? be(t, this.onerror) : t);
			};
		}
		function _e(i, o) {
			return i === g ? o : function(e) {
				var t = i.apply(this, arguments), e = (a(e, t), this.onsuccess), n = this.onerror, r = (this.onsuccess = null, this.onerror = null, o.apply(this, arguments));
				return e && (this.onsuccess = this.onsuccess ? be(e, this.onsuccess) : e), n && (this.onerror = this.onerror ? be(n, this.onerror) : n), void 0 === t ? void 0 === r ? void 0 : r : a(t, r);
			};
		}
		function xe(e, t) {
			return e === g ? t : function() {
				return !1 !== t.apply(this, arguments) && e.apply(this, arguments);
			};
		}
		function ke(i, o) {
			return i === g ? o : function() {
				var e = i.apply(this, arguments);
				if (e && "function" == typeof e.then) {
					for (var t = this, n = arguments.length, r = new Array(n); n--;) r[n] = arguments[n];
					return e.then(function() {
						return o.apply(t, r);
					});
				}
				return o.apply(this, arguments);
			};
		}
		e.ModifyError = fe, e.DexieError = ce, e.BulkError = he;
		var l = "undefined" != typeof location && /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);
		function Oe(e) {
			l = e;
		}
		var Pe = {}, Ke = 100, Ee = "undefined" == typeof Promise ? [] : (t = Promise.resolve(), "undefined" != typeof crypto && crypto.subtle ? [
			Ee = crypto.subtle.digest("SHA-512", new Uint8Array([0])),
			F(Ee),
			t
		] : [
			t,
			F(t),
			t
		]), t = Ee[0], Se = Ee[1], Se = Se && Se.then, Ae = t && t.constructor, je = !!Ee[2];
		var Ce = function(e, t) {
			Re.push([e, t]), Ie && (queueMicrotask(Ye), Ie = !1);
		}, Te = !0, Ie = !0, qe = [], De = [], Be = ve, s = {
			id: "global",
			global: !0,
			ref: 0,
			unhandleds: [],
			onunhandled: g,
			pgp: !1,
			env: {},
			finalize: g
		}, P = s, Re = [], Fe = 0, Ne = [];
		function K(e) {
			if ("object" != typeof this) throw new TypeError("Promises must be constructed via new");
			this._listeners = [], this._lib = !1;
			var t = this._PSD = P;
			if ("function" != typeof e) {
				if (e !== Pe) throw new TypeError("Not a function");
				this._state = arguments[1], this._value = arguments[2], !1 === this._state && Ue(this, this._value);
			} else this._state = null, this._value = null, ++t.ref, function t(r, e) {
				try {
					e(function(n) {
						if (null === r._state) {
							if (n === r) throw new TypeError("A promise cannot be resolved with itself.");
							var e = r._lib && $e();
							n && "function" == typeof n.then ? t(r, function(e, t) {
								n instanceof K ? n._then(e, t) : n.then(e, t);
							}) : (r._state = !0, r._value = n, ze(r)), e && Qe();
						}
					}, Ue.bind(null, r));
				} catch (e) {
					Ue(r, e);
				}
			}(this, e);
		}
		var Me = {
			get: function() {
				var u = P, t = et;
				function e(n, r) {
					var i = this, o = !u.global && (u !== P || t !== et), a = o && !w(), e = new K(function(e, t) {
						Ve(i, new Le(ut(n, u, o, a), ut(r, u, o, a), e, t, u));
					});
					return this._consoleTask && (e._consoleTask = this._consoleTask), e;
				}
				return e.prototype = Pe, e;
			},
			set: function(e) {
				u(this, "then", e && e.prototype === Pe ? Me : {
					get: function() {
						return e;
					},
					set: Me.set
				});
			}
		};
		function Le(e, t, n, r, i) {
			this.onFulfilled = "function" == typeof e ? e : null, this.onRejected = "function" == typeof t ? t : null, this.resolve = n, this.reject = r, this.psd = i;
		}
		function Ue(e, t) {
			var n, r;
			De.push(t), null === e._state && (n = e._lib && $e(), t = Be(t), e._state = !1, e._value = t, r = e, qe.some(function(e) {
				return e._value === r._value;
			}) || qe.push(r), ze(e), n) && Qe();
		}
		function ze(e) {
			var t = e._listeners;
			e._listeners = [];
			for (var n = 0, r = t.length; n < r; ++n) Ve(e, t[n]);
			var i = e._PSD;
			--i.ref || i.finalize(), 0 === Fe && (++Fe, Ce(function() {
				0 == --Fe && Ge();
			}, []));
		}
		function Ve(e, t) {
			if (null === e._state) e._listeners.push(t);
			else {
				var n = e._state ? t.onFulfilled : t.onRejected;
				if (null === n) return (e._state ? t.resolve : t.reject)(e._value);
				++t.psd.ref, ++Fe, Ce(We, [
					n,
					e,
					t
				]);
			}
		}
		function We(e, t, n) {
			try {
				var r, i = t._value;
				!t._state && De.length && (De = []), r = l && t._consoleTask ? t._consoleTask.run(function() {
					return e(i);
				}) : e(i), t._state || -1 !== De.indexOf(i) || ((e) => {
					for (var t = qe.length; t;) if (qe[--t]._value === e._value) return qe.splice(t, 1);
				})(t), n.resolve(r);
			} catch (e) {
				n.reject(e);
			} finally {
				0 == --Fe && Ge(), --n.psd.ref || n.psd.finalize();
			}
		}
		function Ye() {
			at(s, function() {
				$e() && Qe();
			});
		}
		function $e() {
			var e = Te;
			return Ie = Te = !1, e;
		}
		function Qe() {
			var e, t, n;
			do
				for (; 0 < Re.length;) for (e = Re, Re = [], n = e.length, t = 0; t < n; ++t) {
					var r = e[t];
					r[0].apply(null, r[1]);
				}
			while (0 < Re.length);
			Ie = Te = !0;
		}
		function Ge() {
			for (var e = qe, t = (qe = [], e.forEach(function(e) {
				e._PSD.onunhandled.call(null, e._value, e);
			}), Ne.slice(0)), n = t.length; n;) t[--n]();
		}
		function Xe(e) {
			return new K(Pe, !1, e);
		}
		function E(n, r) {
			var i = P;
			return function() {
				var e = $e(), t = P;
				try {
					return h(i, !0), n.apply(this, arguments);
				} catch (e) {
					r && r(e);
				} finally {
					h(t, !1), e && Qe();
				}
			};
		}
		M(K.prototype, {
			then: Me,
			_then: function(e, t) {
				Ve(this, new Le(null, null, e, t, P));
			},
			catch: function(e) {
				var t, n;
				return 1 === arguments.length ? this.then(null, e) : (t = e, n = arguments[1], "function" == typeof t ? this.then(null, function(e) {
					return (e instanceof t ? n : Xe)(e);
				}) : this.then(null, function(e) {
					return (e && e.name === t ? n : Xe)(e);
				}));
			},
			finally: function(t) {
				return this.then(function(e) {
					return K.resolve(t()).then(function() {
						return e;
					});
				}, function(e) {
					return K.resolve(t()).then(function() {
						return Xe(e);
					});
				});
			},
			timeout: function(r, i) {
				var o = this;
				return r < 1 / 0 ? new K(function(e, t) {
					var n = setTimeout(function() {
						return t(new k.Timeout(i));
					}, r);
					o.then(e, t).finally(clearTimeout.bind(null, n));
				}) : this;
			}
		}), "undefined" != typeof Symbol && Symbol.toStringTag && u(K.prototype, Symbol.toStringTag, "Dexie.Promise"), s.env = ot(), M(K, {
			all: function() {
				var o = n.apply(null, arguments).map(rt);
				return new K(function(n, r) {
					0 === o.length && n([]);
					var i = o.length;
					o.forEach(function(e, t) {
						return K.resolve(e).then(function(e) {
							o[t] = e, --i || n(o);
						}, r);
					});
				});
			},
			resolve: function(n) {
				return n instanceof K ? n : n && "function" == typeof n.then ? new K(function(e, t) {
					n.then(e, t);
				}) : new K(Pe, !0, n);
			},
			reject: Xe,
			race: function() {
				var e = n.apply(null, arguments).map(rt);
				return new K(function(t, n) {
					e.map(function(e) {
						return K.resolve(e).then(t, n);
					});
				});
			},
			PSD: {
				get: function() {
					return P;
				},
				set: function(e) {
					return P = e;
				}
			},
			totalEchoes: { get: function() {
				return et;
			} },
			newPSD: v,
			usePSD: at,
			scheduler: {
				get: function() {
					return Ce;
				},
				set: function(e) {
					Ce = e;
				}
			},
			rejectionMapper: {
				get: function() {
					return Be;
				},
				set: function(e) {
					Be = e;
				}
			},
			follow: function(i, n) {
				return new K(function(e, t) {
					return v(function(n, r) {
						var e = P;
						e.unhandleds = [], e.onunhandled = r, e.finalize = be(function() {
							var t, e = this;
							t = function() {
								0 === e.unhandleds.length ? n() : r(e.unhandleds[0]);
							}, Ne.push(function e() {
								t(), Ne.splice(Ne.indexOf(e), 1);
							}), ++Fe, Ce(function() {
								0 == --Fe && Ge();
							}, []);
						}, e.finalize), i();
					}, n, e, t);
				});
			}
		}), Ae && (Ae.allSettled && u(K, "allSettled", function() {
			var e = n.apply(null, arguments).map(rt);
			return new K(function(n) {
				0 === e.length && n([]);
				var r = e.length, i = new Array(r);
				e.forEach(function(e, t) {
					return K.resolve(e).then(function(e) {
						return i[t] = {
							status: "fulfilled",
							value: e
						};
					}, function(e) {
						return i[t] = {
							status: "rejected",
							reason: e
						};
					}).then(function() {
						return --r || n(i);
					});
				});
			});
		}), Ae.any && "undefined" != typeof AggregateError && u(K, "any", function() {
			var e = n.apply(null, arguments).map(rt);
			return new K(function(n, r) {
				0 === e.length && r(/* @__PURE__ */ new AggregateError([]));
				var i = e.length, o = new Array(i);
				e.forEach(function(e, t) {
					return K.resolve(e).then(function(e) {
						return n(e);
					}, function(e) {
						o[t] = e, --i || r(new AggregateError(o));
					});
				});
			});
		}), Ae.withResolvers) && (K.withResolvers = Ae.withResolvers);
		var o = {
			awaits: 0,
			echoes: 0,
			id: 0
		}, He = 0, Je = [], Ze = 0, et = 0, tt = 0;
		function v(e, t, n, r) {
			var i = P, o = Object.create(i), t = (o.parent = i, o.ref = 0, o.global = !1, o.id = ++tt, s.env, o.env = je ? {
				Promise: K,
				PromiseProp: {
					value: K,
					configurable: !0,
					writable: !0
				},
				all: K.all,
				race: K.race,
				allSettled: K.allSettled,
				any: K.any,
				resolve: K.resolve,
				reject: K.reject
			} : {}, t && a(o, t), ++i.ref, o.finalize = function() {
				--this.parent.ref || this.parent.finalize();
			}, at(o, e, n, r));
			return 0 === o.ref && o.finalize(), t;
		}
		function nt() {
			return o.id || (o.id = ++He), ++o.awaits, o.echoes += Ke, o.id;
		}
		function w() {
			return !!o.awaits && (0 == --o.awaits && (o.id = 0), o.echoes = o.awaits * Ke, !0);
		}
		function rt(e) {
			return o.echoes && e && e.constructor === Ae ? (nt(), e.then(function(e) {
				return w(), e;
			}, function(e) {
				return w(), S(e);
			})) : e;
		}
		function it() {
			var e = Je[Je.length - 1];
			Je.pop(), h(e, !1);
		}
		function h(e, t) {
			var n, r, i = P;
			(t ? !o.echoes || Ze++ && e === P : !Ze || --Ze && e === P) || queueMicrotask(t ? function(e) {
				++et, o.echoes && 0 != --o.echoes || (o.echoes = o.awaits = o.id = 0), Je.push(P), h(e, !0);
			}.bind(null, e) : it), e !== P && (P = e, i === s && (s.env = ot()), je) && (n = s.env.Promise, r = e.env, i.global || e.global) && (Object.defineProperty(f, "Promise", r.PromiseProp), n.all = r.all, n.race = r.race, n.resolve = r.resolve, n.reject = r.reject, r.allSettled && (n.allSettled = r.allSettled), r.any) && (n.any = r.any);
		}
		function ot() {
			var e = f.Promise;
			return je ? {
				Promise: e,
				PromiseProp: Object.getOwnPropertyDescriptor(f, "Promise"),
				all: e.all,
				race: e.race,
				allSettled: e.allSettled,
				any: e.any,
				resolve: e.resolve,
				reject: e.reject
			} : {};
		}
		function at(e, t, n, r, i) {
			var o = P;
			try {
				return h(e, !0), t(n, r, i);
			} finally {
				h(o, !1);
			}
		}
		function ut(t, n, r, i) {
			return "function" != typeof t ? t : function() {
				var e = P;
				r && nt(), h(n, !0);
				try {
					return t.apply(this, arguments);
				} finally {
					h(e, !1), i && queueMicrotask(w);
				}
			};
		}
		function st(e) {
			Promise === Ae && 0 === o.echoes ? 0 === Ze ? e() : enqueueNativeMicroTask(e) : setTimeout(e, 0);
		}
		-1 === ("" + Se).indexOf("[native code]") && (nt = w = g);
		var S = K.reject;
		var ct = String.fromCharCode(65535), A = "Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.", lt = "String expected.", ft = "__dbnames", ht = "readonly", dt = "readwrite";
		function pt(e, t) {
			return e ? t ? function() {
				return e.apply(this, arguments) && t.apply(this, arguments);
			} : e : t;
		}
		var yt = {
			type: 3,
			lower: -1 / 0,
			lowerOpen: !1,
			upper: [[]],
			upperOpen: !1
		};
		function vt(t) {
			return "string" != typeof t || /\./.test(t) ? function(e) {
				return e;
			} : function(e) {
				return void 0 === e[t] && t in e && delete (e = ee(e))[t], e;
			};
		}
		function mt() {
			throw k.Type("Entity instances must never be new:ed. Instances are generated by the framework bypassing the constructor.");
		}
		function j(e, t) {
			try {
				var n = bt(e), r = bt(t);
				if (n !== r) return "Array" === n ? 1 : "Array" === r ? -1 : "binary" === n ? 1 : "binary" === r ? -1 : "string" === n ? 1 : "string" === r ? -1 : "Date" === n ? 1 : "Date" !== r ? NaN : -1;
				switch (n) {
					case "number":
					case "Date":
					case "string": return t < e ? 1 : e < t ? -1 : 0;
					case "binary":
						for (var i = gt(e), o = gt(t), a = i.length, u = o.length, s = a < u ? a : u, c = 0; c < s; ++c) if (i[c] !== o[c]) return i[c] < o[c] ? -1 : 1;
						return a === u ? 0 : a < u ? -1 : 1;
					case "Array":
						for (var l = e, f = t, h = l.length, d = f.length, p = h < d ? h : d, y = 0; y < p; ++y) {
							var v = j(l[y], f[y]);
							if (0 !== v) return v;
						}
						return h === d ? 0 : h < d ? -1 : 1;
				}
			} catch (e) {}
			return NaN;
		}
		function bt(e) {
			var t = typeof e;
			return "object" == t && (ArrayBuffer.isView(e) || "ArrayBuffer" === (t = ne(e))) ? "binary" : t;
		}
		function gt(e) {
			return e instanceof Uint8Array ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength) : new Uint8Array(e);
		}
		function wt(t, n, r) {
			var e = t.schema.yProps;
			return e ? (n && 0 < r.numFailures && (n = n.filter(function(e, t) {
				return !r.failures[t];
			})), Promise.all(e.map(function(e) {
				e = e.updatesTable;
				return n ? t.db.table(e).where("k").anyOf(n).delete() : t.db.table(e).clear();
			})).then(function() {
				return r;
			})) : r;
		}
		xt.prototype.execute = function(e) {
			var t = this["@@propmod"];
			if (void 0 !== t.add) {
				var n = t.add;
				if (x(n)) return R(R([], x(e) ? e : [], !0), n, !0).sort();
				if ("number" == typeof n) return (Number(e) || 0) + n;
				if ("bigint" == typeof n) try {
					return BigInt(e) + n;
				} catch (e) {
					return BigInt(0) + n;
				}
				throw new TypeError("Invalid term ".concat(n));
			}
			if (void 0 !== t.remove) {
				var r = t.remove;
				if (x(r)) return x(e) ? e.filter(function(e) {
					return !r.includes(e);
				}).sort() : [];
				if ("number" == typeof r) return Number(e) - r;
				if ("bigint" == typeof r) try {
					return BigInt(e) - r;
				} catch (e) {
					return BigInt(0) - r;
				}
				throw new TypeError("Invalid subtrahend ".concat(r));
			}
			n = null == (n = t.replacePrefix) ? void 0 : n[0];
			return n && "string" == typeof e && e.startsWith(n) ? t.replacePrefix[1] + e.substring(n.length) : e;
		};
		var _t = xt;
		function xt(e) {
			this["@@propmod"] = e;
		}
		function kt(e, t) {
			for (var n = O(t), r = n.length, i = !1, o = 0; o < r; ++o) {
				var a = n[o], u = t[a], s = c(e, a);
				u instanceof _t ? (b(e, a, u.execute(s)), i = !0) : s !== u && (b(e, a, u), i = !0);
			}
			return i;
		}
		r.prototype._trans = function(e, r, t) {
			var n = this._tx || P.trans, i = this.name, o = l && "undefined" != typeof console && console.createTask && console.createTask("Dexie: ".concat("readonly" === e ? "read" : "write", " ").concat(this.name));
			function a(e, t, n) {
				if (n.schema[i]) return r(n.idbtrans, n);
				throw new k.NotFound("Table " + i + " not part of transaction");
			}
			var u = $e();
			try {
				var s = n && n.db._novip === this.db._novip ? n === P.trans ? n._promise(e, a, t) : v(function() {
					return n._promise(e, a, t);
				}, {
					trans: n,
					transless: P.transless || P
				}) : function t(n, r, i, o) {
					if (n.idbdb && (n._state.openComplete || P.letThrough || n._vip)) {
						var a = n._createTransaction(r, i, n._dbSchema);
						try {
							a.create(), n._state.PR1398_maxLoop = 3;
						} catch (e) {
							return e.name === de.InvalidState && n.isOpen() && 0 < --n._state.PR1398_maxLoop ? (console.warn("Dexie: Need to reopen db"), n.close({ disableAutoOpen: !1 }), n.open().then(function() {
								return t(n, r, i, o);
							})) : S(e);
						}
						return a._promise(r, function(e, t) {
							return v(function() {
								return P.trans = a, o(e, t, a);
							});
						}).then(function(e) {
							if ("readwrite" === r) try {
								a.idbtrans.commit();
							} catch (e) {}
							return "readonly" === r ? e : a._completion.then(function() {
								return e;
							});
						});
					}
					if (n._state.openComplete) return S(new k.DatabaseClosed(n._state.dbOpenError));
					if (!n._state.isBeingOpened) {
						if (!n._state.autoOpen) return S(new k.DatabaseClosed());
						n.open().catch(g);
					}
					return n._state.dbReadyPromise.then(function() {
						return t(n, r, i, o);
					});
				}(this.db, e, [this.name], a);
				return o && (s._consoleTask = o, s = s.catch(function(e) {
					return console.trace(e), S(e);
				})), s;
			} finally {
				u && Qe();
			}
		}, r.prototype.get = function(t, e) {
			var n = this;
			return t && t.constructor === Object ? this.where(t).first(e) : null == t ? S(new k.Type("Invalid argument to Table.get()")) : this._trans("readonly", function(e) {
				return n.core.get({
					trans: e,
					key: t
				}).then(function(e) {
					return n.hook.reading.fire(e);
				});
			}).then(e);
		}, r.prototype.where = function(o) {
			if ("string" == typeof o) return new this.db.WhereClause(this, o);
			if (x(o)) return new this.db.WhereClause(this, "[".concat(o.join("+"), "]"));
			var n = O(o);
			if (1 === n.length) return this.where(n[0]).equals(o[n[0]]);
			var e = this.schema.indexes.concat(this.schema.primKey).filter(function(t) {
				if (t.compound && n.every(function(e) {
					return 0 <= t.keyPath.indexOf(e);
				})) {
					for (var e = 0; e < n.length; ++e) if (-1 === n.indexOf(t.keyPath[e])) return !1;
					return !0;
				}
				return !1;
			}).sort(function(e, t) {
				return e.keyPath.length - t.keyPath.length;
			})[0];
			if (e && this.db._maxKey !== ct) return t = e.keyPath.slice(0, n.length), this.where(t).equals(t.map(function(e) {
				return o[e];
			}));
			!e && l && console.warn("The query ".concat(JSON.stringify(o), " on ").concat(this.name, " would benefit from a ") + "compound index [".concat(n.join("+"), "]"));
			var a = this.schema.idxByName;
			function u(e, t) {
				return 0 === j(e, t);
			}
			var t = n.reduce(function(e, t) {
				var n = e[0], e = e[1], r = a[t], i = o[t];
				return [n || r, n || !r ? pt(e, r && r.multi ? function(e) {
					e = c(e, t);
					return x(e) && e.some(function(e) {
						return u(i, e);
					});
				} : function(e) {
					return u(i, c(e, t));
				}) : e];
			}, [null, null]), r = t[0], t = t[1];
			return r ? this.where(r.name).equals(o[r.keyPath]).filter(t) : e ? this.filter(t) : this.where(n).equals("");
		}, r.prototype.filter = function(e) {
			return this.toCollection().and(e);
		}, r.prototype.count = function(e) {
			return this.toCollection().count(e);
		}, r.prototype.offset = function(e) {
			return this.toCollection().offset(e);
		}, r.prototype.limit = function(e) {
			return this.toCollection().limit(e);
		}, r.prototype.each = function(e) {
			return this.toCollection().each(e);
		}, r.prototype.toArray = function(e) {
			return this.toCollection().toArray(e);
		}, r.prototype.toCollection = function() {
			return new this.db.Collection(new this.db.WhereClause(this));
		}, r.prototype.orderBy = function(e) {
			return new this.db.Collection(new this.db.WhereClause(this, x(e) ? "[".concat(e.join("+"), "]") : e));
		}, r.prototype.reverse = function() {
			return this.toCollection().reverse();
		}, r.prototype.mapToClass = function(r) {
			for (var o = this.db, a = this.name, i = ((this.schema.mappedClass = r).prototype instanceof mt && (r = ((e) => {
				var t = i, n = e;
				if ("function" != typeof n && null !== n) throw new TypeError("Class extends value " + String(n) + " is not a constructor or null");
				function r() {
					this.constructor = t;
				}
				function i() {
					return null !== e && e.apply(this, arguments) || this;
				}
				return B(t, n), t.prototype = null === n ? Object.create(n) : (r.prototype = n.prototype, new r()), Object.defineProperty(i.prototype, "db", {
					get: function() {
						return o;
					},
					enumerable: !1,
					configurable: !0
				}), i.prototype.table = function() {
					return a;
				}, i;
			})(r)), /* @__PURE__ */ new Set()), e = r.prototype; e; e = F(e)) Object.getOwnPropertyNames(e).forEach(function(e) {
				return i.add(e);
			});
			function t(e) {
				if (!e) return e;
				var t, n = Object.create(r.prototype);
				for (t in e) if (!i.has(t)) try {
					n[t] = e[t];
				} catch (e) {}
				return n;
			}
			return this.schema.readHook && this.hook.reading.unsubscribe(this.schema.readHook), this.schema.readHook = t, this.hook("reading", t), r;
		}, r.prototype.defineClass = function() {
			return this.mapToClass(function(e) {
				a(this, e);
			});
		}, r.prototype.add = function(t, n) {
			var r = this, e = this.schema.primKey, i = e.auto, o = e.keyPath, a = t;
			return o && i && (a = vt(o)(t)), this._trans("readwrite", function(e) {
				return r.core.mutate({
					trans: e,
					type: "add",
					keys: null != n ? [n] : null,
					values: [a]
				});
			}).then(function(e) {
				return e.numFailures ? K.reject(e.failures[0]) : e.lastResult;
			}).then(function(e) {
				if (o) try {
					b(t, o, e);
				} catch (e) {}
				return e;
			});
		}, r.prototype.upsert = function(r, i) {
			var o = this, a = this.schema.primKey.keyPath;
			return this._trans("readwrite", function(n) {
				return o.core.get({
					trans: n,
					key: r
				}).then(function(t) {
					var e = null != t ? t : {};
					return kt(e, i), a && b(e, a, r), o.core.mutate({
						trans: n,
						type: "put",
						values: [e],
						keys: [r],
						upsert: !0,
						updates: {
							keys: [r],
							changeSpecs: [i]
						}
					}).then(function(e) {
						return e.numFailures ? K.reject(e.failures[0]) : !!t;
					});
				});
			});
		}, r.prototype.update = function(e, t) {
			return "object" != typeof e || x(e) ? this.where(":id").equals(e).modify(t) : void 0 === (e = c(e, this.schema.primKey.keyPath)) ? S(new k.InvalidArgument("Given object does not contain its primary key")) : this.where(":id").equals(e).modify(t);
		}, r.prototype.put = function(t, n) {
			var r = this, e = this.schema.primKey, i = e.auto, o = e.keyPath, a = t;
			return o && i && (a = vt(o)(t)), this._trans("readwrite", function(e) {
				return r.core.mutate({
					trans: e,
					type: "put",
					values: [a],
					keys: null != n ? [n] : null
				});
			}).then(function(e) {
				return e.numFailures ? K.reject(e.failures[0]) : e.lastResult;
			}).then(function(e) {
				if (o) try {
					b(t, o, e);
				} catch (e) {}
				return e;
			});
		}, r.prototype.delete = function(t) {
			var n = this;
			return this._trans("readwrite", function(e) {
				return n.core.mutate({
					trans: e,
					type: "delete",
					keys: [t]
				}).then(function(e) {
					return wt(n, [t], e);
				}).then(function(e) {
					return e.numFailures ? K.reject(e.failures[0]) : void 0;
				});
			});
		}, r.prototype.clear = function() {
			var t = this;
			return this._trans("readwrite", function(e) {
				return t.core.mutate({
					trans: e,
					type: "deleteRange",
					range: yt
				}).then(function(e) {
					return wt(t, null, e);
				});
			}).then(function(e) {
				return e.numFailures ? K.reject(e.failures[0]) : void 0;
			});
		}, r.prototype.bulkGet = function(t) {
			var n = this;
			return this._trans("readonly", function(e) {
				return n.core.getMany({
					keys: t,
					trans: e
				}).then(function(e) {
					return e.map(function(e) {
						return n.hook.reading.fire(e);
					});
				});
			});
		}, r.prototype.bulkAdd = function(i, e, t) {
			var o = this, a = Array.isArray(e) ? e : void 0, u = (t = t || (a ? void 0 : e)) ? t.allKeys : void 0;
			return this._trans("readwrite", function(e) {
				var t = o.schema.primKey, n = t.auto, t = t.keyPath;
				if (t && a) throw new k.InvalidArgument("bulkAdd(): keys argument invalid on tables with inbound keys");
				if (a && a.length !== i.length) throw new k.InvalidArgument("Arguments objects and keys must have the same length");
				var r = i.length, n = t && n ? i.map(vt(t)) : i;
				return o.core.mutate({
					trans: e,
					type: "add",
					keys: a,
					values: n,
					wantResults: u
				}).then(function(e) {
					var t = e.numFailures, n = e.failures;
					if (0 === t) return u ? e.results : e.lastResult;
					throw new he("".concat(o.name, ".bulkAdd(): ").concat(t, " of ").concat(r, " operations failed"), n);
				});
			});
		}, r.prototype.bulkPut = function(i, e, t) {
			var o = this, a = Array.isArray(e) ? e : void 0, u = (t = t || (a ? void 0 : e)) ? t.allKeys : void 0;
			return this._trans("readwrite", function(e) {
				var t = o.schema.primKey, n = t.auto, t = t.keyPath;
				if (t && a) throw new k.InvalidArgument("bulkPut(): keys argument invalid on tables with inbound keys");
				if (a && a.length !== i.length) throw new k.InvalidArgument("Arguments objects and keys must have the same length");
				var r = i.length, n = t && n ? i.map(vt(t)) : i;
				return o.core.mutate({
					trans: e,
					type: "put",
					keys: a,
					values: n,
					wantResults: u
				}).then(function(e) {
					var t = e.numFailures, n = e.failures;
					if (0 === t) return u ? e.results : e.lastResult;
					throw new he("".concat(o.name, ".bulkPut(): ").concat(t, " of ").concat(r, " operations failed"), n);
				});
			});
		}, r.prototype.bulkUpdate = function(t) {
			var h = this, n = this.core, r = t.map(function(e) {
				return e.key;
			}), i = t.map(function(e) {
				return e.changes;
			}), d = [];
			return this._trans("readwrite", function(e) {
				return n.getMany({
					trans: e,
					keys: r,
					cache: "clone"
				}).then(function(c) {
					var l = [], f = [], s = (t.forEach(function(e, t) {
						var n = e.key, r = e.changes, i = c[t];
						if (i) {
							for (var o = 0, a = Object.keys(r); o < a.length; o++) {
								var u = a[o], s = r[u];
								if (u === h.schema.primKey.keyPath) {
									if (0 !== j(s, n)) throw new k.Constraint("Cannot update primary key in bulkUpdate()");
								} else b(i, u, s);
							}
							d.push(t), l.push(n), f.push(i);
						}
					}), l.length);
					return n.mutate({
						trans: e,
						type: "put",
						keys: l,
						values: f,
						updates: {
							keys: r,
							changeSpecs: i
						}
					}).then(function(e) {
						var t = e.numFailures, n = e.failures;
						if (0 === t) return s;
						for (var r = 0, i = Object.keys(n); r < i.length; r++) {
							var o, a = i[r], u = d[Number(a)];
							null != u && (o = n[a], delete n[a], n[u] = o);
						}
						throw new he("".concat(h.name, ".bulkUpdate(): ").concat(t, " of ").concat(s, " operations failed"), n);
					});
				});
			});
		}, r.prototype.bulkDelete = function(t) {
			var r = this, i = t.length;
			return this._trans("readwrite", function(e) {
				return r.core.mutate({
					trans: e,
					type: "delete",
					keys: t
				}).then(function(e) {
					return wt(r, t, e);
				});
			}).then(function(e) {
				var t = e.numFailures, n = e.failures;
				if (0 === t) return e.lastResult;
				throw new he("".concat(r.name, ".bulkDelete(): ").concat(t, " of ").concat(i, " operations failed"), n);
			});
		};
		var Ot = r;
		function r() {}
		function Pt(i) {
			function t(e, t) {
				if (t) {
					for (var n = arguments.length, r = new Array(n - 1); --n;) r[n - 1] = arguments[n];
					return a[e].subscribe.apply(null, r), i;
				}
				if ("string" == typeof e) return a[e];
			}
			var a = {};
			t.addEventType = u;
			for (var e = 1, n = arguments.length; e < n; ++e) u(arguments[e]);
			return t;
			function u(e, n, r) {
				var i, o;
				if ("object" != typeof e) return n = n || xe, o = {
					subscribers: [],
					fire: r = r || g,
					subscribe: function(e) {
						-1 === o.subscribers.indexOf(e) && (o.subscribers.push(e), o.fire = n(o.fire, e));
					},
					unsubscribe: function(t) {
						o.subscribers = o.subscribers.filter(function(e) {
							return e !== t;
						}), o.fire = o.subscribers.reduce(n, r);
					}
				}, a[e] = t[e] = o;
				O(i = e).forEach(function(e) {
					var t = i[e];
					if (x(t)) u(e, i[e][0], i[e][1]);
					else {
						if ("asap" !== t) throw new k.InvalidArgument("Invalid event config");
						var n = u(e, ve, function() {
							for (var e = arguments.length, t = new Array(e); e--;) t[e] = arguments[e];
							n.subscribers.forEach(function(e) {
								Q(function() {
									e.apply(null, t);
								});
							});
						});
					}
				});
			}
		}
		function Kt(e, t) {
			return U(t).from({ prototype: e }), t;
		}
		function Et(e, t) {
			return !(e.filter || e.algorithm || e.or) && (t ? e.justLimit : !e.replayFilter);
		}
		function St(e, t) {
			e.filter = pt(e.filter, t);
		}
		function At(e, t, n) {
			var r = e.replayFilter;
			e.replayFilter = r ? function() {
				return pt(r(), t());
			} : t, e.justLimit = n && !r;
		}
		function jt(e, t) {
			if (e.isPrimKey) return t.primaryKey;
			var n = t.getIndexByKeyPath(e.index);
			if (n) return n;
			throw new k.Schema("KeyPath " + e.index + " on object store " + t.name + " is not indexed");
		}
		function Ct(e, t, n) {
			var r = jt(e, t.schema);
			return t.openCursor({
				trans: n,
				values: !e.keysOnly,
				reverse: "prev" === e.dir,
				unique: !!e.unique,
				query: {
					index: r,
					range: e.range
				}
			});
		}
		function Tt(e, o, t, n) {
			var a, r, u = e.replayFilter ? pt(e.filter, e.replayFilter()) : e.filter;
			return e.or ? (a = {}, r = function(e, t, n) {
				var r, i;
				u && !u(t, n, function(e) {
					return t.stop(e);
				}, function(e) {
					return t.fail(e);
				}) || ("[object ArrayBuffer]" === (i = "" + (r = t.primaryKey)) && (i = "" + new Uint8Array(r)), m(a, i)) || (a[i] = !0, o(e, t, n));
			}, Promise.all([e.or._iterate(r, t), It(Ct(e, n, t), e.algorithm, r, !e.keysOnly && e.valueMapper)])) : It(Ct(e, n, t), pt(e.algorithm, u), o, !e.keysOnly && e.valueMapper);
		}
		function It(e, r, i, o) {
			var a = E(o ? function(e, t, n) {
				return i(o(e), t, n);
			} : i);
			return e.then(function(n) {
				if (n) return n.start(function() {
					var t = function() {
						return n.continue();
					};
					r && !r(n, function(e) {
						return t = e;
					}, function(e) {
						n.stop(e), t = g;
					}, function(e) {
						n.fail(e), t = g;
					}) || a(n.value, n, function(e) {
						return t = e;
					}), t();
				});
			});
		}
		i.prototype._read = function(e, t) {
			var n = this._ctx;
			return n.error ? n.table._trans(null, S.bind(null, n.error)) : n.table._trans("readonly", e).then(t);
		}, i.prototype._write = function(e) {
			var t = this._ctx;
			return t.error ? t.table._trans(null, S.bind(null, t.error)) : t.table._trans("readwrite", e, "locked");
		}, i.prototype._addAlgorithm = function(e) {
			var t = this._ctx;
			t.algorithm = pt(t.algorithm, e);
		}, i.prototype._iterate = function(e, t) {
			return Tt(this._ctx, e, t, this._ctx.table.core);
		}, i.prototype.clone = function(e) {
			var t = Object.create(this.constructor.prototype), n = Object.create(this._ctx);
			return e && a(n, e), t._ctx = n, t;
		}, i.prototype.raw = function() {
			return this._ctx.valueMapper = null, this;
		}, i.prototype.each = function(t) {
			var n = this._ctx;
			return this._read(function(e) {
				return Tt(n, t, e, n.table.core);
			});
		}, i.prototype.count = function(e) {
			var i = this;
			return this._read(function(e) {
				var t, n = i._ctx, r = n.table.core;
				return Et(n, !0) ? r.count({
					trans: e,
					query: {
						index: jt(n, r.schema),
						range: n.range
					}
				}).then(function(e) {
					return Math.min(e, n.limit);
				}) : (t = 0, Tt(n, function() {
					return ++t, !1;
				}, e, r).then(function() {
					return t;
				}));
			}).then(e);
		}, i.prototype.sortBy = function(e, t) {
			var n = e.split(".").reverse(), r = n[0], i = n.length - 1;
			function o(e, t) {
				return t ? o(e[n[t]], t - 1) : e[r];
			}
			var a = "next" === this._ctx.dir ? 1 : -1;
			function u(e, t) {
				return j(o(e, i), o(t, i)) * a;
			}
			return this.toArray(function(e) {
				return e.slice().sort(u);
			}).then(t);
		}, i.prototype.toArray = function(e) {
			var o = this;
			return this._read(function(e) {
				var t, n, r, i = o._ctx;
				return Et(i, !0) && 0 < i.limit ? (t = i.valueMapper, n = jt(i, i.table.core.schema), i.table.core.query({
					trans: e,
					limit: i.limit,
					values: !0,
					direction: "prev" === i.dir ? "prev" : void 0,
					query: {
						index: n,
						range: i.range
					}
				}).then(function(e) {
					e = e.result;
					return t ? e.map(t) : e;
				})) : (r = [], Tt(i, function(e) {
					return r.push(e);
				}, e, i.table.core).then(function() {
					return r;
				}));
			}, e);
		}, i.prototype.offset = function(t) {
			var e = this._ctx;
			return t <= 0 || (e.offset += t, Et(e) ? At(e, function() {
				var n = t;
				return function(e, t) {
					return 0 === n || (1 === n ? --n : t(function() {
						e.advance(n), n = 0;
					}), !1);
				};
			}) : At(e, function() {
				var e = t;
				return function() {
					return --e < 0;
				};
			})), this;
		}, i.prototype.limit = function(e) {
			return this._ctx.limit = Math.min(this._ctx.limit, e), At(this._ctx, function() {
				var r = e;
				return function(e, t, n) {
					return --r <= 0 && t(n), 0 <= r;
				};
			}, !0), this;
		}, i.prototype.until = function(r, i) {
			return St(this._ctx, function(e, t, n) {
				return !r(e.value) || (t(n), i);
			}), this;
		}, i.prototype.first = function(e) {
			return this.limit(1).toArray(function(e) {
				return e[0];
			}).then(e);
		}, i.prototype.last = function(e) {
			return this.reverse().first(e);
		}, i.prototype.filter = function(t) {
			var e;
			return St(this._ctx, function(e) {
				return t(e.value);
			}), (e = this._ctx).isMatch = pt(e.isMatch, t), this;
		}, i.prototype.and = function(e) {
			return this.filter(e);
		}, i.prototype.or = function(e) {
			return new this.db.WhereClause(this._ctx.table, e, this);
		}, i.prototype.reverse = function() {
			return this._ctx.dir = "prev" === this._ctx.dir ? "next" : "prev", this._ondirectionchange && this._ondirectionchange(this._ctx.dir), this;
		}, i.prototype.desc = function() {
			return this.reverse();
		}, i.prototype.eachKey = function(n) {
			var e = this._ctx;
			return e.keysOnly = !e.isMatch, this.each(function(e, t) {
				n(t.key, t);
			});
		}, i.prototype.eachUniqueKey = function(e) {
			return this._ctx.unique = "unique", this.eachKey(e);
		}, i.prototype.eachPrimaryKey = function(n) {
			var e = this._ctx;
			return e.keysOnly = !e.isMatch, this.each(function(e, t) {
				n(t.primaryKey, t);
			});
		}, i.prototype.keys = function(e) {
			var t = this._ctx, n = (t.keysOnly = !t.isMatch, []);
			return this.each(function(e, t) {
				n.push(t.key);
			}).then(function() {
				return n;
			}).then(e);
		}, i.prototype.primaryKeys = function(e) {
			var n = this._ctx;
			if (Et(n, !0) && 0 < n.limit) return this._read(function(e) {
				var t = jt(n, n.table.core.schema);
				return n.table.core.query({
					trans: e,
					values: !1,
					limit: n.limit,
					direction: "prev" === n.dir ? "prev" : void 0,
					query: {
						index: t,
						range: n.range
					}
				});
			}).then(function(e) {
				return e.result;
			}).then(e);
			n.keysOnly = !n.isMatch;
			var r = [];
			return this.each(function(e, t) {
				r.push(t.primaryKey);
			}).then(function() {
				return r;
			}).then(e);
		}, i.prototype.uniqueKeys = function(e) {
			return this._ctx.unique = "unique", this.keys(e);
		}, i.prototype.firstKey = function(e) {
			return this.limit(1).keys(function(e) {
				return e[0];
			}).then(e);
		}, i.prototype.lastKey = function(e) {
			return this.reverse().firstKey(e);
		}, i.prototype.distinct = function() {
			var n, e = this._ctx, e = e.index && e.table.schema.idxByName[e.index];
			return e && e.multi && (n = {}, St(this._ctx, function(e) {
				var e = e.primaryKey.toString(), t = m(n, e);
				return n[e] = !0, !t;
			})), this;
		}, i.prototype.modify = function(x) {
			var n = this, k = this._ctx;
			return this._write(function(p) {
				function y(e, t) {
					var n = t.failures;
					u += e - t.numFailures;
					for (var r = 0, i = O(n); r < i.length; r++) {
						var o = i[r];
						a.push(n[o]);
					}
				}
				var v = "function" == typeof x ? x : function(e) {
					return kt(e, x);
				}, m = k.table.core, e = m.schema.primaryKey, b = e.outbound, g = e.extractKey, w = 200, e = n.db._options.modifyChunkSize, a = (e && (w = "object" == typeof e ? e[m.name] || e["*"] || 200 : e), []), u = 0, t = [], _ = x === Dt;
				return n.clone().primaryKeys().then(function(f) {
					function h(s) {
						var c = Math.min(w, f.length - s), l = f.slice(s, s + c);
						return (_ ? Promise.resolve([]) : m.getMany({
							trans: p,
							keys: l,
							cache: "immutable"
						})).then(function(e) {
							var n = [], t = [], r = b ? [] : null, i = _ ? l : [];
							if (!_) for (var o = 0; o < c; ++o) {
								var a = e[o], u = {
									value: ee(a),
									primKey: f[s + o]
								};
								!1 !== v.call(u, u.value, u) && (null == u.value ? i.push(f[s + o]) : b || 0 === j(g(a), g(u.value)) ? (t.push(u.value), b && r.push(f[s + o])) : (i.push(f[s + o]), n.push(u.value)));
							}
							return Promise.resolve(0 < n.length && m.mutate({
								trans: p,
								type: "add",
								values: n
							}).then(function(e) {
								for (var t in e.failures) i.splice(parseInt(t), 1);
								y(n.length, e);
							})).then(function() {
								return (0 < t.length || d && "object" == typeof x) && m.mutate({
									trans: p,
									type: "put",
									keys: r,
									values: t,
									criteria: d,
									changeSpec: "function" != typeof x && x,
									isAdditionalChunk: 0 < s
								}).then(function(e) {
									return y(t.length, e);
								});
							}).then(function() {
								return (0 < i.length || d && _) && m.mutate({
									trans: p,
									type: "delete",
									keys: i,
									criteria: d,
									isAdditionalChunk: 0 < s
								}).then(function(e) {
									return wt(k.table, i, e);
								}).then(function(e) {
									return y(i.length, e);
								});
							}).then(function() {
								return f.length > s + c && h(s + w);
							});
						});
					}
					var d = Et(k) && k.limit === 1 / 0 && ("function" != typeof x || _) && {
						index: k.index,
						range: k.range
					};
					return h(0).then(function() {
						if (0 < a.length) throw new fe("Error modifying one or more objects", a, u, t);
						return f.length;
					});
				});
			});
		}, i.prototype.delete = function() {
			var i = this._ctx, n = i.range;
			return !Et(i) || i.table.schema.yProps || !i.isPrimKey && 3 !== n.type ? this.modify(Dt) : this._write(function(e) {
				var t = i.table.core.schema.primaryKey, r = n;
				return i.table.core.count({
					trans: e,
					query: {
						index: t,
						range: r
					}
				}).then(function(n) {
					return i.table.core.mutate({
						trans: e,
						type: "deleteRange",
						range: r
					}).then(function(e) {
						var t = e.failures, e = e.numFailures;
						if (e) throw new fe("Could not delete some values", Object.keys(t).map(function(e) {
							return t[e];
						}), n - e);
						return n - e;
					});
				});
			});
		};
		var qt = i;
		function i() {}
		var Dt = function(e, t) {
			return t.value = null;
		};
		function Bt(e, t) {
			return e < t ? -1 : e === t ? 0 : 1;
		}
		function Rt(e, t) {
			return t < e ? -1 : e === t ? 0 : 1;
		}
		function C(e, t, n) {
			e = e instanceof Lt ? new e.Collection(e) : e;
			return e._ctx.error = new (n || TypeError)(t), e;
		}
		function Ft(e) {
			return new e.Collection(e, function() {
				return Mt("");
			}).limit(0);
		}
		function Nt(e, s, n, r) {
			var i, c, l, f, h, d, p, y = n.length;
			if (!n.every(function(e) {
				return "string" == typeof e;
			})) return C(e, lt);
			function t(e) {
				i = "next" === e ? function(e) {
					return e.toUpperCase();
				} : function(e) {
					return e.toLowerCase();
				}, c = "next" === e ? function(e) {
					return e.toLowerCase();
				} : function(e) {
					return e.toUpperCase();
				}, l = "next" === e ? Bt : Rt;
				var t = n.map(function(e) {
					return {
						lower: c(e),
						upper: i(e)
					};
				}).sort(function(e, t) {
					return l(e.lower, t.lower);
				});
				f = t.map(function(e) {
					return e.upper;
				}), h = t.map(function(e) {
					return e.lower;
				}), p = "next" === (d = e) ? "" : r;
			}
			t("next");
			var e = new e.Collection(e, function() {
				return T(f[0], h[y - 1] + r);
			}), v = (e._ondirectionchange = function(e) {
				t(e);
			}, 0);
			return e._addAlgorithm(function(e, t, n) {
				var r = e.key;
				if ("string" == typeof r) {
					var i = c(r);
					if (s(i, h, v)) return !0;
					for (var o = null, a = v; a < y; ++a) {
						var u = ((e, t, n, r, i, o) => {
							for (var a = Math.min(e.length, r.length), u = -1, s = 0; s < a; ++s) {
								var c = t[s];
								if (c !== r[s]) return i(e[s], n[s]) < 0 ? e.substr(0, s) + n[s] + n.substr(s + 1) : i(e[s], r[s]) < 0 ? e.substr(0, s) + r[s] + n.substr(s + 1) : 0 <= u ? e.substr(0, u) + t[u] + n.substr(u + 1) : null;
								i(e[s], c) < 0 && (u = s);
							}
							return a < r.length && "next" === o ? e + n.substr(e.length) : a < e.length && "prev" === o ? e.substr(0, n.length) : u < 0 ? null : e.substr(0, u) + r[u] + n.substr(u + 1);
						})(r, i, f[a], h[a], l, d);
						null === u && null === o ? v = a + 1 : (null === o || 0 < l(o, u)) && (o = u);
					}
					t(null !== o ? function() {
						e.continue(o + p);
					} : n);
				}
				return !1;
			}), e;
		}
		function T(e, t, n, r) {
			return {
				type: 2,
				lower: e,
				upper: t,
				lowerOpen: n,
				upperOpen: r
			};
		}
		function Mt(e) {
			return {
				type: 1,
				lower: e,
				upper: e
			};
		}
		Object.defineProperty(d.prototype, "Collection", {
			get: function() {
				return this._ctx.table.db.Collection;
			},
			enumerable: !1,
			configurable: !0
		}), d.prototype.between = function(e, t, n, r) {
			n = !1 !== n, r = !0 === r;
			try {
				return 0 < this._cmp(e, t) || 0 === this._cmp(e, t) && (n || r) && (!n || !r) ? Ft(this) : new this.Collection(this, function() {
					return T(e, t, !n, !r);
				});
			} catch (e) {
				return C(this, A);
			}
		}, d.prototype.equals = function(e) {
			return null == e ? C(this, A) : new this.Collection(this, function() {
				return Mt(e);
			});
		}, d.prototype.above = function(e) {
			return null == e ? C(this, A) : new this.Collection(this, function() {
				return T(e, void 0, !0);
			});
		}, d.prototype.aboveOrEqual = function(e) {
			return null == e ? C(this, A) : new this.Collection(this, function() {
				return T(e, void 0, !1);
			});
		}, d.prototype.below = function(e) {
			return null == e ? C(this, A) : new this.Collection(this, function() {
				return T(void 0, e, !1, !0);
			});
		}, d.prototype.belowOrEqual = function(e) {
			return null == e ? C(this, A) : new this.Collection(this, function() {
				return T(void 0, e);
			});
		}, d.prototype.startsWith = function(e) {
			return "string" != typeof e ? C(this, lt) : this.between(e, e + ct, !0, !0);
		}, d.prototype.startsWithIgnoreCase = function(e) {
			return "" === e ? this.startsWith(e) : Nt(this, function(e, t) {
				return 0 === e.indexOf(t[0]);
			}, [e], ct);
		}, d.prototype.equalsIgnoreCase = function(e) {
			return Nt(this, function(e, t) {
				return e === t[0];
			}, [e], "");
		}, d.prototype.anyOfIgnoreCase = function() {
			var e = n.apply(ae, arguments);
			return 0 === e.length ? Ft(this) : Nt(this, function(e, t) {
				return -1 !== t.indexOf(e);
			}, e, "");
		}, d.prototype.startsWithAnyOfIgnoreCase = function() {
			var e = n.apply(ae, arguments);
			return 0 === e.length ? Ft(this) : Nt(this, function(t, e) {
				return e.some(function(e) {
					return 0 === t.indexOf(e);
				});
			}, e, ct);
		}, d.prototype.anyOf = function() {
			var e, i, t = this, o = n.apply(ae, arguments), a = this._cmp;
			try {
				o.sort(a);
			} catch (e) {
				return C(this, A);
			}
			return 0 === o.length ? Ft(this) : ((e = new this.Collection(this, function() {
				return T(o[0], o[o.length - 1]);
			}))._ondirectionchange = function(e) {
				a = "next" === e ? t._ascending : t._descending, o.sort(a);
			}, i = 0, e._addAlgorithm(function(e, t, n) {
				for (var r = e.key; 0 < a(r, o[i]);) if (++i === o.length) return t(n), !1;
				return 0 === a(r, o[i]) || (t(function() {
					e.continue(o[i]);
				}), !1);
			}), e);
		}, d.prototype.notEqual = function(e) {
			return this.inAnyRange([[-1 / 0, e], [e, this.db._maxKey]], {
				includeLowers: !1,
				includeUppers: !1
			});
		}, d.prototype.noneOf = function() {
			var e = n.apply(ae, arguments);
			if (0 === e.length) return new this.Collection(this);
			try {
				e.sort(this._ascending);
			} catch (e) {
				return C(this, A);
			}
			var t = e.reduce(function(e, t) {
				return e ? e.concat([[e[e.length - 1][1], t]]) : [[-1 / 0, t]];
			}, null);
			return t.push([e[e.length - 1], this.db._maxKey]), this.inAnyRange(t, {
				includeLowers: !1,
				includeUppers: !1
			});
		}, d.prototype.inAnyRange = function(e, t) {
			var o = this, a = this._cmp, u = this._ascending, n = this._descending, s = this._min, c = this._max;
			if (0 === e.length) return Ft(this);
			if (!e.every(function(e) {
				return void 0 !== e[0] && void 0 !== e[1] && u(e[0], e[1]) <= 0;
			})) return C(this, "First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower", k.InvalidArgument);
			var r = !t || !1 !== t.includeLowers, i = t && !0 === t.includeUppers;
			var l, f = u;
			function h(e, t) {
				return f(e[0], t[0]);
			}
			try {
				(l = e.reduce(function(e, t) {
					for (var n = 0, r = e.length; n < r; ++n) {
						var i = e[n];
						if (a(t[0], i[1]) < 0 && 0 < a(t[1], i[0])) {
							i[0] = s(i[0], t[0]), i[1] = c(i[1], t[1]);
							break;
						}
					}
					return n === r && e.push(t), e;
				}, [])).sort(h);
			} catch (e) {
				return C(this, A);
			}
			var d = 0, p = i ? function(e) {
				return 0 < u(e, l[d][1]);
			} : function(e) {
				return 0 <= u(e, l[d][1]);
			}, y = r ? function(e) {
				return 0 < n(e, l[d][0]);
			} : function(e) {
				return 0 <= n(e, l[d][0]);
			};
			var v = p, t = new this.Collection(this, function() {
				return T(l[0][0], l[l.length - 1][1], !r, !i);
			});
			return t._ondirectionchange = function(e) {
				f = "next" === e ? (v = p, u) : (v = y, n), l.sort(h);
			}, t._addAlgorithm(function(e, t, n) {
				for (var r, i = e.key; v(i);) if (++d === l.length) return t(n), !1;
				return !p(r = i) && !y(r) || (0 === o._cmp(i, l[d][1]) || 0 === o._cmp(i, l[d][0]) || t(function() {
					f === u ? e.continue(l[d][0]) : e.continue(l[d][1]);
				}), !1);
			}), t;
		}, d.prototype.startsWithAnyOf = function() {
			var e = n.apply(ae, arguments);
			return e.every(function(e) {
				return "string" == typeof e;
			}) ? 0 === e.length ? Ft(this) : this.inAnyRange(e.map(function(e) {
				return [e, e + ct];
			})) : C(this, "startsWithAnyOf() only works with strings");
		};
		var Lt = d;
		function d() {}
		function I(t) {
			return E(function(e) {
				return Ut(e), t(e.target.error), !1;
			});
		}
		function Ut(e) {
			e.stopPropagation && e.stopPropagation(), e.preventDefault && e.preventDefault();
		}
		var zt = "storagemutated", Vt = "x-storagemutated-1", Wt = Pt(null, zt), Yt = (p.prototype._lock = function() {
			return $(!P.global), ++this._reculock, 1 !== this._reculock || P.global || (P.lockOwnerFor = this), this;
		}, p.prototype._unlock = function() {
			if ($(!P.global), 0 == --this._reculock) for (P.global || (P.lockOwnerFor = null); 0 < this._blockedFuncs.length && !this._locked();) {
				var e = this._blockedFuncs.shift();
				try {
					at(e[1], e[0]);
				} catch (e) {}
			}
			return this;
		}, p.prototype._locked = function() {
			return this._reculock && P.lockOwnerFor !== this;
		}, p.prototype.create = function(t) {
			var n = this;
			if (this.mode) {
				var e = this.db.idbdb, r = this.db._state.dbOpenError;
				if ($(!this.idbtrans), !t && !e) switch (r && r.name) {
					case "DatabaseClosedError": throw new k.DatabaseClosed(r);
					case "MissingAPIError": throw new k.MissingAPI(r.message, r);
					default: throw new k.OpenFailed(r);
				}
				if (!this.active) throw new k.TransactionInactive();
				$(null === this._completion._state), (t = this.idbtrans = t || (this.db.core || e).transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability })).onerror = E(function(e) {
					Ut(e), n._reject(t.error);
				}), t.onabort = E(function(e) {
					Ut(e), n.active && n._reject(new k.Abort(t.error)), n.active = !1, n.on("abort").fire(e);
				}), t.oncomplete = E(function() {
					n.active = !1, n._resolve(), "mutatedParts" in t && Wt.storagemutated.fire(t.mutatedParts);
				});
			}
			return this;
		}, p.prototype._promise = function(n, r, i) {
			var e, o = this;
			return "readwrite" === n && "readwrite" !== this.mode ? S(new k.ReadOnly("Transaction is readonly")) : this.active ? this._locked() ? new K(function(e, t) {
				o._blockedFuncs.push([function() {
					o._promise(n, r, i).then(e, t);
				}, P]);
			}) : i ? v(function() {
				var e = new K(function(e, t) {
					o._lock();
					var n = r(e, t, o);
					n && n.then && n.then(e, t);
				});
				return e.finally(function() {
					return o._unlock();
				}), e._lib = !0, e;
			}) : ((e = new K(function(e, t) {
				var n = r(e, t, o);
				n && n.then && n.then(e, t);
			}))._lib = !0, e) : S(new k.TransactionInactive());
		}, p.prototype._root = function() {
			return this.parent ? this.parent._root() : this;
		}, p.prototype.waitFor = function(e) {
			var t, r = this._root(), i = K.resolve(e), o = (r._waitingFor ? r._waitingFor = r._waitingFor.then(function() {
				return i;
			}) : (r._waitingFor = i, r._waitingQueue = [], t = r.idbtrans.objectStore(r.storeNames[0]), function e() {
				for (++r._spinCount; r._waitingQueue.length;) r._waitingQueue.shift()();
				r._waitingFor && (t.get(-1 / 0).onsuccess = e);
			}()), r._waitingFor);
			return new K(function(t, n) {
				i.then(function(e) {
					return r._waitingQueue.push(E(t.bind(null, e)));
				}, function(e) {
					return r._waitingQueue.push(E(n.bind(null, e)));
				}).finally(function() {
					r._waitingFor === o && (r._waitingFor = null);
				});
			});
		}, p.prototype.abort = function() {
			this.active && (this.active = !1, this.idbtrans && this.idbtrans.abort(), this._reject(new k.Abort()));
		}, p.prototype.table = function(e) {
			var t = this._memoizedTables || (this._memoizedTables = {});
			if (m(t, e)) return t[e];
			var n = this.schema[e];
			if (n) return (n = new this.db.Table(e, n, this)).core = this.db.core.table(e), t[e] = n;
			throw new k.NotFound("Table " + e + " not part of transaction");
		}, p);
		function p() {}
		function $t(e, t, n, r, i, o, a, u) {
			return {
				name: e,
				keyPath: t,
				unique: n,
				multi: r,
				auto: i,
				compound: o,
				src: (n && !a ? "&" : "") + (r ? "*" : "") + (i ? "++" : "") + Qt(t),
				type: u
			};
		}
		function Qt(e) {
			return "string" == typeof e ? e : e ? "[" + [].join.call(e, "+") + "]" : "";
		}
		function Gt(e, t, n) {
			return {
				name: e,
				primKey: t,
				indexes: n,
				mappedClass: null,
				idxByName: (r = function(e) {
					return [e.name, e];
				}, n.reduce(function(e, t, n) {
					t = r(t, n);
					return t && (e[t[0]] = t[1]), e;
				}, {}))
			};
			var r;
		}
		var Xt = function(e) {
			try {
				return e.only([[]]), Xt = function() {
					return [[]];
				}, [[]];
			} catch (e) {
				return Xt = function() {
					return ct;
				}, ct;
			}
		};
		function Ht(t) {
			return null == t ? function() {} : "string" == typeof t ? 1 === (n = t).split(".").length ? function(e) {
				return e[n];
			} : function(e) {
				return c(e, n);
			} : function(e) {
				return c(e, t);
			};
			var n;
		}
		function Jt(e) {
			return [].slice.call(e);
		}
		var Zt = 0;
		function en(e) {
			return null == e ? ":id" : "string" == typeof e ? e : "[".concat(e.join("+"), "]");
		}
		function tn(e, i, t) {
			function _(e) {
				if (3 === e.type) return null;
				if (4 === e.type) throw new Error("Cannot convert never type to IDBKeyRange");
				var t = e.lower, n = e.upper, r = e.lowerOpen, e = e.upperOpen;
				return void 0 === t ? void 0 === n ? null : i.upperBound(n, !!e) : void 0 === n ? i.lowerBound(t, !!r) : i.bound(t, n, !!r, !!e);
			}
			function n(e) {
				var p, y, w = e.name;
				return {
					name: w,
					schema: e,
					mutate: function(e) {
						var y = e.trans, v = e.type, m = e.keys, b = e.values, g = e.range;
						return new Promise(function(t, e) {
							t = E(t);
							var n = y.objectStore(w), r = null == n.keyPath, i = "put" === v || "add" === v;
							if (!i && "delete" !== v && "deleteRange" !== v) throw new Error("Invalid operation type: " + v);
							var o, a = (m || b || { length: 1 }).length;
							if (m && b && m.length !== b.length) throw new Error("Given keys array must have same length as given values array.");
							if (0 === a) return t({
								numFailures: 0,
								failures: {},
								results: [],
								lastResult: void 0
							});
							function u(e) {
								++l, Ut(e);
							}
							var s = [], c = [], l = 0;
							if ("deleteRange" === v) {
								if (4 === g.type) return t({
									numFailures: l,
									failures: c,
									results: [],
									lastResult: void 0
								});
								3 === g.type ? s.push(o = n.clear()) : s.push(o = n.delete(_(g)));
							} else {
								var r = i ? r ? [b, m] : [b, null] : [m, null], f = r[0], h = r[1];
								if (i) for (var d = 0; d < a; ++d) s.push(o = h && void 0 !== h[d] ? n[v](f[d], h[d]) : n[v](f[d])), o.onerror = u;
								else for (d = 0; d < a; ++d) s.push(o = n[v](f[d])), o.onerror = u;
							}
							function p(e) {
								e = e.target.result, s.forEach(function(e, t) {
									return null != e.error && (c[t] = e.error);
								}), t({
									numFailures: l,
									failures: c,
									results: "delete" === v ? m : s.map(function(e) {
										return e.result;
									}),
									lastResult: e
								});
							}
							o.onerror = function(e) {
								u(e), p(e);
							}, o.onsuccess = p;
						});
					},
					getMany: function(e) {
						var f = e.trans, h = e.keys;
						return new Promise(function(t, e) {
							t = E(t);
							for (var n, r = f.objectStore(w), i = h.length, o = new Array(i), a = 0, u = 0, s = function(e) {
								e = e.target;
								o[e._pos] = e.result, ++u === a && t(o);
							}, c = I(e), l = 0; l < i; ++l) null != h[l] && ((n = r.get(h[l]))._pos = l, n.onsuccess = s, n.onerror = c, ++a);
							0 === a && t(o);
						});
					},
					get: function(e) {
						var r = e.trans, i = e.key;
						return new Promise(function(t, e) {
							t = E(t);
							var n = r.objectStore(w).get(i);
							n.onsuccess = function(e) {
								return t(e.target.result);
							}, n.onerror = I(e);
						});
					},
					query: (p = a, y = u, function(d) {
						return new Promise(function(t, e) {
							t = E(t);
							var n, r, i, o, a = d.trans, u = d.values, s = d.limit, c = d.query, l = null != (l = d.direction) ? l : "next", f = s === 1 / 0 ? void 0 : s, h = c.index, c = c.range, a = a.objectStore(w), a = h.isPrimaryKey ? a : a.index(h.name), h = _(c);
							if (0 === s) return t({ result: [] });
							y ? (c = {
								query: h,
								count: f,
								direction: l
							}, (n = u ? a.getAll(c) : a.getAllKeys(c)).onsuccess = function(e) {
								return t({ result: e.target.result });
							}, n.onerror = I(e)) : p && "next" === l ? ((n = u ? a.getAll(h, f) : a.getAllKeys(h, f)).onsuccess = function(e) {
								return t({ result: e.target.result });
							}, n.onerror = I(e)) : (r = 0, i = !u && "openKeyCursor" in a ? a.openKeyCursor(h, l) : a.openCursor(h, l), o = [], i.onsuccess = function() {
								var e = i.result;
								return !e || (o.push(u ? e.value : e.primaryKey), ++r === s) ? t({ result: o }) : void e.continue();
							}, i.onerror = I(e));
						});
					}),
					openCursor: function(e) {
						var c = e.trans, o = e.values, a = e.query, u = e.reverse, l = e.unique;
						return new Promise(function(t, n) {
							t = E(t);
							var e = a.index, r = a.range, i = c.objectStore(w), i = e.isPrimaryKey ? i : i.index(e.name), e = u ? l ? "prevunique" : "prev" : l ? "nextunique" : "next", s = !o && "openKeyCursor" in i ? i.openKeyCursor(_(r), e) : i.openCursor(_(r), e);
							s.onerror = I(n), s.onsuccess = E(function(e) {
								var r, i, o, a, u = s.result;
								u ? (u.___id = ++Zt, u.done = !1, r = u.continue.bind(u), i = (i = u.continuePrimaryKey) && i.bind(u), o = u.advance.bind(u), a = function() {
									throw new Error("Cursor not stopped");
								}, u.trans = c, u.stop = u.continue = u.continuePrimaryKey = u.advance = function() {
									throw new Error("Cursor not started");
								}, u.fail = E(n), u.next = function() {
									var e = this, t = 1;
									return this.start(function() {
										return t-- ? e.continue() : e.stop();
									}).then(function() {
										return e;
									});
								}, u.start = function(e) {
									function t() {
										if (s.result) try {
											e();
										} catch (e) {
											u.fail(e);
										}
										else u.done = !0, u.start = function() {
											throw new Error("Cursor behind last entry");
										}, u.stop();
									}
									var n = new Promise(function(t, e) {
										t = E(t), s.onerror = I(e), u.fail = e, u.stop = function(e) {
											u.stop = u.continue = u.continuePrimaryKey = u.advance = a, t(e);
										};
									});
									return s.onsuccess = E(function(e) {
										s.onsuccess = t, t();
									}), u.continue = r, u.continuePrimaryKey = i, u.advance = o, t(), n;
								}, t(u)) : t(null);
							}, n);
						});
					},
					count: function(e) {
						var t = e.query, i = e.trans, o = t.index, a = t.range;
						return new Promise(function(t, e) {
							var n = i.objectStore(w), n = o.isPrimaryKey ? n : n.index(o.name), r = _(a), r = r ? n.count(r) : n.count();
							r.onsuccess = E(function(e) {
								return t(e.target.result);
							}), r.onerror = I(e);
						});
					}
				};
			}
			r = t, o = Jt((t = e).objectStoreNames), s = 0 < o.length ? r.objectStore(o[0]) : {};
			var r, t = {
				schema: {
					name: t.name,
					tables: o.map(function(e) {
						return r.objectStore(e);
					}).map(function(t) {
						var e = t.keyPath, n = t.autoIncrement, r = x(e), i = {}, r = {
							name: t.name,
							primaryKey: {
								name: null,
								isPrimaryKey: !0,
								outbound: null == e,
								compound: r,
								keyPath: e,
								autoIncrement: n,
								unique: !0,
								extractKey: Ht(e)
							},
							indexes: Jt(t.indexNames).map(function(e) {
								return t.index(e);
							}).map(function(e) {
								var t = e.name, n = e.unique, r = e.multiEntry, e = e.keyPath, t = {
									name: t,
									compound: x(e),
									keyPath: e,
									unique: n,
									multiEntry: r,
									extractKey: Ht(e)
								};
								return i[en(e)] = t;
							}),
							getIndexByKeyPath: function(e) {
								return i[en(e)];
							}
						};
						return i[":id"] = r.primaryKey, null != e && (i[en(e)] = r.primaryKey), r;
					})
				},
				hasGetAll: 0 < o.length && "getAll" in s && !("undefined" != typeof navigator && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604),
				hasIdb3Features: "getAllRecords" in s
			}, o = t.schema, a = t.hasGetAll, u = t.hasIdb3Features, s = o.tables.map(n), c = {};
			return s.forEach(function(e) {
				return c[e.name] = e;
			}), {
				stack: "dbcore",
				transaction: e.transaction.bind(e),
				table: function(e) {
					if (c[e]) return c[e];
					throw new Error("Table '".concat(e, "' not found"));
				},
				MIN_KEY: -1 / 0,
				MAX_KEY: Xt(i),
				schema: o
			};
		}
		function nn(e, t, n, r) {
			n = n.IDBKeyRange;
			return t = tn(t, n, r), { dbcore: e.dbcore.reduce(function(e, t) {
				t = t.create;
				return _(_({}, e), t(e));
			}, t) };
		}
		function rn(n, e) {
			var t = e.db, t = nn(n._middlewares, t, n._deps, e);
			n.core = t.dbcore, n.tables.forEach(function(e) {
				var t = e.name;
				n.core.schema.tables.some(function(e) {
					return e.name === t;
				}) && (e.core = n.core.table(t), n[t] instanceof n.Table) && (n[t].core = e.core);
			});
		}
		function on(i, e, t, o) {
			t.forEach(function(n) {
				var r = o[n];
				e.forEach(function(e) {
					var t = function e(t, n) {
						return z(t, n) || (t = F(t)) && e(t, n);
					}(e, n);
					(!t || "value" in t && void 0 === t.value) && (e === i.Transaction.prototype || e instanceof i.Transaction ? u(e, n, {
						get: function() {
							return this.table(n);
						},
						set: function(e) {
							L(this, n, {
								value: e,
								writable: !0,
								configurable: !0,
								enumerable: !0
							});
						}
					}) : e[n] = new i.Table(n, r));
				});
			});
		}
		function an(n, e) {
			e.forEach(function(e) {
				for (var t in e) e[t] instanceof n.Table && delete e[t];
			});
		}
		function un(e, t) {
			return e._cfg.version - t._cfg.version;
		}
		function sn(n, r, i, e) {
			var o = n._dbSchema, a = (i.objectStoreNames.contains("$meta") && !o.$meta && (o.$meta = Gt("$meta", vn("")[0], []), n._storeNames.push("$meta")), n._createTransaction("readwrite", n._storeNames, o)), u = (a.create(i), a._completion.catch(e), a._reject.bind(a)), s = P.transless || P;
			v(function() {
				if (P.trans = a, P.transless = s, 0 !== r) return rn(n, i), t = r, ((e = a).storeNames.includes("$meta") ? e.table("$meta").get("version").then(function(e) {
					return null != e ? e : t;
				}) : K.resolve(t)).then(function(e) {
					var s = n, c = e, l = a, f = i, t = [], e = s._versions, h = s._dbSchema = pn(0, s.idbdb, f);
					return 0 === (e = e.filter(function(e) {
						return e._cfg.version >= c;
					})).length ? K.resolve() : (e.forEach(function(u) {
						t.push(function() {
							var t, n, r, i = h, e = u._cfg.dbschema, o = (yn(s, i, f), yn(s, e, f), h = s._dbSchema = e, ln(i, e)), a = (o.add.forEach(function(e) {
								fn(f, e[0], e[1].primKey, e[1].indexes);
							}), o.change.forEach(function(e) {
								if (e.recreate) throw new k.Upgrade("Not yet support for changing primary key");
								var t = f.objectStore(e.name);
								e.add.forEach(function(e) {
									return dn(t, e);
								}), e.change.forEach(function(e) {
									t.deleteIndex(e.name), dn(t, e);
								}), e.del.forEach(function(e) {
									return t.deleteIndex(e);
								});
							}), u._cfg.contentUpgrade);
							if (a && u._cfg.version > c) return rn(s, f), l._memoizedTables = {}, t = G(e), o.del.forEach(function(e) {
								t[e] = i[e];
							}), an(s, [s.Transaction.prototype]), on(s, [s.Transaction.prototype], O(t), t), l.schema = t, (n = ue(a)) && nt(), e = K.follow(function() {
								var e;
								(r = a(l)) && n && (e = w.bind(null, null), r.then(e, e));
							}), r && "function" == typeof r.then ? K.resolve(r) : e.then(function() {
								return r;
							});
						}), t.push(function(e) {
							var t = u._cfg.dbschema, n = e;
							[].slice.call(n.db.objectStoreNames).forEach(function(e) {
								return null == t[e] && n.db.deleteObjectStore(e);
							}), an(s, [s.Transaction.prototype]), on(s, [s.Transaction.prototype], s._storeNames, s._dbSchema), l.schema = s._dbSchema;
						}), t.push(function(e) {
							s.idbdb.objectStoreNames.contains("$meta") && (Math.ceil(s.idbdb.version / 10) === u._cfg.version ? (s.idbdb.deleteObjectStore("$meta"), delete s._dbSchema.$meta, s._storeNames = s._storeNames.filter(function(e) {
								return "$meta" !== e;
							})) : e.objectStore("$meta").put(u._cfg.version, "version"));
						});
					}), function e() {
						return t.length ? K.resolve(t.shift()(l.idbtrans)).then(e) : K.resolve();
					}().then(function() {
						hn(h, f);
					}));
				}).catch(u);
				var e, t;
				O(o).forEach(function(e) {
					fn(i, e, o[e].primKey, o[e].indexes);
				}), rn(n, i), K.follow(function() {
					return n.on.populate.fire(a);
				}).catch(u);
			});
		}
		function cn(e, r) {
			hn(e._dbSchema, r), r.db.version % 10 != 0 || r.objectStoreNames.contains("$meta") || r.db.createObjectStore("$meta").add(Math.ceil(r.db.version / 10 - 1), "version");
			var t = pn(0, e.idbdb, r);
			yn(e, e._dbSchema, r);
			for (var n = 0, i = ln(t, e._dbSchema).change; n < i.length; n++) {
				var o = ((t) => {
					if (t.change.length || t.recreate) return console.warn("Unable to patch indexes of table ".concat(t.name, " because it has changes on the type of index or primary key.")), { value: void 0 };
					var n = r.objectStore(t.name);
					t.add.forEach(function(e) {
						l && console.debug("Dexie upgrade patch: Creating missing index ".concat(t.name, ".").concat(e.src)), dn(n, e);
					});
				})(i[n]);
				if ("object" == typeof o) return o.value;
			}
		}
		function ln(e, t) {
			var n, r = {
				del: [],
				add: [],
				change: []
			};
			for (n in e) t[n] || r.del.push(n);
			for (n in t) {
				var i = e[n], o = t[n];
				if (i) {
					var a = {
						name: n,
						def: o,
						recreate: !1,
						del: [],
						add: [],
						change: []
					};
					if ("" + (i.primKey.keyPath || "") != "" + (o.primKey.keyPath || "") || i.primKey.auto !== o.primKey.auto) a.recreate = !0, r.change.push(a);
					else {
						var u = i.idxByName, s = o.idxByName, c = void 0;
						for (c in u) s[c] || a.del.push(c);
						for (c in s) {
							var l = u[c], f = s[c];
							l ? l.src !== f.src && a.change.push(f) : a.add.push(f);
						}
						(0 < a.del.length || 0 < a.add.length || 0 < a.change.length) && r.change.push(a);
					}
				} else r.add.push([n, o]);
			}
			return r;
		}
		function fn(e, t, n, r) {
			var i = e.db.createObjectStore(t, n.keyPath ? {
				keyPath: n.keyPath,
				autoIncrement: n.auto
			} : { autoIncrement: n.auto });
			r.forEach(function(e) {
				return dn(i, e);
			});
		}
		function hn(t, n) {
			O(t).forEach(function(e) {
				n.db.objectStoreNames.contains(e) || (l && console.debug("Dexie: Creating missing table", e), fn(n, e, t[e].primKey, t[e].indexes));
			});
		}
		function dn(e, t) {
			e.createIndex(t.name, t.keyPath, {
				unique: t.unique,
				multiEntry: t.multi
			});
		}
		function pn(e, t, u) {
			var s = {};
			return W(t.objectStoreNames, 0).forEach(function(e) {
				for (var t = u.objectStore(e), n = $t(Qt(a = t.keyPath), a || "", !0, !1, !!t.autoIncrement, a && "string" != typeof a, !0), r = [], i = 0; i < t.indexNames.length; ++i) {
					var o = t.index(t.indexNames[i]), a = o.keyPath, o = $t(o.name, a, !!o.unique, !!o.multiEntry, !1, a && "string" != typeof a, !1);
					r.push(o);
				}
				s[e] = Gt(e, n, r);
			}), s;
		}
		function yn(e, t, n) {
			for (var r = n.db.objectStoreNames, i = 0; i < r.length; ++i) {
				var o = r[i], a = n.objectStore(o);
				e._hasGetAll = "getAll" in a;
				for (var u = 0; u < a.indexNames.length; ++u) {
					var s, c = a.indexNames[u], l = a.index(c).keyPath, l = "string" == typeof l ? l : "[" + W(l).join("+") + "]";
					t[o] && (s = t[o].idxByName[l]) && (s.name = c, delete t[o].idxByName[l], t[o].idxByName[c] = s);
				}
			}
			"undefined" != typeof navigator && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && f.WorkerGlobalScope && f instanceof f.WorkerGlobalScope && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604 && (e._hasGetAll = !1);
		}
		function vn(e) {
			return e.split(",").map(function(e, t) {
				var n = e.split(":"), r = null == (r = n[1]) ? void 0 : r.trim(), n = (e = n[0].trim()).replace(/([&*]|\+\+)/g, ""), i = /^\[/.test(n) ? n.match(/^\[(.*)\]$/)[1].split("+") : n;
				return $t(n, i || null, /\&/.test(e), /\*/.test(e), /\+\+/.test(e), x(i), 0 === t, r);
			});
		}
		bn.prototype._createTableSchema = Gt, bn.prototype._parseIndexSyntax = vn, bn.prototype._parseStoresSpec = function(r, i) {
			var o = this;
			O(r).forEach(function(e) {
				if (null !== r[e]) {
					var t = o._parseIndexSyntax(r[e]), n = t.shift();
					if (!n) throw new k.Schema("Invalid schema for table " + e + ": " + r[e]);
					if (n.unique = !0, n.multi) throw new k.Schema("Primary key cannot be multiEntry*");
					t.forEach(function(e) {
						if (e.auto) throw new k.Schema("Only primary key can be marked as autoIncrement (++)");
						if (!e.keyPath) throw new k.Schema("Index must have a name and cannot be an empty string");
					});
					n = o._createTableSchema(e, n, t);
					i[e] = n;
				}
			});
		}, bn.prototype.stores = function(e) {
			var t = this.db, e = (this._cfg.storesSource = this._cfg.storesSource ? a(this._cfg.storesSource, e) : e, t._versions), n = {}, r = {};
			return e.forEach(function(e) {
				a(n, e._cfg.storesSource), r = e._cfg.dbschema = {}, e._parseStoresSpec(n, r);
			}), t._dbSchema = r, an(t, [
				t._allTables,
				t,
				t.Transaction.prototype
			]), on(t, [
				t._allTables,
				t,
				t.Transaction.prototype,
				this._cfg.tables
			], O(r), r), t._storeNames = O(r), this;
		}, bn.prototype.upgrade = function(e) {
			return this._cfg.contentUpgrade = ke(this._cfg.contentUpgrade || g, e), this;
		};
		var mn = bn;
		function bn() {}
		var gn = (() => {
			var i, o, t;
			return "undefined" != typeof FinalizationRegistry && "undefined" != typeof WeakRef ? (i = /* @__PURE__ */ new Set(), o = new FinalizationRegistry(function(e) {
				i.delete(e);
			}), {
				toArray: function() {
					return Array.from(i).map(function(e) {
						return e.deref();
					}).filter(function(e) {
						return void 0 !== e;
					});
				},
				add: function(e) {
					var t = new WeakRef(e._novip);
					i.add(t), o.register(e._novip, t, t), i.size > e._options.maxConnections && (t = i.values().next().value, i.delete(t), o.unregister(t));
				},
				remove: function(e) {
					if (e) for (var t = i.values(), n = t.next(); !n.done;) {
						var r = n.value;
						if (r.deref() === e._novip) return i.delete(r), void o.unregister(r);
						n = t.next();
					}
				}
			}) : (t = [], {
				toArray: function() {
					return t;
				},
				add: function(e) {
					t.push(e._novip);
				},
				remove: function(e) {
					e && -1 !== (e = t.indexOf(e._novip)) && t.splice(e, 1);
				}
			});
		})();
		function wn(e, t) {
			var n = e._dbNamesDB;
			return n || (n = e._dbNamesDB = new y(ft, {
				addons: [],
				indexedDB: e,
				IDBKeyRange: t
			})).version(1).stores({ dbnames: "name" }), n.table("dbnames");
		}
		function _n(e) {
			return e && "function" == typeof e.databases;
		}
		function xn(e) {
			return v(function() {
				return P.letThrough = !0, e();
			});
		}
		function kn(e) {
			return !("from" in e);
		}
		var q = function(e, t) {
			var n;
			if (!this) return n = new q(), e && "d" in e && a(n, e), n;
			a(this, arguments.length ? {
				d: 1,
				from: e,
				to: 1 < arguments.length ? t : e
			} : { d: 0 });
		};
		function On(e, t, n) {
			var r = j(t, n);
			if (!isNaN(r)) {
				if (0 < r) throw RangeError();
				if (kn(e)) return a(e, {
					from: t,
					to: n,
					d: 1
				});
				var r = e.l, i = e.r;
				if (j(n, e.from) < 0) return r ? On(r, t, n) : e.l = {
					from: t,
					to: n,
					d: 1,
					l: null,
					r: null
				}, Sn(e);
				if (0 < j(t, e.to)) return i ? On(i, t, n) : e.r = {
					from: t,
					to: n,
					d: 1,
					l: null,
					r: null
				}, Sn(e);
				j(t, e.from) < 0 && (e.from = t, e.l = null, e.d = i ? i.d + 1 : 1), 0 < j(n, e.to) && (e.to = n, e.r = null, e.d = e.l ? e.l.d + 1 : 1);
				t = !e.r;
				r && !e.l && Pn(e, r), i && t && Pn(e, i);
			}
		}
		function Pn(e, t) {
			kn(t) || function e(t, n) {
				var r = n.from, i = n.l, o = n.r;
				On(t, r, n.to), i && e(t, i), o && e(t, o);
			}(e, t);
		}
		function Kn(e, t) {
			var n = En(t), r = n.next();
			if (!r.done) for (var i = r.value, o = En(e), a = o.next(i.from), u = a.value; !r.done && !a.done;) {
				if (j(u.from, i.to) <= 0 && 0 <= j(u.to, i.from)) return !0;
				j(i.from, u.from) < 0 ? i = (r = n.next(u.from)).value : u = (a = o.next(i.from)).value;
			}
			return !1;
		}
		function En(e) {
			var n = kn(e) ? null : {
				s: 0,
				n: e
			};
			return { next: function(e) {
				for (var t = 0 < arguments.length; n;) switch (n.s) {
					case 0: if (n.s = 1, t) for (; n.n.l && j(e, n.n.from) < 0;) n = {
						up: n,
						n: n.n.l,
						s: 1
					};
					else for (; n.n.l;) n = {
						up: n,
						n: n.n.l,
						s: 1
					};
					case 1: if (n.s = 2, !t || j(e, n.n.to) <= 0) return {
						value: n.n,
						done: !1
					};
					case 2: if (n.n.r) {
						n.s = 3, n = {
							up: n,
							n: n.n.r,
							s: 0
						};
						continue;
					}
					case 3: n = n.up;
				}
				return { done: !0 };
			} };
		}
		function Sn(e) {
			var t, n, r, i = ((null == (i = e.r) ? void 0 : i.d) || 0) - ((null == (i = e.l) ? void 0 : i.d) || 0), i = 1 < i ? "r" : i < -1 ? "l" : "";
			i && (t = "r" == i ? "l" : "r", n = _({}, e), r = e[i], e.from = r.from, e.to = r.to, e[i] = r[i], n[i] = r[t], (e[t] = n).d = An(n)), e.d = An(e);
		}
		function An(e) {
			var t = e.r, e = e.l;
			return (t ? e ? Math.max(t.d, e.d) : t.d : e ? e.d : 0) + 1;
		}
		function jn(t, n) {
			return O(n).forEach(function(e) {
				t[e] ? Pn(t[e], n[e]) : t[e] = function e(t) {
					var n, r, i = {};
					for (n in t) m(t, n) && (r = t[n], i[n] = !r || "object" != typeof r || J.has(r.constructor) ? r : e(r));
					return i;
				}(n[e]);
			}), t;
		}
		function Cn(t, n) {
			return t.all || n.all || Object.keys(t).some(function(e) {
				return n[e] && Kn(n[e], t[e]);
			});
		}
		M(q.prototype, ((t = {
			add: function(e) {
				return Pn(this, e), this;
			},
			addKey: function(e) {
				return On(this, e, e), this;
			},
			addKeys: function(e) {
				var t = this;
				return e.forEach(function(e) {
					return On(t, e, e);
				}), this;
			},
			hasKey: function(e) {
				var t = En(this).next(e).value;
				return t && j(t.from, e) <= 0 && 0 <= j(t.to, e);
			}
		})[re] = function() {
			return En(this);
		}, t));
		var Tn = {}, In = {}, qn = !1;
		function Dn(e) {
			jn(In, e), qn || (qn = !0, setTimeout(function() {
				qn = !1, Bn(In, !(In = {}));
			}, 0));
		}
		function Bn(e, t) {
			void 0 === t && (t = !1);
			var n = /* @__PURE__ */ new Set();
			if (e.all) for (var r = 0, i = Object.values(Tn); r < i.length; r++) Rn(u = i[r], e, n, t);
			else for (var o in e) {
				var a, u, o = /^idb\:\/\/(.*)\/(.*)\//.exec(o);
				o && (a = o[1], o = o[2], u = Tn["idb://".concat(a, "/").concat(o)]) && Rn(u, e, n, t);
			}
			n.forEach(function(e) {
				return e();
			});
		}
		function Rn(e, t, n, r) {
			for (var i = [], o = 0, a = Object.entries(e.queries.query); o < a.length; o++) {
				for (var u = a[o], s = u[0], c = [], l = 0, f = u[1]; l < f.length; l++) {
					var h = f[l];
					Cn(t, h.obsSet) ? h.subscribers.forEach(function(e) {
						return n.add(e);
					}) : r && c.push(h);
				}
				r && i.push([s, c]);
			}
			if (r) for (var d = 0, p = i; d < p.length; d++) {
				var y = p[d], s = y[0], c = y[1];
				e.queries.query[s] = c;
			}
		}
		function Fn(h) {
			var d = h._state, r = h._deps.indexedDB;
			if (d.isBeingOpened || h.idbdb) return d.dbReadyPromise.then(function() {
				return d.dbOpenError ? S(d.dbOpenError) : h;
			});
			d.isBeingOpened = !0, d.dbOpenError = null, d.openComplete = !1;
			var t = d.openCanceller, p = Math.round(10 * h.verno), y = !1;
			function e() {
				if (d.openCanceller !== t) throw new k.DatabaseClosed("db.open() was cancelled");
			}
			function v() {
				return new K(function(c, n) {
					if (e(), !r) throw new k.MissingAPI();
					var l = h.name, f = d.autoSchema || !p ? r.open(l) : r.open(l, p);
					if (!f) throw new k.MissingAPI();
					f.onerror = I(n), f.onblocked = E(h._fireOnBlocked), f.onupgradeneeded = E(function(e) {
						var t;
						m = f.transaction, d.autoSchema && !h._options.allowEmptyDB ? (f.onerror = Ut, m.abort(), f.result.close(), (t = r.deleteDatabase(l)).onsuccess = t.onerror = E(function() {
							n(new k.NoSuchDatabase("Database ".concat(l, " doesnt exist")));
						})) : (m.onerror = I(n), t = e.oldVersion > Math.pow(2, 62) ? 0 : e.oldVersion, b = t < 1, h.idbdb = f.result, y && cn(h, m), sn(h, t / 10, m, n));
					}, n), f.onsuccess = E(function() {
						m = null;
						var e, t, n, r, i, o, a = h.idbdb = f.result, u = W(a.objectStoreNames);
						if (0 < u.length) try {
							var s = a.transaction(1 === (i = u).length ? i[0] : i, "readonly");
							if (d.autoSchema) o = a, r = s, (n = h).verno = o.version / 10, r = n._dbSchema = pn(0, o, r), n._storeNames = W(o.objectStoreNames, 0), on(n, [n._allTables], O(r), r);
							else if (yn(h, h._dbSchema, s), t = s, ((t = ln(pn(0, (e = h).idbdb, t), e._dbSchema)).add.length || t.change.some(function(e) {
								return e.add.length || e.change.length;
							})) && !y) return console.warn("Dexie SchemaDiff: Schema was extended without increasing the number passed to db.version(). Dexie will add missing parts and increment native version number to workaround this."), a.close(), p = a.version + 1, y = !0, c(v());
							rn(h, s);
						} catch (e) {}
						gn.add(h), a.onversionchange = E(function(e) {
							d.vcFired = !0, h.on("versionchange").fire(e);
						}), a.onclose = E(function() {
							h.close({ disableAutoOpen: !1 });
						}), b && (u = h._deps, i = l, _n(o = u.indexedDB) || i === ft || wn(o, u.IDBKeyRange).put({ name: i }).catch(g)), c();
					}, n);
				}).catch(function(e) {
					switch (null == e ? void 0 : e.name) {
						case "UnknownError":
							if (0 < d.PR1398_maxLoop) return d.PR1398_maxLoop--, console.warn("Dexie: Workaround for Chrome UnknownError on open()"), v();
							break;
						case "VersionError": if (0 < p) return p = 0, v();
					}
					return K.reject(e);
				});
			}
			var n, i = d.dbReadyResolve, m = null, b = !1;
			return K.race([t, ("undefined" == typeof navigator ? K.resolve() : !navigator.userAgentData && /Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent) && indexedDB.databases ? new Promise(function(e) {
				function t() {
					return indexedDB.databases().finally(e);
				}
				n = setInterval(t, 100), t();
			}).finally(function() {
				return clearInterval(n);
			}) : Promise.resolve()).then(v)]).then(function() {
				return e(), d.onReadyBeingFired = [], K.resolve(xn(function() {
					return h.on.ready.fire(h.vip);
				})).then(function e() {
					var t;
					if (0 < d.onReadyBeingFired.length) return t = d.onReadyBeingFired.reduce(ke, g), d.onReadyBeingFired = [], K.resolve(xn(function() {
						return t(h.vip);
					})).then(e);
				});
			}).finally(function() {
				d.openCanceller === t && (d.onReadyBeingFired = null, d.isBeingOpened = !1);
			}).catch(function(e) {
				d.dbOpenError = e;
				try {
					m && m.abort();
				} catch (e) {}
				return t === d.openCanceller && h._close(), S(e);
			}).finally(function() {
				d.openComplete = !0, i();
			}).then(function() {
				var n;
				return b && (n = {}, h.tables.forEach(function(t) {
					t.schema.indexes.forEach(function(e) {
						e.name && (n["idb://".concat(h.name, "/").concat(t.name, "/").concat(e.name)] = new q(-1 / 0, [[[]]]));
					}), n["idb://".concat(h.name, "/").concat(t.name, "/")] = n["idb://".concat(h.name, "/").concat(t.name, "/:dels")] = new q(-1 / 0, [[[]]]);
				}), Wt(zt).fire(n), Bn(n, !0)), h;
			});
		}
		function Nn(t) {
			function e(e) {
				return t.next(e);
			}
			var r = n(e), i = n(function(e) {
				return t.throw(e);
			});
			function n(n) {
				return function(e) {
					var e = n(e), t = e.value;
					return e.done ? t : t && "function" == typeof t.then ? t.then(r, i) : x(t) ? Promise.all(t).then(r, i) : r(t);
				};
			}
			return n(e)();
		}
		function Mn(e, t, n) {
			for (var r = x(e) ? e.slice() : [e], i = 0; i < n; ++i) r.push(t);
			return r;
		}
		var Ln = {
			stack: "dbcore",
			name: "VirtualIndexMiddleware",
			level: 1,
			create: function(l) {
				return _(_({}, l), { table: function(e) {
					var o = l.table(e), e = o.schema, u = Object.create(null), s = [];
					function c(e, t, n) {
						var r = en(e), i = u[r] = u[r] || [], o = null == e ? 0 : "string" == typeof e ? 1 : e.length, a = 0 < t, r = _(_({}, n), {
							name: a ? "".concat(r, "(virtual-from:").concat(n.name, ")") : n.name,
							lowLevelIndex: n,
							isVirtual: a,
							keyTail: t,
							keyLength: o,
							extractKey: Ht(e),
							unique: !a && n.unique
						});
						return i.push(r), r.isPrimaryKey || s.push(r), 1 < o && c(2 === o ? e[0] : e.slice(0, o - 1), t + 1, n), i.sort(function(e, t) {
							return e.keyTail - t.keyTail;
						}), r;
					}
					var t = c(e.primaryKey.keyPath, 0, e.primaryKey);
					u[":id"] = [t];
					for (var n = 0, r = e.indexes; n < r.length; n++) {
						var i = r[n];
						c(i.keyPath, 0, i);
					}
					function a(e) {
						var t, n = e.query.index;
						return n.isVirtual ? _(_({}, e), { query: {
							index: n.lowLevelIndex,
							range: (t = e.query.range, n = n.keyTail, {
								type: 1 === t.type ? 2 : t.type,
								lower: Mn(t.lower, t.lowerOpen ? l.MAX_KEY : l.MIN_KEY, n),
								lowerOpen: !0,
								upper: Mn(t.upper, t.upperOpen ? l.MIN_KEY : l.MAX_KEY, n),
								upperOpen: !0
							})
						} }) : e;
					}
					return _(_({}, o), {
						schema: _(_({}, e), {
							primaryKey: t,
							indexes: s,
							getIndexByKeyPath: function(e) {
								return (e = u[en(e)]) && e[0];
							}
						}),
						count: function(e) {
							return o.count(a(e));
						},
						query: function(e) {
							return o.query(a(e));
						},
						openCursor: function(t) {
							var e = t.query.index, r = e.keyTail, i = e.keyLength;
							return e.isVirtual ? o.openCursor(a(t)).then(function(e) {
								return e && n(e);
							}) : o.openCursor(t);
							function n(n) {
								return Object.create(n, {
									continue: { value: function(e) {
										null != e ? n.continue(Mn(e, t.reverse ? l.MAX_KEY : l.MIN_KEY, r)) : t.unique ? n.continue(n.key.slice(0, i).concat(t.reverse ? l.MIN_KEY : l.MAX_KEY, r)) : n.continue();
									} },
									continuePrimaryKey: { value: function(e, t) {
										n.continuePrimaryKey(Mn(e, l.MAX_KEY, r), t);
									} },
									primaryKey: { get: function() {
										return n.primaryKey;
									} },
									key: { get: function() {
										var e = n.key;
										return 1 === i ? e[0] : e.slice(0, i);
									} },
									value: { get: function() {
										return n.value;
									} }
								});
							}
						}
					});
				} });
			}
		};
		function Un(i, o, a, u) {
			return a = a || {}, u = u || "", O(i).forEach(function(e) {
				var t, n, r;
				m(o, e) ? (t = i[e], n = o[e], "object" == typeof t && "object" == typeof n && t && n ? (r = ne(t)) !== ne(n) ? a[u + e] = o[e] : "Object" === r ? Un(t, n, a, u + e + ".") : t !== n && (a[u + e] = o[e]) : t !== n && (a[u + e] = o[e])) : a[u + e] = void 0;
			}), O(o).forEach(function(e) {
				m(i, e) || (a[u + e] = o[e]);
			}), a;
		}
		function zn(e, t) {
			return "delete" === t.type ? t.keys : t.keys || t.values.map(e.extractKey);
		}
		var Vn = {
			stack: "dbcore",
			name: "HooksMiddleware",
			level: 2,
			create: function(e) {
				return _(_({}, e), { table: function(r) {
					var y = e.table(r), v = y.schema.primaryKey;
					return _(_({}, y), { mutate: function(e) {
						var t = P.trans, n = t.table(r).hook, h = n.deleting, d = n.creating, p = n.updating;
						switch (e.type) {
							case "add":
								if (d.fire === g) break;
								return t._promise("readwrite", function() {
									return a(e);
								}, !0);
							case "put":
								if (d.fire === g && p.fire === g) break;
								return t._promise("readwrite", function() {
									return a(e);
								}, !0);
							case "delete":
								if (h.fire === g) break;
								return t._promise("readwrite", function() {
									return a(e);
								}, !0);
							case "deleteRange":
								if (h.fire === g) break;
								return t._promise("readwrite", function() {
									return function n(r, i, o) {
										return y.query({
											trans: r,
											values: !1,
											query: {
												index: v,
												range: i
											},
											limit: o
										}).then(function(e) {
											var t = e.result;
											return a({
												type: "delete",
												keys: t,
												trans: r
											}).then(function(e) {
												return 0 < e.numFailures ? Promise.reject(e.failures[0]) : t.length < o ? {
													failures: [],
													numFailures: 0,
													lastResult: void 0
												} : n(r, _(_({}, i), {
													lower: t[t.length - 1],
													lowerOpen: !0
												}), o);
											});
										});
									}(e.trans, e.range, 1e4);
								}, !0);
						}
						return y.mutate(e);
						function a(c) {
							var e, t, n, l = P.trans, f = c.keys || zn(v, c);
							if (f) return "delete" !== (c = "add" === c.type || "put" === c.type ? _(_({}, c), { keys: f }) : _({}, c)).type && (c.values = R([], c.values, !0)), c.keys && (c.keys = R([], c.keys, !0)), e = y, n = f, ("add" === (t = c).type ? Promise.resolve([]) : e.getMany({
								trans: t.trans,
								keys: n,
								cache: "immutable"
							})).then(function(u) {
								var s = f.map(function(e, t) {
									var n, r, i, o = u[t], a = {
										onerror: null,
										onsuccess: null
									};
									return "delete" === c.type ? h.fire.call(a, e, o, l) : "add" === c.type || void 0 === o ? (n = d.fire.call(a, e, c.values[t], l), null == e && null != n && (c.keys[t] = e = n, v.outbound || b(c.values[t], v.keyPath, e))) : (n = Un(o, c.values[t]), (r = p.fire.call(a, n, e, o, l)) && (i = c.values[t], Object.keys(r).forEach(function(e) {
										m(i, e) ? i[e] = r[e] : b(i, e, r[e]);
									}))), a;
								});
								return y.mutate(c).then(function(e) {
									for (var t = e.failures, n = e.results, r = e.numFailures, e = e.lastResult, i = 0; i < f.length; ++i) {
										var o = (n || f)[i], a = s[i];
										null == o ? a.onerror && a.onerror(t[i]) : a.onsuccess && a.onsuccess("put" === c.type && u[i] ? c.values[i] : o);
									}
									return {
										failures: t,
										results: n,
										numFailures: r,
										lastResult: e
									};
								}).catch(function(t) {
									return s.forEach(function(e) {
										return e.onerror && e.onerror(t);
									}), Promise.reject(t);
								});
							});
							throw new Error("Keys missing");
						}
					} });
				} });
			}
		};
		function Wn(e, t, n) {
			try {
				if (!t) return null;
				if (t.keys.length < e.length) return null;
				for (var r = [], i = 0, o = 0; i < t.keys.length && o < e.length; ++i) 0 === j(t.keys[i], e[o]) && (r.push(n ? ee(t.values[i]) : t.values[i]), ++o);
				return r.length === e.length ? r : null;
			} catch (e) {
				return null;
			}
		}
		var Yn = {
			stack: "dbcore",
			level: -1,
			create: function(t) {
				return { table: function(e) {
					var n = t.table(e);
					return _(_({}, n), {
						getMany: function(t) {
							var e;
							return t.cache ? (e = Wn(t.keys, t.trans._cache, "clone" === t.cache)) ? K.resolve(e) : n.getMany(t).then(function(e) {
								return t.trans._cache = {
									keys: t.keys,
									values: "clone" === t.cache ? ee(e) : e
								}, e;
							}) : n.getMany(t);
						},
						mutate: function(e) {
							return "add" !== e.type && (e.trans._cache = null), n.mutate(e);
						}
					});
				} };
			}
		};
		function $n(e, t) {
			return "readonly" === e.trans.mode && !!e.subscr && !e.trans.explicit && "disabled" !== e.trans.db._options.cache && !t.schema.primaryKey.outbound;
		}
		function Qn(e, t) {
			switch (e) {
				case "query": return t.values && !t.unique;
				case "get":
				case "getMany":
				case "count":
				case "openCursor": return !1;
			}
		}
		var Gn = {
			stack: "dbcore",
			level: 0,
			name: "Observability",
			create: function(b) {
				var g = b.schema.name, w = new q(b.MIN_KEY, b.MAX_KEY);
				return _(_({}, b), {
					transaction: function(e, t, n) {
						if (P.subscr && "readonly" !== t) throw new k.ReadOnly("Readwrite transaction in liveQuery context. Querier source: ".concat(P.querier));
						return b.transaction(e, t, n);
					},
					table: function(d) {
						function e(e) {
							var t, e = e.query;
							return [t = e.index, new q(null != (t = (e = e.range).lower) ? t : b.MIN_KEY, null != (t = e.upper) ? t : b.MAX_KEY)];
						}
						var p = b.table(d), y = p.schema, v = y.primaryKey, t = y.indexes, c = v.extractKey, l = v.outbound, m = v.autoIncrement && t.filter(function(e) {
							return e.compound && e.keyPath.includes(v.keyPath);
						}), n = _(_({}, p), { mutate: function(a) {
							function u(e) {
								return e = "idb://".concat(g, "/").concat(d, "/").concat(e), n[e] || (n[e] = new q());
							}
							var e, o, s, t = a.trans, n = a.mutatedParts || (a.mutatedParts = {}), r = u(""), i = u(":dels"), c = a.type, l = "deleteRange" === a.type ? [a.range] : "delete" === a.type ? [a.keys] : a.values.length < 50 ? [zn(v, a).filter(function(e) {
								return e;
							}), a.values] : [], f = l[0], l = l[1], h = a.trans._cache;
							return x(f) ? (r.addKeys(f), (c = "delete" === c || f.length === l.length ? Wn(f, h) : null) || i.addKeys(f), (c || l) && (e = u, o = c, s = l, y.indexes.forEach(function(t) {
								var n = e(t.name || "");
								function r(e) {
									return null != e ? t.extractKey(e) : null;
								}
								function i(e) {
									t.multiEntry && x(e) ? e.forEach(function(e) {
										return n.addKey(e);
									}) : n.addKey(e);
								}
								(o || s).forEach(function(e, t) {
									var n = o && r(o[t]), t = s && r(s[t]);
									0 !== j(n, t) && (null != n && i(n), null != t) && i(t);
								});
							}))) : f ? (l = {
								from: null != (h = f.lower) ? h : b.MIN_KEY,
								to: null != (c = f.upper) ? c : b.MAX_KEY
							}, i.add(l), r.add(l)) : (r.add(w), i.add(w), y.indexes.forEach(function(e) {
								return u(e.name).add(w);
							})), p.mutate(a).then(function(o) {
								return !f || "add" !== a.type && "put" !== a.type || (r.addKeys(o.results), m && m.forEach(function(t) {
									for (var e = a.values.map(function(e) {
										return t.extractKey(e);
									}), n = t.keyPath.findIndex(function(e) {
										return e === v.keyPath;
									}), r = 0, i = o.results.length; r < i; ++r) e[r][n] = o.results[r];
									u(t.name).addKeys(e);
								})), t.mutatedParts = jn(t.mutatedParts || {}, n), o;
							});
						} }), f = {
							get: function(e) {
								return [v, new q(e.key)];
							},
							getMany: function(e) {
								return [v, new q().addKeys(e.keys)];
							},
							count: e,
							query: e,
							openCursor: e
						};
						return O(f).forEach(function(s) {
							n[s] = function(i) {
								var e = P.subscr, t = !!e, n = $n(P, p) && Qn(s, i) ? i.obsSet = {} : e;
								if (t) {
									var o, e = function(e) {
										e = "idb://".concat(g, "/").concat(d, "/").concat(e);
										return n[e] || (n[e] = new q());
									}, a = e(""), u = e(":dels"), t = f[s](i), r = t[0], t = t[1];
									if (("query" === s && r.isPrimaryKey && !i.values ? u : e(r.name || "")).add(t), !r.isPrimaryKey) {
										if ("count" !== s) return o = "query" === s && l && i.values && p.query(_(_({}, i), { values: !1 })), p[s].apply(this, arguments).then(function(t) {
											if ("query" === s) {
												if (l && i.values) return o.then(function(e) {
													e = e.result;
													return a.addKeys(e), t;
												});
												var e = i.values ? t.result.map(c) : t.result;
												(i.values ? a : u).addKeys(e);
											} else {
												var n, r;
												if ("openCursor" === s) return r = i.values, (n = t) && Object.create(n, {
													key: { get: function() {
														return u.addKey(n.primaryKey), n.key;
													} },
													primaryKey: { get: function() {
														var e = n.primaryKey;
														return u.addKey(e), e;
													} },
													value: { get: function() {
														return r && a.addKey(n.primaryKey), n.value;
													} }
												});
											}
											return t;
										});
										u.add(w);
									}
								}
								return p[s].apply(this, arguments);
							};
						}), n;
					}
				});
			}
		};
		function Xn(e, t, n) {
			var r;
			return 0 === n.numFailures ? t : "deleteRange" === t.type || (r = t.keys ? t.keys.length : "values" in t && t.values ? t.values.length : 1, n.numFailures === r) ? null : (r = _({}, t), x(r.keys) && (r.keys = r.keys.filter(function(e, t) {
				return !(t in n.failures);
			})), "values" in r && x(r.values) && (r.values = r.values.filter(function(e, t) {
				return !(t in n.failures);
			})), r);
		}
		function Hn(e, t) {
			return n = e, (void 0 === (r = t).lower || (r.lowerOpen ? 0 < j(n, r.lower) : 0 <= j(n, r.lower))) && (n = e, void 0 === (r = t).upper || (r.upperOpen ? j(n, r.upper) < 0 : j(n, r.upper) <= 0));
			var n, r;
		}
		function Jn(e, d, t, n, r, i) {
			var o, p, y, v, m, a, u;
			return !t || 0 === t.length || (o = d.query.index, p = o.multiEntry, y = d.query.range, v = n.schema.primaryKey.extractKey, m = o.extractKey, a = (o.lowLevelIndex || o).extractKey, (n = t.reduce(function(e, t) {
				var n = e, r = [];
				if ("add" === t.type || "put" === t.type) for (var i = new q(), o = t.values.length - 1; 0 <= o; --o) {
					var a, u = t.values[o], s = v(u);
					!i.hasKey(s) && (a = m(u), p && x(a) ? a.some(function(e) {
						return Hn(e, y);
					}) : Hn(a, y)) && (i.addKey(s), r.push(u));
				}
				switch (t.type) {
					case "add":
						var c = new q().addKeys(d.values ? e.map(function(e) {
							return v(e);
						}) : e), n = e.concat(d.values ? r.filter(function(e) {
							e = v(e);
							return !c.hasKey(e) && (c.addKey(e), !0);
						}) : r.map(function(e) {
							return v(e);
						}).filter(function(e) {
							return !c.hasKey(e) && (c.addKey(e), !0);
						}));
						break;
					case "put":
						var l = new q().addKeys(t.values.map(function(e) {
							return v(e);
						}));
						n = e.filter(function(e) {
							return !l.hasKey(d.values ? v(e) : e);
						}).concat(d.values ? r : r.map(function(e) {
							return v(e);
						}));
						break;
					case "delete":
						var f = new q().addKeys(t.keys);
						n = e.filter(function(e) {
							return !f.hasKey(d.values ? v(e) : e);
						});
						break;
					case "deleteRange":
						var h = t.range;
						n = e.filter(function(e) {
							return !Hn(v(e), h);
						});
				}
				return n;
			}, e)) === e) ? e : (u = function(e, t) {
				return j(a(e), a(t)) || j(v(e), v(t));
			}, n.sort("prev" === d.direction || "prevunique" === d.direction ? function(e, t) {
				return u(t, e);
			} : u), d.limit && d.limit < 1 / 0 && (n.length > d.limit ? n.length = d.limit : e.length === d.limit && n.length < d.limit && (r.dirty = !0)), i ? Object.freeze(n) : n);
		}
		function Zn(e, t) {
			return 0 === j(e.lower, t.lower) && 0 === j(e.upper, t.upper) && !!e.lowerOpen == !!t.lowerOpen && !!e.upperOpen == !!t.upperOpen;
		}
		function er(e, t) {
			return ((e, t, n, r) => {
				if (void 0 === e) return void 0 !== t ? -1 : 0;
				if (void 0 === t) return 1;
				if (0 === (e = j(e, t))) {
					if (n && r) return 0;
					if (n) return 1;
					if (r) return -1;
				}
				return e;
			})(e.lower, t.lower, e.lowerOpen, t.lowerOpen) <= 0 && 0 <= ((e, t, n, r) => {
				if (void 0 === e) return void 0 !== t ? 1 : 0;
				if (void 0 === t) return -1;
				if (0 === (e = j(e, t))) {
					if (n && r) return 0;
					if (n) return -1;
					if (r) return 1;
				}
				return e;
			})(e.upper, t.upper, e.upperOpen, t.upperOpen);
		}
		function tr(n, r, i, e) {
			n.subscribers.add(i), e.addEventListener("abort", function() {
				var e, t;
				n.subscribers.delete(i), 0 === n.subscribers.size && (e = n, t = r, setTimeout(function() {
					0 === e.subscribers.size && oe(t, e);
				}, 3e3));
			});
		}
		var nr = {
			stack: "dbcore",
			level: 0,
			name: "Cache",
			create: function(k) {
				var O = k.schema.name;
				return _(_({}, k), {
					transaction: function(g, w, e) {
						var _, t, x = k.transaction(g, w, e);
						return "readwrite" === w && (e = (_ = new AbortController()).signal, x.addEventListener("abort", (t = function(b) {
							return function() {
								if (_.abort(), "readwrite" === w) {
									for (var t = /* @__PURE__ */ new Set(), e = 0, n = g; e < n.length; e++) {
										var r = n[e], i = Tn["idb://".concat(O, "/").concat(r)];
										if (i) {
											var o = k.table(r), a = i.optimisticOps.filter(function(e) {
												return e.trans === x;
											});
											if (x._explicit && b && x.mutatedParts) for (var u = 0, s = Object.values(i.queries.query); u < s.length; u++) for (var c = 0, l = (d = s[u]).slice(); c < l.length; c++) Cn((p = l[c]).obsSet, x.mutatedParts) && (oe(d, p), p.subscribers.forEach(function(e) {
												return t.add(e);
											}));
											else if (0 < a.length) {
												i.optimisticOps = i.optimisticOps.filter(function(e) {
													return e.trans !== x;
												});
												for (var f = 0, h = Object.values(i.queries.query); f < h.length; f++) for (var d, p, y, v = 0, m = (d = h[f]).slice(); v < m.length; v++) null != (p = m[v]).res && x.mutatedParts && (b && !p.dirty ? (y = Object.isFrozen(p.res), y = Jn(p.res, p.req, a, o, p, y), p.dirty ? (oe(d, p), p.subscribers.forEach(function(e) {
													return t.add(e);
												})) : y !== p.res && (p.res = y, p.promise = K.resolve({ result: y }))) : (p.dirty && oe(d, p), p.subscribers.forEach(function(e) {
													return t.add(e);
												})));
											}
										}
									}
									t.forEach(function(e) {
										return e();
									});
								}
							};
						})(!1), { signal: e }), x.addEventListener("error", t(!1), { signal: e }), x.addEventListener("complete", t(!0), { signal: e })), x;
					},
					table: function(s) {
						var c = k.table(s), i = c.schema.primaryKey;
						return _(_({}, c), {
							mutate: function(t) {
								var n, e = P.trans;
								return !i.outbound && "disabled" !== e.db._options.cache && !e.explicit && "readwrite" === e.idbtrans.mode && (n = Tn["idb://".concat(O, "/").concat(s)]) ? (e = c.mutate(t), "add" !== t.type && "put" !== t.type || !(50 <= t.values.length || zn(i, t).some(function(e) {
									return null == e;
								})) ? (n.optimisticOps.push(t), t.mutatedParts && Dn(t.mutatedParts), e.then(function(e) {
									0 < e.numFailures && (oe(n.optimisticOps, t), (e = Xn(0, t, e)) && n.optimisticOps.push(e), t.mutatedParts) && Dn(t.mutatedParts);
								}), e.catch(function() {
									oe(n.optimisticOps, t), t.mutatedParts && Dn(t.mutatedParts);
								})) : e.then(function(r) {
									var e = Xn(0, _(_({}, t), { values: t.values.map(function(e, t) {
										var n;
										return r.failures[t] ? e : (b(n = null != (n = i.keyPath) && n.includes(".") ? ee(e) : _({}, e), i.keyPath, r.results[t]), n);
									}) }), r);
									n.optimisticOps.push(e), queueMicrotask(function() {
										return t.mutatedParts && Dn(t.mutatedParts);
									});
								}), e) : c.mutate(t);
							},
							query: function(t) {
								var i, e, n, r, o, a, u;
								return $n(P, c) && Qn("query", t) ? (i = "immutable" === (null == (n = P.trans) ? void 0 : n.db._options.cache), e = (n = P).requery, n = n.signal, a = ((e, t, n, r) => {
									var i = Tn["idb://".concat(e, "/").concat(t)];
									if (!i) return [];
									if (!(e = i.queries[n])) return [
										null,
										!1,
										i,
										null
									];
									var o = e[(r.query ? r.query.index.name : null) || ""];
									if (!o) return [
										null,
										!1,
										i,
										null
									];
									switch (n) {
										case "query":
											var a = null != (u = r.direction) ? u : "next", u = o.find(function(e) {
												var t;
												return e.req.limit === r.limit && e.req.values === r.values && (null != (t = e.req.direction) ? t : "next") === a && Zn(e.req.query.range, r.query.range);
											});
											return u ? [
												u,
												!0,
												i,
												o
											] : [
												o.find(function(e) {
													var t;
													return ("limit" in e.req ? e.req.limit : 1 / 0) >= r.limit && (null != (t = e.req.direction) ? t : "next") === a && (!r.values || e.req.values) && er(e.req.query.range, r.query.range);
												}),
												!1,
												i,
												o
											];
										case "count":
											u = o.find(function(e) {
												return Zn(e.req.query.range, r.query.range);
											});
											return [
												u,
												!!u,
												i,
												o
											];
									}
								})(O, s, "query", t), u = a[0], r = a[2], o = a[3], u && a[1] ? u.obsSet = t.obsSet : (a = c.query(t).then(function(e) {
									var t = e.result;
									if (u && (u.res = t), i) {
										for (var n = 0, r = t.length; n < r; ++n) Object.freeze(t[n]);
										Object.freeze(t);
									}
									return e;
								}).catch(function(e) {
									return o && u && oe(o, u), Promise.reject(e);
								}), u = {
									obsSet: t.obsSet,
									promise: a,
									subscribers: /* @__PURE__ */ new Set(),
									type: "query",
									req: t,
									dirty: !1
								}, o ? o.push(u) : (o = [u], (r = r || (Tn["idb://".concat(O, "/").concat(s)] = {
									queries: {
										query: {},
										count: {}
									},
									objs: /* @__PURE__ */ new Map(),
									optimisticOps: [],
									unsignaledParts: {}
								})).queries.query[t.query.index.name || ""] = o)), tr(u, o, e, n), u.promise.then(function(e) {
									e = Jn(e.result, t, null == r ? void 0 : r.optimisticOps, c, u, i);
									return { result: i ? e : ee(e) };
								})) : c.query(t);
							}
						});
					}
				});
			}
		};
		function rr(e, r) {
			return new Proxy(e, { get: function(e, t, n) {
				return "db" === t ? r : Reflect.get(e, t, n);
			} });
		}
		D.prototype.version = function(t) {
			if (isNaN(t) || t < .1) throw new k.Type("Given version is not a positive number");
			if (t = Math.round(10 * t) / 10, this.idbdb || this._state.isBeingOpened) throw new k.Schema("Cannot add version when database is open");
			this.verno = Math.max(this.verno, t);
			var e = this._versions, n = e.filter(function(e) {
				return e._cfg.version === t;
			})[0];
			return n || (n = new this.Version(t), e.push(n), e.sort(un), n.stores({}), this._state.autoSchema = !1), n;
		}, D.prototype._whenReady = function(e) {
			var n = this;
			return this.idbdb && (this._state.openComplete || P.letThrough || this._vip) ? e() : new K(function(e, t) {
				if (n._state.openComplete) return t(new k.DatabaseClosed(n._state.dbOpenError));
				if (!n._state.isBeingOpened) {
					if (!n._state.autoOpen) return void t(new k.DatabaseClosed());
					n.open().catch(g);
				}
				n._state.dbReadyPromise.then(e, t);
			}).then(e);
		}, D.prototype.use = function(e) {
			var t = e.stack, n = e.create, r = e.level, e = e.name, i = (e && this.unuse({
				stack: t,
				name: e
			}), this._middlewares[t] || (this._middlewares[t] = []));
			return i.push({
				stack: t,
				create: n,
				level: null == r ? 10 : r,
				name: e
			}), i.sort(function(e, t) {
				return e.level - t.level;
			}), this;
		}, D.prototype.unuse = function(e) {
			var t = e.stack, n = e.name, r = e.create;
			return t && this._middlewares[t] && (this._middlewares[t] = this._middlewares[t].filter(function(e) {
				return r ? e.create !== r : !!n && e.name !== n;
			})), this;
		}, D.prototype.open = function() {
			var e = this;
			return at(s, function() {
				return Fn(e);
			});
		}, D.prototype._close = function() {
			this.on.close.fire(new CustomEvent("close"));
			var n = this._state;
			if (gn.remove(this), this.idbdb) {
				try {
					this.idbdb.close();
				} catch (e) {}
				this.idbdb = null;
			}
			n.isBeingOpened || (n.dbReadyPromise = new K(function(e) {
				n.dbReadyResolve = e;
			}), n.openCanceller = new K(function(e, t) {
				n.cancelOpen = t;
			}));
		}, D.prototype.close = function(e) {
			var e = (void 0 === e ? { disableAutoOpen: !0 } : e).disableAutoOpen, t = this._state;
			e ? (t.isBeingOpened && t.cancelOpen(new k.DatabaseClosed()), this._close(), t.autoOpen = !1, t.dbOpenError = new k.DatabaseClosed()) : (this._close(), t.autoOpen = this._options.autoOpen || t.isBeingOpened, t.openComplete = !1, t.dbOpenError = null);
		}, D.prototype.delete = function(n) {
			var i = this, o = (void 0 === n && (n = { disableAutoOpen: !0 }), 0 < arguments.length && "object" != typeof arguments[0]), a = this._state;
			return new K(function(r, t) {
				function e() {
					i.close(n);
					var e = i._deps.indexedDB.deleteDatabase(i.name);
					e.onsuccess = E(function() {
						var e = i._deps, t = i.name, n;
						_n(n = e.indexedDB) || t === ft || wn(n, e.IDBKeyRange).delete(t).catch(g), r();
					}), e.onerror = I(t), e.onblocked = i._fireOnBlocked;
				}
				if (o) throw new k.InvalidArgument("Invalid closeOptions argument to db.delete()");
				a.isBeingOpened ? a.dbReadyPromise.then(e) : e();
			});
		}, D.prototype.backendDB = function() {
			return this.idbdb;
		}, D.prototype.isOpen = function() {
			return null !== this.idbdb;
		}, D.prototype.hasBeenClosed = function() {
			var e = this._state.dbOpenError;
			return e && "DatabaseClosed" === e.name;
		}, D.prototype.hasFailed = function() {
			return null !== this._state.dbOpenError;
		}, D.prototype.dynamicallyOpened = function() {
			return this._state.autoSchema;
		}, Object.defineProperty(D.prototype, "tables", {
			get: function() {
				var t = this;
				return O(this._allTables).map(function(e) {
					return t._allTables[e];
				});
			},
			enumerable: !1,
			configurable: !0
		}), D.prototype.transaction = function() {
			var e = function(e, t, n) {
				var r = arguments.length;
				if (r < 2) throw new k.InvalidArgument("Too few arguments");
				for (var i = new Array(r - 1); --r;) i[r - 1] = arguments[r];
				return n = i.pop(), [
					e,
					H(i),
					n
				];
			}.apply(this, arguments);
			return this._transaction.apply(this, e);
		}, D.prototype._transaction = function(e, t, n) {
			var r, i, o = this, a = P.trans, u = (a && a.db === this && -1 === e.indexOf("!") || (a = null), -1 !== e.indexOf("?"));
			e = e.replace("!", "").replace("?", "");
			try {
				if (i = t.map(function(e) {
					e = e instanceof o.Table ? e.name : e;
					if ("string" != typeof e) throw new TypeError("Invalid table argument to Dexie.transaction(). Only Table or String are allowed");
					return e;
				}), "r" == e || e === ht) r = ht;
				else {
					if ("rw" != e && e != dt) throw new k.InvalidArgument("Invalid transaction mode: " + e);
					r = dt;
				}
				if (a) {
					if (a.mode === ht && r === dt) {
						if (!u) throw new k.SubTransaction("Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY");
						a = null;
					}
					a && i.forEach(function(e) {
						if (a && -1 === a.storeNames.indexOf(e)) {
							if (!u) throw new k.SubTransaction("Table " + e + " not included in parent transaction.");
							a = null;
						}
					}), u && a && !a.active && (a = null);
				}
			} catch (n) {
				return a ? a._promise(null, function(e, t) {
					t(n);
				}) : S(n);
			}
			var s = function i(o, a, u, s, c) {
				return K.resolve().then(function() {
					var e = P.transless || P, t = o._createTransaction(a, u, o._dbSchema, s), e = (t.explicit = !0, {
						trans: t,
						transless: e
					});
					if (s) t.idbtrans = s.idbtrans;
					else try {
						t.create(), t.idbtrans._explicit = !0, o._state.PR1398_maxLoop = 3;
					} catch (e) {
						return e.name === de.InvalidState && o.isOpen() && 0 < --o._state.PR1398_maxLoop ? (console.warn("Dexie: Need to reopen db"), o.close({ disableAutoOpen: !1 }), o.open().then(function() {
							return i(o, a, u, null, c);
						})) : S(e);
					}
					var n, r = ue(c), e = (r && nt(), K.follow(function() {
						var e;
						(n = c.call(t, t)) && (r ? (e = w.bind(null, null), n.then(e, e)) : "function" == typeof n.next && "function" == typeof n.throw && (n = Nn(n)));
					}, e));
					return (n && "function" == typeof n.then ? K.resolve(n).then(function(e) {
						return t.active ? e : S(new k.PrematureCommit("Transaction committed too early. See http://bit.ly/2kdckMn"));
					}) : e.then(function() {
						return n;
					})).then(function(e) {
						return s && t._resolve(), t._completion.then(function() {
							return e;
						});
					}).catch(function(e) {
						return t._reject(e), S(e);
					});
				});
			}.bind(null, this, r, i, a, n);
			return a ? a._promise(r, s, "lock") : P.trans ? at(P.transless, function() {
				return o._whenReady(s);
			}) : this._whenReady(s);
		}, D.prototype.table = function(e) {
			if (m(this._allTables, e)) return this._allTables[e];
			throw new k.InvalidTable("Table ".concat(e, " does not exist"));
		};
		var y = D;
		function D(e, t) {
			var o, r, a, n, i, u = this, s = (this._middlewares = {}, this.verno = 0, D.dependencies), s = (this._options = t = _({
				addons: D.addons,
				autoOpen: !0,
				indexedDB: s.indexedDB,
				IDBKeyRange: s.IDBKeyRange,
				cache: "cloned",
				maxConnections: 1e3
			}, t), this._deps = {
				indexedDB: t.indexedDB,
				IDBKeyRange: t.IDBKeyRange
			}, t.addons), c = (this._dbSchema = {}, this._versions = [], this._storeNames = [], this._allTables = {}, this.idbdb = null, this._novip = this, {
				dbOpenError: null,
				isBeingOpened: !1,
				onReadyBeingFired: null,
				openComplete: !1,
				dbReadyResolve: g,
				dbReadyPromise: null,
				cancelOpen: g,
				openCanceller: null,
				autoSchema: !0,
				PR1398_maxLoop: 3,
				autoOpen: t.autoOpen
			}), l = (c.dbReadyPromise = new K(function(e) {
				c.dbReadyResolve = e;
			}), c.openCanceller = new K(function(e, t) {
				c.cancelOpen = t;
			}), this._state = c, this.name = e, this.on = Pt(this, "populate", "blocked", "versionchange", "close", { ready: [ke, g] }), this.once = function(n, r) {
				var i = function() {
					for (var e = [], t = 0; t < arguments.length; t++) e[t] = arguments[t];
					u.on(n).unsubscribe(i), r.apply(u, e);
				};
				return u.on(n, i);
			}, this.on.ready.subscribe = Y(this.on.ready.subscribe, function(i) {
				return function(n, r) {
					D.vip(function() {
						var t, e = u._state;
						e.openComplete ? (e.dbOpenError || K.resolve().then(n), r && i(n)) : e.onReadyBeingFired ? (e.onReadyBeingFired.push(n), r && i(n)) : (i(n), t = u, r || i(function e() {
							t.on.ready.unsubscribe(n), t.on.ready.unsubscribe(e);
						}));
					});
				};
			}), this.Collection = (o = this, Kt(qt.prototype, function(e, t) {
				this.db = o;
				var n = yt, r = null;
				if (t) try {
					n = t();
				} catch (e) {
					r = e;
				}
				var t = e._ctx, e = t.table, i = e.hook.reading.fire;
				this._ctx = {
					table: e,
					index: t.index,
					isPrimKey: !t.index || e.schema.primKey.keyPath && t.index === e.schema.primKey.name,
					range: n,
					keysOnly: !1,
					dir: "next",
					unique: "",
					algorithm: null,
					filter: null,
					replayFilter: null,
					justLimit: !0,
					isMatch: null,
					offset: 0,
					limit: 1 / 0,
					error: r,
					or: t.or,
					valueMapper: i !== ve ? i : null
				};
			})), this.Table = (r = this, Kt(Ot.prototype, function(e, t, n) {
				this.db = r, this._tx = n, this.name = e, this.schema = t, this.hook = r._allTables[e] ? r._allTables[e].hook : Pt(null, {
					creating: [ge, g],
					reading: [me, ve],
					updating: [_e, g],
					deleting: [we, g]
				});
			})), this.Transaction = (a = this, Kt(Yt.prototype, function(e, t, n, r, i) {
				var o = this;
				"readonly" !== e && t.forEach(function(e) {
					e = null == (e = n[e]) ? void 0 : e.yProps;
					e && (t = t.concat(e.map(function(e) {
						return e.updatesTable;
					})));
				}), this.db = a, this.mode = e, this.storeNames = t, this.schema = n, this.chromeTransactionDurability = r, this.idbtrans = null, this.on = Pt(this, "complete", "error", "abort"), this.parent = i || null, this.active = !0, this._reculock = 0, this._blockedFuncs = [], this._resolve = null, this._reject = null, this._waitingFor = null, this._waitingQueue = null, this._spinCount = 0, this._completion = new K(function(e, t) {
					o._resolve = e, o._reject = t;
				}), this._completion.then(function() {
					o.active = !1, o.on.complete.fire();
				}, function(e) {
					var t = o.active;
					return o.active = !1, o.on.error.fire(e), o.parent ? o.parent._reject(e) : t && o.idbtrans && o.idbtrans.abort(), S(e);
				});
			})), this.Version = (n = this, Kt(mn.prototype, function(e) {
				this.db = n, this._cfg = {
					version: e,
					storesSource: null,
					dbschema: {},
					tables: {},
					contentUpgrade: null
				};
			})), this.WhereClause = (i = this, Kt(Lt.prototype, function(e, t, n) {
				if (this.db = i, this._ctx = {
					table: e,
					index: ":id" === t ? null : t,
					or: n
				}, this._cmp = this._ascending = j, this._descending = function(e, t) {
					return j(t, e);
				}, this._max = function(e, t) {
					return 0 < j(e, t) ? e : t;
				}, this._min = function(e, t) {
					return j(e, t) < 0 ? e : t;
				}, this._IDBKeyRange = i._deps.IDBKeyRange, !this._IDBKeyRange) throw new k.MissingAPI();
			})), this.on("versionchange", function(e) {
				0 < e.newVersion ? console.warn("Another connection wants to upgrade database '".concat(u.name, "'. Closing db now to resume the upgrade.")) : console.warn("Another connection wants to delete database '".concat(u.name, "'. Closing db now to resume the delete request.")), u.close({ disableAutoOpen: !1 });
			}), this.on("blocked", function(e) {
				!e.newVersion || e.newVersion < e.oldVersion ? console.warn("Dexie.delete('".concat(u.name, "') was blocked")) : console.warn("Upgrade '".concat(u.name, "' blocked by other connection holding version ").concat(e.oldVersion / 10));
			}), this._maxKey = Xt(t.IDBKeyRange), this._createTransaction = function(e, t, n, r) {
				return new u.Transaction(e, t, n, u._options.chromeTransactionDurability, r);
			}, this._fireOnBlocked = function(t) {
				u.on("blocked").fire(t), gn.toArray().filter(function(e) {
					return e.name === u.name && e !== u && !e._state.vcFired;
				}).map(function(e) {
					return e.on("versionchange").fire(t);
				});
			}, this.use(Yn), this.use(nr), this.use(Gn), this.use(Ln), this.use(Vn), new Proxy(this, { get: function(e, t, n) {
				var r;
				return "_vip" === t || ("table" === t ? function(e) {
					return rr(u.table(e), l);
				} : (r = Reflect.get(e, t, n)) instanceof Ot ? rr(r, l) : "tables" === t ? r.map(function(e) {
					return rr(e, l);
				}) : "_createTransaction" === t ? function() {
					return rr(r.apply(this, arguments), l);
				} : r);
			} }));
			this.vip = l, s.forEach(function(e) {
				return e(u);
			});
		}
		var ir, Se = "undefined" != typeof Symbol && "observable" in Symbol ? Symbol.observable : "@@observable", or = (ar.prototype.subscribe = function(e, t, n) {
			return this._subscribe(e && "function" != typeof e ? e : {
				next: e,
				error: t,
				complete: n
			});
		}, ar.prototype[Se] = function() {
			return this;
		}, ar);
		function ar(e) {
			this._subscribe = e;
		}
		try {
			ir = {
				indexedDB: f.indexedDB || f.mozIndexedDB || f.webkitIndexedDB || f.msIndexedDB,
				IDBKeyRange: f.IDBKeyRange || f.webkitIDBKeyRange
			};
		} catch (e) {
			ir = {
				indexedDB: null,
				IDBKeyRange: null
			};
		}
		function ur(d) {
			var p, y = !1, e = new or(function(r) {
				var i = ue(d);
				var o, a = !1, u = {}, s = {}, e = {
					get closed() {
						return a;
					},
					unsubscribe: function() {
						a || (a = !0, o && o.abort(), c && Wt.storagemutated.unsubscribe(h));
					}
				}, c = (r.start && r.start(e), !1), l = function() {
					return st(t);
				};
				function f() {
					return Cn(s, u);
				}
				var h = function(e) {
					jn(u, e), f() && l();
				}, t = function() {
					var t, n, e;
					!a && ir.indexedDB && (u = {}, t = {}, o && o.abort(), o = new AbortController(), e = ((e) => {
						var t = $e();
						try {
							i && nt();
							var n = v(d, e);
							return n = i ? n.finally(w) : n;
						} finally {
							t && Qe();
						}
					})(n = {
						subscr: t,
						signal: o.signal,
						requery: l,
						querier: d,
						trans: null
					}), c || (Wt.storagemutated.subscribe(h), c = !0), Promise.resolve(e).then(function(e) {
						y = !0, p = e, a || n.signal.aborted || (f() || (s = t, f()) ? l() : (u = {}, st(function() {
							return !a && r.next && r.next(e);
						})));
					}, function(e) {
						y = !1, ["DatabaseClosedError", "AbortError"].includes(null == e ? void 0 : e.name) || a || st(function() {
							a || r.error && r.error(e);
						});
					}));
				};
				return setTimeout(l, 0), e;
			});
			return e.hasValue = function() {
				return y;
			}, e.getValue = function() {
				return p;
			}, e;
		}
		var sr = y;
		function cr(e) {
			var t = fr;
			try {
				fr = !0, Wt.storagemutated.fire(e), Bn(e, !0);
			} finally {
				fr = t;
			}
		}
		M(sr, _(_({}, e), {
			delete: function(e) {
				return new sr(e, { addons: [] }).delete();
			},
			exists: function(e) {
				return new sr(e, { addons: [] }).open().then(function(e) {
					return e.close(), !0;
				}).catch("NoSuchDatabaseError", function() {
					return !1;
				});
			},
			getDatabaseNames: function(e) {
				try {
					return t = sr.dependencies, n = t.indexedDB, t = t.IDBKeyRange, (_n(n) ? Promise.resolve(n.databases()).then(function(e) {
						return e.map(function(e) {
							return e.name;
						}).filter(function(e) {
							return e !== ft;
						});
					}) : wn(n, t).toCollection().primaryKeys()).then(e);
				} catch (e) {
					return S(new k.MissingAPI());
				}
				var t, n;
			},
			defineClass: function() {
				return function(e) {
					a(this, e);
				};
			},
			ignoreTransaction: function(e) {
				return P.trans ? at(P.transless || s, e) : e();
			},
			vip: xn,
			async: function(t) {
				return function() {
					try {
						var e = Nn(t.apply(this, arguments));
						return e && "function" == typeof e.then ? e : K.resolve(e);
					} catch (e) {
						return S(e);
					}
				};
			},
			spawn: function(e, t, n) {
				try {
					var r = Nn(e.apply(n, t || []));
					return r && "function" == typeof r.then ? r : K.resolve(r);
				} catch (e) {
					return S(e);
				}
			},
			currentTransaction: { get: function() {
				return P.trans || null;
			} },
			waitFor: function(e, t) {
				e = K.resolve("function" == typeof e ? sr.ignoreTransaction(e) : e).timeout(t || 6e4);
				return P.trans ? P.trans.waitFor(e) : e;
			},
			Promise: K,
			debug: {
				get: function() {
					return l;
				},
				set: function(e) {
					Oe(e);
				}
			},
			derive: U,
			extend: a,
			props: M,
			override: Y,
			Events: Pt,
			on: Wt,
			liveQuery: ur,
			extendObservabilitySet: jn,
			getByKeyPath: c,
			setByKeyPath: b,
			delByKeyPath: function(t, e) {
				"string" == typeof e ? b(t, e, void 0) : "length" in e && [].map.call(e, function(e) {
					b(t, e, void 0);
				});
			},
			shallowClone: G,
			deepClone: ee,
			getObjectDiff: Un,
			cmp: j,
			asap: Q,
			minKey: -1 / 0,
			addons: [],
			connections: { get: gn.toArray },
			errnames: de,
			dependencies: ir,
			cache: Tn,
			semVer: "4.4.5",
			version: "4.4.5".split(".").map(function(e) {
				return parseInt(e);
			}).reduce(function(e, t, n) {
				return e + t / Math.pow(10, 2 * n);
			})
		})), sr.maxKey = Xt(sr.dependencies.IDBKeyRange), "undefined" != typeof dispatchEvent && "undefined" != typeof addEventListener && (Wt(zt, function(e) {
			fr || (e = new CustomEvent(Vt, { detail: e }), fr = !0, dispatchEvent(e), fr = !1);
		}), addEventListener(Vt, function(e) {
			e = e.detail;
			fr || cr(e);
		}));
		var lr, fr = !1, hr = function() {};
		return "undefined" != typeof BroadcastChannel && ((hr = function() {
			(lr = new BroadcastChannel(Vt)).onmessage = function(e) {
				return e.data && cr(e.data);
			};
		})(), "function" == typeof lr.unref && lr.unref(), Wt(zt, function(e) {
			fr || lr.postMessage(e);
		})), "undefined" != typeof addEventListener && (addEventListener("pagehide", function(e) {
			if (!y.disableBfCache && e.persisted) {
				l && console.debug("Dexie: handling persisted pagehide"), lr?.close();
				for (var t = 0, n = gn.toArray(); t < n.length; t++) n[t].close({ disableAutoOpen: !1 });
			}
		}), addEventListener("pageshow", function(e) {
			!y.disableBfCache && e.persisted && (l && console.debug("Dexie: handling persisted pageshow"), hr(), cr({ all: new q(-1 / 0, [[]]) }));
		})), K.rejectionMapper = function(e, t) {
			return !e || e instanceof ce || e instanceof TypeError || e instanceof SyntaxError || !e.name || !ye[e.name] ? e : (t = new ye[e.name](t || e.message, e), "stack" in e && u(t, "stack", { get: function() {
				return this.inner.stack;
			} }), t);
		}, Oe(l), _(y, Object.freeze({
			__proto__: null,
			DEFAULT_MAX_CONNECTIONS: 1e3,
			Dexie: y,
			Entity: mt,
			PropModification: _t,
			RangeSet: q,
			add: function(e) {
				return new _t({ add: e });
			},
			cmp: j,
			default: y,
			liveQuery: ur,
			mergeRanges: Pn,
			rangesOverlap: Kn,
			remove: function(e) {
				return new _t({ remove: e });
			},
			replacePrefix: function(e, t) {
				return new _t({ replacePrefix: [e, t] });
			}
		}), { default: y }), y;
	});
})))(), 1);
var DexieSymbol = Symbol.for("Dexie");
var Dexie = globalThis[DexieSymbol] || (globalThis[DexieSymbol] = import_dexie_min.default);
if (import_dexie_min.default.semVer !== Dexie.semVer) throw new Error(`Two different versions of Dexie loaded in the same app: ${import_dexie_min.default.semVer} and ${Dexie.semVer}`);
var { liveQuery, mergeRanges, rangesOverlap, RangeSet, cmp, Entity, PropModification, replacePrefix, add, remove, DexieYProvider } = Dexie;
//#endregion
//#region src/storage/database.ts
var NodeCanvasDatabase = class extends Dexie {
	projects;
	assets;
	runs;
	constructor(name = "gpt-node-canvas") {
		super(name);
		this.version(1).stores({
			projects: "id, updatedAt, name",
			assets: "id, createdAt",
			runs: "id, [projectId+taskId], startedAt"
		});
	}
};
//#endregion
//#region src/storage/project-repository.ts
var newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
var ProjectRepository = class {
	database;
	constructor(database) {
		this.database = database;
	}
	async createProject(name) {
		const now = Date.now();
		const project = {
			id: newId("project"),
			name: name.trim() || "未命名画布",
			graph: {
				nodes: [],
				edges: []
			},
			createdAt: now,
			updatedAt: now
		};
		await this.database.projects.add(project);
		return structuredClone(project);
	}
	async listProjects() {
		return this.database.projects.orderBy("updatedAt").reverse().toArray();
	}
	async loadProject(id) {
		return this.database.projects.get(id);
	}
	async saveProject(project) {
		await this.database.projects.put({
			...structuredClone(project),
			updatedAt: project.updatedAt
		});
	}
	async mutateProject(projectId, update) {
		return this.database.transaction("rw", this.database.projects, this.database.assets, async () => {
			const current = await this.database.projects.get(projectId);
			if (!current) throw new Error("找不到画布项目");
			const updated = {
				...await update(structuredClone(current)),
				updatedAt: Date.now()
			};
			await this.database.projects.put(structuredClone(updated));
			return structuredClone(updated);
		});
	}
	async mutateGenerationState(projectId, update) {
		return this.database.transaction("rw", this.database.projects, this.database.assets, this.database.runs, async () => {
			const current = await this.database.projects.get(projectId);
			if (!current) throw new Error("找不到画布项目");
			const updated = {
				...await update(structuredClone(current)),
				updatedAt: Date.now()
			};
			await this.database.projects.put(structuredClone(updated));
			return structuredClone(updated);
		});
	}
	async renameProject(projectId, name) {
		return this.mutateProject(projectId, (project) => ({
			...project,
			name: name.trim() || project.name
		}));
	}
	async saveAsset(blob) {
		const id = newId("asset");
		await this.database.assets.add({
			id,
			blob,
			createdAt: Date.now()
		});
		return id;
	}
	async loadAsset(id) {
		return (await this.database.assets.get(id))?.blob;
	}
	async deleteLocalTask(projectId, taskId) {
		return this.database.transaction("rw", this.database.projects, this.database.runs, async () => {
			const project = await this.database.projects.get(projectId);
			if (!project) throw new Error("找不到画布项目");
			const task = project.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
			if (!task) throw new Error("找不到任务节点");
			project.graph = {
				nodes: project.graph.nodes.filter((node) => node.id !== taskId),
				edges: project.graph.edges.filter((edge) => edge.source !== taskId && edge.target !== taskId)
			};
			project.updatedAt = Date.now();
			await this.database.projects.put(project);
			await this.database.runs.where("[projectId+taskId]").equals([projectId, taskId]).delete();
			return {
				conversationUrl: task.conversationUrl,
				onlineConversationDeleted: false
			};
		});
	}
};
//#endregion
//#region src/background/keyed-serial-queue.ts
var KeyedSerialQueue = class {
	tails = /* @__PURE__ */ new Map();
	run(key, work) {
		const current = (this.tails.get(key) ?? Promise.resolve()).catch(() => void 0).then(work);
		const settled = current.then(() => void 0, () => void 0);
		this.tails.set(key, settled);
		settled.then(() => {
			if (this.tails.get(key) === settled) this.tails.delete(key);
		});
		return current;
	}
};
//#endregion
//#region src/background/binary.ts
function decodeBase64(base64, mimeType) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return new Blob([bytes], { type: mimeType });
}
function bytesToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 32768;
	for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
	return btoa(binary);
}
function base64ToBytes(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}
async function sha256Hex(buffer) {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region src/background/protocol.ts
var taskTypes = /* @__PURE__ */ new Set([
	"RUN_TASK",
	"RUN_TASKS",
	"RECOVER_TEAM_RESULT",
	"CANCEL_TASK",
	"OPEN_TASK_TAB",
	"CLOSE_TASK_TAB",
	"HIBERNATE_TASK_TABS",
	"TASK_STATUS",
	"TASK_RESULT",
	"TASK_ERROR",
	"DOWNLOAD_ASSET",
	"SHOW_NOTIFICATION",
	"CHECK_CHATGPT_ADAPTER",
	"RESUME_CHATGPT_RESULT",
	"EXECUTE_IN_CHATGPT",
	"EXECUTE_IN_CHATGPT_V2",
	"EXECUTE_IN_CHATGPT_V3"
]);
var taskStatuses = /* @__PURE__ */ new Set([
	"idle",
	"queued",
	"waiting_page",
	"uploading",
	"sending",
	"generating",
	"completed",
	"failed",
	"manual_action"
]);
var isGenerationImage = (value) => {
	if (!value || typeof value !== "object") return false;
	const image = value;
	return typeof image.base64 === "string" && (image.mimeType === void 0 || typeof image.mimeType === "string") && (image.name === void 0 || typeof image.name === "string");
};
function isExtensionMessage(value) {
	if (!value || typeof value !== "object") return false;
	const message = value;
	if (message.type === "HIBERNATE_TASK_TABS") return typeof message.projectId === "string" && Array.isArray(message.taskIds) && message.taskIds.every((taskId) => typeof taskId === "string");
	if (message.type === "RUN_TASKS") return typeof message.projectId === "string" && Array.isArray(message.taskIds) && message.taskIds.length > 0 && message.taskIds.every((taskId) => typeof taskId === "string");
	if (message.type === "DOWNLOAD_ASSET") return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.assetId === "string";
	if (message.type === "SHOW_NOTIFICATION") return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.title === "string" && typeof message.message === "string";
	if (message.type === "TASK_RESULT") return typeof message.projectId === "string" && typeof message.taskId === "string" && Array.isArray(message.images) && message.images.every(isGenerationImage);
	if (message.type === "TASK_STATUS") return typeof message.projectId === "string" && typeof message.taskId === "string" && taskStatuses.has(message.status);
	if (message.type === "TASK_ERROR") return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.reason === "string";
	return typeof message.type === "string" && taskTypes.has(message.type) && typeof message.projectId === "string" && typeof message.taskId === "string";
}
//#endregion
//#region src/background/chatgpt-url.ts
var safeChatGptUrl = (url) => url?.startsWith("https://chatgpt.com/") ? url : "https://chatgpt.com/";
var comparableChatGptUrl = (url) => {
	const parsed = new URL(safeChatGptUrl(url));
	const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
	return `${parsed.origin}${pathname}`;
};
var expectedChatGptConversationMatches = (actualUrl, expectedUrl) => actualUrl?.startsWith("https://chatgpt.com/") === true && comparableChatGptUrl(actualUrl) === comparableChatGptUrl(expectedUrl);
function concreteChatGptConversationUrl(url) {
	if (!url?.startsWith("https://chatgpt.com/")) return void 0;
	try {
		const parsed = new URL(url);
		return /^\/c\/[^/]+\/?$/.test(parsed.pathname) ? `${parsed.origin}${parsed.pathname}` : void 0;
	} catch {
		return;
	}
}
function resolveTaskConversationUrl(message, senderUrl) {
	if (message.type === "TASK_ERROR" && message.reason === "conversation_unavailable") return void 0;
	return concreteChatGptConversationUrl(message.conversationUrl) ?? concreteChatGptConversationUrl(senderUrl) ?? (senderUrl?.startsWith("https://chatgpt.com/") ? senderUrl : message.conversationUrl);
}
//#endregion
//#region src/background/chatgpt-adapter-bridge.ts
var isCurrentAdapter = (value) => Boolean(value && typeof value === "object" && value.adapterVersion === 28);
async function probeAdapter(tabs, tabId, message) {
	try {
		const state = await tabs.sendMessage(tabId, {
			type: "CHECK_CHATGPT_ADAPTER",
			projectId: message.projectId,
			taskId: message.taskId
		});
		return isCurrentAdapter(state) ? state : void 0;
	} catch {
		return;
	}
}
async function sendWithCurrentChatGptAdapter(tabs, scripting, tabId, message) {
	if (!await probeAdapter(tabs, tabId, message)) {
		await scripting.executeScript({
			target: { tabId },
			files: ["contentScript.js"]
		});
		if (!await probeAdapter(tabs, tabId, message)) throw new Error("ChatGPT 页面脚本重新连接失败，请刷新该标签页后重试");
	}
	return tabs.sendMessage(tabId, {
		...message,
		type: "EXECUTE_IN_CHATGPT_V3"
	});
}
//#endregion
//#region src/background/task-tab-grouper.ts
var TASK_TAB_GROUP_TITLE = "GPT 节点任务";
var TaskTabGrouper = class {
	windowWrites = new KeyedSerialQueue();
	tabs;
	tabGroups;
	constructor(tabs, tabGroups) {
		this.tabs = tabs;
		this.tabGroups = tabGroups;
	}
	async group(tabId) {
		const tab = await this.tabs.get(tabId);
		await this.windowWrites.run(String(tab.windowId), async () => {
			const existing = (await this.tabGroups.query({
				windowId: tab.windowId,
				title: TASK_TAB_GROUP_TITLE
			}))[0];
			const groupId = await this.tabs.group(existing ? {
				groupId: existing.id,
				tabIds: tabId
			} : { tabIds: tabId });
			await this.tabGroups.update(groupId, {
				title: TASK_TAB_GROUP_TITLE,
				color: "blue",
				collapsed: false
			});
		});
	}
	async managedTabs() {
		const groups = await this.tabGroups.query({ title: TASK_TAB_GROUP_TITLE });
		return (await Promise.all(groups.map((group) => this.tabs.query({ groupId: group.id })))).flat();
	}
};
//#endregion
//#region src/background/tab-registry.ts
var ConversationUnavailableError = class extends Error {
	constructor() {
		super("保存的 ChatGPT 对话已失效，或标签页已切换到其他对话");
		this.name = "ConversationUnavailableError";
	}
};
var TabRegistry = class {
	taskTabs = /* @__PURE__ */ new Map();
	tabs;
	grouping;
	constructor(tabs, grouping) {
		this.tabs = tabs;
		this.grouping = grouping;
	}
	async groupTab(tabId) {
		try {
			await this.grouping?.group?.(tabId);
		} catch {}
	}
	map(taskId, tabId, conversationUrl) {
		this.taskTabs.set(taskId, {
			tabId,
			conversationUrl: safeChatGptUrl(conversationUrl)
		});
	}
	async restoreProject(tasks) {
		for (const task of tasks) this.taskTabs.set(task.taskId, { conversationUrl: task.conversationUrl });
	}
	async ensure(taskId, conversationUrl) {
		const mapped = this.taskTabs.get(taskId);
		const expectedUrl = safeChatGptUrl(conversationUrl ?? mapped?.conversationUrl);
		if (mapped?.tabId !== void 0) try {
			const tab = await this.tabs.get(mapped.tabId);
			const liveConversationUrl = concreteChatGptConversationUrl(tab.url);
			if (tab.id !== void 0 && expectedUrl === "https://chatgpt.com/" && liveConversationUrl) {
				this.taskTabs.set(taskId, {
					tabId: tab.id,
					conversationUrl: liveConversationUrl
				});
				await this.groupTab(tab.id);
				return {
					tabId: tab.id,
					conversationUrl: liveConversationUrl
				};
			}
			if (tab.id !== void 0 && expectedChatGptConversationMatches(tab.url, expectedUrl)) {
				await this.groupTab(tab.id);
				return {
					tabId: tab.id,
					conversationUrl: tab.url ?? mapped.conversationUrl
				};
			}
			if (tab.id !== void 0) throw new ConversationUnavailableError();
		} catch (error) {
			if (error instanceof ConversationUnavailableError) throw error;
			this.taskTabs.set(taskId, { conversationUrl: mapped.conversationUrl });
		}
		if (this.tabs.query && expectedUrl !== "https://chatgpt.com/") try {
			const claimedTabIds = new Set([...this.taskTabs.values()].flatMap((entry) => entry.tabId === void 0 ? [] : [entry.tabId]));
			const existing = (await this.tabs.query({ url: ["https://chatgpt.com/*"] })).find((candidate) => candidate.id !== void 0 && !claimedTabIds.has(candidate.id) && expectedChatGptConversationMatches(candidate.url, expectedUrl));
			if (existing?.id !== void 0) {
				this.taskTabs.set(taskId, {
					tabId: existing.id,
					conversationUrl: existing.url ?? expectedUrl
				});
				await this.groupTab(existing.id);
				return {
					tabId: existing.id,
					conversationUrl: existing.url ?? expectedUrl
				};
			}
		} catch {}
		const tab = await this.tabs.create({
			url: expectedUrl,
			active: false
		});
		if (tab.id === void 0) throw new Error("浏览器没有返回新标签页编号");
		this.taskTabs.set(taskId, {
			tabId: tab.id,
			conversationUrl: tab.url ?? expectedUrl
		});
		await this.groupTab(tab.id);
		return {
			tabId: tab.id,
			conversationUrl: tab.url ?? expectedUrl
		};
	}
	async assertExpected(tabId, conversationUrl) {
		const tab = await this.tabs.get(tabId);
		if (tab.id !== tabId || !expectedChatGptConversationMatches(tab.url, conversationUrl)) throw new ConversationUnavailableError();
	}
	async open(taskId, conversationUrl) {
		let mapped;
		try {
			mapped = await this.ensure(taskId, conversationUrl);
		} catch (error) {
			if (!(error instanceof ConversationUnavailableError)) throw error;
			const previous = this.taskTabs.get(taskId);
			this.taskTabs.set(taskId, { conversationUrl: conversationUrl ?? previous?.conversationUrl ?? "https://chatgpt.com/" });
			mapped = await this.ensure(taskId, conversationUrl ?? previous?.conversationUrl);
		}
		await this.tabs.update(mapped.tabId, { active: true });
		return mapped;
	}
	updateConversation(taskId, conversationUrl) {
		const mapped = this.taskTabs.get(taskId) ?? { conversationUrl: "https://chatgpt.com/" };
		this.taskTabs.set(taskId, {
			...mapped,
			conversationUrl: safeChatGptUrl(conversationUrl)
		});
	}
	ownsTab(taskId, tabId) {
		return tabId !== void 0 && this.taskTabs.get(taskId)?.tabId === tabId;
	}
	taskForTab(tabId) {
		for (const [taskId, entry] of this.taskTabs) if (entry.tabId === tabId) return taskId;
	}
	async close(taskId) {
		const mapped = this.taskTabs.get(taskId);
		this.taskTabs.delete(taskId);
		if (mapped?.tabId !== void 0) await this.tabs.remove(mapped.tabId);
	}
	async hibernate(taskId) {
		const mapped = this.taskTabs.get(taskId);
		if (!mapped || mapped.tabId === void 0) return false;
		this.taskTabs.set(taskId, { conversationUrl: mapped.conversationUrl });
		try {
			await this.tabs.remove(mapped.tabId);
			return true;
		} catch {
			return false;
		}
	}
	async hibernateMany(taskIds) {
		let released = 0;
		for (const taskId of taskIds) if (await this.hibernate(taskId)) released += 1;
		return released;
	}
	pruneMappings(activeTaskIds) {
		for (const taskId of this.taskTabs.keys()) if (!activeTaskIds.has(taskId)) this.taskTabs.delete(taskId);
	}
	async closeOrphanedManagedTabs() {
		const managedTabs = await this.grouping?.managedTabs?.() ?? [];
		const protectedTabIds = new Set([...this.taskTabs.values()].flatMap((entry) => entry.tabId === void 0 ? [] : [entry.tabId]));
		const orphanIds = managedTabs.flatMap((tab) => tab.id !== void 0 && !protectedTabIds.has(tab.id) ? [tab.id] : []);
		if (orphanIds.length) await this.tabs.remove(orphanIds);
		return orphanIds.length;
	}
};
//#endregion
//#region src/background/api-worker-client.ts
var API_WORKER_URL = "http://127.0.0.1:43129";
async function apiWorkerRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_WORKER_URL}${path}`, options);
	} catch {
		throw new Error("本机 API 任务服务未启动，请运行 api-worker/install.sh");
	}
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(payload.error || `本机 API 任务服务返回 HTTP ${response.status}`);
	return payload;
}
async function waitForApiWorkerJob(jobId) {
	while (true) {
		const job = await apiWorkerRequest(`/jobs/${jobId}`);
		if (job.status === "completed") return job.images || [];
		if (job.status === "failed") throw new Error(job.error || "API 生图失败");
		await new Promise((resolve) => setTimeout(resolve, 2e3));
	}
}
//#endregion
//#region src/team-settings.ts
var DEFAULT_TEAM_RELAY_URL = "https://pixel-flow-codex-relay.pixel-flow-codex-relay.workers.dev";
//#endregion
//#region src/background/team-gateway-http.ts
async function teamGatewaySettings() {
	const values = await chrome.storage.local.get("pixelFlowTeamMemberToken");
	const memberToken = typeof values.pixelFlowTeamMemberToken === "string" ? values.pixelFlowTeamMemberToken.trim() : "";
	if (!/^pfm_[A-Za-z0-9_-]{32,64}$/.test(memberToken)) throw new Error("请先在“生图设置”中保存成员令牌");
	return {
		baseUrl: DEFAULT_TEAM_RELAY_URL,
		memberToken
	};
}
function gatewayErrorMessage(payload) {
	return typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message || "";
}
async function teamGatewayRequest(path, options = {}) {
	const { baseUrl, memberToken } = await teamGatewaySettings();
	for (let attempt = 0; attempt < 7; attempt += 1) {
		let response;
		try {
			response = await fetch(`${baseUrl}/team${path}`, {
				...options,
				headers: {
					"X-Pixel-Member-Token": memberToken,
					...options.headers || {}
				}
			});
		} catch {
			if (attempt < 6) {
				await new Promise((resolve) => setTimeout(resolve, Math.min(3e4, 1e3 * 2 ** attempt)));
				continue;
			}
			throw new Error("无法连接团队生图服务，请检查网络和服务状态");
		}
		const payload = await response.json().catch(() => ({}));
		if (response.ok) return payload;
		const payloadMessage = gatewayErrorMessage(payload);
		if (response.status === 429 && /额度/.test(payloadMessage)) throw new Error(payloadMessage);
		if (response.status === 401) throw new Error(payloadMessage || "成员令牌无效、已停用或已重置");
		if ((response.status === 429 || [
			502,
			503,
			504,
			522,
			524
		].includes(response.status)) && attempt < 6) {
			const retryAfterSeconds = Number(response.headers.get("Retry-After"));
			const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1e3 : Math.min(3e4, 2e3 * 2 ** attempt);
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
			continue;
		}
		throw new Error(payloadMessage || (response.status === 429 ? "团队生图服务请求过于频繁，自动重试后仍被限流，请稍后再试" : `团队生图网关返回 HTTP ${response.status}`));
	}
	throw new Error("团队生图服务请求失败");
}
async function cancelTeamGatewayJob(jobId) {
	for (let attempt = 0; attempt < 3; attempt += 1) try {
		return await teamGatewayRequest(`/jobs/${jobId}/cancel`, { method: "POST" });
	} catch (error) {
		if ((error instanceof Error ? error.message : String(error)) !== "无法连接团队生图服务，请检查网络和服务状态" || attempt === 2) throw error;
		await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
	}
}
async function teamGatewayResultRequest(path) {
	const { baseUrl, memberToken } = await teamGatewaySettings();
	let response;
	try {
		response = await fetch(`${baseUrl}/team${path}`, {
			cache: "no-store",
			headers: { "X-Pixel-Member-Token": memberToken }
		});
	} catch {
		throw new Error("无法通过团队任务箱下载结果");
	}
	if (!response.ok) {
		const error = /* @__PURE__ */ new Error(`团队任务箱结果代理返回 HTTP ${response.status}`);
		error.status = response.status;
		throw error;
	}
	return response;
}
//#endregion
//#region src/background/generation-projector.ts
var makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
var findNode = (graph, id) => {
	const node = graph.nodes.find((candidate) => candidate.id === id);
	if (!node) throw new Error(`找不到节点：${id}`);
	return node;
};
var findTask = (graph, id) => {
	const node = findNode(graph, id);
	if (node.kind !== "task") throw new Error(`节点不是任务：${id}`);
	return node;
};
function getTaskInputs(graph, taskId) {
	const task = findTask(graph, taskId);
	let imageIndex = 0;
	let textIndex = 0;
	const inputs = [];
	for (const edgeId of task.inputEdgeOrder) {
		const edge = graph.edges.find((candidate) => candidate.id === edgeId && (candidate.target === taskId || candidate.target === task.batchParentTaskId));
		if (!edge) continue;
		const node = findNode(graph, edge.source);
		if (node.kind === "task" || node.kind === "text_result") continue;
		if (node.kind === "text") {
			textIndex += 1;
			inputs.push({
				edgeId,
				node,
				label: `文字${textIndex}`
			});
		} else {
			imageIndex += 1;
			inputs.push({
				edgeId,
				node,
				label: `图片${imageIndex}`
			});
		}
	}
	return inputs;
}
function appendResult(graph, taskId, imageAssetId) {
	const task = findTask(graph, taskId);
	const owner = task.batchParentTaskId ? findTask(graph, task.batchParentTaskId) : task;
	const existingResults = graph.edges.filter((edge) => edge.source === owner.id && edge.kind === "output").length;
	const resultId = makeId("result");
	return {
		...graph,
		nodes: [...graph.nodes, {
			id: resultId,
			kind: "result",
			assetId: imageAssetId,
			taskId: owner.id,
			title: `生成结果${existingResults + 1}`,
			position: {
				x: owner.position.x + 560 + existingResults * 360,
				y: owner.position.y
			}
		}],
		edges: [...graph.edges, {
			id: makeId("edge"),
			source: owner.id,
			target: resultId,
			kind: "output"
		}]
	};
}
function updateTask(project, taskId, update) {
	return {
		...project,
		graph: {
			...project.graph,
			nodes: project.graph.nodes.map((node) => node.id === taskId && node.kind === "task" ? update(node) : node)
		},
		updatedAt: Date.now()
	};
}
function updateBatchParent(project, childTaskId, status, detail) {
	const child = project.graph.nodes.find((node) => node.id === childTaskId && node.kind === "task");
	if (!child?.batchParentTaskId) return project;
	return updateTask(project, child.batchParentTaskId, (parent) => {
		const items = (parent.batchItems || []).map((item) => item.taskId === childTaskId ? {
			...item,
			status,
			detail
		} : item);
		const running = items.some((item) => [
			"queued",
			"waiting_page",
			"uploading",
			"sending",
			"generating"
		].includes(item.status));
		const failed = items.filter((item) => ["failed", "manual_action"].includes(item.status)).length;
		const completed = items.filter((item) => item.status === "completed").length;
		const parentStatus = running ? "generating" : failed ? "failed" : "completed";
		return {
			...parent,
			batchItems: items,
			status: parentStatus,
			statusDetail: failed ? `${completed}/${items.length} 完成，${failed} 项失败` : void 0,
			runCount: parentStatus === "completed" ? parent.runCount + 1 : parent.runCount
		};
	});
}
function appendTextResult(graph, taskId, text) {
	const task = graph.nodes.find((node) => node.id === taskId && node.kind === "task");
	if (!task) return graph;
	const outputCount = graph.edges.filter((edge) => edge.source === taskId && edge.kind === "output").length;
	const textResultCount = graph.nodes.filter((node) => node.kind === "text_result" && node.taskId === taskId).length;
	const id = makeId("text-result");
	return {
		...graph,
		nodes: [...graph.nodes, {
			id,
			kind: "text_result",
			taskId,
			title: `文字结果 ${textResultCount + 1}`,
			text,
			position: {
				x: task.position.x + 560,
				y: task.position.y + outputCount * 260
			}
		}],
		edges: [...graph.edges, {
			id: makeId("edge"),
			source: taskId,
			target: id,
			kind: "output"
		}]
	};
}
async function applyTaskMessage(project, message, saveAsset, run) {
	if (message.projectId !== project.id) return project;
	const projection = projectRunToLegacyTask(run);
	if (message.type === "TASK_STATUS" || message.type === "TASK_ERROR") return updateBatchParent(updateTask(project, message.taskId, (task) => ({
		...task,
		...projection,
		conversationUrl: projection.conversationUrl ?? task.conversationUrl
	})), message.taskId, projection.status, projection.statusDetail);
	let graph = project.graph;
	for (const image of message.images) graph = appendResult(graph, message.taskId, await saveAsset(decodeBase64(image.base64, image.mimeType)));
	if (message.responseText?.trim()) graph = appendTextResult(graph, message.taskId, message.responseText);
	return updateBatchParent(updateTask({
		...project,
		graph,
		updatedAt: Date.now()
	}, message.taskId, (task) => ({
		...task,
		...projection,
		runCount: task.runCount + 1,
		conversationUrl: projection.conversationUrl ?? task.conversationUrl,
		lastResponseText: message.responseText
	})), message.taskId, projection.status, projection.statusDetail);
}
//#endregion
//#region src/background/service-worker.ts
var database = new NodeCanvasDatabase();
var projectRepository = new ProjectRepository(database);
var taskRunRepository = new TaskRunRepository(database.runs);
var tabRegistry = new TabRegistry(chrome.tabs, new TaskTabGrouper(chrome.tabs, chrome.tabGroups));
var projectWrites = new KeyedSerialQueue();
var schedulerWrites = new KeyedSerialQueue();
var activeTabWrites = new KeyedSerialQueue();
var queue = emptyQueue();
var pendingScopes = /* @__PURE__ */ new Map();
var browserTaskMessages = /* @__PURE__ */ new Map();
var resumedBrowserUrls = /* @__PURE__ */ new Map();
var browserRecoveryReloadedAt = /* @__PURE__ */ new Map();
var lastBrowserLaunchAt = 0;
var schedulerReady = chrome.storage.session.get([
	"schedulerState",
	"activeTaskTabs",
	"browserTaskMessages"
]).then(async ({ schedulerState, activeTaskTabs, browserTaskMessages: storedBrowserTaskMessages }) => {
	const restored = restoreQueueSnapshot(schedulerState);
	queue = restored.queue;
	for (const [key, projectId] of restored.pendingScopes) {
		const scope = parseTaskScopeKey(key) ?? {
			projectId,
			taskId: key
		};
		pendingScopes.set(key, scope);
	}
	if (Array.isArray(activeTaskTabs)) {
		for (const entry of activeTaskTabs) if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number") tabRegistry.map(entry[0], entry[1]);
	}
	if (Array.isArray(storedBrowserTaskMessages)) {
		for (const entry of storedBrowserTaskMessages) if (Array.isArray(entry) && typeof entry[0] === "string") browserTaskMessages.set(entry[0], recoveryMessage(entry[1]));
		await saveBrowserTaskMessages();
	}
	await reconcileTaskRunProjections();
	for (const project of await projectRepository.listProjects()) {
		const latestRuns = await taskRunRepository.latestByProject(project.id);
		for (const task of project.graph.nodes) {
			if (task.kind !== "task" || task.generationMode !== "browser") continue;
			const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
			if (!runtime.active || ![
				"sending",
				"submitted",
				"generating",
				"delivering"
			].includes(runtime.status)) continue;
			const conversationUrl = concreteChatGptConversationUrl(runtime.conversationUrl);
			if (!conversationUrl) continue;
			const key = createTaskScopeKey(project.id, task.id);
			const storedMessage = browserTaskMessages.get(key);
			browserTaskMessages.set(key, recoveryMessage({
				...storedMessage,
				type: "EXECUTE_IN_CHATGPT_V3",
				projectId: project.id,
				taskId: task.id,
				prompt: appendAspectRatioPrompt(task.prompt, task.aspectRatio ?? "auto"),
				images: [],
				expectedConversationUrl: conversationUrl,
				startedAt: latestRuns.get(task.id)?.startedAt ?? Date.now(),
				submittedAt: latestRuns.get(task.id)?.updatedAt ?? Date.now(),
				phase: "submitted"
			}));
			if (!queue.running.includes(key)) queue.running.push(key);
			pendingScopes.set(key, {
				projectId: project.id,
				taskId: task.id
			});
			tabRegistry.map(key, void 0, conversationUrl);
		}
	}
	await saveBrowserTaskMessages();
	await saveScheduler();
});
schedulerReady.then(() => {
	if (browserTaskMessages.size > 0) scheduleBrowserResultRecoveryAlarm();
});
async function saveBrowserTaskMessages() {
	await chrome.storage.session.set({ browserTaskMessages: [...browserTaskMessages] });
}
function recoveryMessage(message) {
	return {
		...message,
		images: []
	};
}
async function saveScheduler() {
	await chrome.storage.session.set({ schedulerState: createQueueSnapshot(queue, new Map([...pendingScopes].map(([key, scope]) => [key, scope.projectId]))) });
}
chrome.action.onClicked.addListener(() => {
	chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
async function waitForTabReady(tabId, timeoutMs = 3e4) {
	if ((await chrome.tabs.get(tabId)).status === "complete") return;
	await new Promise((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timer);
			chrome.tabs.onUpdated.removeListener(updated);
			chrome.tabs.onRemoved.removeListener(removed);
		};
		const updated = (changedId, info) => {
			if (changedId !== tabId || info.status !== "complete") return;
			cleanup();
			resolve();
		};
		const removed = (removedId) => {
			if (removedId !== tabId) return;
			cleanup();
			reject(/* @__PURE__ */ new Error("ChatGPT任务标签页在准备完成前被关闭"));
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(/* @__PURE__ */ new Error("等待ChatGPT任务标签页就绪超过30秒"));
		}, timeoutMs);
		chrome.tabs.onUpdated.addListener(updated);
		chrome.tabs.onRemoved.addListener(removed);
	});
}
async function broadcast(message) {
	try {
		await chrome.runtime.sendMessage(message);
	} catch {}
}
async function persistAndBroadcast(message) {
	let applied = false;
	await projectWrites.run(message.projectId, async () => {
		await projectRepository.mutateGenerationState(message.projectId, async (project) => {
			const task = project.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
			if (!task) return project;
			let run = await taskRunRepository.latest(message.projectId, message.taskId);
			if (!run) run = await taskRunRepository.start(message.projectId, message.taskId, task.generationMode === "api" ? "api" : task.generationMode === "team" ? "team" : task.generationMode === "team_web" ? "team_web" : "browser");
			const status = runEventStatus(message);
			if (!status || isDuplicateTerminalRunEvent(run.status, status)) return project;
			run = await taskRunRepository.advance(run.id, status, runEventPatch(message));
			applied = true;
			return applyTaskMessage(project, message, (blob) => projectRepository.saveAsset(blob), run);
		});
	});
	if (applied) await broadcast({
		...message,
		persisted: true
	});
}
async function reconcileTaskRunProjections() {
	for (const project of await projectRepository.listProjects()) {
		const latestRuns = await taskRunRepository.latestByProject(project.id);
		if (latestRuns.size === 0) continue;
		if (!project.graph.nodes.some((node) => {
			if (node.kind !== "task") return false;
			const run = latestRuns.get(node.id);
			if (!run) return false;
			const projection = projectRunToLegacyTask(run);
			return node.status !== projection.status || node.runtimeStatus !== projection.runtimeStatus || node.recoverableResult !== projection.recoverableResult || node.statusDetail !== projection.statusDetail || node.apiJobId !== projection.apiJobId || node.conversationUrl !== (projection.conversationUrl ?? node.conversationUrl);
		})) continue;
		await projectWrites.run(project.id, () => projectRepository.mutateProject(project.id, (current) => ({
			...current,
			graph: {
				...current.graph,
				nodes: current.graph.nodes.map((node) => {
					if (node.kind !== "task") return node;
					const run = latestRuns.get(node.id);
					if (!run) return node;
					const projection = projectRunToLegacyTask(run);
					return {
						...node,
						...projection,
						conversationUrl: projection.conversationUrl ?? node.conversationUrl
					};
				})
			}
		})));
	}
}
async function startTaskRun(projectId, taskId) {
	const task = (await projectRepository.loadProject(projectId))?.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
	if (!task) throw new Error("找不到本地任务");
	return taskRunRepository.start(projectId, taskId, task.generationMode === "api" ? "api" : task.generationMode === "team" ? "team" : task.generationMode === "team_web" ? "team_web" : "browser");
}
async function removeActiveScope(key) {
	await activeTabWrites.run("active-tabs", async () => {
		const state = await chrome.storage.session.get(["activeTaskScopes", "activeTaskTabs"]);
		const active = new Map(Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []);
		active.delete(key);
		const tabs = new Map(Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []);
		tabs.delete(key);
		await chrome.storage.session.set({
			activeTaskScopes: [...active],
			activeTaskTabs: [...tabs]
		});
	});
}
async function rememberActiveTab(key, tabId) {
	await activeTabWrites.run("active-tabs", async () => {
		const state = await chrome.storage.session.get("activeTaskTabs");
		const tabs = new Map(Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []);
		tabs.set(key, tabId);
		await chrome.storage.session.set({ activeTaskTabs: [...tabs] });
	});
}
var API_RECOVERY_ALARM = "pixel-flow-api-recovery";
var BROWSER_RESULT_RECOVERY_ALARM = "pixel-flow-browser-result-recovery";
var TEAM_WEB_WORKER_ALARM = "pixel-flow-team-web-worker";
var TEAM_WEB_PROJECT_ID = "pixel-flow-team-web-worker";
var TEAM_WEB_ACTIVE_STORAGE = "pixelFlowTeamWebWorkerActiveJob";
var TEAM_WEB_ACTIVE_JOBS_STORAGE = "pixelFlowTeamWebWorkerActiveJobs";
var TEAM_WEB_MAX_CONCURRENCY = 5;
var activeTeamWebJobs = /* @__PURE__ */ new Map();
var teamWebDeliveries = /* @__PURE__ */ new Map();
var teamResultDownloads = /* @__PURE__ */ new Map();
var teamWebTickPromise;
function singleFlight(map, key, run) {
	if (map.has(key)) return map.get(key);
	const pending = Promise.resolve().then(run);
	map.set(key, pending);
	pending.catch(() => {
		if (map.get(key) === pending) map.delete(key);
	});
	return pending;
}
var teamWebWorkerReady = Promise.all([schedulerReady, chrome.storage.local.get([TEAM_WEB_ACTIVE_STORAGE, TEAM_WEB_ACTIVE_JOBS_STORAGE])]).then(([, stored]) => {
	const restored = Array.isArray(stored[TEAM_WEB_ACTIVE_JOBS_STORAGE]) ? stored[TEAM_WEB_ACTIVE_JOBS_STORAGE] : stored[TEAM_WEB_ACTIVE_STORAGE] ? [stored[TEAM_WEB_ACTIVE_STORAGE]] : [];
	for (const active of restored.filter((item) => item?.job?.id)) {
		activeTeamWebJobs.set(active.job.id, active);
		const conversationUrl = concreteChatGptConversationUrl(active.conversationUrl);
		if (!conversationUrl) continue;
		const key = createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id);
		const message = recoveryMessage({
			type: "EXECUTE_IN_CHATGPT_V3",
			projectId: TEAM_WEB_PROJECT_ID,
			taskId: active.job.id,
			prompt: active.job.prompt,
			images: [],
			expectedConversationUrl: conversationUrl,
			startedAt: active.startedAt,
			submittedAt: active.submittedAt ?? active.startedAt,
			phase: "submitted"
		});
		browserTaskMessages.set(key, message);
		tabRegistry.map(key, void 0, conversationUrl);
	}
	if (activeTeamWebJobs.size) scheduleBrowserResultRecoveryAlarm();
});
teamWebWorkerReady.then(() => teamWebWorkerTick()).catch(() => void 0);
function scheduleApiRecoveryAlarm() {
	chrome.alarms.create(API_RECOVERY_ALARM, {
		delayInMinutes: .5,
		periodInMinutes: .5
	});
}
function scheduleBrowserResultRecoveryAlarm() {
	chrome.alarms.create(BROWSER_RESULT_RECOVERY_ALARM, {
		delayInMinutes: .5,
		periodInMinutes: .5
	});
}
function scheduleTeamWebWorkerAlarm() {
	chrome.alarms.create(TEAM_WEB_WORKER_ALARM, {
		delayInMinutes: .5,
		periodInMinutes: .5
	});
}
async function reconcileBrowserTaskResults() {
	await schedulerReady;
	if (browserTaskMessages.size === 0) {
		await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
		return;
	}
	for (const [key, message] of browserTaskMessages) {
		if (!queue.running.includes(key) && ![...activeTeamWebJobs.values()].some((active) => createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id) === key)) continue;
		try {
			const mapped = await tabRegistry.ensure(key, message.expectedConversationUrl);
			let adapterState = await probeAdapter(chrome.tabs, mapped.tabId, message);
			if (!adapterState) {
				await chrome.scripting.executeScript({
					target: { tabId: mapped.tabId },
					files: ["contentScript.js"]
				});
				adapterState = await probeAdapter(chrome.tabs, mapped.tabId, message);
			}
			if (message.phase !== "submitted" || adapterState?.submitActive || teamWebDeliveries.has(message.taskId)) continue;
			if (!concreteChatGptConversationUrl(mapped.conversationUrl)) continue;
			await chrome.tabs.sendMessage(mapped.tabId, {
				...message,
				type: "RESUME_CHATGPT_RESULT",
				images: []
			});
			const lastReloadedAt = browserRecoveryReloadedAt.get(key) ?? 0;
			if (Date.now() - (message.submittedAt ?? message.startedAt ?? 0) > 12e4 && Date.now() - lastReloadedAt > 9e4) {
				browserRecoveryReloadedAt.set(key, Date.now());
				await chrome.tabs.reload(mapped.tabId);
			}
		} catch {}
	}
}
var TEAM_GATEWAY_CHUNK_CHARACTERS = 6e5;
var TEAM_GATEWAY_CHUNK_PACE_MS = 250;
var TEAM_WEB_SAFE_BUNDLE_BYTES = 8e6;
function estimatedTeamWebBundleBytes(images) {
	let bytes = 25;
	for (let index = 0; index < images.length; index += 1) {
		const image = images[index];
		const mimeType = typeof image?.mimeType === "string" ? image.mimeType : "image/png";
		const base64Length = typeof image?.base64 === "string" ? image.base64.length : 0;
		bytes += 27 + mimeType.length + base64Length;
		if (index > 0) bytes += 1;
	}
	return bytes;
}
async function submitTeamGatewayJob(input) {
	const health = await teamGatewayRequest("/health");
	if (Number(health.protocolVersion || 1) < 2) return teamGatewayRequest("/jobs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input)
	});
	if (Number(health.protocolVersion || 1) < 4) throw new Error("团队任务箱版本过旧，暂不支持 Flare / Sunburst 模型选择");
	if (input.provider === "chatgpt_web" && Number(health.protocolVersion || 1) < 5) throw new Error("团队任务箱版本过旧，暂不支持 Team Web");
	const images = Array.isArray(input.images) ? input.images : [];
	const submitted = await teamGatewayRequest("/jobs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			requestId: input.requestId,
			prompt: input.prompt,
			ratio: input.ratio,
			imageCount: images.length,
			resultDelivery: input.provider === "chatgpt_web" && Number(health.protocolVersion) >= 6 ? "bundle" : "direct",
			imageModel: input.imageModel === "sunburst" ? "sunburst" : "flare",
			provider: input.provider === "chatgpt_web" ? "chatgpt_web" : "codex_cloud"
		})
	});
	try {
		for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
			const image = images[imageIndex];
			const totalChunks = Math.max(1, Math.ceil(image.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
			for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
				await teamGatewayRequest(`/jobs/${submitted.id}/input-chunks`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						imageIndex,
						chunkIndex,
						totalChunks,
						name: image.name,
						mimeType: image.mimeType,
						base64: image.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
					})
				});
				if (chunkIndex + 1 < totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
			}
		}
		return await teamGatewayRequest(`/jobs/${submitted.id}/submit`, { method: "POST" });
	} catch (error) {
		teamGatewayRequest(`/jobs/${submitted.id}`, { method: "DELETE" }).catch(() => {});
		throw error;
	}
}
async function downloadTeamGatewayImages(job) {
	return singleFlight(teamResultDownloads, job.id, () => downloadTeamGatewayImagesOnce(job));
}
async function downloadTeamGatewayImagesOnce(job) {
	const images = Array.isArray(job.images) ? job.images : [];
	if (images.every((image) => typeof image.base64 === "string")) return images;
	return (await Promise.all(images.map(async (image, fallbackIndex) => {
		if (typeof image.downloadUrl === "string") {
			if (!image.downloadUrl.startsWith("https://")) throw new Error("团队生图直传地址无效");
			let response;
			if (typeof image.proxyPath === "string" && image.proxyPath.startsWith("/jobs/")) try {
				response = await teamGatewayResultRequest(image.proxyPath);
			} catch (error) {
				if (Number(error?.status || 0) > 0 && Number(error.status) < 500) throw error;
				response = await fetch(image.downloadUrl, { cache: "no-store" });
			}
			else response = await fetch(image.downloadUrl, { cache: "no-store" });
			if (!response.ok) throw new Error(`团队生图直传下载返回 HTTP ${response.status}`);
			const buffer = await response.arrayBuffer();
			if (Number.isInteger(image.byteLength) && buffer.byteLength !== image.byteLength) throw new Error("团队生图直传文件大小校验失败");
			if (typeof image.sha256 === "string" && await sha256Hex(buffer) !== image.sha256) throw new Error("团队生图直传文件完整性校验失败");
			if (image.mimeType === "application/vnd.pixel-flow.images+json") {
				const bundle = JSON.parse(new TextDecoder().decode(buffer));
				if (!Array.isArray(bundle.images) || bundle.images.length < 1 || bundle.images.length > 10) throw new Error("团队结果包格式无效");
				if (bundle.version === 1 && bundle.images.every((item) => /^image\/(png|jpeg|webp)$/.test(item.mimeType) && typeof item.base64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(item.base64))) return bundle.images;
				if (bundle.version === 2 && bundle.images.every((item) => /^image\/(png|jpeg|webp)$/.test(item.mimeType) && typeof item.downloadUrl === "string" && item.downloadUrl.startsWith("https://") && Number.isInteger(item.byteLength) && typeof item.sha256 === "string")) return Promise.all(bundle.images.map(async (item) => {
					const response = await fetch(item.downloadUrl, { cache: "no-store" });
					if (!response.ok) throw new Error(`团队生图图片下载返回 HTTP ${response.status}`);
					const imageBuffer = await response.arrayBuffer();
					if (imageBuffer.byteLength !== item.byteLength || await sha256Hex(imageBuffer) !== item.sha256) throw new Error("团队生图图片完整性校验失败");
					return {
						base64: bytesToBase64(imageBuffer),
						mimeType: item.mimeType
					};
				}));
				throw new Error("团队结果包格式无效");
			}
			return [{
				base64: bytesToBase64(buffer),
				mimeType: image.mimeType || response.headers.get("Content-Type") || "image/png"
			}];
		}
		const imageIndex = Number.isInteger(image.imageIndex) ? image.imageIndex : fallbackIndex;
		const chunks = [];
		for (let chunkIndex = 0; chunkIndex < image.totalChunks; chunkIndex += 1) {
			const chunk = await teamGatewayRequest(`/jobs/${job.id}/result-chunks/${imageIndex}/${chunkIndex}`);
			chunks.push(chunk.base64);
			if (chunkIndex + 1 < image.totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
		}
		return {
			base64: chunks.join(""),
			mimeType: image.mimeType || "image/png"
		};
	}))).flat();
}
async function createTeamPreview(image) {
	if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
	const source = new Blob([base64ToBytes(image.base64)], { type: image.mimeType || "image/png" });
	const bitmap = await createImageBitmap(source);
	try {
		const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) return null;
		context.drawImage(bitmap, 0, 0, width, height);
		return {
			base64: bytesToBase64(await (await canvas.convertToBlob({
				type: "image/jpeg",
				quality: .78
			})).arrayBuffer()),
			mimeType: "image/jpeg"
		};
	} finally {
		bitmap.close();
	}
}
async function teamWebWorkerSettings() {
	const values = await chrome.storage.local.get([
		"pixelFlowTeamWebWorkerRelayUrl",
		"pixelFlowTeamWebWorkerDeviceToken",
		"pixelFlowTeamWebWorkerId",
		"pixelFlowTeamWebWorkerEnabled"
	]);
	return {
		relayUrl: typeof values.pixelFlowTeamWebWorkerRelayUrl === "string" ? values.pixelFlowTeamWebWorkerRelayUrl.trim().replace(/\/$/, "") : "",
		deviceToken: typeof values.pixelFlowTeamWebWorkerDeviceToken === "string" ? values.pixelFlowTeamWebWorkerDeviceToken.trim() : "",
		workerId: typeof values.pixelFlowTeamWebWorkerId === "string" ? values.pixelFlowTeamWebWorkerId.trim() : "",
		enabled: values.pixelFlowTeamWebWorkerEnabled === true
	};
}
async function teamWebWorkerRequest(path, options = {}) {
	const settings = await teamWebWorkerSettings();
	if (!settings.enabled || !settings.relayUrl || !settings.deviceToken || !settings.workerId) throw new Error("网页生图机尚未配对或已暂停");
	let lastError;
	for (let attempt = 0; attempt < 5; attempt += 1) try {
		const response = await fetch(`${settings.relayUrl}/web-worker${path}`, {
			...options,
			headers: {
				Authorization: `Bearer ${settings.deviceToken}`,
				...options.body ? { "Content-Type": "application/json" } : {},
				...options.headers || {}
			}
		});
		const payload = await response.json().catch(() => ({}));
		if (response.ok) return payload;
		const error = new Error(payload.message || payload.error || `网页生图任务中继返回 HTTP ${response.status}`);
		error.status = response.status;
		if (response.status !== 429 && response.status < 500) throw error;
		lastError = error;
		if (attempt === 4) throw error;
		const retryAfter = Number(response.headers.get("Retry-After"));
		await new Promise((resolveWait) => setTimeout(resolveWait, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : Math.min(16e3, 1e3 * 2 ** attempt)));
	} catch (error) {
		if (Number.isFinite(Number(error?.status))) throw error;
		lastError = error;
		if (attempt === 4) throw error;
		await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(16e3, 1e3 * 2 ** attempt)));
	}
	throw lastError ?? /* @__PURE__ */ new Error("网页生图任务中继持续不可用");
}
async function saveActiveTeamWebJobs() {
	const jobs = [...activeTeamWebJobs.values()];
	if (jobs.length) await chrome.storage.local.set({ [TEAM_WEB_ACTIVE_JOBS_STORAGE]: jobs });
	else await chrome.storage.local.remove(TEAM_WEB_ACTIVE_JOBS_STORAGE);
	await chrome.storage.local.remove(TEAM_WEB_ACTIVE_STORAGE);
}
function activeTeamWebKey(active) {
	return active?.job?.id ? createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id) : "";
}
async function downloadTeamWebInputs(job) {
	return Promise.all((job.inputImages || []).map(async (descriptor) => {
		const chunks = [];
		for (let chunkIndex = 0; chunkIndex < descriptor.totalChunks; chunkIndex += 1) {
			const chunk = await teamWebWorkerRequest(`/jobs/${job.id}/input-chunks/${descriptor.imageIndex}/${chunkIndex}`);
			chunks.push(chunk.base64);
		}
		return {
			name: descriptor.name,
			mimeType: descriptor.mimeType || "image/png",
			base64: chunks.join("")
		};
	}));
}
async function uploadTeamWebImage(jobId, image, endpoint, imageIndex, name) {
	const totalChunks = Math.max(1, Math.ceil(image.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
	for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
		await teamWebWorkerRequest(`/jobs/${jobId}/${endpoint}`, {
			method: "POST",
			body: JSON.stringify({
				imageIndex,
				chunkIndex,
				totalChunks,
				name,
				mimeType: image.mimeType || "image/png",
				base64: image.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
			})
		});
		if (chunkIndex + 1 < totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
	}
}
async function clearActiveTeamWebJob(closeTab = true, expected) {
	if (!expected || activeTeamWebJobs.get(expected.job.id) !== expected) return;
	const key = activeTeamWebKey(expected);
	if (key) {
		browserTaskMessages.delete(key);
		resumedBrowserUrls.delete(key);
		browserRecoveryReloadedAt.delete(key);
		await saveBrowserTaskMessages();
		await removeActiveScope(key);
		if (closeTab) await tabRegistry.hibernate(key).catch(() => void 0);
	}
	if (activeTeamWebJobs.get(expected.job.id) !== expected) return;
	activeTeamWebJobs.delete(expected.job.id);
	teamWebDeliveries.delete(expected.job.id);
	await saveActiveTeamWebJobs();
	if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
}
async function failActiveTeamWebJob(reason, detail, expected) {
	if (!expected || activeTeamWebJobs.get(expected.job.id) !== expected) return;
	const job = expected.job;
	if (!job) return;
	await teamWebWorkerRequest(`/jobs/${job.id}/fail`, {
		method: "POST",
		body: JSON.stringify({ error: detail || "ChatGPT 网页执行失败" })
	}).catch(() => void 0);
	if (activeTeamWebJobs.get(expected.job.id) !== expected) return;
	if ([
		"login_required",
		"verification_required",
		"usage_limited"
	].includes(reason)) await chrome.storage.local.set({ pixelFlowTeamWebWorkerEnabled: false });
	await clearActiveTeamWebJob(true, expected);
}
async function completeActiveTeamWebJob(message) {
	const active = activeTeamWebJobs.get(message.taskId);
	if (!active || active.job.id !== message.taskId) return;
	return singleFlight(teamWebDeliveries, active.job.id, () => deliverTeamWebJob(message, active)).catch(async (error) => {
		const status = Number(error?.status);
		if (!(!Number.isFinite(status) || status === 429 || status >= 500)) {
			await failActiveTeamWebJob("delivery_error", typeof error?.message === "string" ? error.message : String(error), active);
			return;
		}
		if (activeTeamWebJobs.get(active.job.id) !== active) return;
		active.phase = "delivering";
		active.deliveryError = typeof error?.message === "string" ? error.message : String(error);
		await saveActiveTeamWebJobs();
		scheduleBrowserResultRecoveryAlarm();
		await teamWebWorkerRequest(`/jobs/${active.job.id}/heartbeat`, {
			method: "POST",
			body: JSON.stringify({ phase: "delivering" })
		}).catch(() => void 0);
	});
}
async function deliverTeamWebJob(message, active) {
	if (!active || !Array.isArray(message.images) || message.images.length === 0) throw new Error("ChatGPT 已结束，但没有取得生成图片");
	const generatedAt = Date.now();
	const generationStartedAt = active.generationStartedAt ?? active.submittedAt ?? active.startedAt;
	await teamWebWorkerRequest(`/jobs/${active.job.id}/generated`, {
		method: "POST",
		body: JSON.stringify({
			generationStartedAt,
			generatedAt,
			generationDurationMs: Math.max(0, generatedAt - generationStartedAt)
		})
	});
	active.phase = "delivering";
	await saveActiveTeamWebJobs();
	const shouldUseBundle = active.job.resultDelivery === "bundle" && estimatedTeamWebBundleBytes(message.images) <= TEAM_WEB_SAFE_BUNDLE_BYTES;
	if (active.job.resultDelivery === "bundle" && !shouldUseBundle) {
		await teamWebWorkerRequest(`/jobs/${active.job.id}/use-chunks`, {
			method: "POST",
			body: "{}"
		});
		active.job.resultDelivery = "chunks";
		await saveActiveTeamWebJobs();
	}
	if (active.job.resultDelivery === "bundle") {
		const bundleBody = JSON.stringify({
			version: 1,
			images: message.images
		});
		await teamWebWorkerRequest(`/jobs/${active.job.id}/result-bundle`, {
			method: "POST",
			body: bundleBody
		});
	} else for (let imageIndex = 0; imageIndex < message.images.length; imageIndex += 1) await uploadTeamWebImage(active.job.id, message.images[imageIndex], "result-chunks", imageIndex, `result-${imageIndex + 1}.png`);
	if (active.job.resultDelivery !== "bundle") await teamWebWorkerRequest(`/jobs/${active.job.id}/complete`, {
		method: "POST",
		body: JSON.stringify({ resultCount: message.images.length })
	});
	const preview = await createTeamPreview(message.images[0]).catch(() => null);
	if (preview) await uploadTeamWebImage(active.job.id, preview, "preview-chunks", 0, "preview-1.jpg").catch(() => void 0);
	await clearActiveTeamWebJob(true, active);
	await updateScheduler(async () => void 0);
	await chrome.notifications.create(`team-web-worker:${active.job.id}`, {
		type: "basic",
		iconUrl: chrome.runtime.getURL("icon.svg"),
		title: "Team Web 已完成",
		message: `已回传 ${message.images.length} 张图片`
	});
	setTimeout(() => void teamWebWorkerTick(), 1e3);
}
async function handleTeamWebPageTaskMessage(message, senderTab) {
	await teamWebWorkerReady;
	const active = activeTeamWebJobs.get(message.taskId);
	if (message.projectId !== TEAM_WEB_PROJECT_ID || message.taskId !== active?.job.id) return false;
	const key = activeTeamWebKey(active);
	if (!key || !tabRegistry.ownsTab(key, senderTab?.id)) return false;
	if (message.type !== "TASK_RESULT" && teamWebDeliveries.has(message.taskId)) return true;
	const conversationUrl = resolveTaskConversationUrl(message, senderTab?.url);
	if (conversationUrl) {
		tabRegistry.updateConversation(key, conversationUrl);
		active.conversationUrl = conversationUrl;
	}
	if (message.type === "TASK_STATUS") {
		const pending = browserTaskMessages.get(key);
		const phase = message.status === "generating" ? "submitted" : message.status;
		if (pending) {
			browserTaskMessages.set(key, {
				...pending,
				phase,
				submittedAt: phase === "submitted" ? pending.submittedAt ?? Date.now() : pending.submittedAt
			});
			await saveBrowserTaskMessages();
		}
		if (activeTeamWebJobs.get(active.job.id) !== active) return true;
		active.phase = phase;
		if (phase === "submitted") {
			active.submittedAt ??= Date.now();
			active.generationStartedAt ??= Date.now();
		}
		await saveActiveTeamWebJobs();
		await teamWebWorkerRequest(`/jobs/${active.job.id}/heartbeat`, {
			method: "POST",
			body: JSON.stringify({ phase: active.phase })
		}).catch(() => void 0);
		if (message.status === "manual_action") await teamWebWorkerRequest("/heartbeat", {
			method: "POST",
			body: JSON.stringify({
				state: "needs_action",
				detail: message.detail || "请在执行机完成 ChatGPT 手动发送"
			})
		}).catch(() => void 0);
		return true;
	}
	if (message.type === "TASK_RESULT") {
		const expected = active;
		await completeActiveTeamWebJob(message).catch(async (error) => {
			await failActiveTeamWebJob("delivery_error", error instanceof Error ? error.message : String(error), expected);
		});
		return true;
	}
	if (message.type === "TASK_ERROR") {
		if (teamWebDeliveries.has(message.taskId)) return true;
		await failActiveTeamWebJob(message.reason, message.detail, active);
		return true;
	}
	return false;
}
async function startActiveTeamWebJob(active) {
	if (!active) return;
	const key = activeTeamWebKey(active);
	const waitMs = Math.max(0, BROWSER_LAUNCH_GAP_MS - (Date.now() - lastBrowserLaunchAt));
	if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
	lastBrowserLaunchAt = Date.now();
	const images = await downloadTeamWebInputs(active.job);
	const mapped = await tabRegistry.ensure(key, active.conversationUrl);
	await rememberActiveTab(key, mapped.tabId);
	await waitForTabReady(mapped.tabId);
	const message = {
		type: "EXECUTE_IN_CHATGPT",
		projectId: TEAM_WEB_PROJECT_ID,
		taskId: active.job.id,
		expectedConversationUrl: active.conversationUrl,
		prompt: appendAspectRatioPrompt(active.job.prompt, active.job.ratio ?? "auto"),
		images,
		startedAt: active.startedAt,
		phase: "preparing_tab"
	};
	browserTaskMessages.set(key, recoveryMessage(message));
	await saveBrowserTaskMessages();
	scheduleBrowserResultRecoveryAlarm();
	await sendWithCurrentChatGptAdapter(chrome.tabs, chrome.scripting, mapped.tabId, message);
}
async function teamWebWorkerTick() {
	if (teamWebTickPromise) return teamWebTickPromise;
	teamWebTickPromise = teamWebWorkerTickOnce().finally(() => {
		teamWebTickPromise = void 0;
	});
	return teamWebTickPromise;
}
async function teamWebWorkerTickOnce() {
	await Promise.all([schedulerReady, teamWebWorkerReady]);
	const settings = await teamWebWorkerSettings();
	if (!settings.enabled || !settings.relayUrl || !settings.deviceToken || !settings.workerId) {
		await chrome.alarms.clear(TEAM_WEB_WORKER_ALARM);
		return;
	}
	scheduleTeamWebWorkerAlarm();
	for (const expected of [...activeTeamWebJobs.values()]) {
		const remote = await teamWebWorkerRequest(`/jobs/${expected.job.id}/status`).catch(() => void 0);
		if (remote && [
			"completed",
			"failed",
			"canceled"
		].includes(remote.status)) {
			await clearActiveTeamWebJob(true, expected);
			await updateScheduler(async () => void 0);
			return;
		}
		const key = activeTeamWebKey(expected);
		if (!browserTaskMessages.has(key) && !concreteChatGptConversationUrl(expected.conversationUrl)) {
			await failActiveTeamWebJob("worker_interrupted", "网页生图机在建立 ChatGPT 对话前被中断，请重新运行该任务", expected);
			continue;
		}
		if (!concreteChatGptConversationUrl(expected.conversationUrl)) {
			await startActiveTeamWebJob(expected).catch(async (error) => {
				await failActiveTeamWebJob("start_error", error instanceof Error ? error.message : String(error), expected);
			});
			continue;
		}
		await teamWebWorkerRequest(`/jobs/${expected.job.id}/heartbeat`, {
			method: "POST",
			body: JSON.stringify({ phase: expected.phase })
		}).catch(() => void 0);
	}
	let localBrowserRunning = 0;
	for (const key of queue.running) if (await taskGenerationMode(key) === "browser") localBrowserRunning += 1;
	while (activeTeamWebJobs.size + localBrowserRunning < TEAM_WEB_MAX_CONCURRENCY) {
		const claimed = await teamWebWorkerRequest("/claim", {
			method: "POST",
			body: JSON.stringify({ supportsBundle: true })
		});
		if (!claimed.job || activeTeamWebJobs.has(claimed.job.id)) break;
		const expected = {
			job: claimed.job,
			startedAt: Date.now(),
			phase: "claimed"
		};
		activeTeamWebJobs.set(expected.job.id, expected);
		await saveActiveTeamWebJobs();
		await startActiveTeamWebJob(expected).catch(async (error) => {
			await failActiveTeamWebJob("start_error", error instanceof Error ? error.message : String(error), expected);
		});
	}
}
async function finalizeTeamGatewayJob(jobId, images) {
	try {
		const preview = images[0] ? await createTeamPreview(images[0]) : null;
		if (preview) {
			if ((await teamGatewayRequest(`/jobs/${jobId}`)).provider === "chatgpt_web") {
				await teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" });
				teamResultDownloads.delete(jobId);
				return;
			}
			const totalChunks = Math.max(1, Math.ceil(preview.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
			for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) await teamGatewayRequest(`/jobs/${jobId}/preview-chunks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					imageIndex: 0,
					chunkIndex,
					totalChunks,
					name: "preview-1.jpg",
					mimeType: preview.mimeType,
					base64: preview.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
				})
			});
		}
	} catch {}
	await teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" });
	teamResultDownloads.delete(jobId);
}
async function waitForTeamGatewayJob(jobId, onProgress) {
	let lastDetail;
	while (true) {
		let job;
		try {
			job = await teamGatewayRequest(`/jobs/${jobId}`);
		} catch (error) {
			if ((error instanceof Error ? error.message : String(error)) !== "无法连接团队生图服务，请检查网关地址、网络和服务状态") throw error;
			const reconnectDetail = "团队服务暂时不可达，正在自动重连";
			if (reconnectDetail !== lastDetail) {
				lastDetail = reconnectDetail;
				await onProgress?.(reconnectDetail, "submitted");
			}
			await new Promise((resolve) => setTimeout(resolve, 2e3));
			continue;
		}
		if (job.status === "completed") {
			await onProgress?.("图片已生成，正在写回画布", "delivering");
			return downloadTeamGatewayImages(job);
		}
		if (job.status === "failed") throw new Error(job.error || "团队生图失败");
		if (job.status === "canceled") throw new Error("团队任务已取消");
		const generated = Boolean(job.generatedAt || job.generated_at);
		const detail = job.detail || (job.status === "queued" ? "等待团队执行机接单" : generated ? "图片已生成，正在回传结果" : "团队执行机处理中");
		const runStatus = job.status === "uploading" ? "uploading" : job.status === "queued" ? "submitted" : generated || /回传|写回/.test(detail) ? "delivering" : "generating";
		if (detail !== lastDetail) {
			lastDetail = detail;
			await onProgress?.(detail, runStatus);
		}
		await new Promise((resolve) => setTimeout(resolve, 2e3));
	}
}
async function recoverTeamTaskResult(projectId, taskId, requestedJobId) {
	const project = await projectRepository.loadProject(projectId);
	const task = project?.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
	if (!project || !task || !["team", "team_web"].includes(task.generationMode)) throw new Error("找不到团队生图任务");
	const run = await taskRunRepository.latest(projectId, taskId);
	const jobId = requestedJobId || run?.providerJobId;
	if (!jobId) throw new Error("没有可恢复的云端任务");
	const existingResults = project.graph.edges.filter((edge) => edge.source === taskId && edge.kind === "output");
	if (existingResults.length > 0 && (run ? run.status === "completed" : task.status === "completed")) return {
		recovered: false,
		existingResults: existingResults.length
	};
	const job = await teamGatewayRequest(`/jobs/${jobId}`);
	if (job.status !== "completed") throw new Error(job.error || `云端任务尚未完成：${job.status}`);
	const images = await downloadTeamGatewayImages(job);
	if (!images.length) throw new Error("云端任务没有可恢复的图片");
	await startTaskRun(projectId, taskId);
	await persistAndBroadcast({
		type: "TASK_STATUS",
		projectId,
		taskId,
		status: "generating",
		runStatus: "delivering",
		detail: "正在恢复云端结果",
		apiJobId: jobId
	});
	await persistAndBroadcast({
		type: "TASK_RESULT",
		projectId,
		taskId,
		images,
		responseText: ""
	});
	await finalizeTeamGatewayJob(jobId, images).catch(() => {});
	return {
		recovered: true,
		resultCount: images.length,
		jobId
	};
}
async function prepareTaskRequest(project, taskId, task) {
	const inputs = getTaskInputs(project.graph, taskId);
	const text = inputs.filter((input) => input.node.kind === "text").map((input) => input.node.kind === "text" ? input.node.text : "").filter(Boolean);
	const images = await Promise.all(inputs.flatMap((input) => {
		if (input.node.kind !== "image" && input.node.kind !== "result") return [];
		const assetNode = input.node;
		return [projectRepository.loadAsset(assetNode.assetId).then(async (blob) => {
			if (!blob) throw new Error(`找不到参考图片：${assetNode.assetId}`);
			return {
				name: `${input.label}.${blob.type.split("/")[1] || "png"}`,
				mimeType: blob.type || "image/png",
				base64: bytesToBase64(await blob.arrayBuffer())
			};
		})];
	}));
	const ratio = task.aspectRatio ?? "auto";
	return {
		prompt: appendAspectRatioPrompt([...text, task.prompt].filter(Boolean).join("\n\n"), ratio),
		ratio,
		images
	};
}
async function executeApiTask(projectId, taskId, project, task) {
	const key = createTaskScopeKey(projectId, taskId);
	try {
		const { pixelFlowApiKey } = await chrome.storage.local.get("pixelFlowApiKey");
		if (typeof pixelFlowApiKey !== "string" || !pixelFlowApiKey.trim()) throw new Error("请先点击顶部“API 设置”并保存 API Key");
		const request = await prepareTaskRequest(project, taskId, task);
		let jobId = task.apiJobId;
		if (!jobId) {
			await persistAndBroadcast({
				type: "TASK_STATUS",
				projectId,
				taskId,
				status: "sending",
				detail: void 0
			});
			jobId = (await apiWorkerRequest("/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiKey: pixelFlowApiKey,
					...request
				})
			})).id;
		}
		await persistAndBroadcast({
			type: "TASK_STATUS",
			projectId,
			taskId,
			status: "generating",
			detail: void 0,
			apiJobId: jobId
		});
		scheduleApiRecoveryAlarm();
		const images = await waitForApiWorkerJob(jobId);
		if (!await updateScheduler(async () => {
			if (!queue.running.includes(key)) return false;
			await persistAndBroadcast({
				type: "TASK_RESULT",
				projectId,
				taskId,
				images,
				responseText: ""
			});
			queue = complete(queue, key);
			pendingScopes.delete(key);
			await removeActiveScope(key);
			return true;
		})) return;
		apiWorkerRequest(`/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
		await chrome.notifications.create(createTaskNotificationId(projectId, taskId), {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon.svg"),
			title: "API 生图完成",
			message: `已生成 ${images.length} 张图片`
		});
	} catch (error) {
		if (!await updateScheduler(async () => {
			if (!queue.running.includes(key)) return false;
			queue = fail(queue, key, "api_error");
			pendingScopes.delete(key);
			await removeActiveScope(key);
			return true;
		})) return;
		await persistAndBroadcast({
			type: "TASK_ERROR",
			projectId,
			taskId,
			reason: "api_error",
			detail: error instanceof Error ? error.message : "API 生图失败"
		});
	}
}
async function executeTeamTask(projectId, taskId, project, task) {
	const key = createTaskScopeKey(projectId, taskId);
	try {
		await teamGatewaySettings();
		const request = await prepareTaskRequest(project, taskId, task);
		let jobId = task.apiJobId;
		if (!jobId) {
			await persistAndBroadcast({
				type: "TASK_STATUS",
				projectId,
				taskId,
				status: "sending",
				detail: void 0
			});
			jobId = (await submitTeamGatewayJob({
				requestId: `${projectId}:${taskId}:${Date.now()}`,
				...request,
				imageModel: task.teamImageModel === "sunburst" ? "sunburst" : "flare",
				provider: task.generationMode === "team_web" ? "chatgpt_web" : "codex_cloud"
			})).id;
		}
		await persistAndBroadcast({
			type: "TASK_STATUS",
			projectId,
			taskId,
			status: "generating",
			runStatus: "submitted",
			detail: "任务已提交，等待执行机接单",
			apiJobId: jobId
		});
		scheduleApiRecoveryAlarm();
		const images = await waitForTeamGatewayJob(jobId, (detail, runStatus) => persistAndBroadcast({
			type: "TASK_STATUS",
			projectId,
			taskId,
			status: "generating",
			runStatus,
			detail,
			apiJobId: jobId
		}));
		if (!await updateScheduler(async () => {
			if (!queue.running.includes(key)) return false;
			await persistAndBroadcast({
				type: "TASK_RESULT",
				projectId,
				taskId,
				images,
				responseText: ""
			});
			queue = complete(queue, key);
			pendingScopes.delete(key);
			await removeActiveScope(key);
			return true;
		})) return;
		await finalizeTeamGatewayJob(jobId, images).catch(() => {});
		await chrome.notifications.create(createTaskNotificationId(projectId, taskId), {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon.svg"),
			title: task.generationMode === "team_web" ? "Team Web 已完成" : "Team Cloud 已完成",
			message: `已生成 ${images.length} 张图片`
		});
	} catch (error) {
		if (!await updateScheduler(async () => {
			if (!queue.running.includes(key)) return false;
			queue = fail(queue, key, "team_error");
			pendingScopes.delete(key);
			await removeActiveScope(key);
			return true;
		})) return;
		await persistAndBroadcast({
			type: "TASK_ERROR",
			projectId,
			taskId,
			reason: "team_error",
			detail: error instanceof Error ? error.message : "团队生图失败"
		});
	}
}
async function executeTask(projectId, taskId) {
	const key = createTaskScopeKey(projectId, taskId);
	try {
		const project = await projectRepository.loadProject(projectId);
		const task = project?.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
		if (!project || !task) throw new Error("找不到本地任务");
		const latestRun = await taskRunRepository.latest(projectId, taskId);
		const runtime = resolveTaskRuntime(task, latestRun);
		if (latestRun && !runtime.active) throw new Error(`TaskRun已终态：${latestRun.status}`);
		const runtimeTask = {
			...task,
			apiJobId: runtime.providerJobId,
			conversationUrl: runtime.conversationUrl
		};
		if (runtimeTask.generationMode === "api") {
			await executeApiTask(projectId, taskId, project, runtimeTask);
			return;
		}
		if (runtimeTask.generationMode === "team" || runtimeTask.generationMode === "team_web") {
			await executeTeamTask(projectId, taskId, project, runtimeTask);
			return;
		}
		if (runtimeTask.apiJobId) await persistAndBroadcast({
			type: "TASK_STATUS",
			projectId,
			taskId,
			status: "queued",
			detail: void 0,
			clearApiJobId: true
		});
		const mapped = await tabRegistry.ensure(key, runtimeTask.conversationUrl);
		await rememberActiveTab(key, mapped.tabId);
		await persistAndBroadcast({
			type: "TASK_STATUS",
			projectId,
			taskId,
			status: "sending"
		});
		await waitForTabReady(mapped.tabId);
		await tabRegistry.assertExpected(mapped.tabId, runtimeTask.conversationUrl);
		const request = await prepareTaskRequest(project, taskId, runtimeTask);
		const message = {
			type: "EXECUTE_IN_CHATGPT",
			projectId,
			taskId,
			expectedConversationUrl: runtimeTask.conversationUrl,
			prompt: request.prompt,
			images: request.images,
			startedAt: Date.now(),
			phase: "preparing_tab"
		};
		browserTaskMessages.set(key, recoveryMessage(message));
		await saveBrowserTaskMessages();
		scheduleBrowserResultRecoveryAlarm();
		await sendWithCurrentChatGptAdapter(chrome.tabs, chrome.scripting, mapped.tabId, message);
	} catch (error) {
		const reason = error instanceof ConversationUnavailableError ? "conversation_unavailable" : "selector_missing";
		if (!await updateScheduler(async () => {
			if (!queue.running.includes(key)) return false;
			queue = fail(queue, key, reason);
			pendingScopes.delete(key);
			await removeActiveScope(key);
			return true;
		})) return;
		await persistAndBroadcast({
			type: "TASK_ERROR",
			projectId,
			taskId,
			reason,
			detail: error instanceof Error ? error.message : "任务启动失败"
		});
	}
}
async function startWaitingTasks() {
	const running = new Set(queue.running);
	const state = await chrome.storage.session.get("activeTaskScopes");
	const active = new Map(Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []);
	for (const key of running) {
		if (active.has(key)) continue;
		const scope = pendingScopes.get(key);
		if (!scope) continue;
		if (await taskGenerationMode(key) === "browser") {
			const waitMs = Math.max(0, BROWSER_LAUNCH_GAP_MS - (Date.now() - lastBrowserLaunchAt));
			if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
			lastBrowserLaunchAt = Date.now();
		}
		active.set(key, scope.projectId);
		executeTask(scope.projectId, scope.taskId);
	}
	await chrome.storage.session.set({ activeTaskScopes: [...active] });
}
async function taskGenerationMode(key) {
	const scope = pendingScopes.get(key) ?? parseTaskScopeKey(key);
	if (!scope) return "browser";
	const task = (await projectRepository.loadProject(scope.projectId))?.graph.nodes.find((node) => node.id === scope.taskId && node.kind === "task");
	return task?.generationMode === "api" ? "api" : task?.generationMode === "team" ? "team" : task?.generationMode === "team_web" ? "team_web" : "browser";
}
async function advanceQueueByMode() {
	let slots = Math.max(0, 5 - queue.running.length);
	if (!slots || !queue.waiting.length) return;
	let browserRunning = activeTeamWebJobs.size;
	for (const key of queue.running) if (await taskGenerationMode(key) === "browser") browserRunning += 1;
	const promoted = [];
	const waiting = [];
	for (const key of queue.waiting) {
		if (!slots) {
			waiting.push(key);
			continue;
		}
		const mode = await taskGenerationMode(key);
		if (mode === "browser" && browserRunning >= 5) {
			waiting.push(key);
			continue;
		}
		promoted.push(key);
		slots -= 1;
		if (mode === "browser") browserRunning += 1;
	}
	queue = {
		...queue,
		running: [...queue.running, ...promoted],
		waiting
	};
}
async function updateScheduler(work) {
	return schedulerWrites.run("scheduler", async () => {
		await schedulerReady;
		const result = await work();
		await advanceQueueByMode();
		await saveScheduler();
		await startWaitingTasks();
		return result;
	});
}
async function reconcileSchedulerSnapshot() {
	await schedulerReady;
	const liveScopes = /* @__PURE__ */ new Map();
	const interruptedBrowserTasks = [];
	for (const project of await projectRepository.listProjects()) {
		const latestRuns = await taskRunRepository.latestByProject(project.id);
		for (const task of project.graph.nodes) {
			if (task.kind !== "task") continue;
			const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
			if (!runtime.active) continue;
			if (task.generationMode === "browser" && runtime.status !== "queued" && !concreteChatGptConversationUrl(runtime.conversationUrl)) {
				interruptedBrowserTasks.push({
					projectId: project.id,
					taskId: task.id
				});
				continue;
			}
			liveScopes.set(createTaskScopeKey(project.id, task.id), {
				projectId: project.id,
				taskId: task.id
			});
		}
	}
	queue = reconcileQueue(queue, new Set(liveScopes.keys()));
	pendingScopes = new Map([...liveScopes].filter(([key]) => queue.waiting.includes(key) || queue.running.includes(key)));
	const liveTaskKeys = new Set(liveScopes.keys());
	for (const active of activeTeamWebJobs.values()) liveTaskKeys.add(createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id));
	for (const key of [...browserTaskMessages.keys()]) if (!liveTaskKeys.has(key)) browserTaskMessages.delete(key);
	await saveBrowserTaskMessages();
	tabRegistry.pruneMappings(liveTaskKeys);
	await tabRegistry.closeOrphanedManagedTabs();
	const runningKeys = new Set(queue.running);
	const state = await chrome.storage.session.get(["activeTaskScopes", "activeTaskTabs"]);
	const activeTaskScopes = (Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []).filter((entry) => Array.isArray(entry) && runningKeys.has(entry[0]));
	const activeTaskTabs = (Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []).filter((entry) => Array.isArray(entry) && runningKeys.has(entry[0]));
	await chrome.storage.session.set({
		activeTaskScopes,
		activeTaskTabs
	});
	await saveScheduler();
	for (const task of interruptedBrowserTasks) await persistAndBroadcast({
		type: "TASK_ERROR",
		...task,
		reason: "browser_interrupted",
		detail: "ChatGPT任务在建立可恢复对话前被中断，请重新运行"
	});
}
async function recoverInterruptedApiTasks() {
	await schedulerReady;
	const interruptedByKey = /* @__PURE__ */ new Map();
	for (const key of queue.running) {
		const scope = pendingScopes.get(key) ?? parseTaskScopeKey(key);
		if (!scope) continue;
		const task = (await projectRepository.loadProject(scope.projectId))?.graph.nodes.find((node) => node.id === scope.taskId && node.kind === "task");
		if ((task ? resolveTaskRuntime(task, await taskRunRepository.latest(scope.projectId, scope.taskId)) : void 0)?.active && [
			"api",
			"team",
			"team_web"
		].includes(task?.generationMode)) interruptedByKey.set(key, {
			key,
			...scope
		});
	}
	const recoverableStatuses = /* @__PURE__ */ new Set([
		"preparing",
		"uploading",
		"sending",
		"submitted",
		"generating",
		"delivering"
	]);
	for (const project of await projectRepository.listProjects()) {
		const latestRuns = await taskRunRepository.latestByProject(project.id);
		for (const task of project.graph.nodes) {
			if (task.kind !== "task" || ![
				"api",
				"team",
				"team_web"
			].includes(task.generationMode)) continue;
			const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
			if (!runtime.active || !runtime.status || !recoverableStatuses.has(runtime.status)) continue;
			const key = createTaskScopeKey(project.id, task.id);
			interruptedByKey.set(key, {
				key,
				projectId: project.id,
				taskId: task.id
			});
		}
	}
	const interrupted = [...interruptedByKey.values()];
	if (interrupted.length === 0) return;
	await updateScheduler(async () => {
		for (const item of interrupted) {
			const task = (await projectRepository.loadProject(item.projectId))?.graph.nodes.find((node) => node.id === item.taskId && node.kind === "task");
			const runtime = task ? resolveTaskRuntime(task, await taskRunRepository.latest(item.projectId, item.taskId)) : void 0;
			await removeActiveScope(item.key);
			if (!task || !runtime?.active) {
				queue = cancelTask(queue, item.key);
				pendingScopes.delete(item.key);
				continue;
			}
			if (runtime.providerJobId) {
				pendingScopes.set(item.key, {
					projectId: item.projectId,
					taskId: item.taskId
				});
				if (!queue.running.includes(item.key) && !queue.waiting.includes(item.key)) queue = enqueue(queue, [item.key]);
				continue;
			}
			queue = queue.running.includes(item.key) ? fail(queue, item.key, "api_interrupted") : cancelTask(queue, item.key);
			pendingScopes.delete(item.key);
			await persistAndBroadcast({
				type: "TASK_ERROR",
				projectId: item.projectId,
				taskId: item.taskId,
				reason: task?.generationMode === "team" || task?.generationMode === "team_web" ? "team_interrupted" : "api_interrupted",
				detail: task?.generationMode === "team" || task?.generationMode === "team_web" ? "团队任务在提交前被扩展重载中断，请重新运行" : "API 任务因扩展重载或后台中断而停止；为避免重复计费，未自动重试。请先检查平台调用记录。"
			});
		}
	});
}
async function reconcileCompletedApiTasks() {
	await schedulerReady;
	let activeApiJobs = 0;
	for (const project of await projectRepository.listProjects()) {
		const latestRuns = await taskRunRepository.latestByProject(project.id);
		for (const task of project.graph.nodes) {
			if (task.kind !== "task" || ![
				"api",
				"team",
				"team_web"
			].includes(task.generationMode)) continue;
			const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
			const jobId = runtime.providerJobId;
			if (!runtime.active || !jobId) continue;
			if (!queue.running.includes(createTaskScopeKey(project.id, task.id))) continue;
			activeApiJobs += 1;
			let job;
			try {
				job = await (["team", "team_web"].includes(task.generationMode) ? teamGatewayRequest : apiWorkerRequest)(`/jobs/${jobId}`);
			} catch {
				continue;
			}
			if (![
				"completed",
				"failed",
				"canceled"
			].includes(job.status)) continue;
			const completedImages = job.status === "completed" && ["team", "team_web"].includes(task.generationMode) ? await downloadTeamGatewayImages(job) : job.images || [];
			const key = createTaskScopeKey(project.id, task.id);
			if (!await updateScheduler(async () => {
				if (!queue.running.includes(key)) return false;
				if (job.status === "completed") {
					await persistAndBroadcast({
						type: "TASK_RESULT",
						projectId: project.id,
						taskId: task.id,
						images: completedImages,
						responseText: ""
					});
					queue = complete(queue, key);
				} else {
					await persistAndBroadcast({
						type: "TASK_ERROR",
						projectId: project.id,
						taskId: task.id,
						reason: ["team", "team_web"].includes(task.generationMode) ? "team_error" : "api_error",
						detail: job.error || (["team", "team_web"].includes(task.generationMode) ? "团队生图失败" : "API 生图失败")
					});
					queue = fail(queue, key, ["team", "team_web"].includes(task.generationMode) ? "team_error" : "api_error");
				}
				pendingScopes.delete(key);
				await removeActiveScope(key);
				return true;
			})) continue;
			activeApiJobs -= 1;
			if (task.generationMode === "team" || task.generationMode === "team_web") teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" }).then(() => teamResultDownloads.delete(jobId)).catch(() => {});
			else apiWorkerRequest(`/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
			if (job.status === "completed") await chrome.notifications.create(createTaskNotificationId(project.id, task.id), {
				type: "basic",
				iconUrl: chrome.runtime.getURL("icon.svg"),
				title: task.generationMode === "team_web" ? "Team Web 已完成" : task.generationMode === "team" ? "Team Cloud 已完成" : "API Key 已完成",
				message: `已生成 ${completedImages.length} 张图片`
			});
		}
	}
	if (activeApiJobs === 0) await chrome.alarms.clear(API_RECOVERY_ALARM);
}
async function handlePageTaskMessage(message, senderTab) {
	if (message.projectId === TEAM_WEB_PROJECT_ID) return handleTeamWebPageTaskMessage(message, senderTab);
	await schedulerReady;
	const key = createTaskScopeKey(message.projectId, message.taskId);
	if (!tabRegistry.ownsTab(key, senderTab?.id)) return false;
	const conversationUrl = resolveTaskConversationUrl(message, senderTab?.url);
	if (conversationUrl) tabRegistry.updateConversation(key, conversationUrl);
	if (!await updateScheduler(async () => {
		if (!queue.running.includes(key)) return false;
		const recoveryMessageState = browserTaskMessages.get(key);
		if (message.type === "TASK_ERROR" && recoveryMessageState?.phase === "submitted" && !message.recovery) return true;
		if (message.type === "TASK_STATUS") {
			const pendingMessage = browserTaskMessages.get(key);
			if (pendingMessage?.phase === "submitted" && [
				"preparing_tab",
				"uploading",
				"sending"
			].includes(message.status)) return true;
			if (pendingMessage) {
				const phase = message.status === "generating" ? "submitted" : message.status;
				browserTaskMessages.set(key, {
					...pendingMessage,
					phase,
					submittedAt: phase === "submitted" ? pendingMessage.submittedAt ?? Date.now() : pendingMessage.submittedAt
				});
				await saveBrowserTaskMessages();
			}
		}
		await persistAndBroadcast({
			...message,
			conversationUrl
		});
		if (message.type === "TASK_RESULT") queue = complete(queue, key);
		else if (message.type === "TASK_ERROR") queue = fail(queue, key, message.reason);
		else return true;
		if (message.type === "TASK_RESULT" || message.type === "TASK_ERROR") {
			pendingScopes.delete(key);
			browserTaskMessages.delete(key);
			resumedBrowserUrls.delete(key);
			browserRecoveryReloadedAt.delete(key);
			await saveBrowserTaskMessages();
			if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
			await removeActiveScope(key);
		}
		return true;
	})) return false;
	if (message.type === "TASK_RESULT") {
		await tabRegistry.hibernate(key);
		await chrome.notifications.create(createTaskNotificationId(message.projectId, message.taskId), {
			type: "basic",
			iconUrl: chrome.runtime.getURL("icon.svg"),
			title: "任务生成完成",
			message: message.images.length ? `\u5DF2\u751F\u6210 ${message.images.length} \u5F20\u56FE\u7247` : "任务完成，但没有生成图片"
		});
	}
	return true;
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	(async () => {
		await schedulerReady;
		const observedUrl = changeInfo.url ?? tab.url;
		if (!observedUrl?.startsWith("https://chatgpt.com/") || changeInfo.status !== "complete" && !changeInfo.url) return;
		const key = tabRegistry.taskForTab(tabId);
		const message = key ? browserTaskMessages.get(key) : void 0;
		if (!key || !message || resumedBrowserUrls.get(key) === observedUrl) return;
		if (observedUrl.includes("?prompt=")) {
			if (changeInfo.status !== "complete") return;
			resumedBrowserUrls.set(key, observedUrl);
			await chrome.scripting.executeScript({
				target: { tabId },
				world: "MAIN",
				func: () => document.querySelector("[data-testid=\"send-button\"], #composer-submit-button, button[aria-label*=\"Send\" i], button[aria-label*=\"发送\"]")?.click()
			});
			return;
		}
		if (!/^https:\/\/chatgpt\.com\/c\/[^/]+\/?$/.test(observedUrl) || message.phase !== "submitted") return;
		const resumedMessage = {
			...message,
			expectedConversationUrl: observedUrl
		};
		resumedBrowserUrls.set(key, observedUrl);
		tabRegistry.updateConversation(key, observedUrl);
		browserTaskMessages.set(key, resumedMessage);
		await saveBrowserTaskMessages();
		const active = [...activeTeamWebJobs.values()].find((candidate) => key === activeTeamWebKey(candidate));
		if (active) {
			active.conversationUrl = observedUrl;
			await saveActiveTeamWebJobs();
		} else await persistAndBroadcast({
			type: "TASK_STATUS",
			projectId: message.projectId,
			taskId: message.taskId,
			status: "generating",
			conversationUrl: observedUrl
		});
		if (!await probeAdapter(chrome.tabs, tabId, resumedMessage)) await chrome.scripting.executeScript({
			target: { tabId },
			files: ["contentScript.js"]
		});
		await chrome.tabs.sendMessage(tabId, {
			...resumedMessage,
			type: "RESUME_CHATGPT_RESULT",
			images: []
		});
	})().catch(() => {});
});
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
	if (raw?.type === "TEAM_WEB_WORKER_SETTINGS_CHANGED") {
		sendResponse({ accepted: true });
		teamWebWorkerTick();
		return false;
	}
	if (!isExtensionMessage(raw)) return false;
	const message = raw;
	if (message.type === "RECOVER_TEAM_RESULT") {
		recoverTeamTaskResult(message.projectId, message.taskId, message.jobId).then((result) => sendResponse({
			accepted: true,
			...result
		}), (error) => sendResponse({
			accepted: false,
			error: error instanceof Error ? error.message : String(error)
		}));
		return true;
	}
	if (message.type === "RUN_TASK" || message.type === "RUN_TASKS") {
		updateScheduler(async () => {
			const taskIds = message.type === "RUN_TASKS" ? [...new Set(message.taskIds)] : [message.taskId];
			const keys = [];
			for (const taskId of taskIds) {
				const key = createTaskScopeKey(message.projectId, taskId);
				await startTaskRun(message.projectId, taskId);
				await persistAndBroadcast({
					type: "TASK_STATUS",
					projectId: message.projectId,
					taskId,
					status: "queued",
					runStatus: "queued",
					detail: void 0
				});
				pendingScopes.set(key, {
					projectId: message.projectId,
					taskId
				});
				keys.push(key);
			}
			queue = enqueue(queue, keys);
		}).then(() => sendResponse({ accepted: true }), (error) => sendResponse({
			accepted: false,
			error: String(error)
		}));
		return true;
	}
	if (message.type === "CANCEL_TASK") {
		updateScheduler(async () => {
			const key = createTaskScopeKey(message.projectId, message.taskId);
			const task = (await projectRepository.loadProject(message.projectId))?.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
			const run = await taskRunRepository.latest(message.projectId, message.taskId);
			const providerJobId = run?.providerJobId || task?.apiJobId;
			if (providerJobId) {
				if (["team", "team_web"].includes(task.generationMode)) await cancelTeamGatewayJob(providerJobId).catch(() => void 0);
				else await apiWorkerRequest(`/jobs/${providerJobId}`, { method: "DELETE" }).catch(() => void 0);
				teamResultDownloads.delete(providerJobId);
			}
			if (run && !isTerminalRunStatus(run.status)) await persistAndBroadcast({
				type: "TASK_STATUS",
				projectId: message.projectId,
				taskId: message.taskId,
				status: "failed",
				runStatus: "canceled",
				detail: "任务已取消"
			});
			queue = cancelTask(queue, key);
			pendingScopes.delete(key);
			browserTaskMessages.delete(key);
			resumedBrowserUrls.delete(key);
			browserRecoveryReloadedAt.delete(key);
			await saveBrowserTaskMessages();
			if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
			await removeActiveScope(key);
			await tabRegistry.close(key);
		}).then(() => sendResponse({ accepted: true }), (error) => sendResponse({
			accepted: false,
			error: String(error)
		}));
		return true;
	}
	if (message.type === "OPEN_TASK_TAB") {
		Promise.all([projectRepository.loadProject(message.projectId), taskRunRepository.latest(message.projectId, message.taskId)]).then(([project, run]) => {
			const task = project?.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
			return tabRegistry.open(createTaskScopeKey(message.projectId, message.taskId), run?.conversationUrl ?? (task?.kind === "task" ? task.conversationUrl : void 0));
		});
		sendResponse({ accepted: true });
		return true;
	}
	if (message.type === "CLOSE_TASK_TAB") {
		tabRegistry.close(createTaskScopeKey(message.projectId, message.taskId));
		sendResponse({ accepted: true });
		return true;
	}
	if (message.type === "HIBERNATE_TASK_TABS") {
		(async () => {
			await schedulerReady;
			const protectedTaskKeys = /* @__PURE__ */ new Set([...queue.waiting, ...queue.running]);
			const taskKeys = message.taskIds.map((taskId) => createTaskScopeKey(message.projectId, taskId)).filter((taskKey) => !protectedTaskKeys.has(taskKey));
			sendResponse({ released: await tabRegistry.hibernateMany(taskKeys) });
		})().catch(() => sendResponse({ error: "释放网页标签失败" }));
		return true;
	}
	if (message.type === "DOWNLOAD_ASSET") {
		projectRepository.loadAsset(message.assetId).then(async (blob) => {
			if (!blob) throw new Error("找不到需要下载的图片");
			const url = `data:${blob.type || "image/png"};base64,${bytesToBase64(await blob.arrayBuffer())}`;
			await chrome.downloads.download({
				url,
				filename: message.fileName ?? `GPT\u8282\u70B9\u753B\u5E03/${message.assetId}.png`,
				saveAs: true
			});
		});
		sendResponse({ accepted: true });
		return true;
	}
	if ((message.type === "TASK_STATUS" || message.type === "TASK_RESULT" || message.type === "TASK_ERROR") && !message.persisted) {
		handlePageTaskMessage(message, sender.tab).then((accepted) => sendResponse({ accepted }), (error) => sendResponse({
			accepted: false,
			error: String(error)
		}));
		return true;
	}
	if (message.type === "SHOW_NOTIFICATION") chrome.notifications.create(createTaskNotificationId(message.projectId, message.taskId), {
		type: "basic",
		iconUrl: chrome.runtime.getURL("icon.svg"),
		title: message.title,
		message: message.message
	});
	return false;
});
reconcileSchedulerSnapshot().then(() => recoverInterruptedApiTasks()).then(() => updateScheduler(async () => void 0));
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === API_RECOVERY_ALARM) reconcileCompletedApiTasks();
	if (alarm.name === BROWSER_RESULT_RECOVERY_ALARM) reconcileBrowserTaskResults();
	if (alarm.name === TEAM_WEB_WORKER_ALARM) teamWebWorkerTick();
});
chrome.notifications.onClicked.addListener((notificationId) => {
	const url = notificationIdToCanvasUrl(notificationId, chrome.runtime.getURL("index.html"));
	chrome.tabs.create({ url });
});
//#endregion
