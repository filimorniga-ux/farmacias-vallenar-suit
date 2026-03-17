import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
