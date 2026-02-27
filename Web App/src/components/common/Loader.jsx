import React from 'react';

/**
 * Loader — Skeleton placeholder and spinning loader for async states.
 */

/* Skeleton rectangular placeholder */
export const Skeleton = ({ width = '100%', height = '1rem', rounded = false, className = '' }) => (
    <div
        className={`skeleton ${rounded ? 'rounded-full' : 'rounded-sm'} ${className}`}
        style={{ width, height }}
        aria-hidden="true"
    />
);

/* Spinning circle loader */
export const Spinner = ({ size = 24, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`animate-spin ${className}`}
        aria-label="Loading"
        role="status"
    >
        <circle
            cx="12" cy="12" r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity="0.15"
        />
        <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="var(--accent-500)"
            strokeWidth="3"
            strokeLinecap="round"
        />
    </svg>
);

/* Full-page loading state */
export const PageLoader = () => (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Spinner size={40} />
        <p className="font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
            Initializing secure connection...
        </p>
    </div>
);

export default Spinner;
