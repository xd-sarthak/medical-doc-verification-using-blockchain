import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Toast notification system — replaces all alert() calls.
 * Provides ToastProvider context and useToast hook.
 * Variants: success, error, info, warning with auto-dismiss.
 */

const ToastContext = createContext(null);

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within a ToastProvider');
    return ctx;
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, variant = 'info', duration = 4000) => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, message, variant, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback({
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
    }, [addToast]);

    // Build the toast object with methods
    const toastMethods = {
        success: (msg, dur) => addToast(msg, 'success', dur),
        error: (msg, dur) => addToast(msg, 'error', dur),
        info: (msg, dur) => addToast(msg, 'info', dur),
        warning: (msg, dur) => addToast(msg, 'warning', dur),
        remove: removeToast,
    };

    return (
        <ToastContext.Provider value={toastMethods}>
            {children}
            <ToastContainer toasts={toasts} onClose={removeToast} />
        </ToastContext.Provider>
    );
};

/* ── Icons ── */
const icons = {
    success: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    error: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    info: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    ),
    warning: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
};

const variantStyles = {
    success: {
        bg: 'var(--color-success-bg)',
        border: 'var(--color-success)',
        text: 'var(--color-success)',
    },
    error: {
        bg: 'var(--color-error-bg)',
        border: 'var(--color-error)',
        text: 'var(--color-error)',
    },
    info: {
        bg: 'var(--color-info-bg)',
        border: 'var(--color-info)',
        text: 'var(--color-info)',
    },
    warning: {
        bg: 'var(--color-warning-bg)',
        border: 'var(--color-warning)',
        text: 'var(--color-warning)',
    },
};

const ToastItem = ({ toast, onClose }) => {
    const style = variantStyles[toast.variant] || variantStyles.info;

    return (
        <div
            style={{
                background: style.bg,
                borderLeft: `3px solid ${style.border}`,
                backdropFilter: 'blur(16px)',
            }}
            className="flex items-start gap-3 px-4 py-3 rounded-md shadow-lg min-w-[320px] max-w-[420px]"
            role="alert"
        >
            <span style={{ color: style.text }} className="mt-0.5 shrink-0">
                {icons[toast.variant]}
            </span>
            <p className="text-sm font-body flex-1" style={{ color: 'var(--text-primary)' }}>
                {toast.message}
            </p>
            <button
                onClick={() => onClose(toast.id)}
                className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Close notification"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
};

const ToastContainer = ({ toasts, onClose }) => {
    if (toasts.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
            }}
        >
            {toasts.map((t) => (
                <div key={t.id} className="animate-slide-in-right">
                    <ToastItem toast={t} onClose={onClose} />
                </div>
            ))}
        </div>
    );
};

export default ToastProvider;
