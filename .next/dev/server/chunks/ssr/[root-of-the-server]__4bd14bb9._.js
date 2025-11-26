module.exports = [
"[externals]/pg [external] (pg, esm_import)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

const mod = await __turbopack_context__.y("pg");

__turbopack_context__.n(mod);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, true);}),
"[project]/src/lib/db.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "query",
    ()=>query
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$pg__$5b$external$5d$__$28$pg$2c$__esm_import$29$__ = __turbopack_context__.i("[externals]/pg [external] (pg, esm_import)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$externals$5d2f$pg__$5b$external$5d$__$28$pg$2c$__esm_import$29$__
]);
[__TURBOPACK__imported__module__$5b$externals$5d2f$pg__$5b$external$5d$__$28$pg$2c$__esm_import$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
// Disable SSL verification for self-signed certs in development
if ("TURBOPACK compile-time truthy", 1) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
const pool = new __TURBOPACK__imported__module__$5b$externals$5d2f$pg__$5b$external$5d$__$28$pg$2c$__esm_import$29$__["Pool"]({
    // La conexión se sigue leyendo de la variable DATABASE_URL
    connectionString: process.env.DATABASE_URL,
    // [PARCHE CRÍTICO PARA EL ENTORNO LOCAL]
    ssl: {
        rejectUnauthorized: false
    }
});
// Handle idle client errors to prevent crash
pool.on('error', (err, client)=>{
    console.error('Unexpected error on idle client', err);
// Don't exit the process, just log it
});
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', {
            text,
            duration,
            rows: res.rowCount
        });
        return res;
    } catch (error) {
        console.warn('⚠️ Safe Mode: Database connection failed. Returning empty data.');
        // console.error('Database Error:', error); // Uncomment for debugging
        // Return a safe mock object to prevent app crash
        return {
            rows: [],
            rowCount: 0,
            command: '',
            oid: 0,
            fields: []
        };
    }
}
const __TURBOPACK__default__export__ = pool;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/src/actions/operations.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

/* __next_internal_action_entry_do_not_use__ [{"00632a3f0875c4bf901d7a172525d2bb04add39dbb":"getShiftStatus","40105bd81065da0ccc3a45a65f5c8d0dd8ab647c13":"clockIn","406ac90d3a46e58b5a99b286606ba5d4c8ba36a755":"toggleShift","4089f4845c7c8873c905318e97804bd95f7e1fbb40":"clockOut","40e42e4061da824f3808174c8bed605b592635ef6f":"generateTicket","40f5ca8e08720eb62fda68a1a62a5649468867e81f":"getNextTicket"},"",""] */ __turbopack_context__.s([
    "clockIn",
    ()=>clockIn,
    "clockOut",
    ()=>clockOut,
    "generateTicket",
    ()=>generateTicket,
    "getNextTicket",
    ()=>getNextTicket,
    "getShiftStatus",
    ()=>getShiftStatus,
    "toggleShift",
    ()=>toggleShift
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
async function getShiftStatus() {
    try {
        const sql = `SELECT valor FROM configuracion_global WHERE clave = 'en_turno'`;
        const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(sql);
        return res.rows.length > 0 ? res.rows[0].valor === 'true' : false;
    } catch (error) {
        console.error('Error getting shift status:', error);
        return false;
    }
}
async function toggleShift(isOpen) {
    try {
        const sql = `
            INSERT INTO configuracion_global (clave, valor) 
            VALUES ('en_turno', $1) 
            ON CONFLICT (clave) 
            DO UPDATE SET valor = $1, updated_at = CURRENT_TIMESTAMP
        `;
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(sql, [
            String(isOpen)
        ]);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error toggling shift:', error);
        return {
            success: false,
            error: 'Failed to update shift status'
        };
    }
}
async function clockIn(userId) {
    try {
        // Check if already clocked in today without clock out
        const checkSql = `
            SELECT id FROM asistencia 
            WHERE usuario_id = $1 AND fecha = CURRENT_DATE AND hora_salida IS NULL
        `;
        const checkRes = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(checkSql, [
            userId
        ]);
        if (checkRes.rows.length > 0) {
            return {
                success: false,
                error: 'Ya has marcado entrada hoy.'
            };
        }
        const sql = `
            INSERT INTO asistencia (usuario_id, fecha, hora_entrada, estado)
            VALUES ($1, CURRENT_DATE, CURRENT_TIME, 'presente')
        `;
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(sql, [
            userId
        ]);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error clocking in:', error);
        return {
            success: false,
            error: 'Error al marcar entrada'
        };
    }
}
async function clockOut(userId) {
    try {
        const sql = `
            UPDATE asistencia 
            SET hora_salida = CURRENT_TIME, estado = 'finalizado'
            WHERE usuario_id = $1 AND fecha = CURRENT_DATE AND hora_salida IS NULL
        `;
        const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(sql, [
            userId
        ]);
        if (res.rowCount === 0) {
            return {
                success: false,
                error: 'No tienes una entrada activa para marcar salida.'
            };
        }
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error clocking out:', error);
        return {
            success: false,
            error: 'Error al marcar salida'
        };
    }
}
async function generateTicket(type) {
    try {
        // 1. Get current number for today
        const countSql = `SELECT COUNT(*) as count FROM cola_atencion WHERE DATE(created_at) = CURRENT_DATE`;
        const countRes = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(countSql);
        const nextNum = parseInt(countRes.rows[0].count || '0') + 1;
        const prefix = type === 'PREFERENCIAL' ? 'P' : type === 'CAJA' ? 'C' : 'A';
        const ticketNumber = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
        // 2. Insert ticket
        const insertSql = `
            INSERT INTO cola_atencion (numero_ticket, tipo, estado)
            VALUES ($1, $2, 'espera')
            RETURNING id, numero_ticket, created_at
        `;
        const res = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(insertSql, [
            ticketNumber,
            type
        ]);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/totem');
        return {
            success: true,
            ticket: res.rows[0]
        };
    } catch (error) {
        console.error('Error generating ticket:', error);
        return {
            success: false,
            error: 'Error al generar ticket'
        };
    }
}
async function getNextTicket(counterId) {
    try {
        // Find oldest ticket in 'espera'
        const findSql = `
            SELECT id, numero_ticket FROM cola_atencion 
            WHERE estado = 'espera' 
            ORDER BY created_at ASC 
            LIMIT 1
        `;
        const findRes = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(findSql);
        if (findRes.rows.length === 0) {
            return {
                success: false,
                message: 'No hay clientes en espera'
            };
        }
        const ticket = findRes.rows[0];
        // Update ticket to 'llamando' or 'atendiendo'
        const updateSql = `
            UPDATE cola_atencion 
            SET estado = 'llamando', modulo_atencion = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `;
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(updateSql, [
            counterId,
            ticket.id
        ]);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true,
            ticket
        };
    } catch (error) {
        console.error('Error calling next ticket:', error);
        return {
            success: false,
            error: 'Error al llamar siguiente número'
        };
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getShiftStatus,
    toggleShift,
    clockIn,
    clockOut,
    generateTicket,
    getNextTicket
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getShiftStatus, "00632a3f0875c4bf901d7a172525d2bb04add39dbb", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(toggleShift, "406ac90d3a46e58b5a99b286606ba5d4c8ba36a755", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(clockIn, "40105bd81065da0ccc3a45a65f5c8d0dd8ab647c13", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(clockOut, "4089f4845c7c8873c905318e97804bd95f7e1fbb40", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(generateTicket, "40e42e4061da824f3808174c8bed605b592635ef6f", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getNextTicket, "40f5ca8e08720eb62fda68a1a62a5649468867e81f", null);
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/.next-internal/server/app/pantalla/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/actions/operations.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/actions/operations.ts [app-rsc] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
;
;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/.next-internal/server/app/pantalla/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/actions/operations.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "00632a3f0875c4bf901d7a172525d2bb04add39dbb",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getShiftStatus"],
    "40105bd81065da0ccc3a45a65f5c8d0dd8ab647c13",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["clockIn"],
    "406ac90d3a46e58b5a99b286606ba5d4c8ba36a755",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleShift"],
    "4089f4845c7c8873c905318e97804bd95f7e1fbb40",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["clockOut"],
    "40e42e4061da824f3808174c8bed605b592635ef6f",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["generateTicket"],
    "40f5ca8e08720eb62fda68a1a62a5649468867e81f",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getNextTicket"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$pantalla$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/pantalla/page/actions.js { ACTIONS_MODULE0 => "[project]/src/actions/operations.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/actions/operations.ts [app-rsc] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$pantalla$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$pantalla$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$actions$2f$operations$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__4bd14bb9._.js.map