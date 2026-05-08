import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useMemo, useState } from "react";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import { canIssueAdmin, canIssueReviewer, getRoleLabel } from "../lib/adminAccess";
import type { RegistryRoleEntry } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_MODULE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
} from "../lib/sui";

interface AccessManagementSectionProps {
  capabilityProfile: CapabilityProfile;
  onToast: (toast: { tone: "success" | "error"; message: string }) => void;
  onRefreshCapabilities: () => Promise<unknown>;
}

function roleTitle(role: RegistryRoleEntry["role"]) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "reviewer":
      return "Reviewer";
    default:
      return role;
  }
}

export function AccessManagementSection({
  capabilityProfile,
  onToast,
  onRefreshCapabilities,
}: AccessManagementSectionProps) {
  const { registry, refetch: refetchRegistry, isLoadingRegistry } = useAccessRegistry();
  const [adminAddress, setAdminAddress] = useState("");
  const [reviewerAddress, setReviewerAddress] = useState("");
  const [adminIssueState, setAdminIssueState] = useState("");
  const [reviewerIssueState, setReviewerIssueState] = useState("");
  const [removeState, setRemoveState] = useState("");
  const addAdminTx = useSignAndExecuteTransaction();
  const addReviewerTx = useSignAndExecuteTransaction();
  const removeAdminTx = useSignAndExecuteTransaction();
  const removeReviewerTx = useSignAndExecuteTransaction();
  const canManageAdmins = canIssueAdmin(capabilityProfile);
  const canManageReviewers = canIssueReviewer(capabilityProfile);

  const rows = useMemo(
    () =>
      [
        ...(registry.owner ? [registry.owner] : []),
        ...registry.admins,
        ...registry.reviewers,
      ].map((entry) => ({
        ...entry,
        key: `${entry.role}:${entry.address}:${entry.capId}`,
      })),
    [registry.admins, registry.owner, registry.reviewers],
  );

  async function refreshAll() {
    await Promise.all([onRefreshCapabilities(), refetchRegistry()]);
  }

  async function handleAddAdmin() {
    if (!canManageAdmins) {
      const message = "OwnerCap is required to add an admin.";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = "PACKAGE_ID or REGISTRY_ID is missing.";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = "No active OwnerCap object was found in the connected wallet.";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(adminAddress)) {
      const message = "Enter a valid Sui wallet address.";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::add_admin`,
      arguments: [
        tx.object(capabilityProfile.ownerCapIds[0]),
        tx.object(ACCESS_CONTROL_REGISTRY_ID),
        tx.pure.address(normalizeSuiAddress(adminAddress)),
      ],
    });

    try {
      setAdminIssueState("Awaiting wallet approval...");
      await addAdminTx.mutateAsync({ transaction: tx });
      setAdminAddress("");
      setAdminIssueState("Admin access granted.");
      onToast({ tone: "success", message: "Admin access granted." });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add admin.";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleAddReviewer() {
    if (!canManageReviewers) {
      const message = "OwnerCap or AdminCap is required to add a reviewer.";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = "PACKAGE_ID or REGISTRY_ID is missing.";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(reviewerAddress)) {
      const message = "Enter a valid Sui wallet address.";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }

    const tx = new Transaction();
    const target = capabilityProfile.ownerCapIds[0]
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::add_reviewer_by_owner`
      : `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::issue_reviewer_cap`;
    const capId = capabilityProfile.ownerCapIds[0] ?? capabilityProfile.adminCapIds[0] ?? "";

    if (!capId) {
      const message = "No active OwnerCap or AdminCap object was found in the connected wallet.";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }

    tx.moveCall({
      target,
      arguments: [
        tx.object(capId),
        tx.object(ACCESS_CONTROL_REGISTRY_ID),
        tx.pure.address(normalizeSuiAddress(reviewerAddress)),
      ],
    });

    try {
      setReviewerIssueState("Awaiting wallet approval...");
      await addReviewerTx.mutateAsync({ transaction: tx });
      setReviewerAddress("");
      setReviewerIssueState("Reviewer access granted.");
      onToast({ tone: "success", message: "Reviewer access granted." });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add reviewer.";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveAdmin(entry: RegistryRoleEntry) {
    if (!canManageAdmins) {
      const message = "OwnerCap is required to remove an admin.";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = "No active OwnerCap object was found in the connected wallet.";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        `Remove admin access for ${entry.address}?\n\nThe wallet may still hold the old cap object, but it will no longer be active in the registry.`,
      )
    ) {
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_admin`,
      arguments: [
        tx.object(capabilityProfile.ownerCapIds[0]),
        tx.object(ACCESS_CONTROL_REGISTRY_ID),
        tx.pure.address(entry.address),
      ],
    });

    try {
      setRemoveState("Awaiting wallet approval...");
      await removeAdminTx.mutateAsync({ transaction: tx });
      setRemoveState(`Removed admin access for ${entry.address}.`);
      onToast({ tone: "success", message: `Removed admin access for ${entry.address}.` });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove admin.";
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveReviewer(entry: RegistryRoleEntry) {
    if (!canManageReviewers) {
      const message = "OwnerCap or AdminCap is required to remove a reviewer.";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }

    const target = capabilityProfile.ownerCapIds[0]
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer_by_owner`
      : `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer`;
    const capId = capabilityProfile.ownerCapIds[0] ?? capabilityProfile.adminCapIds[0] ?? "";

    if (!capId) {
      const message = "No active OwnerCap or AdminCap object was found in the connected wallet.";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        `Remove reviewer access for ${entry.address}?\n\nThe wallet may still hold the old cap object, but it will no longer be active in the registry.`,
      )
    ) {
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target,
      arguments: [
        tx.object(capId),
        tx.object(ACCESS_CONTROL_REGISTRY_ID),
        tx.pure.address(entry.address),
      ],
    });

    try {
      setRemoveState("Awaiting wallet approval...");
      await removeReviewerTx.mutateAsync({ transaction: tx });
      setRemoveState(`Removed reviewer access for ${entry.address}.`);
      onToast({ tone: "success", message: `Removed reviewer access for ${entry.address}.` });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove reviewer.";
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  return (
    <section className="panel access-management-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">Access Management</p>
          <h2>Encrypted Signal Inbox permissions</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void refreshAll()}
          disabled={isLoadingRegistry}
        >
          {isLoadingRegistry ? "Refreshing..." : "Refresh registry"}
        </button>
      </div>

      <div className="access-management-summary">
        <span className="signal-chip">Connected role: {getRoleLabel(capabilityProfile)}</span>
        <span className="signal-chip">Owner {registry.owner ? 1 : 0}</span>
        <span className="signal-chip">Admins {registry.admins.length}</span>
        <span className="signal-chip">Reviewers {registry.reviewers.length}</span>
      </div>

      {canManageAdmins ? (
        <div className="access-management-actions">
          <label>
            <span>Add Admin</span>
            <input
              value={adminAddress}
              onChange={(event) => setAdminAddress(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleAddAdmin()}
            disabled={addAdminTx.isPending}
          >
            {addAdminTx.isPending ? "Adding..." : "Add Admin"}
          </button>
        </div>
      ) : null}

      {canManageReviewers ? (
        <div className="access-management-actions">
          <label>
            <span>Add Reviewer</span>
            <input
              value={reviewerAddress}
              onChange={(event) => setReviewerAddress(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleAddReviewer()}
            disabled={addReviewerTx.isPending}
          >
            {addReviewerTx.isPending ? "Adding..." : "Add Reviewer"}
          </button>
        </div>
      ) : null}

      {adminIssueState ? <p className="muted">{adminIssueState}</p> : null}
      {reviewerIssueState ? <p className="muted">{reviewerIssueState}</p> : null}
      {removeState ? <p className="muted">{removeState}</p> : null}

      {!canManageAdmins && !canManageReviewers ? (
        <p className="muted">
          Reviewer wallets can inspect the registry here, but only Owner/Admin wallets can change
          access.
        </p>
      ) : null}

      <div className="access-role-grid" role="table" aria-label="Access Management registry">
        <div className="access-role-row access-role-row-header" role="row">
          <span role="columnheader">Address</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Cap object id</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Actions</span>
        </div>
        {rows.map((entry) => {
          const canRemoveAdmin = entry.role === "admin" && canManageAdmins;
          const canRemoveReviewer = entry.role === "reviewer" && canManageReviewers;

          return (
            <div key={entry.key} className="access-role-row" role="row">
              <span className="access-role-value" role="cell">
                {entry.address}
              </span>
              <span className="access-role-value" role="cell">
                {roleTitle(entry.role)}
              </span>
              <span className="access-role-value" role="cell">
                {entry.capId}
              </span>
              <span className="access-role-value" role="cell">
                <span className="signal-chip signal-chip-accent">{entry.status}</span>
              </span>
              <span className="access-role-value" role="cell">
                {canRemoveAdmin ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveAdmin(entry)}
                    disabled={removeAdminTx.isPending}
                  >
                    {removeAdminTx.isPending ? "Removing..." : "Remove Admin"}
                  </button>
                ) : null}
                {canRemoveReviewer ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveReviewer(entry)}
                    disabled={removeReviewerTx.isPending}
                  >
                    {removeReviewerTx.isPending ? "Removing..." : "Remove Reviewer"}
                  </button>
                ) : null}
                {!canRemoveAdmin && !canRemoveReviewer ? (
                  <span className="muted">Read only</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

