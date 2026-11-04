import express from 'express';
import cors from 'cors';
import PptxGenJS from 'pptxgenjs'; // Import pptxgenjs
import fs from 'fs'; // Import File System module
import path from 'path'; // Import Path module
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = 3002;

// --- Meta API Config ---
const META_API_BASE = process.env.META_API_BASE || 'https://api.meta.ai/v1';
const META_API_KEY = process.env.MODEL_API_KEY;

console.log('Meta API Config:', { base: META_API_BASE, keyPrefix: META_API_KEY ? `${META_API_KEY.slice(0, 4)}...` : '(missing)' });

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for Base64 logo uploads

app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// --- Helper Function for Auth ---
function getMetaAuth() {
    const key = resolveMetaKey();
    if (!key) {
        throw new Error('Meta API key not configured — set MODEL_API_KEY in backend/.env or add one in Settings');
    }
    return key;
}

/**
 * Calls Meta chat completions to generate an outline.
 *
 * @param {object} args
 * @param {string} args.model
 * @param {Array<{role:string, parts:[{text:string}]}>} args.contents
 * @param {{parts:[{text:string}]}} [args.systemInstruction]
 * @param {object} [args.generationConfig]
 * @returns {Promise<{rawText:string, candidates:any[], json:any}>}
 */
// Sprint 07: Muse-editable (dead-code removal follows, proof that 983-line file is touchable without 180s timeout).
async function generateOutline({ model, contents, systemInstruction, generationConfig }) {
    const messages = [];
    const systemText = systemInstruction?.parts?.[0]?.text;
    if (systemText) {
        messages.push({ role: 'system', content: systemText });
    }
    for (const item of contents ?? []) {
        messages.push({
            role: item.role === 'model' ? 'assistant' : item.role,
            content: item.parts?.[0]?.text ?? ''
        });
    }
    const body = { model, messages };
    if (generationConfig?.temperature !== undefined) {
        body.temperature = generationConfig.temperature;
    }
    const maxTokens = generationConfig?.max_tokens ?? generationConfig?.maxOutputTokens ?? generationConfig?.maxTokens;
    if (maxTokens !== undefined) {
        body.max_tokens = maxTokens;
    }
    const apiKey = getMetaAuth();
    const response = await fetch(`${META_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 401) {
            throw new Error(`Meta API error: 401 - ${errorBody} (hint: MODEL_API_KEY must use LLM_ prefix)`);
        }
        throw new Error(`Meta API error: ${response.status} - ${errorBody}`);
    }
    const result = await response.json();
    const rawText = result.choices?.[0]?.message?.content || '';
    return { rawText, candidates: result.choices ?? [], json: result };
}

// --- Meta key store (D5=(a), D6=(a): single-operator, server-side JSON, 0600) ---
const META_STORE_PATH = path.join(__dirname, '.meta-key.json');

function maskKey(key) {
    if (!key || key.length < 8) return '***';
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function loadMetaStore() {
    try { return JSON.parse(fs.readFileSync(META_STORE_PATH, 'utf8')); } catch { return {}; }
}

function saveMetaStore(obj) {
    fs.writeFileSync(META_STORE_PATH, JSON.stringify(obj, null, 2));
    try { fs.chmodSync(META_STORE_PATH, 0o600); } catch {}
}

function resolveMetaKey() {
    const store = loadMetaStore();
    return store.apiKey || META_API_KEY || '';
}

app.get('/api/providers/meta', (_req, res) => {
    const store = loadMetaStore();
    res.json({ id: 'meta', configured: !!resolveMetaKey(), keyMask: store.apiKey ? maskKey(store.apiKey) : null, model: store.model || null });
});

app.put('/api/providers/meta', (req, res) => {
    const { apiKey, model } = req.body || {};
    if (typeof apiKey === 'string' && apiKey.trim()) {
        if (apiKey.trim().length < 16) return res.status(400).json({ error: 'Key too short (≥16 chars)' });
        const store = loadMetaStore();
        store.apiKey = apiKey.trim();
        if (typeof model === 'string' && model.trim()) store.model = model.trim();
        saveMetaStore(store);
        return res.json({ ok: true, keyMask: maskKey(store.apiKey) });
    }
    if (typeof model === 'string' && model.trim()) {
        const store = loadMetaStore();
        store.model = model.trim();
        saveMetaStore(store);
        return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Provide apiKey (≥16 chars) or model' });
});

app.delete('/api/providers/meta/key', (_req, res) => {
    const store = loadMetaStore();
    delete store.apiKey;
    saveMetaStore(store);
    res.json({ ok: true });
});

app.post('/api/providers/meta/test', async (req, res) => {
    const store = loadMetaStore();
    const key = (req.body?.apiKey || store.apiKey || META_API_KEY || '').trim();
    const model = (req.body?.model || store.model || 'muse-spark-1.3-contributor').trim();
    if (!key) return res.status(400).json({ ok: false, detail: 'No key configured — add one in Settings' });
    const t0 = Date.now();
    try {
        const r = await fetch(`${META_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], temperature: 0, max_tokens: 4 }),
        });
        const latencyMs = Date.now() - t0;
        if (!r.ok) return res.json({ ok: false, detail: `Meta rejected the key (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`, latencyMs });
        return res.json({ ok: true, detail: `OK — model ${model}`, latencyMs });
    } catch (e) {
        return res.json({ ok: false, detail: String(e?.message || e) });
    }
});

// === API Endpoints ===

// 1. Meta Chat Endpoint (F1-swap: was Vertex AI Chat)
app.post('/api/chat', async (req, res) => {
    try {
        const { model, message, history = [], config = {} } = req.body;

        const contents = [
            ...history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            })),
            { role: 'user', parts: [{ text: message }] }
        ];

        const generationConfig = {
            temperature: config.temperature ?? 0.7,
            maxOutputTokens: config.maxOutputTokens ?? 4096,
        };

        const { rawText: text } = await generateOutline({ model, contents, generationConfig });

        res.json({ text });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Failed to generate response',
            details: error.message
        });
    }
});

// 2. Outline Generation Endpoint

app.post('/api/generate-outline', async (req, res) => {

    console.log('Received request for /api/generate-outline...');

    const { model, history } = req.body;

    // --- Define the Outline Generation System Prompt ---

    // This prompt forces the AI to output *only* JSON.

    const OUTLINE_SYSTEM_PROMPT = `

You are an expert presentation outliner.

You will be given a conversation history (a "Strategy Discussion") between a user and an AI.

Your *only* job is to analyze this history and generate a structured presentation outline in JSON format.

The user's goal, audience, and core message are in the history.

Base the outline on these extracted needs.

You MUST return ONLY a valid JSON object, and nothing else.

Do not add "\`\`\`json" or any conversational text.

The JSON format MUST be:

{

  "title": "A compelling title for the presentation",

  "slides": [

    {

      "title": "Slide 1: Title Slide",

      "content": "A brief description of the title slide content (e.g., 'Title, Subtitle, Author')."

    },

    {

      "title": "Slide 2: Introduction",

      "content": "A bullet list of key points for the introduction. (e.g., 'Hook, The Problem, Our Solution')."

    },

    // ... generate as many slides as needed ...

    {

      "title": "Slide N: Conclusion",

      "content": "A bullet list for the conclusion. (e.g., 'Summary of Key Points, Call to Action')."

    }

  ]

}

`;

    // --- End of System Prompt ---

    try {

        // Format the history from the client

        const contents = history.map(msg => ({

            role: msg.role,

            parts: [{ text: msg.content }]

        }));

        const systemInstruction = { parts: [{ text: OUTLINE_SYSTEM_PROMPT }] };

        const generationConfig = {

            // We want JSON, so we make the AI deterministic

            temperature: 0.0,

        };

        const { rawText } = await generateOutline({ model, contents, systemInstruction, generationConfig });

        // --- JSON Parsing ---

        // The AI might still include markdown ticks. We must clean them.

        const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        try {

            const jsonOutline = JSON.parse(cleanedText);

            if (typeof jsonOutline !== 'object' || !jsonOutline || typeof jsonOutline.title !== 'string' || !jsonOutline.title.trim() || !Array.isArray(jsonOutline.slides) || jsonOutline.slides.length === 0) {
                return res.status(422).json({ error: 'Invalid outline shape', details: 'expected {title: non-empty string, slides: [{title, content}][] with at least one slide}' });
            }
            for (const s of jsonOutline.slides) {
                if (typeof s.title !== 'string' || typeof s.content !== 'string') {
                    return res.status(422).json({ error: 'Invalid slide shape', details: 'each slide needs {title: string, content: string}' });
                }
            }
            console.log('Successfully parsed JSON outline.');

            res.json(jsonOutline);

        } catch (parseError) {

            return res.status(422).json({ error: 'Invalid outline JSON', details: parseError.message });

        }

    } catch (error) {

        console.error('Outline generation error:', error);

        res.status(500).json({

            error: 'Failed to generate outline',

            details: error.message

        });

    }

});

// 3. Final MVP Presentation Generation Endpoint

app.post('/api/generate-presentation', async (req, res) => {

    // --- 1. RECEIVE THE FULL PAYLOAD ---

    const { outline, brandKit } = req.body;

    console.log('--- FINAL MVP GENERATION REQUEST (IN-MEMORY) ---');

    console.log('Outline Title:', outline.title);

    console.log('Total Slides:', outline.slides.length);

    console.log('------------------------------------------------');

    try {

        // --- 2. DYNAMICALLY CREATE BRANDED PRESENTATION ---

        let pres = new PptxGenJS();

        const userColor = brandKit.color.replace('#', '') || '0072C6';

        const titleColor = userColor;

        const footerTextColor = '808080';

        // --- Define Master Slide (simplified) ---

        pres.defineSlideMaster({

            title: 'MASTER_LAYOUT',

            background: { color: 'F5F5F5' },

            objects: [

                {

                    text: {

                        text: 'Company Confidential',

                        options: { x: 0.5, y: 7.0, w: 4.0, h: 0.25, fontSize: 10, color: footerTextColor }

                    }

                }

            ],

            slideNumber: { x: 9.0, y: 7.0, w: 0.5, h: 0.25, color: footerTextColor, fontSize: 10 }

        });

        // --- 3. LOOP THROUGH OUTLINE AND CREATE SLIDES ---

        console.log('Generating slides from outline...');

        for (const slideData of outline.slides) {

            let slide = pres.addSlide({ masterName: 'MASTER_LAYOUT' });

            // Add title - create a fresh primitive string using template literal

            const titleText = `${slideData.title || ''}`;

            slide.addText(titleText, {

                x: 0.5,

                y: 0.25,

                w: 9.0,

                h: 1.0,

                fontSize: 32,

                color: titleColor,

                bold: true,

                align: 'center'

            });

            // Add content as bullets - use text objects to avoid string mutation issues

            const contentText = `${slideData.content || ''}`;

            const contentPoints = contentText.split('\n')

                .map(pt => pt.trim())

                .filter(pt => pt.length > 0)

                .map(pt => ({ text: pt })); // Convert to text objects

            if (contentPoints.length > 0) {

                slide.addText(contentPoints, {

                    x: 0.5,

                    y: 1.5,

                    w: 9.0,

                    h: 5.5,

                    fontSize: 18,

                    bullet: true,

                    align: 'left'

                });

            }

            if (brandKit.logo) {

                slide.addImage({

                    data: brandKit.logo,

                    x: 9.0, y: 0.25, w: 0.75, h: 0.75

                });

            }

        }

        console.log(`Successfully added ${outline.slides.length} slides.`);

        // --- 4. GENERATE FILE IN MEMORY AS A BUFFER ---

        // This is the correct server-side method.

        console.log('Writing presentation to in-memory buffer...');

        const pptxBuffer = await pres.write('nodebuffer');

        console.log('Buffer created successfully.');

        // --- 5. SEND BUFFER TO USER ---

        // We must manually set the headers that res.download() did for us.

        res.setHeader('Content-Disposition', 'attachment; filename="presentation.pptx"');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

        res.send(pptxBuffer);

    } catch (err) {

        console.error('Error in final presentation generation:', err.message);

        res.status(500).json({ error: 'Failed to generate presentation.', details: err.message });

    }

});

// 4. DEBUG: Test Presentation Generation Endpoint
app.post('/api/generate-debug-test', async (req, res) => {
    console.log('--- DEBUG TEST PRESENTATION REQUEST ---');
    
    const errors = [];
    const warnings = [];
    
    try {
        let pres = new PptxGenJS();
        
        // Define a simple master slide
        pres.defineSlideMaster({
            title: 'DEBUG_MASTER',
            background: { color: 'FFFFFF' },
            objects: [
                {
                    text: {
                        text: 'Debug Test',
                        options: { x: 0.5, y: 7.0, w: 4.0, h: 0.25, fontSize: 10, color: '808080' }
                    }
                }
            ],
            slideNumber: { x: 9.0, y: 7.0, w: 0.5, h: 0.25, color: '808080', fontSize: 10 }
        });
        
        // Slide 1: Title Slide with Text
        try {
            let slide1 = pres.addSlide({ masterName: 'DEBUG_MASTER' });
            slide1.addText('Debug Test Presentation', {
                x: 1.0, y: 2.0, w: 8.0, h: 1.0,
                fontSize: 44, bold: true, align: 'center', color: '000000'
            });
            slide1.addText('Testing PptxGenJS Features', {
                x: 1.0, y: 3.5, w: 8.0, h: 0.5,
                fontSize: 24, align: 'center', color: '666666'
            });
            console.log('✓ Slide 1 (Title) created successfully');
        } catch (err) {
            const errorMsg = `Slide 1 (Title): ${err.message}`;
            errors.push(errorMsg);
            console.error('✗ Slide 1 error:', err.message);
            console.error('✗ Slide 1 stack:', err.stack);
        }
        
        // Slide 2: Text with Bullets
        try {
            let slide2 = pres.addSlide({ masterName: 'DEBUG_MASTER' });
            slide2.addText('Text Features', {
                x: 0.5, y: 0.5, w: 9.0, h: 0.5,
                fontSize: 36, bold: true, color: '000000'
            });
            // Create bullet points as an array of text objects
            // PptxGenJS tries to modify string primitives, so we use text objects instead
            const bulletPoints = [
                { text: 'First bullet point' },
                { text: 'Second bullet point' },
                { text: 'Third bullet point with longer text to test wrapping' }
            ];
            
            slide2.addText(bulletPoints, {
                x: 1.0, y: 1.5, w: 8.0, h: 4.0,
                fontSize: 18, bullet: true, align: 'left', color: '000000'
            });
            console.log('✓ Slide 2 (Bullets) created successfully');
        } catch (err) {
            const errorMsg = `Slide 2 (Bullets): ${err.message}`;
            errors.push(errorMsg);
            console.error('✗ Slide 2 error:', err.message);
            console.error('✗ Slide 2 stack:', err.stack);
        }
        
        // Slide 3: Shapes and Diagrams
        try {
            let slide3 = pres.addSlide({ masterName: 'DEBUG_MASTER' });
            slide3.addText('Shapes & Diagrams', {
                x: 0.5, y: 0.5, w: 9.0, h: 0.5,
                fontSize: 36, bold: true, color: '000000'
            });
            
            // Add rectangles
            slide3.addShape(pres.shapes.RECTANGLE, {
                x: 1.0, y: 1.5, w: 2.0, h: 1.5,
                fill: { color: '0072C6' },
                line: { color: '000000', width: 2 }
            });
            slide3.addShape(pres.shapes.RECTANGLE, {
                x: 4.0, y: 1.5, w: 2.0, h: 1.5,
                fill: { color: '76B900' },
                line: { color: '000000', width: 2 }
            });
            slide3.addShape(pres.shapes.RECTANGLE, {
                x: 7.0, y: 1.5, w: 2.0, h: 1.5,
                fill: { color: 'F25022' },
                line: { color: '000000', width: 2 }
            });
            
            // Add circles
            slide3.addShape(pres.shapes.OVAL, {
                x: 2.0, y: 3.5, w: 1.5, h: 1.5,
                fill: { color: 'FFC000' },
                line: { color: '000000', width: 2 }
            });
            slide3.addShape(pres.shapes.OVAL, {
                x: 5.0, y: 3.5, w: 1.5, h: 1.5,
                fill: { color: 'A020F0' },
                line: { color: '000000', width: 2 }
            });
            
            console.log('✓ Slide 3 (Shapes) created successfully');
        } catch (err) {
            const errorMsg = `Slide 3 (Shapes): ${err.message}`;
            errors.push(errorMsg);
            console.error('✗ Slide 3 error:', err.message);
            console.error('✗ Slide 3 stack:', err.stack);
        }
        
        // Slide 4: Table
        try {
            let slide4 = pres.addSlide({ masterName: 'DEBUG_MASTER' });
            slide4.addText('Table Feature', {
                x: 0.5, y: 0.5, w: 9.0, h: 0.5,
                fontSize: 36, bold: true, color: '000000'
            });
            
            // PptxGenJS table format: array of arrays with text strings
            const tableData = [
                ['Header 1', 'Header 2', 'Header 3'],
                ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
                ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3'],
                ['Row 3 Col 1', 'Row 3 Col 2', 'Row 3 Col 3']
            ];
            
            slide4.addTable(tableData, {
                x: 1.0, y: 1.5, w: 8.0, h: 4.0,
                fontSize: 14,
                border: { type: 'solid', color: '000000', pt: 1 },
                fill: { color: 'F5F5F5' },
                colW: [2.5, 2.5, 2.5],
                align: 'left'
            });
            console.log('✓ Slide 4 (Table) created successfully');
        } catch (err) {
            const errorMsg = `Slide 4 (Table): ${err.message}`;
            errors.push(errorMsg);
            console.error('✗ Slide 4 error:', err.message);
            console.error('✗ Slide 4 stack:', err.stack);
        }
        
        // Slide 5: Text Overlays and Complex Layout
        try {
            let slide5 = pres.addSlide({ masterName: 'DEBUG_MASTER' });
            slide5.addText('Complex Layout Test', {
                x: 0.5, y: 0.5, w: 9.0, h: 0.5,
                fontSize: 36, bold: true, color: '000000'
            });
            
            // Add background shape
            slide5.addShape(pres.shapes.RECTANGLE, {
                x: 1.0, y: 1.5, w: 8.0, h: 4.0,
                fill: { color: 'E0E0E0' },
                line: { color: '000000', width: 1 }
            });
            
            // Add text overlay (text doesn't support fill, so we'll use a background shape instead)
            slide5.addShape(pres.shapes.RECTANGLE, {
                x: 1.5, y: 2.0, w: 7.0, h: 1.0,
                fill: { color: '0072C6', transparency: 50 },
                line: { color: '0072C6', width: 0 }
            });
            slide5.addText('Overlay Text', {
                x: 1.5, y: 2.0, w: 7.0, h: 1.0,
                fontSize: 28, bold: true, color: 'FFFFFF',
                align: 'center'
            });
            
            // Add more text
            slide5.addText('This slide tests text overlays and complex layouts with multiple elements.', {
                x: 1.5, y: 3.5, w: 7.0, h: 1.5,
                fontSize: 16, color: '000000'
            });
            
            console.log('✓ Slide 5 (Complex Layout) created successfully');
        } catch (err) {
            const errorMsg = `Slide 5 (Complex Layout): ${err.message}`;
            errors.push(errorMsg);
            console.error('✗ Slide 5 error:', err.message);
            console.error('✗ Slide 5 stack:', err.stack);
        }
        
        // Generate buffer
        console.log('Writing presentation to in-memory buffer...');
        const pptxBuffer = await pres.write('nodebuffer');
        console.log('Buffer created successfully.');
        
        // Log summary
        console.log('--- DEBUG TEST SUMMARY ---');
        console.log(`Total slides: 5`);
        console.log(`Errors: ${errors.length}`);
        console.log(`Warnings: ${warnings.length}`);
        
        if (errors.length > 0) {
            console.error('Errors found:');
            errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
        }
        
        if (warnings.length > 0) {
            console.warn('Warnings:');
            warnings.forEach((warn, idx) => console.warn(`  ${idx + 1}. ${warn}`));
        }
        
        // Send response with debug info
        res.setHeader('Content-Disposition', 'attachment; filename="debug-test-presentation.pptx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('X-Debug-Errors', JSON.stringify(errors));
        res.setHeader('X-Debug-Warnings', JSON.stringify(warnings));
        res.setHeader('X-Debug-Slides-Created', '5');
        res.send(pptxBuffer);
        
    } catch (err) {
        console.error('Fatal error in debug test generation:', err.message);
        console.error('Stack trace:', err.stack);
        res.status(500).json({
            error: 'Failed to generate debug test presentation.',
            details: err.message,
            stack: err.stack,
            errors: errors,
            warnings: warnings
        });
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
    console.log('Meta Model API via', META_API_BASE);
    console.log('Set MODEL_API_KEY in backend/.env to enable generation.');
});
