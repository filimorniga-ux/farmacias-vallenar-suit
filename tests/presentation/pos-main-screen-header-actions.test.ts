import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('POSMainScreen header actions fallback', () => {
    it('mantiene visible la gestión de caja cuando /pos corre sin portal de layout', () => {
        const componentPath = path.join(process.cwd(), 'src/presentation/components/POSMainScreen.tsx');
        const source = readFileSync(componentPath, 'utf8');

        expect(source).toContain('data-testid="pos-header-actions"');
        expect(source).toContain("document.getElementById('header-actions-portal')");
        expect(source).toContain('headerActionsPortal ? createPortal(headerActions, headerActionsPortal)');
        expect(source).toContain('onHistory={() => setIsHistoryModalOpen(true)}');
        expect(source).toContain('onShiftHistory={() => setIsShiftHistoryModalOpen(true)}');
        expect(source).toContain("onMovement={() => setCashModalMode('MOVEMENT')}");
        expect(source).toContain("onAudit={() => setCashModalMode('AUDIT')}");
        expect(source).toContain("onCloseTurn={() => setCashModalMode('CLOSE')}");
        expect(source).toContain('onQuoteHistory={() => setIsQuoteHistoryOpen(true)}');
    });
});
