import React, { useEffect } from 'react';

/**
 * Modal — Overlay dialog for confirmations and forms.
 * Features backdrop blur, scale-in animation, and ESC key close.
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidth = '480px',
}) => {
    // Close on ESC key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 animate-fade-in"
                style={{
                    background: 'rgba(5, 7, 16, 0.75)',
                    backdropFilter: 'blur(8px)',
                }}
                onClick={onClose}
            />

            {/* Content */}
            <div
                className="relative glass-strong rounded-lg shadow-xl animate-scale-in w-full"
                style={{ maxWidth }}
            >
                {/* Header */}
                {title && (
                    <div className="flex items-center justify-between px-6 pt-6 pb-2">
                        <h2 id="modal-title" className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {title}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md transition-colors hover:bg-white/10"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-label="Close dialog"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Body */}
                <div className="px-6 py-4">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
