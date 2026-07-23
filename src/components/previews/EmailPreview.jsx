'use client';

import { useMemo } from 'react';
import { siteConfig } from '@/lib/siteConfig';

const parseUrls = (urlsString) => {
    if (!urlsString) return [];
    try {
        const parsed = JSON.parse(urlsString);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => item.url && typeof item.url === 'string');
        }
    } catch (e) {
        if (typeof urlsString === 'string' && urlsString.startsWith('http')) {
            return [{ url: urlsString }];
        }
    }
    return [];
};

export default function EmailPreview({ announcement }) {
    const platformUrlBase = siteConfig.url;
    const platformUrlWithQuery = `${platformUrlBase}/?announcement_id=${announcement.id}`;
    const currentYear = new Date().getFullYear();

    const deadline = announcement.application_deadline || announcement.application_end_date
        ? new Date(announcement.application_deadline || announcement.application_end_date).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
        : '未指定';
    
    const externalUrls = useMemo(() => parseUrls(announcement.external_urls), [announcement.external_urls]);
    
    let richTextContent = announcement.summary || '<p>請至平台查看詳細內容。</p>';

    // Absolute path conversion for preview
    richTextContent = richTextContent.replace(/(href|src)\s*=\s*["']([^"']*)["']/g, (match, attr, path) => {
        const trimmedPath = path.trim();
        if (/^(https?:|mailto:|tel:|#)/i.test(trimmedPath)) return match;
        if (trimmedPath.startsWith('//')) return `${attr}="https:${trimmedPath}"`;
        const absolutePath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
        return `${attr}="${platformUrlBase}${absolutePath}"`;
    });

    const renderExternalUrls = () => {
        if (externalUrls.length === 0) return '';
        const linksHtml = externalUrls.map(item => 
            `<li style="margin-bottom: 8px;"><a href="${item.url}" target="_blank" style="color: #005A9C; text-decoration: underline; word-break: break-all;">${item.url}</a></li>`
        ).join('');
        return `<hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" /><div style="margin-top: 24px;"><h3 style="font-weight: 700; color: #1f2937; margin-top: 24px; margin-bottom: 12px; font-size: 18px;">相關連結</h3><ul style="list-style-type: none; padding-left: 0; margin-top: 12px;">${linksHtml}</ul></div>`;
    };

    // Style constants to match lib/emailTemplate.js（極簡系統信風格）
    const emailStyles = {
        wrapper: { backgroundColor: '#ffffff', width: '100%', padding: '12px 0', fontFamily: "'Noto Sans TC', 'Microsoft JhengHei', sans-serif" },
        container: { maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff', textAlign: 'left' },
        header: { padding: '40px 40px 0', textAlign: 'left' },
        content: { padding: '0 40px', color: '#2A3B4D' },
        h2: { color: '#1C2B3A', margin: '32px 0 24px', fontSize: '27px', fontWeight: '600', lineHeight: '1.35' },
        detailsTable: { width: '100%', marginBottom: '24px', borderSpacing: '0' },
        label: { color: '#6b7280', fontWeight: '500', width: '90px', padding: '8px 10px 8px 0', fontSize: '15px', verticalAlign: 'top' },
        value: { color: '#1f2937', padding: '8px 0', fontSize: '15px', verticalAlign: 'top' },
        deadline: { color: '#B42318', fontWeight: '700' },
        divider: { border: '0', borderTop: '1px solid #e5e7eb', margin: '24px 0' },
        prose: { fontSize: '16px', lineHeight: '1.7', color: '#374151' },
        ctaButton: { display: 'inline-block', color: '#005A9C', padding: '12px 36px', border: '2px solid #005A9C', borderRadius: '999px', textDecoration: 'none', fontSize: '15px', fontWeight: '700', textAlign: 'center' },
        footerWrap: { padding: '36px 0 28px' },
        footer: { padding: '24px 40px', fontSize: '12.5px', textAlign: 'left', color: '#7A8899', backgroundColor: '#F6F8FA', lineHeight: '1.6' }
    };

    return (
        <div className="w-full overflow-auto bg-page rounded-xl shadow-inner border border-line">
            <div style={emailStyles.wrapper} className="email-wrapper-preview">
                <table style={emailStyles.container} cellPadding="0" cellSpacing="0" className="email-container-preview">
                    <tbody>
                        <tr>
                            <td style={emailStyles.header} className="email-header-preview">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/logo-email.png" alt="io Software" style={{ height: '42px', width: 'auto', display: 'block' }} />
                            </td>
                        </tr>
                        <tr>
                            <td style={emailStyles.content} className="email-content-preview">
                                <h2 style={emailStyles.h2}>{announcement.title}</h2>
                                <table style={emailStyles.detailsTable}>
                                    <tbody>
                                        {announcement.category && (
                                            <tr>
                                                <td style={emailStyles.label}>類 別</td>
                                                <td style={emailStyles.value}>{announcement.category}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td style={emailStyles.label}>申請截止</td>
                                            <td style={emailStyles.value}><span style={emailStyles.deadline}>{deadline}</span></td>
                                        </tr>
                                        {announcement.target_audience && (
                                            <tr>
                                                <td style={emailStyles.label}>適用對象</td>
                                                <td style={emailStyles.value}>{announcement.target_audience.replace(/<[^>]*>?/gm, '')}</td>
                                            </tr>
                                        )}
                                        {announcement.submission_method && (
                                            <tr>
                                                <td style={emailStyles.label}>送件方式</td>
                                                <td style={emailStyles.value}>{announcement.submission_method}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <hr style={emailStyles.divider} />
                                <div style={emailStyles.prose} className="email-prose-preview">
                                    <div dangerouslySetInnerHTML={{ __html: richTextContent }} />
                                    <div dangerouslySetInnerHTML={{ __html: renderExternalUrls() }} />
                                </div>
                                <table border="0" cellPadding="0" cellSpacing="0" width="100%" style={{ marginTop: '32px' }}>
                                    <tbody>
                                        <tr>
                                            <td align="center">
                                                <a href={platformUrlWithQuery} target="_blank" rel="noopener noreferrer" style={emailStyles.ctaButton}>
                                                    前往平台查看完整資訊  →
                                                </a>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style={emailStyles.footerWrap}>
                                <div style={emailStyles.footer}>
                                    <p style={{ margin: '0 0 12px', fontSize: '13px', textAlign: 'center' }}>
                                        <a href={`${platformUrlBase}/terms-and-privacy`} target="_blank" rel="noopener noreferrer" style={{ color: '#7A8899', textDecoration: 'underline' }}>隱私權聲明</a>
                                        &nbsp;&nbsp;
                                        <a href={platformUrlBase} target="_blank" rel="noopener noreferrer" style={{ color: '#7A8899', textDecoration: 'underline' }}>平台首頁</a>
                                    </p>
                                    <p style={{ margin: '0 0 8px' }}>此信件由「{siteConfig.name}」系統自動發送，請勿直接回覆。</p>
                                    <p style={{ margin: '0 0 16px' }}>© {currentYear} {siteConfig.name}. All Rights Reserved.</p>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px' }}>Powered by</span>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src="/logo-email.png" alt="io Software" style={{ height: '24px', width: 'auto', display: 'block', opacity: 0.9 }} />
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <style jsx global>{`
                @media screen and (max-width: 600px) {
                    .email-wrapper-preview { padding: 12px 0 !important; }
                    .email-container-preview { width: 100% !important; border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
                    .email-content-preview { padding: 24px 16px !important; }
                    .email-header-preview { padding: 24px !important; }
                    .email-header-preview h1 { font-size: 22px !important; }
                    .email-content-preview h2 { font-size: 20px !important; }
                }
                .email-prose-preview p { margin: 0 0 16px; }
                .email-prose-preview a { color: #005A9C; text-decoration: underline; }
                .email-prose-preview h1, .email-prose-preview h2, .email-prose-preview h3 { font-weight: 700; color: #1f2937; margin-top: 24px; margin-bottom: 12px; }
                .email-prose-preview h1 { font-size: 22px; }
                .email-prose-preview h2 { font-size: 20px; }
                .email-prose-preview h3 { font-size: 18px; }
                .email-prose-preview ul { padding-left: 24px; margin-bottom: 16px; list-style-type: disc; }
                .email-prose-preview ol { padding-left: 24px; margin-bottom: 16px; list-style-type: decimal; }
                .email-prose-preview li { margin-bottom: 8px; }
                .email-prose-preview table { width: 100% !important; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; border: 1px solid #dee2e6; }
                .email-prose-preview th, .email-prose-preview td { border: 1px solid #dee2e6; padding: 10px 12px; text-align: left; }
                .email-prose-preview th { background-color: #f8f9fa; font-weight: 600; color: #495057; }
                .email-prose-preview tr:nth-of-type(even) { background-color: #f8f9fa; }
                .email-prose-preview * { max-width: 100%; }
            `}</style>
        </div>
    );
}
