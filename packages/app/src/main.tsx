import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import { system } from './theme/system';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './components/AuthProvider';
import { App } from './App';
import { OnboardingPage } from './pages/Onboarding/OnboardingPage';
import { useStore } from './store';

import "./theme/theme-dark.scss";
import "./theme/theme-light.scss";
import "./theme/theme-github-dark.scss";
import "./theme/theme-github-light.scss";
import "./theme/theme-one-dark.scss";
import "./theme/theme-one-light.scss";
import "./theme/theme-dracula-dark.scss";
import "./theme/theme-dracula-light.scss";
import "./theme/theme-catppuccin-mocha.scss";
import "./theme/theme-catppuccin-latte.scss";
import "./theme/theme-nord.scss";
import "./theme/theme-nord-light.scss";
import "./theme/theme-tokyo-night.scss";
import "./theme/theme-tokyo-night-light.scss";
import "./theme/theme-amoled.scss";
import "./theme/theme-vesper.scss";
import "./theme/theme-min.scss";
import "./theme/theme-gruvbox-hard.scss";
import "./theme/theme-rose-pine.scss";
import "./theme/theme-kanagawa.scss";
import "./theme/theme-obsidian.scss";
import "./theme/theme-monokai-pro.scss";
import "./theme/theme-palenight.scss";
import "./theme/theme-solarized-dark.scss";
import "./theme/theme-gruvbox.scss";
import "./theme/theme-kimbie-dark.scss";
import "./theme/theme-everforest-hard.scss";
import "./theme/theme-solarized-light.scss";

// Global error reporting to server
const reportError = (payload: Record<string, unknown>) => {
	try {
		fetch('/api/client-log', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			keepalive: true,
		}).catch(() => {});
	} catch {}
};

window.addEventListener('error', (e) => {
	reportError({ level: 'error', message: e.message, stack: e.error?.stack, url: e.filename });
});

window.addEventListener('unhandledrejection', (e) => {
	const reason = e.reason;
	reportError({ level: 'error', message: String(reason?.message ?? reason), stack: reason?.stack });
});

const origConsoleError = console.error;
console.error = (...args) => {
	origConsoleError(...args);
	reportError({
		level: 'error',
		message: args.map(a => a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
	});
};

function OnboardingWrapper() {
	const isOnboardingComplete = useStore(s => s.settings.isOnboardingComplete);
	if (isOnboardingComplete === true) return null;
	return <OnboardingPage />;
}

createRoot(document.getElementById('root-wrapper')!).render(
	<div id="root">
		<StrictMode>
			<ChakraProvider value={system}>
				<BrowserRouter>
					<ToastProvider>
						<AuthProvider>
							<App />
							<OnboardingWrapper />
						</AuthProvider>
					</ToastProvider>
				</BrowserRouter>
			</ChakraProvider>
		</StrictMode>
	</div>,
);
