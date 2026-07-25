import React, { useState, useEffect, useMemo } from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image, Link } from '@react-pdf/renderer';
import Html from 'react-pdf-html';
import { CATEGORY_NAMES } from '@/lib/announcementUi';
import { siteConfig, siteHost } from '@/lib/siteConfig';
import QRCode from 'qrcode';

// Globally disable hyphenation to prevent any dash (-) at the end of lines
// Must be registered BEFORE Font.register to take effect
Font.registerHyphenationCallback(word => [word]);

Font.register({
    family: 'NotoSansTC',
    fonts: [
        { src: '/fonts/NotoSansTC-Regular.ttf' },
        { src: '/fonts/NotoSansTC-Bold.ttf', fontWeight: 'bold' },
    ],
});

const colors = {
    primary: '#005A9C',
    text: '#1F2937',
    muted: '#6B7280',
    accent: '#F59E0B',
    background: 'transparent',
    white: '#FFFFFF',
    footer: '#1C2B3A',
    success: '#16A34A',
    danger: '#DC2626',
};

const styles = StyleSheet.create({
    page: {
        fontFamily: 'NotoSansTC',
        fontSize: 10,
        paddingTop: 52,
        paddingBottom: 60,
        paddingHorizontal: 40,
        lineHeight: 1.6,
        backgroundColor: colors.white,
        color: colors.text,
    },
    watermarkContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1,
    },
    watermarkImage: {
        width: 400,
        height: 400,
        opacity: 0.08,
    },
    watermarkText: {
        marginTop: 30,
        fontSize: 45,
        fontWeight: 'bold',
        color: colors.muted,
        opacity: 0.08,
    },
    headerBar: {
        position: 'absolute',
        top: 16,
        left: 40,
        right: 40,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#E3E8EE',
    },
    headerBrand: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.primary,
    },
    headerMeta: {
        fontSize: 8,
        color: colors.muted,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        backgroundColor: colors.footer,
        color: '#B7C3CE',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 40,
        fontSize: 8,
    },
    footerColumn: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    footerLink: {
        color: '#E4E4E7',
        textDecoration: 'none',
    },
    pageNumber: {
        position: 'absolute',
        fontSize: 8,
        bottom: 42,
        left: 40,
        right: 40,
        textAlign: 'center',
        color: colors.muted,
        zIndex: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 20,
        textAlign: 'center',
        lineHeight: 1.2,
    },
    topInfoContainer: {
        display: 'flex',
        flexDirection: 'row',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 6,
    },
    infoColumn: {
        flex: 1,
        padding: 12,
        // Ensure long text doesn't push the column width
        overflow: 'hidden',
    },
    infoColumnDivider: {
        borderRightWidth: 1,
        borderRightColor: '#E5E7EB',
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: 8,
    },
    titleCategory: {
        fontSize: 9,
        color: colors.muted,
        textAlign: 'center',
        marginTop: -12,
        marginBottom: 18,
    },
    infoTextLabel: {
        fontSize: 9,
        color: colors.muted,
        marginBottom: 2,
    },
    infoTextValue: {
        fontSize: 10,
        color: colors.text,
        fontWeight: 'bold',
    },
    qrCodeImage: {
        width: 80,
        height: 80,
        alignSelf: 'center',
    },
    urlText: {
        fontSize: 8,
        color: colors.muted,
        textAlign: 'center',
        marginTop: 5,
        textDecoration: 'none',
    },
    contentSection: {
        marginBottom: 16,
    },
    contentSectionTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.primary,
        paddingBottom: 4,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E3E8EE',
    },
});

const htmlStyles = StyleSheet.create({
    p: { fontFamily: 'NotoSansTC', margin: 0, marginBottom: 4, fontSize: 10, lineHeight: 1.5 },
    ul: { fontFamily: 'NotoSansTC', paddingLeft: 10, margin: 0 },
    ol: { fontFamily: 'NotoSansTC', paddingLeft: 10, margin: 0 },
    li: { fontFamily: 'NotoSansTC', marginBottom: 4, fontSize: 10 },
    strong: { fontFamily: 'NotoSansTC', fontWeight: 'bold' },
    b: { fontFamily: 'NotoSansTC', fontWeight: 'bold' },
    u: { fontFamily: 'NotoSansTC', textDecoration: 'underline' },
    i: { fontFamily: 'NotoSansTC', fontStyle: 'italic' },
    h4: { fontFamily: 'NotoSansTC', fontSize: 11, fontWeight: 'bold', color: colors.primary, margin: 0 },
    span: { fontFamily: 'NotoSansTC' },
    table: {
        fontFamily: 'NotoSansTC',
        width: '100%',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderCollapse: 'collapse',
    },
    thead: { fontFamily: 'NotoSansTC' },
    tbody: { fontFamily: 'NotoSansTC' },
    tr: { fontFamily: 'NotoSansTC' },
    th: {
        fontFamily: 'NotoSansTC',
        padding: 6,
        fontSize: 10,
        fontWeight: 'bold',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    td: {
        fontFamily: 'NotoSansTC',
        padding: 6,
        fontSize: 10,
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
});

// Improved text breaking strategy for PDF:
// Insert Zero Width Space (\u200B) after every character to allow natural wrapping anywhere.
// This prevents forced dashes (hyphenation) and handles long alphanumeric strings (like IDs) preventing overflow.
const breakTextAggressive = (text) => {
    if (typeof text !== 'string') return text;
    return Array.from(text).join('\u200B');
};

const stripEmptyEdgeParagraphs = (htmlString) => {
    if (!htmlString) return '';
    const emptyP = String.raw`<p[^>]*>(?:\s|&nbsp;|<br\s*/?>)*</p>`;
    return htmlString
        .replace(new RegExp(`(?:${emptyP}\\s*)+$`, 'gi'), '')
        .replace(new RegExp(`^(?:\\s*${emptyP})+`, 'gi'), '');
};

const sanitizeHtmlForPdf = (htmlString) => {
    if (!htmlString) return '';
    const blocklist = ['margin', 'padding', 'width', 'height', 'display', 'position', 'left', 'top', 'right', 'bottom'];
    return htmlString.replace(/style="([^"]*)"/g, (match, styleContent) => {
        const cleanedStyles = styleContent
            .split(';')
            .filter(styleRule => {
                if (!styleRule.trim()) return false;
                const property = styleRule.split(':')[0].trim();
                return !blocklist.includes(property);
            })
            .join(';');
        if (!cleanedStyles) return '';
        return `style="${cleanedStyles}"`;
    });
};

const breakWordsInHtml = (htmlString) => {
    if (!htmlString) return '';
    return htmlString.replace(/>([^<]+)</g, (match, textContent) => {
        // Split by HTML entities to avoid breaking them (e.g. &nbsp;)
        // Match entities like &name; or &#123; or &#xABC;
        const parts = textContent.split(/(&[a-zA-Z\d#]+;)/g);
        return '>' + parts.map(part => {
            // If part looks like an entity, keep it as is
            if (part.match(/^&[a-zA-Z\d#]+;$/)) return part;
            // Otherwise, apply aggressive breaking
            return breakTextAggressive(part);
        }).join('') + '<';
    });
};

const convertEmToPt = (htmlString) => {
    if (!htmlString) return '';
    const regex = /(margin-(?:top|bottom)):\s*([\d.]+)(em)/g;

    return htmlString.replace(regex, (match, property, value) => {
        const emValue = parseFloat(value);
        const h4FontSize = 11;
        const ptValue = Math.round(emValue * h4FontSize);
        return `${property}: ${ptValue}`;
    });
};


const AnnouncementPDF = ({ announcement }) => {
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const homepageUrl = siteConfig.url;
    const announcementUrl = `${homepageUrl}/?announcement_id=${announcement.id}`;

    useEffect(() => {
        const generateQRCode = async () => {
            try {
                const dataUrl = await QRCode.toDataURL(announcementUrl, { errorCorrectionLevel: 'H', margin: 1, width: 256 });
                setQrCodeDataUrl(dataUrl);
            } catch (err) { console.error('Failed to generate QR code', err); }
        };
        generateQRCode();
    }, [announcementUrl]);

    const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '未指定';

    const processHtmlContent = (html) => {
        if (!html) return html;
        const sanitized = sanitizeHtmlForPdf(stripEmptyEdgeParagraphs(html));
        const broken = breakWordsInHtml(sanitized);
        const ptConverted = convertEmToPt(broken);
        return ptConverted;
    };

    const finalSummary = processHtmlContent(announcement.summary);
    const finalTargetAudience = processHtmlContent(announcement.target_audience);

    const applicationLimit = useMemo(() => {
        if (announcement.application_limitations === 'Y') {
            return { text: '可兼領', color: colors.success };
        }
        return { text: '不可兼領', color: colors.danger };
    }, [announcement.application_limitations]);

    return (
        <Document title={announcement.title}>
            <Page size="A4" style={styles.page} wrap>
                <View style={styles.headerBar} fixed>
                    <Text style={styles.headerBrand}>{siteConfig.name}</Text>
                    <Text style={styles.headerMeta}>文件產出時間:{new Date().toLocaleString('zh-TW', { hour12: false })}</Text>
                </View>
                <View style={styles.footer} fixed>
                    <Link src={homepageUrl} style={styles.footerLink}>{siteHost}</Link>
                    <Text>版權所有 © {new Date().getFullYear()} {siteConfig.name}</Text>
                </View>
                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
                <View style={styles.watermarkContainer} fixed>
                    <Image
                        style={styles.watermarkImage}
                        src={'/logo.png'}
                    />
                    <Text style={styles.watermarkText}>
                        {siteConfig.name}
                    </Text>
                </View>

                <Text style={styles.title}>{breakTextAggressive(announcement.title || '公告詳情')}</Text>
                {announcement.category && (
                    <Text style={styles.titleCategory}>分類 {announcement.category}・{CATEGORY_NAMES[announcement.category] || '獎助學金公告'}</Text>
                )}

                <View style={styles.topInfoContainer} wrap={false}>
                    <View style={[styles.infoColumn, styles.infoColumnDivider]}>
                        <Text style={styles.sectionTitle}>公告資訊</Text>
                        <Text style={styles.infoTextLabel}>公告 ID</Text>
                        <Text style={styles.infoTextValue}>{breakTextAggressive(announcement.id)}</Text>
                        <Text style={{ ...styles.infoTextLabel, marginTop: 8 }}>最近編輯</Text>
                        <Text style={styles.infoTextValue}>{new Date(announcement.updated_at).toLocaleDateString('zh-TW')}</Text>
                    </View>
                    <View style={[styles.infoColumn, styles.infoColumnDivider]}>
                        <Text style={styles.sectionTitle}>公告日程</Text>
                        <Text style={styles.infoTextLabel}>申請開始</Text>
                        <Text style={{ ...styles.infoTextValue, color: colors.primary }}>{formatDate(announcement.application_start_date)}</Text>
                        <Text style={{ ...styles.infoTextLabel, marginTop: 8 }}>申請截止</Text>
                        <Text style={{ ...styles.infoTextValue, color: colors.primary }}>{formatDate(announcement.application_end_date)}</Text>
                    </View>
                    <View style={[styles.infoColumn, styles.infoColumnDivider]}>
                        <Text style={styles.sectionTitle}>申請辦法</Text>
                        <Text style={styles.infoTextLabel}>申請限制</Text>
                        <Text style={{ ...styles.infoTextValue, color: applicationLimit.color }}>{applicationLimit.text}</Text>
                        <Text style={{ ...styles.infoTextLabel, marginTop: 8 }}>送件方式</Text>
                        <Text style={styles.infoTextValue}>{breakTextAggressive(announcement.submission_method || '未指定')}</Text>
                    </View>
                    <View style={styles.infoColumn}>
                        {qrCodeDataUrl && <Image style={styles.qrCodeImage} src={qrCodeDataUrl} />}
                        <Link src={announcementUrl} style={styles.urlText}>掃描或點擊查看線上公告</Link>
                    </View>
                </View>

                <View>
                    <View style={styles.contentSection}>
                        <Text style={styles.contentSectionTitle} minPresenceAhead={60}>適用對象</Text>
                        <Html stylesheet={htmlStyles}>{finalTargetAudience || '<p>未指定</p>'}</Html>
                    </View>
                    <View style={styles.contentSection}>
                        <Text style={styles.contentSectionTitle} minPresenceAhead={60}>公告摘要</Text>
                        <Html stylesheet={htmlStyles}>{finalSummary || '<p>無詳細內容</p>'}</Html>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default AnnouncementPDF;
