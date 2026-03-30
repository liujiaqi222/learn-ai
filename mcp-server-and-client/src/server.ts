import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod'

const server = new McpServer({
    name: "mcp-server",
    version: "1.0.0",

}, {
    capabilities: {
        resources: {},
        tools: {},
        prompts: {}
    }
});


server.registerTool('create-user', {
    title: 'create a new user in the database',
    inputSchema: {
        name: z.string(),
        email: z.string(),
        address: z.string(),
        phone: z.string()
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    }

}, async (params) => {
    try {
        const id = await createUser(params)
        return {
        content: [
            { type: 'text', text: `User ${id} created sucessfully` }
        ]
    }
    }
    catch {
        return {
            content: [
                { type: 'text', text: 'Failed to save user' }
            ]
        }
    }
    
})


async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main()