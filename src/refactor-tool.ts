import {
    Project,
    ts,
    IndentationText,
    QuoteKind,
    Node,
    SyntaxKind,
    Identifier,
    ReferencedSymbol,
    ReferenceEntry
} from 'ts-morph';
import * as fs from 'fs/promises';
import * as path from 'path';

  // --- Global Project Setup ---

const tsConfigFilePath = path.resolve(
    __dirname, 
    '../../super-agent/tsconfig.json'
);

const project = new Project({
    tsConfigFilePath: tsConfigFilePath,
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        quoteKind: QuoteKind.Single,
    },
});

console.log(`[TSLS Brain] Initialized. Pointing at tsconfig: ${tsConfigFilePath}`);

// --- 1. Validation Skills ---

export async function checkTypeErrors(filePath: string): Promise<string> {
    console.log(`[TSLS Skill] checkTypeErrors called on: ${filePath}`);
    const sourceFile = project.addSourceFileAtPath(filePath);
    await sourceFile.refreshFromFileSystem();
    const diagnostics = await sourceFile.getPreEmitDiagnostics();

    if (diagnostics.length === 0) {
        return "SUCCESS: No type errors found.";
    }

    const errorText = ts.formatDiagnosticsWithColorAndContext(
        diagnostics.map(d => d.compilerObject),
        ts.createCompilerHost(project.compilerOptions.get())
    );
    return `ERROR: Type errors found.\n${errorText}`;
}

// --- 2. File System Skills (The "Hands") ---

export async function safeWriteFile(filePath: string, content: string): Promise<string> {
    console.log(`[TSLS Skill] safeWriteFile called on: ${filePath}`);
    try {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
        
        sourceFile.formatText(); 
        
        await sourceFile.save();
        project.addSourceFileAtPath(filePath);
        return `SUCCESS: File written and formatted at ${filePath}`;
    } catch (e: any) {
        return `ERROR: Failed to write file: ${e.message}`;
    }
}

export async function safeMkdir(dirPath: string): Promise<string> {
    console.log(`[TSLS Skill] safeMkdir called on: ${dirPath}`);
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return `SUCCESS: Directory created at ${dirPath}`;
    } catch (e: any) {
        return `ERROR: Failed to create directory: ${e.message}`;
    }
}

// --- 3. Refactoring Skills (The "Surgical Tools") ---

/**
 * Helper to find the specific Identifier node we want to refactor
 */
function findIdentifierNode(sourceFile: Node, symbolName: string): Identifier | undefined {
    // CORRECTED: 'getFirstDescendant' exists on 'SourceFile' and 'Node' types.
    // We explicitly type 'node' to fix the implicit 'any' error.
    const node = sourceFile.getFirstDescendant((node: Node) =>
        node.getKind() === SyntaxKind.Identifier && node.getText() === symbolName
    );

    // Ensure it's an Identifier before returning
    if (Node.isIdentifier(node)) {
        return node;
    }
    return undefined;
}

export async function findAllReferences(filePath: string, symbolName: string): Promise<string> {
    console.log(`[TSLS Skill] findAllReferences called for: ${symbolName}`);
    const sourceFile = project.addSourceFileAtPath(filePath);

    const identifier = findIdentifierNode(sourceFile, symbolName);

    if (!identifier) {
        return `ERROR: Could not find any identifier with name "${symbolName}" in ${filePath}`;
    }

    // 'findReferences()' returns ReferencedSymbol[]
    const references = identifier.findReferences();

    // CORRECTED: We explicitly type 'ref' and 'r' to fix the implicit 'any' errors.
    const refPaths = references.flatMap((ref: ReferencedSymbol) => 
        ref.getReferences().map((r: ReferenceEntry) => r.getSourceFile().getFilePath())
    );

    return `SUCCESS: Found ${refPaths.length} references in files: ${[...new Set(refPaths)].join(', ')}`;
}

export async function safeRenameSymbol(filePath: string, symbolName: string, newName: string): Promise<string> {
    console.log(`[TSLS Skill] safeRenameSymbol called for: ${symbolName} -> ${newName}`);
    const sourceFile = project.addSourceFileAtPath(filePath);

    const identifier = findIdentifierNode(sourceFile, symbolName);

    if (!identifier) {
        return `ERROR: Could not find any identifier with name "${symbolName}" in ${filePath}`;
    }

    // 'rename()' is a method on the Identifier node
    identifier.rename(newName);

    await project.save();
    return `SUCCESS: Renamed "${symbolName}" to "${newName}" across all files.`;
}

export async function safeUpdateImport(filePath: string, oldPath: string, newPath: string): Promise<string> {
    console.log(`[TSLS Skill] safeUpdateImport called on: ${filePath}`);
    const sourceFile = project.addSourceFileAtPath(filePath);
    let changes = 0;

    sourceFile.getImportDeclarations().forEach(declaration => {
        if (declaration.getModuleSpecifierValue() === oldPath) {
        declaration.setModuleSpecifier(newPath);
        changes++;
        }
    });

    if (changes > 0) {
        await sourceFile.save();
        return `SUCCESS: Updated ${changes} import(s) in ${filePath}.`;
    } else {
        return `INFO: No imports matching "${oldPath}" were found in ${filePath}.`;
    }
}