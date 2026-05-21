import { getProofBlobUrl, getProofStorageMode, isLocalFallbackBlob } from "../lib/proof";
import { getSuiTransactionUrl } from "../lib/activityLog";
import { SignalMetaChip } from "./SignalMetaChip";

interface ProofItem {
  label: string;
  blobId?: string | null;
}

interface ProofPanelProps {
  title?: string;
  items: ProofItem[];
  walletAddress?: string | null;
  ownerAddress?: string | null;
  sealMode: string;
  transactionDigest?: string | null;
  networkLabel?: string;
  encryptionStatus?: string;
  storedTimestamp?: string;
  rpcProvider?: string;
}

function ProofBlobRow({ label, blobId }: ProofItem) {
  const url = getProofBlobUrl(blobId);

  return (
    <div className="metadata-row proof-row">
      <span>{label}</span>
      <div className="proof-row-value">
        {blobId ? <SignalMetaChip type="blob" value={blobId} /> : <strong>Not stored</strong>}
        {blobId ? (
          isLocalFallbackBlob(blobId) ? (
            <span className="pill">Local fallback</span>
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer">
              Open Blob
            </a>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

export function ProofPanel({
  title = "Proof Mode",
  items,
  walletAddress,
  ownerAddress,
  sealMode,
  transactionDigest,
  networkLabel,
  encryptionStatus,
  storedTimestamp,
  rpcProvider,
}: ProofPanelProps) {
  const storageMode = getProofStorageMode(items.map((item) => item.blobId));
  const txUrl = getSuiTransactionUrl(transactionDigest ?? undefined);

  return (
    <section className="answer-card review-secondary-card proof-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">Proof Mode</p>
          <h3>{title}</h3>
        </div>
        <span className={`pill ${storageMode === "Walrus" ? "proof-pill" : ""}`}>{storageMode}</span>
      </div>

      <div className="proof-grid">
        {items.map((item) => (
          <ProofBlobRow key={item.label} {...item} />
        ))}
        <div className="metadata-row proof-row">
          <span>Storage mode</span>
          <strong>{storageMode}</strong>
        </div>
        <div className="metadata-row proof-row">
          <span>Seal mode</span>
          <strong>{sealMode}</strong>
        </div>
        {transactionDigest ? (
          <div className="metadata-row proof-row">
            <span>Transaction digest</span>
            <div className="proof-row-value">
              <SignalMetaChip type="blob" value={transactionDigest} />
              {txUrl ? (
                <a href={txUrl} target="_blank" rel="noreferrer">
                  Open transaction
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        {networkLabel ? (
          <div className="metadata-row proof-row">
            <span>Network</span>
            <strong>{networkLabel}</strong>
          </div>
        ) : null}
        {encryptionStatus ? (
          <div className="metadata-row proof-row">
            <span>Encryption status</span>
            <strong>{encryptionStatus}</strong>
          </div>
        ) : null}
        {storedTimestamp ? (
          <div className="metadata-row proof-row">
            <span>Stored timestamp</span>
            <strong>{storedTimestamp}</strong>
          </div>
        ) : null}
        {rpcProvider ? (
          <div className="metadata-row proof-row">
            <span>RPC provider</span>
            <strong>{rpcProvider}</strong>
          </div>
        ) : null}
        <div className="metadata-row proof-row">
          <span>Current wallet address</span>
          {walletAddress ? <SignalMetaChip type="contributor" value={walletAddress} /> : <strong>Not connected</strong>}
        </div>
        <div className="metadata-row proof-row">
          <span>Form ownerAddress</span>
          {ownerAddress ? <SignalMetaChip type="contributor" value={ownerAddress} /> : <strong>Legacy demo form</strong>}
        </div>
      </div>
    </section>
  );
}
