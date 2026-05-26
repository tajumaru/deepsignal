import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useState } from "react";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import { useI18n } from "../i18n";
import { canIssueAdmin } from "../lib/adminAccess";
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
  const [adminIssueState, setAdminIssueState] = useState("");
  const [removeState, setRemoveState] = useState("");
  const addAdminTx = useSignAndExecuteTransaction();
  const removeAdminTx = useSignAndExecuteTransaction();
  const canManageAdmins = canIssueAdmin(capabilityProfile);

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

      {adminIssueState ? <p className="muted">{adminIssueState}</p> : null}
      {removeState ? <p className="muted">{removeState}</p> : null}

      {!canManageAdmins ? (
        <p className="muted">
          {t("adminRegistryReadOnlyHint")}
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
                {!canRemoveAdmin ? (
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
