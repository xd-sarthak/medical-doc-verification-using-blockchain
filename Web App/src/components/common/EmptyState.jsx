import React from 'react';

/**
 * EmptyState — Centered placeholder for sections with no data.
 * Shows an SVG icon, title, and description.
 */
const EmptyState = ({ title, description, icon, action, className = '' }) => {
    const defaultIcon = (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--obsidian-400)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );

    return (
        <div className={`flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in ${className}`}>
            <div className="mb-4 opacity-60">
                {icon || defaultIcon}
            </div>
            <h3 className="font-display text-lg font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {title || 'No data yet'}
            </h3>
            {description && (
                <p className="text-sm max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {description}
                </p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
};

export default EmptyState;
