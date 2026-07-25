// src/app/(auth)/layout.jsx
// AuthLayout: 為所有 (auth) 群組下的頁面提供共享的佈局容器。

export default function AuthLayout({ children }) {
	return (
		<div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
			<div className="w-full max-w-5xl">
				{children}
			</div>
		</div>
	);
}