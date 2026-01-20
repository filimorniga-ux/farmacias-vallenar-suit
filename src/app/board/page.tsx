
import BoardPage from '@/presentation/components/board/BoardPage';

export const metadata = {
    title: 'Pizarra de Novedades | Farmacias Vallenar',
    description: 'Bitácora digital para comunicación interna del equipo.',
};

export default function Page() {
    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <BoardPage />
        </div>
    );
}
