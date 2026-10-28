import { useState } from 'react';
import { geocodeAddress } from '../geocodeAddress';
import {
  NO_PIN,
  localToday,
  openStreetMapUrl,
  pinAddressKey,
  type PinAddress,
  type PropertyPin,
} from '../propertyMapPin';
import { Field, TextInput } from './FormField';

interface Notice {
  tone: 'info' | 'warning' | 'error';
  text: string;
}

const NOTICE_CLASS: Record<Notice['tone'], string> = {
  info: 'text-sm text-on-surface-variant',
  warning: 'rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900',
  error: 'rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error',
};

/**
 * Where the property sits on /map. "Find on map" asks the Census geocoder
 * through the admin-only `geocode-address` function; typing coordinates
 * places the pin by hand. Nothing is stored until the form is saved.
 */
export default function PropertyMapPin({
  pin,
  address,
  disabled,
  onChange,
}: {
  pin: PropertyPin;
  address: PinAddress;
  disabled: boolean;
  onChange(pin: PropertyPin): void;
}) {
  const addressKey = pinAddressKey(address);
  const pinned = pin.latitude !== null && pin.longitude !== null;
  // The form mounts after the record loads, so a saved pin belongs to the saved address.
  const [pinnedFor, setPinnedFor] = useState<string | null>(() => (pinned ? addressKey : null));
  const [lookingUp, setLookingUp] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const canLookUp = Boolean(address.address?.trim() && address.city.trim());

  async function findOnMap() {
    const lookedUp = addressKey;
    setLookingUp(true);
    setNotice(null);
    try {
      const result = await geocodeAddress({
        address: address.address?.trim() ?? '',
        city: address.city.trim(),
        state: address.state,
        postal_code: address.postal_code?.trim() || null,
      });
      if (!result.match) {
        setNotice({ tone: 'warning', text: result.message ?? 'The Census geocoder found no match.' });
        return;
      }
      const { match } = result;
      onChange({
        latitude: match.latitude,
        longitude: match.longitude,
        location_source: 'census_geocoder',
        location_checked_on: localToday(),
      });
      setPinnedFor(lookedUp);
      setNotice(
        match.differences.length
          ? {
              tone: 'warning',
              text: `The Census geocoder matched “${match.matched_address}”, which differs in: ${match.differences.join(', ')}. Check the address before saving.`,
            }
          : { tone: 'info', text: `The Census geocoder matched “${match.matched_address}”.` },
      );
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Address lookup failed.' });
    } finally {
      setLookingUp(false);
    }
  }

  function setCoordinate(key: 'latitude' | 'longitude', raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    onChange({
      ...pin,
      [key]: value !== null && Number.isFinite(value) ? value : null,
      location_source: 'manual',
      location_checked_on: localToday(),
    });
    setPinnedFor(addressKey);
    setNotice(null);
  }

  function removePin() {
    onChange(NO_PIN);
    setPinnedFor(null);
    setNotice(null);
  }

  const status = pinned
    ? `Pinned at ${pin.latitude}, ${pin.longitude} · ${pin.location_source === 'census_geocoder' ? 'Census geocoder' : 'placed by hand'}${pin.location_checked_on ? `, ${pin.location_checked_on}` : ''}`
    : pin.latitude !== null || pin.longitude !== null
      ? 'Enter both coordinates, or remove the pin.'
      : 'Not on the map yet.';

  return (
    <div className="space-y-4 rounded-xl border border-surface-container-highest p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-on-surface">Map pin</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">{status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {pinned && (
            <a
              href={openStreetMapUrl(pin.latitude!, pin.longitude!)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 font-semibold text-primary hover:underline"
            >
              Check on OpenStreetMap
            </a>
          )}
          {(pin.latitude !== null || pin.longitude !== null) && (
            <button type="button" onClick={removePin} disabled={disabled || lookingUp} className="px-2 py-1.5 font-semibold text-error hover:underline disabled:opacity-60">
              Remove pin
            </button>
          )}
          <button
            type="button"
            onClick={() => void findOnMap()}
            disabled={disabled || lookingUp || !canLookUp}
            title={canLookUp ? undefined : 'Enter a street address and city first.'}
            className="rounded-full border border-surface-container-highest px-4 py-1.5 font-semibold text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lookingUp ? 'Looking up…' : 'Find on map'}
          </button>
        </div>
      </div>
      {notice && <p className={NOTICE_CLASS[notice.tone]} role={notice.tone === 'info' ? 'status' : 'alert'}>{notice.text}</p>}
      {pinned && pinnedFor !== null && pinnedFor !== addressKey && (
        <p className={NOTICE_CLASS.warning} role="status">
          The address changed after this pin was placed. Find it again, or check the pin before saving.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude" hint="Typing a value marks the pin as placed by hand.">
          <TextInput type="number" step="any" inputMode="decimal" value={pin.latitude ?? ''} onChange={(e) => setCoordinate('latitude', e.target.value)} disabled={disabled} />
        </Field>
        <Field label="Longitude" hint="Negative in Oregon and Washington.">
          <TextInput type="number" step="any" inputMode="decimal" value={pin.longitude ?? ''} onChange={(e) => setCoordinate('longitude', e.target.value)} disabled={disabled} />
        </Field>
      </div>
    </div>
  );
}
