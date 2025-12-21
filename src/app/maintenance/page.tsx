export default function MaintenancePage() {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-center p-4">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">🚧 Estamos en Mantenimiento 🚧</h1>
            <p className="text-lg text-gray-600 max-w-md">
                Estamos aplicando mejoras críticas de seguridad y rendimiento en la base de datos.
                La plataforma volverá a estar disponible en breve.
            </p>
            <p className="mt-8 text-sm text-gray-400">Farmacias App Team</p>
        </div>
    );
}
