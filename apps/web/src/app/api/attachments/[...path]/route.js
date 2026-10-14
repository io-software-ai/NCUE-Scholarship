import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

const ATTACHMENTS_DIR = path.resolve(process.cwd(), 'public', 'storage', 'attachments');
// 可在瀏覽器內直接開啟的類型；其餘一律強制下載
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const jsonError = (error, status) =>
    new NextResponse(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

export async function GET(request, { params }) {
    try {
        const resolvedParams = await params;
        const { path: pathSegments } = resolvedParams || {};

        if (!pathSegments || pathSegments.length === 0) return jsonError('File path is required', 400);

        // 解析後必須仍位於附件目錄內（防路徑穿越）
        const filePath = path.resolve(ATTACHMENTS_DIR, pathSegments.join('/'));
        if (!filePath.startsWith(ATTACHMENTS_DIR + path.sep)) return jsonError('Invalid path', 400);

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return jsonError('File not found', 404);

        const fileBuffer = fs.readFileSync(filePath);
        const contentType = mime.lookup(filePath) || 'application/octet-stream';
        const inline = INLINE_TYPES.has(contentType);
        const asciiName = path.basename(filePath).replace(/[^\w.-]/g, '_');

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': inline ? contentType : 'application/octet-stream',
                'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"`,
                'X-Content-Type-Options': 'nosniff',
                // 即使檔案內容被當成文件解析，也不能執行腳本或存取本站 cookie / storage
                'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        console.error(`[API ERROR: /api/attachments]`, error);
        return jsonError('Internal Server Error', 500);
    }
}
