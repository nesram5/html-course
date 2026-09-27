import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface DeviceSelectProps {
  readonly label: string;
  readonly devices: readonly MediaDeviceInfo[];
  /** `null`: system default. */
  readonly value: string | null;
  readonly disabled?: boolean;
  readonly onChange: (deviceId: string | null) => void;
}

/** A labelled `<select>` of cameras, microphones or speakers (pre-join, E5-S4). */
export function DeviceSelect({ label, devices, value, disabled, onChange }: DeviceSelectProps) {
  const { t } = useTranslation('media');
  const id = useId();
  // A remembered device that is not plugged in shows as the default.
  const selected = devices.some((device) => device.deviceId === value) ? (value ?? '') : '';
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={selected}
        disabled={disabled === true}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
      >
        <option value="">{t('prejoin.defaultDevice')}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label === '' ? `${label} ${String(index + 1)}` : device.label}
          </option>
        ))}
      </select>
    </div>
  );
}
