import { notFound } from "next/navigation";
import { AdminDataPanel } from "@/components/admin-data-panel";
import { adminConfigured } from "@/lib/admin-auth";
import "@/components/admin-data.css";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (process.env.NODE_ENV === "production" && !adminConfigured()) notFound();
  return <AdminDataPanel />;
}
