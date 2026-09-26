import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Package,
  ShoppingCart,
  CookingPot,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cx } from './ui';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { to: '/heute', label: 'Heute', icon: Home },
  { to: '/vorrat', label: 'Vorrat', icon: Package },
  { to: '/einkauf', label: 'Einkauf', icon: ShoppingCart },
  { to: '/rezepte', label: 'Rezepte', icon: CookingPot },
  { to: '/profil', label: 'Profil', icon: User },
];

/** Bottom tab bar – primary navigation, thumb-reachable, 44px+ targets. */
export function TabBar(): ReactNode {
  return (
    <nav className="border-t border-border bg-surface pb-safe">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cx(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 pt-2 transition-colors',
                isActive ? 'text-accent' : 'text-faint',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                <span className="text-[11px] font-medium">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * iPad navigation. A bottom tab bar on a 13" screen reads like a blown-up
 * phone app, so from md up the tabs move to the side: an icon rail in
 * portrait, a labelled sidebar in landscape.
 */
export function SideNav(): ReactNode {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="hidden shrink-0 flex-col border-r border-border bg-surface pt-safe md:flex md:w-[88px] lg:w-60"
    >
      <div className="hidden px-6 pb-4 pt-7 lg:block">
        <p className="text-[17px] font-semibold tracking-tight text-text">
          Vorrat &amp; Ernährung
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3 pt-6 lg:pt-0">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cx(
                'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl transition-colors lg:min-h-[44px] lg:flex-row lg:justify-start lg:gap-3 lg:px-3',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted active:bg-surface-2',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                <span className="text-[11px] font-medium lg:text-[15px]">
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
