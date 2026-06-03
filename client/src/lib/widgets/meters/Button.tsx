// Demo interactive widget: a counter button. It only receives clicks in passive mode
// when the cursor watcher has turned off click-through over it — so it's the test
// fixture for per-widget click-through. Themeable via --np-accent / -bg / -fg / -font.
import { useState } from 'react';
import './Button.css';

type Props = {
	label?: string;
};

export default function Button({ label = 'tap' }: Props) {
	const [count, setCount] = useState(0);

	return (
		<button className="counter np-button" onClick={() => setCount((c) => c + 1)}>
			<span className="label" data-part="label">
				{label}
			</span>
			<span className="count" data-part="value">
				{count}
			</span>
		</button>
	);
}
