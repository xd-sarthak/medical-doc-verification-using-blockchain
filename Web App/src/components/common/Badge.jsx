import React from 'react';

/**
 * Badge — Small status indicator pill.
 * Variants: success, danger, warning, info, neutral, accent
 */
const Badge = ({ children, variant = 'neutral', className = '', ...props }) => {
    const variants = {
        success: 'bg-green-500/15 text-green-400 border-green-500/30',
        danger: 'bg-red-500/15 text-red-400 border-red-500/30',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        accent: 'bg-accent-500/15 text-accent-500 border-accent-500/30',
        neutral: 'bg-obsidian-600 text-obsidian-200 border-obsidian-400/30',
    };

    return (
        <span
            className={`
        inline-flex items-center gap-1.5
        px-2.5 py-0.5
        text-xs font-medium font-body
        rounded-full border
        ${variants[variant] || variants.neutral}
        ${className}
      `}
            {...props}
        >
            {/* Dot indicator */}
            <span
                className={`w-1.5 h-1.5 rounded-full ${variant === 'success' ? 'bg-green-400' :
                        variant === 'danger' ? 'bg-red-400' :
                            variant === 'warning' ? 'bg-amber-400' :
                                variant === 'info' ? 'bg-blue-400' :
                                    variant === 'accent' ? 'bg-accent-500' :
                                        'bg-obsidian-300'
                    }`}
            />
            {children}
        </span>
    );
};

export default Badge;
