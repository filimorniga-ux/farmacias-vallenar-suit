import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export default function ProcurementLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
