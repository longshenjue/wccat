import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminPanel />;
}
