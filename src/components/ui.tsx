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
    'bg-accent text-white dark:text-bg active:opacity-90',
  secondary: 'bg-surface-2 text-text active:bg-border',
  ghost: 'bg-transparent text-muted active:bg-surface-2',
  danger: 'bg-transparent text-danger active:bg-danger/10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', block, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold tracking-[-0.01em] transition-[opacity,background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
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
        // No outline: the paper ground separates cards, a whisper of shadow lifts them.
        'rounded-[18px] bg-surface p-4 shadow-card',
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
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

// Filled fields (iOS style) instead of outlined boxes; focus brings a ring.
const inputBase =
  'w-full min-h-[44px] rounded-[12px] border border-transparent bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent/50 focus:bg-surface focus:ring-4 focus:ring-accent/10';

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
    <div className="flex gap-0.5 rounded-[12px] bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-[36px] flex-1 rounded-[10px] px-2 text-[14px] transition-colors',
            value === o.value
              ? 'bg-surface font-semibold text-text shadow-pop'
              // Unselected stays full-contrast text so it never reads as disabled.
              : 'font-medium text-muted active:bg-surface/60',
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
      <p className="font-serif text-[20px] font-medium text-text">{title}</p>
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
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-medium',
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
  prominent = false,
}: {
  label: string;
  onClick: () => void;
  /** Filled only for the one main action of the app (Heute); elsewhere tonal. */
  prominent?: boolean;
}): ReactNode {
  return (
    <Button
      onClick={onClick}
      className={cx(
        '!min-h-0 h-9 gap-1.5 !px-3 text-[15px]',
        !prominent && '!bg-accent-soft !text-accent',
      )}
    >
      <Plus size={18} strokeWidth={2.4} className="shrink-0" />
      {label}
    </Button>
  );
}

/**
 * Editorial section: serif title on the paper ground, optional trailing
 * action, content below. Replaces the "everything in a white card" pattern.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <section className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-text/80 dark:border-text/35 pb-2">
        <h2 className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-text">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Text tabs with an underline – filters without pills. */
export function TextTabs<T extends string>({
  options,
  value,
  onChange,
  trailing,
}: {
  options: { value: T; label: string; count?: number; tone?: 'warn' | 'danger' }[];
  value: T;
  onChange: (v: T) => void;
  trailing?: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center gap-4 border-b border-border">
      <div className="no-scrollbar -mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cx(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 text-[15px] transition-colors',
                active
                  ? 'border-text font-semibold text-text'
                  : 'border-transparent font-medium text-muted',
              )}
            >
              {o.label}
              {o.count !== undefined && (
                <span
                  className={cx(
                    'tnum text-[13px]',
                    o.tone === 'danger'
                      ? 'text-danger'
                      : o.tone === 'warn'
                        ? 'text-warn'
                        : 'text-faint',
                  )}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
