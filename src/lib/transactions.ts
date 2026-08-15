/**
 * Property/Listing/Transaction split (see MEMORY note
 * "rozaris-controlled-taxonomy-spec") — a `Transaction` row is the real
 * "this listing actually sold/rented" event, distinct from `Listing.status`
 * alone (which is also used for moderation states like `suspended`/
 * `archived`). Written once, the first time a listing's status transitions
 * INTO `sold`/`rented` — a later re-save that leaves it at the same status
 * (or a correction back to `active`) doesn't create a duplicate/second row,
 * matching the "each real event, not each save" intent of a Transaction
 * log.
 *
 * Takes a plain object (not a typed Prisma transaction client) so both
 * call sites (`PATCH /api/listings/[listingId]`, `PATCH
 * /api/admin/listings/[listingId]/publication`) can pass either
 * `prisma` directly or a `tx` from inside their own `$transaction`.
 */
export interface TransactionWriter {
  transaction: {
    create: (args: {
      data: {
        listingId: string;
        type: "sale" | "long_term_rent" | "short_term_rent" | "reservation";
        status: "completed";
        price: number;
        currency: string;
      };
    }) => Promise<unknown>;
  };
}

export async function recordSaleOrRentalIfNewlyCompleted(
  db: TransactionWriter,
  params: {
    listingId: string;
    previousStatus: string;
    newStatus: string | undefined;
    transactionType: string;
    rentSubtype: string | null;
    price: number;
    currency: string;
  }
): Promise<void> {
  if (!params.newStatus) return;
  if (params.newStatus !== "sold" && params.newStatus !== "rented") return;
  if (params.previousStatus === params.newStatus) return;

  const type: "sale" | "long_term_rent" | "short_term_rent" =
    params.newStatus === "sold" ? "sale" : params.rentSubtype === "daily" ? "short_term_rent" : "long_term_rent";

  await db.transaction.create({
    data: {
      listingId: params.listingId,
      type,
      status: "completed",
      price: params.price,
      currency: params.currency,
    },
  });
}
