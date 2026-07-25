'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';

/**
 * 趨勢折線圖（單一序列）
 * 設計準則：2px 平滑曲線、僅 hover/端點顯示標記、退隱格線、
 * crosshair + tooltip、顏色走 design token（深淺主題自動適配）。
 */
const COLOR_VARS = {
    purple: 'var(--color-primary)',
    indigo: 'var(--color-primary)',
    primary: 'var(--color-primary)',
    emerald: 'var(--color-ok)',
    rose: 'var(--color-danger)',
};

/** Catmull-Rom → cubic bezier：平滑但不過衝的單調曲線 */
function smoothPath(points) {
    if (points.length < 2) return '';
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
    }
    return d;
}

export default function SimpleLineChart({ data, color = 'primary', height: initialHeight = 300 }) {
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const containerRef = useRef(null);
    const [isMobile, setIsMobile] = useState(false);
    const gradientId = useRef(`chart-grad-${Math.floor(performance.now())}`).current;

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const padding = isMobile ? 40 : 50;
    const width = 800;
    const height = initialHeight;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const stroke = COLOR_VARS[color] || COLOR_VARS.primary;

    const safeData = useMemo(() => {
        if (!Array.isArray(data) || data.length === 0) {
            return Array.from({ length: 7 }).map(() => ({ date: '', count: 0, isPlaceholder: true }));
        }
        return data.map(d => ({
            ...d,
            date: String(d.date || ''),
            count: Math.max(0, Number(d.count) || 0),
            cost: d.cost !== undefined ? Number(d.cost) : undefined
        }));
    }, [data]);

    const maxCount = useMemo(() => {
        const max = Math.max(...safeData.map(d => d.count), 10);
        return Math.ceil(max / 5) * 5;
    }, [safeData]);

    const points = useMemo(() => {
        const len = safeData.length;
        return safeData.map((d, i) => {
            const x = padding + (i / (len - 1 || 1)) * chartWidth;
            const y = height - padding - ((d.count / maxCount) * chartHeight);
            return { x, y: isNaN(y) ? height - padding : y, ...d };
        });
    }, [safeData, chartWidth, chartHeight, padding, height, maxCount]);

    const pathD = useMemo(() => smoothPath(points), [points]);

    const areaD = useMemo(() => {
        if (points.length < 2) return '';
        return `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    }, [pathD, points, height, padding]);

    const lastPoint = points[points.length - 1];

    return (
        <div className="w-full">
            <div
                ref={containerRef}
                className={`w-full select-none hide-scrollbar ${isMobile ? 'overflow-x-auto cursor-grab active:cursor-grabbing pb-2' : ''}`}
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <div
                    className="relative group"
                    style={{ width: isMobile ? '700px' : '100%', minHeight: height }}
                    onMouseLeave={() => setHoveredPoint(null)}
                >
                    <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-auto bg-surface rounded-xl border border-line overflow-visible"
                        role="img" aria-label="瀏覽數趨勢圖"
                    >
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity="0.14" />
                                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* 退隱格線 + Y 軸刻度 */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                            const y = height - padding - ratio * chartHeight;
                            return (
                                <g key={`grid-${i}`}>
                                    {ratio > 0 && (
                                        <line x1={padding} y1={y} x2={width - padding} y2={y}
                                            stroke="var(--color-line)" strokeWidth="1" strokeOpacity="0.6" />
                                    )}
                                    <text
                                        x={padding - 12} y={y + 4} textAnchor="end"
                                        style={{ fill: 'var(--color-ink-soft)', fontVariantNumeric: 'tabular-nums' }}
                                        className={isMobile ? 'text-[13px]' : 'text-[11px]'}
                                    >
                                        {Math.round(ratio * maxCount)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* 基線 */}
                        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding}
                            stroke="var(--color-line)" strokeWidth="1.5" />

                        {pathD && (
                            <>
                                <path d={areaD} fill={`url(#${gradientId})`} />
                                <path d={pathD} fill="none" stroke={stroke}
                                    strokeWidth={isMobile ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
                            </>
                        )}

                        {/* X 軸標籤 */}
                        {points.map((p, i) => {
                            const step = isMobile ? Math.ceil(points.length / 8) : Math.ceil(points.length / 10);
                            if (i % step === 0 || i === points.length - 1) {
                                return (
                                    <g key={`label-${i}`}>
                                        <line x1={p.x} y1={height - padding} x2={p.x} y2={height - padding + 5}
                                            stroke="var(--color-line)" strokeWidth="1" />
                                        <text
                                            x={p.x} y={height - padding + 22} textAnchor="middle"
                                            style={{ fill: 'var(--color-ink-soft)', fontVariantNumeric: 'tabular-nums' }}
                                            className={isMobile ? 'text-[13px]' : 'text-[11px]'}
                                        >
                                            {p.date.length > 5 ? p.date.slice(5) : p.date}
                                        </text>
                                    </g>
                                );
                            }
                            return null;
                        })}

                        {/* crosshair（hover 垂直參考線） */}
                        {hoveredPoint && (
                            <line
                                x1={hoveredPoint.x} y1={padding - 6} x2={hoveredPoint.x} y2={height - padding}
                                stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.7"
                            />
                        )}

                        {/* 端點標記（最新值） */}
                        {lastPoint && !lastPoint.isPlaceholder && (
                            <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5"
                                fill={stroke} stroke="var(--color-surface)" strokeWidth="2" />
                        )}

                        {/* hover 標記 */}
                        {hoveredPoint && (
                            <g pointerEvents="none">
                                <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="9" fill={stroke} fillOpacity="0.12" />
                                <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="4.5"
                                    fill="var(--color-surface)" stroke={stroke} strokeWidth="2.5" />
                            </g>
                        )}

                        {/* 命中區（逐點最近吸附） */}
                        {points.map((p, i) => (
                            <rect
                                key={`hit-${i}`}
                                x={p.x - (chartWidth / points.length / 2)} y={padding - 10}
                                width={chartWidth / points.length} height={chartHeight + 10}
                                fill="transparent"
                                onMouseEnter={() => setHoveredPoint(p)}
                                onClick={() => setHoveredPoint(p === hoveredPoint ? null : p)}
                            />
                        ))}
                    </svg>

                    {/* Tooltip（token 表面，深淺自動） */}
                    {hoveredPoint && (
                        <div
                            className="absolute bg-surface text-ink rounded-xl px-3.5 py-2.5 pointer-events-none transform -translate-x-1/2 -translate-y-full shadow-xl z-50 whitespace-nowrap border border-line"
                            style={{
                                left: `${(hoveredPoint.x / width) * 100}%`,
                                top: `${(hoveredPoint.y / height) * 100}%`,
                                marginTop: '-14px',
                                fontSize: isMobile ? '13px' : '12px'
                            }}
                        >
                            <div className="font-semibold text-ink-soft text-[11px] mb-1.5 tabular-nums">{hoveredPoint.date}</div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-5">
                                    <span className="flex items-center gap-1.5 text-ink-soft">
                                        <span className="w-2 h-2 rounded-full" style={{ background: stroke }} aria-hidden="true" />
                                        {hoveredPoint.cost !== undefined ? 'API 請求' : '瀏覽次數'}
                                    </span>
                                    <span className="font-semibold text-ink tabular-nums">{hoveredPoint.count.toLocaleString()}</span>
                                </div>
                                {hoveredPoint.cost !== undefined && (
                                    <div className="flex items-center justify-between gap-5">
                                        <span className="flex items-center gap-1.5 text-ink-soft">
                                            <span className="w-2 h-2 rounded-full bg-ok" aria-hidden="true" />估算支出
                                        </span>
                                        <span className="font-semibold text-ink tabular-nums">${hoveredPoint.cost.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {isMobile && (
                <div className="flex items-center justify-center gap-2 mt-2 text-ink-soft/60 text-[11px] font-medium">
                    <span>← 左右滑動查看趨勢 →</span>
                </div>
            )}

            <style jsx>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
