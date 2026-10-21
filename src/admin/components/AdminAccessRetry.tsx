import { useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext';

/**
 * Shown when the admin membership lookup failed before this user was ever
 * verified. The answer is unknown, so offer a retry instead of claiming
 * "not an admin".
 */
export default function AdminAccessRetry({ title }: { title?: string }) {
  const { refreshAdminFlag } = useAdminAuth();
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-center" role="alert">
      <h2 className="text-xl font-headline font-bold mb-2">
        {title ?? "We couldn't confirm your admin access"}
      </h2>
      <p className="text-on-surface-variant text-sm mb-6">
        This is usually a connection problem, not a permissions change. Check
        your connection and try again.
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void refreshAdminFlag()
            .catch(() => {})
            .finally(() => setRetrying(false));
        }}
        className="inline-flex items-center justify-center rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60"
      >
        {retrying ? 'Checking…' : 'Try again'}
      </button>
    </div>
  );
}
