import { getProofBlobUrl, getProofStorageMode, isLocalFallbackBlob } from "../lib/proof";
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
}

function ProofBlobRow({ label, blobId }: ProofItem) {
  const url = getProofBlobUrl(blobId);

  return (
    <div className="proof-row">
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
}: ProofPanelProps) {
  const storageMode = getProofStorageMode(items.map((item) => item.blobId));

  return (
    <section className="panel proof-panel">
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
        <div className="proof-row">
          <span>Storage mode</span>
          <strong>{storageMode}</strong>
        </div>
        <div className="proof-row">
          <span>Seal mode</span>
          <strong>{sealMode}</strong>
        </div>
        <div className="proof-row">
          <span>Current wallet address</span>
          {walletAddress ? <SignalMetaChip type="contributor" value={walletAddress} /> : <strong>Not connected</strong>}
        </div>
        <div className="proof-row">
          <span>Form ownerAddress</span>
          {ownerAddress ? <SignalMetaChip type="contributor" value={ownerAddress} /> : <strong>Legacy demo form</strong>}
        </div>
      </div>
    </section>
  );
}
