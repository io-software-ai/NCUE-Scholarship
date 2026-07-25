import { Download } from 'lucide-react';
import { getFileKind, formatFileSize, getPublicAttachmentUrl } from '@/lib/announcementUi';

/**
 * 附件檔案列：類型徽章 + 檔名 + 大小 + 下載示意
 * 供公告詳情 Modal 與其他附件清單共用。
 */
export default function AttachmentRow({ attachment }) {
    const kind = getFileKind(attachment);
    const size = formatFileSize(attachment.file_size);

    return (
        <a
            href={getPublicAttachmentUrl(attachment.stored_file_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 border border-line rounded-xl p-2.5 pr-3.5 bg-surface
                hover:bg-surface-hover hover:border-line-strong hover:-translate-y-px
                transition-[background-color,border-color,transform] duration-150
                focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
        >
            <span className={`flex items-center justify-center w-9 h-9 rounded-lg text-[10px] font-bold tracking-wide flex-shrink-0 ${kind.cls}`}>
                {kind.label}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-ink truncate">{attachment.file_name}</span>
                {size && <span className="block text-[11.5px] text-ink-soft mt-0.5">{kind.label} · {size}</span>}
            </span>
            <Download size={15} className="text-ink-soft group-hover:text-primary group-hover:translate-y-px transition-[color,transform] duration-150 flex-shrink-0" aria-hidden="true" />
        </a>
    );
}
