export interface LegalDocument {
    id: string;
    title: string;
    filename: string;
    category?: 'REGLAMENTO' | 'LEY' | 'DECRETO' | 'OTRO';
}

export const LEGAL_DOCS: LegalDocument[] = [
    {
        id: 'doc-1',
        title: 'Decreto 3 - Reglamento del Sistema Nacional de Control de Productos Farmacéuticos',
        filename: 'Decreto 3.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-2',
        title: 'Listado de Bioequivalentes Actualizado',
        filename: 'listado de bioeqivalentes actualizado.pdf',
        category: 'OTRO'
    },
    {
        id: 'doc-3',
        title: 'Guía de Manejo de Urgencias Toxicológicas',
        filename: 'Guía de Manejo de Urgencias Toxicológicaas.pdf',
        category: 'OTRO'
    },
    {
        id: 'doc-4',
        title: 'Ley 20.724 - Modifica el Código Sanitario en materia de farmacias',
        filename: 'Ley 20724 .pdf',
        category: 'LEY'
    },
    {
        id: 'doc-5',
        title: 'Procedimiento de Respuestas a Reclamos',
        filename: 'procedimiento de respuestas a reclamos.pdf',
        category: 'OTRO'
    },
    {
        id: 'doc-6',
        title: 'Decreto 825 - Reglamento de Control de Productos y Elementos de Uso Médico',
        filename: 'Decreto 825 APRUEBA REGLAMENTO DE CONTROL DE PRODUCTOS Y ELEMENTOS DE USO MEDICO.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-7',
        title: 'Decreto 48 Exento',
        filename: 'Decreto-48-EXENTO_30-SEP-2019.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-8',
        title: 'Decreto 594 - Condiciones Sanitarias y Ambientales Básicas en Lugares de Trabajo',
        filename: 'Decreto 594 APRUEBA REGLAMENTO SOBRE CONDICIONES SANITARIAS Y AMBIENTALES BASICAS EN LOS LUGARES DE TRABAJO.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-9',
        title: 'Decreto 404 - Reglamento de Estupefacientes',
        filename: 'Decreto 404 REGLAMENTO DE ESTUPEFACIENTES.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-10',
        title: 'Ley 20.000 - Sanciona el Tráfico Ilícito de Estupefacientes',
        filename: 'Ley 20000 .pdf',
        category: 'LEY'
    },
    {
        id: 'doc-11',
        title: 'Decreto 867',
        filename: 'Decreto 867.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-12',
        title: 'Reglamento DS 466 - Reglamento de Farmacias, Droguerías y Almacenes Farmacéuticos',
        filename: 'reglamento ds 466.pdf',
        category: 'REGLAMENTO'
    },
    {
        id: 'doc-13',
        title: 'Decreto 239 - Sistema Nacional de Control de Cosméticos',
        filename: 'Decreto 239 APRUEBA REGLAMENTO DEL SISTEMA NACIONAL DE CONTROL DE COSMETICOS.pdf',
        category: 'DECRETO'
    },
    {
        id: 'doc-14',
        title: 'Decreto 405 - Reglamento de Productos Psicotrópicos',
        filename: 'Decreto 405 REGLAMENTO DE PRODUCTOS PSICOTROPICOS.pdf',
        category: 'DECRETO'
    }
];
