import React from 'react';

/**
 * Button — Primary action component with multiple variants.
 * Variants: primary (teal), secondary (outlined), danger (red), ghost (transparent)
 * Supports loading state with spinner, disabled state, and full-width option.
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled = false,
    onClick,
    type = 'button',
    className = '',
    ...props
}) => {
    const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-body font-medium
    rounded-md
    transition-all duration-250
    focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.97]
    cursor-pointer
  `;

    const variants = {
        primary: `
      bg-accent-500 text-obsidian-900
      hover:bg-accent-400 hover:shadow-glow
      active:bg-accent-300
    `,
        secondary: `
      bg-transparent border border-obsidian-400 text-obsidian-100
      hover:border-accent-500 hover:text-accent-500 hover:shadow-glow
    `,
        danger: `
      bg-red-500/20 border border-red-500/40 text-red-400
      hover:bg-red-500/30 hover:border-red-500/60
    `,
        ghost: `
      bg-transparent text-obsidian-200
      hover:bg-obsidian-700 hover:text-text-primary
    `,
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-5 py-2.5 text-base',
        lg: 'px-7 py-3.5 text-lg',
    };

    return (
        <button
            type={type}
            disabled={disabled || loading}
            onClick={onClick}
            className={`
        ${baseStyles}
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
            {...props}
        >
            {loading && (
                <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
            )}
            {children}
        </button>
    );
};

export default Button;
