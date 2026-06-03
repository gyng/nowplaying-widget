import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import AnalogClock from './AnalogClock';

describe('AnalogClock (DOM)', () => {
	it('renders a DOM dial with three hands (no SVG)', () => {
		const { container } = render(<AnalogClock />);
		expect(container.querySelector('svg')).toBeNull(); // pure DOM, restylable via CSS
		expect(container.querySelector('.np-clock-face')).not.toBeNull();
		expect(container.querySelector('.np-clock-hour')).not.toBeNull();
		expect(container.querySelector('.np-clock-minute')).not.toBeNull();
		expect(container.querySelector('.np-clock-second')).not.toBeNull();
		// Default look (Enigma icon): no ticks / numerals / centre cap.
		expect(container.querySelectorAll('.np-clock-tick').length).toBe(0);
		expect(container.querySelector('.np-clock-cap')).toBeNull();
	});

	it('renders the centre cap only when showCap is on', () => {
		expect(render(<AnalogClock />).container.querySelector('.np-clock-cap')).toBeNull();
		expect(render(<AnalogClock showCap />).container.querySelector('.np-clock-cap')).not.toBeNull();
	});

	it('drops the second hand when showSeconds is off', () => {
		const { container } = render(<AnalogClock showSeconds={false} />);
		expect(container.querySelector('.np-clock-second')).toBeNull();
	});

	it('renders 60 ticks and 12 numerals when enabled', () => {
		const { container } = render(<AnalogClock showTicks showNumbers />);
		expect(container.querySelectorAll('.np-clock-tick').length).toBe(60);
		expect(container.querySelectorAll('.np-clock-num').length).toBe(12);
	});

	it('maps config colours to restylable CSS variables (not inline element styling)', () => {
		const { container } = render(<AnalogClock accent="rgb(1,2,3)" />);
		const root = container.querySelector('.np-analog-clock') as HTMLElement;
		expect(root.style.getPropertyValue('--clock-accent')).toBe('rgb(1,2,3)');
	});
});
