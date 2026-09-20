export type UnsubscribeAction = 'confirm' | 'consume';

export function unsubscribeActionForMethod(method: string): UnsubscribeAction {
  if (method === 'GET') return 'confirm';
  if (method === 'POST') return 'consume';
  throw new Error('method not allowed');
}

export function singleUseUnsubscribePatch(nextToken: string): {
  email_notifications_enabled: false;
  unsubscribe_token: string;
} {
  return {
    email_notifications_enabled: false,
    unsubscribe_token: nextToken,
  };
}
