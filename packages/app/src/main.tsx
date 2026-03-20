import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import { system } from './theme/system';
import { ToastProvider } from './components/ToastProvider';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ChakraProvider value={system}>
			<BrowserRouter>
				<ToastProvider>
					<App />
				</ToastProvider>
			</BrowserRouter>
		</ChakraProvider>
	</StrictMode>,
);
