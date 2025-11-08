// tsls-service/src/server.ts (v0.3.0 Final)
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { Project, Node, ts, Identifier } from "ts-morph"; 
import path from 'path';

// --- GLOBAL CACHE AND CONFIG ---
const CACHE_LIFETIME_MS = 5 * 60 * 1000; 
let projectCache: { instance: Project | null, timestamp: number } = { instance: null, timestamp: 0 };

type ToolFunction = (project: Project, args: any) => Promise<any>;
interface ToolRegistry { [key: string]: ToolFunction; }

function getProject(): Project {
    const now = Date.now();
    if (projectCache.instance && now < projectCache.timestamp + CACHE_LIFETIME_MS) {
        return projectCache.instance;
    }
    console.log("[TSLS] Reinitializing full ts-morph Project (Cache Miss/Expired)...");
    const newProject = new Project({
        tsConfigFilePath: path.resolve(__dirname, '../../super-agent/tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });
    projectCache = { instance: newProject, timestamp: now };
    return newProject;
}

// ==================================================================
// REAL TOOL IMPLEMENTATIONS (powered by ts-morph)
// ==================================================================
async function findRefsForNode(node: Identifier) {
  const referencedSymbols = node.findReferences(); 
  let allRefs: Node[] = [];

  for (const symbol of referencedSymbols) {
      for (const ref of symbol.getReferences()) {
          allRefs.push(ref.getNode());
      }
  }

  console.log(`[TSLS] Found ${allRefs.length} reference(s).`);

  // We need to ensure the path is consistent with the monorepo structure
  const repoRoot = path.resolve(__dirname, '../../');

  return {
    status: 'success',
    symbolName: node.getText(),
    references: allRefs.map(ref => {
        const absolutePath = ref.getSourceFile().getFilePath();
        
        // CRITICAL FIX: Make the path relative to the monorepo root
        const relativePath = path.relative(repoRoot, absolutePath); 

        return {
            file: relativePath, // <-- Use the clean, relative path
            line: ref.getStartLineNumber(),
            position: ref.getStart()
        }
    })
  };
}

const tools: ToolRegistry = {
  'find_references': async (project: Project, args: { filePath: string, position: number }) => {
    // CRITICAL DEFENSIVE CHECK: Ensure the path is valid before proceeding
    if (!args.filePath || typeof args.filePath !== 'string') {
        throw { code: -32602, message: `Invalid params: 'filePath' argument must be a string.` };
    }
    
    // 1. Compute ABSOLUTE path once
    const absPath = path.resolve(args.filePath);
    console.log(`[TSLS] 🔎 Finding refs in: ${absPath} at pos ${args.position}`);

    // 2. Load/Refresh the file
    let sourceFile = project.getSourceFile(absPath);
    if (!sourceFile) {
        sourceFile = project.addSourceFileAtPath(absPath);
    } else {
        await sourceFile.refreshFromFileSystem();
    }

    // 3. Find the node
    const node = sourceFile.getDescendantAtPos(args.position);
    
    if (!node) { throw { code: -32001, message: `No node found at position ${args.position}` }; }

    // 4. Check and/or traverse to the valid Identifier node
    if (Node.isIdentifier(node)) { return findRefsForNode(node); }
    
    const parentIdentifier = node.getFirstAncestorByKind(ts.SyntaxKind.Identifier);
    
    if (parentIdentifier) { return findRefsForNode(parentIdentifier); }

    throw { code: -32001, message: `No valid identifier found at or near position ${args.position}` };
  },
};

// ==================================================================
// MCP / JSON-RPC 2.0 SERVER
// ==================================================================
const app = express();
app.use(bodyParser.json());

app.post('/mcp', async (req: Request, res: Response) => {
  const { jsonrpc, method, params, id } = req.body;
  const reqId = (id !== undefined && id !== null) ? String(id) : uuidv4().substring(0, 8);

  let projectInstance: Project | null = null; 

  console.log(`➡️  [MCP Req ${reqId}] ${method}`);

  if (jsonrpc !== '2.0' || !method) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: id });
  }

  try {
    switch (method) {
      case 'tools/list':
        // Only exposing 'find_references' for v0.5.0 testing
        return res.json({
          jsonrpc: '2.0',
          result: { tools: [{ name: 'find_references', description: 'Real TS symbol lookup (V0.3)' }] },
          id: id
        });

      case 'tools/call':
        const toolName = params?.name as string;
        const toolArgs = params?.arguments || {};

        if (!toolName || !Object.prototype.hasOwnProperty.call(tools, toolName)) {
          throw { code: -32601, message: `Tool not found: ${toolName}` };
        }
        
        projectInstance = getProject(); // GET PROJECT INSTANCE
        const result = await tools[toolName as keyof typeof tools](projectInstance, toolArgs);
        
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
      error: { code: error.code || -32603, message: error.message || 'Internal Error' },
      id: id
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 TSLS (REAL MCP) Server v0.3.0 running on port ${PORT}`);
});