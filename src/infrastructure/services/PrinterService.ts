import { HardwareConfig } from '../../domain/types';

export class PrinterService {
    private static styleId = 'printer-dynamic-styles';

    /**
     * Injects dynamic CSS for printing based on hardware config
     */
    static injectStyles(config: HardwareConfig) {
        // Remove existing styles if any
        const existing = document.getElementById(this.styleId);
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = this.styleId;
        style.innerHTML = this.generateCss(config);
        document.head.appendChild(style);
    }

    private static generateCss(config: HardwareConfig): string {
        const width = config.pos_printer_width === '58mm' ? '58mm' : '80mm';

        return `
            @media print {
                @page {
                    margin: 0;
                    size: auto;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                    background: white;
                }

                /* Hide everything by default */
                body * {
                    visibility: hidden;
                }

                /* Show only the print area */
                #print-area, #print-area * {
                    visibility: visible;
                }

                #print-area {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: ${width};
                    padding: 2mm;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    color: black;
                    background: white;
                }

                /* Utility Classes for Thermal Printing */
                .print-center { text-align: center; }
                .print-bold { font-weight: bold; }
                .print-large { font-size: 16px; }
                .print-small { font-size: 10px; }
                .print-divider { border-top: 1px dashed black; margin: 5px 0; }
                .print-row { display: flex; justify-content: space-between; }
            }
        `;
    }

    static printTicket(contentHtml: string, config: HardwareConfig) {
        this.injectStyles(config);

        // Create a temporary print container
        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }

        printArea.innerHTML = contentHtml;

        // Trigger print
        window.print();

        // Cleanup (Optional, maybe keep it for debugging or rapid re-print)
        // printArea.remove(); 
    }

    static printTestTicket(config: HardwareConfig) {
        const content = `
            <div class="print-center">
                <h2 class="print-large print-bold">FARMACIA VALLENAR</h2>
                <p class="print-small">RUT: 76.123.456-7</p>
                <p class="print-small">Av. Matta 123, Vallenar</p>
                <div class="print-divider"></div>
                <h3 class="print-bold">TICKET DE PRUEBA</h3>
                <p>${new Date().toLocaleString()}</p>
                <div class="print-divider"></div>
            </div>
            <div class="print-row">
                <span>Ancho Configurado:</span>
                <span class="print-bold">${config.pos_printer_width}</span>
            </div>
            <div class="print-row">
                <span>Modo:</span>
                <span>${config.auto_print_pos ? 'AUTO' : 'MANUAL'}</span>
            </div>
            <div class="print-divider"></div>
            <div class="print-center">
                <p class="print-small">Si puedes leer esto, la impresora está configurada correctamente.</p>
                <br/>
                <p class="print-bold">*** FIN DE PRUEBA ***</p>
                <br/>
                .
            </div>
        `;
        this.printTicket(content, config);
    }

    static printLabel(labelData: { name: string; sku: string; price: number; barcode: string }, config: HardwareConfig) {
        // Label logic is slightly different, usually fixed size pages
        // For now, we reuse the injection but with label specific CSS if needed
        // Or we assume the browser handles the page size if we set @page size properly

        const css = `
            @media print {
                @page {
                    size: ${config.label_printer_size === '50x25' ? '50mm 25mm' : '100mm 50mm'};
                    margin: 0;
                }
                body * { visibility: hidden; }
                #print-area, #print-area * { visibility: visible; }
                #print-area {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-col;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }
            }
        `;

        // Inject Label CSS
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.appendChild(style);

        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }

        printArea.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                <div style="font-size: 10px; font-weight: bold; overflow: hidden; white-space: nowrap; max-width: 95%;">${labelData.name.substring(0, 25)}</div>
                <div style="font-size: 14px; font-weight: bold;">$${labelData.price.toLocaleString()}</div>
                <div style="font-family: monospace; font-size: 8px;">${labelData.sku}</div>
                <!-- Barcode Placeholder (In real app, use JsBarcode to generate SVG/IMG) -->
                <div style="border: 1px solid black; height: 20px; width: 80%; margin-top: 2px; background: repeating-linear-gradient(90deg, black, black 1px, white 1px, white 3px);"></div>
            </div>
        `;

        window.print();

        // Cleanup styles after print to not mess up normal printing?
        // Ideally we should manage style injection better.
        // For now, reload or re-inject standard styles might be needed if user switches between ticket and label.
        // But usually they are distinct actions.
    }
}
