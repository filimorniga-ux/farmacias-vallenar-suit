'use server';

import OpenAI from 'openai';
import { query } from '../../lib/db';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Tipos para las respuestas de las Tools
interface QueryResult {
    success: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any[];
    error?: string;
    summary?: string;
}

// ------------------------------------------------------------------
// 1. Tool Implementations (SQL Queries)
// ------------------------------------------------------------------

async function querySales(args: { product_name?: string, location_name?: string, start_date?: string, end_date?: string }): Promise<QueryResult> {
    try {
        let sql = `
            SELECT 
                si.name as product,
                l.name as location,
                SUM(si.quantity) as total_units,
                SUM(si.total_price) as total_sales,
                COUNT(s.id) as transaction_count
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            JOIN locations l ON s.location_id = l.id
            WHERE 1=1
        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any[] = [];


        if (args.product_name) {
            sql += ` AND si.name ILIKE $${params.length + 1}`;
            params.push(`%${args.product_name}%`);
        }

        if (args.location_name) {
            // Flexible matching for location/branch name
            sql += ` AND l.name ILIKE $${params.length + 1}`;
            params.push(`%${args.location_name}%`);
        }

        if (args.start_date) {
            sql += ` AND s.timestamp >= $${params.length + 1}::timestamp`;
            params.push(args.start_date);
        }

        if (args.end_date) {
            sql += ` AND s.timestamp <= $${params.length + 1}::timestamp`;
            params.push(args.end_date);
        }

        sql += ` 
            GROUP BY si.name, l.name
            ORDER BY total_sales DESC
            LIMIT 10
        `;
        const res = await query(sql, params);
        return { success: true, data: res.rows, summary: `Found ${res.rowCount} sales records.` };
    } catch (e: unknown) {
        console.error('Error querying sales:', e);
        return { success: false, error: (e as Error).message };
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function queryInventory(_args: { product_name?: string, location_id?: string, critical_only?: boolean }): Promise<QueryResult> {
    try {
        // NOTE: Inventory table schema might also vary. Using basic columns.
        /* const sql = `
            SELECT 
                i.product_id, -- Fallback if join fails
                i.quantity
            FROM inventory i
            WHERE 1=1
        `; */
        // Skipping detailed join for safety until schema verified for inventory.
        // If p.name exists in inventory (denormalized), use it.
        // Assuming inventory table exists.

        // const params: any[] = [];
        // Implementation paused/simplified to avoid crash if inventory tables missing/different.
        // Returning mock success to prevent crash but indicate limitation.
        return { success: true, summary: "Inventory query not fully adapted to new schema yet." };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
    }
}

async function queryInvoices(args: { date?: string, supplier_name?: string, limit?: number }): Promise<QueryResult> {
    try {
        let sql = `
            SELECT 
                ih.folio,
                ih.supplier_rut,
                ih.total_amount,
                ih.status,
                ih.issued_date,
                ih.received_date
            FROM invoice_headers ih
            WHERE 1=1
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any[] = [];

        if (args.date) {
            params.push(args.date);
            sql += ` AND (DATE(ih.issued_date) = $${params.length} OR DATE(ih.received_date) = $${params.length})`;
        }

        sql += ` ORDER BY ih.received_date DESC LIMIT 10`;

        const res = await query(sql, params);
        return { success: true, data: res.rows };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
    }
}

async function queryStaff(args: { location_id?: string, status?: 'ACTIVE' | 'ALL' }): Promise<QueryResult> {
    try {
        let sql = `
            SELECT 
                e.name,
                e.job_title,
                al.check_in,
                al.check_out
            FROM attendance_logs al
            JOIN employees e ON al.employee_id = e.id
            WHERE DATE(al.check_in) = CURRENT_DATE
        `;
        if (args.status === 'ACTIVE') {
            sql += ` AND al.check_out IS NULL`;
        }

        sql += ` ORDER BY al.check_in DESC`;

        const res = await query(sql);
        return { success: true, data: res.rows };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
    }
}


// ------------------------------------------------------------------
// 2. Main Server Action
// ------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askReportsAssistant(messages: any[], context?: { locationId?: string, locationName?: string }) {
    try {
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
            {
                type: "function",
                function: {
                    name: "query_sales",
                    description: "Get sales data aggregated by product and location. Use this for questions like 'How much did we sell?'.",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string" },
                            location_name: { type: "string", description: "Name of the branch (e.g. SANTIAGO) to filter by." },
                            start_date: { type: "string", format: "date", description: "YYYY-MM-DD" },
                            end_date: { type: "string", format: "date", description: "YYYY-MM-DD" }
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "query_inventory",
                    description: "Check current stock levels of products.",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string" },
                            location_id: { type: "string" },
                            critical_only: { type: "boolean" }
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "query_invoices",
                    description: "Search for invoices/DTEs received or issued.",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "YYYY-MM-DD" },
                            limit: { type: "number" }
                        },
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "query_staff",
                    description: "See who is working today or attendance logs.",
                    parameters: {
                        type: "object",
                        properties: {
                            location_id: { type: "string" },
                            status: { type: "string", enum: ["ACTIVE", "ALL"] }
                        },
                    },
                },
            },
        ];

        // System Prompt with Context
        const systemMsg = {
            role: "system",
            content: `You are an expert Business Intelligence Assistant for 'Farmacias Vallenar'.
            Your role is to help managers understand their business data.
            
            Current Context:
            - Location ID: ${context?.locationId || 'Global'}
            - Location Name: ${context?.locationName || 'Global'}
            - Date: ${new Date().toISOString()}
            
            Guidelines:
            - ALWAYS try to use the available tools to get real data.
            - If the user asks for 'My branch' or 'This branch', use the Location NAME from context for 'query_sales', or ID if relevant for others.
            - Format numbers as currency (CLP) or units clearly.
            - Summarize the data found in the tool response.
            - If data is empty, suggest what might be wrong (wrong date, no sales).
            - Be concise and professional.
            `
        };

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Use a capable model
            messages: [systemMsg, ...messages],
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;

        // Step 2: Check if tool calls
        if (responseMessage.tool_calls) {
            const toolCalls = responseMessage.tool_calls;

            // For now, we only support one turn of tool execution (simple)
            // But we append the tool call and result to the conversation
            const toolMessages = [];

            // Push the assistant's "intent" to call tools
            toolMessages.push(responseMessage);

            for (const toolCall of toolCalls) {
                // Assert function accessing as usage is correct per OpenAI API but likely missing in specific Type union
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fnName = (toolCall as any).function.name;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fnArgs = JSON.parse((toolCall as any).function.arguments);

                let result: QueryResult = { success: false, error: "Unknown tool" };

                if (fnName === 'query_sales') result = await querySales(fnArgs);
                if (fnName === 'query_inventory') result = await queryInventory(fnArgs);
                if (fnName === 'query_invoices') result = await queryInvoices(fnArgs);
                if (fnName === 'query_staff') result = await queryStaff(fnArgs);

                toolMessages.push({
                    tool_call_id: toolCall.id,
                    role: "tool" as const, // Explicit const assertion
                    name: fnName,
                    content: JSON.stringify(result),
                });
            }

            // Step 3: Get final response from AI with the data
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages: [systemMsg, ...messages, ...toolMessages] as any, // Keep cast if strict mismatch persists
            });

            return {
                message: secondResponse.choices[0].message,
                usage: secondResponse.usage
            };
        }

        return {
            message: responseMessage,
            usage: response.usage
        };

    } catch (error: unknown) {
        console.error("AI Assistant Error:", error);
        return {
            message: { role: "assistant", content: "Lo siento, tuve un problema interno al procesar tu solicitud." },
            error: (error as Error).message
        };
    }
}
