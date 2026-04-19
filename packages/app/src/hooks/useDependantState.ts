import { useCallback, useMemo, useRef, useState } from 'react';

interface IReconcile<T> {
	(dependantState: T): false | void
};

interface ISetter<T> {
	(value: T): void
};

export const useDependantState = <T>(
	externalState: T, 
	reconcile?: IReconcile<T>
): [
	T,
	ISetter<T>
] => {

	const dependantStateRef = useRef<T>(externalState);
	const [_, setCount] = useState(0);
	const invalidate = useCallback(() => setCount(s => s + 1), [])

	useMemo(() => {
		if (dependantStateRef.current === externalState) return;
		if (reconcile?.(dependantStateRef.current) === false) return;

		dependantStateRef.current = externalState;
	}, [externalState, reconcile]);

	const setDedendantState: ISetter<T> = useCallback((value: T) => {
		dependantStateRef.current = value;
		invalidate();
	}, [invalidate]);

	return [
		dependantStateRef.current,
		setDedendantState,
	];

};