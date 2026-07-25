import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

export async function GET(request, { params }) {
    try {
        // **FIX**: Await the params object before accessing its properties.
        const resolvedParams = await params;
        const { path: pathSegments } = resolvedParams || {};

        if (!pathSegments || pathSegments.length === 0) {
            return new NextResponse(JSON.stringify({ error: 'File path is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const fileName = pathSegments.join('/');
        const safeFileName = path.normalize(fileName).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(process.cwd(), 'public', 'storage', 'attachments', safeFileName);

        if (!fs.existsSync(filePath)) {
            return new NextResponse(JSON.stringify({ error: `File not found: ${safeFileName}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const contentType = mime.lookup(filePath) || 'application/octet-stream';

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
            },
        });

    } catch (error) {
        console.error(`[API ERROR: /api/attachments]`, error);
        return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}