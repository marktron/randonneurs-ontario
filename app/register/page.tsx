import { redirect } from "next/navigation";

// Redirect to calendar - registration requires a specific event
export default function RegisterPage() {
  redirect("/calendar");
}
