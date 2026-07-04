import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyKbNote } from "../queries";
import { NoteEditor } from "./note-editor";

export const dynamic = "force-dynamic";

export default async function CompanyKbNotePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const note = await getCompanyKbNote(params.id, user.id);
  if (!note) notFound();

  return <NoteEditor note={note} />;
}
