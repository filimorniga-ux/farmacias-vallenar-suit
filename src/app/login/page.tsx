import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function expireCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, name: string) {
    cookieStore.set(name, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
    });
}

export default async function LoginPage(input: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const cookieStore = await cookies();

    expireCookie(cookieStore, 'user_id');
    expireCookie(cookieStore, 'user_role');
    expireCookie(cookieStore, 'user_name');
    expireCookie(cookieStore, 'user_location');

    const searchParams = input.searchParams ? await input.searchParams : {};
    const reason = Array.isArray(searchParams.reason) ? searchParams.reason[0] : searchParams.reason;

    redirect(reason ? `/?reason=${encodeURIComponent(reason)}` : '/');
}
