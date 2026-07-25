'use client';

import React from 'react';

const htmlToPlainText = (html) => {
    if (!html) return '';
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<li.*?>/gi, '\n✅ ')
        .replace(/<[^>]*>?/gm, '');
    return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
};

// --- 主要預覽組件 ---
const LinePreview = ({ announcement }) => {
    if (!announcement) {
        return (
            <div className="flex justify-center items-center h-full p-4">
                <div className="text-ink-soft">無法載入公告內容</div>
            </div>
        );
    }

    // --- 準備核心資訊 ---
    const startDate = announcement.application_start_date ? new Date(announcement.application_start_date).toLocaleDateString('en-CA') : null;
    const endDate = announcement.application_end_date ? new Date(announcement.application_end_date).toLocaleDateString('en-CA') : '無期限';
    const dateString = startDate ? `${startDate} ~ ${endDate}` : endDate;
    
    const titleLine = `🎓【分類 ${announcement.category || '未分類'}】 ${announcement.title || '無標題'}`;
    const periodLine = `\n\n⚠️ 申請期間：\n${dateString}`;
    const submissionLine = `\n\n📦 送件方式：\n${announcement.submission_method || '未指定'}`;
    const audienceLine = `\n\n🎯 適用對象：\n${htmlToPlainText(announcement.target_audience) || '所有學生'}`;
    const platformUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?announcement_id=${announcement.id}`;
    const linkLine = `\n\n🔗 查看詳情：\n${platformUrl}`;

    const plainTextMessage = [
        titleLine,
        periodLine,
        submissionLine,
        audienceLine,
        linkLine
    ].join('');

    return (
        <div className="flex justify-center items-center h-full w-full p-4 font-sans">
            <div className="bg-surface/70 backdrop-blur-lg rounded-xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/30">
                <div className="p-4">
                    <p className="whitespace-pre-wrap text-sm text-ink break-words">
                        {plainTextMessage}
                    </p>
                </div>
            </div>

        </div>
    );
};

export default LinePreview;