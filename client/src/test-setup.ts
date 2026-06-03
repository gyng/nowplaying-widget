import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount React trees + reset jsdom between tests (RTL doesn't auto-cleanup with globals).
afterEach(() => cleanup());
