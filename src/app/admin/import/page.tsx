import { RESOURCES, type ResourceKey } from "@/lib/resources";
import { ImportPanel } from "@/components/admin/ImportPanel";

/** Bulk import console. Dry-run first, apply second. */
export default function AdminImportPage() {
  const resources = (Object.keys(RESOURCES) as ResourceKey[]).map((k) => ({
    key: k,
    label: RESOURCES[k].label,
  }));
  return <ImportPanel resources={resources} />;
}
