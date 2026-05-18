import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const apiRoot = path.join(process.cwd(), 'src', 'app', 'api');

const mutatingRoutePattern = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/;
const authSignals = [
    /requireApiRoles/,
    /requireServerSession/,
    /requirePermission/,
    /getValidatedSession/,
    /validateSession/,
    /x-internal-[a-z-]*token/i,
    /authorization/i,
] as const;

function walkRoutes(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkRoutes(fullPath);
        return entry.name === 'route.ts' || entry.name === 'route.tsx' ? [fullPath] : [];
    });
}

describe('mutating API route auth policy', () => {
    it('requires an auth, session, or internal-token contract for mutating API routes', () => {
        const unauthenticatedRoutes = walkRoutes(apiRoot)
            .filter((routePath) => {
                const script = fs.readFileSync(routePath, 'utf8');
                return mutatingRoutePattern.test(script) && !authSignals.some((pattern) => pattern.test(script));
            })
            .map((routePath) => path.relative(process.cwd(), routePath));

        expect(unauthenticatedRoutes).toEqual([]);
    });
});
