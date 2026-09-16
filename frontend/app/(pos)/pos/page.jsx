import PosTerminal from "@/components/pos/pos-terminal";

export const metadata = { title: "Checkout" };

export default async function PosPage({ searchParams }) {
  const { customerId } = await searchParams;
  const id = Number.parseInt(typeof customerId === "string" ? customerId : "", 10);
  return <PosTerminal initialCustomerId={Number.isInteger(id) && id > 0 ? id : null} />;
}
