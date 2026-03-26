import { redirect } from 'next/navigation';
import { logoutCurrentSessionSecure } from '@/actions/auth-v2';

export const dynamic = 'force-dynamic';

export default async function LoginPage(input: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    await logoutCurrentSessionSecure();

    const searchParams = input.searchParams ? await input.searchParams : {};
    const reason = Array.isArray(searchParams.reason) ? searchParams.reason[0] : searchParams.reason;

    redirect(reason ? `/?reason=${encodeURIComponent(reason)}` : '/');
}
