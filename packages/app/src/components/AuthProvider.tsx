import { Center, Spinner } from '@chakra-ui/react';
import { useEffect, useState, ReactNode } from 'react';
import { LoginPage } from '../pages/LoginPage';
import { fetchAuthCheck } from '../api/services';

interface IAuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: IAuthProviderProps) {
	const [isAuthenticated, setIsAuthenticated] = useState(true);
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		async function check() {
			const result = await fetchAuthCheck();
			if (!result.ok) {
				const timer = setTimeout(check, 1000);
				return;
			}
			setIsAuthenticated(result.ok && !!result.data);
			setIsChecking(false);
		}
		check();
	}, []);

	if (isChecking) {
		return (
			<Center h="100vh" w="100vw">
				<Spinner size="xl" color="brand.500" />
			</Center>
		);
	}

	if (!isAuthenticated) {
		return <LoginPage />;
	}

	return <>{children}</>;
}
