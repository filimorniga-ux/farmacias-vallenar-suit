/**
 * ============================================================================
 * MAILER — Servicio de Email para Farmacias Vallenar
 * Usa Resend (resend.com) para entrega confiable de correos transaccionales.
 * ============================================================================
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'Farmacias Vallenar <noreply@farmaciasvallenarsuit.cl>';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.farmaciasvallenarsuit.cl';

// ─── Colores de marca ────────────────────────────────────────────────────────
const BRAND_TEAL = '#0e7490';
const BRAND_DARK = '#0f172a';

// ─── Base HTML para todos los correos ────────────────────────────────────────
function wrapEmail(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND_TEAL};padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.5px;">💊 Farmacias Vallenar</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Sistema ERP — Notificación Segura</p>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:40px;">${bodyHtml}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              Este correo fue generado automáticamente. No respondas a este mensaje.<br/>
              © ${new Date().getFullYear()} Farmacias Vallenar — Sistema ERP v1.0
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── 1. Recuperación de Contraseña ───────────────────────────────────────────

export async function sendPasswordResetEmail(
    to: string,
    resetLink: string,
    userName?: string
): Promise<{ success: boolean; error?: string }> {
    const displayName = userName || 'Usuario';

    const body = `
    <h2 style="margin:0 0 8px;color:${BRAND_DARK};font-size:22px;font-weight:700;">Recuperación de Contraseña</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Hola <strong>${displayName}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${resetLink}"
         style="display:inline-block;background:${BRAND_TEAL};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:.4px;">
        🔑 Restablecer Contraseña
      </a>
    </div>

    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:13px;">
        ⚠️ Este enlace expirará en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo.
      </p>
    </div>

    <p style="margin:0;color:#94a3b8;font-size:12px;word-break:break-all;">
      Si el botón no funciona, copia este enlace: ${resetLink}
    </p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to,
            subject: '🔑 Recuperación de Contraseña — Farmacias Vallenar',
            html: wrapEmail('Recuperación de Contraseña', body),
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error enviando email';
        return { success: false, error: msg };
    }
}

// ─── 2. Restablecimiento de PIN (al correo maestro del admin) ────────────────

export async function sendPinResetEmail(options: {
    masterEmail: string;
    targetUserName: string;
    targetUserRole: string;
    temporaryPin: string;
    expiresAt: Date;
    requestedBy: string;
}): Promise<{ success: boolean; error?: string }> {
    const { masterEmail, targetUserName, targetUserRole, temporaryPin, expiresAt, requestedBy } = options;

    const expiresFormatted = expiresAt.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    const body = `
    <h2 style="margin:0 0 8px;color:${BRAND_DARK};font-size:22px;font-weight:700;">PIN Temporal Generado</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">
      Se ha solicitado el restablecimiento del PIN para el siguiente usuario:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Usuario</p>
        <p style="margin:0;color:${BRAND_DARK};font-size:17px;font-weight:700;">${targetUserName}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px;">${targetUserRole}</p>
      </td></tr>
    </table>

    <div style="text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">PIN Temporal</p>
      <div style="display:inline-block;background:#0e7490;padding:16px 40px;border-radius:12px;">
        <span style="color:#ffffff;font-size:36px;font-weight:800;letter-spacing:8px;">${temporaryPin}</span>
      </div>
    </div>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;color:#991b1b;font-size:13px;">
        🕐 Este PIN expirará el <strong>${expiresFormatted}</strong>. El usuario deberá crear uno nuevo al primer inicio de sesión.
      </p>
    </div>

    <p style="margin:0;color:#94a3b8;font-size:12px;">
      Acción realizada por: <strong>${requestedBy}</strong>
    </p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to: masterEmail,
            subject: `🔐 PIN Temporal para ${targetUserName} — Farmacias Vallenar`,
            html: wrapEmail('PIN Temporal', body),
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error enviando email';
        return { success: false, error: msg };
    }
}

// ─── 3. Alerta de Seguridad ───────────────────────────────────────────────────

export async function sendSecurityAlertEmail(options: {
    to: string;
    userName: string;
    event: 'PASSWORD_CHANGED' | 'PIN_CHANGED' | 'ACCOUNT_LOCKED';
}): Promise<{ success: boolean; error?: string }> {
    const { to, userName, event } = options;

    const descriptions: Record<typeof event, { icon: string; title: string; body: string }> = {
        PASSWORD_CHANGED: {
            icon: '🔑',
            title: 'Contraseña Actualizada',
            body: 'Tu contraseña fue cambiada exitosamente. Si no fuiste tú, contacta al administrador de inmediato.',
        },
        PIN_CHANGED: {
            icon: '🔐',
            title: 'PIN de Acceso Actualizado',
            body: 'Tu PIN de acceso al sistema fue modificado. Si no realizaste este cambio, contacta al administrador.',
        },
        ACCOUNT_LOCKED: {
            icon: '🚫',
            title: 'Cuenta Bloqueada',
            body: 'Tu cuenta fue bloqueada por múltiples intentos fallidos. Contacta al administrador para recuperar el acceso.',
        },
    };

    const desc = descriptions[event];

    const body = `
    <h2 style="margin:0 0 8px;color:${BRAND_DARK};font-size:22px;font-weight:700;">${desc.icon} ${desc.title}</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Hola <strong>${userName}</strong>,</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;color:#991b1b;font-size:15px;">${desc.body}</p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>`;

    try {
        await resend.emails.send({
            from: FROM,
            to,
            subject: `${desc.icon} Alerta de Seguridad — ${desc.title}`,
            html: wrapEmail(desc.title, body),
        });
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error enviando email';
        return { success: false, error: msg };
    }
}
