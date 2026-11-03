import { route, preflight } from '@/lib/http';
import { availableModels } from '@/lib/ai';
export const GET = route(async () => ({ models: availableModels() }), { cacheSeconds: 300 });
export const OPTIONS = preflight;
