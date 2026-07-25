import { Noto_Sans_TC } from 'next/font/google'
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ClientProviders from "@/components/ClientProviders";
import ScrollToTop from "@/components/ScrollToTop";
import AndroidInstallPrompt from "@/components/AndroidInstallPrompt";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Head from 'next/head';
import { siteConfig } from "@/lib/siteConfig";
import TranslateWidget from "@/components/ui/TranslateWidget";

const notoSans = Noto_Sans_TC({
	subsets: ['latin'],
	weight: ['400', '700'],
	variable: '--font-noto-sans',
	display: 'swap',
    preload: true,
})

export const metadata = {
	metadataBase: new URL(siteConfig.url),
	manifest: '/manifest.webmanifest',
	title: {
		template: `%s | ${siteConfig.name}`,
		default: siteConfig.name,
	},
	description: '彰化師範大學生輔組校外獎助學金資訊平台：AI 智慧公告解析、獎學金搜尋與 AI 獎學金助理，即時掌握各縣市政府、公家機關與民間獎助學金申請資訊。',
	keywords: ['彰師大', '彰化師範大學', 'NCUE', '獎學金', '助學金', '校外獎學金', '獎助學金', '生輔組', 'AI 獎學金助理'],
	robots: {
		index: true,
		follow: true,
		googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
	},
	icons: {
		icon: [
			{ url: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
			{ url: '/logo.png', sizes: '192x192', type: 'image/png' }
		],
		shortcut: '/favicon.ico',
		apple: { url: '/maskable_icon.png', sizes: '180x180', type: 'image/png' }
	},
	openGraph: {
		type: 'website',
		locale: 'zh_TW',
		url: '/',
		siteName: siteConfig.name,
		title: siteConfig.name,
		description: '提供彰師學生校外獎助學金資訊的 AI 公告平台，AI 智慧解析與獎學金助理即時解答。',
		images: [
			{
				url: '/og-image.png',
				width: 1200,
				height: 630,
				alt: `${siteConfig.name} — AI 智慧公告解析`,
			},
		],
	},
	twitter: {
		card: 'summary_large_image',
		title: siteConfig.name,
		description: '提供彰師學生校外獎助學金資訊的 AI 公告平台，AI 智慧解析與獎學金助理即時解答。',
		images: ['/og-image.png'],
	},
	alternates: {
		types: { 'application/rss+xml': '/rss.xml' },
	},
}

export default function RootLayout({ children }) {
	return (
		<html lang="zh-TW" className={notoSans.variable} suppressHydrationWarning>
			<body className={notoSans.className}>
				{/* 主題預載：hydration 前套用使用者選擇的深色主題，避免閃爍（預設一律淺色） */}
				<script
					dangerouslySetInnerHTML={{
						__html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}`,
					}}
				/>
				{/* 瀏覽器整頁翻譯相容：Google 翻譯會改寫文字節點（包進 <font>），
				    React 重渲染時 removeChild/insertBefore 找不到原節點會直接 crash。
				    以容錯覆寫保護，讓使用者可安心使用瀏覽器內建翻譯。 */}
				<script
					dangerouslySetInnerHTML={{
						__html: `if(typeof Node==='function'&&Node.prototype){var _rc=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this){return c;}return _rc.apply(this,arguments);};var _ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,r){if(r&&r.parentNode!==this){return this.appendChild(n);}return _ib.apply(this,arguments);};}`,
					}}
				/>
				<ClientProviders>
                    <a href="#main-content" className="skip-link">跳至主要內容區</a>
					<div className="layout-container">
						<Header />
                        <div className="pt-[var(--header-height)]">
                            <Breadcrumbs />
                        </div>
						<main id="main-content" className="main-content !pt-0" tabIndex="-1">
							{children}
						</main>
						<Footer />
					</div>
					<ScrollToTop />
					<TranslateWidget />
					<AndroidInstallPrompt />
				</ClientProviders>
				<script
					dangerouslySetInnerHTML={{
						__html: `
							if ('serviceWorker' in navigator) {
								window.addEventListener('load', function() {
									navigator.serviceWorker.register('/sw.js').then(function(registration) {
										console.log('ServiceWorker registration successful');
									}, function(err) {
										console.log('ServiceWorker registration failed: ', err);
									});
								});
							}
						`,
					}}
				/>
			</body>
		</html>
	);
}
