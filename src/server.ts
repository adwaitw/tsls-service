import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';

// Define a type for our tools to keep TypeScript happy
type ToolFunction = (args: any) => Promise<any>;
interface ToolRegistry {
  [key: string]: ToolFunction;
}

// ==================================================================
// MOCK TOOL IMPLEMENTATIONS (v0.2.0 baseline)
// ==================================================================
const tools: ToolRegistry = {
    'check_types': async (args: any) => {
    console.log(`[TSLS] Checking types for: ${args.filePath}`);
    return { status: 'success', errors: [], checkedFile: args.filePath };
    },

    'find_references': async (args: any) => {
    console.log(`[TSLS] Finding refs in ${args.filePath} at pos ${args.position}`);
    return { 
        status: 'success', 
        references: [
        { file: 'src/components/Button.tsx', line: 10 },
        { file: 'src/pages/index.tsx', line: 42 }
        ]
    };
    }
};

// ==================================================================
// MCP / JSON-RPC 2.0 SERVER
// ==================================================================
const app = express();
app.use(bodyParser.json());

app.post('/mcp', async (req: Request, res: Response) => {
    const { jsonrpc, method, params, id } = req.body;
    // Ensure we have a string ID for logging, even if null in request
    const reqId = (id !== undefined && id !== null) ? String(id) : uuidv4().substring(0, 8);

    console.log(`➡️  [MCP Req ${reqId}] ${method}`);

    if (jsonrpc !== '2.0' || !method) {
    return res.status(400).json({
        jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: id
    });
    }

    try {
    switch (method) {
        case 'tools/list':
        return res.json({
            jsonrpc: '2.0',
            result: {
            tools: [
                { name: 'check_types', description: 'Run TS compiler validation' },
                { name: 'find_references', description: 'Find all symbol references' }
            ]
            },
            id: id
        });

        case 'tools/call':
        // Safe access with optional chaining and explicit type check
        const toolName = params?.name as string;
        const toolArgs = params?.arguments || {};

        if (!toolName || !Object.prototype.hasOwnProperty.call(tools, toolName)) {
            throw { code: -32601, message: `Tool not found: ${toolName}` };
        }
        
        const result = await tools[toolName](toolArgs);
        return res.json({
            jsonrpc: '2.0',
            result: { content: [{ type: 'json', json: result }] },
            id: id
        });

        default:
        throw { code: -32601, message: `Method not found: ${method}` };
    }
    } catch (error: any) {
    console.error(`❌ [MCP Error ${reqId}]`, error.message || error);
    return res.status(500).json({
        jsonrpc: '2.0',
        error: { 
        code: error.code || -32603, 
        message: error.message || 'Internal Error' 
        },
        id: id
    });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🤖 TSLS (MCP) Server v0.2.0 running on port ${PORT}`);
});