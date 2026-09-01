import { JobsPage } from "@/components/jobs-page";
import { WorkbenchShell } from "@/components/workbench-shell";

export default function Page() {
  return (
    <WorkbenchShell>
      <JobsPage />
    </WorkbenchShell>
  );
}
