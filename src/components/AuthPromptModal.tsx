import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogIn, UserPlus, X } from 'lucide-react';

interface AuthPromptModalProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

/**
 * Modal shown when a logged-out visitor tries to use a feature that
 * requires an account (Save resource, Notify me on a waitlist).
 *
 * Sign in / Create account links carry the current path in router state
 * so the user lands back where they were after authenticating.
 */
export default function AuthPromptModal({ open, message, onClose }: AuthPromptModalProps) {
  const location = useLocation();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const from = location.pathname + location.search;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-prompt-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-[2px]"
      />
      <div className="relative bg-surface-container-lowest border border-surface-container-highest rounded-2xl shadow-xl max-w-md w-full p-6 lg:p-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
        >
          <X className="w-5 h-5" />
        </button>

        <h2
          id="auth-prompt-title"
          className="text-xl font-headline font-bold text-on-surface tracking-tight mb-2"
        >
          Sign in to continue
        </h2>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
          {message}
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/login"
            state={{ from }}
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim transition-colors flex-1"
          >
            <LogIn className="w-4 h-4" /> Sign in
          </Link>
          <Link
            to="/signup"
            state={{ from }}
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-surface-container-highest text-on-surface font-semibold text-sm px-5 py-2.5 hover:bg-surface-container-low transition-colors flex-1"
          >
            <UserPlus className="w-4 h-4" /> Create account
          </Link>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-xs text-on-surface-variant hover:text-on-surface"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
