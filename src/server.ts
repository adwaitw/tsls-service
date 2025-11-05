import express from 'express';

import {
    checkTypeErrors,
    safeWriteFile,
    safeMkdir,
    findAllReferences,
    safeRenameSymbol,
    safeUpdateImport
} from './refactor-tool';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3001;

app.use((req, res, next) => {
    console.log(`[TSLS Service] Received ${req.method} request for ${req.url}`);
    next();
});

app.post('/check-types', async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: 'filePath is required' });
        const result = await checkTypeErrors(filePath);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/write-file', async (req, res) => {
    try {
        const { filePath, content } = req.body;
        if (!filePath || content == null) return res.status(400).json({ error: 'filePath and content are required' });
        const result = await safeWriteFile(filePath, content);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/mkdir', async (req, res) => {
    try {
        const { dirPath } = req.body;
        if (!dirPath) return res.status(400).json({ error: 'dirPath is required' });
        const result = await safeMkdir(dirPath);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/find-references', async (req, res) => {
    try {
        const { filePath, symbolName } = req.body;
        if (!filePath || !symbolName) return res.status(400).json({ error: 'filePath and symbolName are required' });
        const result = await findAllReferences(filePath, symbolName);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/rename-symbol', async (req, res) => {
    try {
        const { filePath, symbolName, newName } = req.body;
        if (!filePath || !symbolName || !newName) return res.status(400).json({ error: 'filePath, symbolName, and newName are required' });
        const result = await safeRenameSymbol(filePath, symbolName, newName);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/update-import', async (req, res) => {
    try {
        const { filePath, oldPath, newPath } = req.body;
        if (!filePath || !oldPath || !newPath) return res.status(400).json({ error: 'filePath, oldPath, and newPath are required' });
        const result = await safeUpdateImport(filePath, oldPath, newPath);
        res.json({ result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`[TSLS Service] "Robotic Arm" is online and listening on http://localhost:${PORT}`);
});
