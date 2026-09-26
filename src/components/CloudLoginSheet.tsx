import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import type { DXCAlert, DXCInputField } from 'dexie-cloud-addon';
import { db, cloudEnabled } from '@/db/database';
import { BottomSheet } from './BottomSheet';
import { Button, Input, cx } from './ui';

/**
 * Renders the login dialogs of Dexie Cloud (e-mail → one-time code) in the
 * app's own look and in German. Mounted once at the root: the addon drives
 * it through `db.cloud.userInteraction`, whichever screen started the login.
 */
export function CloudLoginSheet(): ReactNode {
  if (!cloudEnabled) return null;
  return <LoginSheet />;
}

function LoginSheet(): ReactNode {
  const ui = useObservable(db.cloud.userInteraction);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Every new step starts with empty fields.
  useEffect(() => {
    setValues({});
    setBusy(false);
  }, [ui]);

  const text = ui ? copyFor(ui.type, ui.title, ui.submitLabel) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ui) return;
    setBusy(true);
    ui.onSubmit(
      Object.fromEntries(
        Object.keys(ui.fields ?? {}).map((k) => [k, (values[k] ?? '').trim()]),
      ),
    );
  };

  return (
    <BottomSheet
      open={Boolean(ui)}
      onClose={() => ui?.onCancel()}
      title={text?.title}
    >
      {ui && text && (
        <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
          {text.intro && <p className="text-[15px] text-muted">{text.intro}</p>}

          {ui.alerts.map((alert, i) => (
            <p
              key={i}
              role={alert.type === 'error' ? 'alert' : undefined}
              className={cx(
                'text-[14px]',
                alert.type === 'error' ? 'text-danger' : 'text-muted',
              )}
            >
              {alertText(alert)}
            </p>
          ))}

          {(Object.entries(ui.fields ?? {}) as [string, DXCInputField][]).map(([name, field], i) => {
            const isEmail = ui.type === 'email' && name === 'email';
            const isOtp = ui.type === 'otp' && name === 'otp';
            return (
              <Input
                key={name}
                autoFocus={i === 0}
                type={isEmail ? 'email' : 'text'}
                inputMode={isOtp ? 'numeric' : isEmail ? 'email' : undefined}
                autoComplete={isEmail ? 'email' : isOtp ? 'one-time-code' : 'off'}
                autoCapitalize="none"
                placeholder={isEmail ? 'name@beispiel.de' : isOtp ? 'Code' : field.placeholder}
                aria-label={isEmail ? 'E-Mail' : isOtp ? 'Code' : field.label ?? name}
                value={values[name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                className={isOtp ? 'text-center text-[22px] tracking-[0.3em]' : undefined}
              />
            );
          })}

          <div className="flex gap-2">
            {ui.cancelLabel && (
              <Button type="button" variant="secondary" block onClick={() => ui.onCancel()}>
                Abbrechen
              </Button>
            )}
            <Button
              type="submit"
              variant={ui.type === 'logout-confirmation' ? 'danger' : 'primary'}
              block
              disabled={busy}
            >
              {text.submit}
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}

function copyFor(
  type: string,
  title: string,
  submitLabel: string,
): { title: string; intro?: string; submit: string } {
  switch (type) {
    case 'email':
      return {
        title: 'Anmelden',
        intro:
          'Mit derselben E-Mail auf iPhone und iPad anmelden – dann sind deine Daten auf beiden Geräten gleich. Du bekommst einen Code, ein Passwort brauchst du nicht.',
        submit: 'Code senden',
      };
    case 'otp':
      return { title: 'Code eingeben', submit: 'Anmelden' };
    case 'logout-confirmation':
      return { title: 'Abmelden?', submit: 'Trotzdem abmelden' };
    case 'message-alert':
      return { title: 'Hinweis', submit: 'OK' };
    default:
      return { title, submit: submitLabel };
  }
}

function alertText(alert: DXCAlert): string {
  const p = alert.messageParams ?? {};
  switch (alert.messageCode) {
    case 'OTP_SENT':
      return p.email
        ? `Wir haben dir einen Code an ${p.email} geschickt. Schau auch im Spam-Ordner nach.`
        : 'Wir haben dir einen Code per E-Mail geschickt.';
    case 'INVALID_OTP':
      return 'Der Code stimmt nicht oder ist abgelaufen. Bitte prüfe ihn noch einmal.';
    case 'INVALID_EMAIL':
      return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    case 'LICENSE_LIMIT_REACHED':
    case 'NO_SEATS_AVAILABLE':
      return 'Die Cloud-Datenbank hat keine freien Plätze mehr für weitere Konten.';
    case 'USER_NOT_REGISTERED':
    case 'USER_NOT_ACCEPTED':
      return 'Diese E-Mail ist für die Synchronisierung nicht freigeschaltet.';
    case 'USER_DEACTIVATED':
      return 'Dieses Konto ist deaktiviert.';
    case 'LOGOUT_CONFIRMATION':
      return 'Einige Änderungen sind noch nicht abgeglichen. Beim Abmelden gehen sie verloren.';
    default:
      return alert.message;
  }
}
