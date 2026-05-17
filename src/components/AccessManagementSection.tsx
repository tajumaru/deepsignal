import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { useMemo, useState } from "react";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import { canIssueAdmin, canIssueReviewer } from "../lib/adminAccess";
import type { RegistryRoleEntry } from "../lib/accessRegistry";
import {
  ACCESS_CONTROL_MODULE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
} from "../lib/sui";
import { SignalMetaChip } from "./SignalMetaChip";

interface AccessManagementSectionProps {
  capabilityProfile: CapabilityProfile;
  onToast: (toast: { tone: "success" | "error"; message: string }) => void;
  onRefreshCapabilities: () => Promise<unknown>;
}

function roleTitle(role: RegistryRoleEntry["role"]) {
  switch (role) {
    case "owner":
      return "オーナー";
    case "admin":
      return "管理者";
    case "reviewer":
      return "レビュアー";
    default:
      return role;
  }
}

function profileRoleLabel(profile: CapabilityProfile) {
  if (profile.hasOwnerCap) {
    return "オーナー";
  }
  if (profile.hasAdminCap) {
    return "管理者";
  }
  if (profile.hasReviewerCap) {
    return "レビュアー";
  }
  return profile.isConfigured ? "アクセスなし" : "レガシーオーナー";
}

function statusLabel(status: RegistryRoleEntry["status"]) {
  return status === "active" ? "有効" : status;
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
      const message = "管理者を追加するには OwnerCap が必要です。";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = "PACKAGE_ID または REGISTRY_ID が未設定です。";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = "接続中のウォレットに有効な OwnerCap オブジェクトが見つかりません。";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(adminAddress)) {
      const message = "有効な Sui ウォレットアドレスを入力してください。";
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
      setAdminIssueState("ウォレット承認を待っています...");
      await addAdminTx.mutateAsync({ transaction: tx });
      setAdminAddress("");
      setAdminIssueState("管理者アクセスを付与しました。");
      onToast({ tone: "success", message: "管理者アクセスを付与しました。" });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "管理者の追加に失敗しました。";
      setAdminIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleAddReviewer() {
    if (!canManageReviewers) {
      const message = "レビュアーを追加するには OwnerCap または AdminCap が必要です。";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!ACCESS_CONTROL_PACKAGE_ID || !ACCESS_CONTROL_REGISTRY_ID) {
      const message = "PACKAGE_ID または REGISTRY_ID が未設定です。";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!isValidSuiAddress(reviewerAddress)) {
      const message = "有効な Sui ウォレットアドレスを入力してください。";
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
      const message = "接続中のウォレットに有効な OwnerCap または AdminCap オブジェクトが見つかりません。";
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
      setReviewerIssueState("ウォレット承認を待っています...");
      await addReviewerTx.mutateAsync({ transaction: tx });
      setReviewerAddress("");
      setReviewerIssueState("レビュアーアクセスを付与しました。");
      onToast({ tone: "success", message: "レビュアーアクセスを付与しました。" });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "レビュアーの追加に失敗しました。";
      setReviewerIssueState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveAdmin(entry: RegistryRoleEntry) {
    if (!canManageAdmins) {
      const message = "管理者を削除するには OwnerCap が必要です。";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (!capabilityProfile.ownerCapIds[0]) {
      const message = "接続中のウォレットに有効な OwnerCap オブジェクトが見つかりません。";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        `${entry.address} の管理者アクセスを削除しますか？\n\nウォレットには古い Cap オブジェクトが残る場合がありますが、レジストリ上では無効になります。`,
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
      setRemoveState("ウォレット承認を待っています...");
      await removeAdminTx.mutateAsync({ transaction: tx });
      setRemoveState(`${entry.address} の管理者アクセスを削除しました。`);
      onToast({ tone: "success", message: `${entry.address} の管理者アクセスを削除しました。` });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "管理者の削除に失敗しました。";
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  async function handleRemoveReviewer(entry: RegistryRoleEntry) {
    if (!canManageReviewers) {
      const message = "レビュアーを削除するには OwnerCap または AdminCap が必要です。";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }

    const target = capabilityProfile.ownerCapIds[0]
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer_by_owner`
      : `${ACCESS_CONTROL_PACKAGE_ID}::${ACCESS_CONTROL_MODULE}::remove_reviewer`;
    const capId = capabilityProfile.ownerCapIds[0] ?? capabilityProfile.adminCapIds[0] ?? "";

    if (!capId) {
      const message = "接続中のウォレットに有効な OwnerCap または AdminCap オブジェクトが見つかりません。";
      setRemoveState(message);
      onToast({ tone: "error", message });
      return;
    }
    if (
      !window.confirm(
        `${entry.address} のレビュアーアクセスを削除しますか？\n\nウォレットには古い Cap オブジェクトが残る場合がありますが、レジストリ上では無効になります。`,
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
      setRemoveState("ウォレット承認を待っています...");
      await removeReviewerTx.mutateAsync({ transaction: tx });
      setRemoveState(`${entry.address} のレビュアーアクセスを削除しました。`);
      onToast({ tone: "success", message: `${entry.address} のレビュアーアクセスを削除しました。` });
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "レビュアーの削除に失敗しました。";
      setRemoveState(message);
      onToast({ tone: "error", message });
    }
  }

  return (
    <section className="panel access-management-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">アクセス管理</p>
          <h2>Encrypted Signal Inbox 権限</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void refreshAll()}
          disabled={isLoadingRegistry}
        >
          {isLoadingRegistry ? "更新中..." : "レジストリを更新"}
        </button>
      </div>

      <div className="access-management-summary">
        <span className="signal-chip">接続中のロール: {profileRoleLabel(capabilityProfile)}</span>
        <span className="signal-chip">オーナー {registry.owner ? 1 : 0}</span>
        <span className="signal-chip">管理者 {registry.admins.length}</span>
        <span className="signal-chip">レビュアー {registry.reviewers.length}</span>
      </div>

      {canManageAdmins ? (
        <div className="access-management-actions">
          <label>
            <span>管理者を追加</span>
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
            {addAdminTx.isPending ? "追加中..." : "管理者を追加"}
          </button>
        </div>
      ) : null}

      {canManageReviewers ? (
        <div className="access-management-actions">
          <label>
            <span>レビュアーを追加</span>
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
            {addReviewerTx.isPending ? "追加中..." : "レビュアーを追加"}
          </button>
        </div>
      ) : null}

      {adminIssueState ? <p className="muted">{adminIssueState}</p> : null}
      {reviewerIssueState ? <p className="muted">{reviewerIssueState}</p> : null}
      {removeState ? <p className="muted">{removeState}</p> : null}

      {!canManageAdmins && !canManageReviewers ? (
        <p className="muted">
          レビュアーウォレットはここでレジストリを確認できますが、アクセス権を変更できるのはオーナー / 管理者ウォレットのみです。
        </p>
      ) : null}

      <div className="access-role-grid" role="table" aria-label="アクセス管理レジストリ">
        <div className="access-role-row access-role-row-header" role="row">
          <span role="columnheader">アドレス</span>
          <span role="columnheader">ロール</span>
          <span role="columnheader">Cap オブジェクト ID</span>
          <span role="columnheader">状態</span>
          <span role="columnheader">操作</span>
        </div>
        {rows.map((entry) => {
          const canRemoveAdmin = entry.role === "admin" && canManageAdmins;
          const canRemoveReviewer = entry.role === "reviewer" && canManageReviewers;

          return (
            <div key={entry.key} className="access-role-row" role="row">
              <span className="access-role-value" role="cell">
                <span className="access-role-meta">
                  <SignalMetaChip type="contributor" value={entry.address} />
                </span>
              </span>
              <span className="access-role-value" role="cell">
                {roleTitle(entry.role)}
              </span>
              <span className="access-role-value" role="cell">
                <span className="access-role-meta">
                  <SignalMetaChip type="registry" value={entry.capId} />
                </span>
              </span>
              <span className="access-role-value" role="cell">
                <span className="signal-chip signal-chip-accent">{statusLabel(entry.status)}</span>
              </span>
              <span className="access-role-value" role="cell">
                {canRemoveAdmin ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveAdmin(entry)}
                    disabled={removeAdminTx.isPending}
                  >
                    {removeAdminTx.isPending ? "削除中..." : "管理者を削除"}
                  </button>
                ) : null}
                {canRemoveReviewer ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemoveReviewer(entry)}
                    disabled={removeReviewerTx.isPending}
                  >
                    {removeReviewerTx.isPending ? "削除中..." : "レビュアーを削除"}
                  </button>
                ) : null}
                {!canRemoveAdmin && !canRemoveReviewer ? (
                  <span className="muted">読み取り専用</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
