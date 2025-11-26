module.exports=[30056,a=>a.a(async(b,c)=>{try{let b=await a.y("pg");a.n(b),c()}catch(a){c(a)}},!0),61469,a=>a.a(async(b,c)=>{try{var d=a.i(30056),e=b([d]);[d]=e.then?(await e)():e;let g=new d.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:!1}});async function f(a,b){let c=Date.now(),d=await g.query(a,b),e=Date.now()-c;return console.log("Executed query",{text:a,duration:e,rows:d.rowCount}),d}a.s(["query",()=>f]),c()}catch(a){c(a)}},!1),37936,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"registerServerReference",{enumerable:!0,get:function(){return d.registerServerReference}});let d=a.r(11857)},13095,(a,b,c)=>{"use strict";function d(a){for(let b=0;b<a.length;b++){let c=a[b];if("function"!=typeof c)throw Object.defineProperty(Error(`A "use server" file can only export async functions, found ${typeof c}.
Read more: https://nextjs.org/docs/messages/invalid-use-server-value`),"__NEXT_ERROR_CODE",{value:"E352",enumerable:!1,configurable:!0})}}Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"ensureServerEntryExports",{enumerable:!0,get:function(){return d}})},78238,a=>a.a(async(b,c)=>{try{var d=a.i(37936),e=a.i(61469),f=a.i(13095),g=b([e]);async function h(){try{let a=`
            SELECT 
                COALESCE(SUM(total), 0) as total_sales, 
                COUNT(*) as ticket_count 
            FROM ventas 
            WHERE DATE(fecha) = CURRENT_DATE
        `,b=await (0,e.query)(a),c=parseInt(b.rows[0].total_sales),d=parseInt(b.rows[0].ticket_count),f=`
            SELECT COUNT(*) as critical_count 
            FROM (
                SELECT p.id, COALESCE(SUM(l.cantidad_disponible), 0) as total_stock 
                FROM productos p 
                LEFT JOIN lotes l ON p.id = l.producto_id 
                GROUP BY p.id
            ) as stocks 
            WHERE total_stock < 10
        `,g=await (0,e.query)(f),h=parseInt(g.rows[0].critical_count),i=`
            SELECT COUNT(*) as expiring_count
            FROM lotes
            WHERE fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
            AND cantidad_disponible > 0
        `,j=await (0,e.query)(i),k=parseInt(j.rows[0].expiring_count);return{salesToday:c,ticketCount:d,criticalStock:h,expiringBatches:k,coldChainStatus:"Estable"}}catch(a){return console.error("Error fetching dashboard metrics:",a),{salesToday:0,ticketCount:0,criticalStock:0,expiringBatches:0,coldChainStatus:"Estable"}}}[e]=g.then?(await g)():g,(0,f.ensureServerEntryExports)([h]),(0,d.registerServerReference)(h,"00f899ff6ea69e0aef88cb6393463c91a8d59018d9",null),a.s(["getDashboardMetrics",()=>h]),c()}catch(a){c(a)}},!1),7153,a=>a.a(async(b,c)=>{try{var d=a.i(78238),e=b([d]);[d]=e.then?(await e)():e,a.s([]),c()}catch(a){c(a)}},!1),69403,a=>a.a(async(b,c)=>{try{var d=a.i(7153),e=a.i(78238),f=b([d,e]);[d,e]=f.then?(await f)():f,a.s(["00f899ff6ea69e0aef88cb6393463c91a8d59018d9",()=>e.getDashboardMetrics]),c()}catch(a){c(a)}},!1)];

//# sourceMappingURL=%5Broot-of-the-server%5D__ac86fc4c._.js.map