import { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { WAITLIST_STATUS_LABEL } from '../notifyWaitlistAlert';
import type { WaitlistStatus } from '../../types';

interface NotifySubscribersModalProps {
  open: boolean;
  previousStatus: WaitlistStatus;
  newStatus: WaitlistStatus;
  subscriberCount: number;
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog shown after an admin saves a waitlist whose
 * status transitioned into a "more open" state. The save itself has
 * already committed to Supabase — this modal only gates the optional
 * email fan-out.
 *
 * Visual conventions follow the existing AuthPromptModal: surface card,
 * primary CTA, secondary cancel link, escape-to-close.
 */
export default function NotifySubscribersModal({
  open,
  previousStatus,
  newStatus,
  subscriberCount,
  sending,
  onConfirm,
  onCancel,
}: NotifySubscribersModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Return focus to the element that opened the dialog once it closes.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => previouslyFocused?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !sending) {
        onCancel();
        return;
      }
      // Trap Tab inside the dialog: without this, focus walks into the
      // page behind the overlay, which screen-reader and keyboard users
      // experience as the dialog silently disappearing.
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, sending]);

  if (!open) return null;

  const prevLabel = WAITLIST_STATUS_LABEL[previousStatus];
  const nextLabel = WAITLIST_STATUS_LABEL[newStatus];
  const noun = subscriberCount === 1 ? 'subscriber' : 'subscribers';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-on-surface/40 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-highest max-w-md w-full p-6 relative"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </span>
          <div>
            <h2
              id="notify-modal-title"
              className="text-lg font-headline font-bold text-on-surface tracking-tight"
            >
              Notify subscribers?
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Status changed from <strong>{prevLabel}</strong> to{' '}
              <strong>{nextLabel}</strong>.
            </p>
          </div>
        </div>

        <p className="text-sm text-on-surface mb-5">
          {subscriberCount > 0 ? (
            <>
              Send an email alert to <strong>{subscriberCount}</strong> {noun}{' '}
              following this waitlist with email notifications enabled?
            </>
          ) : (
            <>No one with email notifications enabled is currently following this waitlist.</>
          )}
        </p>

        <p className="text-xs text-on-surface-variant bg-surface-container-low border border-surface-container-highest rounded-lg px-3 py-2 mb-5">
          Your status change is already saved. Emails are optional — skip to keep
          the dashboard update only.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="text-sm font-semibold text-on-surface-variant hover:text-on-surface px-4 py-2 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={sending || subscriberCount === 0}
            className="rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending
              ? 'Sending…'
              : subscriberCount > 0
                ? `Notify ${subscriberCount} ${noun}`
                : 'Nothing to send'}
          </button>
        </div>
      </div>
    </div>
  );
}
