import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface IProps {
	fallback?: React.ReactNode;
	children: React.ReactNode;
	name?: string;
}

export const WithErrorBoundary: React.FC<IProps> = ({ fallback, children, name }) => {
	return (
		<ErrorBoundary
			fallbackRender={() => <>{fallback || null}</>}
			onError={(err) => console.error(`Error Boundary Triggered! ${name || ''}`, err)}
		>
			{children}
		</ErrorBoundary>
	);
};
