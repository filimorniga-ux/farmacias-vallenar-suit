/**
 * Push Notifications — Capacitor (Android / iOS)
 * Inicializa el sistema de notificaciones push nativas.
 * En web, este módulo se importa dinámicamente y no hace nada.
 *
 * Requiere instalar: npm install @capacitor/push-notifications
 * Luego: npx cap sync
 */

import { Capacitor } from '@capacitor/core';

type OnTokenCallback = (token: string) => void;
type OnNavigateCallback = (url: string) => void;

let _initialized = false;

export async function initPushNotifications(
    onToken: OnTokenCallback,
    onNavigate?: OnNavigateCallback
): Promise<void> {
    // Solo en plataforma nativa (Android / iOS)
    if (!Capacitor.isNativePlatform()) return;
    if (_initialized) return;

    let PushNotifications: any;
    try {
        // Importación dinámica: si el paquete no está instalado, falla silenciosamente
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // @ts-ignore — paquete opcional: npm i @capacitor/push-notifications && npx cap sync
        const mod = await import('@capacitor/push-notifications');
        PushNotifications = mod.PushNotifications;
    } catch {
        console.warn('[Push] @capacitor/push-notifications no está instalado. Instalar con: npm i @capacitor/push-notifications');
        return;
    }

    // Solicitar permisos
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
        console.warn('[Push] Permisos de notificación denegados por el usuario');
        return;
    }

    await PushNotifications.register();

    // ── Handlers ──────────────────────────────────────────────────────────────

    // Token recibido → guardar en BD via Server Action
    PushNotifications.addListener('registration', ({ value }: { value: string }) => {
        console.info('[Push] Token de dispositivo registrado');
        onToken(value);
    });

    PushNotifications.addListener('registrationError', (err: unknown) => {
        console.error('[Push] Error al registrar dispositivo:', err);
    });

    // Notificación recibida en FOREGROUND (la app está abierta)
    // El polling de NotificationBell actualizará el store automáticamente.
    PushNotifications.addListener('pushNotificationReceived', (_notification: unknown) => {
        // Opcional: forzar un refresh inmediato del store
    });

    // El usuario hizo TAP en la notificación push (app en background / cerrada)
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
        const url: string | undefined =
            action.notification?.data?.action_url ??
            action.notification?.data?.actionUrl;
        if (url && onNavigate) {
            onNavigate(url);
        }
    });

    _initialized = true;
    console.info('[Push] Notificaciones push nativas inicializadas');
}
