import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export default function RRHHLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <NextSidebarLayout>
            {children}
        </NextSidebarLayout>
    );
}
