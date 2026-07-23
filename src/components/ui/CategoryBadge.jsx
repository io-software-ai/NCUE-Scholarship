import { getCategoryBadgeClass } from '@/lib/announcementUi';

const SIZES = {
    sm: 'h-7 w-7 rounded-md text-xs',
    md: 'h-8 w-8 rounded-lg text-sm',
    lg: 'h-9 w-9 rounded-lg text-base',
};

/**
 * A–G 分類墨章（單一來源，深淺主題自動適配）
 */
export default function CategoryBadge({ category, size = 'md', dimmed = false, className = '' }) {
    return (
        <span
            className={`inline-flex items-center justify-center flex-shrink-0 font-bold border
                ${SIZES[size] || SIZES.md} ${getCategoryBadgeClass(category)} ${dimmed ? 'opacity-50' : ''} ${className}`}
        >
            {category || '—'}
        </span>
    );
}
