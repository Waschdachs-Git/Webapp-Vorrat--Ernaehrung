import { useEffect, useState } from 'react';
import { todayISO } from '@/lib/date';

/**
 * Today's date (YYYY-MM-DD) that actually changes at midnight.
 *
 * An installed app is rarely restarted – it sits in the background for days.
 * Anything that derives "today" once would keep showing yesterday's diary
 * the next morning, and best-before labels would be a day off. This re-checks
 * when the app comes back to the foreground and once a minute while open.
 */
export function useTodayISO(): string {
  const [day, setDay] = useState(todayISO);

  useEffect(() => {
    const check = () => setDay((current) => {
      const now = todayISO();
      return now === current ? current : now;
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    const timer = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.clearInterval(timer);
    };
  }, []);

  return day;
}
