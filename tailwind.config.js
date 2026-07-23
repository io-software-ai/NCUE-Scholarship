/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#005A9C',
                    50: '#E6F3FF',
                    100: '#CCE7FF',
                    200: '#99CFFF',
                    300: '#66B7FF',
                    400: '#339FFF',
                    500: '#0087FF',
                    600: '#005A9C',
                    700: '#004875',
                    800: '#00364E',
                    900: '#002427',
                },
                secondary: {
                    DEFAULT: '#00A6D6',
                    50: '#E6F9FF',
                    100: '#CCF3FF',
                    200: '#99E7FF',
                    300: '#66DBFF',
                    400: '#33CFFF',
                    500: '#00C3FF',
                    600: '#00A6D6',
                    700: '#0084AC',
                    800: '#006282',
                    900: '#004058',
                },
                accent: {
                    DEFAULT: '#F7B538',
                    50: '#FEF9E7',
                    100: '#FDF3CF',
                    200: '#FBE79F',
                    300: '#F9DB6F',
                    400: '#F7CF3F',
                    500: '#F5C30F',
                    600: '#F7B538',
                    700: '#E09400',
                    800: '#B07500',
                    900: '#805600',
                },
                surface: '#FFFFFF',
                background: '#F8F9FA',
                text: {
                    DEFAULT: '#343A40',
                    muted: '#6C757D',
                },
                border: '#DEE2E6',
                success: '#28a745',
                error: '#dc3545',
            },
            height: {
                header: '70px',
            },
            borderRadius: {
                DEFAULT: '8px',
            },
            boxShadow: {
                custom: '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
            transitionDuration: {
                DEFAULT: '300ms',
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
