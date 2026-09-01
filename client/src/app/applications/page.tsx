import { ApplicationsPage } from "@/components/applications-page";
import { WorkbenchShell } from "@/components/workbench-shell";

export default function Page() {
  return (
    <WorkbenchShell>
      <ApplicationsPage />
    </WorkbenchShell>
  );
}
