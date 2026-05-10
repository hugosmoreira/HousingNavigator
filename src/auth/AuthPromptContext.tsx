/**
 * App-wide "you must sign in to do that" prompt.
 *
 * Components anywhere in the tree can call `promptToSignIn(message)` to
 * show the modal — no local modal state, no prop drilling. Used by the
 * Save button on directory cards and the Notify toggle on waitlist
 * cards when the visitor is not signed in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AuthPromptModal from '../components/AuthPromptModal';

interface AuthPromptValue {
  promptToSignIn(message: string): void;
}

const AuthPromptContext = createContext<AuthPromptValue | null>(null);

export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const promptToSignIn = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    setOpen(true);
  }, []);

  const value = useMemo<AuthPromptValue>(
    () => ({ promptToSignIn }),
    [promptToSignIn],
  );

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      <AuthPromptModal open={open} message={message} onClose={() => setOpen(false)} />
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt(): AuthPromptValue {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) {
    throw new Error('useAuthPrompt must be used inside <AuthPromptProvider>');
  }
  return ctx;
}
