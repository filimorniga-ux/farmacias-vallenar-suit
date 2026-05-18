export type SmartInvoicePaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

const MAX_CONTIGUOUS_PAGES = 7;

function pageRange(start: number, end: number): number[] {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function buildSmartInvoicePaginationItems(
    currentPage: number,
    totalPages: number,
): SmartInvoicePaginationItem[] {
    if (totalPages <= 0) {
        return [];
    }

    const safeCurrentPage = Math.min(Math.max(Math.trunc(currentPage), 1), totalPages);

    if (totalPages <= MAX_CONTIGUOUS_PAGES) {
        return pageRange(1, totalPages);
    }

    if (safeCurrentPage <= 3) {
        return [...pageRange(1, 4), 'ellipsis-end', totalPages];
    }

    if (safeCurrentPage >= totalPages - 2) {
        return [1, 'ellipsis-start', ...pageRange(totalPages - 3, totalPages)];
    }

    return [
        1,
        'ellipsis-start',
        safeCurrentPage - 1,
        safeCurrentPage,
        safeCurrentPage + 1,
        'ellipsis-end',
        totalPages,
    ];
}
