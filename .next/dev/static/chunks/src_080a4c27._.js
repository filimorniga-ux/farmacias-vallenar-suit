(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/actions/data:cd6dfe [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"00e784d5c5f2ec456092b35d28d82364fccfd88096":"fetchInventory"},"src/actions/sync.ts",""] */ __turbopack_context__.s([
    "fetchInventory",
    ()=>fetchInventory
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
"use turbopack no side effects";
;
var fetchInventory = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("00e784d5c5f2ec456092b35d28d82364fccfd88096", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "fetchInventory"); //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vc3luYy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHNlcnZlcic7XG5cbmltcG9ydCB7IHF1ZXJ5IH0gZnJvbSAnLi4vbGliL2RiJztcbmltcG9ydCB7IEludmVudG9yeUJhdGNoLCBFbXBsb3llZVByb2ZpbGUgfSBmcm9tICcuLi9kb21haW4vdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hJbnZlbnRvcnkoKTogUHJvbWlzZTxJbnZlbnRvcnlCYXRjaFtdPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcXVlcnkoJ1NFTEVDVCAqIEZST00gcHJvZHVjdG9zJyk7XG5cbiAgICAgICAgLy8gTWFwIERCIGNvbHVtbnMgdG8gRG9tYWluIFR5cGVcbiAgICAgICAgLy8gQXNzdW1pbmcgREIgY29sdW1ucyBtaWdodCBiZSBzbmFrZV9jYXNlIG9yIHNsaWdodGx5IGRpZmZlcmVudC4gXG4gICAgICAgIC8vIFdlIG1hcCB3aGF0IHdlIGNhbiBhbmQgZGVmYXVsdCB0aGUgcmVzdCBmb3Igc2FmZXR5LlxuICAgICAgICByZXR1cm4gcmVzLnJvd3MubWFwKChyb3c6IGFueSkgPT4gKHtcbiAgICAgICAgICAgIGlkOiByb3cuaWQ/LnRvU3RyaW5nKCkgfHwgYFBST0QtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBza3U6IHJvdy5za3UgfHwgcm93LmNvZGlnbyB8fCAnVU5LTk9XTicsXG4gICAgICAgICAgICBuYW1lOiByb3cubm9tYnJlIHx8IHJvdy5uYW1lIHx8ICdTaW4gTm9tYnJlJyxcbiAgICAgICAgICAgIGRjaTogcm93LmRjaSB8fCByb3cucHJpbmNpcGlvX2FjdGl2byB8fCAnJyxcbiAgICAgICAgICAgIC8vIGxvdF9udW1iZXIgaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGV4cGlyeV9kYXRlOiByb3cudmVuY2ltaWVudG8gPyBuZXcgRGF0ZShyb3cudmVuY2ltaWVudG8pLmdldFRpbWUoKSA6IERhdGUubm93KCkgKyAzMTUzNjAwMDAwMCxcbiAgICAgICAgICAgIGNhdGVnb3J5OiAocm93LmNhdGVnb3J5IHx8IHJvdy5jYXRlZ29yaWEpIGFzIGFueSwgLy8gVXNlIHJvdy5jYXRlZ29yeSBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIHJvdy5jYXRlZ29yaWFcbiAgICAgICAgICAgIGNvbmRpdGlvbjogKHJvdy5zYWxlX2NvbmRpdGlvbiB8fCByb3cuY29uZGljaW9uX3ZlbnRhKSBhcyBhbnksIC8vIE1hcCBEQiBjb2x1bW4gdG8gbmV3IGZpZWxkIG5hbWUsIGZhbGxiYWNrIHRvIG9sZCBEQiBmaWVsZFxuICAgICAgICAgICAgLy8gc3RvcmFnZV9jb25kaXRpb24gaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGFsbG93c19jb21taXNzaW9uOiByb3cuYWxsb3dzX2NvbW1pc3Npb24gfHwgcm93LnBlcm1pdGVfY29taXNpb24gfHwgZmFsc2UsXG4gICAgICAgICAgICBhY3RpdmVfaW5ncmVkaWVudHM6IHJvdy5hY3RpdmVfaW5ncmVkaWVudHMgfHwgcm93LnByaW5jaXBpb3NfYWN0aXZvcyA/IChBcnJheS5pc0FycmF5KHJvdy5wcmluY2lwaW9zX2FjdGl2b3MpID8gcm93LnByaW5jaXBpb3NfYWN0aXZvcyA6IFtyb3cucHJpbmNpcGlvc19hY3Rpdm9zXSkgOiBbXSxcbiAgICAgICAgICAgIGlzX2Jpb2VxdWl2YWxlbnQ6IHJvdy5pc19iaW9lcXVpdmFsZW50IHx8IHJvdy5lc19iaW9lcXVpdmFsZW50ZSB8fCBmYWxzZSxcbiAgICAgICAgICAgIHN0b2NrX2FjdHVhbDogTnVtYmVyKHJvdy5zdG9ja19hY3R1YWwgfHwgcm93LnN0b2NrKSB8fCAwLFxuICAgICAgICAgICAgc3RvY2tfbWluOiBOdW1iZXIocm93LnN0b2NrX21pbiB8fCByb3cuc3RvY2tfbWluKSB8fCA1LFxuICAgICAgICAgICAgc3RvY2tfbWF4OiBOdW1iZXIocm93LnN0b2NrX21heCkgfHwgMTAwLCAvLyBOZXcgZmllbGRcbiAgICAgICAgICAgIHByaWNlOiBOdW1iZXIocm93LnByaWNlIHx8IHJvdy5wcmVjaW8pIHx8IDAsXG4gICAgICAgICAgICBjb3N0X3ByaWNlOiBOdW1iZXIocm93LmNvc3RfcHJpY2UpIHx8IDAsIC8vIE5ldyBmaWVsZFxuICAgICAgICAgICAgc3VwcGxpZXJfaWQ6IHJvdy5zdXBwbGllcl9pZCB8fCByb3cucHJvdmVlZG9yX2lkIHx8ICdTVVAtMDAxJyxcbiAgICAgICAgICAgIGxvY2F0aW9uX2lkOiByb3cubG9jYXRpb25faWQgfHwgJ0JPREVHQV9DRU5UUkFMJyAvLyBOZXcgZmllbGQgd2l0aCBkZWZhdWx0XG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBpbnZlbnRvcnk6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hFbXBsb3llZXMoKTogUHJvbWlzZTxFbXBsb3llZVByb2ZpbGVbXT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHVzZXJzJyk7XG5cbiAgICAgICAgcmV0dXJuIHJlcy5yb3dzLm1hcCgocm93OiBhbnkpID0+ICh7XG4gICAgICAgICAgICBpZDogcm93LmlkPy50b1N0cmluZygpIHx8IGBFTVAtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBydXQ6IHJvdy5ydXQgfHwgJ1NJTi1SVVQnLFxuICAgICAgICAgICAgbmFtZTogcm93Lm5hbWUgfHwgJ1VzdWFyaW8gU2lzdGVtYScsXG4gICAgICAgICAgICByb2xlOiByb3cucm9sZSB8fCAnQ0FTSElFUicsXG4gICAgICAgICAgICBhY2Nlc3NfcGluOiByb3cucGluIHx8ICcwMDAwJyxcbiAgICAgICAgICAgIHN0YXR1czogcm93LnN0YXR1cyB8fCAnQUNUSVZFJyxcbiAgICAgICAgICAgIGN1cnJlbnRfc3RhdHVzOiAnT1VUJyxcbiAgICAgICAgICAgIGpvYl90aXRsZTogJ0NBSkVST19WRU5ERURPUicsIC8vIERlZmF1bHQgZm9yIHN5bmNcbiAgICAgICAgICAgIGxhYm9yX2RhdGE6IHtcbiAgICAgICAgICAgICAgICBiYXNlX3NhbGFyeTogNTAwMDAwLFxuICAgICAgICAgICAgICAgIGFmcDogJ01PREVMTycsXG4gICAgICAgICAgICAgICAgaXNhcHJlOiAnRk9OQVNBJyxcbiAgICAgICAgICAgICAgICBjb250cmFjdF9ob3VyczogNDVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIGVtcGxveWVlczonLCBlcnJvcik7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjJSQUtzQiJ9
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/actions/data:50187d [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"00346fc19a5a497002ca66cbb9f34c6abb27d97160":"fetchEmployees"},"src/actions/sync.ts",""] */ __turbopack_context__.s([
    "fetchEmployees",
    ()=>fetchEmployees
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
"use turbopack no side effects";
;
var fetchEmployees = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("00346fc19a5a497002ca66cbb9f34c6abb27d97160", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "fetchEmployees"); //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vc3luYy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHNlcnZlcic7XG5cbmltcG9ydCB7IHF1ZXJ5IH0gZnJvbSAnLi4vbGliL2RiJztcbmltcG9ydCB7IEludmVudG9yeUJhdGNoLCBFbXBsb3llZVByb2ZpbGUgfSBmcm9tICcuLi9kb21haW4vdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hJbnZlbnRvcnkoKTogUHJvbWlzZTxJbnZlbnRvcnlCYXRjaFtdPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgcXVlcnkoJ1NFTEVDVCAqIEZST00gcHJvZHVjdG9zJyk7XG5cbiAgICAgICAgLy8gTWFwIERCIGNvbHVtbnMgdG8gRG9tYWluIFR5cGVcbiAgICAgICAgLy8gQXNzdW1pbmcgREIgY29sdW1ucyBtaWdodCBiZSBzbmFrZV9jYXNlIG9yIHNsaWdodGx5IGRpZmZlcmVudC4gXG4gICAgICAgIC8vIFdlIG1hcCB3aGF0IHdlIGNhbiBhbmQgZGVmYXVsdCB0aGUgcmVzdCBmb3Igc2FmZXR5LlxuICAgICAgICByZXR1cm4gcmVzLnJvd3MubWFwKChyb3c6IGFueSkgPT4gKHtcbiAgICAgICAgICAgIGlkOiByb3cuaWQ/LnRvU3RyaW5nKCkgfHwgYFBST0QtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBza3U6IHJvdy5za3UgfHwgcm93LmNvZGlnbyB8fCAnVU5LTk9XTicsXG4gICAgICAgICAgICBuYW1lOiByb3cubm9tYnJlIHx8IHJvdy5uYW1lIHx8ICdTaW4gTm9tYnJlJyxcbiAgICAgICAgICAgIGRjaTogcm93LmRjaSB8fCByb3cucHJpbmNpcGlvX2FjdGl2byB8fCAnJyxcbiAgICAgICAgICAgIC8vIGxvdF9udW1iZXIgaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGV4cGlyeV9kYXRlOiByb3cudmVuY2ltaWVudG8gPyBuZXcgRGF0ZShyb3cudmVuY2ltaWVudG8pLmdldFRpbWUoKSA6IERhdGUubm93KCkgKyAzMTUzNjAwMDAwMCxcbiAgICAgICAgICAgIGNhdGVnb3J5OiAocm93LmNhdGVnb3J5IHx8IHJvdy5jYXRlZ29yaWEpIGFzIGFueSwgLy8gVXNlIHJvdy5jYXRlZ29yeSBpZiBhdmFpbGFibGUsIGZhbGxiYWNrIHRvIHJvdy5jYXRlZ29yaWFcbiAgICAgICAgICAgIGNvbmRpdGlvbjogKHJvdy5zYWxlX2NvbmRpdGlvbiB8fCByb3cuY29uZGljaW9uX3ZlbnRhKSBhcyBhbnksIC8vIE1hcCBEQiBjb2x1bW4gdG8gbmV3IGZpZWxkIG5hbWUsIGZhbGxiYWNrIHRvIG9sZCBEQiBmaWVsZFxuICAgICAgICAgICAgLy8gc3RvcmFnZV9jb25kaXRpb24gaXMgcmVtb3ZlZCBhcyBwZXIgbmV3IG1hcHBpbmcsIGlmIG5lZWRlZCwgYWRkIGJhY2sgd2l0aCBhIGRlZmF1bHRcbiAgICAgICAgICAgIGFsbG93c19jb21taXNzaW9uOiByb3cuYWxsb3dzX2NvbW1pc3Npb24gfHwgcm93LnBlcm1pdGVfY29taXNpb24gfHwgZmFsc2UsXG4gICAgICAgICAgICBhY3RpdmVfaW5ncmVkaWVudHM6IHJvdy5hY3RpdmVfaW5ncmVkaWVudHMgfHwgcm93LnByaW5jaXBpb3NfYWN0aXZvcyA/IChBcnJheS5pc0FycmF5KHJvdy5wcmluY2lwaW9zX2FjdGl2b3MpID8gcm93LnByaW5jaXBpb3NfYWN0aXZvcyA6IFtyb3cucHJpbmNpcGlvc19hY3Rpdm9zXSkgOiBbXSxcbiAgICAgICAgICAgIGlzX2Jpb2VxdWl2YWxlbnQ6IHJvdy5pc19iaW9lcXVpdmFsZW50IHx8IHJvdy5lc19iaW9lcXVpdmFsZW50ZSB8fCBmYWxzZSxcbiAgICAgICAgICAgIHN0b2NrX2FjdHVhbDogTnVtYmVyKHJvdy5zdG9ja19hY3R1YWwgfHwgcm93LnN0b2NrKSB8fCAwLFxuICAgICAgICAgICAgc3RvY2tfbWluOiBOdW1iZXIocm93LnN0b2NrX21pbiB8fCByb3cuc3RvY2tfbWluKSB8fCA1LFxuICAgICAgICAgICAgc3RvY2tfbWF4OiBOdW1iZXIocm93LnN0b2NrX21heCkgfHwgMTAwLCAvLyBOZXcgZmllbGRcbiAgICAgICAgICAgIHByaWNlOiBOdW1iZXIocm93LnByaWNlIHx8IHJvdy5wcmVjaW8pIHx8IDAsXG4gICAgICAgICAgICBjb3N0X3ByaWNlOiBOdW1iZXIocm93LmNvc3RfcHJpY2UpIHx8IDAsIC8vIE5ldyBmaWVsZFxuICAgICAgICAgICAgc3VwcGxpZXJfaWQ6IHJvdy5zdXBwbGllcl9pZCB8fCByb3cucHJvdmVlZG9yX2lkIHx8ICdTVVAtMDAxJyxcbiAgICAgICAgICAgIGxvY2F0aW9uX2lkOiByb3cubG9jYXRpb25faWQgfHwgJ0JPREVHQV9DRU5UUkFMJyAvLyBOZXcgZmllbGQgd2l0aCBkZWZhdWx0XG4gICAgICAgIH0pKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBpbnZlbnRvcnk6JywgZXJyb3IpO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hFbXBsb3llZXMoKTogUHJvbWlzZTxFbXBsb3llZVByb2ZpbGVbXT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHF1ZXJ5KCdTRUxFQ1QgKiBGUk9NIHVzZXJzJyk7XG5cbiAgICAgICAgcmV0dXJuIHJlcy5yb3dzLm1hcCgocm93OiBhbnkpID0+ICh7XG4gICAgICAgICAgICBpZDogcm93LmlkPy50b1N0cmluZygpIHx8IGBFTVAtJHtNYXRoLnJhbmRvbSgpfWAsXG4gICAgICAgICAgICBydXQ6IHJvdy5ydXQgfHwgJ1NJTi1SVVQnLFxuICAgICAgICAgICAgbmFtZTogcm93Lm5hbWUgfHwgJ1VzdWFyaW8gU2lzdGVtYScsXG4gICAgICAgICAgICByb2xlOiByb3cucm9sZSB8fCAnQ0FTSElFUicsXG4gICAgICAgICAgICBhY2Nlc3NfcGluOiByb3cucGluIHx8ICcwMDAwJyxcbiAgICAgICAgICAgIHN0YXR1czogcm93LnN0YXR1cyB8fCAnQUNUSVZFJyxcbiAgICAgICAgICAgIGN1cnJlbnRfc3RhdHVzOiAnT1VUJyxcbiAgICAgICAgICAgIGpvYl90aXRsZTogJ0NBSkVST19WRU5ERURPUicsIC8vIERlZmF1bHQgZm9yIHN5bmNcbiAgICAgICAgICAgIGxhYm9yX2RhdGE6IHtcbiAgICAgICAgICAgICAgICBiYXNlX3NhbGFyeTogNTAwMDAwLFxuICAgICAgICAgICAgICAgIGFmcDogJ01PREVMTycsXG4gICAgICAgICAgICAgICAgaXNhcHJlOiAnRk9OQVNBJyxcbiAgICAgICAgICAgICAgICBjb250cmFjdF9ob3VyczogNDVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIGVtcGxveWVlczonLCBlcnJvcik7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjJSQXVDc0IifQ==
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
const SYMPTOM_MAP = {
    'dolor': [
        'ANALGESICO',
        'ANTIINFLAMATORIO'
    ],
    'cabeza': [
        'PARACETAMOL',
        'IBUPROFENO',
        'MIGRAÑA'
    ],
    'fiebre': [
        'PARACETAMOL',
        'ANTIPIRETICO'
    ],
    'estomago': [
        'VIADIL',
        'OMEPRAZOL',
        'PROBIOTICO',
        'SAL DE FRUTA'
    ],
    'tos': [
        'JARABE',
        'ANTITUSIVO',
        'EXPECTORANTE'
    ],
    'alergia': [
        'LORATADINA',
        'CETIRIZINA',
        'ANTIHISTAMINICO'
    ],
    'herida': [
        'POVIDONA',
        'PARCHE',
        'GASA',
        'CICATRIZANTE'
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
     * Busca productos en el inventario basados en síntomas.
     */ static searchBySymptom(query, inventory) {
        const lowerQuery = query.toLowerCase();
        let keywords = [];
        // 1. Identificar palabras clave del mapa de síntomas
        Object.entries(SYMPTOM_MAP).forEach(([symptom, tags])=>{
            if (lowerQuery.includes(symptom)) {
                keywords = [
                    ...keywords,
                    ...tags
                ];
            }
        });
        // Si no hay coincidencias en el mapa, usamos la query directa como keyword
        if (keywords.length === 0) {
            keywords = [
                lowerQuery
            ];
        }
        // 2. Filtrar inventario
        return inventory.filter((item)=>{
            if (item.stock_actual <= 0) return false; // Solo con stock
            const itemText = `${item.name} ${item.dci} ${item.category}`.toLowerCase();
            // Coincidencia si alguna keyword está en el texto del item
            return keywords.some((keyword)=>itemText.includes(keyword.toLowerCase()));
        });
    }
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
"[project]/src/domain/services/PrinterService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PrinterService",
    ()=>PrinterService
]);
class PrinterService {
    static async printTicket(sale, config) {
        if (!config.auto_print_sale) return;
        console.log('🖨️ PRINTING TICKET:', sale.id);
        console.log('HEADER:', config.header_text);
        console.log('ITEMS:', sale.items.length);
        console.log('FOOTER:', config.footer_text);
        // In a real app, this would talk to a thermal printer API (WebUSB, QZ Tray, etc.)
        // For now, we simulate with a window alert or just console
        // alert(`🖨️ Imprimiendo Boleta #${sale.id}`);
        // Check for fractional items and print labels (Art. 40 B)
        const fractionalItems = sale.items.filter((item)=>item.is_fractional);
        if (fractionalItems.length > 0) {
            console.log('✂️ DETECTED FRACTIONAL ITEMS:', fractionalItems.length);
            fractionalItems.forEach((item)=>{
                this.printFractionalLabel(item, config);
            });
        }
    }
    static async printFractionalLabel(item, config) {
        console.log('🏷️ PRINTING LABEL (ART 40 B):', item.name);
        console.log('   Pac: ', item.original_name);
        console.log('   Cant:', item.quantity);
        console.log('   QF Supervisor: Javiera Rojas (DT)'); // Mocked for now, should come from store
        console.log('   Registro ISP: F-2244/19'); // Mocked, should come from item
        console.log('   "Para mayor información consulte a su prescriptor o farmacéutico."');
    // Simulate label printing
    }
    static async printVoucher(movement, config) {
        if (!config.auto_print_cash) return;
        console.log('🖨️ PRINTING VOUCHER:', movement.id);
        console.log('TYPE:', movement.type);
        console.log('AMOUNT:', movement.amount);
    // alert(`🖨️ Imprimiendo Comprobante de ${movement.type}`);
    }
    static async printQueueTicket(ticket, config) {
        if (!config.auto_print_queue) return;
        console.log('🖨️ PRINTING QUEUE TICKET:', ticket.number);
        console.log('BRANCH:', ticket.branch_id);
    // alert(`🖨️ Imprimiendo Turno ${ticket.number}`);
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/sii_dte.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "shouldGenerateDTE",
    ()=>shouldGenerateDTE
]);
const shouldGenerateDTE = (paymentMethod)=>{
    if (paymentMethod === 'CASH' || paymentMethod === 'TRANSFER') {
        return {
            shouldGenerate: true,
            status: 'CONFIRMED_DTE',
            message: 'Generando Boleta Electrónica (SII)'
        };
    } else {
        // DEBIT or CREDIT
        return {
            shouldGenerate: false,
            status: 'FISCALIZED_BY_VOUCHER',
            message: 'Venta fiscalizada mediante Voucher (Transbank/Getnet)'
        };
    }
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/productDisplay.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "calculatePricePerUnit",
    ()=>calculatePricePerUnit,
    "formatProductLabel",
    ()=>formatProductLabel
]);
const formatProductLabel = (product)=>{
    // Format: [NOMBRE] - [DCI] [CONCENTRACION] - [FORMATO] x[UNIDADES] ([LAB])
    // Example: "Panadol - Paracetamol 500mg - Comprimidos x16 (GlaxoSmithKline)"
    const name = product.name;
    const dci = product.dci;
    const concentration = product.concentration;
    const format = product.format;
    const units = product.unit_count;
    const lab = product.laboratory;
    return `${name} - ${dci} ${concentration} - ${format} x${units} (${lab})`;
};
const calculatePricePerUnit = (product)=>{
    if (!product.unit_count || product.unit_count === 0) return 0;
    return product.price / product.unit_count;
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/domain/logic/promotionEngine.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyPromotions",
    ()=>applyPromotions
]);
const applyPromotions = (cart, customer, activePromotions)=>{
    const today = new Date();
    const currentDay = today.getDay(); // 0-6
    const now = today.getTime();
    let totalDiscount = 0;
    const itemsWithDiscounts = cart.map((item)=>{
        let bestDiscount = null;
        // Filter applicable promotions
        const applicablePromotions = activePromotions.filter((promo)=>{
            if (!promo.isActive) return false;
            if (now < promo.startDate || now > promo.endDate) return false;
            if (promo.days_of_week && !promo.days_of_week.includes(currentDay)) return false;
            // Category check (assuming item has category or we map it)
            // For now, we'll skip category check as CartItem doesn't have it explicitly populated always, 
            // but in a real app we would check item.category === promo.target_category
            // Customer Tag Check
            if (promo.required_customer_tag) {
                if (!customer) return false;
                // Assuming customer.health_tags includes the required tag
                // Or we map specific tags. For simplicity, let's match string inclusion
                if (!customer.health_tags.includes(promo.required_customer_tag)) return false;
            }
            return true;
        });
        // Apply logic based on type
        for (const promo of applicablePromotions){
            let discountAmount = 0;
            if (promo.type === 'PERCENTAGE' && promo.value) {
                discountAmount = item.price * (promo.value / 100);
            } else if (promo.type === 'FIXED_AMOUNT' && promo.value) {
                discountAmount = promo.value;
            }
            // BOGO and BUNDLE would require looking at the whole cart, simplified here for item-level
            if (discountAmount > 0) {
                // Ensure we don't discount more than price
                discountAmount = Math.min(discountAmount, item.price);
                // Pick the best discount
                if (!bestDiscount || discountAmount > bestDiscount.discountAmount) {
                    bestDiscount = {
                        originalPrice: item.price,
                        finalPrice: item.price - discountAmount,
                        discountAmount: discountAmount,
                        promotionApplied: promo
                    };
                }
            }
        }
        if (bestDiscount) {
            totalDiscount += bestDiscount.discountAmount * item.quantity;
            return {
                ...item,
                discount: bestDiscount
            };
        }
        return item;
    });
    const finalTotal = itemsWithDiscounts.reduce((sum, item)=>{
        const price = item.discount ? item.discount.finalPrice : item.price;
        return sum + price * item.quantity;
    }, 0);
    return {
        items: itemsWithDiscounts,
        totalDiscount,
        finalTotal
    };
};
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
     */ /**
     * Calcula la velocidad de venta diaria basada en un periodo.
     */ calculateVelocity (sku, period) {
        // Simulación: Genera un número base
        const hash = sku.split('').reduce((acc, char)=>acc + char.charCodeAt(0), 0);
        let baseVelocity = hash % 10 / 2 + 0.5;
        // Ajuste por periodo (Simulación de estacionalidad)
        switch(period){
            case 'LAST_7_DAYS':
                return baseVelocity * 1.2; // Pico reciente
            case 'LAST_30_DAYS':
                return baseVelocity; // Normal
            case 'LAST_TRIMESTER':
                return baseVelocity * 0.9; // Estabilizado
            case 'LAST_SEMESTER':
                return baseVelocity * 0.8; // Largo plazo
            case 'LAST_YEAR':
                return baseVelocity * 0.7; // Anual
            default:
                return baseVelocity;
        }
    },
    /**
     * Calcula cuántos días durará el stock actual.
     */ calculateCoverage (stock, velocity) {
        if (velocity <= 0) return 999; // Cobertura infinita
        return Math.round(stock / velocity);
    },
    /**
     * Genera sugerencias de reabastecimiento agrupadas por proveedor.
     */ generateSuggestions (inventory, suppliers, period = 'LAST_30_DAYS') {
        const suggestions = [];
        const itemsBySupplier = {};
        inventory.forEach((item)=>{
            const velocity = this.calculateVelocity(item.sku, period);
            const coverage = this.calculateCoverage(item.stock_actual, velocity);
            // Configurable Target Days (Default 30)
            const targetDays = 30;
            // Fórmula: (velocity * targetDays) - currentStock
            const suggestedQty = Math.ceil(velocity * targetDays - item.stock_actual);
            // Determine Status based on Coverage
            let status = 'OK';
            if (coverage < 7) status = 'CRITICAL';
            else if (coverage < 15) status = 'LOW';
            else if (coverage > 90) status = 'EXCESS';
            // Add to list if suggestion > 0 OR if it's critical/low/excess (to show visibility)
            // User requested: "Si el resultado es negativo (tengo de sobra), la sugerencia es 0."
            const finalSuggestion = Math.max(0, suggestedQty);
            // We include items that need attention (Critical/Low) or have suggestions
            if (finalSuggestion > 0 || status === 'CRITICAL' || status === 'LOW' || status === 'EXCESS') {
                const supplierId = item.supplier_id || 'SUP-001';
                if (!itemsBySupplier[supplierId]) {
                    itemsBySupplier[supplierId] = [];
                }
                itemsBySupplier[supplierId].push({
                    sku: item.sku,
                    name: item.name,
                    quantity: finalSuggestion,
                    cost_price: item.price * 0.6,
                    current_stock: item.stock_actual,
                    velocity: velocity.toFixed(2),
                    coverage: coverage,
                    status: status
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
        const facturaExpenses = expenses.filter((e)=>e.document_type === 'FACTURA');
        const creditFiscal = Math.round(facturaExpenses.reduce((sum, e)=>sum + e.amount, 0) * 0.19 / 1.19);
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
        let totalSocialLaws = 0;
        let totalCost = 0;
        employees.forEach((emp)=>{
            if (emp.status === 'ACTIVE') {
                const salary = emp.base_salary || 0;
                totalSalaries += salary;
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
    /**
     * Calculate comprehensive financial metrics for a date range
     */ static calculateMetrics(sales, expenses, dateRange) {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const filteredExpenses = this.filterByDateRange(expenses, dateRange.from, dateRange.to);
        const totalSales = filteredSales.reduce((sum, s)=>sum + s.total, 0);
        const totalCost = filteredSales.reduce((sum, s)=>sum + s.items.reduce((itemSum, item)=>itemSum + (item.cost_price || 0) * item.quantity, 0), 0);
        const totalExpenses = filteredExpenses.reduce((sum, e)=>sum + e.amount, 0);
        const grossProfit = totalSales - totalCost;
        const netProfit = grossProfit - totalExpenses;
        const grossMargin = totalSales > 0 ? grossProfit / totalSales * 100 : 0;
        return {
            totalSales,
            totalExpenses,
            netProfit,
            grossMargin,
            transactionCount: filteredSales.length,
            averageTicket: filteredSales.length > 0 ? totalSales / filteredSales.length : 0
        };
    }
    /**
     * Get top selling products
     */ static getTopProducts(sales, dateRange, limit = 10) {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const productMap = new Map();
        filteredSales.forEach((sale)=>{
            sale.items.forEach((item)=>{
                const existing = productMap.get(item.sku);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.revenue += item.price * item.quantity;
                } else {
                    productMap.set(item.sku, {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        revenue: item.price * item.quantity
                    });
                }
            });
        });
        return Array.from(productMap.values()).sort((a, b)=>b.revenue - a.revenue).slice(0, limit);
    }
    /**
     * Get daily sales data for charts
     */ static getDailySales(sales, dateRange) {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const dailyMap = new Map();
        filteredSales.forEach((sale)=>{
            const date = new Date(sale.timestamp).toISOString().split('T')[0];
            const existing = dailyMap.get(date);
            if (existing) {
                existing.sales += sale.total;
                existing.transactions += 1;
            } else {
                dailyMap.set(date, {
                    sales: sale.total,
                    transactions: 1
                });
            }
        });
        return Array.from(dailyMap.entries()).map(([date, data])=>({
                date,
                ...data
            })).sort((a, b)=>a.date.localeCompare(b.date));
    }
    /**
     * Calculate inventory value
     */ static calculateInventoryValue(inventory) {
        return inventory.reduce((sum, item)=>sum + item.cost_price * item.stock_actual, 0);
    }
    /**
     * Get low stock items
     */ static getLowStockItems(inventory) {
        return inventory.filter((item)=>item.stock_actual <= item.stock_min && item.stock_actual > 0).sort((a, b)=>a.stock_actual / a.stock_min - b.stock_actual / b.stock_min);
    }
    /**
     * Get expired or near-expiry items
     */ static getExpiringItems(inventory, daysThreshold = 30) {
        const now = Date.now();
        const threshold = now + daysThreshold * 24 * 60 * 60 * 1000;
        return inventory.filter((item)=>item.expiry_date && item.expiry_date <= threshold && item.expiry_date >= now).sort((a, b)=>(a.expiry_date || 0) - (b.expiry_date || 0));
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/infrastructure/biometrics/WebAuthnService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "WebAuthnService",
    ()=>WebAuthnService
]);
class WebAuthnService {
    /**
     * Checks if WebAuthn is supported and available
     */ static async isAvailable() {
        if (!window.PublicKeyCredential) return false;
        // Check for platform authenticator (TouchID, FaceID, Windows Hello)
        if (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
            return true;
        }
        return false;
    }
    /**
     * Registers a new credential (fingerprint/face) for a user
     */ static async registerCredential(userId, userName) {
        if (!await this.isAvailable()) {
            throw new Error('Biometría no disponible en este dispositivo');
        }
        // Challenge should come from server in production, but we mock it here
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const publicKey = {
            challenge,
            rp: {
                name: 'Farmacias Vallenar',
                id: window.location.hostname // Must match current domain
            },
            user: {
                id: Uint8Array.from(userId, (c)=>c.charCodeAt(0)),
                name: userName,
                displayName: userName
            },
            pubKeyCredParams: [
                {
                    alg: -7,
                    type: 'public-key'
                },
                {
                    alg: -257,
                    type: 'public-key'
                } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required'
            },
            timeout: 60000,
            attestation: 'none'
        };
        try {
            const credential = await navigator.credentials.create({
                publicKey
            });
            return credential;
        } catch (error) {
            console.error('WebAuthn Registration Error:', error);
            throw error;
        }
    }
    /**
     * Authenticates a user via biometrics
     */ static async authenticateCredential() {
        if (!await this.isAvailable()) {
            throw new Error('Biometría no disponible');
        }
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const publicKey = {
            challenge,
            rpId: window.location.hostname,
            userVerification: 'required',
            timeout: 60000
        };
        try {
            const credential = await navigator.credentials.get({
                publicKey
            });
            return credential;
        } catch (error) {
            console.error('WebAuthn Authentication Error:', error);
            throw error;
        }
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/infrastructure/services/PrinterService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PrinterService",
    ()=>PrinterService
]);
class PrinterService {
    static styleId = 'printer-dynamic-styles';
    /**
     * Injects dynamic CSS for printing based on hardware config
     */ static injectStyles(config) {
        // Remove existing styles if any
        const existing = document.getElementById(this.styleId);
        if (existing) existing.remove();
        const style = document.createElement('style');
        style.id = this.styleId;
        style.innerHTML = this.generateCss(config);
        document.head.appendChild(style);
    }
    static generateCss(config) {
        const width = config.pos_printer_width === '58mm' ? '58mm' : '80mm';
        return `
            @media print {
                @page {
                    margin: 0;
                    size: auto;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                    background: white;
                }

                /* Hide everything by default */
                body * {
                    visibility: hidden;
                }

                /* Show only the print area */
                #print-area, #print-area * {
                    visibility: visible;
                }

                #print-area {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: ${width};
                    padding: 2mm;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    color: black;
                    background: white;
                }

                /* Utility Classes for Thermal Printing */
                .print-center { text-align: center; }
                .print-bold { font-weight: bold; }
                .print-large { font-size: 16px; }
                .print-small { font-size: 10px; }
                .print-divider { border-top: 1px dashed black; margin: 5px 0; }
                .print-row { display: flex; justify-content: space-between; }
            }
        `;
    }
    static printTicket(contentHtml, config) {
        this.injectStyles(config);
        // Create a temporary print container
        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }
        printArea.innerHTML = contentHtml;
        // Trigger print
        window.print();
    // Cleanup (Optional, maybe keep it for debugging or rapid re-print)
    // printArea.remove(); 
    }
    static printTestTicket(config) {
        const content = `
            <div class="print-center">
                <h2 class="print-large print-bold">FARMACIA VALLENAR</h2>
                <p class="print-small">RUT: 76.123.456-7</p>
                <p class="print-small">Av. Matta 123, Vallenar</p>
                <div class="print-divider"></div>
                <h3 class="print-bold">TICKET DE PRUEBA</h3>
                <p>${new Date().toLocaleString()}</p>
                <div class="print-divider"></div>
            </div>
            <div class="print-row">
                <span>Ancho Configurado:</span>
                <span class="print-bold">${config.pos_printer_width}</span>
            </div>
            <div class="print-row">
                <span>Modo:</span>
                <span>${config.auto_print_pos ? 'AUTO' : 'MANUAL'}</span>
            </div>
            <div class="print-divider"></div>
            <div class="print-center">
                <p class="print-small">Si puedes leer esto, la impresora está configurada correctamente.</p>
                <br/>
                <p class="print-bold">*** FIN DE PRUEBA ***</p>
                <br/>
                .
            </div>
        `;
        this.printTicket(content, config);
    }
    static printLabel(labelData, config) {
        // Label logic is slightly different, usually fixed size pages
        // For now, we reuse the injection but with label specific CSS if needed
        // Or we assume the browser handles the page size if we set @page size properly
        const css = `
            @media print {
                @page {
                    size: ${config.label_printer_size === '50x25' ? '50mm 25mm' : '100mm 50mm'};
                    margin: 0;
                }
                body * { visibility: hidden; }
                #print-area, #print-area * { visibility: visible; }
                #print-area {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-col;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }
            }
        `;
        // Inject Label CSS
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.appendChild(style);
        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }
        printArea.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                <div style="font-size: 10px; font-weight: bold; overflow: hidden; white-space: nowrap; max-width: 95%;">${labelData.name.substring(0, 25)}</div>
                <div style="font-size: 14px; font-weight: bold;">$${labelData.price.toLocaleString()}</div>
                <div style="font-family: monospace; font-size: 8px;">${labelData.sku}</div>
                <!-- Barcode Placeholder (In real app, use JsBarcode to generate SVG/IMG) -->
                <div style="border: 1px solid black; height: 20px; width: 80%; margin-top: 2px; background: repeating-linear-gradient(90deg, black, black 1px, white 1px, white 3px);"></div>
            </div>
        `;
        window.print();
    // Cleanup styles after print to not mess up normal printing?
    // Ideally we should manage style injection better.
    // For now, reload or re-inject standard styles might be needed if user switches between ticket and label.
    // But usually they are distinct actions.
    }
    static printAttendanceReport(data, period) {
        // Report CSS
        const css = `
            @media print {
                @page {
                    size: letter;
                    margin: 20mm;
                }
                body {
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                    color: #333;
                }
                h1 {
                    text-align: center;
                    font-size: 18px;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                }
                .subtitle {
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 20px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f5f5f5;
                    font-weight: bold;
                }
                .footer {
                    margin-top: 50px;
                    display: flex;
                    justify-content: space-between;
                }
                .signature-box {
                    width: 200px;
                    border-top: 1px solid #000;
                    text-align: center;
                    padding-top: 10px;
                }
            }
        `;
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.appendChild(style);
        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }
        const rows = data.map((row)=>`
            <tr>
                <td>${row.date}</td>
                <td>${row.time}</td>
                <td>${row.employeeName}</td>
                <td>${row.type}</td>
                <td>${row.observation}</td>
            </tr>
        `).join('');
        printArea.innerHTML = `
            <h1>Libro de Asistencia</h1>
            <div class="subtitle">Periodo: ${period} | Generado: ${new Date().toLocaleString()}</div>
            
            <table>
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Empleado</th>
                        <th>Evento</th>
                        <th>Observación</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>

            <div class="footer">
                <div class="signature-box">Firma Empleador</div>
                <div class="signature-box">Firma Representante Trabajadores</div>
            </div>
        `;
        window.print();
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/map-pin.js [app-client] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$store$2f$useStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/store/useStore.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
// Components
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$layout$2f$LocationSelector$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/components/layout/LocationSelector.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$ui$2f$NotificationCenter$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/components/ui/NotificationCenter.tsx [app-client] (ecmascript)");
// Pages
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$LandingPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/LandingPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$DashboardPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/DashboardPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$POSMainScreen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/components/POSMainScreen.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplyChainPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/SupplyChainPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$QueueKioskPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/QueueKioskPage.tsx [app-client] (ecmascript)");
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$NetworkPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/NetworkPage.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$PriceCheckPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/presentation/pages/PriceCheckPage.tsx [app-client] (ecmascript)");
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
        // { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: ['MANAGER', 'QF'] }, // Removed per user request
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
            icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"],
            label: 'Gestión de Red',
            path: '/network',
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
                                        className: "text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500",
                                        children: "Farmacias Vallenar"
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 60,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-slate-400 mt-1",
                                        children: "Sistema ERP Clínico Integral v2.1"
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 63,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 59,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>setIsMobileMenuOpen(false),
                                className: "md:hidden text-slate-400 hover:text-white",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    size: 24
                                }, void 0, false, {
                                    fileName: "[project]/src/App.tsx",
                                    lineNumber: 66,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 65,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 58,
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
                                        lineNumber: 78,
                                        columnNumber: 29
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium",
                                        children: item.label
                                    }, void 0, false, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 79,
                                        columnNumber: 29
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, item.path, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 72,
                                columnNumber: 25
                            }, ("TURBOPACK compile-time value", void 0)))
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 70,
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
                                        lineNumber: 86,
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
                                                lineNumber: 90,
                                                columnNumber: 29
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-xs text-slate-500 truncate",
                                                children: user?.role
                                            }, void 0, false, {
                                                fileName: "[project]/src/App.tsx",
                                                lineNumber: 91,
                                                columnNumber: 29
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/App.tsx",
                                        lineNumber: 89,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 85,
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
                                        lineNumber: 98,
                                        columnNumber: 25
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    " Cerrar Sesión"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 94,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 84,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 57,
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
                                    lineNumber: 108,
                                    columnNumber: 25
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 107,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-bold text-slate-800",
                                children: "Farmacias Vallenar"
                            }, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 110,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$layout$2f$LocationSelector$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 111,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 106,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                        className: "hidden md:flex bg-white px-6 py-3 shadow-sm justify-end items-center z-40 gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$ui$2f$NotificationCenter$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 116,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$layout$2f$LocationSelector$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 117,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 115,
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
                                lineNumber: 122,
                                columnNumber: 25
                            }, ("TURBOPACK compile-time value", void 0))
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 121,
                            columnNumber: 21
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 120,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 104,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 55,
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
        lineNumber: 141,
        columnNumber: 23
    }, ("TURBOPACK compile-time value", void 0));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SidebarLayout, {
        children: children
    }, void 0, false, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 142,
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
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Toaster"], {
                position: "top-center",
                richColors: true
            }, void 0, false, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 154,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Routes"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$LandingPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 157,
                            columnNumber: 42
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 157,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/kiosk",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AttendanceKioskPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 158,
                            columnNumber: 47
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 158,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/access",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$AccessControlPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 159,
                            columnNumber: 48
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 159,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/queue",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$QueueKioskPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 160,
                            columnNumber: 47
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 160,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/price-check",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$PriceCheckPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 161,
                            columnNumber: 53
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 161,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/dashboard",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$DashboardPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 164,
                                columnNumber: 67
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 164,
                            columnNumber: 51
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 164,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/pos",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$components$2f$POSMainScreen$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 165,
                                columnNumber: 61
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 165,
                            columnNumber: 45
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 165,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/inventory",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$InventoryPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 166,
                                columnNumber: 67
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 166,
                            columnNumber: 51
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 166,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/warehouse",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$WarehouseOps$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["WarehouseOps"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 167,
                                columnNumber: 67
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 167,
                            columnNumber: 51
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 167,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/suppliers",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SuppliersPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SuppliersPage"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 168,
                                columnNumber: 67
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 168,
                            columnNumber: 51
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 168,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/suppliers/:id",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplierProfile$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SupplierProfile"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 169,
                                columnNumber: 71
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 169,
                            columnNumber: 55
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 169,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/reports",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ReportsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 170,
                                columnNumber: 65
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 170,
                            columnNumber: 49
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 170,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/supply-chain",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SupplyChainPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 171,
                                columnNumber: 70
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 171,
                            columnNumber: 54
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 171,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/clients",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$ClientsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 172,
                                columnNumber: 65
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 172,
                            columnNumber: 49
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 172,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/hr",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$HRPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 173,
                                columnNumber: 60
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 173,
                            columnNumber: 44
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 173,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/network",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$NetworkPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 174,
                                columnNumber: 65
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 174,
                            columnNumber: 49
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 174,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/settings",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ProtectedRoute, {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$presentation$2f$pages$2f$SettingsPage$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                                fileName: "[project]/src/App.tsx",
                                lineNumber: 175,
                                columnNumber: 66
                            }, void 0)
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 175,
                            columnNumber: 50
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 175,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "/admin",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Navigate"], {
                            to: "/dashboard",
                            replace: true
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 176,
                            columnNumber: 47
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 176,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Route"], {
                        path: "*",
                        element: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2f$dist$2f$development$2f$chunk$2d$4WY6JWTD$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Navigate"], {
                            to: "/",
                            replace: true
                        }, void 0, false, {
                            fileName: "[project]/src/App.tsx",
                            lineNumber: 178,
                            columnNumber: 42
                        }, void 0)
                    }, void 0, false, {
                        fileName: "[project]/src/App.tsx",
                        lineNumber: 178,
                        columnNumber: 17
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/src/App.tsx",
                lineNumber: 155,
                columnNumber: 13
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/src/App.tsx",
        lineNumber: 153,
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

//# sourceMappingURL=src_080a4c27._.js.map