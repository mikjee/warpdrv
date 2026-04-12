import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchAuthCheck } from '../api/services';

interface IAuthCheckProps {
	children: React.ReactNode;
}

export function AuthCheck({ children }: IAuthCheckProps) {
	const [isChecking, setIsChecking] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		checkAuth();
	}, []);

	async function checkAuth() {
		const result = await fetchAuthCheck();
		if (result.ok && result.data) {
			setIsAuthenticated(true);
		} else {
			setIsAuthenticated(false);
		}
		setIsChecking(false);
	}

	if (isChecking) {
		return null;
	}

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />;
	}

	return <>{children}</>;
}
