import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, Plus } from 'lucide-react';

function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Disabled primary turns neutral: white on pale green read as broken.
  primary:
    'bg-accent text-white active:opacity-90 disabled:bg-surface-2 disabled:text-faint disabled:opacity-100',
  secondary: 'bg-surface-2 text-text active:bg-border',
  ghost: 'bg-transparent text-muted active:bg-surface-2',
  danger: 'bg-transparent text-danger active:bg-danger/10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', block, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-[opacity,background-color] duration-150 disabled:opacity-40',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}): ReactNode {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-2xl border border-border bg-surface p-4 shadow-card',
        onClick && 'cursor-pointer active:bg-surface-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full min-h-[44px] rounded-xl border border-border bg-surface px-3.5 text-[15px] text-text placeholder:text-faint outline-none focus:border-accent transition-colors';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cx(inputBase, 'tnum', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cx(inputBase, 'min-h-[88px] py-2.5', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  // Native select keeps the iOS picker; the chevron makes it read as one.
  <div className={cx('relative', className)}>
    <select ref={ref} className={cx(inputBase, 'appearance-none pr-9')} {...props} />
    <ChevronDown
      size={18}
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
    />
  </div>
));
Select.displayName = 'Select';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  /** null = nothing selected yet. */
  value: T | null;
  onChange: (v: T) => void;
}): ReactNode {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors',
            value === o.value
              ? 'bg-surface text-text shadow-card'
              : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-[15px] font-medium text-muted">{title}</p>
      {hint && <p className="max-w-xs text-[13px] text-faint">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn' | 'danger' | 'accent';
}): ReactNode {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-muted',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export { cx };

/**
 * The one shape for "add something" in a page header – same size, icon and
 * weight on every tab, so the primary action is always found in one place.
 */
export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): ReactNode {
  return (
    <Button onClick={onClick} className="h-10 gap-1.5 !px-3.5 text-[15px]">
      <Plus size={18} strokeWidth={2.4} className="shrink-0" />
      {label}
    </Button>
  );
}
