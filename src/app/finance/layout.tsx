import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export const dynamic = 'force-dynamic';

export default function FinanceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
