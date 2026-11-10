/**
 * How many times a failed query is tried again before it settles as an error
 * and reaches utils/reportDataError. React Query's own default, kept: with
 * its default delay the attempts come 1, 2 and 4 seconds apart.
 * utils/queryRetry.ts says which failures are not tried again at all.
 */
export const MAX_QUERY_RETRIES = 3;
