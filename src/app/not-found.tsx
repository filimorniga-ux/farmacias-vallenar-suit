

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-900">
            <h2 className="text-2xl font-bold text-slate-800">Página no encontrada</h2>
            <a href="/dashboard" className="px-4 py-2 mt-4 bg-blue-600 text-white rounded">
                Volver al Dashboard (Recarga)
            </a>
        </div>
    )
}
