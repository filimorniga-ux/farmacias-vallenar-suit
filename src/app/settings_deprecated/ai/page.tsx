import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DeprecatedSettingsAiPage() {
    redirect('/settings?tab=ai');
}
