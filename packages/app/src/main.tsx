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
