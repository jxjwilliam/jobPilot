import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function listAllResumePaths(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string[]> {
  const paths: string[] = [];
  const { data: entries, error } = await admin.storage
    .from("jp_resumes")
    .list(userId, { limit: 1000 });

  if (error) {
    throw new Error(`Failed to list resume files: ${error.message}`);
  }

  for (const entry of entries ?? []) {
    if (entry.name) {
      paths.push(`${userId}/${entry.name}`);
    }
  }
  return paths;
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const paths = await listAllResumePaths(admin, user.id);

    if (paths.length > 0) {
      const { error: removeError } = await admin.storage
        .from("jp_resumes")
        .remove(paths);
      if (removeError) {
        throw new Error(`Failed to delete resume files: ${removeError.message}`);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
