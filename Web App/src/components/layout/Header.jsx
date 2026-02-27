import React from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge';

/**
 * Header — Top navigation bar with branding, role indicator, and wallet/back actions.
 * Renders a persistent glassmorphic header across all pages.
 */
const Header = ({
    title,
    role,
    walletAddress,
    showBack = false,
    backPath = '/',
    backLabel = 'Back',
    actions,
}) => {
    const navigate = useNavigate();

    const roleBadges = {
        admin: { variant: 'accent', label: 'Admin' },
        doctor: { variant: 'info', label: 'Doctor' },
        patient: { variant: 'success', label: 'Patient' },
    };

    const badge = roleBadges[role];

    const truncateAddress = (addr) => {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return (
        <header
            className="glass-strong sticky top-0 z-40 px-6 py-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
            <div className="max-w-6xl mx-auto flex items-center justify-between">
                {/* Left: Back + Branding */}
                <div className="flex items-center gap-4">
                    {showBack && (
                        <button
                            onClick={() => navigate(backPath)}
                            className="flex items-center gap-1.5 text-sm font-body transition-colors hover:text-accent-500"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            {backLabel}
                        </button>
                    )}

                    <div className="flex items-center gap-3">
                        {/* Shield logo icon */}
                        <div
                            className="w-8 h-8 rounded-md flex items-center justify-center"
                            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-accent)' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>

                        <div>
                            <h1 className="font-display text-base font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                                {title || 'MedVault'}
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Right: Role + Wallet + Actions */}
                <div className="flex items-center gap-3">
                    {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}

                    {walletAddress && (
                        <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
                            style={{
                                background: 'var(--surface-input)',
                                border: '1px solid var(--border-subtle)',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--text-secondary)',
                            }}
                            title={walletAddress}
                        >
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            {truncateAddress(walletAddress)}
                        </div>
                    )}

                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            </div>
        </header>
    );
};

export default Header;
