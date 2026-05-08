import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, required, children }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-on-surface flex items-baseline gap-1">
        {label}
        {required && <span className="text-error">*</span>}
      </span>
      {hint && <span className="block text-xs text-on-surface-variant mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const baseInput =
  'w-full rounded-lg border border-surface-container-highest bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInput} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${baseInput} min-h-[88px] ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseInput} ${props.className ?? ''}`} />;
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}

export function Toggle({ label, hint, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-surface-container-highest text-primary focus:ring-primary/20"
      />
      <span>
        <span className="text-sm font-medium text-on-surface block">{label}</span>
        {hint && (
          <span className="text-xs text-on-surface-variant block mt-0.5">{hint}</span>
        )}
      </span>
    </label>
  );
}
