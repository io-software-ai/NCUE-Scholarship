'use client'

import { forwardRef } from 'react'
import Link from 'next/link'

const LinkButton = forwardRef(({
  children,
  href,
  className = '',
  variant = 'primary',
  size = 'default',
  disabled = false,
  leftIcon,
  rightIcon,
  ...props
}, ref) => {
  const baseClasses = `
    inline-flex items-center justify-center gap-2 
    font-medium rounded-lg transition-all duration-300 
    focus:outline-none focus:ring-2 focus:ring-offset-2 
    disabled:opacity-50 disabled:cursor-not-allowed
    transform hover:scale-[1.02] active:scale-[0.98]
    shadow-sm hover:shadow-md
    text-decoration-none
  `

  const variantClasses = {
    primary: `
      bg-primary text-white border border-blue-600
      hover:bg-primary-hover hover:border-blue-700
      focus:ring-primary/30
      shadow-blue-500/30
    `,
    secondary: `
      bg-surface text-primary border border-primary
      hover:bg-primary/5 hover:border-primary-600
      focus:ring-primary/20
    `,
    success: `
      bg-success text-white border border-success
      hover:brightness-110 hover:border-green-600
      focus:ring-success/20
      shadow-success/20
    `,
    danger: `
      bg-error text-white border border-error
      hover:brightness-110 hover:border-red-600
      focus:ring-error/20
      shadow-error/20
    `,
    warning: `
      bg-accent text-ink border border-accent
      hover:bg-warn/100 hover:border-yellow-500
      focus:ring-accent/20
      shadow-accent/20
    `,
    ghost: `
      bg-transparent text-ink border border-transparent
      hover:bg-surface-hover hover:text-ink
      focus:ring-gray-500/20
    `,
    link: `
      bg-transparent text-primary border border-transparent p-0
      hover:text-primary-600 hover:underline
      focus:ring-primary/20 shadow-none hover:shadow-none
      hover:scale-100 active:scale-100
    `
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm min-h-[32px]',
    default: 'px-4 py-2 text-sm min-h-[40px]',
    lg: 'px-6 py-3 text-base min-h-[48px]',
    xl: 'px-8 py-4 text-lg min-h-[56px]'
  }

  const classes = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.primary}
    ${sizeClasses[size] || sizeClasses.default}
    ${disabled ? 'hover:scale-100 active:scale-100 pointer-events-none' : ''}
    ${className}
  `.trim()

  if (disabled) {
    return (
      <span
        ref={ref}
        className={classes}
        {...props}
      >
        {leftIcon && <span className="text-lg">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="text-lg">{rightIcon}</span>}
      </span>
    )
  }

  return (
    <Link
      href={href}
      ref={ref}
      className={classes}
      {...props}
    >
      {leftIcon && <span className="text-lg">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="text-lg">{rightIcon}</span>}
    </Link>
  )
})

LinkButton.displayName = 'LinkButton'

export default LinkButton
