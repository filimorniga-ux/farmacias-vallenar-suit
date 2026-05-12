import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export const dynamic = 'force-dynamic';

export default function SuppliersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
