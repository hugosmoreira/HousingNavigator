import { Turnstile } from '@marsidev/react-turnstile';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

export const isTurnstileConfigured = Boolean(SITE_KEY);

interface TurnstileChallengeProps {
  action: 'public_login' | 'public_signup' | 'password_reset' | 'admin_login';
  onTokenChange(token: string | null): void;
  onProblem(): void;
}

/**
 * Renders only after a public site key is deployed. Supabase CAPTCHA must stay
 * disabled until this key and all protected forms are live.
 */
export default function TurnstileChallenge({
  action,
  onTokenChange,
  onProblem,
}: TurnstileChallengeProps) {
  if (!SITE_KEY) return null;

  const clearToken = () => onTokenChange(null);

  return (
    <div className="min-h-[65px] overflow-hidden" aria-label="Security verification">
      <Turnstile
        siteKey={SITE_KEY}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={clearToken}
        onTimeout={clearToken}
        onError={() => {
          clearToken();
          onProblem();
        }}
        onUnsupported={() => {
          clearToken();
          onProblem();
        }}
        scriptOptions={{
          onError: () => {
            clearToken();
            onProblem();
          },
        }}
        options={{
          action,
          theme: 'auto',
          size: 'flexible',
          responseField: false,
          refreshExpired: 'auto',
          refreshTimeout: 'auto',
          feedbackEnabled: false,
        }}
      />
    </div>
  );
}
