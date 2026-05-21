import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useState } from "react";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import { useI18n } from "../i18n";
import { canIssueAdmin, canIssueReviewer } from "../lib/adminAccess";
import type { RegistryRoleEntry } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_MODULE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
} from "../lib/sui";
import { buildRegistryRows } from "./memberDirectoryRows";
import { SignalMetaChip } from "./SignalMetaChip";

interface AccessManagementSectionProps {
  capabilityProfile: CapabilityProfile;
  onToast: (toast: { tone: "success" | "error"; message: string }) => void;
  onRefreshCapabilities: () => Promise<unknown>;
}

function roleTitle(role: RegistryRoleEntry["role"]) {
  switch (role) {
    case "owner":
      return "accessRoleOwner";
    case "admin":
      return "accessRoleAdmin";
    case "reviewer":
      return "accessRoleReviewer";
    default:
      return role;
  }
}

function profileRoleLabel(profile: CapabilityProfile, t: (key: string) => string) {
  if (profile.hasOwnerCap) {
    return t("accessRoleOwner");
  }
  if (profile.hasAdminCap) {
    return t("accessRoleAdmin");
  }
  if (profile.hasReviewerCap) {
    return t("accessRoleReviewer");
  }
  return profile.isConfigured ? t("accessRoleNone") : t("accessRoleLegacyOwner");
}

function statusLabel(status: RegistryRoleEntry["status"], t: (key: string) => string) {
  return status === "active" ? t("statusActive") : status;
}

export function AccessManagementSection({
  capabilityProfile,
  onToast,
  onRefreshCapabilities,
}: AccessManagementSectionProps) {
  const { t } = useI18n();
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

  const rows = buildRegistryRows(registry);

  async function refreshAll() {
    await Promise.all([onRefreshCapabilities(), refetchRegistry()]);
  }

  async function handleAddAdmin() {
    if (!canManageAdmins) {
      const message = t("accessAddAdminRequiresOwner");
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = t("accessPackageRegistryMissing");
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = t("accessOwnerCapMissing");
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(adminAddress)) {
      const message = t("validSuiAddressRequired");
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
      setAdminIssueState(t("waitingForWalletApproval"));
      await addAdminTx.mutateAsync({ transaction: tx });
      setAdminAddress("");
      setAdminIssueState(t("adminAccessGranted"));
      onToast({ tone: "success", message: t("adminAccessGranted") });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("addAdminFailed");
      setAdminIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleAddReviewer() {
    if (!canManageReviewers) {
      const message = t("accessAddReviewerRequiresAdmin");
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = t("accessPackageRegistryMissing");
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(reviewerAddress)) {
      const message = t("validSuiAddressRequired");
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
      const message = t("accessOwnerOrAdminCapMissing");
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
      setReviewerIssueState(t("waitingForWalletApproval"));
      await addReviewerTx.mutateAsync({ transaction: tx });
      setReviewerAddress("");
      setReviewerIssueState(t("reviewerAccessGranted"));
      onToast({ tone: "success", message: t("reviewerAccessGranted") });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("addReviewerFailed");
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveAdmin(entry: RegistryRoleEntry) {
    if (!canManageAdmins) {
      const message = t("accessRemoveAdminRequiresOwner");
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = t("accessOwnerCapMissing");
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        t("confirmRemoveAdminAccess", { address: entry.address }),
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
      setRemoveState(t("waitingForWalletApproval"));
      await removeAdminTx.mutateAsync({ transaction: tx });
      setRemoveState(t("adminAccessRemoved", { address: entry.address }));
      onToast({ tone: "success", message: t("adminAccessRemoved", { address: entry.address }) });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("removeAdminFailed");
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveReviewer(entry: RegistryRoleEntry) {
    if (!canManageReviewers) {
      const message = t("accessRemoveReviewerRequiresAdmin");
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }

    const target = capabilityProfile.ownerCapIds[0]
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer_by_owner`
      : `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer`;
    const capId = capabilityProfile.ownerCapIds[0] ?? capabilityProfile.adminCapIds[0] ?? "";

    if (!capId) {
      const message = t("accessOwnerOrAdminCapMissing");
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        t("confirmRemoveReviewerAccess", { address: entry.address }),
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
      setRemoveState(t("waitingForWalletApproval"));
      await removeReviewerTx.mutateAsync({ transaction: tx });
      setRemoveState(t("reviewerAccessRemoved", { address: entry.address }));
      onToast({ tone: "success", message: t("reviewerAccessRemoved", { address: entry.address }) });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("removeReviewerFailed");
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  return (
    <section className="panel access-management-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">{t("accessManagementEyebrow")}</p>
          <h2>{t("accessOverviewTitle")}</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void refreshAll()}
          disabled={isLoadingRegistry}
        >
          {isLoadingRegistry ? t("refreshingLabel") : t("refreshRegistry")}
        </button>
      </div>

      <div className="access-management-summary">
        <span className="signal-chip">
          {t("connectedRoleLabel")}: {profileRoleLabel(capabilityProfile, t)}
        </span>
        <span className="signal-chip">{t("ownersCount", { count: registry.owner ? 1 : 0 })}</span>
        <span className="signal-chip">{t("adminsCount", { count: registry.admins.length })}</span>
        <span className="signal-chip">{t("reviewersCount", { count: registry.reviewers.length })}</span>
      </div>

      {canManageAdmins ? (
        <div className="access-management-actions">
          <label>
            <span>{t("addAdmin")}</span>
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
            {addAdminTx.isPending ? t("addingLabel") : t("addAdmin")}
          </button>
        </div>
      ) : null}

      {canManageReviewers ? (
        <div className="access-management-actions">
          <label>
            <span>{t("addReviewer")}</span>
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
            {addReviewerTx.isPending ? t("addingLabel") : t("addReviewer")}
          </button>
        </div>
      ) : null}

      {adminIssueState ? <p className="muted">{adminIssueState}</p> : null}
      {reviewerIssueState ? <p className="muted">{reviewerIssueState}</p> : null}
      {removeState ? <p className="muted">{removeState}</p> : null}

      {!canManageAdmins && !canManageReviewers ? (
        <p className="muted">
          {t("reviewerRegistryReadOnlyHint")}
        </p>
      ) : null}

      <div className="access-role-grid" role="table" aria-label={t("accessRegistryTableLabel")}>
        <div className="access-role-row access-role-row-header" role="row">
          <span className="access-role-cell access-role-cell-address" role="columnheader">{t("addressLabel")}</span>
          <span className="access-role-cell access-role-cell-role" role="columnheader">{t("roleLabel")}</span>
          <span className="access-role-cell access-role-cell-cap" role="columnheader">{t("capObjectIdLabel")}</span>
          <span className="access-role-cell access-role-cell-status" role="columnheader">{t("statusLabel")}</span>
          <span className="access-role-cell access-role-cell-actions" role="columnheader">{t("actionsLabel")}</span>
        </div>
        {rows.map((entry) => {
          const canRemoveAdmin = entry.role === "admin" && canManageAdmins;
          const canRemoveReviewer = entry.role === "reviewer" && canManageReviewers;

          return (
            <div key={entry.key} className="access-role-row" role="row">
              <span className="access-role-value access-role-cell access-role-cell-address" role="cell" data-label={t("addressLabel")}>
                <span className="access-role-meta">
                  <SignalMetaChip type="contributor" value={entry.address} />
                </span>
              </span>
              <span className="access-role-value access-role-cell access-role-cell-role" role="cell" data-label={t("roleLabel")}>
                {t(roleTitle(entry.role))}
              </span>
              <span className="access-role-value access-role-cell access-role-cell-cap" role="cell" data-label={t("capObjectIdLabel")}>
                <span className="access-role-meta">
                  <SignalMetaChip type="registry" value={entry.capId} />
                </span>
              </span>
              <span className="access-role-value access-role-cell access-role-cell-status" role="cell" data-label={t("statusLabel")}>
                <span className="signal-chip signal-chip-accent">{statusLabel(entry.status, t)}</span>
              </span>
              <span className="access-role-value access-role-cell access-role-cell-actions" role="cell" data-label={t("actionsLabel")}>
                {canRemoveAdmin ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveAdmin(entry)}
                    disabled={removeAdminTx.isPending}
                  >
                    {removeAdminTx.isPending ? t("removingLabel") : t("removeAdmin")}
                  </button>
                ) : null}
                {canRemoveReviewer ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveReviewer(entry)}
                    disabled={removeReviewerTx.isPending}
                  >
                    {removeReviewerTx.isPending ? t("removingLabel") : t("removeReviewer")}
                  </button>
                ) : null}
                {!canRemoveAdmin && !canRemoveReviewer ? (
                  <span className="muted">{t("readOnlyLabel")}</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
