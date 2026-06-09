import { useSignAndExecuteTransaction, useSuiClient } from "../../../lib/mystenDappKitCompat";
import { useState } from "react";
import { SignalMetaChip } from "../../../components/SignalMetaChip";
import {
  type ProjectMemberRole,
  type ProjectSummary,
} from "../../../lib/projectRegistry";
import { isValidSuiAddress, normalizeSuiAddress } from "../../../lib/suiAddress";

interface ProjectMemberManagementSectionProps {
  selectedProject: ProjectSummary | null;
  onRefreshProjects: () => Promise<unknown>;
}

function roleLabel(role: ProjectMemberRole) {
  if (role === "co_admin") {
    return "Co-admin";
  }
  if (role === "reviewer") {
    return "Reviewer";
  }
  return "Owner";
}

export function ProjectMemberManagementSection({
  selectedProject,
  onRefreshProjects,
}: ProjectMemberManagementSectionProps) {
  const suiClient = useSuiClient();
  const addMemberTx = useSignAndExecuteTransaction();
  const removeMemberTx = useSignAndExecuteTransaction();
  const updateRoleTx = useSignAndExecuteTransaction();
  const [memberAddress, setMemberAddress] = useState("");
  const [memberRole, setMemberRole] = useState<Exclude<ProjectMemberRole, "owner">>("co_admin");
  const [status, setStatus] = useState("");

  async function loadProjectRegistryWriteModule() {
    return import("../../../lib/projectRegistryWrite");
  }

  const ownerCapId = selectedProject?.ownedOwnerCapId ?? "";
  const busy = addMemberTx.isPending || removeMemberTx.isPending || updateRoleTx.isPending;

  async function waitAndRefresh(digest: string) {
    await suiClient.waitForTransaction({ digest });
    await onRefreshProjects();
  }

  async function handleAddMember() {
    if (!selectedProject) {
      setStatus("Select or create a project first.");
      return;
    }
    if (!ownerCapId) {
      setStatus("This wallet does not hold the selected project's ProjectOwnerCap.");
      return;
    }
    if (!isValidSuiAddress(memberAddress)) {
      setStatus("Enter a valid Sui wallet address.");
      return;
    }

    try {
      setStatus("Awaiting wallet approval...");
      const { addProjectMember } = await loadProjectRegistryWriteModule();
      const tx = addProjectMember({
        projectId: selectedProject.objectId,
        ownerCapId,
        memberAddress: normalizeSuiAddress(memberAddress),
        role: memberRole,
      });
      const result = await addMemberTx.mutateAsync({ transaction: tx });
      await waitAndRefresh(result.digest);
      setMemberAddress("");
      setStatus(`${roleLabel(memberRole)} added to ${selectedProject.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add project member.");
    }
  }

  async function handleRemoveMember(address: string) {
    if (!selectedProject || !ownerCapId) {
      setStatus("ProjectOwnerCap is required to remove members.");
      return;
    }
    if (!window.confirm(`Remove ${address} from ${selectedProject.name}?`)) {
      return;
    }

    try {
      setStatus("Awaiting wallet approval...");
      const { removeProjectMember } = await loadProjectRegistryWriteModule();
      const tx = removeProjectMember({
        projectId: selectedProject.objectId,
        ownerCapId,
        memberAddress: address,
        role: "reviewer",
      });
      const result = await removeMemberTx.mutateAsync({ transaction: tx });
      await waitAndRefresh(result.digest);
      setStatus("Project member removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove project member.");
    }
  }

  async function handleUpdateRole(address: string, role: Exclude<ProjectMemberRole, "owner">) {
    if (!selectedProject || !ownerCapId) {
      setStatus("ProjectOwnerCap is required to update member roles.");
      return;
    }

    try {
      setStatus("Awaiting wallet approval...");
      const { updateProjectMemberRole } = await loadProjectRegistryWriteModule();
      const tx = updateProjectMemberRole({
        projectId: selectedProject.objectId,
        ownerCapId,
        memberAddress: address,
        role,
      });
      const result = await updateRoleTx.mutateAsync({ transaction: tx });
      await waitAndRefresh(result.digest);
      setStatus("Project member role updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update project member role.");
    }
  }

  return (
    <section className="panel access-management-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">Project permissions</p>
          <h2>Project members</h2>
          <p className="muted">
            Add co-admins and reviewers to the selected project. These permissions are enforced by the Move contract.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void onRefreshProjects()}>
          Refresh project
        </button>
      </div>

      {selectedProject ? (
        <div className="access-management-summary project-members-summary">
          <span className="signal-chip project-members-project-chip">Project: {selectedProject.name}</span>
          <article className="project-member-status-card">
            <span>Co-admins</span>
            <strong>{selectedProject.admins.length}</strong>
            <small>Active</small>
          </article>
          <article className="project-member-status-card">
            <span>Reviewers</span>
            <strong>{selectedProject.reviewers.length}</strong>
            <small>Active</small>
          </article>
        </div>
      ) : (
        <p className="muted">Create or select a project before adding project members.</p>
      )}

      {selectedProject && ownerCapId ? (
        <div className="access-management-actions">
          <label>
            <span>Wallet address</span>
            <input
              value={memberAddress}
              onChange={(event) => setMemberAddress(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <label>
            <span>Project role</span>
            <select
              value={memberRole}
              onChange={(event) => setMemberRole(event.target.value as Exclude<ProjectMemberRole, "owner">)}
            >
              <option value="co_admin">Co-admin</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleAddMember()}
            disabled={busy}
          >
            {busy ? "Working..." : "Add project member"}
          </button>
        </div>
      ) : selectedProject ? (
        <p className="muted">Only the wallet holding this project's ProjectOwnerCap can manage project members.</p>
      ) : null}

      {status ? <p className="muted">{status}</p> : null}

      <div className="access-role-grid project-members-role-grid" role="table" aria-label="Project members">
        <div className="access-role-row access-role-row-header" role="row">
          <span className="access-role-cell access-role-cell-address" role="columnheader">Address</span>
          <span className="access-role-cell access-role-cell-role" role="columnheader">Role</span>
          <span className="access-role-cell access-role-cell-status" role="columnheader">Status</span>
          <span className="access-role-cell access-role-cell-actions" role="columnheader">Actions</span>
        </div>
        {selectedProject ? (
          <>
            <div className="access-role-row" role="row">
              <span className="access-role-value access-role-cell access-role-cell-address" role="cell" data-label="Address">
                <span className="access-role-meta">
                  <SignalMetaChip type="contributor" value={selectedProject.owner} avatarSize={32} />
                </span>
              </span>
              <span className="access-role-value access-role-cell access-role-cell-role" role="cell" data-label="Role">
                Owner / Co-admin
              </span>
              <span className="access-role-value access-role-cell access-role-cell-status" role="cell" data-label="Status">
                <span className="signal-chip signal-chip-accent">Active</span>
              </span>
              <span className="access-role-value access-role-cell access-role-cell-actions" role="cell" data-label="Actions">
                <span className="muted">Protected</span>
              </span>
            </div>
            {selectedProject.members.map((member) => (
              <div key={`${member.address}:${member.role}`} className="access-role-row" role="row">
                <span className="access-role-value access-role-cell access-role-cell-address" role="cell" data-label="Address">
                  <span className="access-role-meta">
                    <SignalMetaChip type="contributor" value={member.address} avatarSize={32} />
                  </span>
                </span>
                <span className="access-role-value access-role-cell access-role-cell-role" role="cell" data-label="Role">
                  {roleLabel(member.role)}
                </span>
                <span className="access-role-value access-role-cell access-role-cell-status" role="cell" data-label="Status">
                  <span className="signal-chip signal-chip-accent">Active</span>
                </span>
                <span className="access-role-value access-role-cell access-role-cell-actions" role="cell" data-label="Actions">
                  {ownerCapId ? (
                    <>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleUpdateRole(member.address, member.role === "co_admin" ? "reviewer" : "co_admin")}
                        disabled={busy}
                      >
                        Make {member.role === "co_admin" ? "reviewer" : "co-admin"}
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleRemoveMember(member.address)}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="muted">Read only</span>
                  )}
                </span>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}
