import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default function DeprecatedSettingsLayout({
    children: _children,
}: {
    children: ReactNode;
}) {
    redirect('/settings');
}
