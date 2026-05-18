import { redirect } from 'next/navigation';

export default function SettingsAiRoutePage() {
    redirect('/settings?tab=ai');
}
