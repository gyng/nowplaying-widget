// The audio spectrum source, provided once at the App root (unlike telemetryContext, which is
// per-Canvas — the spectrum source is a process-wide singleton). The Spectrum meter reads it via
// context rather than importing the Tauri adapter directly — the same self-sourcing pattern Cpu.tsx
// uses for the telemetry hub, keeping the meter free of Tauri and trivially testable with a fake.
import { createContext } from 'react';
import type { SpectrumSource } from '../audio/source';

export const SpectrumContext = createContext<SpectrumSource | null>(null);
