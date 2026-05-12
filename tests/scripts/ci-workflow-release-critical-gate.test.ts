import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function getReleaseCriticalGateStep(workflow: string): string {
    const stepStart = workflow.indexOf('- name: Release-Critical E2E Gate');
    expect(stepStart).toBeGreaterThanOrEqual(0);

    const nextStepStart = workflow.indexOf('\n    - name:', stepStart + 1);
    return workflow.slice(stepStart, nextStepStart === -1 ? undefined : nextStepStart);
}

describe('ci workflow release critical gate', () => {
    it('pasa una URL non-pooling explícita al gate crítico', () => {
        const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
        const gateStep = getReleaseCriticalGateStep(workflow);

        expect(gateStep).toContain('run: npm run test:e2e:release:critical');
        expect(gateStep).toContain('POSTGRES_URL_NON_POOLING: postgres://postgres:farmacia123@localhost:5432/farmacia_vallenar');
    });
});
