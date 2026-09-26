import { type ReactNode } from 'react';

/**
 * One header grid for every tab: title and action share a row and are
 * vertically centred on each other; the subtitle sits underneath, so the
 * action lands in the same spot whether or not a page has a subtitle.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <header className="px-5 pb-5 pt-3">
      <div className="flex min-h-[48px] items-center justify-between gap-3">
        <h1 className="min-w-0 truncate font-serif text-[34px] font-semibold leading-none tracking-[-0.015em] text-text">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
    </header>
  );
}
