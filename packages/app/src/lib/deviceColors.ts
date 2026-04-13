import { EDeviceBackendType } from '@warpcore/shared';

export const BACKEND_COLORS: Record<EDeviceBackendType, string> = {
	[EDeviceBackendType.CUDA]: '#76b900',
	[EDeviceBackendType.ROCM]: '#ed1c24',
	[EDeviceBackendType.VULKAN]: '#a78bfa',
};
