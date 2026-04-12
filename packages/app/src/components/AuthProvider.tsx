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
			setIsAuthenticated(result.ok && !!result.data);
			setIsChecking(false);
		}
		check();
	}, []);

	if (isChecking) {
		return null;
	}

	if (!isAuthenticated) {
		return <LoginPage />;
	}

	return <>{children}</>;
}
