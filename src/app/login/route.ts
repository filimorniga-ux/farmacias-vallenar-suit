import { NextRequest, NextResponse } from 'next/server';
import { invalidateCurrentSession } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    await invalidateCurrentSession();

    const reason = request.nextUrl.searchParams.get('reason');
    const redirectUrl = new URL('/', request.url);

    if (reason) {
        redirectUrl.searchParams.set('reason', reason);
    }

    return NextResponse.redirect(redirectUrl);
}
