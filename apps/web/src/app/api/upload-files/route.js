import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { verifyUserAuth, checkRateLimit, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';

export async function POST(request) {
    try {
        // Rate limiting 和用戶身份驗證
        const rateLimitCheck = checkRateLimit(request, 'upload-files', 10, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: false,
            endpoint: '/api/upload-files'
        });
        if (!authCheck.success) return authCheck.error;

        // 解析 FormData
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: '沒有檔案被上傳' }, { status: 400 });
        }

        const allowedFileTypes = {
            // PDF
            'application/pdf': ['pdf'],
            // Images
            'image/jpeg': ['jpeg', 'jpg'],
            'image/png': ['png'],
            'image/webp': ['webp'],
            // Word
            'application/msword': ['doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
            'application/vnd.oasis.opendocument.text': ['odt'],
            // Excel
            'application/vnd.ms-excel': ['xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
            'application/vnd.oasis.opendocument.spreadsheet': ['ods'],
            // PowerPoint
            'application/vnd.ms-powerpoint': ['ppt'],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
            'application/vnd.oasis.opendocument.presentation': ['odp'],
        };
        const maxFileSize = 15 * 1024 * 1024;

        const uploadResults = [];
        const uploadErrors = [];
        const uploadDir = join(process.cwd(), 'public', 'storage', 'attachments');

        // 確保上傳目錄存在
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true });
        }

        for (const [index, file] of files.entries()) {
            const originalName = file.name;
            const fileExtension = originalName.split('.').pop()?.toLowerCase() || '';

            try {
                // 檔案驗證
                const isMimeTypeAllowed = Object.keys(allowedFileTypes).includes(file.type);
                const isExtensionAllowed = Object.values(allowedFileTypes).flat().includes(fileExtension);
                if (!isMimeTypeAllowed && !isExtensionAllowed) {
                    throw new Error(`不支援的檔案類型 '.${fileExtension}'`);
                }
                if (file.size > maxFileSize) throw new Error('檔案大小超過 15MB 限制');
                if (file.size === 0) throw new Error('檔案為空');

                // 處理與保存檔案
                const bytes = await file.arrayBuffer();
                const buffer = Buffer.from(bytes);
                const hash = createHash('md5').update(buffer).digest('hex');
                const timestamp = Date.now();

                // 在檔名中加入檔案在陣列 index 和一個隨機數
                const randomSuffix = Math.random().toString(36).substring(2, 8);
                const safeFileName = `${timestamp}-${index}-${hash.substring(0, 8)}-${randomSuffix}.${fileExtension}`;

                const filePath = join(uploadDir, safeFileName);
                const publicPath = `/storage/attachments/${safeFileName}`;

                await writeFile(filePath, buffer);

                // 記錄成功操作
                logSuccessAction('FILE_UPLOAD', '/api/upload-files', {
                    userId: authCheck.user.id,
                    fileName: originalName,
                    storedPath: publicPath
                });

                uploadResults.push({
                    originalName,
                    path: publicPath,
                    size: file.size,
                    mimeType: file.type,
                });

            } catch (e) {
                console.error(`處理檔案 ${originalName} 時發生錯誤:`, e);
                uploadErrors.push({ fileName: originalName, error: e.message || '伺服器處理失敗' });
            }
        }

        // 回傳處理結果
        return NextResponse.json({
            success: true,
            data: {
                uploaded: uploadResults,
                errors: uploadErrors
            }
        });

    } catch (error) {
        return handleApiError(error, '/api/upload-files');
    }
}
