// Self-sourcing CPU meter that toggles between a COMBINED view (a gauge of cpu.total) and a
// PER-CORE view (a grid of cpu.core.* sparklines — like the Rainmeter System skin's LINE meters).
// It reads the telemetry hub from context (provided by Canvas) rather than a single bound sensor,
// since it needs cpu.total AND every core. `binds: 'none'`. Composes Gauge + Sparkline.
import { useContext, useEffect, useState } from 'react';
import { TelemetryHubContext } from '../telemetryContext';
import Gauge from './Gauge';
import Sparkline from './Sparkline';
import './Cpu.css';

type Props = {
	mode?: 'combined' | 'cores';
	cols?: number;
	label?: string;
	color?: string;
	seconds?: number;
	histogram?: boolean;
};

const coreIndex = (id: string): number => Number(id.slice('cpu.core.'.length)) || 0;

export default function Cpu({
	mode = 'cores',
	cols = 8,
	label = 'CPU',
	color,
	seconds = 60,
	histogram = false
}: Props) {
	const hub = useContext(TelemetryHubContext);
	const [total, setTotal] = useState<number | null>(null);
	const [cores, setCores] = useState<number[][]>([]);

	// cpu.total + every core arrive in the same telemetry batch, so re-reading on each cpu.total tick
	// keeps both views fresh without managing a subscription per core.
	useEffect(() => {
		if (!hub) return;
		const readAll = (): void => {
			const t = hub.sensor('cpu.total').getSnapshot().value;
			setTotal(t && t.kind === 'scalar' ? t.value : null);
			const ids = hub
				.sensorIds()
				.filter((id) => id.startsWith('cpu.core.'))
				.sort((a, b) => coreIndex(a) - coreIndex(b));
			setCores(ids.map((id) => hub.sensor(id).getSnapshot().history));
		};
		const unsub = hub.sensor('cpu.total').subscribe(readAll);
		readAll();
		return unsub;
	}, [hub]);

	if (mode === 'combined') {
		return <Gauge value={total} label={label} unit="%" min={0} max={100} color={color} />;
	}

	const gridStyle = { gridTemplateColumns: `repeat(${Math.max(1, Math.round(cols))}, 1fr)` };
	return (
		<div className="cores np-cpu-cores" style={gridStyle}>
			{cores.map((history, i) => (
				<Sparkline
					key={i}
					history={history}
					min={0}
					max={100}
					color={color}
					seconds={seconds}
					histogram={histogram}
					fill={false}
				/>
			))}
		</div>
	);
}
