import 'server-only';

import {
    getActorOrFail,
    PinRbacError,
    type PinRbacActor,
} from '@/lib/pin-rbac';

export type ActorResult =
    | { success: true; actor: PinRbacActor }
    | { success: false; error: string };

export async function resolveActorResult(): Promise<ActorResult> {
    try {
        return { success: true, actor: await getActorOrFail() };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return { success: false, error: 'No autenticado' };
        }

        throw error;
    }
}
