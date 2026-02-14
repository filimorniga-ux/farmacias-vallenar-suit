#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

if (!VERCEL_TOKEN) {
    console.error("Error: VERCEL_TOKEN environment variable is required.");
    process.exit(1);
}

const server = new Server(
    {
        name: "vercel-lite",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Helper function for Vercel API requests
async function vercelRequest(endpoint, method = "GET", body = null, query = {}) {
    const url = new URL(`https://api.vercel.com${endpoint}`);
    Object.keys(query).forEach((key) => {
        if (query[key] !== undefined && query[key] !== null) {
            url.searchParams.append(key, String(query[key]));
        }
    });

    const options = {
        method,
        headers: {
            Authorization: `Bearer ${VERCEL_TOKEN}`,
            "Content-Type": "application/json",
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vercel API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json();
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "vercel_api_request",
                description: "Make a generic request to the Vercel API. Use this for any operation not covered by other tools.",
                inputSchema: {
                    type: "object",
                    properties: {
                        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"], description: "HTTP method" },
                        endpoint: { type: "string", description: "API endpoint path (e.g., '/v9/projects')" },
                        body: { type: "object", description: "JSON body for the request (optional)" },
                        query: { type: "object", description: "Query parameters (optional)" },
                    },
                    required: ["method", "endpoint"],
                },
            },
            {
                name: "vercel_list_projects",
                description: "List Vercel projects.",
                inputSchema: {
                    type: "object",
                    properties: {
                        limit: { type: "number", description: "Limit number of projects (default 20)" },
                        search: { type: "string", description: "Search term for projects (optional)" },
                    },
                },
            },
            {
                name: "vercel_list_deployments",
                description: "List deployments for a specific project.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectId: { type: "string", description: "ID or name of the project" },
                        limit: { type: "number", description: "Limit number of deployments (default 20)" },
                        state: { type: "string", description: "Filter by state (e.g., 'READY', 'ERROR') (optional)" },
                    },
                    required: ["projectId"],
                },
            },
            {
                name: "vercel_create_deployment",
                description: "Create a new deployment.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Project name" },
                        files: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    file: { type: "string", description: "Path to file" },
                                    data: { type: "string", description: "Content of file" }
                                }
                            },
                            description: "Files to deploy (simplified)"
                        },
                        projectSettings: { type: "object", description: "Project settings (optional)" }
                    },
                    required: ["name"],
                },
            }
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const { name, arguments: args } = request.params;

        if (name === "vercel_api_request") {
            const { method, endpoint, body, query } = args;
            const result = await vercelRequest(endpoint, method, body, query);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "vercel_list_projects") {
            const { limit = 20, search } = args || {};
            const result = await vercelRequest("/v9/projects", "GET", null, { limit, search });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "vercel_list_deployments") {
            const { projectId, limit = 20, state } = args;
            const result = await vercelRequest("/v6/deployments", "GET", null, { projectId, limit, state });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        if (name === "vercel_create_deployment") {
            // simplified implementation, relies on `vercelRequest` to `/v13/deployments`
            const body = {
                name: args.name,
                files: args.files, // logic for files would need expansion for real usage
                projectSettings: args.projectSettings
            };
            const result = await vercelRequest("/v13/deployments", "POST", body);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }


        throw new Error(`Tool not found: ${name}`);
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
