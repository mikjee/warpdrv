import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface IProps {
	fallback: React.ReactNode;
	children: React.ReactNode;
}

export const RendererErrorBoundary: React.FC<IProps> = ({ fallback, children }) => {
	return (
		<ErrorBoundary
			fallbackRender={() => <>{fallback}</>}
			onError={(err) => console.warn('[ToolCallRenderer] failed, using fallback:', err)}
		>
			{children}
		</ErrorBoundary>
	);
};
