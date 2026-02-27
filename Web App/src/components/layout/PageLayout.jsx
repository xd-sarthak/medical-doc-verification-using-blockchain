import React from 'react';
import Header from './Header';

/**
 * PageLayout — Consistent page wrapper providing header, max-width container,
 * padding, and fade-in page transition.
 */
const PageLayout = ({
    children,
    title,
    role,
    walletAddress,
    showBack = false,
    backPath = '/',
    backLabel = 'Back',
    headerActions,
    className = '',
}) => {
    return (
        <div className="min-h-screen" style={{ background: 'var(--surface-base)' }}>
            {/* Ambient background glow */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    background: `
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0, 212, 170, 0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 20%, rgba(59, 130, 246, 0.04) 0%, transparent 60%)
          `,
                }}
                aria-hidden="true"
            />

            <Header
                title={title}
                role={role}
                walletAddress={walletAddress}
                showBack={showBack}
                backPath={backPath}
                backLabel={backLabel}
                actions={headerActions}
            />

            <main className={`relative max-w-6xl mx-auto px-6 py-8 animate-fade-in-up ${className}`}>
                {children}
            </main>
        </div>
    );
};

export default PageLayout;
