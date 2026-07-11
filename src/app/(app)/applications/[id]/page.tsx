export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Application</h1>
      <p className="text-sm text-neutral-600">
        Application <span className="font-mono text-neutral-800">{id}</span>{" "}
        created. Tailoring UI arrives in a later task.
      </p>
    </div>
  );
}
