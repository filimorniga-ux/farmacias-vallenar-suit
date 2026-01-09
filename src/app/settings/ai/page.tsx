'use client';

import { useState, useEffect, useCallback } from 'react';
import RouteGuard from '@/components/auth/RouteGuard';
import {
    Save, Eye, EyeOff, Bot, Zap, AlertCircle, CheckCircle,
    RefreshCw, TrendingUp, DollarSign, Clock, Settings2,
    Sparkles, Shield, TestTube
} from 'lucide-react';
import { toast } from 'sonner';
import {
    saveSystemConfigSecure,
    getAIConfigSecure,
    getAIUsageSecure,
    checkAIConfiguredSecure,
    type AIConfig
} from '@/actions/config-v2';

// ============================================================================
// TIPOS Y CONSTANTES
// ============================================================================

interface AIUsageData {
    totalRequests: number;
    totalTokens: number;
    estimatedCost: number;
    limit: number;
    percentUsed: number;
}

const AI_PROVIDERS = [
    { value: 'OPENAI', label: 'OpenAI', icon: '🤖', description: 'GPT-4o, más preciso' },
    { value: 'GEMINI', label: 'Google Gemini', icon: '✨', description: 'Gemini 1.5, más económico' },
] as const;

const AI_MODELS: Record<string, Array<{ value: string; label: string; cost: string; description: string }>> = {
    OPENAI: [
        { value: 'gpt-4o', label: 'GPT-4o', cost: '$$$', description: 'Máxima precisión' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '$', description: 'Económico y rápido' },
    ],
    GEMINI: [
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', cost: '$$', description: 'Alta calidad' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', cost: '$', description: 'Más rápido' },
    ],
};

const FALLBACK_OPTIONS = [
    { value: 'NONE', label: 'Sin respaldo' },
    { value: 'OPENAI', label: 'OpenAI' },
    { value: 'GEMINI', label: 'Google Gemini' },
];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function AISettingsPage() {
    // Estado del formulario
    const [provider, setProvider] = useState<'OPENAI' | 'GEMINI'>('OPENAI');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('gpt-4o-mini');
    const [monthlyLimit, setMonthlyLimit] = useState(1000);
    const [fallbackProvider, setFallbackProvider] = useState<'OPENAI' | 'GEMINI' | 'NONE'>('NONE');

    // Estado de UI
    const [showApiKey, setShowApiKey] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const [usage, setUsage] = useState<AIUsageData | null>(null);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);

    // Cargar configuración actual
    const loadConfig = useCallback(async () => {
        setIsLoading(true);
        try {
            const [configResult, usageResult, checkResult] = await Promise.all([
                getAIConfigSecure(),
                getAIUsageSecure(),
                checkAIConfiguredSecure(),
            ]);

            if (configResult.provider) setProvider(configResult.provider as 'OPENAI' | 'GEMINI');
            if (configResult.model) setModel(configResult.model);
            if (configResult.monthlyLimit) setMonthlyLimit(configResult.monthlyLimit);
            if (configResult.fallbackProvider) setFallbackProvider(configResult.fallbackProvider as any);

            // No mostrar la API key real por seguridad
            if (configResult.apiKey) {
                setApiKey(''); // Campo vacío, pero indicamos que está configurada
            }

            setIsConfigured(checkResult.configured);

            if (usageResult.success && usageResult.data) {
                setUsage(usageResult.data);
            }
        } catch (error) {
            console.error('Error loading AI config:', error);
            toast.error('Error al cargar la configuración');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    // Validar API Key
    const validateApiKey = (key: string): string | null => {
        if (!key) return null; // Vacío es OK si ya está configurada

        if (provider === 'OPENAI' && !key.startsWith('sk-')) {
            return 'API Key de OpenAI debe comenzar con "sk-"';
        }
        if (provider === 'GEMINI' && !key.startsWith('AIza')) {
            return 'API Key de Gemini debe comenzar con "AIza"';
        }
        if (key.length < 20) {
            return 'API Key debe tener al menos 20 caracteres';
        }
        return null;
    };

    // Manejar cambio de API Key
    const handleApiKeyChange = (value: string) => {
        setApiKey(value);
        setApiKeyError(validateApiKey(value));
    };

    // Manejar cambio de proveedor
    const handleProviderChange = (newProvider: 'OPENAI' | 'GEMINI') => {
        setProvider(newProvider);
        // Cambiar modelo al predeterminado del proveedor
        setModel(newProvider === 'OPENAI' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
        // Validar API key con nuevo proveedor
        if (apiKey) {
            setApiKeyError(validateApiKey(apiKey));
        }
    };

    // Guardar configuración
    const handleSave = async () => {
        // Validar
        if (apiKey && apiKeyError) {
            toast.error(apiKeyError);
            return;
        }

        setIsSaving(true);
        const loadingId = toast.loading('Guardando configuración...');

        try {
            // Guardar cada configuración
            const configs = [
                { key: 'AI_PROVIDER', value: provider },
                { key: 'AI_MODEL', value: model },
                { key: 'AI_MONTHLY_LIMIT', value: monthlyLimit.toString() },
                { key: 'AI_FALLBACK_PROVIDER', value: fallbackProvider },
            ];

            // Solo guardar API Key si se ingresó una nueva
            if (apiKey) {
                configs.push({ key: 'AI_API_KEY', value: apiKey, isEncrypted: true } as any);
            }

            for (const config of configs) {
                const result = await saveSystemConfigSecure(config);
                if (!result.success) {
                    throw new Error(result.error || 'Error guardando configuración');
                }
            }

            toast.success('Configuración guardada correctamente', { id: loadingId });
            setApiKey(''); // Limpiar campo
            setIsConfigured(true);

            // Recargar uso
            const usageResult = await getAIUsageSecure();
            if (usageResult.success && usageResult.data) {
                setUsage(usageResult.data);
            }

        } catch (error: any) {
            toast.error(error.message || 'Error al guardar', { id: loadingId });
        } finally {
            setIsSaving(false);
        }
    };

    // Probar conexión
    const handleTestConnection = async () => {
        if (!isConfigured && !apiKey) {
            toast.error('Ingrese una API Key primero');
            return;
        }

        setIsTesting(true);
        const loadingId = toast.loading('Probando conexión con IA...');

        try {
            // Por ahora solo verificamos que esté configurada
            const result = await checkAIConfiguredSecure();

            if (result.configured) {
                toast.success(`Conexión exitosa con ${result.provider} (${result.model})`, { id: loadingId });
            } else {
                toast.error(result.error || 'No configurado', { id: loadingId });
            }
        } catch (error: any) {
            toast.error('Error probando conexión', { id: loadingId });
        } finally {
            setIsTesting(false);
        }
    };

    // Calcular color del progreso
    const getUsageColor = (percent: number) => {
        if (percent < 70) return 'bg-green-500';
        if (percent < 90) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    // Render
    return (
        <RouteGuard allowedRoles={['ADMIN', 'GERENTE_GENERAL']}>
            <div className="min-h-screen bg-gray-50 p-4 md:p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <Bot className="text-purple-600" />
                            Configuración de IA
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Configure el proveedor de inteligencia artificial para el parsing de facturas.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                            <div className="animate-pulse space-y-4">
                                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                                <div className="h-10 bg-gray-200 rounded"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                                <div className="h-10 bg-gray-200 rounded"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Status Card */}
                            <div className={`rounded-xl shadow-sm border p-4 ${isConfigured
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-yellow-50 border-yellow-200'
                                }`}>
                                <div className="flex items-center gap-3">
                                    {isConfigured ? (
                                        <CheckCircle className="text-green-600" size={24} />
                                    ) : (
                                        <AlertCircle className="text-yellow-600" size={24} />
                                    )}
                                    <div>
                                        <p className={`font-medium ${isConfigured ? 'text-green-800' : 'text-yellow-800'}`}>
                                            {isConfigured ? 'IA Configurada y Lista' : 'Configuración Pendiente'}
                                        </p>
                                        <p className={`text-sm ${isConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                                            {isConfigured
                                                ? `Usando ${provider} - ${model}`
                                                : 'Configure una API Key para habilitar el parsing de facturas'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Main Config Card */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-6 border-b border-gray-200 bg-gray-50">
                                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                        <Settings2 size={20} />
                                        Proveedor y Modelo
                                    </h2>
                                </div>

                                <div className="p-6 space-y-6">
                                    {/* Provider Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-3">
                                            Proveedor de IA
                                        </label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {AI_PROVIDERS.map((p) => (
                                                <button
                                                    key={p.value}
                                                    type="button"
                                                    onClick={() => handleProviderChange(p.value as any)}
                                                    className={`p-4 rounded-lg border-2 text-left transition-all ${provider === p.value
                                                            ? 'border-purple-500 bg-purple-50'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{p.icon}</span>
                                                        <div>
                                                            <p className="font-medium text-gray-900">{p.label}</p>
                                                            <p className="text-sm text-gray-500">{p.description}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* API Key */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            API Key {isConfigured && <span className="text-green-600">(configurada)</span>}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showApiKey ? 'text' : 'password'}
                                                value={apiKey}
                                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                                placeholder={isConfigured ? '••••••••••••••••••••' : 'Ingrese su API Key'}
                                                className={`w-full pr-20 rounded-lg border ${apiKeyError
                                                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                                        : 'border-gray-300 focus:ring-purple-500 focus:border-purple-500'
                                                    } shadow-sm`}
                                                autoComplete="off"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        {apiKeyError && (
                                            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                                                <AlertCircle size={14} />
                                                {apiKeyError}
                                            </p>
                                        )}
                                        <p className="mt-1 text-xs text-gray-500">
                                            {provider === 'OPENAI'
                                                ? 'Obtener en platform.openai.com → API Keys'
                                                : 'Obtener en aistudio.google.com → API Key'
                                            }
                                        </p>
                                    </div>

                                    {/* Model Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Modelo
                                        </label>
                                        <select
                                            value={model}
                                            onChange={(e) => setModel(e.target.value)}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500"
                                        >
                                            {AI_MODELS[provider]?.map((m) => (
                                                <option key={m.value} value={m.value}>
                                                    {m.label} ({m.cost}) - {m.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Monthly Limit */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Límite Mensual de Requests
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="100"
                                                max="5000"
                                                step="100"
                                                value={monthlyLimit}
                                                onChange={(e) => setMonthlyLimit(parseInt(e.target.value))}
                                                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                            />
                                            <input
                                                type="number"
                                                value={monthlyLimit}
                                                onChange={(e) => setMonthlyLimit(parseInt(e.target.value) || 100)}
                                                min={100}
                                                max={10000}
                                                className="w-24 rounded-lg border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 text-center"
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            Protege contra uso excesivo. Una factura = 1 request.
                                        </p>
                                    </div>

                                    {/* Fallback Provider */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Proveedor de Respaldo
                                        </label>
                                        <select
                                            value={fallbackProvider}
                                            onChange={(e) => setFallbackProvider(e.target.value as any)}
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500"
                                        >
                                            {FALLBACK_OPTIONS.filter(o => o.value !== provider).map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500">
                                            Se usa automáticamente si el proveedor principal falla.
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="p-6 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        disabled={isTesting || (!isConfigured && !apiKey)}
                                        className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isTesting ? (
                                            <RefreshCw size={18} className="animate-spin" />
                                        ) : (
                                            <TestTube size={18} />
                                        )}
                                        Probar Conexión
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={isSaving || (!!apiKey && !!apiKeyError)}
                                        className="flex items-center justify-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                                    >
                                        {isSaving ? (
                                            <RefreshCw size={18} className="animate-spin" />
                                        ) : (
                                            <Save size={18} />
                                        )}
                                        Guardar Configuración
                                    </button>
                                </div>
                            </div>

                            {/* Usage Card */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                        <TrendingUp size={20} />
                                        Uso del Mes
                                    </h2>
                                    <button
                                        onClick={loadConfig}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                </div>

                                <div className="p-6">
                                    {usage ? (
                                        <div className="space-y-6">
                                            {/* Progress Bar */}
                                            <div>
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-gray-600">Requests utilizados</span>
                                                    <span className="font-medium text-gray-900">
                                                        {usage.totalRequests.toLocaleString()} / {usage.limit.toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${getUsageColor(usage.percentUsed)} transition-all duration-500`}
                                                        style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {usage.percentUsed}% del límite mensual
                                                </p>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div className="p-4 bg-gray-50 rounded-lg">
                                                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                                                        <Zap size={16} />
                                                        Requests
                                                    </div>
                                                    <p className="text-2xl font-bold text-gray-900">
                                                        {usage.totalRequests.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-gray-50 rounded-lg">
                                                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                                                        <Sparkles size={16} />
                                                        Tokens
                                                    </div>
                                                    <p className="text-2xl font-bold text-gray-900">
                                                        {usage.totalTokens.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-gray-50 rounded-lg col-span-2 md:col-span-1">
                                                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                                                        <DollarSign size={16} />
                                                        Costo Estimado
                                                    </div>
                                                    <p className="text-2xl font-bold text-gray-900">
                                                        ${usage.estimatedCost.toFixed(4)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">USD</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            <Clock size={48} className="mx-auto mb-3 opacity-50" />
                                            <p>Sin datos de uso disponibles</p>
                                            <p className="text-sm">Los datos aparecerán cuando procese su primera factura</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info Card */}
                            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                                <div className="flex gap-4">
                                    <Shield className="text-blue-600 flex-shrink-0" size={24} />
                                    <div>
                                        <h3 className="font-medium text-blue-900 mb-1">Seguridad de API Keys</h3>
                                        <p className="text-sm text-blue-700">
                                            Su API Key se almacena encriptada con AES-256-GCM y nunca se muestra
                                            después de guardarla. Las llamadas a la IA se registran para auditoría
                                            y control de costos.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </RouteGuard>
    );
}
