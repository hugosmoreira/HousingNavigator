import type { ReactNode } from 'react';
import { phoneHref } from '../lib/phoneLinks';

interface PhoneLinkProps {
  phone: string | null | undefined;
  className?: string;
  children?: ReactNode;
}

export default function PhoneLink({ phone, className, children }: PhoneLinkProps) {
  if (!phone?.trim()) return null;
  const href = phoneHref(phone);
  const content = children ?? phone;
  return href
    ? <a href={href} className={className}>{content}</a>
    : <span className={className}>{content}</span>;
}
