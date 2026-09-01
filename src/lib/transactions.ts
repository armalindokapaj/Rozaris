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
