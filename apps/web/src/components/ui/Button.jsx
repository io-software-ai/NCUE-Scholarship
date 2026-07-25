'use client'

import { forwardRef } from 'react'

/**
 * 共用按鈕 — 「乾淨淺色」設計系統
 * 單一強調色（primary 品牌藍）只給主要動作；語意色僅表真實語意。
 * variants: primary / secondary / ghost / success / danger / warning / purple(=primary 別名) / purple-outline(=secondary 別名) / link
 */
const Button = forwardRef(({
  children,
  className = '',
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  ...props
}, ref) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-lg transition-colors duration-150
    focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-[0.98]
  `

  const variantClasses = {
    primary: `
      bg-primary text-white dark:text-[#10151B] border border-primary
      hover:bg-primary-hover hover:border-primary-hover
      font-semibold
    `,
    secondary: `
      bg-surface text-primary border border-primary/40
      hover:bg-primary-tint hover:border-primary
      font-semibold
    `,
    success: `
      bg-ok text-white dark:text-[#10151B] border border-ok
      hover:brightness-110
      focus-visible:ring-ok/40
      font-semibold
    `,
    danger: `
      bg-danger text-white dark:text-[#10151B] border border-danger
      hover:brightness-110
      focus-visible:ring-danger/40
      font-semibold
    `,
    warning: `
      bg-warn text-white dark:text-[#10151B] border border-warn
      hover:brightness-110
      focus-visible:ring-warn/40
      font-semibold
    `,
    ghost: `
      bg-transparent text-ink-soft border border-transparent
      hover:bg-surface-hover hover:text-ink
    `,
    // 舊 purple 系列統一收斂到品牌藍（單一強調色原則），保留名稱以免呼叫端壞掉
    purple: `
      bg-primary text-white dark:text-[#10151B] border border-primary
      hover:bg-primary-hover hover:border-primary-hover
      font-semibold
    `,
    'purple-outline': `
      bg-surface text-primary border border-primary/40
      hover:bg-primary-tint hover:border-primary
      font-semibold
    `,
    link: `
      bg-transparent text-primary border border-transparent p-0
      hover:text-primary-hover hover:underline underline-offset-2
      active:scale-100
    `
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm min-h-8',
    default: 'px-4 py-2 text-sm min-h-10',
    lg: 'px-6 py-3 text-base min-h-12',
    xl: 'px-8 py-4 text-lg min-h-14'
  }

  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.primary}
    ${sizeClasses[size] || sizeClasses.default}
    ${disabled ? 'active:scale-100' : ''}
    ${className}
  `.trim()

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {leftIcon && !loading && <span className="text-lg">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="text-lg">{rightIcon}</span>}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
