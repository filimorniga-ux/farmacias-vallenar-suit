(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/actions/data:dc179d [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"00e784d5c5f2ec456092b35d28d82364fccfd88096":"fetchInventory"},"src/actions/sync.ts",""] */ __turbopack_context__.s([
    "fetchInventory",
    ()=>fetchInventory
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
"use turbopack no side effects";
;
var fetchInventory = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("00e784d5c5f2ec456092b35d28d82364fccfd88096", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "fetchInventory"); //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vc3luYy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHNlcnZlcic7XG5cbmltcG9ydCB7IHF1ZXJ5IH0gZnJvbSAnLi4vbGliL2RiJztcbmltcG9ydCB7IEludmVudG9yeUJhdGNoLCBFbXBsb3llZVByb2ZpbGUgfSBmcm9tICcuLi9kb21haW4vdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hJbnZlbnRvcnkoKTogUHJvbWlzZTxJbnZlbnRvcnlCYXRjaFtdPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcXVlcnkoJ1NFTEVDVCAqIEZST00gcHJvZHVjdG9zJyk7XG5cbiAgICAgICAgLy8gTWFwIERCIGNvbHVtbnMgdG8gRG9tYWluIFR5cGVcbiAgICAgICAgLy8gQXNzdW1pbmcgREIgY29sdW1ucyBtaWdodCBiZSBzbmFrZV9jYXNlIG9yIHNsaWdodGx5IGRpZmZlcmVudC4gXG4gICAgICAgIC8vIFdlIG1hcCB3aGF0IHdlIGNhbiBhbmQgZGVmYXVsdCB0aGUgcmVzdCBmb3Igc2FmZXR5LlxuICAgICAgICByZXR1cm4gcmVzLnJvd3MubWFwKChyb3c6IGFueSkgPT4gKHtcbiAgICAgICAgICAgIGlkOiByb3cuaWQ/LnRvU3RyaW5nKCkgfHwgYFBST0QtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBza3U6IHJvdy5za3UgfHwgcm93LmNvZGlnbyB8fCAnVU5LTk9XTicsXG4gICAgICAgICAgICBuYW1lOiByb3cubm9tYnJlIHx8IHJvdy5uYW1lIHx8ICdTaW4gTm9tYnJlJyxcbiAgICAgICAgICAgIGRjaTogcm93LmRjaSB8fCByb3cucHJpbmNpcGlvX2FjdGl2byB8fCAnJyxcbiAgICAgICAgICAgIC8vIGxvdF9udW1iZXIgaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGV4cGlyeV9kYXRlOiByb3cudmVuY2ltaWVudG8gPyBuZXcgRGF0ZShyb3cudmVuY2ltaWVudG8pLmdldFRpbWUoKSA6IERhdGUubm93KCkgKyAzMTUzNjAwMDAwMCxcbiAgICAgICAgICAgIGNhdGVnb3J5OiAocm93LmNhdGVnb3J5IHx8IHJvdy5jYXRlZ29yaWEpIGFzIGFueSwgLy8gVXNlIHJvdy5jYXRlZ29yeSBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIHJvdy5jYXRlZ29yaWFcbiAgICAgICAgICAgIGNvbmRpdGlvbjogKHJvdy5zYWxlX2NvbmRpdGlvbiB8fCByb3cuY29uZGljaW9uX3ZlbnRhKSBhcyBhbnksIC8vIE1hcCBEQiBjb2x1bW4gdG8gbmV3IGZpZWxkIG5hbWUsIGZhbGxiYWNrIHRvIG9sZCBEQiBmaWVsZFxuICAgICAgICAgICAgLy8gc3RvcmFnZV9jb25kaXRpb24gaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGFsbG93c19jb21taXNzaW9uOiByb3cuYWxsb3dzX2NvbW1pc3Npb24gfHwgcm93LnBlcm1pdGVfY29taXNpb24gfHwgZmFsc2UsXG4gICAgICAgICAgICBhY3RpdmVfaW5ncmVkaWVudHM6IHJvdy5hY3RpdmVfaW5ncmVkaWVudHMgfHwgcm93LnByaW5jaXBpb3NfYWN0aXZvcyA/IChBcnJheS5pc0FycmF5KHJvdy5wcmluY2lwaW9zX2FjdGl2b3MpID8gcm93LnByaW5jaXBpb3NfYWN0aXZvcyA6IFtyb3cucHJpbmNpcGlvc19hY3Rpdm9zXSkgOiBbXSxcbiAgICAgICAgICAgIGlzX2Jpb2VxdWl2YWxlbnQ6IHJvdy5pc19iaW9lcXVpdmFsZW50IHx8IHJvdy5lc19iaW9lcXVpdmFsZW50ZSB8fCBmYWxzZSxcbiAgICAgICAgICAgIHN0b2NrX2FjdHVhbDogTnVtYmVyKHJvdy5zdG9ja19hY3R1YWwgfHwgcm93LnN0b2NrKSB8fCAwLFxuICAgICAgICAgICAgc3RvY2tfbWluOiBOdW1iZXIocm93LnN0b2NrX21pbiB8fCByb3cuc3RvY2tfbWluKSB8fCA1LFxuICAgICAgICAgICAgc3RvY2tfbWF4OiBOdW1iZXIocm93LnN0b2NrX21heCkgfHwgMTAwLCAvLyBOZXcgZmllbGRcbiAgICAgICAgICAgIHByaWNlOiBOdW1iZXIocm93LnByaWNlIHx8IHJvdy5wcmVjaW8pIHx8IDAsXG4gICAgICAgICAgICBjb3N0X3ByaWNlOiBOdW1iZXIocm93LmNvc3RfcHJpY2UpIHx8IDAsIC8vIE5ldyBmaWVsZFxuICAgICAgICAgICAgc3VwcGxpZXJfaWQ6IHJvdy5zdXBwbGllcl9pZCB8fCByb3cucHJvdmVlZG9yX2lkIHx8ICdTVVAtMDAxJyxcbiAgICAgICAgICAgIGxvY2F0aW9uX2lkOiByb3cubG9jYXRpb25faWQgfHwgJ0JPREVHQV9DRU5UUkFMJyAvLyBOZXcgZmllbGQgd2l0aCBkZWZhdWx0XG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBpbnZlbnRvcnk6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hFbXBsb3llZXMoKTogUHJvbWlzZTxFbXBsb3llZVByb2ZpbGVbXT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHVzZXJzJyk7XG5cbiAgICAgICAgcmV0dXJuIHJlcy5yb3dzLm1hcCgocm93OiBhbnkpID0+ICh7XG4gICAgICAgICAgICBpZDogcm93LmlkPy50b1N0cmluZygpIHx8IGBFTVAtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBydXQ6IHJvdy5ydXQgfHwgJ1VOS05PV04nLFxuICAgICAgICAgICAgbmFtZTogcm93Lm5vbWJyZSB8fCByb3cubmFtZSB8fCAnU2luIE5vbWJyZScsXG4gICAgICAgICAgICByb2xlOiByb3cucm9sIHx8ICdDQVNISUVSJywgLy8gRGVmYXVsdCB0byBzYWZlc3Qgcm9sZVxuICAgICAgICAgICAgYWNjZXNzX3Bpbjogcm93LnBpbiB8fCAnMDAwMCcsXG4gICAgICAgICAgICBsYWJvcl9kYXRhOiB7XG4gICAgICAgICAgICAgICAgYmFzZV9zYWxhcnk6IHBhcnNlRmxvYXQocm93LmJhc2Vfc2FsYXJ5KSxcbiAgICAgICAgICAgICAgICBhZnA6IHJvdy5hZnAsXG4gICAgICAgICAgICAgICAgaXNhcHJlOiByb3cuaXNhcHJlLFxuICAgICAgICAgICAgICAgIGNvbnRyYWN0X2hvdXJzOiA0NSAvLyBEZWZhdWx0IHRvIDQ1IGhvdXJzXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RhdHVzOiByb3cuc3RhdHVzLFxuICAgICAgICAgICAgY3VycmVudF9zdGF0dXM6ICdPVVQnIC8vIERlZmF1bHQgc3RhdHVzXG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBlbXBsb3llZXM6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIyUkFLc0IifQ==
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/actions/data:8c4d94 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"00346fc19a5a497002ca66cbb9f34c6abb27d97160":"fetchEmployees"},"src/actions/sync.ts",""] */ __turbopack_context__.s([
    "fetchEmployees",
    ()=>fetchEmployees
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
"use turbopack no side effects";
;
var fetchEmployees = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("00346fc19a5a497002ca66cbb9f34c6abb27d97160", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "fetchEmployees"); //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vc3luYy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHNlcnZlcic7XG5cbmltcG9ydCB7IHF1ZXJ5IH0gZnJvbSAnLi4vbGliL2RiJztcbmltcG9ydCB7IEludmVudG9yeUJhdGNoLCBFbXBsb3llZVByb2ZpbGUgfSBmcm9tICcuLi9kb21haW4vdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hJbnZlbnRvcnkoKTogUHJvbWlzZTxJbnZlbnRvcnlCYXRjaFtdPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcXVlcnkoJ1NFTEVDVCAqIEZST00gcHJvZHVjdG9zJyk7XG5cbiAgICAgICAgLy8gTWFwIERCIGNvbHVtbnMgdG8gRG9tYWluIFR5cGVcbiAgICAgICAgLy8gQXNzdW1pbmcgREIgY29sdW1ucyBtaWdodCBiZSBzbmFrZV9jYXNlIG9yIHNsaWdodGx5IGRpZmZlcmVudC4gXG4gICAgICAgIC8vIFdlIG1hcCB3aGF0IHdlIGNhbiBhbmQgZGVmYXVsdCB0aGUgcmVzdCBmb3Igc2FmZXR5LlxuICAgICAgICByZXR1cm4gcmVzLnJvd3MubWFwKChyb3c6IGFueSkgPT4gKHtcbiAgICAgICAgICAgIGlkOiByb3cuaWQ/LnRvU3RyaW5nKCkgfHwgYFBST0QtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBza3U6IHJvdy5za3UgfHwgcm93LmNvZGlnbyB8fCAnVU5LTk9XTicsXG4gICAgICAgICAgICBuYW1lOiByb3cubm9tYnJlIHx8IHJvdy5uYW1lIHx8ICdTaW4gTm9tYnJlJyxcbiAgICAgICAgICAgIGRjaTogcm93LmRjaSB8fCByb3cucHJpbmNpcGlvX2FjdGl2byB8fCAnJyxcbiAgICAgICAgICAgIC8vIGxvdF9udW1iZXIgaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGV4cGlyeV9kYXRlOiByb3cudmVuY2ltaWVudG8gPyBuZXcgRGF0ZShyb3cudmVuY2ltaWVudG8pLmdldFRpbWUoKSA6IERhdGUubm93KCkgKyAzMTUzNjAwMDAwMCxcbiAgICAgICAgICAgIGNhdGVnb3J5OiAocm93LmNhdGVnb3J5IHx8IHJvdy5jYXRlZ29yaWEpIGFzIGFueSwgLy8gVXNlIHJvdy5jYXRlZ29yeSBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIHJvdy5jYXRlZ29yaWFcbiAgICAgICAgICAgIGNvbmRpdGlvbjogKHJvdy5zYWxlX2NvbmRpdGlvbiB8fCByb3cuY29uZGljaW9uX3ZlbnRhKSBhcyBhbnksIC8vIE1hcCBEQiBjb2x1bW4gdG8gbmV3IGZpZWxkIG5hbWUsIGZhbGxiYWNrIHRvIG9sZCBEQiBmaWVsZFxuICAgICAgICAgICAgLy8gc3RvcmFnZV9jb25kaXRpb24gaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGFsbG93c19jb21taXNzaW9uOiByb3cuYWxsb3dzX2NvbW1pc3Npb24gfHwgcm93LnBlcm1pdGVfY29taXNpb24gfHwgZmFsc2UsXG4gICAgICAgICAgICBhY3RpdmVfaW5ncmVkaWVudHM6IHJvdy5hY3RpdmVfaW5ncmVkaWVudHMgfHwgcm93LnByaW5jaXBpb3NfYWN0aXZvcyA/IChBcnJheS5pc0FycmF5KHJvdy5wcmluY2lwaW9zX2FjdGl2b3MpID8gcm93LnByaW5jaXBpb3NfYWN0aXZvcyA6IFtyb3cucHJpbmNpcGlvc19hY3Rpdm9zXSkgOiBbXSxcbiAgICAgICAgICAgIGlzX2Jpb2VxdWl2YWxlbnQ6IHJvdy5pc19iaW9lcXVpdmFsZW50IHx8IHJvdy5lc19iaW9lcXVpdmFsZW50ZSB8fCBmYWxzZSxcbiAgICAgICAgICAgIHN0b2NrX2FjdHVhbDogTnVtYmVyKHJvdy5zdG9ja19hY3R1YWwgfHwgcm93LnN0b2NrKSB8fCAwLFxuICAgICAgICAgICAgc3RvY2tfbWluOiBOdW1iZXIocm93LnN0b2NrX21pbiB8fCByb3cuc3RvY2tfbWluKSB8fCA1LFxuICAgICAgICAgICAgc3RvY2tfbWF4OiBOdW1iZXIocm93LnN0b2NrX21heCkgfHwgMTAwLCAvLyBOZXcgZmllbGRcbiAgICAgICAgICAgIHByaWNlOiBOdW1iZXIocm93LnByaWNlIHx8IHJvdy5wcmVjaW8pIHx8IDAsXG4gICAgICAgICAgICBjb3N0X3ByaWNlOiBOdW1iZXIocm93LmNvc3RfcHJpY2UpIHx8IDAsIC8vIE5ldyBmaWVsZFxuICAgICAgICAgICAgc3VwcGxpZXJfaWQ6IHJvdy5zdXBwbGllcl9pZCB8fCByb3cucHJvdmVlZG9yX2lkIHx8ICdTVVAtMDAxJyxcbiAgICAgICAgICAgIGxvY2F0aW9uX2lkOiByb3cubG9jYXRpb25faWQgfHwgJ0JPREVHQV9DRU5UUkFMJyAvLyBOZXcgZmllbGQgd2l0aCBkZWZhdWx0XG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBpbnZlbnRvcnk6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hFbXBsb3llZXMoKTogUHJvbWlzZTxFbXBsb3llZVByb2ZpbGVbXT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHVzZXJzJyk7XG5cbiAgICAgICAgcmV0dXJuIHJlcy5yb3dzLm1hcCgocm93OiBhbnkpID0+ICh7XG4gICAgICAgICAgICBpZDogcm93LmlkPy50b1N0cmluZygpIHx8IGBFTVAtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBydXQ6IHJvdy5ydXQgfHwgJ1VOS05PV04nLFxuICAgICAgICAgICAgbmFtZTogcm93Lm5vbWJyZSB8fCByb3cubmFtZSB8fCAnU2luIE5vbWJyZScsXG4gICAgICAgICAgICByb2xlOiByb3cucm9sIHx8ICdDQVNISUVSJywgLy8gRGVmYXVsdCB0byBzYWZlc3Qgcm9sZVxuICAgICAgICAgICAgYWNjZXNzX3Bpbjogcm93LnBpbiB8fCAnMDAwMCcsXG4gICAgICAgICAgICBsYWJvcl9kYXRhOiB7XG4gICAgICAgICAgICAgICAgYmFzZV9zYWxhcnk6IHBhcnNlRmxvYXQocm93LmJhc2Vfc2FsYXJ5KSxcbiAgICAgICAgICAgICAgICBhZnA6IHJvdy5hZnAsXG4gICAgICAgICAgICAgICAgaXNhcHJlOiByb3cuaXNhcHJlLFxuICAgICAgICAgICAgICAgIGNvbnRyYWN0X2hvdXJzOiA0NSAvLyBEZWZhdWx0IHRvIDQ1IGhvdXJzXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RhdHVzOiByb3cuc3RhdHVzLFxuICAgICAgICAgICAgY3VycmVudF9zdGF0dXM6ICdPVVQnIC8vIERlZmF1bHQgc3RhdHVzXG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBlbXBsb3llZXM6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIyUkF1Q3NCIn0=
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/clinicalAgent.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ClinicalAgent",
    ()=>ClinicalAgent
]);
// Base de conocimientos simplificada para MVP
const CONTRAINDICATIONS = {
    HYPERTENSION: [
        'Pseudoefedrina',
        'Fenilefrina',
        'Sodio'
    ],
    PREGNANT: [
        'Ibuprofeno',
        'Naproxeno',
        'Isotretinoína',
        'Warfarina'
    ],
    DIABETIC: [
        'Jarabe con Azúcar',
        'Dextrometorfano (con azúcar)'
    ]
};
const CROSS_SELLING_RULES = [
    {
        trigger: 'Antibiótico',
        suggestion: 'Probiótico (Bioflora/Perenteryl) para proteger flora intestinal.'
    },
    {
        trigger: 'Pañales',
        suggestion: 'Crema para coceduras (Hipoglós/Pasta Lassar).'
    },
    {
        trigger: 'Cepillo Dental',
        suggestion: 'Pasta Dental o Hilo Dental.'
    },
    {
        trigger: 'Invierno',
        suggestion: 'Vitamina C o Propóleo.'
    }
];
class ClinicalAgent {
    /**
     * Analiza el carrito en busca de interacciones peligrosas con el perfil del paciente.
     */ static analyzeCart(cart, customer) {
        let result = {
            status: 'SAFE',
            message: 'Análisis Clínico: OK'
        };
        const blockingItems = [];
        const suggestedItems = [];
        // let result: ClinicalAnalysisResult = { status: 'SAFE', message: 'Análisis Clínico: OK' }; // This line was removed in the provided diff
        // const blockingItems: string[] = []; // This line was removed in the provided diff
        // const suggestedItems: string[] = []; // This line was removed in the provided diff
        // 1. Análisis de Contraindicaciones (Solo si hay cliente identificado)
        if (customer) {
            cart.forEach((item)=>{
                // Revisar Hipertensión
                if (customer.health_tags.includes('HYPERTENSION')) {
                    const conflict = CONTRAINDICATIONS.HYPERTENSION.find((drug)=>item.name.includes(drug) || item.active_ingredients?.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (Contiene ${conflict})`);
                    }
                }
                // Revisar Embarazo
                if (customer.health_tags.includes('PREGNANT')) {
                    const conflict = CONTRAINDICATIONS.PREGNANT.find((drug)=>item.name.includes(drug) || item.active_ingredients?.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (Riesgo en Embarazo: ${conflict})`);
                    }
                }
                // Revisar Diabetes
                if (customer.health_tags.includes('DIABETIC')) {
                    const conflict = CONTRAINDICATIONS.DIABETIC.find((drug)=>item.name.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (No apto para diabéticos)`);
                    }
                }
            });
        }
        // 2. Lógica de Cross-Selling (Independiente del cliente)
        cart.forEach((item)=>{
            CROSS_SELLING_RULES.forEach((rule)=>{
                if (item.name.includes(rule.trigger) || item.active_ingredients?.includes(rule.trigger)) {
                    if (!suggestedItems.includes(rule.suggestion)) {
                        suggestedItems.push(rule.suggestion);
                    }
                }
            });
        });
        // 3. Construir Resultado
        if (blockingItems.length > 0) {
            result.status = 'BLOCK';
            result.message = `⛔ ALERTA DE SEGURIDAD: Interacción detectada.`;
            result.blocking_items = blockingItems;
        } else if (suggestedItems.length > 0) {
            // Si es seguro pero hay sugerencias, cambiamos mensaje (opcional, mantenemos SAFE si no hay warning)
            result.message = 'Venta Segura. Ver sugerencias.';
        }
        result.suggested_items = suggestedItems;
        return result;
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/purchasingAgent.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PurchasingAgent",
    ()=>PurchasingAgent
]);
const PurchasingAgent = {
    /**
     * Calcula la velocidad de venta diaria (Mock simple para MVP).
     * En producción, esto vendría de un análisis histórico de transacciones.
     */ calculateDailyVelocity (sku) {
        // Simulación: Genera un número entre 0.5 y 5 unidades diarias
        // Usamos el SKU para que sea determinista (mismo SKU siempre da mismo resultado)
        const hash = sku.split('').reduce((acc, char)=>acc + char.charCodeAt(0), 0);
        return hash % 10 / 2 + 0.5;
    },
    /**
     * Genera sugerencias de reabastecimiento agrupadas por proveedor.
     * Regla: Si Stock Actual < (Velocidad * LeadTime * 1.5 SafetyFactor), pedir para cubrir 15 días.
     */ generateSuggestions (inventory, suppliers) {
        const suggestions = [];
        const itemsBySupplier = {};
        inventory.forEach((item)=>{
            const velocity = this.calculateDailyVelocity(item.sku);
            const supplier = suppliers.find((s)=>s.id === item.supplier_id);
            const leadTime = supplier ? supplier.lead_time_days : 3; // Default 3 días
            const safetyStock = velocity * leadTime * 1.5;
            // 3. Check for expiring batches (FEFO)
            const expiringBatches = inventory.filter((b)=>b.sku === item.sku && b.expiry_date < Date.now() + 90 * 24 * 60 * 60 * 1000);
            if (expiringBatches.length > 0) {
                suggestions.push({
                    id: `PO-${Date.now()}-${item.sku}`,
                    supplier_id: 'SUP-001',
                    items: [
                        {
                            sku: item.sku,
                            name: item.name,
                            quantity: Math.max(50, Math.ceil(velocity * 30)),
                            cost_price: item.price * 0.6
                        }
                    ],
                    status: 'DRAFT',
                    created_at: Date.now(),
                    total_estimated: 0
                });
            }
            const reorderPoint = safetyStock;
            if (item.stock_actual <= reorderPoint) {
                const supplierId = item.supplier_id || 'SUP-001';
                if (!itemsBySupplier[supplierId]) {
                    itemsBySupplier[supplierId] = [];
                }
                itemsBySupplier[supplierId].push({
                    sku: item.sku,
                    name: item.name,
                    quantity: Math.max(50, Math.ceil(velocity * 15)),
                    cost_price: item.price * 0.6
                });
            }
        }); // Convertir agrupación a objetos PurchaseOrder
        Object.keys(itemsBySupplier).forEach((supplierId)=>{
            suggestions.push({
                id: `PO-SUG-${Date.now()}-${supplierId.substring(0, 3)}`,
                supplier_id: supplierId,
                created_at: Date.now(),
                status: 'SUGGESTED',
                items: itemsBySupplier[supplierId],
                total_estimated: 0 // Se calcularía con costos reales
            });
        });
        return suggestions;
    }
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/security/roles.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ROLES",
    ()=>ROLES,
    "canOverride",
    ()=>canOverride,
    "hasPermission",
    ()=>hasPermission
]);
const ROLES = {
    MANAGER: 'Gerente General',
    ADMIN: 'Administrador',
    CASHIER: 'Cajero',
    WAREHOUSE: 'Bodeguero',
    QF: 'Químico Farmacéutico'
};
const ROLE_PERMISSIONS = {
    MANAGER: [
        'MANAGE_USERS',
        'VIEW_HR',
        'MANAGE_INVENTORY',
        'VIEW_INVENTORY',
        'ADJUST_STOCK',
        'PROCESS_SALE',
        'VOID_SALE',
        'MANAGE_SHIFTS',
        'VIEW_REPORTS',
        'MANAGE_SUPPLIERS'
    ],
    ADMIN: [
        'MANAGE_INVENTORY',
        'VIEW_INVENTORY',
        'ADJUST_STOCK',
        'PROCESS_SALE',
        'VOID_SALE',
        'MANAGE_SHIFTS',
        'VIEW_REPORTS',
        'MANAGE_SUPPLIERS'
    ],
    QF: [
        'MANAGE_INVENTORY',
        'VIEW_INVENTORY',
        'ADJUST_STOCK',
        'PROCESS_SALE',
        'VOID_SALE',
        'MANAGE_SHIFTS',
        'VIEW_REPORTS',
        'MANAGE_SUPPLIERS'
    ],
    CASHIER: [
        'PROCESS_SALE',
        'VIEW_INVENTORY'
    ],
    WAREHOUSE: [
        'VIEW_INVENTORY',
        'ADJUST_STOCK',
        'MANAGE_SUPPLIERS'
    ]
};
const hasPermission = (user, permission)=>{
    if (!user) return false;
    // Check Role Permissions
    const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
    if (rolePermissions.includes(permission)) return true;
    // Check Custom Module Permissions (if any)
    if (user.allowed_modules?.includes(permission)) return true;
    return false;
};
const canOverride = (user)=>{
    return user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'QF';
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/sii/crypto.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * SII Cryptography Service
 * 
 * IMPORTANT: This service requires the following npm packages:
 * - node-forge (for PFX parsing and signing)
 * - xml-crypto (for XML-DSig)
 * - xmldom (for XML parsing)
 * 
 * Install with: npm install node-forge xml-crypto @xmldom/xmldom
 * 
 * This is a STRUCTURE/STUB. The actual cryptographic implementation
 * requires careful testing against SII specifications.
 */ // TODO: Install dependencies
// import * as forge from 'node-forge';
// import { SignedXml } from 'xml-crypto';
// import { DOMParser } from '@xmldom/xmldom';
__turbopack_context__.s([
    "signXML",
    ()=>signXML,
    "validateCertificate",
    ()=>validateCertificate
]);
async function signXML(xmlBody, pfxBase64, password) {
    try {
        // TODO: Implement actual signing logic
        // 1. Decode base64 PFX
        // const pfxDer = forge.util.decode64(pfxBase64);
        // const pfxAsn1 = forge.asn1.fromDer(pfxDer);
        // const pkcs12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);
        // 2. Extract private key and certificate
        // const bags = pkcs12.getBags({ bagType: forge.pki.oids.certBag });
        // const cert = bags[forge.pki.oids.certBag][0].cert;
        // const keyBags = pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        // const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
        // 3. Sign XML according to SII specs
        // const sig = new SignedXml();
        // sig.addReference("//*[local-name(.)='Documento']", ["...transforms..."], "...");
        // sig.signingKey = privateKey;
        // sig.computeSignature(xmlBody);
        // STUB: Return mock signed XML for now
        console.warn('⚠️  Using STUB XML signing. Implement real signing before production!');
        return {
            success: true,
            signedXml: `<!--MOCK_SIGNED-->${xmlBody}`
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during signing'
        };
    }
}
async function validateCertificate(pfxBase64, password) {
    try {
        // TODO: Implement certificate validation
        // const pfxDer = forge.util.decode64(pfxBase64);
        // const pfxAsn1 = forge.asn1.fromDer(pfxDer);
        // const pkcs12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);
        // const bags = pkcs12.getBags({ bagType: forge.pki.oids.certBag });
        // const cert = bags[forge.pki.oids.certBag][0].cert;
        // STUB: Return mock validation
        console.warn('⚠️  Using STUB certificate validation.');
        return {
            valid: true,
            commonName: 'DEMO CERTIFICATE',
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
        };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Invalid certificate or password'
        };
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/analytics/FinancialService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FinancialService",
    ()=>FinancialService
]);
class FinancialService {
    static filterByDateRange(items, start, end) {
        const startTime = start.getTime();
        const endTime = end.getTime();
        return items.filter((item)=>{
            const time = item.date || item.timestamp || 0;
            return time >= startTime && time <= endTime;
        });
    }
    static getSalesSummary(sales) {
        let grossSales = 0;
        let netSales = 0; // Ventas menos IVA (aprox 19%)
        let paymentMethods = {
            CASH: 0,
            DEBIT: 0,
            CREDIT: 0,
            TRANSFER: 0
        };
        sales.forEach((sale)=>{
            grossSales += sale.total;
            paymentMethods[sale.payment_method] = (paymentMethods[sale.payment_method] || 0) + sale.total;
        });
        netSales = Math.round(grossSales / 1.19);
        return {
            grossSales,
            netSales,
            paymentMethods
        };
    }
    static getExpensesSummary(expenses) {
        let totalExpenses = 0;
        let deductibleExpenses = 0;
        let nonDeductibleExpenses = 0;
        let byCategory = {};
        expenses.forEach((expense)=>{
            totalExpenses += expense.amount;
            if (expense.is_deductible) {
                deductibleExpenses += expense.amount;
            } else {
                nonDeductibleExpenses += expense.amount;
            }
            byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
        });
        return {
            totalExpenses,
            deductibleExpenses,
            nonDeductibleExpenses,
            byCategory
        };
    }
    static calculateEBITDA(grossSales, totalExpenses) {
        // Simplificación: EBITDA = Ventas - Gastos (sin considerar depreciación/amortización por ahora)
        return grossSales - totalExpenses;
    }
    static getTaxCompliance(sales, expenses, ppmRate = 0.015) {
        const salesSummary = this.getSalesSummary(sales);
        const expensesSummary = this.getExpensesSummary(expenses);
        const debitFiscal = salesSummary.grossSales - salesSummary.netSales; // IVA Ventas
        // Asumimos que el 100% de los gastos deducibles tienen IVA recuperable para simplificar, 
        // o deberíamos filtrar solo facturas de compra.
        // Refinamiento: Solo gastos con document_type === 'FACTURA' generan crédito fiscal.
        const facturaExpenses = expenses.filter((e)=>e.document_type === 'FACTURA');
        const creditFiscal = Math.round(facturaExpenses.reduce((sum, e)=>sum + e.amount, 0) * 0.19 / 1.19); // Extraer IVA de monto bruto
        const ivaToPay = Math.max(0, debitFiscal - creditFiscal);
        const ppm = Math.round(salesSummary.netSales * ppmRate);
        return {
            debitFiscal,
            creditFiscal,
            ivaToPay,
            ppm,
            nonDeductibleWarning: expensesSummary.nonDeductibleExpenses
        };
    }
    static getLaborCosts(employees) {
        let totalSalaries = 0;
        let totalSocialLaws = 0; // Aprox 20% sobre imponible (simplificado)
        let totalCost = 0;
        employees.forEach((emp)=>{
            if (emp.status === 'ACTIVE') {
                const salary = emp.base_salary || 0;
                totalSalaries += salary;
                // Estimación costo empresa: Sueldo Líquido + ~20-25% leyes sociales
                // Aquí usamos base_salary como "Sueldo Base Imponible"
                const socialLaws = Math.round(salary * 0.22);
                totalSocialLaws += socialLaws;
                totalCost += salary + socialLaws;
            }
        });
        return {
            totalSalaries,
            totalSocialLaws,
            totalCost
        };
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/infrastructure/biometrics/WebAuthnService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// src/infrastructure/biometrics/WebAuthnService.ts
__turbopack_context__.s([
    "WebAuthnService",
    ()=>WebAuthnService
]);
class WebAuthnService {
    // Simula el registro de una credencial biométrica
    static async registerCredential(userId) {
        return new Promise((resolve)=>{
            console.log(`[WebAuthn] Iniciando registro para usuario: ${userId}`);
            // Simular espera del usuario tocando el sensor
            setTimeout(()=>{
                const mockCredentialId = `cred-${userId}-${Date.now()}`;
                console.log(`[WebAuthn] Credencial creada: ${mockCredentialId}`);
                resolve({
                    success: true,
                    credentialId: mockCredentialId,
                    message: 'Huella registrada correctamente.'
                });
            }, 2000); // 2 segundos de "escaneo"
        });
    }
    // Simula la verificación de una credencial
    static async verifyCredential(userId) {
        return new Promise((resolve)=>{
            console.log(`[WebAuthn] Solicitando verificación para usuario: ${userId}`);
            // Simular interacción
            setTimeout(()=>{
                // En un caso real, aquí se validaría la firma criptográfica
                const isSuccess = Math.random() > 0.1; // 90% de éxito simulado
                if (isSuccess) {
                    console.log(`[WebAuthn] Verificación exitosa.`);
                    resolve({
                        success: true,
                        message: 'Identidad verificada.'
                    });
                } else {
                    console.warn(`[WebAuthn] Fallo en verificación.`);
                    resolve({
                        success: false,
                        message: 'No se reconoció la huella. Intente nuevamente.'
                    });
                }
            }, 1500);
        });
    }
    static isAvailable() {
        // En un entorno real, verificaríamos window.PublicKeyCredential
        return true;
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/App.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react-router/dist/development/chunk-4WY6JWTD.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/layout-dashboard.js [app-client] (ecmascript) <export default as LayoutDashboard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$cart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingCart$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/shopping-cart.js [app-client] (ecmascript) <export default as ShoppingCart>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/users.js [app-client] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/log-out.js [app-client] (ecmascript) <export default as LogOut>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/menu.js [app-client] (ecmascript) <export default as Menu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/x.js [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/package.js [app-client] (ecmascript) <export default as Package>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chart-column.js [app-client] (ecmascript) <export default as BarChart3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/truck.js [app-client] (ecmascript) <export default as Truck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$user$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-user.js [app-client] (ecmascript) <export default as UserCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock.js [app-client] (ecmascript) <export default as Clock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/building-2.js [app-client] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/store/useStore.ts [app-client] (ecmascript)");
// Pages
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$LandingPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/LandingPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$POSMainScreen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/components/POSMainScreen.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplyChainPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/SupplyChainPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AccessControlPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/AccessControlPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$HRPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/HRPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SettingsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/SettingsPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ClientsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/ClientsPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$InventoryPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/InventoryPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ReportsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/ReportsPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AttendanceKioskPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/AttendanceKioskPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$WarehouseOps$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/WarehouseOps.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SuppliersPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/SuppliersPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplierProfile$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/SupplierProfile.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
const SidebarLayout = ({ children })=>{
    _s();
    const { user, logout } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"])();
    const location = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocation"])();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useState(false);
    const menuItems = [
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__["LayoutDashboard"],
            label: 'Dashboard',
            path: '/dashboard',
            roles: [
                'MANAGER',
                'QF'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shopping$2d$cart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShoppingCart$3e$__["ShoppingCart"],
            label: 'Punto de Venta',
            path: '/pos',
            roles: [
                'CASHIER',
                'QF',
                'MANAGER'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"],
            label: 'Inventario',
            path: '/inventory',
            roles: [
                'WAREHOUSE',
                'MANAGER',
                'QF'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
            label: 'Operaciones WMS',
            path: '/warehouse',
            roles: [
                'WAREHOUSE',
                'MANAGER',
                'QF'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
            label: 'Proveedores',
            path: '/suppliers',
            roles: [
                'MANAGER',
                'QF',
                'WAREHOUSE'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__["BarChart3"],
            label: 'Reportes & BI',
            path: '/reports',
            roles: [
                'MANAGER',
                'QF'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
            label: 'Abastecimiento',
            path: '/supply-chain',
            roles: [
                'WAREHOUSE',
                'MANAGER'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$user$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserCircle$3e$__["UserCircle"],
            label: 'Clientes (CRM)',
            path: '/clients',
            roles: [
                'MANAGER',
                'QF',
                'CASHIER'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"],
            label: 'Recursos Humanos',
            path: '/hr',
            roles: [
                'MANAGER'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"],
            label: 'Control Asistencia',
            path: '/access',
            roles: [
                'MANAGER'
            ]
        },
        {
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"],
            label: 'Configuración',
            path: '/settings',
            roles: [
                'MANAGER'
            ]
        }
    ];
    const filteredMenu = menuItems.filter((item)=>user && item.roles.includes(user.role));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-screen bg-slate-100 overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: `fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 shadow-2xl`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-6 flex justify-between items-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                        className: "text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500",
                                        children: [
                                            "Pharma",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-white",
                                                children: "Synapse"
                                            }, void 0, false, {
                                                fileName: "[project]/src/App.tsx",
                                                lineNumber: 52,
                                                columnNumber: 35
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 51,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-slate-400 mt-1",
                                        children: "Vallenar Suit v2.1"
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 54,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 50,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setIsMobileMenuOpen(false),
                                className: "md:hidden text-slate-400 hover:text-white",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    size: 24
                                }, void 0, false, {
                                    fileName: "[project]/src/App.tsx",
                                    lineNumber: 57,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 56,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 49,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "mt-6 px-4 space-y-2",
                        children: filteredMenu.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Link"], {
                                to: item.path,
                                onClick: ()=>setIsMobileMenuOpen(false),
                                className: `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${location.pathname === item.path ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                        size: 20
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 69,
                                        columnNumber: 29
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium",
                                        children: item.label
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 70,
                                        columnNumber: 29
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, item.path, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 63,
                                columnNumber: 25
                            }, ("TURBOPACK compile-time value", void 0)))
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 61,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute bottom-0 left-0 w-full p-4 bg-slate-950",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-3 mb-4 px-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "w-10 h-10 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400 font-bold border border-cyan-700",
                                        children: user?.name.charAt(0)
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 77,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "overflow-hidden",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-sm font-bold text-white truncate",
                                                children: user?.name
                                            }, void 0, false, {
                                                fileName: "[project]/src/App.tsx",
                                                lineNumber: 81,
                                                columnNumber: 29
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-xs text-slate-500 truncate",
                                                children: user?.role
                                            }, void 0, false, {
                                                fileName: "[project]/src/App.tsx",
                                                lineNumber: 82,
                                                columnNumber: 29
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 80,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 76,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: logout,
                                className: "w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors text-sm font-bold",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__["LogOut"], {
                                        size: 16
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 89,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    " Cerrar Sesión"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 85,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 75,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 48,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex-1 flex flex-col h-full overflow-hidden relative",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                        className: "md:hidden bg-white p-4 shadow-sm flex justify-between items-center z-40",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setIsMobileMenuOpen(true),
                                className: "text-slate-600",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__["Menu"], {
                                    size: 24
                                }, void 0, false, {
                                    fileName: "[project]/src/App.tsx",
                                    lineNumber: 99,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 98,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-bold text-slate-800",
                                children: "PharmaSynapse"
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 101,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-6"
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 102,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 97,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1 overflow-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                            mode: "wait",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                                initial: {
                                    opacity: 0,
                                    y: 10
                                },
                                animate: {
                                    opacity: 1,
                                    y: 0
                                },
                                exit: {
                                    opacity: 0,
                                    y: -10
                                },
                                transition: {
                                    duration: 0.2
                                },
                                className: "h-full",
                                children: children
                            }, location.pathname, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 107,
                                columnNumber: 25
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 106,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 105,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 95,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 46,
        columnNumber: 9
    }, ("TURBOPACK compile-time value", void 0));
};
_s(SidebarLayout, "kv6QHbfAr3GUK9mk+Tn6Gu6B8UI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLocation"]
    ];
});
_c = SidebarLayout;
const ProtectedRoute = ({ children })=>{
    _s1();
    const { user } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"])();
    if (!user) return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Navigate"], {
        to: "/",
        replace: true
    }, void 0, false, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 126,
        columnNumber: 23
    }, ("TURBOPACK compile-time value", void 0));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SidebarLayout, {
        children: children
    }, void 0, false, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 127,
        columnNumber: 12
    }, ("TURBOPACK compile-time value", void 0));
};
_s1(ProtectedRoute, "0j5OmLi9eEZXyUb+/9vprw6a8eI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"]
    ];
});
_c1 = ProtectedRoute;
const App = ()=>{
    _s2();
    const { syncData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "App.useEffect": ()=>{
            syncData();
        }
    }["App.useEffect"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BrowserRouter"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Routes"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$LandingPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 141,
                        columnNumber: 42
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 141,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/kiosk",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AttendanceKioskPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 142,
                        columnNumber: 47
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 142,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/access",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AccessControlPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 143,
                        columnNumber: 48
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 143,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/dashboard",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$POSMainScreen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 146,
                            columnNumber: 67
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 146,
                        columnNumber: 51
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 146,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                " ",
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/pos",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$POSMainScreen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 147,
                            columnNumber: 61
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 147,
                        columnNumber: 45
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 147,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/inventory",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$InventoryPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 148,
                            columnNumber: 67
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 148,
                        columnNumber: 51
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 148,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/warehouse",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$WarehouseOps$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WarehouseOps"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 149,
                            columnNumber: 67
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 149,
                        columnNumber: 51
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 149,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/suppliers",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SuppliersPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SuppliersPage"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 150,
                            columnNumber: 67
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 150,
                        columnNumber: 51
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 150,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/suppliers/:id",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplierProfile$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SupplierProfile"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 151,
                            columnNumber: 71
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 151,
                        columnNumber: 55
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 151,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/reports",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ReportsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 152,
                            columnNumber: 65
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 152,
                        columnNumber: 49
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 152,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/supply-chain",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplyChainPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 153,
                            columnNumber: 70
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 153,
                        columnNumber: 54
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 153,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/clients",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ClientsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 154,
                            columnNumber: 65
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 154,
                        columnNumber: 49
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 154,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/hr",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$HRPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 155,
                            columnNumber: 60
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 155,
                        columnNumber: 44
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 155,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "/settings",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SettingsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 156,
                            columnNumber: 66
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 156,
                        columnNumber: 50
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 156,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                    path: "*",
                    element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Navigate"], {
                        to: "/",
                        replace: true
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 158,
                        columnNumber: 42
                    }, void 0)
                }, void 0, false, {
                    fileName: "[project]/src/App.tsx",
                    lineNumber: 158,
                    columnNumber: 17
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/src/App.tsx",
            lineNumber: 139,
            columnNumber: 13
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 138,
        columnNumber: 9
    }, ("TURBOPACK compile-time value", void 0));
};
_s2(App, "X7/U67Ojl9GXiVXOdNcYJF9TsdQ=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePharmaStore"]
    ];
});
_c2 = App;
const __TURBOPACK__default__export__ = App;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "SidebarLayout");
__turbopack_context__.k.register(_c1, "ProtectedRoute");
__turbopack_context__.k.register(_c2, "App");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/App.tsx [app-client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/App.tsx [app-client] (ecmascript)"));
}),
]);

//# sourceMappingURL=src_7818b047._.js.map