import React from 'react';

/**
 * Card — Glassmorphic container with optional header and accent border.
 * Used as the primary surface throughout the app.
 */
const Card = ({
    children,
    title,
    subtitle,
    headerRight,
    accent = false,
    hover = false,
    className = '',
    padding = 'p-6',
    onClick,
    ...props
}) => {
    return (
        <div
            onClick={onClick}
            className={`
        glass rounded-lg
        ${padding}
        ${accent ? 'border-l-2 border-l-accent-500' : ''}
        ${hover ? 'hover-lift hover-glow cursor-pointer' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        animate-fade-in-up
        ${className}
      `}
            {...props}
        >
            {(title || headerRight) && (
                <div className="flex items-center justify-between mb-4">
                    <div>
                        {title && (
                            <h3 className="font-display text-lg font-semibold text-text-primary">
                                {title}
                            </h3>
                        )}
                        {subtitle && (
                            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {headerRight && <div>{headerRight}</div>}
                </div>
            )}
            {children}
        </div>
    );
};

export default Card;
