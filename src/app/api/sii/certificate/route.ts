import { NextRequest, NextResponse } from 'next/server';
import { requireApiRoles } from '@/lib/api-auth';
import { getSiiConfigurationSummary, saveSiiConfiguration } from '@/lib/sii-config';

const SII_CONFIG_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'QF'] as const;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    const auth = await requireApiRoles(SII_CONFIG_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    const data = await getSiiConfigurationSummary();
    return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
    const auth = await requireApiRoles(SII_CONFIG_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    try {
        const formData = await request.formData();
        const certificateFileValue = formData.get('certificate');
        const certificateFile = certificateFileValue instanceof File ? certificateFileValue : null;
        const certificatePasswordValue = formData.get('certificatePassword');
        const rutEmisorValue = formData.get('rut_emisor');
        const razonSocialValue = formData.get('razon_social');
        const giroValue = formData.get('giro');
        const actecoValue = formData.get('acteco');
        const ambienteValue = formData.get('ambiente');

        const data = await saveSiiConfiguration({
            userId: auth.session.userId,
            certificateFile,
            certificatePassword: typeof certificatePasswordValue === 'string' ? certificatePasswordValue : null,
            rutEmisor: typeof rutEmisorValue === 'string' ? rutEmisorValue : '',
            razonSocial: typeof razonSocialValue === 'string' ? razonSocialValue : '',
            giro: typeof giroValue === 'string' ? giroValue : '',
            acteco: Number(typeof actecoValue === 'string' ? actecoValue : 477310),
            ambiente: ambienteValue === 'PRODUCCION' ? 'PRODUCCION' : 'CERTIFICACION',
        });

        return NextResponse.json({ success: true, data });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'No se pudo guardar la configuración SII',
            },
            { status: 400 }
        );
    }
}
